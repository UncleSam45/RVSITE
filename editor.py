#!/usr/bin/env python3
"""Modern PySide6 editor for data/items.json with SQLite-backed history and presets."""

from __future__ import annotations

import importlib.util
import json
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def ensure_dependency(package: str, module_name: str | None = None) -> None:
    module = module_name or package
    if importlib.util.find_spec(module) is None:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])


ensure_dependency("PySide6", "PySide6")

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFormLayout,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QPlainTextEdit,
    QSpinBox,
    QSplitter,
    QStatusBar,
    QVBoxLayout,
    QWidget,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ITEMS_FILE = DATA_DIR / "items.json"
DB_FILE = DATA_DIR / "items_editor.db"


class ItemEditor(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("items.json Editor")
        self.resize(1220, 760)

        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(DB_FILE)
        self.conn.row_factory = sqlite3.Row
        self._create_db()

        self.items_payload = self._load_items_payload()
        self.current_index: int | None = None

        self._build_ui()
        self.refresh_item_list()
        self.load_presets()

    def _build_ui(self) -> None:
        root = QWidget()
        main_layout = QVBoxLayout(root)
        split = QSplitter(Qt.Orientation.Horizontal)

        # Left panel
        left = QWidget()
        left_layout = QVBoxLayout(left)

        self.search = QLineEdit()
        self.search.setPlaceholderText("Search by title/category/id...")
        self.search.textChanged.connect(self.refresh_item_list)
        left_layout.addWidget(self.search)

        self.item_list = QListWidget()
        self.item_list.currentRowChanged.connect(self.on_row_change)
        left_layout.addWidget(self.item_list)

        row = QHBoxLayout()
        self.new_btn = QPushButton("New")
        self.new_btn.clicked.connect(self.clear_form)
        self.clone_btn = QPushButton("Clone")
        self.clone_btn.clicked.connect(self.clone_selected)
        self.delete_btn = QPushButton("Delete")
        self.delete_btn.clicked.connect(self.delete_selected)
        row.addWidget(self.new_btn)
        row.addWidget(self.clone_btn)
        row.addWidget(self.delete_btn)
        left_layout.addLayout(row)

        # Right panel
        right = QWidget()
        right_layout = QVBoxLayout(right)

        preset_group = QGroupBox("Quick presets (from DB history)")
        preset_layout = QGridLayout(preset_group)
        self.category_preset = QComboBox()
        self.pricing_type_preset = QComboBox()
        preset_layout.addWidget(QLabel("Category"), 0, 0)
        preset_layout.addWidget(self.category_preset, 0, 1)
        preset_layout.addWidget(QLabel("Pricing Type"), 1, 0)
        preset_layout.addWidget(self.pricing_type_preset, 1, 1)
        right_layout.addWidget(preset_group)

        form_group = QGroupBox("Item details")
        form_layout = QFormLayout(form_group)

        self.id_edit = QLineEdit()
        self.title_edit = QLineEdit()
        self.desc_edit = QPlainTextEdit()
        self.desc_edit.setFixedHeight(95)
        self.category_edit = QLineEdit()
        self.available_cb = QCheckBox("Available")
        self.featured_cb = QCheckBox("Featured")
        self.image_edit = QLineEdit()
        self.video_edit = QLineEdit()
        self.pricing_type_edit = QLineEdit()

        self.small_spin = QSpinBox(); self.small_spin.setMaximum(100000)
        self.large_spin = QSpinBox(); self.large_spin.setMaximum(100000)
        self.family_edit = QLineEdit()
        self.range_edit = QLineEdit()

        form_layout.addRow("ID", self.id_edit)
        form_layout.addRow("Title", self.title_edit)
        form_layout.addRow("Description", self.desc_edit)
        form_layout.addRow("Category", self.category_edit)
        form_layout.addRow("Image URL", self.image_edit)
        form_layout.addRow("Video URL", self.video_edit)
        form_layout.addRow("Pricing type", self.pricing_type_edit)
        form_layout.addRow("Small meal", self.small_spin)
        form_layout.addRow("Large meal", self.large_spin)
        form_layout.addRow("Family format", self.family_edit)
        form_layout.addRow("Price range", self.range_edit)
        form_layout.addRow(self.available_cb)
        form_layout.addRow(self.featured_cb)
        right_layout.addWidget(form_group)

        action_row = QHBoxLayout()
        self.save_btn = QPushButton("Save to items.json")
        self.save_btn.clicked.connect(self.save_item)
        self.export_btn = QPushButton("Save current menu metadata")
        self.export_btn.clicked.connect(self.save_json)
        action_row.addWidget(self.save_btn)
        action_row.addWidget(self.export_btn)
        right_layout.addLayout(action_row)

        split.addWidget(left)
        split.addWidget(right)
        split.setSizes([380, 840])

        main_layout.addWidget(split)
        self.setCentralWidget(root)

        self.setStatusBar(QStatusBar())

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
            self._write_payload(payload)
            return payload

        with ITEMS_FILE.open("r", encoding="utf-8") as f:
            payload = json.load(f)

        payload.setdefault("items", [])
        payload.setdefault("current_menu", {})
        return payload

    def refresh_item_list(self) -> None:
        self.item_list.clear()
        query = self.search.text().strip().lower()
        for idx, item in enumerate(self.items_payload["items"]):
            line = f"{item.get('title', 'Untitled')}  [{item.get('category', 'No category')}]"
            hay = f"{item.get('id', '')} {line}".lower()
            if query and query not in hay:
                continue
            list_item = QListWidgetItem(line)
            list_item.setData(Qt.ItemDataRole.UserRole, idx)
            self.item_list.addItem(list_item)

    def on_row_change(self, row: int) -> None:
        if row < 0:
            return
        item = self.item_list.item(row)
        if not item:
            return
        idx = item.data(Qt.ItemDataRole.UserRole)
        self.current_index = idx
        self.fill_form(self.items_payload["items"][idx])

    def fill_form(self, item: dict[str, Any]) -> None:
        pricing = item.get("pricing", {}) if isinstance(item.get("pricing"), dict) else {}
        self.id_edit.setText(str(item.get("id", "")))
        self.title_edit.setText(str(item.get("title", "")))
        self.desc_edit.setPlainText(str(item.get("description", "")))
        self.category_edit.setText(str(item.get("category", "")))
        self.available_cb.setChecked(bool(item.get("available", False)))
        self.featured_cb.setChecked(bool(item.get("featured", False)))
        self.image_edit.setText(str(item.get("image", "")))
        self.video_edit.setText(str(item.get("video", "")))
        self.pricing_type_edit.setText(str(item.get("pricing_type", "")))
        self.small_spin.setValue(int(pricing.get("small_meal") or 0))
        self.large_spin.setValue(int(pricing.get("large_meal") or 0))
        self.family_edit.setText(str(pricing.get("family_format", "")))
        self.range_edit.setText(str(pricing.get("price_range", "")))

    def clear_form(self) -> None:
        self.current_index = None
        self.id_edit.clear(); self.title_edit.clear(); self.desc_edit.clear()
        self.category_edit.clear(); self.image_edit.clear(); self.video_edit.clear(); self.pricing_type_edit.clear()
        self.small_spin.setValue(0); self.large_spin.setValue(0); self.family_edit.clear(); self.range_edit.clear()
        self.available_cb.setChecked(True); self.featured_cb.setChecked(False)
        if self.category_preset.currentText():
            self.category_edit.setText(self.category_preset.currentText())
        if self.pricing_type_preset.currentText():
            self.pricing_type_edit.setText(self.pricing_type_preset.currentText())

    def gather_form_item(self) -> dict[str, Any]:
        item = {
            "id": self.id_edit.text().strip(),
            "title": self.title_edit.text().strip(),
            "description": self.desc_edit.toPlainText().strip(),
            "category": self.category_edit.text().strip(),
            "available": self.available_cb.isChecked(),
            "featured": self.featured_cb.isChecked(),
            "image": self.image_edit.text().strip(),
            "video": self.video_edit.text().strip(),
            "pricing_type": self.pricing_type_edit.text().strip(),
            "pricing": {},
        }
        if self.small_spin.value() > 0:
            item["pricing"]["small_meal"] = self.small_spin.value()
        if self.large_spin.value() > 0:
            item["pricing"]["large_meal"] = self.large_spin.value()
        if self.family_edit.text().strip():
            item["pricing"]["family_format"] = self.family_edit.text().strip()
        if self.range_edit.text().strip():
            item["pricing"]["price_range"] = self.range_edit.text().strip()
        return item

    def save_item(self) -> None:
        item = self.gather_form_item()
        if not item["id"] or not item["title"]:
            QMessageBox.warning(self, "Missing info", "ID and Title are required.")
            return

        event = "update" if self.current_index is not None else "create"
        if self.current_index is None:
            self.items_payload["items"].append(item)
            self.current_index = len(self.items_payload["items"]) - 1
        else:
            self.items_payload["items"][self.current_index] = item

        self._write_payload(self.items_payload)
        self._log_event(event, item)
        self.refresh_item_list()
        self.load_presets()
        self.statusBar().showMessage(f"Saved item '{item['title']}'", 3500)

    def delete_selected(self) -> None:
        if self.current_index is None:
            return
        item = self.items_payload["items"].pop(self.current_index)
        self._write_payload(self.items_payload)
        self._log_event("delete", item)
        self.current_index = None
        self.refresh_item_list()
        self.clear_form()
        self.statusBar().showMessage(f"Deleted item '{item.get('title', '')}'", 3500)

    def clone_selected(self) -> None:
        if self.current_index is None:
            return
        base = self.items_payload["items"][self.current_index]
        self.fill_form(base)
        self.id_edit.setText(f"{base.get('id', 'new-item')}-copy")
        self.current_index = None

    def save_json(self) -> None:
        self._write_payload(self.items_payload)
        self.statusBar().showMessage("items.json saved", 2500)

    def _write_payload(self, payload: dict[str, Any]) -> None:
        with ITEMS_FILE.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

    def _log_event(self, event_type: str, item: dict[str, Any]) -> None:
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

    def load_presets(self) -> None:
        def update_combo(combo: QComboBox, values: list[str]) -> None:
            current = combo.currentText()
            combo.clear()
            combo.addItems(values)
            if current and current in values:
                combo.setCurrentText(current)

        categories = [
            row["value"]
            for row in self.conn.execute(
                "SELECT DISTINCT category AS value FROM item_history WHERE category IS NOT NULL AND TRIM(category) <> '' ORDER BY value"
            )
        ]
        pricing_types = [
            row["value"]
            for row in self.conn.execute(
                "SELECT DISTINCT pricing_type AS value FROM item_history WHERE pricing_type IS NOT NULL AND TRIM(pricing_type) <> '' ORDER BY value"
            )
        ]

        # Fall back to existing json values when DB is new
        if not categories:
            categories = sorted({str(i.get("category", "")).strip() for i in self.items_payload["items"] if str(i.get("category", "")).strip()})
        if not pricing_types:
            pricing_types = sorted({str(i.get("pricing_type", "")).strip() for i in self.items_payload["items"] if str(i.get("pricing_type", "")).strip()})

        update_combo(self.category_preset, categories)
        update_combo(self.pricing_type_preset, pricing_types)

    def closeEvent(self, event) -> None:  # type: ignore[override]
        try:
            self.conn.close()
        finally:
            super().closeEvent(event)


def main() -> None:
    app = QApplication(sys.argv)
    app.setStyleSheet(
        """
        QWidget { font-family: Inter, Segoe UI, Arial; font-size: 13px; }
        QMainWindow { background: #f6f7fb; }
        QGroupBox { border: 1px solid #d8dfef; border-radius: 12px; margin-top: 10px; background: white; }
        QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; color: #2f3950; }
        QPushButton { background: #3558e6; color: white; border-radius: 8px; padding: 8px 12px; }
        QPushButton:hover { background: #2d4cd0; }
        QLineEdit, QPlainTextEdit, QComboBox, QSpinBox, QListWidget {
            background: white; border: 1px solid #cfd7eb; border-radius: 8px; padding: 6px;
        }
        """
    )
    win = ItemEditor()
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
