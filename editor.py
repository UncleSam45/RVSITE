#!/usr/bin/env python3
"""NiceGUI menu manager for La cuisine de Rosalie.

Edits the structured static data files used by the public site and keeps a
SQLite audit history for menu/settings/delivery/promotion/item changes.
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
DATA_DIR = BASE_DIR / "assets" / "data"
LEGACY_DATA_DIR = BASE_DIR / "data"
DB_FILE = LEGACY_DATA_DIR / "items_editor.db"
FILES = {
    "settings": DATA_DIR / "settings.json",
    "menus": DATA_DIR / "menus.json",
    "items": DATA_DIR / "items.json",
    "delivery": DATA_DIR / "delivery.json",
    "promotions": DATA_DIR / "promotions.json",
    "content": DATA_DIR / "content.json",
}


def module_installed(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def ensure_dependencies(packages: list[str]) -> None:
    for package in packages:
        module_name = package.split("==")[0].replace("-", "_")
        if not module_installed(module_name):
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])


def clean(value: Any) -> str:
    return str(value or "").strip()


def number(value: Any) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(fallback, indent=2, ensure_ascii=False), encoding="utf-8")
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


class DataStore:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        LEGACY_DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(DB_FILE)
        self.conn.row_factory = sqlite3.Row
        self._create_db()
        self.payloads = self.load_all()

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

    def load_all(self) -> dict[str, dict[str, Any]]:
        return {
            "settings": read_json(FILES["settings"], {"business": {}, "ordering": {}, "trust": {}}),
            "menus": read_json(FILES["menus"], {"current_menu": {}, "archive": []}),
            "items": read_json(FILES["items"], {"items": []}),
            "delivery": read_json(FILES["delivery"], {"zones": [], "rules": {}}),
            "promotions": read_json(FILES["promotions"], {"active": []}),
            "content": read_json(FILES["content"], {"seo": {}, "home": {}}),
        }

    def write(self, name: str, event_type: str) -> None:
        FILES[name].write_text(json.dumps(self.payloads[name], indent=2, ensure_ascii=False), encoding="utf-8")
        if name == "items":
            (LEGACY_DATA_DIR / "items.json").write_text(json.dumps(self.payloads[name], indent=2, ensure_ascii=False), encoding="utf-8")
        self.log_event(event_type, {"id": name, "title": name, "category": name, "pricing_type": "", "payload": self.payloads[name]})

    def write_all(self) -> None:
        for name in FILES:
            self.write(name, f"{name}_update")

    def log_event(self, event_type: str, payload: dict[str, Any]) -> None:
        self.conn.execute(
            """
            INSERT INTO item_history (item_id, title, category, pricing_type, event_type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.get("id", ""),
                payload.get("title", ""),
                payload.get("category", ""),
                payload.get("pricing_type", ""),
                event_type,
                json.dumps(payload, ensure_ascii=False),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        self.conn.commit()

    def validate(self) -> list[str]:
        warnings: list[str] = []
        menu = self.payloads["menus"].get("current_menu", {})
        items = self.payloads["items"].get("items", [])
        item_ids = {item.get("id") for item in items}
        if not menu.get("title"):
            warnings.append("Le menu courant n’a pas de titre.")
        if not menu.get("start_date") or not menu.get("end_date"):
            warnings.append("Le menu courant doit avoir une date de début et de fin.")
        if not menu.get("item_ids"):
            warnings.append("Le menu courant n’a aucun plat principal sélectionné.")
        for selected_id in menu.get("item_ids", []) + menu.get("extra_ids", []):
            if selected_id not in item_ids:
                warnings.append(f"L’item sélectionné est introuvable: {selected_id}")
        for item in items:
            if not item.get("id") or not item.get("title"):
                warnings.append("Un item est incomplet (ID ou titre manquant).")
            if not item.get("image"):
                warnings.append(f"Image manquante pour {item.get('title') or item.get('id')}")
            for portion, price in (item.get("pricing") or {}).items():
                if not isinstance(price, (int, float)) or price <= 0:
                    warnings.append(f"Prix invalide pour {item.get('title')} / {portion}.")
        if not [zone for zone in self.payloads["delivery"].get("zones", []) if zone.get("enabled", True)]:
            warnings.append("Aucune zone de livraison active.")
        return warnings

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


def build_ui(store: DataStore) -> None:
    from nicegui import app, ui

    ui.page_title("Menu Manager — La cuisine de Rosalie")
    ui.add_head_html(
        """
        <style>
          body,.nicegui-content{background:#f8f3ea!important;color:#241a12!important;font-family:Inter,system-ui,sans-serif}.nicegui-content{padding:0!important}
          .shell{min-height:100vh;padding:18px}.card{background:#fff;border:1px solid #e4d8c8;border-radius:18px;box-shadow:0 12px 30px rgba(36,26,18,.08);padding:16px}.muted{color:#6b6258}.section-title{font-weight:900;color:#2f421e}.warning{background:#fff8e9;border:1px solid #efd9b8;border-radius:12px;padding:10px;color:#a06320}.q-field__control{background:#fffdf8!important;border-radius:12px}.toolbar{position:sticky;bottom:0;background:rgba(255,255,255,.94);padding:10px;border-top:1px solid #e4d8c8;z-index:2}
        </style>
        """
    )

    settings = store.payloads["settings"]
    business = settings.setdefault("business", {})
    ordering = settings.setdefault("ordering", {})
    trust = settings.setdefault("trust", {})
    menu = store.payloads["menus"].setdefault("current_menu", {})
    delivery = store.payloads["delivery"]
    items_payload = store.payloads["items"]
    promos = store.payloads["promotions"].setdefault("active", [])

    selected_item: dict[str, Any] = {"index": None}
    item_list = None
    warnings_box = None

    def item_options() -> list[str]:
        return [item.get("id", "") for item in items_payload.get("items", []) if item.get("id")]

    def refresh_warnings() -> None:
        warnings_box.clear()
        warnings = store.validate()
        if warnings:
            for warning in warnings:
                ui.label(warning).classes("warning")
        else:
            ui.label("Validation réussie: aucune alerte de données.").classes("text-positive text-weight-bold")

    def save_all() -> None:
        store.write_all()
        refresh_warnings()
        ui.notify("Données sauvegardées", type="positive")

    def export_static() -> None:
        store.write_all()
        ui.notify(f"Données exportées dans {DATA_DIR}", type="positive")

    with ui.column().classes("shell w-full").style("gap:16px"):
        with ui.row().classes("w-full items-center justify-between"):
            with ui.column().style("gap:2px"):
                ui.label("Menu Manager").classes("text-h4 text-weight-bold")
                ui.label("Réglages, menu courant, items, livraison et promotions pour La cuisine de Rosalie.").classes("muted")
            with ui.row().style("gap:8px"):
                ui.button("Preview public site", on_click=lambda: ui.navigate.to("/", new_tab=True)).props("outline color=brown-7")
                ui.button("Validate data", on_click=refresh_warnings).props("outline color=orange-8")
                ui.button("Export static data", on_click=export_static).props("outline color=green")
                ui.button("Save all", on_click=save_all).props("color=green")

        with ui.tabs().classes("w-full") as tabs:
            business_tab = ui.tab("Business Settings")
            menu_tab = ui.tab("Current Menu")
            items_tab = ui.tab("Item Manager")
            delivery_tab = ui.tab("Delivery Manager")
            promo_tab = ui.tab("Promotions")
            validation_tab = ui.tab("Preview / Validate")

        with ui.tab_panels(tabs, value=business_tab).classes("w-full"):
            with ui.tab_panel(business_tab):
                with ui.grid(columns=2).classes("card w-full").style("gap:12px"):
                    ui.input("Business name", value=business.get("name", "")).bind_value(business, "name")
                    ui.input("Phone", value=business.get("phone", "")).bind_value(business, "phone")
                    ui.input("Email", value=business.get("email", "")).bind_value(business, "email")
                    ui.input("Facebook URL", value=business.get("facebook_url", "")).bind_value(business, "facebook_url")
                    ui.input("Messenger URL", value=business.get("messenger_url", "")).bind_value(business, "messenger_url")
                    ui.input("Main CTA text", value=store.payloads["content"].setdefault("home", {}).get("primary_cta", "Voir le menu de la semaine")).bind_value(store.payloads["content"]["home"], "primary_cta")
                    ui.number("Order notice hours", value=ordering.get("order_notice_hours", 48), min=0, precision=0).bind_value(ordering, "order_notice_hours")
                    ui.number("Minimum order", value=ordering.get("minimum_order", 35), min=0, precision=0).bind_value(ordering, "minimum_order")
                    ui.number("Free delivery threshold", value=ordering.get("free_delivery_threshold", 35), min=0, precision=0).bind_value(ordering, "free_delivery_threshold")
                    ui.input("Hygiene/MAPAQ statement", value=trust.get("hygiene_statement", "")).classes("col-span-2").bind_value(trust, "hygiene_statement")

            with ui.tab_panel(menu_tab):
                with ui.column().classes("card w-full").style("gap:12px"):
                    with ui.grid(columns=2).classes("w-full").style("gap:12px"):
                        ui.input("Menu title", value=menu.get("title", "")).bind_value(menu, "title")
                        ui.switch("Active", value=menu.get("active", True)).bind_value(menu, "active")
                        ui.input("Start date", value=menu.get("start_date", ""), placeholder="YYYY-MM-DD").bind_value(menu, "start_date")
                        ui.input("End date", value=menu.get("end_date", ""), placeholder="YYYY-MM-DD").bind_value(menu, "end_date")
                        ui.textarea("Description", value=menu.get("description", "")).classes("col-span-2").bind_value(menu, "description")
                    ui.select(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], value=menu.get("delivery_days", []), multiple=True, label="Delivery days").classes("w-full").bind_value(menu, "delivery_days")
                    ui.select(item_options(), value=menu.get("item_ids", []), multiple=True, label="Active menu items").classes("w-full").bind_value(menu, "item_ids")
                    ui.select(item_options(), value=menu.get("extra_ids", []), multiple=True, label="Active extras").classes("w-full").bind_value(menu, "extra_ids")

            with ui.tab_panel(items_tab):
                item_form: dict[str, Any] = {}

                def empty_item() -> dict[str, Any]:
                    return {"id": "", "title": "", "description": "", "category": "Plats principaux", "available": True, "featured": False, "image": "", "pricing": {"petit": 8, "grand": 10, "familial": 23}, "tags": []}

                def fill_item_form(item: dict[str, Any]) -> None:
                    item_form["id"].value = item.get("id", "")
                    item_form["title"].value = item.get("title", "")
                    item_form["description"].value = item.get("description", "")
                    item_form["category"].value = item.get("category", "")
                    item_form["image"].value = item.get("image", "")
                    item_form["available"].value = item.get("available", True)
                    item_form["featured"].value = item.get("featured", False)
                    pricing = item.get("pricing", {})
                    item_form["petit"].value = number(pricing.get("petit"))
                    item_form["grand"].value = number(pricing.get("grand"))
                    item_form["familial"].value = number(pricing.get("familial"))
                    item_form["standard"].value = number(pricing.get("standard"))
                    item_form["tags"].value = ", ".join(item.get("tags", []))

                def gather_item() -> dict[str, Any]:
                    pricing: dict[str, int] = {}
                    for key in ["petit", "grand", "familial", "standard"]:
                        if number(item_form[key].value) > 0:
                            pricing[key] = number(item_form[key].value)
                    return {
                        "id": clean(item_form["id"].value),
                        "title": clean(item_form["title"].value),
                        "description": clean(item_form["description"].value),
                        "category": clean(item_form["category"].value),
                        "available": bool(item_form["available"].value),
                        "featured": bool(item_form["featured"].value),
                        "image": clean(item_form["image"].value),
                        "pricing": pricing,
                        "tags": [clean(tag) for tag in clean(item_form["tags"].value).split(",") if clean(tag)],
                    }

                def refresh_items() -> None:
                    item_list.clear()
                    for index, item in enumerate(items_payload.get("items", [])):
                        def select_item(i=index) -> None:
                            selected_item["index"] = i
                            fill_item_form(items_payload["items"][i])
                        ui.button(f"{item.get('title', 'Sans titre')} · {item.get('category', '')}", on_click=select_item).classes("w-full").props("flat color=brown-8")

                def new_item() -> None:
                    selected_item["index"] = None
                    fill_item_form(empty_item())

                def save_item() -> None:
                    item = gather_item()
                    if not item["id"] or not item["title"]:
                        ui.notify("ID et titre requis", type="negative")
                        return
                    if selected_item["index"] is None:
                        items_payload.setdefault("items", []).append(item)
                        event = "item_create"
                    else:
                        items_payload["items"][selected_item["index"]] = item
                        event = "item_update"
                    store.write("items", event)
                    refresh_items()
                    ui.notify("Item sauvegardé", type="positive")

                def clone_item() -> None:
                    item = gather_item()
                    item["id"] = f"{item['id']}-copie"
                    item["title"] = f"{item['title']} (copie)"
                    selected_item["index"] = None
                    fill_item_form(item)

                def delete_item() -> None:
                    index = selected_item["index"]
                    if index is None:
                        ui.notify("Sélectionnez un item", type="warning")
                        return
                    item = items_payload["items"].pop(index)
                    store.log_event("item_delete", item)
                    store.write("items", "items_update")
                    selected_item["index"] = None
                    refresh_items()
                    new_item()

                with ui.row().classes("w-full").style("gap:14px"):
                    with ui.column().classes("card").style("width:32%; gap:8px"):
                        ui.label("Items").classes("section-title")
                        item_list = ui.column().classes("w-full").style("max-height:60vh;overflow:auto")
                        with ui.row().style("gap:8px"):
                            ui.button("New", on_click=new_item).props("color=brown-7")
                            ui.button("Clone", on_click=clone_item).props("outline color=brown-7")
                            ui.button("Delete", on_click=delete_item).props("outline color=red")
                    with ui.column().classes("card").style("width:68%; gap:12px"):
                        with ui.grid(columns=2).classes("w-full").style("gap:10px"):
                            item_form["id"] = ui.input("ID")
                            item_form["title"] = ui.input("Title")
                            item_form["description"] = ui.textarea("Description")
                            item_form["category"] = ui.input("Category")
                            item_form["image"] = ui.input("Image")
                            item_form["tags"] = ui.input("Tags comma-separated")
                            item_form["petit"] = ui.number("Petit", min=0, precision=0)
                            item_form["grand"] = ui.number("Grand", min=0, precision=0)
                            item_form["familial"] = ui.number("Familial", min=0, precision=0)
                            item_form["standard"] = ui.number("Standard", min=0, precision=0)
                            item_form["available"] = ui.switch("Available", value=True)
                            item_form["featured"] = ui.switch("Featured", value=False)
                        ui.button("Save item", on_click=save_item).props("color=green")
                refresh_items()
                new_item()

            with ui.tab_panel(delivery_tab):
                zone_col = None

                def refresh_zones() -> None:
                    zone_col.clear()
                    for zone in delivery.setdefault("zones", []):
                        with ui.row().classes("w-full items-center").style("gap:8px"):
                            ui.input("City", value=zone.get("city", "")).bind_value(zone, "city")
                            ui.input("Province", value=zone.get("province", "QC")).bind_value(zone, "province")
                            ui.switch("Enabled", value=zone.get("enabled", True)).bind_value(zone, "enabled")

                def add_zone() -> None:
                    delivery.setdefault("zones", []).append({"city": "Nouvelle ville", "province": "QC", "enabled": True})
                    refresh_zones()

                with ui.column().classes("card w-full").style("gap:12px"):
                    rules = delivery.setdefault("rules", {})
                    with ui.grid(columns=3).classes("w-full").style("gap:12px"):
                        ui.number("Order notice hours", value=rules.get("order_notice_hours", 48), min=0, precision=0).bind_value(rules, "order_notice_hours")
                        ui.number("Minimum order", value=rules.get("minimum_order", 35), min=0, precision=0).bind_value(rules, "minimum_order")
                        ui.number("Free delivery threshold", value=rules.get("free_delivery_threshold", 35), min=0, precision=0).bind_value(rules, "free_delivery_threshold")
                    ui.input("Delivery notes", value=rules.get("scheduling_note", "")).classes("w-full").bind_value(rules, "scheduling_note")
                    ui.label("Delivery zones").classes("section-title")
                    zone_col = ui.column().classes("w-full")
                    ui.button("Add city", on_click=add_zone).props("outline color=green")
                refresh_zones()

            with ui.tab_panel(promo_tab):
                promo_col = None

                def refresh_promos() -> None:
                    promo_col.clear()
                    for promo in promos:
                        with ui.grid(columns=2).classes("card w-full").style("gap:10px"):
                            ui.input("ID", value=promo.get("id", "")).bind_value(promo, "id")
                            ui.switch("Enabled", value=promo.get("enabled", True)).bind_value(promo, "enabled")
                            ui.input("Title", value=promo.get("title", "")).bind_value(promo, "title")
                            ui.input("Type", value=promo.get("type", "informational")).bind_value(promo, "type")
                            ui.textarea("Description", value=promo.get("description", "")).classes("col-span-2").bind_value(promo, "description")

                def add_promo() -> None:
                    promos.append({"id": "nouvelle-promotion", "title": "Nouvelle promotion", "description": "", "type": "informational", "enabled": True})
                    refresh_promos()

                with ui.column().classes("w-full").style("gap:12px"):
                    promo_col = ui.column().classes("w-full").style("gap:12px")
                    ui.button("Add promotion", on_click=add_promo).props("outline color=green")
                refresh_promos()

            with ui.tab_panel(validation_tab):
                with ui.column().classes("card w-full").style("gap:10px"):
                    ui.label("Validation").classes("section-title")
                    warnings_box = ui.column().classes("w-full").style("gap:8px")
                    ui.button("Validate data", on_click=refresh_warnings).props("color=orange-8")

        with ui.row().classes("toolbar w-full").style("gap:8px"):
            ui.button("Save all JSON", on_click=save_all).props("color=green")
            ui.button("Preview public site", on_click=lambda: ui.navigate.to("/", new_tab=True)).props("outline color=brown-7")

    refresh_warnings()

    @app.on_shutdown
    def _cleanup() -> None:
        store.close()


def main() -> None:
    ensure_dependencies(REQUIRED_PACKAGES)
    store = DataStore()
    port = int(os.environ.get("EDITOR_PORT", "0")) or find_available_port(8890)
    print(f"[run] Editor available on http://0.0.0.0:{port}")
    build_ui(store)
    from nicegui import ui

    ui.run(host="0.0.0.0", port=port, reload=False, show=False, title="Menu Manager")


if __name__ == "__main__":
    main()
