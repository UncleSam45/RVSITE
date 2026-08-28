#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import socket
import subprocess
import sys
import types
from pathlib import Path
from typing import Any, Iterable


REQUIRED_PACKAGES = ["nicegui"]
BASE_DIR = Path(__file__).resolve().parent
JS_FILE = BASE_DIR / "main.js"
DATA_DIR = BASE_DIR / "data"
ITEMS_FILE = DATA_DIR / "items.json"

DEFAULT_ITEMS = {"items": []}

STARTER_JS = """window.webframe = {
  version: '0.1.0',
  init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;

    const message = document.createElement('p');
    message.textContent = 'HELLO WORLD';
    message.style.fontFamily = 'system-ui, sans-serif';
    root.appendChild(message);
  },
};

window.addEventListener('DOMContentLoaded', () => {
  window.webframe?.init();
});
"""

CONSOLE_FORWARDER_JS = r"""
(() => {
  const endpoint = '/__frontend-console';
  const maxMessageLength = 8_000;

  const formatValue = (value) => {
    if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
    if (typeof value === 'string') return value;
    if (typeof value === 'undefined') return 'undefined';
    try {
      const serialized = JSON.stringify(value, (key, item) =>
        typeof item === 'bigint' ? `${item}n` : item,
      );
      return serialized === undefined ? String(value) : serialized;
    } catch (_) {
      return String(value);
    }
  };

  const forward = (level, values) => {
    const message = values.map(formatValue).join(' ').slice(0, maxMessageLength);
    const payload = JSON.stringify({ level, message, page: window.location.href });

    if (window.fetch) {
      window.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } else if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
    }
  };

  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const nativeMethod = console[level];
    console[level] = (...values) => {
      nativeMethod.apply(console, values);
      forward(level, values);
    };
  }

  window.addEventListener('error', (event) => {
    const error = event.error;
    const location = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : '';
    forward('error', [error || event.message || 'Uncaught JavaScript error', location]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    forward('error', ['Unhandled promise rejection:', event.reason]);
  });
})();
"""


def in_virtualenv() -> bool:
    return sys.prefix != getattr(sys, "base_prefix", sys.prefix) or bool(
        os.environ.get("VIRTUAL_ENV")
    )


def module_installed(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def install_package(package: str) -> None:
    print(f"[setup] Installing missing dependency: {package}")
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])


def ensure_dependencies(packages: Iterable[str]) -> None:
    if not in_virtualenv():
        print(
            "[warning] No virtual environment detected. "
            "Dependencies will be installed using the current Python environment."
        )

    for package in packages:
        module_name = package.split("==")[0].replace("-", "_")
        if not module_installed(module_name):
            install_package(package)
        else:
            print(f"[setup] Dependency already available: {package}")


