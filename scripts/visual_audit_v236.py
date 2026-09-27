"""
Скрипт комплексного визуального скриншот-аудита системы LIGA OS (v2.3.6)
Фиксирует в высоком разрешении ключевые экраны и модальные инструменты мастера
перед демонстрацией инженеру Улугбеку Хакимову.
"""

import os
import sys
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = 8107
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOTS_DIR = os.path.join(ROOT_DIR, "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def start_server():
    os.chdir(ROOT_DIR)
    server = HTTPServer(('127.0.0.1', PORT), QuietHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    return server

def run_visual_audit():
    print("🚀 Запуск HTTP-сервера для визуального аудита на порту", PORT)
    server = start_server()
    time.sleep(0.5)

    try:
        with sync_playwright() as p:
            # Эмуляция экрана современного смартфона (iPhone 14 Pro, 393x852)
            device = p.devices['iPhone 14 Pro']
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(**device, locale="ru-RU")
            page = context.new_page()

            print("1. Открытие LIGA OS...")
            page.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="networkidle")
            page.wait_for_selector(".top-header")
            time.sleep(1.0) # даем IndexedDB сидировать ЖК Infinity

            # 1. Главный Дашборд (Dark Titanium)
            print("📸 Скриншот 1: Главный Дашборд (Dark Titanium)...")
            path1 = os.path.join(SCREENSHOTS_DIR, "01_dashboard_dark.png")
            page.screenshot(path=path1, full_page=False)

            # 2. Главный Дашборд (Light Ceramic)
            print("📸 Скриншот 2: Главный Дашборд (Light Ceramic)...")
            page.evaluate("() => window.app.applyTheme('light', false)")
            time.sleep(0.5)
            path2 = os.path.join(SCREENSHOTS_DIR, "02_dashboard_light.png")
            page.screenshot(path=path2, full_page=False)

            # Возвращаем тему Dark Titanium для остальных скриншотов
            page.evaluate("() => window.app.applyTheme('dark', false)")
            time.sleep(0.4)

            # 3. Швейцарский пульт инженера («⋯ Меню»)
            print("📸 Скриншот 3: Швейцарский пульт инженера («⋯ Меню»)...")
            page.click("#btn-more-menu-toggle")
            page.wait_for_selector("#modal-more-menu.open")
            time.sleep(0.5)
            path3 = os.path.join(SCREENSHOTS_DIR, "03_swiss_master_menu.png")
            page.screenshot(path=path3, full_page=False)
            page.evaluate("() => window.app.closeModal('modal-more-menu')")
            page.wait_for_selector("#modal-more-menu", state="hidden")

            # 4. Калькулятор гидравлического разделителя (гидрострелки) v2.3.6
            print("📸 Скриншот 4: Калькулятор гидрострелки и первичного кольца...")
            page.evaluate("() => window.app.openSeparatorCalculator()")
            page.wait_for_selector("#modal-hydraulic-separator-calculator.open")
            time.sleep(0.5)
            path4 = os.path.join(SCREENSHOTS_DIR, "04_hydraulic_separator_calc.png")
            page.screenshot(path=path4, full_page=False)
            page.evaluate("() => window.app.closeModal('modal-hydraulic-separator-calculator')")
            page.wait_for_selector("#modal-hydraulic-separator-calculator", state="hidden")

            # 5. Калькулятор расширительного бака Reflex N и клапана Caleffi
            print("📸 Скриншот 5: Калькулятор расширительного бака Reflex N...")
            page.evaluate("() => window.app.openExpansionTankCalculator()")
            page.wait_for_selector("#modal-expansion-tank-calculator.open")
            time.sleep(0.5)
            path5 = os.path.join(SCREENSHOTS_DIR, "05_expansion_tank_calc.png")
            page.screenshot(path=path5, full_page=False)
            page.evaluate("() => window.app.closeModal('modal-expansion-tank-calculator')")
            page.wait_for_selector("#modal-expansion-tank-calculator", state="hidden")

            # 6. Калькулятор циркуляционного насоса и магистралей Rehau
            print("📸 Скриншот 6: Калькулятор циркуляционного насоса...")
            page.evaluate("() => window.app.openPumpCalculator()")
            page.wait_for_selector("#modal-pump-calculator.open")
            time.sleep(0.5)
            path6 = os.path.join(SCREENSHOTS_DIR, "06_pump_pipe_calc.png")
            page.screenshot(path=path6, full_page=False)
            page.evaluate("() => window.app.closeModal('modal-pump-calculator')")
            page.wait_for_selector("#modal-pump-calculator", state="hidden")

            # 7. Калькулятор балансировки ротаметров коллектора FAR
            print("📸 Скриншот 7: Калькулятор балансировки ротаметров...")
            page.evaluate("() => window.app.openBalancingCalculator()")
            page.wait_for_selector("#modal-balancing-calculator.open")
            time.sleep(0.5)
            path7 = os.path.join(SCREENSHOTS_DIR, "07_balancing_rotameters_calc.png")
            page.screenshot(path=path7, full_page=False)
            page.evaluate("() => window.app.closeModal('modal-balancing-calculator')")
            page.wait_for_selector("#modal-balancing-calculator", state="hidden")

            # 8. Модуль гибких стандартов опрессовки
            print("📸 Скриншот 8: Модуль опрессовки и стандартов Ташкента...")
            page.evaluate("() => window.app.openModal('modal-pressure-test')")
            page.wait_for_selector("#modal-pressure-test.open")
            time.sleep(0.5)
            path8 = os.path.join(SCREENSHOTS_DIR, "08_flexible_pressure_test.png")
            page.screenshot(path=path8, full_page=False)
            page.evaluate("() => window.app.closeModal('modal-pressure-test')")
            page.wait_for_selector("#modal-pressure-test", state="hidden")

            # 9. Калькулятор защиты от протечек Neptun Smart
            print("📸 Скриншот 9: Калькулятор защиты от протечек...")
            page.evaluate("() => window.app.openLeakCalculator()")
            page.wait_for_selector("#modal-leak-calculator.open")
            time.sleep(0.5)
            path9 = os.path.join(SCREENSHOTS_DIR, "09_leak_protection_calc.png")
            page.screenshot(path=path9, full_page=False)
            page.evaluate("() => window.app.closeModal('modal-leak-calculator')")
            page.wait_for_selector("#modal-leak-calculator", state="hidden")

            # 10. Склад объекта (Материалы)
            print("📸 Скриншот 10: Экран снабжения и склада...")
            page.click(".bottom-nav button[data-screen='materials']")
            page.wait_for_selector("#screen-materials.active")
            time.sleep(0.5)
            path10 = os.path.join(SCREENSHOTS_DIR, "10_materials_stock.png")
            page.screenshot(path=path10, full_page=False)

            browser.close()
            print("✅ Все 10 скриншотов успешно сняты и сохранены в папку screenshots/!")
    finally:
        server.shutdown()

if __name__ == "__main__":
    run_visual_audit()
