#!/usr/bin/env python3
"""Tkinter JSON editor for menu items with pricing presets and item history database."""

from __future__ import annotations

import json
import shutil
import uuid
import importlib.util
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

THIRD_PARTY_PACKAGES: list[str] = []


def module_installed(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def ensure_dependencies(packages: list[str]) -> None:
    for package in packages:
        module_name = package.split("==")[0].replace("-", "_")
        if module_installed(module_name):
            continue
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])


def ensure_tkinter_available() -> None:
    try:
        import tkinter  # noqa: F401
    except Exception as exc:
        raise RuntimeError("Tkinter is not available in this Python environment.") from exc


BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "items.json"
ITEM_DB_FILE = BASE_DIR / "data" / "item_price_db.json"
MEDIA_DIR = BASE_DIR / "data" / "media"

REGULAR_DEFAULT_PRICING = {
    "small_meal": 8,
    "large_meal": 12,
    "family_format": "19-25 depending on special",
}

OTHER_DEFAULTS_BY_TYPE = {
    "sandwich": {"base_price": 7},
    "sides_extras": {"price_range": "3-6"},
    "bulk_side": {"base_price": 4, "notes": "around"},
}


@dataclass
class ItemField:
    key: str
    label: str
    kind: str = "entry"


FIELDS = [
    ItemField("id", "ID"),
    ItemField("title", "Title"),
    ItemField("description", "Description", "text"),
    ItemField("category", "Category"),
    ItemField("available", "Available", "bool"),
    ItemField("featured", "Featured", "bool"),
    ItemField("image", "Image Path"),
    ItemField("video", "Video Path"),
]


