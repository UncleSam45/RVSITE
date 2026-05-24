#!/usr/bin/env python3
"""Tkinter JSON editor for menu items.

Features:
- Loads and edits `data/items.json`.
- Friendly form for item fields.
- Add, duplicate, delete items.
- Toggle `available` / `featured` quickly.
- Upload media by copying chosen files into local `data/media/`.
"""

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
from tkinter import filedialog, messagebox, ttk

THIRD_PARTY_PACKAGES: list[str] = []


def module_installed(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def ensure_dependencies(packages: list[str]) -> None:
    """Install missing third-party dependencies into the current interpreter env."""
    for package in packages:
        module_name = package.split("==")[0].replace("-", "_")
        if module_installed(module_name):
            continue
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])


def ensure_tkinter_available() -> None:
    try:
        import tkinter  # noqa: F401
    except Exception as exc:
        raise RuntimeError(
            "Tkinter is not available in this Python environment. "
            "Install the OS Tk package (e.g., python3-tk) and retry."
        ) from exc


BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "items.json"
MEDIA_DIR = BASE_DIR / "data" / "media"


@dataclass
class ItemField:
    key: str
    label: str
    kind: str = "entry"  # entry | text | bool


FIELDS = [
    ItemField("id", "ID"),
    ItemField("title", "Title"),
    ItemField("description", "Description", "text"),
    ItemField("price", "Price"),
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
        self.root.geometry("1180x720")

        self.items: list[dict] = []
        self.current_index: int | None = None
        self.dirty = False

        self.vars: dict[str, tk.Variable] = {}
        self.widgets: dict[str, tk.Widget] = {}

        self._build_ui()
        self.load_items()

    def _build_ui(self) -> None:
        self.root.columnconfigure(0, weight=2)
        self.root.columnconfigure(1, weight=3)
        self.root.rowconfigure(1, weight=1)

        toolbar = ttk.Frame(self.root, padding=10)
        toolbar.grid(row=0, column=0, columnspan=2, sticky="ew")

        ttk.Button(toolbar, text="Reload", command=self.reload_items).pack(side="left", padx=4)
        ttk.Button(toolbar, text="Add New", command=self.add_new_item).pack(side="left", padx=4)
        ttk.Button(toolbar, text="Duplicate", command=self.duplicate_item).pack(side="left", padx=4)
        ttk.Button(toolbar, text="Delete", command=self.delete_item).pack(side="left", padx=4)
        ttk.Button(toolbar, text="Apply Changes", command=self.apply_form_to_item).pack(side="left", padx=4)
        ttk.Button(toolbar, text="Save JSON", command=self.save_items).pack(side="left", padx=4)

        self.status_var = tk.StringVar(value="Ready")
        ttk.Label(toolbar, textvariable=self.status_var).pack(side="right", padx=4)

        left = ttk.Frame(self.root, padding=(10, 0, 5, 10))
        left.grid(row=1, column=0, sticky="nsew")
        left.rowconfigure(1, weight=1)
        left.columnconfigure(0, weight=1)

        ttk.Label(left, text="Items", font=("Arial", 11, "bold")).grid(row=0, column=0, sticky="w", pady=(0, 6))

        columns = ("title", "category", "flags")
        self.tree = ttk.Treeview(left, columns=columns, show="tree headings", selectmode="browse")
        self.tree.heading("#0", text="#")
        self.tree.heading("title", text="Title")
        self.tree.heading("category", text="Category")
        self.tree.heading("flags", text="Status")
        self.tree.column("#0", width=42, anchor="center")
        self.tree.column("title", width=230, anchor="w")
        self.tree.column("category", width=110, anchor="w")
        self.tree.column("flags", width=120, anchor="w")
        self.tree.grid(row=1, column=0, sticky="nsew")
        self.tree.bind("<<TreeviewSelect>>", self.on_tree_select)

        ys = ttk.Scrollbar(left, orient="vertical", command=self.tree.yview)
        ys.grid(row=1, column=1, sticky="ns")
        self.tree.configure(yscrollcommand=ys.set)

        right = ttk.Frame(self.root, padding=(5, 0, 10, 10))
        right.grid(row=1, column=1, sticky="nsew")
        right.columnconfigure(1, weight=1)

        row = 0
        for fld in FIELDS:
            ttk.Label(right, text=fld.label).grid(row=row, column=0, sticky="nw", padx=(0, 8), pady=6)

            if fld.kind == "bool":
                var = tk.BooleanVar(value=False)
                widget = ttk.Checkbutton(right, variable=var)
            elif fld.kind == "text":
                widget = tk.Text(right, height=4, wrap="word")
                var = tk.StringVar()
            else:
                var = tk.StringVar()
                widget = ttk.Entry(right, textvariable=var)

            self.vars[fld.key] = var
            self.widgets[fld.key] = widget

            widget.grid(row=row, column=1, sticky="ew", pady=6)

            if fld.key in {"image", "video"}:
                ttk.Button(
                    right,
                    text="Upload...",
                    command=lambda k=fld.key: self.upload_media(k),
                ).grid(row=row, column=2, sticky="w", padx=(8, 0), pady=6)

            row += 1

        action_bar = ttk.Frame(right)
        action_bar.grid(row=row, column=0, columnspan=3, sticky="ew", pady=(14, 0))
        ttk.Button(action_bar, text="Toggle Featured", command=lambda: self.toggle_bool("featured")).pack(side="left", padx=4)
        ttk.Button(action_bar, text="Toggle Available", command=lambda: self.toggle_bool("available")).pack(side="left", padx=4)

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def load_items(self) -> None:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        MEDIA_DIR.mkdir(parents=True, exist_ok=True)

        if not DATA_FILE.exists():
            DATA_FILE.write_text(json.dumps({"items": []}, indent=2), encoding="utf-8")

        try:
            payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            data_items = payload.get("items", [])
            self.items = data_items if isinstance(data_items, list) else []
        except json.JSONDecodeError as exc:
            messagebox.showerror("Invalid JSON", f"Could not parse items.json\n\n{exc}")
            self.items = []

        self.refresh_tree()
        if self.items:
            self.select_item(0)
        else:
            self.clear_form()
        self.dirty = False
        self.set_status(f"Loaded {len(self.items)} items")

    def reload_items(self) -> None:
        if self.dirty and not self.confirm_discard_changes():
            return
        self.load_items()

    def refresh_tree(self) -> None:
        for row_id in self.tree.get_children():
            self.tree.delete(row_id)

        for idx, item in enumerate(self.items, start=1):
            title = item.get("title") or "(Untitled)"
            category = item.get("category") or ""
            flags = []
            if bool(item.get("available", False)):
                flags.append("available")
            if bool(item.get("featured", False)):
                flags.append("featured")
            status = ", ".join(flags) if flags else "-"
            self.tree.insert("", "end", iid=str(idx - 1), text=str(idx), values=(title, category, status))

    def on_tree_select(self, _event=None) -> None:
        sel = self.tree.selection()
        if not sel:
            return
        self.select_item(int(sel[0]))

    def select_item(self, idx: int) -> None:
        if idx < 0 or idx >= len(self.items):
            return
        self.current_index = idx
        self.tree.selection_set(str(idx))
        self.tree.focus(str(idx))
        self.fill_form(self.items[idx])

    def fill_form(self, item: dict) -> None:
        for fld in FIELDS:
            value = item.get(fld.key, "")
            widget = self.widgets[fld.key]
            if fld.kind == "text":
                widget.delete("1.0", "end")
                widget.insert("1.0", str(value))
            elif fld.kind == "bool":
                self.vars[fld.key].set(bool(value))
            else:
                self.vars[fld.key].set("" if value is None else str(value))

    def clear_form(self) -> None:
        for fld in FIELDS:
            widget = self.widgets[fld.key]
            if fld.kind == "text":
                widget.delete("1.0", "end")
            elif fld.kind == "bool":
                self.vars[fld.key].set(False)
            else:
                self.vars[fld.key].set("")

    def collect_form(self) -> dict:
        data = {}
        for fld in FIELDS:
            widget = self.widgets[fld.key]
            if fld.kind == "text":
                value = widget.get("1.0", "end").strip()
            elif fld.kind == "bool":
                value = bool(self.vars[fld.key].get())
            else:
                value = self.vars[fld.key].get().strip()

            if fld.key == "price":
                if value == "":
                    data[fld.key] = ""
                else:
                    try:
                        n = float(value)
                        data[fld.key] = int(n) if n.is_integer() else n
                    except ValueError:
                        data[fld.key] = value
            else:
                data[fld.key] = value

        if not data.get("id"):
            data["id"] = self.make_id(data.get("title") or "item")
        return data

    def apply_form_to_item(self) -> None:
        if self.current_index is None:
            messagebox.showinfo("No item selected", "Please select an item first.")
            return
        self.items[self.current_index] = self.collect_form()
        self.refresh_tree()
        self.select_item(self.current_index)
        self.mark_dirty("Item changes applied (not saved yet)")

    def add_new_item(self) -> None:
        new_item = {
            "id": self.make_id("new-item"),
            "title": "",
            "description": "",
            "price": "",
            "category": "",
            "available": True,
            "featured": False,
            "image": "",
            "video": "",
        }
        self.items.append(new_item)
        self.refresh_tree()
        self.select_item(len(self.items) - 1)
        self.mark_dirty("Added new item")

    def duplicate_item(self) -> None:
        if self.current_index is None:
            return
        source = dict(self.items[self.current_index])
        source["id"] = self.make_id(source.get("id") or "copy")
        source["title"] = f"{source.get('title', '')} (Copy)".strip()
        self.items.insert(self.current_index + 1, source)
        self.refresh_tree()
        self.select_item(self.current_index + 1)
        self.mark_dirty("Duplicated selected item")

    def delete_item(self) -> None:
        if self.current_index is None:
            return
        item = self.items[self.current_index]
        name = item.get("title") or item.get("id") or "this item"
        if not messagebox.askyesno("Delete item", f"Delete '{name}'?"):
            return
        del self.items[self.current_index]
        self.refresh_tree()
        if self.items:
            self.select_item(max(0, self.current_index - 1))
        else:
            self.current_index = None
            self.clear_form()
        self.mark_dirty("Item deleted")

    def save_items(self) -> None:
        if self.current_index is not None:
            self.items[self.current_index] = self.collect_form()

        payload = {"items": self.items}
        DATA_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        self.dirty = False
        self.refresh_tree()
        self.set_status(f"Saved {len(self.items)} items to {DATA_FILE}")
        messagebox.showinfo("Saved", "items.json saved successfully.")

    def upload_media(self, field_key: str) -> None:
        if field_key not in {"image", "video"}:
            return

        file_types = [("All files", "*.*")]
        if field_key == "image":
            file_types = [("Images", "*.png *.jpg *.jpeg *.webp *.gif *.svg"), ("All files", "*.*")]
        if field_key == "video":
            file_types = [("Videos", "*.mp4 *.mov *.avi *.webm *.mkv"), ("All files", "*.*")]

        source = filedialog.askopenfilename(title=f"Choose {field_key}", filetypes=file_types)
        if not source:
            return

        src_path = Path(source)
        if not src_path.exists():
            messagebox.showerror("Missing file", "The selected file no longer exists.")
            return

        MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = src_path.stem.replace(" ", "-")
        dest_name = f"{safe_name}-{uuid.uuid4().hex[:8]}{src_path.suffix.lower()}"
        dest_path = MEDIA_DIR / dest_name
        shutil.copy2(src_path, dest_path)

        rel = f"./assets/data/media/{dest_name}"
        self.vars[field_key].set(rel)
        self.mark_dirty(f"Uploaded and linked {field_key}: {dest_name}")

    def toggle_bool(self, key: str) -> None:
        if key not in self.vars:
            return
        current = bool(self.vars[key].get())
        self.vars[key].set(not current)
        self.mark_dirty(f"Toggled {key}")

    def make_id(self, seed: str) -> str:
        normalized = "-".join(seed.strip().lower().split()) or "item"
        return f"{normalized}-{uuid.uuid4().hex[:6]}"

    def confirm_discard_changes(self) -> bool:
        return messagebox.askyesno("Unsaved changes", "Discard unsaved changes?")

    def mark_dirty(self, msg: str) -> None:
        self.dirty = True
        self.set_status(msg)

    def set_status(self, msg: str) -> None:
        self.status_var.set(msg)

    def on_close(self) -> None:
        if self.dirty and not self.confirm_discard_changes():
            return
        self.root.destroy()


def main() -> None:
    ensure_dependencies(THIRD_PARTY_PACKAGES)
    ensure_tkinter_available()
    root = tk.Tk()
    style = ttk.Style(root)
    if "vista" in style.theme_names():
        style.theme_use("vista")
    app = ItemsEditor(root)
    app.set_status(f"Editing: {DATA_FILE}")
    root.mainloop()


if __name__ == "__main__":
    main()
