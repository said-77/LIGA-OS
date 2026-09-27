# -*- coding: utf-8 -*-
"""
Создание скриншотов высокого разрешения для LIGA OS v2.4.4:
1. Мобильный экран с кнопкой «🎬 ГИД» и интерактивными карточками дашборда;
2. Модальное окно выбора формата Инженерного Гида LIGA OS;
3. Живой Spotlight-тур на мобильном (Шаг 1: Текущий объект, Bottom Sheet карточка);
4. Живой Spotlight-тур на мобильном (Шаг 2: Долг клиента с подсветкой).
"""
import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright

PORT = 8119
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\4edf7a96-61be-4326-a9ad-2ef298bcbb5e"

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def capture_screenshots():
    os.chdir(ROOT_DIR)
    server = HTTPServer(('127.0.0.1', PORT), QuietHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.5)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Мобильный вьюпорт смартфона (393 x 852 px)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()
        page.goto(f"http://127.0.0.1:{PORT}/index.html")
        page.wait_for_selector("#site-name-display")
        time.sleep(0.5)

        # Скриншот 1: Мобильный дашборд с четкой кнопкой «🎬 ГИД» и Drill-Down плашками
        path_dash = os.path.join(ARTIFACT_DIR, "screenshot_v244_mobile_dashboard_guide_btn.png")
        page.screenshot(path=path_dash, full_page=False)
        print(f"Captured: {path_dash}")

        # Скриншот 2: Модальное окно понятного выбора формата гида
        page.locator("#btn-video-tour-open").click()
        page.wait_for_selector("#modal-system-guide", state="visible")
        time.sleep(0.4)
        path_modal = os.path.join(ARTIFACT_DIR, "screenshot_v244_mobile_guide_modal_choices.png")
        page.screenshot(path=path_modal, full_page=False)
        print(f"Captured: {path_modal}")

        # Скриншот 3: Живой Spotlight-тур на мобильном (Шаг 1: Текущий объект мастера)
        page.locator("#btn-guide-choice-tour").click()
        page.wait_for_selector("#spotlight-tour-overlay", state="visible")
        time.sleep(0.4)
        path_tour1 = os.path.join(ARTIFACT_DIR, "screenshot_v244_mobile_live_tour_step1.png")
        page.screenshot(path=path_tour1, full_page=False)
        print(f"Captured: {path_tour1}")

        # Скриншот 4: Живой Spotlight-тур на мобильном (Шаг 2: Долг клиента)
        page.locator("#btn-spotlight-next").click()
        time.sleep(0.4)
        path_tour2 = os.path.join(ARTIFACT_DIR, "screenshot_v244_mobile_live_tour_step2.png")
        page.screenshot(path=path_tour2, full_page=False)
        print(f"Captured: {path_tour2}")

        # Закрываем тур
        page.locator("#btn-spotlight-finish").click()
        time.sleep(0.3)

        browser.close()

    server.shutdown()
    print("All v2.4.4 mobile screenshots captured successfully!")

if __name__ == "__main__":
    capture_screenshots()
