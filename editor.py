#!/usr/bin/env python3
"""NiceGUI menu manager for La cuisine de Rosalie.

Edits the structured static data files used by the public site and keeps a
SQLite audit history for menu/settings/delivery/promotion/item changes.
"""

from __future__ import annotations

import hashlib
import inspect
import importlib.util
import json
import os
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageOps
except ImportError:  # installed at runtime by ensure_dependencies
    Image = None
    ImageOps = None

REQUIRED_PACKAGES = ["nicegui", "pillow"]
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "assets" / "data"
LEGACY_DATA_DIR = BASE_DIR / "data"
DB_FILE = LEGACY_DATA_DIR / "items_editor.db"
IMAGES_DIR = BASE_DIR / "assets" / "images"
TEMP_UPLOAD_DIR = LEGACY_DATA_DIR / "temp_uploads"
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
GALLERY_STATUSES = {
    "current": "Disponible cette semaine",
    "past": "Création passée",
    "catering": "Traiteur",
    "custom": "Sur demande",
    "seasonal": "Saisonnier",
}
FILES = {
    "settings": DATA_DIR / "settings.json",
    "menus": DATA_DIR / "menus.json",
    "items": DATA_DIR / "items.json",
    "delivery": DATA_DIR / "delivery.json",
    "promotions": DATA_DIR / "promotions.json",
    "content": DATA_DIR / "content.json",
    "gallery": DATA_DIR / "gallery.json",
}
PUBLIC_SITE_DATA_FILES = ", ".join(
    path.relative_to(BASE_DIR).as_posix() for path in FILES.values()
)
PUBLISH_HELP_TEXT = (
    "Important: the editor saves this local checkout only. The public site reads "
    f"{PUBLIC_SITE_DATA_FILES} plus files in assets/images/. If the live website "
    "is hosted elsewhere, you must commit/deploy or upload those changed files "
    "after saving; data/items.json and the editor database are not used by the "
    "public page."
)


def module_installed(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def ensure_dependencies(packages: list[str]) -> None:
    module_aliases = {"pillow": "PIL"}
    for package in packages:
        package_name = package.split("==")[0]
        module_name = module_aliases.get(package_name.lower(), package_name.replace("-", "_"))
        if not module_installed(module_name):
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])


def clean(value: Any) -> str:
    return str(value or "").strip()


def slugify(value: Any, fallback: str = "image") -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", str(value or "").lower()).strip("-")
    return slug or fallback


def project_path(path: str) -> Path:
    return BASE_DIR / path.replace("/", os.sep)


def relative_asset_path(path: Path) -> str:
    return path.relative_to(BASE_DIR).as_posix()


def upload_event_file(event: Any) -> Any:
    return getattr(event, "file", event)


def upload_event_name(event: Any) -> str:
    for source in (event, upload_event_file(event)):
        for attribute in ("filename", "name"):
            value = clean(getattr(source, attribute, ""))
            if value:
                return value
    return ""


async def read_upload_bytes(source: Any) -> bytes | None:
    if source is None:
        return None
    if isinstance(source, bytes | bytearray):
        return bytes(source)

    file_obj = getattr(source, "file", None)
    if file_obj is not None and file_obj is not source:
        data = await read_upload_bytes(file_obj)
        if data is not None:
            return data

    for attribute in ("content", "_data"):
        data = await read_upload_bytes(getattr(source, attribute, None))
        if data is not None:
            return data

    read = getattr(source, "read", None)
    if callable(read):
        seek = getattr(source, "seek", None)
        if callable(seek):
            seek(0)
        data = read()
        if inspect.isawaitable(data):
            data = await data
        if isinstance(data, bytes | bytearray):
            return bytes(data)
    return None


async def upload_event_bytes(event: Any) -> bytes:
    for source in (event, upload_event_file(event)):
        data = await read_upload_bytes(source)
        if data:
            return data
    raise ValueError("Impossible de lire le fichier téléversé.")


def is_external_path(path: str) -> bool:
    return path.startswith(("http://", "https://", "//"))


def get_documents_dir() -> Path:
    if sys.platform.startswith("win"):
        return Path.home() / "Documents"
    return Path.home() / "Documents"


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


