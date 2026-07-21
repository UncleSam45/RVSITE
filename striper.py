#!/usr/bin/env python3
"""RVSITE Stripe Manager — JSON-driven Stripe catalog sync tool.

Standalone local admin dashboard for La cuisine de Rosalie / RVSITE.

Version 0.5.0
- Treats local RVSITE JSON as source of truth.
- Reads assets/data/items.json and assets/data/menus.json from a selected repo.
- Builds a preview sync plan before any Stripe mutation.
- Creates/updates/archives only Stripe objects managed by this tool.
- Writes Worker-ready assets/data/stripe_catalog.json and an admin sync report.

Why this file does not `import stripe`:
The original tool may be renamed stripe.py by users. Importing the official
`stripe` package from a file with that name can cause import conflicts, so this
app calls the Stripe REST API directly with requests instead.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import traceback
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from hashlib import sha256
from pathlib import Path
from typing import Any

APP_TITLE = "RVSITE Stripe Manager"
APP_VERSION = "0.5.0"
STRIPE_API_BASE = "https://api.stripe.com/v1"
STRIPE_DASHBOARD_BASE = "https://dashboard.stripe.com"
TOOL_SOURCE = "rvsite_stripe_manager"
DEFAULT_PROJECT_SLUG = "lacuisine_rosalie"
DEFAULT_CURRENCY = "cad"
DEFAULT_ENVIRONMENT = "test"
DEFAULT_SYNC_MODE = "current_menu_only"
CONFIG_DIR = Path.home() / ".rvsite_stripe_manager"
CONFIG_FILE = CONFIG_DIR / "settings.json"

REQUIRED_PACKAGES = {"requests": "requests", "PySide6": "PySide6"}


# -----------------------------------------------------------------------------
# Dependency bootstrap
# -----------------------------------------------------------------------------

def module_available(module_name: str) -> bool:
    try:
        __import__(module_name)
        return True
    except Exception:
        return False


def ensure_dependencies() -> None:
    missing = [package for module, package in REQUIRED_PACKAGES.items() if not module_available(module)]
    if missing:
        print(f"[{APP_TITLE}] Installing missing dependencies: {', '.join(missing)}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])


# -----------------------------------------------------------------------------
# Settings and small helpers
# -----------------------------------------------------------------------------

def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_settings() -> dict[str, Any]:
    if not CONFIG_FILE.exists():
        return {}
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_settings(settings: dict[str, Any]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    settings["updated_at"] = utc_now()
    CONFIG_FILE.write_text(json.dumps(settings, indent=2, ensure_ascii=False), encoding="utf-8")


def mask_key(key: str) -> str:
    key = (key or "").strip()
    return "" if not key else ("•" * len(key) if len(key) <= 12 else f"{key[:8]}…{key[-6:]}")


def key_environment(key: str) -> str:
    if key.startswith(("sk_live_", "rk_live_")):
        return "live"
    if key.startswith(("sk_test_", "rk_test_")):
        return "test"
    return "unknown"


def stable_hash(payload: dict[str, Any]) -> str:
    normalized = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return sha256(normalized.encode("utf-8")).hexdigest()[:16]


def money_to_cents(value: int | float | str | Decimal) -> int:
    try:
        amount = Decimal(str(value).strip().replace(",", "."))
    except (InvalidOperation, AttributeError) as exc:
        raise ValueError(f"Invalid price: {value}") from exc
    if amount <= 0:
        raise ValueError("Price must be greater than 0.")
    return int((amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def cents_to_amount(cents: int) -> float:
    return float((Decimal(cents) / Decimal("100")).quantize(Decimal("0.01")))


def read_json_file(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object in {path}")
    return data


# -----------------------------------------------------------------------------
# Data models
# -----------------------------------------------------------------------------

@dataclass
class LocalItem:
    item_id: str
    title: str
    description: str
    category: str
    available: bool
    pricing: dict[str, float]
    source: str
    product_hash: str = ""


@dataclass
class LocalMenu:
    menu_id: str
    title: str
    start_date: str
    end_date: str
    active: bool
    items: list[LocalItem]
    missing_ids: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    source_mode: str = DEFAULT_SYNC_MODE


@dataclass
class StripeProductRecord:
    product_id: str
    item_id: str
    name: str
    description: str
    active: bool
    metadata: dict[str, Any]


@dataclass
class StripePriceRecord:
    price_id: str
    product_id: str
    item_id: str
    portion_key: str
    amount: int
    currency: str
    active: bool
    metadata: dict[str, Any]


@dataclass
class StripeCatalog:
    products: list[StripeProductRecord] = field(default_factory=list)
    prices: list[StripePriceRecord] = field(default_factory=list)
    ignored_external_count: int = 0
    warnings: list[str] = field(default_factory=list)
    raw_products: list[dict[str, Any]] = field(default_factory=list)
    raw_prices: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SyncAction:
    action_type: str
    item_id: str
    title: str
    portion_key: str | None
    reason: str
    payload: dict[str, Any]
    risk: str
    local_price: float | None = None
    stripe_price: float | None = None


@dataclass
class SyncPlan:
    actions: list[SyncAction] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def by_type(self, action_type: str) -> list[SyncAction]:
        return [a for a in self.actions if a.action_type == action_type]

    def summary(self) -> dict[str, int]:
        keys = ["CREATE_PRODUCT", "UPDATE_PRODUCT", "CREATE_PRICE", "ARCHIVE_PRICE", "ARCHIVE_PRODUCT", "UNCHANGED", "IGNORED"]
        return {key: len(self.by_type(key)) for key in keys} | {"WARNING": len(self.warnings), "ERROR": len(self.errors)}


# -----------------------------------------------------------------------------
# Local catalog builder
# -----------------------------------------------------------------------------

def product_hash_for(item: LocalItem, menu_id: str) -> str:
    return stable_hash({
        "item_id": item.item_id,
        "title": item.title,
        "description": item.description,
        "category": item.category,
        "menu_id": menu_id,
        "active": item.available,
    })


def price_hash_for(item_id: str, portion_key: str, amount: float, currency: str) -> str:
    return stable_hash({"item_id": item_id, "portion_key": portion_key, "amount": float(amount), "currency": currency.lower()})


def _item_from_raw(raw: dict[str, Any], source: str) -> LocalItem | None:
    item_id = str(raw.get("id", "")).strip()
    if not item_id:
        return None
    pricing: dict[str, float] = {}
    for key, value in (raw.get("pricing") or {}).items():
        try:
            if money_to_cents(value) > 0:
                pricing[str(key).strip().lower()] = float(Decimal(str(value)).quantize(Decimal("0.01")))
        except Exception:
            continue
    return LocalItem(
        item_id=item_id,
        title=str(raw.get("title") or item_id),
        description=str(raw.get("description") or ""),
        category=str(raw.get("category") or ""),
        available=bool(raw.get("available", True)),
        pricing=pricing,
        source=source,
    )


def load_local_catalog(project_folder: Path, sync_mode: str = DEFAULT_SYNC_MODE, currency: str = DEFAULT_CURRENCY) -> LocalMenu:
    del currency  # Currency affects Stripe prices, not local menu resolution.
    data_dir = project_folder / "assets" / "data"
    items_path = data_dir / "items.json"
    menus_path = data_dir / "menus.json"
    items_data = read_json_file(items_path)
    raw_items = items_data.get("items") or []
    if not isinstance(raw_items, list):
        raise ValueError("items.json must contain an 'items' array.")
    warnings: list[str] = []
    seen: set[str] = set()
    lookup: dict[str, dict[str, Any]] = {}
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        item_id = str(raw.get("id", "")).strip()
        if not item_id:
            warnings.append("An item in items.json has no id and was ignored.")
            continue
        if item_id in seen:
            warnings.append(f"Duplicate item id in items.json: {item_id}")
        seen.add(item_id)
        lookup[item_id] = raw

    menu = {"id": "available-items", "title": "Available items", "start_date": "", "end_date": "", "active": True}
    ordered_ids: list[tuple[str, str]] = []
    source_mode = sync_mode
    if sync_mode == DEFAULT_SYNC_MODE:
        try:
            menus_data = read_json_file(menus_path)
            menu = menus_data.get("current_menu") or {}
            if not isinstance(menu, dict) or not menu:
                raise ValueError("menus.json has no current_menu object.")
            if not bool(menu.get("active", False)):
                warnings.append("current_menu.active is false; menu was still loaded for preview.")
            ordered_ids = [(str(i), "item_ids") for i in menu.get("item_ids", [])] + [(str(i), "extra_ids") for i in menu.get("extra_ids", [])]
        except Exception as exc:
            warnings.append(f"Falling back to available items because menus.json is missing or invalid: {exc}")
            source_mode = "available_items_only"
    if not ordered_ids:
        ordered_ids = [(item_id, "available_items") for item_id, raw in lookup.items() if bool(raw.get("available", True))]

    local_items: list[LocalItem] = []
    missing: list[str] = []
    for item_id, source in ordered_ids:
        raw = lookup.get(item_id)
        if raw is None:
            missing.append(item_id)
            continue
        item = _item_from_raw(raw, source)
        if item is None:
            continue
        if not item.available:
            warnings.append(f"Unavailable item skipped: {item.item_id}")
            continue
        if not item.pricing:
            warnings.append(f"Item has no valid positive prices: {item.item_id}")
            continue
        item.product_hash = product_hash_for(item, str(menu.get("id") or ""))
        local_items.append(item)
    if missing:
        warnings.append(f"Menu references unknown item IDs: {', '.join(missing)}")
    return LocalMenu(
        menu_id=str(menu.get("id") or ""),
        title=str(menu.get("title") or ""),
        start_date=str(menu.get("start_date") or ""),
        end_date=str(menu.get("end_date") or ""),
        active=bool(menu.get("active", True)),
        items=local_items,
        missing_ids=missing,
        warnings=warnings,
        source_mode=source_mode,
    )


# -----------------------------------------------------------------------------
# Stripe API client and catalog fetcher
# -----------------------------------------------------------------------------

def stripe_request(method: str, path: str, api_key: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    import requests

    response = requests.request(
        method,
        f"{STRIPE_API_BASE}{path}",
        headers={
            "Authorization": f"Bearer {api_key.strip()}",
            "Stripe-Version": "2024-06-20",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data=data or {},
        timeout=30,
    )
    try:
        payload = response.json()
    except Exception:
        payload = {"raw_response": response.text}
    if response.status_code >= 400:
        raise RuntimeError(payload.get("error", {}).get("message") or response.text or f"HTTP {response.status_code}")
    return payload


def stripe_list_all(path: str, api_key: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    params = dict(params or {})
    params.setdefault("limit", 100)
    results: list[dict[str, Any]] = []
    while True:
        page = stripe_request("GET", path, api_key, params)
        data = page.get("data") or []
        results.extend(data)
        if not page.get("has_more") or not data:
            break
        params["starting_after"] = data[-1].get("id")
    return results


def fetch_managed_stripe_catalog(api_key: str, project_slug: str) -> StripeCatalog:
    raw_products = stripe_list_all("/products", api_key, {})
    managed_products: list[StripeProductRecord] = []
    ignored = 0
    for product in raw_products:
        metadata = product.get("metadata") or {}
        if metadata.get("source") == TOOL_SOURCE and metadata.get("project") == project_slug:
            managed_products.append(StripeProductRecord(
                product_id=product.get("id", ""), item_id=metadata.get("item_id", ""),
                name=product.get("name", ""), description=product.get("description") or "",
                active=bool(product.get("active", False)), metadata=metadata,
            ))
        else:
            ignored += 1
    product_ids = {p.product_id for p in managed_products}
    raw_prices = stripe_list_all("/prices", api_key, {})
    prices: list[StripePriceRecord] = []
    for price in raw_prices:
        metadata = price.get("metadata") or {}
        product_id = price.get("product", "")
        if product_id in product_ids and metadata.get("source") == TOOL_SOURCE and metadata.get("project") == project_slug:
            prices.append(StripePriceRecord(
                price_id=price.get("id", ""), product_id=product_id, item_id=metadata.get("item_id", ""),
                portion_key=metadata.get("portion_key", ""), amount=int(price.get("unit_amount") or 0),
                currency=(price.get("currency") or "").lower(), active=bool(price.get("active", False)), metadata=metadata,
            ))
    warnings: list[str] = []
    active_items: dict[str, int] = {}
    active_prices: dict[tuple[str, str], int] = {}
    for product in managed_products:
        if product.active:
            active_items[product.item_id] = active_items.get(product.item_id, 0) + 1
    for price in prices:
        if price.active:
            key = (price.item_id, price.portion_key)
            active_prices[key] = active_prices.get(key, 0) + 1
    warnings.extend(f"Duplicate active managed products for item_id={item_id}" for item_id, count in active_items.items() if count > 1)
    warnings.extend(f"Duplicate active managed prices for item_id={item_id}, portion={portion}" for (item_id, portion), count in active_prices.items() if count > 1)
    return StripeCatalog(managed_products, prices, ignored, warnings, raw_products, raw_prices)


# -----------------------------------------------------------------------------
# Sync planner, executor, and output writers
# -----------------------------------------------------------------------------

def build_sync_plan(local_catalog: LocalMenu, stripe_catalog: StripeCatalog, options: dict[str, Any]) -> SyncPlan:
    project_slug = options.get("project_slug", DEFAULT_PROJECT_SLUG)
    currency = options.get("currency", DEFAULT_CURRENCY).lower()
    archive_missing = bool(options.get("archive_missing_items", True))
    plan = SyncPlan(warnings=[*local_catalog.warnings, *stripe_catalog.warnings])
    products_by_item = {p.item_id: p for p in stripe_catalog.products if p.item_id}
    prices_by_item_portion = {(p.item_id, p.portion_key): p for p in stripe_catalog.prices if p.item_id and p.portion_key and p.active}
    local_item_ids = {item.item_id for item in local_catalog.items}

    for item in local_catalog.items:
        product = products_by_item.get(item.item_id)
        product_payload = {
            "name": item.title,
            "description": item.description,
            "active": True,
            "metadata": {"source": TOOL_SOURCE, "project": project_slug, "item_id": item.item_id, "menu_id": local_catalog.menu_id, "local_hash": item.product_hash, "created_by_tool_version": APP_VERSION},
        }
        if product is None:
            plan.actions.append(SyncAction("CREATE_PRODUCT", item.item_id, item.title, None, "Local menu item does not exist in managed Stripe catalog.", product_payload, "medium"))
        elif product.name != item.title or (item.description and product.description != item.description) or not product.active or product.metadata.get("local_hash") != item.product_hash:
            payload = {**product_payload, "product_id": product.product_id}
            plan.actions.append(SyncAction("UPDATE_PRODUCT", item.item_id, item.title, None, "Product name, description, active state, or local hash changed.", payload, "low"))

        for portion_key, amount in item.pricing.items():
            desired_cents = money_to_cents(amount)
            desired_hash = price_hash_for(item.item_id, portion_key, amount, currency)
            price = prices_by_item_portion.get((item.item_id, portion_key))
            payload = {"item_id": item.item_id, "portion_key": portion_key, "amount_cents": desired_cents, "currency": currency, "local_hash": desired_hash}
            if product:
                payload["product_id"] = product.product_id
            if price is None:
                plan.actions.append(SyncAction("CREATE_PRICE", item.item_id, item.title, portion_key, "Local portion price does not exist in Stripe.", payload, "medium", amount, None))
            elif price.amount == desired_cents and price.currency == currency:
                plan.actions.append(SyncAction("UNCHANGED", item.item_id, item.title, portion_key, "Stripe price amount and currency match local JSON.", {**payload, "price_id": price.price_id}, "none", amount, cents_to_amount(price.amount)))
            else:
                plan.actions.append(SyncAction("CREATE_PRICE", item.item_id, item.title, portion_key, "Local amount/currency changed; Stripe Prices are immutable, so create replacement price.", payload, "medium", amount, cents_to_amount(price.amount)))
                plan.actions.append(SyncAction("ARCHIVE_PRICE", item.item_id, item.title, portion_key, "Archive replaced old managed Stripe price.", {"price_id": price.price_id}, "medium", amount, cents_to_amount(price.amount)))

    for product in stripe_catalog.products:
        if product.item_id not in local_item_ids:
            if product.metadata.get("source") == TOOL_SOURCE and product.metadata.get("project") == project_slug and archive_missing:
                for price in [p for p in stripe_catalog.prices if p.product_id == product.product_id and p.active]:
                    plan.actions.append(SyncAction("ARCHIVE_PRICE", product.item_id, product.name, price.portion_key, "Managed Stripe product is no longer in the current local menu.", {"price_id": price.price_id}, "medium"))
                if product.active:
                    plan.actions.append(SyncAction("ARCHIVE_PRODUCT", product.item_id, product.name, None, "Managed Stripe product is no longer in the current local menu.", {"product_id": product.product_id}, "medium"))
            else:
                plan.actions.append(SyncAction("IGNORED", product.item_id, product.name, None, "Not in current menu — archive mode disabled.", {"product_id": product.product_id}, "none"))
    if stripe_catalog.ignored_external_count:
        plan.actions.append(SyncAction("IGNORED", "", "External Stripe products", None, f"{stripe_catalog.ignored_external_count} Stripe products were not created by this tool/project and will not be touched.", {}, "none"))
    return plan


def _flatten_metadata(metadata: dict[str, Any]) -> dict[str, str]:
    return {f"metadata[{key}]": str(value) for key, value in metadata.items()}


def _stripe_product_write_payload(payload: dict[str, Any]) -> dict[str, str]:
    data = {"name": str(payload["name"]), "active": "true", **_flatten_metadata(payload["metadata"])}
    description = str(payload.get("description") or "").strip()
    if description:
        data["description"] = description
    return data


def stripe_dashboard_url(object_id: str, environment: str = DEFAULT_ENVIRONMENT) -> str:
    prefix = "/test" if environment == "test" else ""
    if object_id.startswith("prod_"):
        return f"{STRIPE_DASHBOARD_BASE}{prefix}/products/{object_id}"
    if object_id.startswith("price_"):
        return f"{STRIPE_DASHBOARD_BASE}{prefix}/prices/{object_id}"
    return f"{STRIPE_DASHBOARD_BASE}{prefix}"


def verify_synced_catalog(local_catalog: LocalMenu, stripe_catalog: StripeCatalog, options: dict[str, Any]) -> dict[str, Any]:
    currency = options.get("currency", DEFAULT_CURRENCY).lower()
    environment = options.get("environment", DEFAULT_ENVIRONMENT)
    active_products = {p.item_id: p for p in stripe_catalog.products if p.item_id and p.active}
    active_prices = {(p.item_id, p.portion_key): p for p in stripe_catalog.prices if p.item_id and p.portion_key and p.active and p.currency == currency}
    missing_products: list[str] = []
    missing_prices: list[dict[str, str]] = []
    dashboard_urls: dict[str, Any] = {"products": {}, "prices": {}}

    for item in local_catalog.items:
        product = active_products.get(item.item_id)
        if product is None:
            missing_products.append(item.item_id)
        else:
            dashboard_urls["products"][item.item_id] = stripe_dashboard_url(product.product_id, environment)
        for portion_key in item.pricing:
            price = active_prices.get((item.item_id, portion_key))
            if price is None:
                missing_prices.append({"item_id": item.item_id, "portion_key": portion_key})
            else:
                dashboard_urls["prices"][f"{item.item_id}:{portion_key}"] = stripe_dashboard_url(price.price_id, environment)

    return {
        "status": "passed" if not missing_products and not missing_prices else "failed",
        "verified_at": utc_now(),
        "managed_products_after_sync": len(stripe_catalog.products),
        "managed_prices_after_sync": len(stripe_catalog.prices),
        "missing_products": missing_products,
        "missing_prices": missing_prices,
        "dashboard_urls": dashboard_urls,
    }


def execute_sync_plan(api_key: str, project_folder: Path, local_catalog: LocalMenu, stripe_catalog: StripeCatalog, plan: SyncPlan, options: dict[str, Any]) -> dict[str, Any]:
    currency = options.get("currency", DEFAULT_CURRENCY).lower()
    project_slug = options.get("project_slug", DEFAULT_PROJECT_SLUG)
    dry_run = bool(options.get("dry_run", False))
    results: dict[str, Any] = {"started_at": utc_now(), "dry_run": dry_run, "actions": [], "errors": [], "archived": {"products": [], "prices": []}}
    products_by_item = {p.item_id: p.product_id for p in stripe_catalog.products if p.item_id}
    active_price_records = list(stripe_catalog.prices)

    def record(action: SyncAction, status: str, response: Any = None) -> None:
        results["actions"].append({"action": asdict(action), "status": status, "response": response})

    executable = [a for a in plan.actions if a.action_type not in {"UNCHANGED", "IGNORED"}]
    for action_type in ["CREATE_PRODUCT", "UPDATE_PRODUCT", "CREATE_PRICE", "ARCHIVE_PRICE", "ARCHIVE_PRODUCT"]:
        for action in [a for a in executable if a.action_type == action_type]:
            try:
                if dry_run:
                    record(action, "dry_run")
                    continue
                if action.action_type == "CREATE_PRODUCT":
                    p = action.payload
                    response = stripe_request("POST", "/products", api_key, _stripe_product_write_payload(p))
                    products_by_item[action.item_id] = response["id"]
                    response["dashboard_url"] = stripe_dashboard_url(response["id"], options.get("environment", DEFAULT_ENVIRONMENT))
                    record(action, "success", response)
                elif action.action_type == "UPDATE_PRODUCT":
                    p = action.payload
                    response = stripe_request("POST", f"/products/{p['product_id']}", api_key, _stripe_product_write_payload(p))
                    products_by_item[action.item_id] = response["id"]
                    response["dashboard_url"] = stripe_dashboard_url(response["id"], options.get("environment", DEFAULT_ENVIRONMENT))
                    record(action, "success", response)
                elif action.action_type == "CREATE_PRICE":
                    product_id = products_by_item.get(action.item_id) or action.payload.get("product_id")
                    if not product_id:
                        raise RuntimeError(f"No product id available for {action.item_id}")
                    metadata = {"source": TOOL_SOURCE, "project": project_slug, "item_id": action.item_id, "portion_key": action.portion_key or "", "local_hash": action.payload["local_hash"], "created_by_tool_version": APP_VERSION}
                    response = stripe_request("POST", "/prices", api_key, {"product": product_id, "currency": currency, "unit_amount": str(action.payload["amount_cents"]), "nickname": action.portion_key or "", **_flatten_metadata(metadata)})
                    active_price_records.append(StripePriceRecord(response["id"], product_id, action.item_id, action.portion_key or "", int(response.get("unit_amount") or 0), currency, True, response.get("metadata") or metadata))
                    response["dashboard_url"] = stripe_dashboard_url(response["id"], options.get("environment", DEFAULT_ENVIRONMENT))
                    record(action, "success", response)
                elif action.action_type == "ARCHIVE_PRICE":
                    response = stripe_request("POST", f"/prices/{action.payload['price_id']}", api_key, {"active": "false"})
                    results["archived"]["prices"].append(action.payload["price_id"])
                    record(action, "success", response)
                elif action.action_type == "ARCHIVE_PRODUCT":
                    response = stripe_request("POST", f"/products/{action.payload['product_id']}", api_key, {"active": "false"})
                    results["archived"]["products"].append(action.payload["product_id"])
                    record(action, "success", response)
            except Exception as exc:
                results["errors"].append({"action": asdict(action), "error": str(exc)})
                record(action, "failed", str(exc))
                break
        if results["errors"]:
            break
    verified_stripe_catalog = fetch_managed_stripe_catalog(api_key, project_slug) if not dry_run and not results["errors"] else StripeCatalog(
        [
            StripeProductRecord(product_id, item_id, "", "", True, {})
            for item_id, product_id in products_by_item.items()
        ],
        active_price_records,
    )
    results["verification"] = verify_synced_catalog(local_catalog, verified_stripe_catalog, options)
    if not dry_run and not results["errors"] and results["verification"]["status"] != "passed":
        results["errors"].append({
            "action": "VERIFY_SYNC",
            "error": "Stripe accepted the API calls, but a post-sync refetch did not find every expected active product/price. Check the Stripe test/live mode and dashboard URLs in results.verification.",
        })
    verified_products_by_item = {p.item_id: p.product_id for p in verified_stripe_catalog.products if p.item_id} or products_by_item
    verified_prices = verified_stripe_catalog.prices or active_price_records
    catalog = write_stripe_catalog(project_folder, local_catalog, verified_products_by_item, verified_prices, results["archived"], options)
    results["finished_at"] = utc_now()
    write_sync_report(project_folder, local_catalog, stripe_catalog, plan, results, catalog)
    return results


def write_stripe_catalog(project_folder: Path, local_catalog: LocalMenu, products_by_item: dict[str, str], prices: list[StripePriceRecord], archived: dict[str, list[str]], options: dict[str, Any]) -> dict[str, Any]:
    currency = options.get("currency", DEFAULT_CURRENCY).lower()
    price_lookup = {(p.item_id, p.portion_key): p for p in prices if p.active and p.currency == currency}
    items: dict[str, Any] = {}
    for item in local_catalog.items:
        prices_out: dict[str, Any] = {}
        for portion_key, amount in item.pricing.items():
            record = price_lookup.get((item.item_id, portion_key))
            prices_out[portion_key] = {"price_id": record.price_id if record else "", "amount": amount, "currency": currency, "active": bool(record), "local_hash": price_hash_for(item.item_id, portion_key, amount, currency)}
        items[item.item_id] = {"title": item.title, "category": item.category, "product_id": products_by_item.get(item.item_id, ""), "active": True, "local_hash": item.product_hash, "prices": prices_out}
    catalog = {
        "app": APP_TITLE, "version": APP_VERSION, "project": options.get("project_slug", DEFAULT_PROJECT_SLUG), "environment": options.get("environment", DEFAULT_ENVIRONMENT),
        "currency": currency, "synced_at": utc_now(), "source_files": {"items_json": "assets/data/items.json", "menus_json": "assets/data/menus.json"},
        "menu": {"id": local_catalog.menu_id, "title": local_catalog.title, "start_date": local_catalog.start_date, "end_date": local_catalog.end_date},
        "items": items, "archived": archived,
    }
    path = project_folder / "assets" / "data" / "stripe_catalog.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")
    return catalog


def write_sync_report(project_folder: Path, local_catalog: LocalMenu, stripe_catalog: StripeCatalog, plan: SyncPlan, results: dict[str, Any] | None, catalog: dict[str, Any] | None = None) -> Path:
    report = {"app": APP_TITLE, "version": APP_VERSION, "generated_at": utc_now(), "local_menu": asdict(local_catalog), "stripe_catalog_summary": {"managed_products": len(stripe_catalog.products), "managed_prices": len(stripe_catalog.prices), "ignored_external_count": stripe_catalog.ignored_external_count, "warnings": stripe_catalog.warnings}, "sync_plan": {"summary": plan.summary(), "actions": [asdict(a) for a in plan.actions], "warnings": plan.warnings, "errors": plan.errors}, "results": results, "worker_catalog_preview": catalog}
    path = project_folder / "data" / "logs" / "stripe_sync_report.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


# -----------------------------------------------------------------------------
# UI
# -----------------------------------------------------------------------------

def run_app() -> None:
    from PySide6.QtCore import QObject, QThread, Signal, Qt
    from PySide6.QtGui import QFont
    from PySide6.QtWidgets import (QApplication, QCheckBox, QFileDialog, QFormLayout, QFrame, QGridLayout, QGroupBox, QHBoxLayout, QLabel, QLineEdit, QMainWindow, QMessageBox, QPushButton, QPlainTextEdit, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget)

    class StripeWorker(QObject):
        finished = Signal(dict)
        failed = Signal(str)

        def __init__(self, job: str, api_key: str, project_slug: str) -> None:
            super().__init__(); self.job = job; self.api_key = api_key; self.project_slug = project_slug

        def run(self) -> None:
            try:
                if self.job == "test_connection":
                    self.finished.emit({"job": self.job, "account": stripe_request("GET", "/account", self.api_key)})
                elif self.job == "fetch_catalog":
                    self.finished.emit({"job": self.job, "catalog": fetch_managed_stripe_catalog(self.api_key, self.project_slug)})
            except Exception as exc:
                self.failed.emit(f"{exc}\n\n{traceback.format_exc()}")

    class MainWindow(QMainWindow):
        def __init__(self) -> None:
            super().__init__()
            self.settings = load_settings(); self.local_catalog: LocalMenu | None = None; self.stripe_catalog = StripeCatalog(); self.sync_plan: SyncPlan | None = None; self.thread: QThread | None = None; self.worker: StripeWorker | None = None
            self.setWindowTitle(f"{APP_TITLE} v{APP_VERSION}"); self.resize(1480, 980); self._build_ui(); self._load_settings_into_ui(); self._update_status(); self._reload_local_json(silent=True)

        def _build_ui(self) -> None:
            central = QWidget(); root = QVBoxLayout(central); root.setContentsMargins(18,18,18,18); root.setSpacing(14); self.setCentralWidget(central)
            header = QFrame(); header.setObjectName("Header"); h = QHBoxLayout(header)
            self.title = QLabel(f"{APP_TITLE} <span style='color:#93c5fd'>v{APP_VERSION}</span>"); self.title.setObjectName("Title")
            self.mode_badge = QLabel("UNKNOWN"); self.mode_badge.setObjectName("Badge"); self.connection_badge = QLabel("Not connected"); self.folder_badge = QLabel("No project folder")
            h.addWidget(self.title); h.addStretch(1); h.addWidget(self.mode_badge); h.addWidget(self.connection_badge); h.addWidget(self.folder_badge); root.addWidget(header)
            body = QHBoxLayout(); root.addLayout(body, 1)
            sidebar = QFrame(); sidebar.setObjectName("Sidebar"); sv = QVBoxLayout(sidebar)
            for text in ["1. Connection", "2. Project", "3. Local Menu", "4. Stripe Catalog", "5. Sync Plan", "6. Logs / Output"]:
                lab = QLabel(text); lab.setObjectName("SideItem"); sv.addWidget(lab)
            sv.addStretch(1); body.addWidget(sidebar, 0)
            main = QVBoxLayout(); body.addLayout(main, 1)
            grid = QGridLayout(); grid.setHorizontalSpacing(14); grid.setVerticalSpacing(14); main.addLayout(grid)

            conn = QGroupBox("Connection"); cl = QVBoxLayout(conn); keyrow = QHBoxLayout(); self.api_key_input = QLineEdit(); self.api_key_input.setEchoMode(QLineEdit.Password); self.api_key_input.setPlaceholderText("sk_test_... recommended"); self.api_key_input.textChanged.connect(self._update_status); self.show_key_check = QCheckBox("Show"); self.show_key_check.toggled.connect(lambda checked: self.api_key_input.setEchoMode(QLineEdit.Normal if checked else QLineEdit.Password)); keyrow.addWidget(self.api_key_input,1); keyrow.addWidget(self.show_key_check); cl.addLayout(keyrow)
            self.remember_key_check = QCheckBox("Remember key locally"); self.remember_key_check.setChecked(True); self.live_confirm_check = QCheckBox("I understand this will modify the live Stripe catalog"); self.live_confirm_check.setObjectName("DangerCheck"); cl.addWidget(self.remember_key_check); cl.addWidget(self.live_confirm_check)
            brow = QHBoxLayout(); self.test_btn = QPushButton("Test connection"); self.test_btn.clicked.connect(self._test_connection); self.forget_btn = QPushButton("Forget key"); self.forget_btn.clicked.connect(self._forget_key); brow.addWidget(self.test_btn); brow.addWidget(self.forget_btn); cl.addLayout(brow)
            self.account_label = QLabel("Account: not tested"); cl.addWidget(self.account_label); grid.addWidget(conn,0,0)

            proj = QGroupBox("Project"); pl = QFormLayout(proj); self.project_input = QLineEdit(); self.project_input.setPlaceholderText("Select RVSITE repo folder"); browse = QPushButton("Browse folder"); browse.clicked.connect(self._browse_folder); reload = QPushButton("Reload local JSON"); reload.clicked.connect(lambda: self._reload_local_json(False)); openb = QPushButton("Open folder"); openb.clicked.connect(self._open_folder); prow = QHBoxLayout(); prow.addWidget(self.project_input,1); prow.addWidget(browse); prow.addWidget(reload); prow.addWidget(openb); pl.addRow("RVSITE folder", prow)
            self.currency_input = QLineEdit(DEFAULT_CURRENCY); self.project_slug_input = QLineEdit(DEFAULT_PROJECT_SLUG); self.archive_check = QCheckBox("Archive RVSITE products not in current menu"); self.archive_check.setChecked(True); self.archive_check.setToolTip("This makes Stripe match the current local menu. Old products remain in Stripe history but are no longer active for checkout."); pl.addRow("Currency", self.currency_input); pl.addRow("Project slug", self.project_slug_input); pl.addRow("Archive mode", self.archive_check); self.paths_label = QLabel("items.json / menus.json / stripe_catalog.json"); pl.addRow("Detected files", self.paths_label); grid.addWidget(proj,0,1)

            local = QGroupBox("Local Menu"); lv = QVBoxLayout(local); self.local_summary = QLabel("No local menu loaded."); lv.addWidget(self.local_summary); self.local_table = QTableWidget(0,9); self.local_table.setHorizontalHeaderLabels(["Item ID","Title","Category","Available","Petit","Grand","Familial","Standard","Source"]); lv.addWidget(self.local_table); grid.addWidget(local,1,0,1,2)
            stripe = QGroupBox("Stripe Catalog"); stv = QVBoxLayout(stripe); srow=QHBoxLayout(); self.fetch_btn=QPushButton("Fetch Stripe Catalog"); self.fetch_btn.clicked.connect(self._fetch_stripe); srow.addWidget(self.fetch_btn); srow.addStretch(1); stv.addLayout(srow); self.stripe_summary=QLabel("Not fetched."); stv.addWidget(self.stripe_summary); self.stripe_table=QTableWidget(0,7); self.stripe_table.setHorizontalHeaderLabels(["Product ID","Item ID","Product Name","Active","Price count","Last known hash","Status"]); stv.addWidget(self.stripe_table); grid.addWidget(stripe,2,0)
            planbox = QGroupBox("Sync Plan"); pv=QVBoxLayout(planbox); ar=QHBoxLayout(); self.analyze_btn=QPushButton("Analyze / Build Sync Plan"); self.analyze_btn.clicked.connect(self._analyze); self.confirm_btn=QPushButton("Confirm Sync to Stripe"); self.confirm_btn.setObjectName("PrimaryButton"); self.confirm_btn.setEnabled(False); self.confirm_btn.clicked.connect(self._confirm_sync); self.report_btn=QPushButton("Export Sync Report"); self.report_btn.clicked.connect(self._export_report); ar.addWidget(self.analyze_btn); ar.addWidget(self.report_btn); ar.addStretch(1); ar.addWidget(self.confirm_btn); pv.addLayout(ar); self.plan_summary=QLabel("Build a plan after loading local JSON and fetching Stripe."); pv.addWidget(self.plan_summary); self.plan_table=QTableWidget(0,8); self.plan_table.setHorizontalHeaderLabels(["Action","Item ID","Title","Portion","Local Price","Stripe Price","Reason","Risk"]); pv.addWidget(self.plan_table); grid.addWidget(planbox,2,1)
            logs = QGroupBox("Result / Logs"); logv=QVBoxLayout(logs); self.result_output=QPlainTextEdit(); self.result_output.setReadOnly(True); self.result_output.setPlaceholderText("Human summary and raw JSON details appear here."); logv.addWidget(self.result_output); main.addWidget(logs,1)
            self.setStyleSheet("""
                QMainWindow{background:#0b1120} QWidget{color:#e5e7eb;font-family:Segoe UI,Arial;font-size:13px} QFrame#Header,QFrame#Sidebar,QGroupBox{background:#111827;border:1px solid #334155;border-radius:14px} QLabel#Title{font-size:28px;font-weight:900;color:white} QLabel#Badge{background:#374151;border-radius:9px;padding:7px 11px;font-weight:900} QLabel#SideItem{padding:10px 14px;color:#cbd5e1;font-weight:800} QGroupBox{margin-top:12px;padding:12px;font-weight:900;color:#fff} QGroupBox::title{subcontrol-origin:margin;left:12px;padding:0 8px} QLineEdit,QPlainTextEdit,QTableWidget{background:#020617;border:1px solid #334155;border-radius:10px;padding:7px;color:#f8fafc;selection-background-color:#2563eb} QHeaderView::section{background:#1e293b;color:#e5e7eb;padding:7px;border:0;font-weight:900} QPushButton{background:#1e293b;border:1px solid #475569;border-radius:10px;padding:9px 13px;color:#f8fafc;font-weight:800} QPushButton:hover{background:#334155} QPushButton#PrimaryButton{background:#16a34a;border-color:#22c55e} QPushButton:disabled{background:#374151;color:#94a3b8} QCheckBox#DangerCheck{color:#fecaca;font-weight:800}
            """)

        def _options(self) -> dict[str, Any]:
            env = key_environment(self.api_key_input.text().strip())
            return {"currency": (self.currency_input.text().strip() or DEFAULT_CURRENCY).lower(), "environment": env if env != "unknown" else DEFAULT_ENVIRONMENT, "project_slug": self.project_slug_input.text().strip() or DEFAULT_PROJECT_SLUG, "sync_mode": DEFAULT_SYNC_MODE, "archive_missing_items": self.archive_check.isChecked()}

        def _load_settings_into_ui(self) -> None:
            s=self.settings; self.api_key_input.setText(s.get("stripe_api_key", "")); self.remember_key_check.setChecked(bool(s.get("remember_key", True))); self.project_input.setText(s.get("last_project_folder", "")); self.currency_input.setText(s.get("currency", DEFAULT_CURRENCY)); self.project_slug_input.setText(s.get("project_slug", DEFAULT_PROJECT_SLUG)); self.archive_check.setChecked(bool(s.get("archive_missing_items", True)))

        def _save_settings(self) -> None:
            s={"remember_key": self.remember_key_check.isChecked(), "last_project_folder": self.project_input.text().strip(), "currency": self.currency_input.text().strip().lower() or DEFAULT_CURRENCY, "environment": self._options()["environment"], "project_slug": self.project_slug_input.text().strip() or DEFAULT_PROJECT_SLUG, "sync_mode": DEFAULT_SYNC_MODE, "archive_missing_items": self.archive_check.isChecked()}
            if self.remember_key_check.isChecked(): s["stripe_api_key"] = self.api_key_input.text().strip()
            save_settings(s); self.settings=s

        def _update_status(self) -> None:
            env=key_environment(self.api_key_input.text().strip()); self.mode_badge.setText(env.upper() if env != "unknown" else "UNKNOWN"); self.mode_badge.setStyleSheet("background:#7f1d1d;color:#fecaca" if env=="live" else "background:#1e3a8a;color:#dbeafe" if env=="test" else "background:#374151"); folder=self.project_input.text().strip() if hasattr(self,"project_input") else ""; self.folder_badge.setText(Path(folder).name if folder else "No project folder")

        def _browse_folder(self) -> None:
            folder=QFileDialog.getExistingDirectory(self,"Select RVSITE project folder",self.project_input.text() or str(Path.home()))
            if folder: self.project_input.setText(folder); self._save_settings(); self._update_status(); self._reload_local_json(False)

        def _open_folder(self) -> None:
            folder=self.project_input.text().strip()
            if folder and Path(folder).exists():
                if sys.platform.startswith("win"): os.startfile(folder)  # type: ignore[attr-defined]
                elif sys.platform == "darwin": subprocess.Popen(["open", folder])
                else: subprocess.Popen(["xdg-open", folder])

        def _forget_key(self) -> None:
            s=load_settings(); s.pop("stripe_api_key",None); s["remember_key"]=False; save_settings(s); self.api_key_input.clear(); self.remember_key_check.setChecked(False); self.result_output.setPlainText(f"Saved Stripe key removed from {CONFIG_FILE}")

        def _reload_local_json(self, silent: bool=False) -> None:
            try:
                folder=Path(self.project_input.text().strip() or ".").resolve(); self.local_catalog=load_local_catalog(folder, DEFAULT_SYNC_MODE, self.currency_input.text().strip() or DEFAULT_CURRENCY); self._save_settings(); self._render_local(); self.confirm_btn.setEnabled(False); self.sync_plan=None; self.paths_label.setText("assets/data/items.json · assets/data/menus.json · assets/data/stripe_catalog.json")
            except Exception as exc:
                if not silent: QMessageBox.warning(self,"Local JSON error",str(exc))
                self.result_output.setPlainText(str(exc))

        def _render_local(self) -> None:
            if not self.local_catalog: return
            m=self.local_catalog; main_count=sum(1 for i in m.items if i.source=="item_ids"); extra_count=sum(1 for i in m.items if i.source=="extra_ids"); self.local_summary.setText(f"{m.title or m.menu_id} · {main_count} meals · {extra_count} extras · {len(m.items)} resolved · {len(m.missing_ids)} missing · active={m.active}")
            self.local_table.setRowCount(len(m.items))
            for r,item in enumerate(m.items):
                values=[item.item_id,item.title,item.category,str(item.available),str(item.pricing.get("petit", "")),str(item.pricing.get("grand", "")),str(item.pricing.get("familial", "")),str(item.pricing.get("standard", "")),item.source]
                for c,v in enumerate(values): self.local_table.setItem(r,c,QTableWidgetItem(v))
            self.result_output.setPlainText(json.dumps({"local_menu": asdict(m)}, indent=2, ensure_ascii=False))

        def _set_busy(self,busy: bool) -> None:
            for b in [self.test_btn,self.fetch_btn,self.analyze_btn,self.confirm_btn,self.report_btn]: b.setEnabled((not busy) and (b is not self.confirm_btn or self.sync_plan is not None))
            if busy: self.result_output.setPlainText("Working...")

        def _start_worker(self, job: str) -> None:
            key=self.api_key_input.text().strip()
            if not key: QMessageBox.warning(self,"Missing key","Paste your Stripe API key first."); return
            self._save_settings(); self._set_busy(True); self.thread=QThread(); self.worker=StripeWorker(job,key,self._options()["project_slug"]); self.worker.moveToThread(self.thread); self.thread.started.connect(self.worker.run); self.worker.finished.connect(self._worker_finished); self.worker.failed.connect(self._worker_failed); self.worker.finished.connect(self.thread.quit); self.worker.failed.connect(self.thread.quit); self.thread.finished.connect(self.thread.deleteLater); self.thread.start()

        def _test_connection(self) -> None: self._start_worker("test_connection")
        def _fetch_stripe(self) -> None: self._start_worker("fetch_catalog")

        def _worker_finished(self,payload: dict[str,Any]) -> None:
            self._set_busy(False); job=payload.get("job")
            if job=="test_connection":
                a=payload.get("account",{}); self.connection_badge.setText("Connected"); self.account_label.setText(f"Account: {a.get('id')} · charges={a.get('charges_enabled')} · payouts={a.get('payouts_enabled')}"); self.result_output.setPlainText(json.dumps(a, indent=2, ensure_ascii=False))
            elif job=="fetch_catalog":
                self.stripe_catalog=payload["catalog"]; self._render_stripe(); self.result_output.setPlainText(json.dumps(asdict(self.stripe_catalog), indent=2, ensure_ascii=False))

        def _worker_failed(self,error: str) -> None:
            self._set_busy(False); self.result_output.setPlainText(error); QMessageBox.critical(self,"Stripe error",error.split("\n",1)[0])

        def _render_stripe(self) -> None:
            c=self.stripe_catalog; active=sum(1 for p in c.products if p.active); archived=len(c.products)-active; self.stripe_summary.setText(f"Managed products: {len(c.products)} · active: {active} · archived: {archived} · external ignored: {c.ignored_external_count}")
            price_counts={p.product_id:0 for p in c.products}
            for price in c.prices: price_counts[price.product_id]=price_counts.get(price.product_id,0)+1
            self.stripe_table.setRowCount(len(c.products))
            for r,p in enumerate(c.products):
                vals=[p.product_id,p.item_id,p.name,str(p.active),str(price_counts.get(p.product_id,0)),str(p.metadata.get("local_hash", "")),"managed"]
                for col,v in enumerate(vals): self.stripe_table.setItem(r,col,QTableWidgetItem(v))

        def _analyze(self) -> None:
            if not self.local_catalog: self._reload_local_json(False)
            if not self.local_catalog: return
            self.sync_plan=build_sync_plan(self.local_catalog,self.stripe_catalog,self._options()); self.confirm_btn.setEnabled(not self.sync_plan.errors); self._render_plan(); self.result_output.setPlainText(json.dumps({"summary": self.sync_plan.summary(), "warnings": self.sync_plan.warnings, "errors": self.sync_plan.errors, "actions": [asdict(a) for a in self.sync_plan.actions]}, indent=2, ensure_ascii=False))

        def _render_plan(self) -> None:
            p=self.sync_plan
            if not p: return
            s=p.summary(); self.plan_summary.setText(" · ".join(f"{k}: {v}" for k,v in s.items() if v)); self.plan_table.setRowCount(len(p.actions))
            for r,a in enumerate(p.actions):
                vals=[a.action_type,a.item_id,a.title,a.portion_key or "",str(a.local_price or ""),str(a.stripe_price or ""),a.reason,a.risk]
                for c,v in enumerate(vals): self.plan_table.setItem(r,c,QTableWidgetItem(v))

        def _export_report(self) -> None:
            if not self.local_catalog or not self.sync_plan: QMessageBox.warning(self,"No plan","Build a sync plan first."); return
            path=write_sync_report(Path(self.project_input.text()).resolve(), self.local_catalog, self.stripe_catalog, self.sync_plan, None, None); self.result_output.setPlainText(f"Saved report: {path}")

        def _confirm_sync(self) -> None:
            if not self.local_catalog or not self.sync_plan: return
            env=key_environment(self.api_key_input.text().strip())
            if env=="live" and not self.live_confirm_check.isChecked(): QMessageBox.warning(self,"LIVE mode locked","Check the live mode confirmation box before syncing."); return
            archives=len(self.sync_plan.by_type("ARCHIVE_PRICE"))+len(self.sync_plan.by_type("ARCHIVE_PRODUCT")); msg=f"This will modify Stripe after preview. Archive actions: {archives}.\nArchived items stop being used for new purchases but remain in Stripe history. Continue?"
            if QMessageBox.question(self,"Confirm Sync to Stripe",msg,QMessageBox.Yes|QMessageBox.No)!=QMessageBox.Yes: return
            try:
                self._save_settings(); result=execute_sync_plan(self.api_key_input.text().strip(), Path(self.project_input.text()).resolve(), self.local_catalog, self.stripe_catalog, self.sync_plan, self._options()); self.result_output.setPlainText(json.dumps(result, indent=2, ensure_ascii=False)); QMessageBox.information(self,"Sync complete","Stripe sync finished. Catalog and report were written.")
            except Exception as exc:
                self.result_output.setPlainText(f"{exc}\n\n{traceback.format_exc()}"); QMessageBox.critical(self,"Sync failed",str(exc))

    app=QApplication(sys.argv); app.setApplicationName(APP_TITLE); app.setFont(QFont("Segoe UI",10)); w=MainWindow(); w.show(); sys.exit(app.exec())


def main() -> None:
    ensure_dependencies()
    run_app()


if __name__ == "__main__":
    main()
