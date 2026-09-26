"""
Сквозной Playwright автотест модуля подбора мембранного расширительного бака Reflex
и предохранительного клапана безопасности DIN EN 12828 (v2.3.4).
Проверяет:
1. Распознавание голосовых команд ("расчет расширительного бака", "подбери рефлекс", "сбросной клапан и бак отопления");
2. Вызов из меню мастера (#menu-item-expansion-tank-calc) и с экрана сметы (#btn-open-expansion-tank-calc);
3. Интерактивный расчет DIN EN 12828 (емкость системы Vs, расширение Ve, давление накачки P0, подбор бака Reflex N и клапана Caleffi 3 бар);
4. Экспорт отчета расчета в Telegram;
5. Добавление комплекта безопасности котельной (Reflex N + Reflex SU + Caleffi 3 бар) в IndexedDB склада объекта.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8104
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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

def test_voice_intent_expansion_tank_calculator(http_server):
    """Проверка распознавания голосовых команд калькулятора расширительного бака"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        res1 = page.evaluate("() => window.app.parseVoiceCommand('расчет расширительного бака отопления')")
        assert res1 is not None
        assert res1.get('type') == 'direct_func'
        assert res1.get('target') == 'openExpansionTankCalculator'

        res2 = page.evaluate("() => window.app.parseVoiceCommand('подбери рефлекс для котла')")
        assert res2 is not None
        assert res2.get('type') == 'direct_func'
        assert res2.get('target') == 'openExpansionTankCalculator'

        res3 = page.evaluate("() => window.app.parseVoiceCommand('сбросной клапан caleffi и расширительный бак')")
        assert res3 is not None
        assert res3.get('type') == 'direct_func'
        assert res3.get('target') == 'openExpansionTankCalculator'

        browser.close()

def test_open_expansion_tank_calculator_from_menu_and_estimate(http_server):
    """Проверка открытия калькулятора расширительного бака из пульта мастера и со сметы"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 851})
        page = context.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        # 1. Открытие через пульт мастера
        page.click("#btn-more-menu-toggle")
        page.wait_for_selector("#modal-more-menu.open")

        tank_item = page.locator("#menu-item-expansion-tank-calc")
        assert tank_item.is_visible()
        tank_item.click()

        page.wait_for_selector("#modal-expansion-tank-calculator.open")
        modal = page.locator("#modal-expansion-tank-calculator")
        assert modal.is_visible()
        assert "Мембранный бак Reflex" in page.locator("#modal-expansion-tank-calculator .modal-title").text_content()

        # Закрываем
        page.click("#modal-expansion-tank-calculator .btn-close-modal")
        page.wait_for_selector("#modal-expansion-tank-calculator", state="hidden")

        # 2. Открытие со сметы
        page.click(".bottom-nav button[data-screen='estimate']")
        page.wait_for_selector("#screen-estimate.active")

        btn_est_calc = page.locator("#btn-open-expansion-tank-calc")
        assert btn_est_calc.is_visible()
        btn_est_calc.click()

        page.wait_for_selector("#modal-expansion-tank-calculator.open")
        assert page.locator("#modal-expansion-tank-calculator").is_visible()

        browser.close()

def test_interactive_expansion_tank_calculation(http_server):
    """Проверка интерактивного расчета емкости, давления P0, бака Reflex и клапана"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        # Открываем калькулятор
        page.evaluate("() => window.app.openExpansionTankCalculator()")
        page.wait_for_selector("#modal-expansion-tank-calculator.open")

        # Дефолтные значения: 24 кВт, combo (16 л/кВт), 2 этажа (Pst=0.8), вода
        assert "384 л" in page.locator("#res-exp-total-volume").text_content()
        assert "1.1 бар" in page.locator("#res-exp-p0").text_content()
        assert "Reflex N 50" in page.locator("#res-exp-tank-model").text_content()
        assert "Reflex SU 3/4\"" in page.locator("#res-exp-service-valve").text_content()
        assert "Caleffi 3.0 бар" in page.locator("#res-exp-safety-valve").text_content()

        # Клик по пресету 12 кВт
        page.click("#modal-expansion-tank-calculator button:has-text('12 кВт')")
        assert page.input_value("#exp-calc-power-input") == "12"
        # 12 * 16 = 192 л
        assert "192 л" in page.locator("#res-exp-total-volume").text_content()
        # Для 192 л объем бака меньше 25 л -> Reflex N 25
        assert "Reflex N 25" in page.locator("#res-exp-tank-model").text_content()

        # Меняем систему на "Только водяной теплый пол" (22 л/кВт)
        page.select_option("#exp-calc-system-type-select", "floor_only")
        # 12 * 22 = 264 л
        assert "264 л" in page.locator("#res-exp-total-volume").text_content()

        # Меняем этажность на 3 этажа (Pst = 1.1 бар, P0 = 1.4 бар)
        page.select_option("#exp-calc-floors-select", "3")
        assert "1.4 бар" in page.locator("#res-exp-p0").text_content()

        browser.close()

def test_copy_expansion_tank_calculation(http_server):
    """Проверка формирования и копирования отчета расчета в буфер Telegram"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        page.evaluate("() => window.app.openExpansionTankCalculator()")
        page.wait_for_selector("#modal-expansion-tank-calculator.open")

        page.click("#btn-copy-expansion-tank-calc")
        toast = page.locator("#app-toast")
        page.wait_for_timeout(300)
        assert "✓" in toast.text_content()
        assert "Telegram" in toast.text_content() or "скопирован" in toast.text_content() or "сформирован" in toast.text_content()

        browser.close()

def test_add_expansion_tank_to_materials(http_server):
    """Проверка добавления комплекта безопасности Reflex + Caleffi в закупку на склад"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        # Открываем калькулятор
        page.evaluate("() => window.app.openExpansionTankCalculator()")
        page.wait_for_selector("#modal-expansion-tank-calculator.open")

        # Нажимаем кнопку добавления на склад
        page.click("#btn-add-expansion-tank-to-materials")
        page.wait_for_selector("#modal-expansion-tank-calculator", state="hidden")

        # Переходим на склад и проверяем новые позиции
        page.click(".bottom-nav button[data-screen='materials']")
        page.wait_for_selector("#screen-materials.active")

        materials_container = page.locator("#materials-list-container")
        content = materials_container.text_content()
        assert "Reflex" in content
        assert "Caleffi" in content
        assert "Сервисный кран" in content or "Reflex SU" in content

        browser.close()