def public_data_warnings(data_dir: Path) -> list[str]:
    """Return warnings when a public data directory is missing meaningful site data.

    The backup is meant to protect real menu content from being overwritten by
    empty JSON files after a fresh pull/deploy. Valid JSON alone is not enough:
    the core business settings, item list, and active menu references must also
    contain data before we trust a folder as a backup source or destination.
    """
    warnings: list[str] = []

    def load_required(filename: str) -> dict[str, Any] | None:
        path = data_dir / filename
        if not path.exists():
            warnings.append(f"Fichier backup manquant: {path}")
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            warnings.append(f"JSON invalide: {path} ({exc})")
            return None
        if not isinstance(payload, dict):
            warnings.append(f"JSON inattendu: {path}")
            return None
        return payload

    settings = load_required("settings.json")
    menus = load_required("menus.json")
    items = load_required("items.json")

    if settings is not None:
        business = settings.get("business") if isinstance(settings.get("business"), dict) else {}
        if not clean(business.get("name")) and not clean(business.get("phone")):
            warnings.append("Backup ignoré: settings.json ne contient pas de nom ou téléphone d’entreprise.")

    if items is not None:
        item_list = items.get("items")
        if not isinstance(item_list, list) or not item_list:
            warnings.append("Backup ignoré: items.json ne contient aucun item de menu.")
        elif not any(clean(item.get("id")) and clean(item.get("title")) for item in item_list if isinstance(item, dict)):
            warnings.append("Backup ignoré: items.json ne contient aucun item utilisable.")

    if menus is not None:
        current_menu = menus.get("current_menu") if isinstance(menus.get("current_menu"), dict) else {}
        menu_ids = current_menu.get("item_ids") if isinstance(current_menu.get("item_ids"), list) else []
        extra_ids = current_menu.get("extra_ids") if isinstance(current_menu.get("extra_ids"), list) else []
        if not menu_ids and not extra_ids:
            warnings.append("Backup ignoré: menus.json ne contient aucun item actif ou extra actif.")

    for filename in ["delivery.json", "promotions.json", "content.json", "gallery.json"]:
        path = data_dir / filename
        if not path.exists():
            continue
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            warnings.append(f"JSON invalide: {path} ({exc})")

    return warnings


