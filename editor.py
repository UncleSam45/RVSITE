#!/usr/bin/env python3
"""NiceGUI-based editor for data/items.json with SQLite history and presets.

Designed for remote/mobile access over private networks (e.g. Tailscale).
"""

from __future__ import annotations

import importlib.util
import json
import os
import socket
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REQUIRED_PACKAGES = ["nicegui"]
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ITEMS_FILE = DATA_DIR / "items.json"
DB_FILE = DATA_DIR / "items_editor.db"
UNCATEGORIZED = "Uncategorized"


def module_installed(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def ensure_dependencies(packages: list[str]) -> None:
    for package in packages:
        module_name = package.split("==")[0].replace("-", "_")
        if not module_installed(module_name):
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])


def clean_name(value: Any) -> str:
    return str(value or "").strip()


def coerce_int(value: Any) -> int:
    return int(float(value or 0))


class ItemStore:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(DB_FILE)
        self.conn.row_factory = sqlite3.Row
        self._create_db()
        self.payload = self._load_items_payload()

    def _create_db(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS item_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT,
                title TEXT,
                category TEXT,
                pricing_type TEXT,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        self.conn.commit()

    def _load_items_payload(self) -> dict[str, Any]:
        if not ITEMS_FILE.exists():
            payload: dict[str, Any] = {"items": [], "current_menu": {}, "categories": []}
            self.write_payload(payload)
            return payload
        with ITEMS_FILE.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        payload.setdefault("items", [])
        payload.setdefault("current_menu", {})
        payload["categories"] = self._normalize_categories(payload.get("categories", []))
        return payload

    def write_payload(self, payload: dict[str, Any] | None = None) -> None:
        if payload is None:
            payload = self.payload
        payload["categories"] = self._normalize_categories(payload.get("categories", []))
        with ITEMS_FILE.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

    def log_event(self, event_type: str, item: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            """
            INSERT INTO item_history (item_id, title, category, pricing_type, event_type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item.get("id", ""),
                item.get("title", ""),
                item.get("category", ""),
                item.get("pricing_type", ""),
                event_type,
                json.dumps(item, ensure_ascii=False),
                now,
            ),
        )
        self.conn.commit()

    def log_category_event(self, event_type: str, name: str, details: dict[str, Any] | None = None) -> None:
        payload = {"id": f"category:{name}", "title": name, "category": name, "details": details or {}}
        self.log_event(event_type, payload)

    def _normalize_categories(self, categories: Any) -> list[str]:
        if not isinstance(categories, list):
            return []
        return sorted({clean_name(category) for category in categories if clean_name(category)}, key=str.lower)

    def item_categories(self) -> list[str]:
        return sorted({clean_name(i.get("category")) for i in self.payload["items"] if clean_name(i.get("category"))}, key=str.lower)

    def categories(self) -> list[str]:
        values = set(self._normalize_categories(self.payload.get("categories", [])))
        values.update(self.item_categories())
        return sorted(values, key=str.lower)

    def pricing_types(self) -> list[str]:
        values = {
            row["value"]
            for row in self.conn.execute(
                "SELECT DISTINCT pricing_type AS value FROM item_history WHERE TRIM(COALESCE(pricing_type,'')) <> '' ORDER BY LOWER(value)"
            )
        }
        values.update(clean_name(i.get("pricing_type")) for i in self.payload["items"] if clean_name(i.get("pricing_type")))
        return sorted(values, key=str.lower)

    def presets(self) -> tuple[list[str], list[str]]:
        return self.categories(), self.pricing_types()

    def category_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in self.payload["items"]:
            category = clean_name(item.get("category")) or UNCATEGORIZED
            counts[category] = counts.get(category, 0) + 1
        return counts

    def save_categories(self, categories: list[str]) -> None:
        self.payload["categories"] = self._normalize_categories(categories)
        self.write_payload()

    def add_category(self, name: str) -> bool:
        name = clean_name(name)
        if not name:
            return False
        categories = self.categories()
        if name.casefold() not in {category.casefold() for category in categories}:
            categories.append(name)
            self.save_categories(categories)
            self.log_category_event("category_create", name)
        return True

    def rename_category(self, old_name: str, new_name: str) -> int:
        old_name = clean_name(old_name)
        new_name = clean_name(new_name)
        if not old_name or not new_name:
            return 0
        renamed = 0
        for item in self.payload["items"]:
            if clean_name(item.get("category")).casefold() == old_name.casefold():
                item["category"] = new_name
                self.log_event("category_item_update", item)
                renamed += 1
        categories = [new_name if category.casefold() == old_name.casefold() else category for category in self.categories()]
        self.save_categories(categories)
        self.log_category_event("category_rename", new_name, {"old_name": old_name, "item_count": renamed})
        return renamed

    def delete_category(self, name: str) -> int:
        name = clean_name(name)
        if not name:
            return 0
        changed = 0
        for item in self.payload["items"]:
            if clean_name(item.get("category")).casefold() == name.casefold():
                item["category"] = ""
                self.log_event("category_item_uncategorize", item)
                changed += 1
        categories = [category for category in self.categories() if category.casefold() != name.casefold()]
        self.save_categories(categories)
        self.log_category_event("category_delete", name, {"uncategorized_item_count": changed})
        return changed

    def close(self) -> None:
        self.conn.close()


def find_available_port(preferred: int = 8890, max_tries: int = 50) -> int:
    for offset in range(max_tries):
        candidate = preferred + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if sock.connect_ex(("127.0.0.1", candidate)) != 0:
                return candidate
    raise RuntimeError("No open port found")


def build_ui(store: ItemStore) -> None:
    from nicegui import app, ui

    state: dict[str, Any] = {
        "selected_index": None,
        "filter": "",
    }

    ui.add_head_html("""
    <style>
      body,.nicegui-content{background:#100d0a!important;color:#f8f2eb!important;font-family:Inter,system-ui,sans-serif}
      .nicegui-content{padding:0!important}
      .app-shell{min-height:100vh;padding:18px;background:linear-gradient(135deg,#120f0c,#2b1f17)}
      .editor-card{background:rgba(255,250,244,.96);color:#261b12;border:1px solid #eadfd2;border-radius:18px;box-shadow:0 16px 38px rgba(0,0,0,.24)}
      .editor-card .q-field__label,.editor-card .q-field__native,.editor-card .q-field__input,.editor-card .q-field__prefix,.editor-card .q-field__suffix{color:#2d2118!important}
      .editor-card .q-field__control{background:#fffdf9;border-radius:12px}
      .section-title{font-size:1rem;font-weight:800;color:#5f3b1f;margin-top:8px}
      .muted{color:#74685d;font-size:.88rem;line-height:1.35}
      .list-btn{width:100%;justify-content:flex-start;text-transform:none;border-radius:12px;margin-bottom:6px;text-align:left}
      .selected-item{outline:2px solid #b88442;background:#fff6e7!important}
      .pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 10px;background:#f1e5d6;color:#694725;font-weight:700;font-size:.78rem}
      .toolbar{position:sticky;bottom:0;background:rgba(255,250,244,.94);border-top:1px solid #eadfd2;padding-top:10px;z-index:3}
      @media(max-width:900px){.layout-row{flex-direction:column}.side-panel,.main-panel{width:100%!important}.app-shell{padding:10px}}
    </style>
    """)

    id_input = title_input = desc_input = category_input = image_input = video_input = pricing_type_input = None
    available_input = featured_input = None
    small_input = large_input = None
    family_input = range_input = None
    category_preset = pricing_type_preset = category_select = category_name_input = None
    item_list_col = selected_label = counts_label = None

    def gather_item() -> dict[str, Any]:
        assert id_input and title_input and desc_input and category_input
        assert image_input and video_input and pricing_type_input
        assert available_input and featured_input
        assert small_input and large_input and family_input and range_input
        pricing: dict[str, Any] = {}
        if coerce_int(small_input.value) > 0:
            pricing["small_meal"] = coerce_int(small_input.value)
        if coerce_int(large_input.value) > 0:
            pricing["large_meal"] = coerce_int(large_input.value)
        if clean_name(family_input.value):
            pricing["family_format"] = clean_name(family_input.value)
        if clean_name(range_input.value):
            pricing["price_range"] = clean_name(range_input.value)
        return {
            "id": clean_name(id_input.value),
            "title": clean_name(title_input.value),
            "description": clean_name(desc_input.value),
            "category": clean_name(category_input.value),
            "available": bool(available_input.value),
            "featured": bool(featured_input.value),
            "image": clean_name(image_input.value),
            "video": clean_name(video_input.value),
            "pricing_type": clean_name(pricing_type_input.value),
            "pricing": pricing,
        }

    def fill_form(item: dict[str, Any]) -> None:
        pricing = item.get("pricing", {}) if isinstance(item.get("pricing"), dict) else {}
        id_input.value = item.get("id", "")
        title_input.value = item.get("title", "")
        desc_input.value = item.get("description", "")
        category_input.value = item.get("category", "")
        available_input.value = bool(item.get("available", True))
        featured_input.value = bool(item.get("featured", False))
        image_input.value = item.get("image", "")
        video_input.value = item.get("video", "")
        pricing_type_input.value = item.get("pricing_type", "")
        small_input.value = coerce_int(pricing.get("small_meal"))
        large_input.value = coerce_int(pricing.get("large_meal"))
        family_input.value = pricing.get("family_format", "")
        range_input.value = pricing.get("price_range", "")
        update_selected_label()

    def update_selected_label() -> None:
        if not selected_label:
            return
        idx = state["selected_index"]
        if idx is None:
            selected_label.text = "Creating a new item"
        else:
            item = store.payload["items"][idx]
            selected_label.text = f"Editing: {item.get('title', 'Untitled')}"

    def clear_form() -> None:
        state["selected_index"] = None
        fill_form({"available": True, "pricing": {}})
        if category_preset.value:
            category_input.value = category_preset.value
        if pricing_type_preset.value:
            pricing_type_input.value = pricing_type_preset.value
        refresh_list()

    def refresh_presets() -> None:
        cats, ptypes = store.presets()
        category_preset.options = cats
        category_select.options = cats
        pricing_type_preset.options = ptypes
        category_preset.update()
        category_select.update()
        pricing_type_preset.update()
        counts = store.category_counts()
        count_text = " • ".join(f"{name}: {count}" for name, count in sorted(counts.items(), key=lambda item: item[0].lower()))
        counts_label.text = count_text or "No items yet. Create categories first, then assign items to them."

    def refresh_list() -> None:
        item_list_col.clear()
        needle = clean_name(state["filter"]).lower()
        visible_count = 0
        for i, item in enumerate(store.payload["items"]):
            category = item.get("category") or UNCATEGORIZED
            label = f"{item.get('title','Untitled')} · {category}"
            hay = f"{item.get('id','')} {label} {item.get('description','')}".lower()
            if needle and needle not in hay:
                continue
            visible_count += 1

            def select_item(idx=i) -> None:
                state["selected_index"] = idx
                fill_form(store.payload["items"][idx])
                refresh_list()

            classes = "list-btn"
            if state["selected_index"] == i:
                classes += " selected-item"
            ui.button(label, on_click=select_item).classes(classes).props("flat color=brown-8")
        if visible_count == 0:
            ui.label("No items match this search.").classes("muted")

    def save_item() -> None:
        item = gather_item()
        if not item["id"] or not item["title"]:
            ui.notify("ID and Title are required", type="negative")
            return
        if item["category"]:
            store.add_category(item["category"])
        if state["selected_index"] is None:
            store.payload["items"].append(item)
            state["selected_index"] = len(store.payload["items"]) - 1
            event = "create"
        else:
            store.payload["items"][state["selected_index"]] = item
            event = "update"
        store.write_payload()
        store.log_event(event, item)
        refresh_presets()
        refresh_list()
        update_selected_label()
        ui.notify(f"Saved {item['title']}", type="positive")

    def delete_item() -> None:
        idx = state["selected_index"]
        if idx is None:
            ui.notify("Select an item before deleting.", type="warning")
            return
        item = store.payload["items"].pop(idx)
        store.write_payload()
        store.log_event("delete", item)
        clear_form()
        refresh_presets()
        ui.notify(f"Deleted {item.get('title','item')}")

    def clone_item() -> None:
        idx = state["selected_index"]
        if idx is None:
            ui.notify("Select an item to clone first.", type="warning")
            return
        item = store.payload["items"][idx]
        fill_form(item)
        id_input.value = f"{item.get('id','new-item')}-copy"
        title_input.value = f"{item.get('title','Item')} (copy)"
        state["selected_index"] = None
        update_selected_label()
        refresh_list()

    def apply_category_to_form(value: str | None) -> None:
        category_input.value = value or ""
        category_name_input.value = value or ""

    def add_category() -> None:
        name = clean_name(category_name_input.value)
        if not name:
            ui.notify("Enter a category name first.", type="warning")
            return
        store.add_category(name)
        category_preset.value = name
        category_select.value = name
        category_input.value = name
        refresh_presets()
        ui.notify(f"Category ready: {name}", type="positive")

    def rename_category() -> None:
        old_name = clean_name(category_select.value)
        new_name = clean_name(category_name_input.value)
        if not old_name or not new_name:
            ui.notify("Choose a category and enter its new name.", type="warning")
            return
        renamed = store.rename_category(old_name, new_name)
        category_preset.value = new_name
        category_select.value = new_name
        if clean_name(category_input.value).casefold() == old_name.casefold():
            category_input.value = new_name
        refresh_presets()
        refresh_list()
        ui.notify(f"Renamed category and updated {renamed} item(s).", type="positive")

    def delete_category() -> None:
        name = clean_name(category_select.value)
        if not name:
            ui.notify("Choose a category to remove.", type="warning")
            return
        changed = store.delete_category(name)
        category_select.value = None
        category_preset.value = None
        if clean_name(category_input.value).casefold() == name.casefold():
            category_input.value = ""
        refresh_presets()
        refresh_list()
        ui.notify(f"Removed category; {changed} item(s) are now uncategorized.")

    ui.page_title("Items Editor")
    with ui.column().classes("app-shell w-full"):
        with ui.row().classes("w-full items-center justify-between").style("gap:12px"):
            with ui.column().style("gap:2px"):
                ui.label("Menu editor").classes("text-h4 text-weight-bold")
                ui.label("Manage menu items, categories, images, and pricing from one guided workspace.").classes("muted")
            ui.label(f"{len(store.payload['items'])} items").classes("pill")

        with ui.row().classes("layout-row w-full items-start").style("gap:16px"):
            with ui.column().classes("editor-card side-panel").style("width:32%; padding:16px; gap:12px"):
                ui.label("1. Find or start an item").classes("section-title")
                ui.input("Search by title, category, ID, or description", placeholder="Type to filter the list...").classes("w-full").on(
                    "update:model-value", lambda e: (state.__setitem__("filter", e.value), refresh_list())
                )
                item_list_col = ui.column().classes("w-full").style("max-height:46vh; overflow:auto")
                with ui.row().classes("w-full").style("gap:8px"):
                    ui.button("New", on_click=clear_form).props("color=brown-7")
                    ui.button("Clone", on_click=clone_item).props("outline color=brown-7")
                    ui.button("Delete", on_click=delete_item).props("outline color=red")

                ui.separator()
                ui.label("2. Categories").classes("section-title")
                ui.label("Create a category, rename it everywhere, or remove it from the list. Removing a category keeps its items but leaves them uncategorized.").classes("muted")
                category_select = ui.select([], label="Existing category").classes("w-full")
                category_name_input = ui.input("Category name", placeholder="Example: Signature Entrees").classes("w-full")
                category_select.on("update:model-value", lambda e: apply_category_to_form(e.value))
                with ui.row().classes("w-full").style("gap:8px"):
                    ui.button("Add", on_click=add_category).props("color=green")
                    ui.button("Rename", on_click=rename_category).props("color=brown-7")
                    ui.button("Remove", on_click=delete_category).props("outline color=red")
                counts_label = ui.label("").classes("muted")

            with ui.column().classes("editor-card main-panel").style("width:68%; padding:16px; gap:12px"):
                selected_label = ui.label("Creating a new item").classes("pill")
                ui.label("3. Edit item details").classes("section-title")
                with ui.row().classes("w-full").style("gap:12px"):
                    category_preset = ui.select([], label="Set category").classes("w-1/2")
                    pricing_type_preset = ui.select([], label="Set pricing type").classes("w-1/2")
                category_preset.on("update:model-value", lambda e: setattr(category_input, "value", e.value or ""))
                pricing_type_preset.on("update:model-value", lambda e: setattr(pricing_type_input, "value", e.value or ""))

                with ui.grid(columns=2).classes("w-full").style("gap:10px"):
                    id_input = ui.input("ID", placeholder="unique-item-id").classes("w-full")
                    title_input = ui.input("Title", placeholder="Customer-facing item name").classes("w-full")
                    desc_input = ui.textarea("Description", placeholder="Short menu description").classes("w-full")
                    category_input = ui.input("Category", placeholder="Pick from presets or type a new category").classes("w-full")
                    image_input = ui.input("Image URL", placeholder="https://...").classes("w-full")
                    video_input = ui.input("Video URL", placeholder="Optional").classes("w-full")
                    pricing_type_input = ui.input("Pricing Type", placeholder="regular_meal, sides_extras...").classes("w-full")
                    ui.element("div")
                    small_input = ui.number("Small meal", value=0, min=0, precision=0).classes("w-full")
                    large_input = ui.number("Large meal", value=0, min=0, precision=0).classes("w-full")
                    family_input = ui.input("Family format", placeholder="$34 tray or 19-25 depending on special").classes("w-full")
                    range_input = ui.input("Price range", placeholder="14-20").classes("w-full")
                    available_input = ui.switch("Available", value=True)
                    featured_input = ui.switch("Featured", value=False)

                with ui.row().classes("toolbar w-full").style("gap:8px"):
                    ui.button("Save item", on_click=save_item).props("color=green")
                    ui.button("Save JSON", on_click=lambda: (store.write_payload(), ui.notify("items.json saved", type="positive"))).props("outline color=brown-7")
                    ui.button("Start new", on_click=clear_form).props("flat color=brown-7")

    refresh_presets()
    refresh_list()
    clear_form()

    @app.on_shutdown
    def _cleanup() -> None:
        store.close()


def main() -> None:
    ensure_dependencies(REQUIRED_PACKAGES)
    store = ItemStore()
    port = int(os.environ.get("EDITOR_PORT", "0")) or find_available_port(8890)
    print(f"[run] Editor available on http://0.0.0.0:{port}")
    build_ui(store)
    from nicegui import ui

    ui.run(host="0.0.0.0", port=port, reload=False, show=False, title="Items Editor")


if __name__ == "__main__":
    main()
