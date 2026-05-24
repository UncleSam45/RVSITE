#!/usr/bin/env python3
"""NiceGUI app bootstrap with backup/restore and safe JSON writes."""

from __future__ import annotations

import json
import os
import shutil
import socket
from pathlib import Path
from typing import Any

ACTIVE_DIR = Path(__file__).resolve().parent
BACKUP_DIR = Path.home() / "Documents" / "RVSITE"
DATA_DIR = ACTIVE_DIR / "data"
ASSETS_DIR = ACTIVE_DIR / "assets"
IMAGES_DIR = ASSETS_DIR / "images"
VIDEOS_DIR = ASSETS_DIR / "videos"
ITEMS_FILE = DATA_DIR / "items.json"

EXCLUDED_DIRS = {"venv", ".git", "__pycache__"}
EXCLUDED_EXTS = {".pyc"}

DEFAULT_ITEMS = {
    "brand": "Harvest & Hearth",
    "tagline": "Local Cooking Studio & Weekly Meal Craft",
    "tabs": [
        {"id": "home", "label": "ACCUEIL"},
        {"id": "menu", "label": "MENUS"},
        {"id": "special", "label": "SPÉCIAL DU JOUR"},
        {"id": "contact", "label": "CONTACT"},
    ],
    "categories": ["All", "Seasonal", "Family Packs", "Vegetarian", "Desserts"],
    "items": [
        {
            "id": "garden-harvest-bowl",
            "title": "Garden Harvest Bowl",
            "description": "Roasted market vegetables, lemon-herb grains, and whipped feta.",
            "price": 14,
            "category": "Seasonal",
            "badge": "Best Seller",
            "available": True,
            "featured": True,
            "image": "./assets/images/garden-harvest-bowl.jpg",
            "video": "",
        }
    ],
    "heroVideos": ["./assets/videos/food-hero-01.mp4", "./assets/videos/food-hero-02.mp4"],
}

REQUIRED_ITEM_FIELDS = {
    "id", "title", "description", "price", "category", "available", "featured", "image", "video"
}


def is_excluded(path: Path) -> bool:
    return any(part in EXCLUDED_DIRS for part in path.parts) or path.suffix in EXCLUDED_EXTS


def copy_project_tree(src: Path, dst: Path, *, only_if_newer: bool = False) -> None:
    if not src.exists():
        return
    for path in src.rglob("*"):
        rel = path.relative_to(src)
        if is_excluded(rel):
            continue
        target = dst / rel
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if only_if_newer and target.exists() and target.stat().st_mtime >= path.stat().st_mtime:
                continue
            shutil.copy2(path, target)


def restore_latest_backup() -> None:
    copy_project_tree(BACKUP_DIR, ACTIVE_DIR, only_if_newer=True)


def validate_items_json(data: dict[str, Any]) -> bool:
    items = data.get("items", [])
    if not isinstance(items, list):
        return False
    for item in items:
        if not isinstance(item, dict) or not REQUIRED_ITEM_FIELDS.issubset(item):
            return False
    return True


def safe_write_items_json(data: dict[str, Any]) -> bool:
    if not validate_items_json(data):
        print("[save] JSON validation failed; backup not updated.")
        return False

    ITEMS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp_file = ITEMS_FILE.with_suffix(".json.tmp")
    bak_file = ITEMS_FILE.with_suffix(".json.bak")

    tmp_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if ITEMS_FILE.exists():
        ITEMS_FILE.replace(bak_file)
    tmp_file.replace(ITEMS_FILE)

    backup_target = BACKUP_DIR / "data" / "items.json"
    backup_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ITEMS_FILE, backup_target)
    return True


def mirror_session_updates() -> None:
    for rel in [Path("data/items.json"), Path("main.js")]:
        src = ACTIVE_DIR / rel
        if src.exists():
            dst = BACKUP_DIR / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)

    for rel_dir in [Path("assets/images"), Path("assets/videos")]:
        src_dir = ACTIVE_DIR / rel_dir
        dst_dir = BACKUP_DIR / rel_dir
        dst_dir.mkdir(parents=True, exist_ok=True)
        copy_project_tree(src_dir, dst_dir)


def ensure_structure() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    restore_latest_backup()

    if not ITEMS_FILE.exists():
        safe_write_items_json(DEFAULT_ITEMS)
    else:
        try:
            data = json.loads(ITEMS_FILE.read_text(encoding="utf-8"))
            if not validate_items_json(data):
                safe_write_items_json(DEFAULT_ITEMS)
        except json.JSONDecodeError:
            safe_write_items_json(DEFAULT_ITEMS)

    mirror_session_updates()


def find_available_port(preferred: int = 8888, max_tries: int = 50) -> int:
    for offset in range(max_tries):
        candidate = preferred + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if sock.connect_ex(("127.0.0.1", candidate)) != 0:
                return candidate
    raise RuntimeError("No available port found")


def build_ui(port: int) -> None:
    from nicegui import app, ui

    ui.page_title("RVSITE")
    ui.add_head_html('<style>.nicegui-content{padding:0!important}#webframe-root{width:100vw;min-height:100vh}</style>')
    ui.element("div").props('id="webframe-root"')

    app.add_static_files("/data", str(DATA_DIR))
    app.add_static_files("/assets", str(ASSETS_DIR))
    app.add_static_file(url_path="/main.js", local_file=str(ACTIVE_DIR / "main.js"))
    if (ACTIVE_DIR / "logo.png").exists():
        app.add_static_file(url_path="/logo.png", local_file=str(ACTIVE_DIR / "logo.png"))
    ui.add_body_html('<script src="/main.js"></script>')
    ui.run(host="0.0.0.0", port=port, reload=False, show=False)


def main() -> None:
    ensure_structure()
    port = find_available_port(8888)
    print(f"[run] Launching RVSITE on port {port}")
    build_ui(port)


if __name__ == "__main__":
    main()
