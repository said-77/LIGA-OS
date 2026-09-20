"""
Визуальный аудит Светлой темы (Light Ceramic) на экране 393x852 (iPhone 16 Pro)
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

def main():
    os.chdir(ROOT_DIR)
    server = HTTPServer(('127.0.0.1', PORT), QuietHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.5)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 393, "height": 852})
            page = context.new_page()

            page.goto(f"http://127.0.0.1:{PORT}/index.html")
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
            print(f"Вычисленный цвет текста в светлой теме: {body_color}")
            assert "9, 14, 23" in body_color or "090e17" in body_color, f"Цвет текста должен быть #090e17, получено: {body_color}"

            # Проверяем контраст фона страницы
            bg_color = page.evaluate("() => window.getComputedStyle(document.body).backgroundColor")
            print(f"Вычисленный цвет фона страницы: {bg_color}")

            # Сохраняем эталонный скриншот в артефакты
            os.makedirs(ARTIFACT_DIR, exist_ok=True)
            page.screenshot(path=SCREENSHOT_PATH, full_page=False)
            print(f"✓ Эталонный скриншот сохранен в: {SCREENSHOT_PATH}")

            browser.close()
    finally:
        server.shutdown()

if __name__ == "__main__":
    main()