class ItemsEditor:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Items JSON Editor")
        self.root.geometry("1380x760")
        self.items: list[dict] = []
        self.current_index: int | None = None
        self.item_db: dict[str, dict] = {"items": []}
        self.dirty = False
        self.vars: dict[str, tk.Variable] = {}
        self.widgets: dict[str, tk.Widget] = {}
        self._build_ui()
        self.load_items()
        self.load_item_db()

    def _build_ui(self) -> None:
        self.root.columnconfigure(0, weight=2)
        self.root.columnconfigure(1, weight=3)
        self.root.columnconfigure(2, weight=2)
        self.root.rowconfigure(1, weight=1)

        toolbar = ttk.Frame(self.root, padding=10)
        toolbar.grid(row=0, column=0, columnspan=3, sticky="ew")
        for label, cmd in [
            ("Reload", self.reload_items), ("Add New", self.add_new_item), ("Duplicate", self.duplicate_item),
            ("Delete", self.delete_item), ("Apply Changes", self.apply_form_to_item), ("Save JSON", self.save_items),
        ]:
            ttk.Button(toolbar, text=label, command=cmd).pack(side="left", padx=4)

        self.status_var = tk.StringVar(value="Ready")
        ttk.Label(toolbar, textvariable=self.status_var).pack(side="right", padx=4)

        left = ttk.Frame(self.root, padding=(10, 0, 5, 10)); left.grid(row=1, column=0, sticky="nsew")
        left.rowconfigure(1, weight=1); left.columnconfigure(0, weight=1)
        ttk.Label(left, text="Items", font=("Arial", 11, "bold")).grid(row=0, column=0, sticky="w")
        self.tree = ttk.Treeview(left, columns=("title", "category", "flags"), show="tree headings", selectmode="browse")
        self.tree.heading("#0", text="#"); self.tree.heading("title", text="Title"); self.tree.heading("category", text="Category"); self.tree.heading("flags", text="Status")
        self.tree.column("#0", width=42, anchor="center"); self.tree.column("title", width=230); self.tree.column("category", width=110); self.tree.column("flags", width=120)
        self.tree.grid(row=1, column=0, sticky="nsew"); self.tree.bind("<<TreeviewSelect>>", self.on_tree_select)
        ys = ttk.Scrollbar(left, orient="vertical", command=self.tree.yview); ys.grid(row=1, column=1, sticky="ns"); self.tree.configure(yscrollcommand=ys.set)

        right = ttk.Frame(self.root, padding=(5, 0, 10, 10)); right.grid(row=1, column=1, sticky="nsew"); right.columnconfigure(1, weight=1)
        row = 0
        for fld in FIELDS:
            ttk.Label(right, text=fld.label).grid(row=row, column=0, sticky="nw", padx=(0, 8), pady=6)
            if fld.kind == "bool":
                var = tk.BooleanVar(value=False); widget = ttk.Checkbutton(right, variable=var)
            elif fld.kind == "text":
                widget = tk.Text(right, height=4, wrap="word"); var = tk.StringVar()
            else:
                var = tk.StringVar(); widget = ttk.Entry(right, textvariable=var)
            self.vars[fld.key] = var; self.widgets[fld.key] = widget; widget.grid(row=row, column=1, sticky="ew", pady=6)
            if fld.key in {"image", "video"}:
                ttk.Button(right, text="Upload...", command=lambda k=fld.key: self.upload_media(k)).grid(row=row, column=2, sticky="w", padx=(8, 0), pady=6)
            row += 1

        ttk.Label(right, text="Pricing (JSON)").grid(row=row, column=0, sticky="nw", padx=(0, 8), pady=6)
        self.pricing_widget = tk.Text(right, height=8, wrap="word")
        self.pricing_widget.grid(row=row, column=1, sticky="ew", pady=6)
        row += 1

        action_bar = ttk.Frame(right); action_bar.grid(row=row, column=0, columnspan=3, sticky="ew", pady=(14, 0))
        ttk.Button(action_bar, text="Toggle Featured", command=lambda: self.toggle_bool("featured")).pack(side="left", padx=4)
        ttk.Button(action_bar, text="Toggle Available", command=lambda: self.toggle_bool("available")).pack(side="left", padx=4)

        db_panel = ttk.Frame(self.root, padding=(0, 0, 10, 10)); db_panel.grid(row=1, column=2, sticky="nsew")
        db_panel.rowconfigure(1, weight=1); db_panel.columnconfigure(0, weight=1)
        ttk.Label(db_panel, text="Item price DB", font=("Arial", 11, "bold")).grid(row=0, column=0, sticky="w")
        self.db_tree = ttk.Treeview(db_panel, columns=("type", "pricing"), show="headings")
        self.db_tree.heading("type", text="Type"); self.db_tree.heading("pricing", text="Pricing")
        self.db_tree.column("type", width=120); self.db_tree.column("pricing", width=270)
        self.db_tree.grid(row=1, column=0, sticky="nsew")
        self.db_tree.bind("<<TreeviewSelect>>", self.on_db_select)

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def load_item_db(self) -> None:
        if ITEM_DB_FILE.exists():
            try:
                self.item_db = json.loads(ITEM_DB_FILE.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self.item_db = {"items": []}
        self.refresh_db_tree()

    def save_item_db(self) -> None:
        ITEM_DB_FILE.write_text(json.dumps(self.item_db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def refresh_db_tree(self) -> None:
        for iid in self.db_tree.get_children(): self.db_tree.delete(iid)
        for idx, entry in enumerate(self.item_db.get("items", [])):
            self.db_tree.insert("", "end", iid=str(idx), values=(entry.get("type", ""), json.dumps(entry.get("pricing", {}), ensure_ascii=False)))

    def on_db_select(self, _event=None) -> None:
        sel = self.db_tree.selection()
        if not sel: return
        entry = self.item_db["items"][int(sel[0])]
        self.vars["title"].set(entry.get("title", ""))
        self.pricing_widget.delete("1.0", "end")
        self.pricing_widget.insert("1.0", json.dumps(entry.get("pricing", {}), indent=2, ensure_ascii=False))

    def load_items(self) -> None:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True); MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        if not DATA_FILE.exists(): DATA_FILE.write_text(json.dumps({"items": []}, indent=2), encoding="utf-8")
        try:
            payload = json.loads(DATA_FILE.read_text(encoding="utf-8")); self.items = payload.get("items", []) if isinstance(payload.get("items", []), list) else []
        except json.JSONDecodeError as exc:
            messagebox.showerror("Invalid JSON", f"Could not parse items.json\n\n{exc}"); self.items = []
        self.refresh_tree(); self.select_item(0) if self.items else self.clear_form(); self.dirty = False

    def reload_items(self) -> None:
        if self.dirty and not self.confirm_discard_changes(): return
        self.load_items(); self.load_item_db()

    def refresh_tree(self) -> None:
        for row_id in self.tree.get_children(): self.tree.delete(row_id)
        for idx, item in enumerate(self.items, start=1):
            flags = [k for k in ["available", "featured"] if bool(item.get(k, False))]
            self.tree.insert("", "end", iid=str(idx - 1), text=str(idx), values=(item.get("title") or "(Untitled)", item.get("category") or "", ", ".join(flags) if flags else "-"))

    def on_tree_select(self, _event=None) -> None:
        sel = self.tree.selection()
        if sel: self.select_item(int(sel[0]))

    def select_item(self, idx: int) -> None:
        if 0 <= idx < len(self.items): self.current_index = idx; self.tree.selection_set(str(idx)); self.fill_form(self.items[idx])

    def fill_form(self, item: dict) -> None:
        for fld in FIELDS:
            value = item.get(fld.key, "")
            if fld.kind == "text": self.widgets[fld.key].delete("1.0", "end"); self.widgets[fld.key].insert("1.0", str(value))
            elif fld.kind == "bool": self.vars[fld.key].set(bool(value))
            else: self.vars[fld.key].set("" if value is None else str(value))
        self.pricing_widget.delete("1.0", "end")
        self.pricing_widget.insert("1.0", json.dumps(item.get("pricing", {}), indent=2, ensure_ascii=False))

    def clear_form(self) -> None:
        for fld in FIELDS:
            if fld.kind == "text": self.widgets[fld.key].delete("1.0", "end")
            elif fld.kind == "bool": self.vars[fld.key].set(False)
            else: self.vars[fld.key].set("")
        self.pricing_widget.delete("1.0", "end")

    def collect_form(self) -> dict:
        data = {}
        for fld in FIELDS:
            if fld.kind == "text": value = self.widgets[fld.key].get("1.0", "end").strip()
            elif fld.kind == "bool": value = bool(self.vars[fld.key].get())
            else: value = self.vars[fld.key].get().strip()
            data[fld.key] = value
        pricing_text = self.pricing_widget.get("1.0", "end").strip() or "{}"
        try: data["pricing"] = json.loads(pricing_text)
        except json.JSONDecodeError: data["pricing"] = {"raw": pricing_text}
        if not data.get("id"): data["id"] = self.make_id(data.get("title") or "item")
        return data

    def _prompt_for_item_type(self) -> tuple[str, dict]:
        response = messagebox.askyesno("Item type", "Is this a regular meal?\n\nYes = regular meal defaults\nNo = other type")
        if response:
            return "regular_meal", REGULAR_DEFAULT_PRICING.copy()
        choice = simpledialog.askstring("Other type", "Enter one of: sandwich, sides_extras, bulk_side") or "sandwich"
        choice = choice.strip().lower()
        return choice, OTHER_DEFAULTS_BY_TYPE.get(choice, {"notes": "custom pricing"}).copy()

    def add_new_item(self) -> None:
        item_type, pricing = self._prompt_for_item_type()
        new_item = {"id": self.make_id("new-item"), "title": "", "description": "", "category": "", "available": True, "featured": False, "image": "", "video": "", "pricing_type": item_type, "pricing": pricing}
        self.items.append(new_item); self.refresh_tree(); self.select_item(len(self.items)-1); self.mark_dirty("Added new item")

    def apply_form_to_item(self) -> None:
        if self.current_index is None: messagebox.showinfo("No item selected", "Please select an item first."); return
        item = self.collect_form(); self.items[self.current_index] = item; self.upsert_item_db(item)
        self.refresh_tree(); self.select_item(self.current_index); self.mark_dirty("Item changes applied")

    def upsert_item_db(self, item: dict) -> None:
        title = (item.get("title") or "").strip()
        if not title: return
        entries = self.item_db.setdefault("items", [])
        for entry in entries:
            if (entry.get("title") or "").strip().lower() == title.lower():
                entry.update({"title": title, "type": item.get("pricing_type", ""), "pricing": item.get("pricing", {}), "last_seen_id": item.get("id", "")})
                self.refresh_db_tree(); self.save_item_db(); return
        entries.append({"title": title, "type": item.get("pricing_type", ""), "pricing": item.get("pricing", {}), "last_seen_id": item.get("id", "")})
        self.refresh_db_tree(); self.save_item_db()

    def duplicate_item(self) -> None:
        if self.current_index is None: return
        source = dict(self.items[self.current_index]); source["id"] = self.make_id(source.get("id") or "copy"); source["title"] = f"{source.get('title', '')} (Copy)".strip()
        self.items.insert(self.current_index + 1, source); self.refresh_tree(); self.select_item(self.current_index + 1); self.mark_dirty("Duplicated selected item")

    def delete_item(self) -> None:
        if self.current_index is None: return
        name = self.items[self.current_index].get("title") or self.items[self.current_index].get("id") or "this item"
        if not messagebox.askyesno("Delete item", f"Delete '{name}'?"): return
        del self.items[self.current_index]; self.refresh_tree(); self.select_item(max(0, self.current_index - 1)) if self.items else self.clear_form(); self.mark_dirty("Item deleted")

    def save_items(self) -> None:
        if self.current_index is not None: self.items[self.current_index] = self.collect_form()
        DATA_FILE.write_text(json.dumps({"items": self.items}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        self.dirty = False; self.refresh_tree(); self.set_status(f"Saved {len(self.items)} items")
        for item in self.items: self.upsert_item_db(item)
        messagebox.showinfo("Saved", "items.json saved successfully.")

    def upload_media(self, field_key: str) -> None:
        if field_key not in {"image", "video"}: return
        file_types = [("Images", "*.png *.jpg *.jpeg *.webp *.gif *.svg"), ("All files", "*.*")] if field_key == "image" else [("Videos", "*.mp4 *.mov *.avi *.webm *.mkv"), ("All files", "*.*")]
        source = filedialog.askopenfilename(title=f"Choose {field_key}", filetypes=file_types)
        if not source: return
        src_path = Path(source)
        if not src_path.exists(): messagebox.showerror("Missing file", "The selected file no longer exists."); return
        MEDIA_DIR.mkdir(parents=True, exist_ok=True); dest_name = f"{src_path.stem.replace(' ', '-')}-{uuid.uuid4().hex[:8]}{src_path.suffix.lower()}"; dest_path = MEDIA_DIR / dest_name; shutil.copy2(src_path, dest_path)
        self.vars[field_key].set(f"./assets/data/media/{dest_name}"); self.mark_dirty(f"Uploaded {field_key}")

    def toggle_bool(self, key: str) -> None: self.vars[key].set(not bool(self.vars[key].get())); self.mark_dirty(f"Toggled {key}")
    def make_id(self, seed: str) -> str: return f"{'-'.join(seed.strip().lower().split()) or 'item'}-{uuid.uuid4().hex[:6]}"
    def confirm_discard_changes(self) -> bool: return messagebox.askyesno("Unsaved changes", "Discard unsaved changes?")
    def mark_dirty(self, msg: str) -> None: self.dirty = True; self.set_status(msg)
    def set_status(self, msg: str) -> None: self.status_var.set(msg)
    def on_close(self) -> None:
        if self.dirty and not self.confirm_discard_changes(): return
        self.root.destroy()


def main() -> None:
    ensure_dependencies(THIRD_PARTY_PACKAGES); ensure_tkinter_available()
    root = tk.Tk(); app = ItemsEditor(root); app.set_status(f"Editing: {DATA_FILE}"); root.mainloop()


if __name__ == "__main__":
    main()