def copy_tree_contents(source: Path, target: Path) -> None:
    if not source.exists():
        return
    if source.is_file():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        return
    target.mkdir(parents=True, exist_ok=True)
    for child in source.iterdir():
        if child.name in {"__pycache__", "temp_uploads"}:
            continue
        if child.is_dir():
            copy_tree_contents(child, target / child.name)
        else:
            (target / child.name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(child, target / child.name)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def process_image_variants(source_path: Path, output_dir: Path, base_name: str = "original") -> dict[str, Path]:
    if source_path.suffix.lower() not in ALLOWED_IMAGE_EXTS:
        raise ValueError("Format d’image non supporté. Utilisez JPG, PNG ou WebP.")
    if Image is None or ImageOps is None:
        raise RuntimeError("Pillow n’est pas disponible pour traiter les images.")
    output_dir.mkdir(parents=True, exist_ok=True)
    original_ext = source_path.suffix.lower().replace(".jpeg", ".jpg")
    original_path = output_dir / f"original{original_ext}"
    if source_path.resolve() != original_path.resolve():
        shutil.copy2(source_path, original_path)

    image = Image.open(source_path)
    image = ImageOps.exif_transpose(image).convert("RGB")
    variants = {
        "thumb": {"width": 480, "quality": 82},
        "card": {"width": 900, "quality": 86},
        "hero": {"width": 1600, "quality": 88},
    }
    result = {"original": original_path}
    for name, config in variants.items():
        img = image.copy()
        width = int(config["width"])
        if img.width > width:
            height = int(img.height * (width / img.width))
            img = img.resize((width, height), Image.LANCZOS)
        out_path = output_dir / f"{name}.webp"
        img.save(out_path, "WEBP", quality=int(config["quality"]), method=6)
        result[name] = out_path
    return result


class BackupManager:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.documents_dir = get_documents_dir()
        self.backup_root = self.documents_dir / "La Cuisine de Rosalie" / "backups"
        self.latest_dir = self.backup_root / "latest"
        self.snapshots_dir = self.backup_root / "snapshots"
        self.staging_dir = self.backup_root / ".staging"
        self.save_counter_file = self.backup_root / ".save_counter"
        self.last_status = "Aucune action de sauvegarde effectuée."
        self.last_backup_time = ""
        self.restore_status = "Restauration non exécutée."

    def validate_backup(self, backup_dir: Path) -> tuple[bool, list[str]]:
        warnings: list[str] = []
        data_dir = backup_dir / "assets" / "data"
        if not backup_dir.exists():
            return False, ["Le dossier de sauvegarde latest est absent."]
        if not data_dir.exists():
            return False, [f"Dossier data backup manquant: {data_dir}"]
        required_files = {"settings", "menus", "items"}
        for filename in FILES:
            path = data_dir / f"{filename}.json"
            if not path.exists():
                if filename in required_files:
                    warnings.append(f"JSON backup manquant: assets/data/{filename}.json")
                continue
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                warnings.append(f"JSON backup invalide: assets/data/{filename}.json ({exc})")
        return not warnings, warnings

    def validate_project_data(self) -> tuple[bool, list[str]]:
        warnings: list[str] = []
        for name, path in FILES.items():
            if not path.exists():
                if name == "gallery":
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(json.dumps({"slides": []}, indent=2, ensure_ascii=False), encoding="utf-8")
                    continue
                warnings.append(f"Fichier manquant: {relative_asset_path(path)}")
                continue
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                warnings.append(f"JSON local invalide: {relative_asset_path(path)} ({exc})")
        warnings.extend(public_data_warnings(DATA_DIR))
        return not warnings, warnings

    def restore_on_launch(self) -> tuple[bool, str]:
        ok, warnings = self.validate_backup(self.latest_dir)
        if not ok:
            self.restore_status = "Restauration ignorée: " + "; ".join(warnings)
            return False, self.restore_status
        try:
            copy_tree_contents(self.latest_dir / "assets" / "data", DATA_DIR)
            copy_tree_contents(self.latest_dir / "assets" / "images", IMAGES_DIR)
            copy_tree_contents(self.latest_dir / "data" / "items_editor.db", DB_FILE)
            copy_tree_contents(self.latest_dir / "data" / "logs", LEGACY_DATA_DIR / "logs")
            if not FILES["gallery"].exists():
                FILES["gallery"].write_text(json.dumps({"slides": []}, indent=2, ensure_ascii=False), encoding="utf-8")
            self.restore_status = f"Restauration latest réussie depuis {self.latest_dir}"
            return True, self.restore_status
        except Exception as exc:
            self.restore_status = f"Restauration impossible: {exc}"
            return False, self.restore_status

    def _manifest_files(self, root: Path) -> list[dict[str, Any]]:
        files: list[dict[str, Any]] = []
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.name != "manifest.json":
                rel = path.relative_to(root).as_posix()
                files.append({"path": rel, "sha256": sha256_file(path), "size": path.stat().st_size})
        return files

    def backup_now(self, reason: str = "save") -> tuple[bool, str]:
        ok, warnings = self.validate_project_data()
        if not ok:
            self.last_status = "Sauvegarde ignorée: " + "; ".join(warnings)
            return False, self.last_status
        try:
            self.backup_root.mkdir(parents=True, exist_ok=True)
            self.snapshots_dir.mkdir(parents=True, exist_ok=True)
            if self.staging_dir.exists():
                shutil.rmtree(self.staging_dir)
            self.staging_dir.mkdir(parents=True, exist_ok=True)
            copy_tree_contents(DATA_DIR, self.staging_dir / "assets" / "data")
            copy_tree_contents(IMAGES_DIR, self.staging_dir / "assets" / "images")
            if DB_FILE.exists():
                copy_tree_contents(DB_FILE, self.staging_dir / "data" / "items_editor.db")
            logs_dir = LEGACY_DATA_DIR / "logs"
            if logs_dir.exists():
                copy_tree_contents(logs_dir, self.staging_dir / "data" / "logs")
            manifest = {
                "app": "La Cuisine de Rosalie RVSITE",
                "version": 1,
                "reason": reason,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source_project": str(self.base_dir),
                "files": self._manifest_files(self.staging_dir),
            }
            (self.staging_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
            valid, staged_warnings = self.validate_backup(self.staging_dir)
            if not valid:
                self.last_status = "Sauvegarde staging invalide: " + "; ".join(staged_warnings)
                return False, self.last_status
            replace_dir = self.backup_root / ".latest_replacing"
            if replace_dir.exists():
                shutil.rmtree(replace_dir)
            if self.latest_dir.exists():
                self.latest_dir.rename(replace_dir)
            self.staging_dir.rename(self.latest_dir)
            if replace_dir.exists():
                shutil.rmtree(replace_dir)
            self.last_backup_time = manifest["created_at"]
            self.last_status = f"Sauvegarde latest réussie ({reason})."
            counter = 0
            if self.save_counter_file.exists():
                counter = int(self.save_counter_file.read_text(encoding="utf-8") or "0")
            counter += 1
            self.save_counter_file.write_text(str(counter), encoding="utf-8")
            if counter % 10 == 0:
                self.create_snapshot()
            return True, self.last_status
        except Exception as exc:
            self.last_status = f"Sauvegarde impossible: {exc}"
            return False, self.last_status

    def create_snapshot(self) -> tuple[bool, str]:
        ok, warnings = self.validate_backup(self.latest_dir)
        if not ok:
            return False, "Snapshot ignoré: " + "; ".join(warnings)
        try:
            self.snapshots_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            zip_path = self.snapshots_dir / f"{stamp}.zip"
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
                for path in self.latest_dir.rglob("*"):
                    if path.is_file():
                        archive.write(path, path.relative_to(self.latest_dir).as_posix())
            snapshots = sorted(self.snapshots_dir.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
            for old in snapshots[20:]:
                old.unlink(missing_ok=True)
            self.last_status = f"Snapshot créé: {zip_path}"
            return True, self.last_status
        except Exception as exc:
            return False, f"Snapshot impossible: {exc}"

    def snapshot_count(self) -> int:
        return len(list(self.snapshots_dir.glob("*.zip"))) if self.snapshots_dir.exists() else 0


class DataStore:
    def __init__(self, backup_manager: BackupManager | None = None) -> None:
        self.backup_manager = backup_manager
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        LEGACY_DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(DB_FILE)
        self.conn.row_factory = sqlite3.Row
        self._create_db()
        self.payloads = self.load_all()
        self.migrate_item_schema(save=False)

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
            "gallery": read_json(FILES["gallery"], {"slides": []}),
        }

    def write(self, name: str, event_type: str, backup: bool = True) -> None:
        FILES[name].parent.mkdir(parents=True, exist_ok=True)
        FILES[name].write_text(json.dumps(self.payloads[name], indent=2, ensure_ascii=False), encoding="utf-8")
        if name == "items":
            (LEGACY_DATA_DIR / "items.json").write_text(json.dumps(self.payloads[name], indent=2, ensure_ascii=False), encoding="utf-8")
        self.log_event(event_type, {"id": name, "title": name, "category": name, "pricing_type": "", "payload": self.payloads[name]})
        if backup and self.backup_manager:
            self.backup_manager.backup_now(event_type)

    def write_all(self) -> None:
        for name in FILES:
            self.write(name, f"{name}_update", backup=False)
        if self.backup_manager:
            self.backup_manager.backup_now("save_all")

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


    def migrate_item_schema(self, save: bool = True) -> None:
        changed = False
        for item in self.payloads.get("items", {}).get("items", []):
            if "showcase" not in item:
                item["showcase"] = bool(item.get("featured", False))
                changed = True
            image = clean(item.get("image"))
            if image and not item.get("images") and not is_external_path(image) and image.startswith("assets/images/"):
                image_path = project_path(image)
                stem_dir = image_path.parent
                item["images"] = {
                    "original": image,
                    "thumb": relative_asset_path(stem_dir / "thumb.webp"),
                    "card": relative_asset_path(stem_dir / "card.webp"),
                    "hero": relative_asset_path(stem_dir / "hero.webp"),
                }
                changed = True
        if changed and save:
            self.write("items", "item_schema_migration")

    def find_item(self, item_id: str) -> tuple[int | None, dict[str, Any] | None]:
        for index, item in enumerate(self.payloads.get("items", {}).get("items", [])):
            if item.get("id") == item_id:
                return index, item
        return None, None

    def update_item_image(self, item_id: str, uploaded_path: Path) -> dict[str, str]:
        index, item = self.find_item(item_id)
        if index is None or item is None:
            raise ValueError("Enregistrez l’item avec un ID valide avant d’ajouter une image.")
        safe_id = slugify(item_id, "item")
        variants = process_image_variants(uploaded_path, IMAGES_DIR / "items" / safe_id, safe_id)
        paths = {key: relative_asset_path(value) for key, value in variants.items()}
        item["image"] = paths["card"]
        item["images"] = paths
        self.payloads["items"]["items"][index] = item
        self.write("items", "item_image_upload")
        return paths

    def update_gallery_image(self, slide_id: str, uploaded_path: Path) -> dict[str, str]:
        slide = next((entry for entry in self.payloads["gallery"].setdefault("slides", []) if entry.get("id") == slide_id), None)
        if not slide:
            raise ValueError("Enregistrez la slide avec un ID valide avant d’ajouter une image.")
        safe_id = slugify(slide_id, "gallery")
        variants = process_image_variants(uploaded_path, IMAGES_DIR / "gallery" / safe_id, safe_id)
        paths = {key: relative_asset_path(value) for key, value in variants.items()}
        slide["image"] = paths["hero"]
        slide["thumb"] = paths["thumb"]
        slide["images"] = paths
        self.write("gallery", "gallery_image_upload")
        return paths

    def validate_and_migrate_images(self) -> tuple[bool, str]:
        report: list[dict[str, Any]] = []
        changed = False
        for item in self.payloads["items"].get("items", []):
            image = clean(item.get("image"))
            item_id = clean(item.get("id"))
            if not image or not item_id:
                continue
            if is_external_path(image):
                item["external_image"] = image
                report.append({"item_id": item_id, "status": "external_marked", "image": image})
                changed = True
                continue
            source = project_path(image) if not Path(image).is_absolute() else Path(image)
            if source.exists() and not image.startswith(f"assets/images/items/{slugify(item_id)}/"):
                try:
                    variants = process_image_variants(source, IMAGES_DIR / "items" / slugify(item_id), slugify(item_id))
                    paths = {key: relative_asset_path(value) for key, value in variants.items()}
                    item["image"] = paths["card"]
                    item["images"] = paths
                    report.append({"item_id": item_id, "status": "migrated", "image": paths["card"]})
                    changed = True
                except Exception as exc:
                    report.append({"item_id": item_id, "status": "failed", "error": str(exc)})
            else:
                report.append({"item_id": item_id, "status": "missing_or_already_local", "image": image})
        logs_dir = LEGACY_DATA_DIR / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        (logs_dir / "image_migration_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        if changed:
            self.write("items", "image_migration")
        return changed, f"Rapport créé avec {len(report)} entrée(s)."

    def validate(self) -> list[str]:
        warnings: list[str] = []
        menu = self.payloads["menus"].get("current_menu", {})
        items = self.payloads["items"].get("items", [])
        gallery = self.payloads.get("gallery", {}).get("slides", [])
        item_ids = {item.get("id") for item in items}
        if not menu.get("title"):
            warnings.append("Le menu courant n’a pas de titre.")
        if not menu.get("start_date") or not menu.get("end_date"):
            warnings.append("Le menu courant doit avoir une date de début et de fin.")
        else:
            try:
                if datetime.fromisoformat(menu["start_date"]) > datetime.fromisoformat(menu["end_date"]):
                    warnings.append("La période du menu est invalide: début après la fin.")
            except ValueError:
                warnings.append("Les dates du menu doivent être au format YYYY-MM-DD.")
        if menu.get("active", True) and not menu.get("item_ids"):
            warnings.append("Le menu actif n’a aucun plat principal sélectionné.")
        for selected_id in menu.get("item_ids", []) + menu.get("extra_ids", []):
            if selected_id not in item_ids:
                warnings.append(f"L’item sélectionné est introuvable: {selected_id}")
        for item in items:
            label = item.get("title") or item.get("id") or "item sans titre"
            if not item.get("id") or not item.get("title"):
                warnings.append("Un item est incomplet (ID ou titre manquant).")
            image = clean(item.get("image"))
            if not image:
                warnings.append(f"Image manquante pour {label}")
            elif is_external_path(image):
                pass
            elif image.startswith("assets/images/"):
                if not project_path(image).exists():
                    warnings.append(f"Fichier image introuvable pour {label}: {image}")
            elif image.startswith("assets/"):
                warnings.append(f"Image hors assets/images pour {label}: {image}")
            for portion, price in (item.get("pricing") or {}).items():
                if not isinstance(price, (int, float)) or price <= 0:
                    warnings.append(f"Prix invalide pour {label} / {portion}.")
            if item.get("available", True) and not item.get("pricing"):
                warnings.append(f"Item disponible sans prix: {label}")
        seen_sorts: dict[int, str] = {}
        for slide in gallery:
            slide_id = clean(slide.get("id"))
            title = clean(slide.get("title"))
            image = clean(slide.get("image"))
            status = clean(slide.get("status") or "custom")
            label = title or slide_id or "slide sans titre"
            if not slide_id:
                warnings.append("Une slide galerie n’a pas d’ID.")
            if not title:
                warnings.append(f"Titre manquant pour la slide galerie {slide_id}.")
            if status not in GALLERY_STATUSES:
                warnings.append(f"Statut galerie invalide pour {label}: {status}")
            sort = number(slide.get("sort"))
            if sort in seen_sorts:
                warnings.append(f"Ordre de tri galerie dupliqué: {sort} ({seen_sorts[sort]} / {label})")
            seen_sorts[sort] = label
            if not image:
                warnings.append(f"Image galerie manquante pour {label}.")
            elif not is_external_path(image) and image.startswith("assets/images/") and not project_path(image).exists():
                warnings.append(f"Image galerie introuvable pour {label}: {image}")
            if slide.get("enabled", True) and not image:
                warnings.append(f"Slide galerie activée sans image: {label}")
        if self.backup_manager:
            ok, backup_warnings = self.backup_manager.validate_backup(self.backup_manager.latest_dir)
            if not ok:
                warnings.extend([f"Backup: {warning}" for warning in backup_warnings])
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
    gallery_payload = store.payloads["gallery"]
    backup_manager = store.backup_manager

    selected_item: dict[str, Any] = {"index": None}
    item_list = None
    warnings_box = None
    backup_status_box = None
    item_preview_box = None
    gallery_preview_box = None

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
        if backup_manager and not backup_manager.last_status.startswith("Sauvegarde latest réussie"):
            ui.notify(backup_manager.last_status, type="warning")
        else:
            ui.notify(
                "Données sauvegardées localement. Déployez/committez ces fichiers "
                "pour mettre à jour le site public.",
                type="positive",
            )

    def export_static() -> None:
        store.write_all()
        ui.notify(
            f"Données exportées dans {DATA_DIR}. Déployez/committez assets/data "
            "et assets/images pour le site en ligne.",
            type="positive",
        )

    with ui.column().classes("shell w-full").style("gap:16px"):
        with ui.row().classes("w-full items-center justify-between"):
            with ui.column().style("gap:2px"):
                ui.label("Menu Manager").classes("text-h4 text-weight-bold")
                ui.label("Réglages, menu courant, items, livraison et promotions pour La cuisine de Rosalie.").classes("muted")
                ui.label(PUBLISH_HELP_TEXT).classes("warning text-weight-bold")
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
            gallery_tab = ui.tab("Gallery / Homepage")
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
                    return {"id": "", "title": "", "description": "", "category": "Plats principaux", "available": True, "featured": False, "showcase": False, "image": "", "images": {}, "pricing": {"petit": 8, "grand": 10, "familial": 23}, "tags": []}

                def fill_item_form(item: dict[str, Any]) -> None:
                    item_form["id"].value = item.get("id", "")
                    item_form["title"].value = item.get("title", "")
                    item_form["description"].value = item.get("description", "")
                    item_form["category"].value = item.get("category", "")
                    item_form["image"].value = item.get("image", "")
                    item_form["available"].value = item.get("available", True)
                    item_form["featured"].value = item.get("featured", False)
                    item_form["showcase"].value = item.get("showcase", False)
                    update_item_preview(item)
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
                        "showcase": bool(item_form["showcase"].value),
                        "image": clean(item_form["image"].value),
                        "pricing": pricing,
                        "tags": [clean(tag) for tag in clean(item_form["tags"].value).split(",") if clean(tag)],
                    }
                    existing = items_payload.get("items", [])[selected_item["index"]] if selected_item["index"] is not None and selected_item["index"] < len(items_payload.get("items", [])) else {}
                    if existing.get("images") and item["image"] == existing.get("image"):
                        item["images"] = existing.get("images")
                    return item

                def update_item_preview(item: dict[str, Any] | None = None) -> None:
                    if item_preview_box is None:
                        return
                    item_preview_box.clear()
                    image = clean((item or gather_item()).get("image"))
                    with item_preview_box:
                        if image:
                            ui.image(image).classes("w-full").style("max-height:220px;object-fit:cover;border-radius:14px")
                            ui.label(image).classes("muted")
                        else:
                            ui.label("Aucune image — téléversez une photo ou entrez un chemin avancé.").classes("warning")

                def remove_item_image() -> None:
                    item_form["image"].value = ""
                    index = selected_item["index"]
                    if index is not None:
                        items_payload["items"][index].pop("images", None)
                        items_payload["items"][index]["image"] = ""
                        store.write("items", "item_image_remove")
                    update_item_preview({"image": ""})
                    ui.notify("Image retirée de l’item", type="warning")

                async def upload_item_image(event: Any) -> None:
                    item_id = clean(item_form["id"].value)
                    if not item_id:
                        ui.notify("Entrez et sauvegardez d’abord un ID d’item.", type="negative")
                        return
                    index, _ = store.find_item(item_id)
                    if index is None:
                        save_item()
                        index, _ = store.find_item(item_id)
                    if index is None:
                        ui.notify("Impossible de trouver l’item pour l’image.", type="negative")
                        return
                    upload_name = upload_event_name(event)
                    ext = Path(upload_name).suffix.lower()
                    if ext not in ALLOWED_IMAGE_EXTS:
                        ui.notify("Format non supporté: JPG, PNG ou WebP seulement.", type="negative")
                        return
                    TEMP_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
                    temp_path = TEMP_UPLOAD_DIR / f"{slugify(item_id)}{ext}"
                    try:
                        temp_path.write_bytes(await upload_event_bytes(event))
                        paths = store.update_item_image(item_id, temp_path)
                    except Exception as exc:
                        ui.notify(str(exc), type="negative")
                        return
                    selected_item["index"] = index
                    fill_item_form(items_payload["items"][index])
                    refresh_items()
                    ui.notify(f"Image optimisée: {paths['card']}", type="positive")

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
                            item_form["image"] = ui.input("Manual image path (advanced)").on("change", lambda: update_item_preview())
                            item_form["tags"] = ui.input("Tags comma-separated")
                            item_form["petit"] = ui.number("Petit", min=0, precision=0)
                            item_form["grand"] = ui.number("Grand", min=0, precision=0)
                            item_form["familial"] = ui.number("Familial", min=0, precision=0)
                            item_form["standard"] = ui.number("Standard", min=0, precision=0)
                            item_form["available"] = ui.switch("Available", value=True)
                            item_form["featured"] = ui.switch("Use as featured homepage/menu image", value=False)
                            item_form["showcase"] = ui.switch("Show in homepage showcase", value=False)
                        ui.label("Image preview & upload").classes("section-title")
                        item_preview_box = ui.column().classes("w-full")
                        with ui.row().style("gap:8px"):
                            ui.upload(on_upload=upload_item_image, label="Upload / replace image", auto_upload=True).props("accept=image/jpeg,image/png,image/webp")
                            ui.button("Remove image", on_click=remove_item_image).props("outline color=red")
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

            with ui.tab_panel(gallery_tab):
                gallery_form: dict[str, Any] = {}
                selected_slide: dict[str, Any] = {"index": None}
                slide_list = None

                def empty_slide() -> dict[str, Any]:
                    return {
                        "id": "", "title": "", "subtitle": "", "image": "", "thumb": "", "linked_item_id": "",
                        "status": "past", "badge": GALLERY_STATUSES["past"], "cta_label": "Voir le menu actuel",
                        "cta_page": "menu", "enabled": True, "sort": 10,
                    }

                def update_gallery_preview(slide: dict[str, Any] | None = None) -> None:
                    if gallery_preview_box is None:
                        return
                    gallery_preview_box.clear()
                    data = slide or gather_slide()
                    with gallery_preview_box:
                        if data.get("image"):
                            ui.image(data["image"]).classes("w-full").style("max-height:260px;object-fit:cover;border-radius:16px")
                        ui.label(data.get("badge") or GALLERY_STATUSES.get(data.get("status"), "Slide")).classes("section-title")
                        ui.label(data.get("title") or "Titre de la slide")
                        ui.label(data.get("subtitle") or "Sous-titre").classes("muted")

                def fill_slide_form(slide: dict[str, Any]) -> None:
                    gallery_form["id"].value = slide.get("id", "")
                    gallery_form["title"].value = slide.get("title", "")
                    gallery_form["subtitle"].value = slide.get("subtitle", "")
                    gallery_form["image"].value = slide.get("image", "")
                    gallery_form["thumb"].value = slide.get("thumb", "")
                    gallery_form["linked_item_id"].value = slide.get("linked_item_id", "")
                    gallery_form["status"].value = slide.get("status", "past")
                    gallery_form["badge"].value = slide.get("badge") or GALLERY_STATUSES.get(slide.get("status", "past"), "")
                    gallery_form["cta_label"].value = slide.get("cta_label", "")
                    gallery_form["cta_page"].value = slide.get("cta_page", "menu")
                    gallery_form["enabled"].value = slide.get("enabled", True)
                    gallery_form["sort"].value = number(slide.get("sort"))
                    update_gallery_preview(slide)

                def gather_slide() -> dict[str, Any]:
                    status = clean(gallery_form["status"].value) or "custom"
                    return {
                        "id": clean(gallery_form["id"].value),
                        "title": clean(gallery_form["title"].value),
                        "subtitle": clean(gallery_form["subtitle"].value),
                        "image": clean(gallery_form["image"].value),
                        "thumb": clean(gallery_form["thumb"].value),
                        "linked_item_id": clean(gallery_form["linked_item_id"].value),
                        "status": status,
                        "badge": clean(gallery_form["badge"].value) or GALLERY_STATUSES.get(status, ""),
                        "cta_label": clean(gallery_form["cta_label"].value),
                        "cta_page": clean(gallery_form["cta_page"].value),
                        "enabled": bool(gallery_form["enabled"].value),
                        "sort": number(gallery_form["sort"].value),
                    }

                def refresh_slides() -> None:
                    slide_list.clear()
                    slides = sorted(enumerate(gallery_payload.setdefault("slides", [])), key=lambda pair: number(pair[1].get("sort")))
                    for index, slide in slides:
                        def select_slide(i=index) -> None:
                            selected_slide["index"] = i
                            fill_slide_form(gallery_payload["slides"][i])
                        ui.button(f"{slide.get('sort', 0)} · {slide.get('title') or slide.get('id') or 'Slide'}", on_click=select_slide).classes("w-full").props("flat color=brown-8")

                def new_slide() -> None:
                    selected_slide["index"] = None
                    fill_slide_form(empty_slide())

                def save_slide() -> None:
                    slide = gather_slide()
                    if not slide["id"] or not slide["title"]:
                        ui.notify("ID et titre de slide requis", type="negative")
                        return
                    existing = gallery_payload.setdefault("slides", [])
                    if selected_slide["index"] is None:
                        existing.append(slide)
                        selected_slide["index"] = len(existing) - 1
                        event = "gallery_slide_create"
                    else:
                        old = existing[selected_slide["index"]]
                        if old.get("images") and slide["image"] == old.get("image"):
                            slide["images"] = old.get("images")
                        existing[selected_slide["index"]] = slide
                        event = "gallery_slide_update"
                    store.write("gallery", event)
                    refresh_slides()
                    update_gallery_preview(slide)
                    ui.notify("Slide galerie sauvegardée", type="positive")

                def delete_slide() -> None:
                    index = selected_slide["index"]
                    if index is None:
                        ui.notify("Sélectionnez une slide", type="warning")
                        return
                    gallery_payload["slides"].pop(index)
                    selected_slide["index"] = None
                    store.write("gallery", "gallery_slide_delete")
                    refresh_slides()
                    new_slide()

                async def upload_gallery_image(event: Any) -> None:
                    slide_id = clean(gallery_form["id"].value)
                    if not slide_id:
                        ui.notify("Entrez et sauvegardez d’abord un ID de slide.", type="negative")
                        return
                    if selected_slide["index"] is None:
                        save_slide()
                    upload_name = upload_event_name(event)
                    ext = Path(upload_name).suffix.lower()
                    if ext not in ALLOWED_IMAGE_EXTS:
                        ui.notify("Format non supporté: JPG, PNG ou WebP seulement.", type="negative")
                        return
                    TEMP_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
                    temp_path = TEMP_UPLOAD_DIR / f"gallery-{slugify(slide_id)}{ext}"
                    try:
                        temp_path.write_bytes(await upload_event_bytes(event))
                        paths = store.update_gallery_image(slide_id, temp_path)
                    except Exception as exc:
                        ui.notify(str(exc), type="negative")
                        return
                    slide = next((entry for entry in gallery_payload["slides"] if entry.get("id") == slide_id), None)
                    if slide:
                        fill_slide_form(slide)
                    refresh_slides()
                    ui.notify(f"Image galerie optimisée: {paths['hero']}", type="positive")

                with ui.row().classes("w-full").style("gap:14px"):
                    with ui.column().classes("card").style("width:32%; gap:8px"):
                        ui.label("Gallery slides").classes("section-title")
                        slide_list = ui.column().classes("w-full").style("max-height:60vh;overflow:auto")
                        with ui.row().style("gap:8px"):
                            ui.button("New slide", on_click=new_slide).props("color=brown-7")
                            ui.button("Delete", on_click=delete_slide).props("outline color=red")
                    with ui.column().classes("card").style("width:68%; gap:12px"):
                        with ui.grid(columns=2).classes("w-full").style("gap:10px"):
                            gallery_form["id"] = ui.input("ID")
                            gallery_form["enabled"] = ui.switch("Enabled", value=True)
                            gallery_form["title"] = ui.input("Title")
                            gallery_form["sort"] = ui.number("Sort", min=0, precision=0)
                            gallery_form["subtitle"] = ui.textarea("Subtitle")
                            gallery_form["status"] = ui.select(list(GALLERY_STATUSES.keys()), value="past", label="Status")
                            gallery_form["badge"] = ui.input("Badge")
                            gallery_form["linked_item_id"] = ui.select([""] + item_options(), value="", label="Linked item (optional)")
                            gallery_form["cta_label"] = ui.input("CTA label")
                            gallery_form["cta_page"] = ui.select(["menu", "commander", "contact", "traiteur", "livraison", "home"], value="menu", label="CTA destination")
                            gallery_form["image"] = ui.input("Manual hero image path")
                            gallery_form["thumb"] = ui.input("Manual thumb image path")
                        ui.label("Slide preview & image upload").classes("section-title")
                        gallery_preview_box = ui.column().classes("w-full")
                        with ui.row().style("gap:8px"):
                            ui.upload(on_upload=upload_gallery_image, label="Upload gallery image", auto_upload=True).props("accept=image/jpeg,image/png,image/webp")
                            ui.button("Save slide", on_click=save_slide).props("color=green")
                refresh_slides()
                new_slide()

            with ui.tab_panel(validation_tab):
                def refresh_backup_status() -> None:
                    if backup_status_box is None:
                        return
                    backup_status_box.clear()
                    with backup_status_box:
                        if not backup_manager:
                            ui.label("Backup manager indisponible.").classes("warning")
                            return
                        ui.label(f"Restore startup: {backup_manager.restore_status}").classes("muted")
                        ui.label(f"Dernier backup: {backup_manager.last_backup_time or 'pas encore'}")
                        ui.label(f"Statut: {backup_manager.last_status}")
                        ui.label(f"Dossier: {backup_manager.latest_dir}").classes("muted")
                        ui.label(f"Snapshots: {backup_manager.snapshot_count()}")

                def backup_now_ui() -> None:
                    if backup_manager:
                        ok, message = backup_manager.backup_now("manual_backup")
                        refresh_backup_status()
                        ui.notify(message, type="positive" if ok else "negative")

                def snapshot_now_ui() -> None:
                    if backup_manager:
                        ok, message = backup_manager.create_snapshot()
                        refresh_backup_status()
                        ui.notify(message, type="positive" if ok else "negative")

                def validate_backup_ui() -> None:
                    if backup_manager:
                        ok, warnings = backup_manager.validate_backup(backup_manager.latest_dir)
                        refresh_backup_status()
                        ui.notify("Backup valide" if ok else "; ".join(warnings), type="positive" if ok else "warning")

                def restore_latest_ui() -> None:
                    if backup_manager:
                        ok, message = backup_manager.restore_on_launch()
                        if ok:
                            store.payloads = store.load_all()
                        refresh_backup_status()
                        refresh_warnings()
                        ui.notify(message, type="positive" if ok else "warning")

                def migrate_images_ui() -> None:
                    changed, message = store.validate_and_migrate_images()
                    refresh_warnings()
                    ui.notify(message + (" Données mises à jour." if changed else ""), type="positive" if changed else "info")

                with ui.column().classes("card w-full").style("gap:10px"):
                    ui.label("Validation").classes("section-title")
                    warnings_box = ui.column().classes("w-full").style("gap:8px")
                    with ui.row().style("gap:8px"):
                        ui.button("Validate data", on_click=refresh_warnings).props("color=orange-8")
                        ui.button("Validate / Migrate Images", on_click=migrate_images_ui).props("outline color=orange-8")
                with ui.column().classes("card w-full").style("gap:10px"):
                    ui.label("Backup / Restore").classes("section-title")
                    backup_status_box = ui.column().classes("w-full").style("gap:6px")
                    with ui.row().style("gap:8px; flex-wrap:wrap"):
                        ui.button("Backup now", on_click=backup_now_ui).props("color=green")
                        ui.button("Create snapshot", on_click=snapshot_now_ui).props("outline color=green")
                        ui.button("Validate backup", on_click=validate_backup_ui).props("outline color=orange-8")
                        ui.button("Restore latest manually", on_click=restore_latest_ui).props("outline color=red")
                        if backup_manager:
                            ui.button("Open backup folder", on_click=lambda: ui.navigate.to(f"file://{backup_manager.backup_root}", new_tab=True)).props("outline color=brown-7")
                    refresh_backup_status()

        with ui.row().classes("toolbar w-full").style("gap:8px"):
            ui.button("Save all JSON", on_click=save_all).props("color=green")
            ui.button("Preview public site", on_click=lambda: ui.navigate.to("/", new_tab=True)).props("outline color=brown-7")

    refresh_warnings()

    @app.on_shutdown
    def _cleanup() -> None:
        store.close()


def main() -> None:
    ensure_dependencies(REQUIRED_PACKAGES)
    global Image, ImageOps
    if Image is None or ImageOps is None:
        from PIL import Image as PILImage, ImageOps as PILImageOps
        Image = PILImage
        ImageOps = PILImageOps
    backup_manager = BackupManager(BASE_DIR)
    backup_manager.restore_status = (
        "Restauration automatique désactivée: les fichiers assets/data/*.json "
        "committés restent la source de vérité. Utilisez Restore latest manually au besoin."
    )
    store = DataStore(backup_manager)
    port = int(os.environ.get("EDITOR_PORT", "0")) or find_available_port(8890)
    print(f"[run] Editor available on http://0.0.0.0:{port}")
    build_ui(store)
    from nicegui import ui

    ui.run(host="0.0.0.0", port=port, reload=False, show=False, title="Menu Manager")


if __name__ == "__main__":
    main()
