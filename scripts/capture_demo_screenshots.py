"""Capture truthful, current LIGA OS screens for the interactive guide."""
from __future__ import annotations

import http.server
import socketserver
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "demo" / "assets"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_args):
        pass


class LocalServer(socketserver.TCPServer):
    allow_reuse_address = True


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    server = LocalServer(("127.0.0.1", 0), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    captures = [
        ("dashboard", "01_dashboard.png"),
        ("finances", "02_finances.png"),
        ("materials", "03_materials.png"),
        ("checklist", "04_checklist.png"),
        ("estimate", "05_estimate.png"),
        ("history", "06_history.png"),
    ]

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 412, "height": 915},
                device_scale_factor=2,
                is_mobile=True,
                has_touch=True,
                reduced_motion="reduce",
            )
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"{base}/index.html", wait_until="networkidle")
            page.wait_for_function("() => window.app && window.ligaDB && window.ligaDB.db")
            page.wait_for_timeout(1200)

            for screen, filename in captures:
                if screen != "dashboard":
                    page.locator(f'.nav-item[data-screen="{screen}"]').click()
                    page.wait_for_timeout(500)
                page.screenshot(path=str(ASSETS / filename), full_page=False)

            page.locator("#btn-settings-top").click()
            page.wait_for_selector("#modal-settings.open")
            sheet = page.locator("#modal-settings .modal-sheet")
            sheet.evaluate("el => el.scrollTop = 0")
            page.wait_for_timeout(250)
            page.screenshot(path=str(ASSETS / "07_settings.png"), full_page=False)
            page.locator("#settings-section-seal").evaluate("""section => {
                const sheet = section.closest('.modal-sheet');
                sheet.scrollTop += section.getBoundingClientRect().top - sheet.getBoundingClientRect().top - 12;
            }""")
            page.wait_for_timeout(350)
            page.screenshot(path=str(ASSETS / "08_seal_preview.png"), full_page=False)
            page.locator("#btn-sig-preset-elegant").click()
            page.wait_for_timeout(2600)
            page.screenshot(path=str(ASSETS / "09_signature_pad.png"), full_page=False)
            page.keyboard.press("Escape")
            page.locator('.nav-item[data-screen="dashboard"]').click()
            page.wait_for_timeout(350)
            page.locator("#btn-generate-act").click()
            page.wait_for_selector("#modal-pressure-test.open")
            page.wait_for_timeout(350)
            page.screenshot(path=str(ASSETS / "10_pressure_act.png"), full_page=False)
            page.keyboard.press("Escape")
            page.locator("#btn-more-menu-toggle").click()
            page.wait_for_selector("#modal-more-menu.open")
            page.wait_for_timeout(350)
            page.screenshot(path=str(ASSETS / "11_more_menu.png"), full_page=False)

            browser.close()
            if errors:
                raise RuntimeError("Browser errors while capturing guide: " + "; ".join(errors))
    finally:
        server.shutdown()
        server.server_close()

    print(f"Captured 11 live interface screens in {ASSETS}")


if __name__ == "__main__":
    main()
