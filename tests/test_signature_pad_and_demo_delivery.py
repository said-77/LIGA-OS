"""Проверки исправлений подписи, печати и доступности страниц демо-гида."""

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


def test_demo_without_trailing_slash_loads_real_screens_and_video():
    server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"{base}/demo", wait_until="networkidle")
            page.locator(".step-card[data-step='1']").click()
            page.wait_for_function(
                """() => {
                    const image = document.querySelector('#active-screenshot');
                    return image && image.complete && image.naturalWidth > 0 && image.currentSrc.endsWith('/02_finances.png');
                }""",
                timeout=10000,
            )
            image = page.locator("#active-screenshot")
            assert image.evaluate("img => img.complete && img.naturalWidth > 0")
            assert image.evaluate("img => new URL(img.currentSrc).pathname").startswith("/demo/assets/")
            assert "active" in (page.locator(".step-card[data-step='1']").get_attribute("class") or "")
            page.locator("#btn-mode-video").click()
            video = page.locator("#demo-mp4-video")
            page.wait_for_function("() => document.querySelector('#demo-mp4-video').readyState >= 1")
            assert video.evaluate("el => el.videoWidth > 0 && el.duration > 0")
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


def test_signature_is_not_fabricated_and_master_can_draw_and_save_it():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852}, is_mobile=True)
        page = context.new_page()
        page.goto((ROOT / "index.html").as_uri(), wait_until="domcontentloaded")
        page.wait_for_function("() => window.app && window.ligaSealEngine")
        page.locator("#btn-settings-top").click()
        page.wait_for_selector("#modal-settings.open")
        page.locator("#settings-section-seal").scroll_into_view_if_needed()
        page.wait_for_timeout(300)

        assert page.evaluate("() => !window.ligaSealEngine.settings.handwrittenSignature")
        assert page.locator("#seal-live-preview-box .official-signature-svg").count() == 0

        page.locator("#btn-sig-preset-elegant").click()
        assert page.locator("#signature-pad-canvas").bounding_box()["height"] > 100
        assert page.locator("#btn-sig-preset-elegant").get_attribute("aria-pressed") == "true"
        assert page.evaluate("() => !window.ligaSealEngine.settings.handwrittenSignature")

        canvas = page.locator("#signature-pad-canvas")
        bounds = canvas.bounding_box()
        assert bounds and bounds["width"] > 200
        page.mouse.move(bounds["x"] + 50, bounds["y"] + 80)
        page.mouse.down()
        for offset in range(1, 15):
            page.mouse.move(bounds["x"] + 50 + offset * 10, bounds["y"] + 80 + (offset % 3) * 8)
        page.mouse.up()
        page.locator("#btn-save-master-seal").click()
        page.wait_for_function("() => !!window.ligaSealEngine.settings.handwrittenSignature")
        assert page.locator("#seal-live-preview-box img.official-handwritten-signature").count() == 1

        sign = page.locator("#seal-live-preview-box .sign-container-inner").bounding_box()
        seal = page.locator("#seal-live-preview-box .seal-container-inner").bounding_box()
        assert sign and seal and seal["y"] >= sign["y"] + sign["height"] - 1
        browser.close()
