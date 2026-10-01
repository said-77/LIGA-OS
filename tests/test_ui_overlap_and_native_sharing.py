"""Браузерные проверки выявленных перекрытий, печати и системной отправки."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_args):
        pass


def open_app(width=393, height=852):
    server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    Thread(target=server.serve_forever, daemon=True).start()
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=width < 600)
    page.goto(f"http://127.0.0.1:{server.server_address[1]}/", wait_until="domcontentloaded")
    page.wait_for_function("() => window.app && window.ligaSealEngine")
    return server, playwright, browser, page


def close_app(server, playwright, browser):
    browser.close()
    playwright.stop()
    server.shutdown()
    server.server_close()


def test_more_menu_overlay_covers_fixed_header_on_phone_and_desktop():
    for width, height in ((393, 852), (1440, 900)):
        server, playwright, browser, page = open_app(width, height)
        try:
            page.locator("#btn-more-menu-toggle").click()
            page.wait_for_selector("#modal-more-menu.open")
            layers = page.evaluate("""() => ({
              overlay: Number(getComputedStyle(document.querySelector('#modal-more-menu')).zIndex),
              header: Number(getComputedStyle(document.querySelector('.top-header')).zIndex),
              titleTop: document.querySelector('#modal-more-menu .modal-title').getBoundingClientRect().top,
              headerBottom: document.querySelector('.top-header').getBoundingClientRect().bottom
            })""")
            assert layers["overlay"] > layers["header"], layers
            assert layers["titleTop"] >= 0, layers
            assert layers["headerBottom"] > 0, layers
        finally:
            close_app(server, playwright, browser)


def test_demo_phone_notch_does_not_cover_screen_content():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.goto(f"http://127.0.0.1:{server.server_address[1]}/demo", wait_until="domcontentloaded")
        page.wait_for_function("() => document.querySelector('#active-screenshot').naturalWidth > 0")
        geometry = page.evaluate("""() => ({
          notchBottom: document.querySelector('.phone-notch').getBoundingClientRect().bottom,
          contentTop: document.querySelector('#active-screenshot').getBoundingClientRect().top
        })""")
        assert geometry["contentTop"] >= geometry["notchBottom"], geometry
    finally:
        close_app(server, playwright, browser)


def test_elite_stamp_preview_is_larger_and_uses_selected_style():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.locator("#btn-settings-top").click()
        page.wait_for_selector("#modal-settings.open")
        page.locator("#settings-section-seal").scroll_into_view_if_needed()
        page.locator("#select-master-stamp-style").select_option("elite_graphite_gold")
        seal = page.locator("#seal-live-preview-box svg.official-seal-svg")
        assert "elite_graphite_gold" in (seal.get_attribute("class") or "")
        assert float(seal.get_attribute("width")) == 158
        assert page.locator("#seal-live-preview-box .official-handwritten-signature").count() == 0
    finally:
        close_app(server, playwright, browser)


def test_share_helper_uses_native_system_share_when_available():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.evaluate("""() => {
          window.__sharedPayload = null;
          Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async payload => { window.__sharedPayload = payload; }
          });
        }""")
        result = page.evaluate("""async () => {
          const ok = await window.app.openShareSheet('Проверьте этап', 'https://liga-master-uz.vercel.app/?share=v2.5.9', 'LIGA OS');
          return { ok, payload: window.__sharedPayload };
        }""")
        assert result["ok"] is True
        assert result["payload"]["text"] == "Проверьте этап"
        assert result["payload"]["url"].endswith("share=v2.5.9")
    finally:
        close_app(server, playwright, browser)
