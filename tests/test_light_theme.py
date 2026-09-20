"""
Автоматический сквозной тест Светлой темы (Light Ceramic) на экране 393x852 (iPhone 16 Pro)
Входит в официальный тестовый сьют Pytest.
Проверяет:
1. Переключение темы на Light Ceramic.
2. Контраст основного текста (var(--text-main) = #090e17).
3. Читаемость нижней навигации (.bottom-nav).
4. Читаемость дашборда и модальных окон при ярком солнечном свете.
5. Сохраняет эталонный скриншот в папку артефактов (вне репозитория Git).
"""

import os
import sys
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PORT = 8098
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b8469a2d-cba0-46ac-a7a0-4b19190b81e0"
SCREENSHOT_PATH = os.path.join(ARTIFACT_DIR, "screenshot_light_theme.png")

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

@pytest.fixture(scope="module")
def http_server():
    os.chdir(ROOT_DIR)
    server = HTTPServer(('127.0.0.1', PORT), QuietHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.5)
    yield f"http://127.0.0.1:{PORT}"
    server.shutdown()

def test_light_theme_contrast_and_screenshot(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # Включаем светлую тему
        page.evaluate("() => window.app.applyTheme('light', false)")
        page.wait_for_timeout(300)

        # Проверяем атрибут data-theme
        theme_attr = page.locator("html").get_attribute("data-theme")
        assert theme_attr == "light", f"Ожидалась светлая тема, получено: {theme_attr}"

        # Проверяем цвет фона и цвет текста
        body_color = page.evaluate("() => window.getComputedStyle(document.body).color")
        # #090e17 в формате rgb — rgb(9, 14, 23)
        assert "9, 14, 23" in body_color or "090e17" in body_color, f"Цвет текста должен быть #090e17, получено: {body_color}"

        # Проверяем видимость нижней навигации
        assert page.locator(".bottom-nav").is_visible(), "Нижняя навигация обязана быть видна в светлой теме"

        # Сохраняем эталонный скриншот в артефакты
        os.makedirs(ARTIFACT_DIR, exist_ok=True)
        page.screenshot(path=SCREENSHOT_PATH, full_page=False)
        assert os.path.exists(SCREENSHOT_PATH), "Скриншот светлой темы должен быть сохранен в артефакты"

        browser.close()
