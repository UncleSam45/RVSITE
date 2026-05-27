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


def module_installed(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def ensure_dependencies(packages: list[str]) -> None:
    for package in packages:
        module_name = package.split("==")[0].replace("-", "_")
        if not module_installed(module_name):
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])


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
            payload: dict[str, Any] = {"items": [], "current_menu": {}}
            self.write_payload(payload)
            return payload
        with ITEMS_FILE.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        payload.setdefault("items", [])
        payload.setdefault("current_menu", {})
        return payload

    def write_payload(self, payload: dict[str, Any]) -> None:
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

    def presets(self) -> tuple[list[str], list[str]]:
        categories = [
            row["value"]
            for row in self.conn.execute(
                "SELECT DISTINCT category AS value FROM item_history WHERE TRIM(COALESCE(category,'')) <> '' ORDER BY value"
            )
        ]
        pricing_types = [
            row["value"]
            for row in self.conn.execute(
                "SELECT DISTINCT pricing_type AS value FROM item_history WHERE TRIM(COALESCE(pricing_type,'')) <> '' ORDER BY value"
            )
        ]
        if not categories:
            categories = sorted({str(i.get("category", "")).strip() for i in self.payload["items"] if str(i.get("category", "")).strip()})
        if not pricing_types:
            pricing_types = sorted({str(i.get("pricing_type", "")).strip() for i in self.payload["items"] if str(i.get("pricing_type", "")).strip()})
        return categories, pricing_types

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
    from nicegui import ui, app

    state: dict[str, Any] = {
        "selected_index": None,
        "filter": "",
    }

    ui.add_head_html("""
    <style>
      body,.nicegui-content{background:#000!important;color:#f2f2f2!important}
      .panel{background:#070707;border:1px solid #222;border-radius:14px}
      .list-btn{width:100%;justify-content:flex-start;text-transform:none}
    </style>
    """)

    id_input = title_input = desc_input = category_input = image_input = video_input = pricing_type_input = None
    available_input = featured_input = None
    small_input = large_input = None
    family_input = range_input = None
    category_preset = pricing_type_preset = None
    item_list_col = None

    def gather_item() -> dict[str, Any]:
        assert id_input and title_input and desc_input and category_input
        assert image_input and video_input and pricing_type_input
        assert available_input and featured_input
        assert small_input and large_input and family_input and range_input
        pricing: dict[str, Any] = {}
        if int(small_input.value or 0) > 0:
            pricing["small_meal"] = int(small_input.value)
        if int(large_input.value or 0) > 0:
            pricing["large_meal"] = int(large_input.value)
        if (family_input.value or "").strip():
            pricing["family_format"] = family_input.value.strip()
        if (range_input.value or "").strip():
            pricing["price_range"] = range_input.value.strip()
        return {
            "id": (id_input.value or "").strip(),
            "title": (title_input.value or "").strip(),
            "description": (desc_input.value or "").strip(),
            "category": (category_input.value or "").strip(),
            "available": bool(available_input.value),
            "featured": bool(featured_input.value),
            "image": (image_input.value or "").strip(),
            "video": (video_input.value or "").strip(),
            "pricing_type": (pricing_type_input.value or "").strip(),
            "pricing": pricing,
        }

    def fill_form(item: dict[str, Any]) -> None:
        pricing = item.get("pricing", {}) if isinstance(item.get("pricing"), dict) else {}
        id_input.value = item.get("id", "")
        title_input.value = item.get("title", "")
        desc_input.value = item.get("description", "")
        category_input.value = item.get("category", "")
        available_input.value = bool(item.get("available", False))
        featured_input.value = bool(item.get("featured", False))
        image_input.value = item.get("image", "")
        video_input.value = item.get("video", "")
        pricing_type_input.value = item.get("pricing_type", "")
        small_input.value = int(pricing.get("small_meal") or 0)
        large_input.value = int(pricing.get("large_meal") or 0)
        family_input.value = pricing.get("family_format", "")
        range_input.value = pricing.get("price_range", "")

    def clear_form() -> None:
        state["selected_index"] = None
        fill_form({"pricing": {}})
        if category_preset.value:
            category_input.value = category_preset.value
        if pricing_type_preset.value:
            pricing_type_input.value = pricing_type_preset.value

    def refresh_presets() -> None:
        cats, ptypes = store.presets()
        category_preset.options = cats
        pricing_type_preset.options = ptypes
        category_preset.update()
        pricing_type_preset.update()

    def refresh_list() -> None:
        item_list_col.clear()
        needle = (state["filter"] or "").strip().lower()
        for i, item in enumerate(store.payload["items"]):
            label = f"{item.get('title','Untitled')} [{item.get('category','No category')}]"
            hay = f"{item.get('id','')} {label}".lower()
            if needle and needle not in hay:
                continue
            def select_item(idx=i):
                state["selected_index"] = idx
                fill_form(store.payload["items"][idx])
            ui.button(label, on_click=select_item).classes('list-btn').props('flat color=grey-3').style('text-align:left')

    def save_item() -> None:
        item = gather_item()
        if not item["id"] or not item["title"]:
            ui.notify("ID and Title are required", type="negative")
            return
        if state["selected_index"] is None:
            store.payload["items"].append(item)
            state["selected_index"] = len(store.payload["items"]) - 1
            event = "create"
        else:
            store.payload["items"][state["selected_index"]] = item
            event = "update"
        store.write_payload(store.payload)
        store.log_event(event, item)
        refresh_presets()
        refresh_list()
        ui.notify(f"Saved {item['title']}", type="positive")

    def delete_item() -> None:
        idx = state["selected_index"]
        if idx is None:
            return
        item = store.payload["items"].pop(idx)
        store.write_payload(store.payload)
        store.log_event("delete", item)
        clear_form()
        refresh_list()
        ui.notify(f"Deleted {item.get('title','item')}")

    def clone_item() -> None:
        idx = state["selected_index"]
        if idx is None:
            return
        item = store.payload["items"][idx]
        fill_form(item)
        id_input.value = f"{item.get('id','new-item')}-copy"
        state["selected_index"] = None

    with ui.row().classes('w-full items-start').style('gap:16px; padding:16px;'):
        with ui.column().classes('panel').style('width:34%; padding:12px;'):
            ui.label('Items').classes('text-h6')
            ui.input('Search').on('update:model-value', lambda e: (state.__setitem__('filter', e.value), refresh_list()))
            item_list_col = ui.column().classes('w-full').style('max-height:72vh; overflow:auto;')
            with ui.row().classes('w-full'):
                ui.button('New', on_click=clear_form)
                ui.button('Clone', on_click=clone_item)
                ui.button('Delete', on_click=delete_item).props('color=red')

        with ui.column().classes('panel').style('width:66%; padding:12px;'):
            ui.label('Item Editor').classes('text-h6')
            with ui.row().classes('w-full'):
                category_preset = ui.select([], label='Category preset').classes('w-1/2')
                pricing_type_preset = ui.select([], label='Pricing type preset').classes('w-1/2')
            category_preset.on('update:model-value', lambda e: setattr(category_input, 'value', e.value or ''))
            pricing_type_preset.on('update:model-value', lambda e: setattr(pricing_type_input, 'value', e.value or ''))

            with ui.grid(columns=2).classes('w-full'):
                id_input = ui.input('ID')
                title_input = ui.input('Title')
                desc_input = ui.textarea('Description')
                category_input = ui.input('Category')
                image_input = ui.input('Image URL')
                video_input = ui.input('Video URL')
                pricing_type_input = ui.input('Pricing Type')
                ui.element('div')
                small_input = ui.number('Small meal', value=0, min=0, precision=0)
                large_input = ui.number('Large meal', value=0, min=0, precision=0)
                family_input = ui.input('Family format')
                range_input = ui.input('Price range')
                available_input = ui.switch('Available', value=True)
                featured_input = ui.switch('Featured', value=False)

            with ui.row():
                ui.button('Save Item', on_click=save_item).props('color=green')
                ui.button('Save JSON', on_click=lambda: (store.write_payload(store.payload), ui.notify('items.json saved')))

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
