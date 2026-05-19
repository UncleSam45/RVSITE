#!/usr/bin/env python3
"""Bootstrap a minimal NiceGUI webframe.

Features:
- Ensures required dependencies are installed in the active virtual environment.
- Creates a `js/` directory with a starter frontend script.
- Serves a NiceGUI app on port 8888 (or next available port).
- Injects the frontend JavaScript into the page.
"""

from __future__ import annotations

import importlib.util
import os
import socket
import subprocess
import sys
from pathlib import Path
from typing import Iterable

REQUIRED_PACKAGES = ["nicegui"]
BASE_DIR = Path(__file__).resolve().parent
JS_DIR = BASE_DIR / "js"
JS_FILE = JS_DIR / "app.js"

STARTER_JS = """// Starter frontend script for the webframe
window.webframe = {
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


def ensure_frontend_assets() -> None:
    JS_DIR.mkdir(parents=True, exist_ok=True)
    if not JS_FILE.exists():
        JS_FILE.write_text(STARTER_JS, encoding="utf-8")
        print(f"[setup] Created starter JavaScript file: {JS_FILE}")
    else:
        print(f"[setup] Existing JavaScript preserved: {JS_FILE}")


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


def build_ui(port: int) -> None:
    from nicegui import app, ui

    ui.page_title("webframe")

    with ui.column().classes("w-full items-center p-8 gap-4"):
        ui.label("webframe base is running").classes("text-h5")
        ui.label(f"Serving on port {port}").classes("text-caption text-grey-7")
        ui.element("div").props('id="webframe-root"').classes("w-full")

    app.add_static_files('/js', str(JS_DIR))
    app_js_version = int(JS_FILE.stat().st_mtime) if JS_FILE.exists() else 0
    ui.add_body_html(f'<script src="/js/app.js?v={app_js_version}"></script>')
    ui.run(host="0.0.0.0", port=port, reload=False, show=False)


def main() -> None:
    ensure_dependencies(REQUIRED_PACKAGES)
    ensure_frontend_assets()
    port = find_available_port(8888)
    print(f"[run] Launching webframe on port {port}")
    build_ui(port)


if __name__ == "__main__":
    main()
