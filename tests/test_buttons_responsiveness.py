import pytest
from playwright.sync_api import sync_playwright
import http.server
import threading
import time

PORT = 8094

@pytest.fixture(scope="module")
def local_server():
    server = http.server.HTTPServer(('127.0.0.1', PORT), http.server.SimpleHTTPRequestHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)
    yield f"http://127.0.0.1:{PORT}"
    server.shutdown()

def test_all_header_and_nav_buttons_responsive(local_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{local_server}/index.html")
        page.wait_for_timeout(600)

        # 1. Проверяем переключение темы
        initial_theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
        page.click("#btn-theme-toggle")
        page.wait_for_timeout(200)
        toggled_theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
        assert initial_theme != toggled_theme, f"Тема не переключилась: {initial_theme} -> {toggled_theme}"

        # Возвращаем тему назад
        page.click("#btn-theme-toggle")
        page.wait_for_timeout(200)
        assert page.evaluate("document.documentElement.getAttribute('data-theme')") == initial_theme

        # 2. Проверяем клик по микрофону (открытие модалки)
        page.click("#btn-voice-input")
        page.wait_for_timeout(300)
        is_voice_open = page.evaluate("document.getElementById('modal-voice').classList.contains('open')")
        assert is_voice_open, "Модалка голосового ввода не открылась"
        page.click("#modal-voice .btn-close-modal")
        page.wait_for_timeout(200)

        # 3. Проверяем клик по памятке мастера (открытие модалки)
        page.click("#btn-guide-top")
        page.wait_for_timeout(300)
        is_guide_open = page.evaluate("document.getElementById('modal-master-guide').classList.contains('open')")
        assert is_guide_open, "Модалка памятки мастера не открылась"
        page.click("#modal-master-guide .btn-close-modal")
        page.wait_for_timeout(200)

        # 4. Проверяем клик по инженерному экспресс-аудиту
        page.click("#btn-ai-audit-top")
        page.wait_for_timeout(300)
        is_audit_open = page.evaluate("document.getElementById('modal-ai-audit').classList.contains('open')")
        assert is_audit_open, "Модалка инженерного аудита не открылась"
        page.click("#modal-ai-audit .btn-close-modal")
        page.wait_for_timeout(200)

        # 5. Проверяем переключение экранов в нижней панели навигации
        screens = [
            ("finances", "screen-finances"),
            ("materials", "screen-materials"),
            ("checklist", "screen-checklist"),
            ("estimate", "screen-estimate"),
            ("history", "screen-history"),
            ("dashboard", "screen-dashboard"),
        ]

        for screen_key, screen_id in screens:
            page.click(f'.bottom-nav .nav-item[data-screen="{screen_key}"]')
            page.wait_for_timeout(200)
            is_active = page.evaluate(f"document.getElementById('{screen_id}').classList.contains('active')")
            assert is_active, f"Экран '{screen_key}' не активировался по клику в навигации"

        browser.close()
