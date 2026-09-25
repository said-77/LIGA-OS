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

        # 6. Проверяем клик по кнопке Настройки ⚙️
        page.click("#btn-settings-top")
        page.wait_for_timeout(300)
        is_settings_open = page.evaluate("document.getElementById('modal-settings').classList.contains('open')")
        assert is_settings_open, "Модалка настроек LIGA OS не открылась по клику на ⚙️"
        page.click("#btn-close-settings")
        page.wait_for_timeout(200)
        assert not page.evaluate("document.getElementById('modal-settings').classList.contains('open')"), "Модалка настроек не закрылась"

        # 7. Проверяем клик по кнопке LIGA AI
        page.click("#btn-ai-concierge-open")
        page.wait_for_timeout(300)
        is_ai_open = page.evaluate("document.getElementById('modal-ai-concierge').classList.contains('open')")
        assert is_ai_open, "Модалка LIGA AI Консьержа не открылась"
        page.click("#btn-close-ai-concierge")
        page.wait_for_timeout(200)
        assert not page.evaluate("document.getElementById('modal-ai-concierge').classList.contains('open')"), "Модалка LIGA AI не закрылась"

        # 8. Проверяем адаптивность шапки на мобильном экране (360px): всё помещается в экран
        page.set_viewport_size({"width": 360, "height": 740})
        page.wait_for_timeout(200)
        more_btn_box = page.locator("#btn-more-menu-toggle").bounding_box()
        assert more_btn_box is not None, "Кнопка '⋯ Ещё' отсутствует на экране"
        assert more_btn_box["x"] + more_btn_box["width"] <= 360, (
            f"Кнопка '⋯ Ещё' вылезла за правый край экрана 360px: {more_btn_box['x'] + more_btn_box['width']}"
        )

        settings_btn_box = page.locator("#btn-settings-top").bounding_box()
        assert settings_btn_box is not None, "Кнопка Настройки ⚙️ отсутствует"
        assert settings_btn_box["x"] > 0, "Кнопка Настройки ⚙️ невидима"

        client_btn_box = page.locator("#btn-client-mode-toggle").bounding_box()
        assert client_btn_box is not None, "Кнопка режима клиента 👁️ отсутствует"
        assert client_btn_box["x"] > 0, "Кнопка режима клиента 👁️ невидима"

        browser.close()