def module_importable(module_name: str) -> bool:
    """Check an optional binary module without risking the launcher process."""
    result = subprocess.run(
        [sys.executable, "-c", f"import {module_name}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def install_orjson_fallback() -> None:
    """Provide the small orjson API used by NiceGUI and FastAPI.

    Windows Application Control can allow the Python package while blocking its
    native DLL. FastAPI detects the installed package and imports it even after
    NiceGUI has caught that DLL error, so merely hiding it from ``find_spec`` is
    not reliable. A module backed by the standard library keeps the optional
    acceleration disabled without preventing the application from starting.
    """
    fallback = types.ModuleType("orjson")
    fallback.__spec__ = importlib.util.spec_from_loader("orjson", loader=None)
    fallback.__version__ = "standard-library-fallback"

    # These flags are combined by NiceGUI and FastAPI. JSON's encoder already
    # handles non-string primitive keys; unsupported acceleration-only flags can
    # safely be no-ops for the data sent by this application.
    for name, value in {
        "OPT_APPEND_NEWLINE": 1,
        "OPT_INDENT_2": 2,
        "OPT_NAIVE_UTC": 4,
        "OPT_NON_STR_KEYS": 8,
        "OPT_OMIT_MICROSECONDS": 16,
        "OPT_PASSTHROUGH_DATACLASS": 32,
        "OPT_PASSTHROUGH_DATETIME": 64,
        "OPT_PASSTHROUGH_SUBCLASS": 128,
        "OPT_SERIALIZE_DATACLASS": 256,
        "OPT_SERIALIZE_NUMPY": 512,
        "OPT_SERIALIZE_UUID": 1024,
        "OPT_SORT_KEYS": 2048,
        "OPT_STRICT_INTEGER": 4096,
        "OPT_UTC_Z": 8192,
    }.items():
        setattr(fallback, name, value)

    def dumps(value: Any, *, default: Any = None, option: int | None = None) -> bytes:
        option = option or 0
        result = json.dumps(
            value,
            default=default,
            ensure_ascii=False,
            indent=2 if option & fallback.OPT_INDENT_2 else None,
            sort_keys=bool(option & fallback.OPT_SORT_KEYS),
            separators=None if option & fallback.OPT_INDENT_2 else (",", ":"),
        )
        if option & fallback.OPT_APPEND_NEWLINE:
            result += "\n"
        return result.encode("utf-8")

    fallback.dumps = dumps
    fallback.loads = json.loads
    fallback.JSONEncodeError = TypeError
    fallback.JSONDecodeError = json.JSONDecodeError
    sys.modules["orjson"] = fallback


def ensure_frontend_assets() -> None:
    if not JS_FILE.exists():
        JS_FILE.write_text(STARTER_JS, encoding="utf-8")
        print(f"[setup] Created starter JavaScript file: {JS_FILE}")
    else:
        print(f"[setup] Existing frontend script preserved: {JS_FILE}")


def ensure_data_files() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not ITEMS_FILE.exists():
        ITEMS_FILE.write_text(json.dumps(DEFAULT_ITEMS, indent=2), encoding="utf-8")
        print(f"[setup] Created items data file: {ITEMS_FILE}")
    else:
        print(f"[setup] Existing items data file preserved: {ITEMS_FILE}")


def find_available_port(preferred: int = 8888, max_tries: int = 50) -> int:
    for offset in range(max_tries):
        candidate = preferred + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if sock.connect_ex(("127.0.0.1", candidate)) != 0:
                return candidate
    raise RuntimeError(
        f"Could not find an available port in range {preferred}-{preferred + max_tries - 1}"
    )


def format_frontend_console_message(payload: Any, client_host: str | None) -> str:
    if not isinstance(payload, dict):
        return "[frontend:error] Invalid console payload received"

    level = str(payload.get("level", "log")).lower()
    if level not in {"log", "info", "warn", "error", "debug"}:
        level = "log"

    message = str(payload.get("message", "")).replace("\x00", "")[:8_000]
    page = str(payload.get("page", ""))[:2_000]
    source = f" [{client_host}]" if client_host else ""
    page_suffix = f" <{page}>" if page else ""
    return f"[frontend:{level}]{source}{page_suffix} {message}"


def build_ui(port: int) -> None:
    orjson_works = module_importable("orjson")
    if not orjson_works and module_installed("orjson"):
        print(
            "[warning] orjson is installed but cannot be loaded; "
            "using the standard-library JSON fallback."
        )
        install_orjson_fallback()

    from nicegui import app, ui
    from fastapi import Request

    @app.post("/__frontend-console")
    async def receive_frontend_console(request: Request) -> dict[str, bool]:
        try:
            payload = await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = None
        client_host = request.client.host if request.client else None
        print(format_frontend_console_message(payload, client_host), flush=True)
        return {"ok": True}

    ui.page_title("La cuisine de Rosalie | Menu de la semaine du 3 juillet au 9 juillet")

    ui.add_head_html("""
    <style>
      .nicegui-content { padding: 0 !important; }
      #webframe-root { width: 100vw; min-height: 100vh; }
    </style>
    """)
    ui.element("div").props('id="webframe-root"')

    app_js_version = int(JS_FILE.stat().st_mtime) if JS_FILE.exists() else 0
    app.add_static_files('/assets', str(BASE_DIR / 'assets'))
    app.add_static_files('/static', str(BASE_DIR))
    ui.add_body_html(f"<script>{CONSOLE_FORWARDER_JS}</script>")
    ui.add_body_html(f'<script src="/static/main.js?v={app_js_version}"></script>')

    ui.run(host="0.0.0.0", port=port, reload=False, show=False)


def main() -> None:
    ensure_dependencies(REQUIRED_PACKAGES)
    ensure_frontend_assets()

    ensure_data_files()
    port = find_available_port(8888)
    print(f"[run] Launching webframe on port {port}")
    build_ui(port)


if __name__ == "__main__":
    main()
