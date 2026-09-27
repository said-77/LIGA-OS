# -*- coding: utf-8 -*-
import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright

PORT = 8114
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACTS_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\4edf7a96-61be-4326-a9ad-2ef298bcbb5e"

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
            page.wait_for_selector("#site-name-display")

            # 1. Скриншот: Дашборд с живой кнопкой + Платеж
            page.locator("#dashboard-finances-card").scroll_into_view_if_needed()
            page.wait_for_timeout(200)
            path_btn = os.path.join(ARTIFACTS_DIR, "screenshot_v243_live_payment_btn.png")
            page.screenshot(path=path_btn)
            print(f"[OK] Live payment button screenshot saved to {path_btn}")

            # 2. Скриншот: Модал настроек с новыми швейцарскими тогглами
            page.evaluate("window.app.openModal('modal-settings')")
            page.wait_for_selector("#modal-settings.open")
            page.wait_for_timeout(300)
            path_toggles = os.path.join(ARTIFACTS_DIR, "screenshot_v243_settings_toggles.png")
            page.screenshot(path=path_toggles)
            print(f"[OK] Settings toggles screenshot saved to {path_toggles}")
            page.evaluate("window.app.closeModal('modal-settings')")
            page.wait_for_timeout(200)

            # 3. Скриншот: Экран истории объекта
            page.evaluate("window.app.switchScreen('history')")
            page.wait_for_selector("#screen-history.active")
            page.wait_for_timeout(300)
            path_history = os.path.join(ARTIFACTS_DIR, "screenshot_v243_history_scroll.png")
            page.screenshot(path=path_history)
            print(f"[OK] History scroll screenshot saved to {path_history}")

            # 4. Скриншот: Экспресс-карточка быстрого подтверждения голоса
            page.evaluate("""() => {
                window.app.showVoiceFastConfirmation({
                    type: 'material',
                    title: 'Коллектор FAR 1 дюйм на 6 выходов',
                    amount: 1800000,
                    category: 'Коллекторы'
                });
            }""")
            page.wait_for_selector("#voice-confirmation-overlay")
            page.wait_for_timeout(300)
            path_voice = os.path.join(ARTIFACTS_DIR, "screenshot_v243_voice_fast_confirmation.png")
            page.screenshot(path=path_voice)
            print(f"[OK] Voice confirmation screenshot saved to {path_voice}")

            browser.close()
    finally:
        server.shutdown()

if __name__ == "__main__":
    main()
