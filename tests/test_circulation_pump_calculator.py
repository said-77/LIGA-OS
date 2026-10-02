"""
Сквозной Playwright автотест модуля подбора циркуляционного насоса и магистралей отопления (v2.3.3).
Проверяет:
1. Распознавание голосовых команд ("подбор циркуляционного насоса", "какой насос поставить", "расчет магистрали отопления");
2. Вызов из меню мастера (#menu-item-pump-calc) и с экрана сметы (#btn-open-pump-calc);
3. Интерактивный расчет рабочей точки (расход Q, напор H, диаметр Rehau Stabil и скорость v ≤ 0.7 м/с);
4. Экспорт спецификации оборудования в Telegram;
5. Добавление комплекта насоса и магистрали в IndexedDB склада объекта.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8103
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

def test_voice_intent_pump_calculator(http_server):
    """Проверка распознавания голосовых команд калькулятора насоса"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        res1 = page.evaluate("() => window.app.parseVoiceCommand('подбор циркуляционного насоса')")
        assert res1 is not None
        assert res1.get('type') == 'direct_func'
        assert res1.get('target') == 'openPumpCalculator'

        res2 = page.evaluate("() => window.app.parseVoiceCommand('какой насос поставить на отопление')")
        assert res2 is not None
        assert res2.get('type') == 'direct_func'
        assert res2.get('target') == 'openPumpCalculator'

        res3 = page.evaluate("() => window.app.parseVoiceCommand('расчет магистрали отопления')")
        assert res3 is not None
        assert res3.get('type') == 'direct_func'
        assert res3.get('target') == 'openPumpCalculator'

        browser.close()

def test_open_pump_calculator_from_menu_and_estimate(http_server):
    """Проверка открытия калькулятора насоса из пульта мастера и со сметы"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 851})
        page = context.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        # 1. Открытие через пульт мастера
        page.click("#btn-more-menu-toggle")
        page.wait_for_selector("#modal-more-menu.open")

        pump_item = page.locator("#menu-item-pump-calc")
        assert pump_item.is_visible()
        pump_item.click()

        page.wait_for_selector("#modal-pump-calculator.open")
        modal = page.locator("#modal-pump-calculator")
        assert modal.is_visible()
        assert "Подбор насоса" in page.locator("#modal-pump-calculator .modal-title").text_content()

        # Закрываем
        page.click("#modal-pump-calculator .btn-close-modal")
        page.wait_for_selector("#modal-pump-calculator", state="hidden")

        # 2. Открытие со сметы
        page.click(".bottom-nav button[data-screen='estimate']")
        page.wait_for_selector("#screen-estimate.active")

        btn_est_calc = page.locator("#btn-open-pump-calc")
        assert btn_est_calc.is_visible()
        btn_est_calc.click()

        page.wait_for_selector("#modal-pump-calculator.open")
        assert page.locator("#modal-pump-calculator").is_visible()

        browser.close()

def test_interactive_pump_and_pipe_calculation(http_server):
    """Проверка интерактивного расчета расхода, напора, диаметра трубы Rehau и скорости потока"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 851})
        page = context.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        page.evaluate("() => window.app.openPumpCalculator()")
        page.wait_for_selector("#modal-pump-calculator.open")

        # Дефолтные значения: 24 кВт, дельта 15°C, плечо 25 м
        power_val = page.locator("#pump-calc-power-input").input_value()
        assert power_val == "24"

        flow_text = page.locator("#res-pump-flow").text_content()
        assert "1.38 м³/ч" in flow_text
        assert "22.9 л/мин" in flow_text

        pipe_text = page.locator("#res-pump-pipe-dia").text_content()
        assert "Rehau Rautitan Stabil" in pipe_text
        assert "32" in pipe_text

        vel_text = page.locator("#res-pump-velocity").text_content()
        assert "Норма" in vel_text or "Бесшумно" in vel_text

        pump_text = page.locator("#res-pump-model-name").text_content()
        assert "Grundfos UPS 25-60" in pump_text

        # Клик по пресету 12 кВт — труба должна переключиться на 25 мм
        page.locator("#modal-pump-calculator button.btn-preset-est:has-text('12 кВт')").click()
        assert page.locator("#pump-calc-power-input").input_value() == "12"
        pipe_12 = page.locator("#res-pump-pipe-dia").text_content()
        assert "25" in pipe_12

        # Клик по пресету 45 кВт — труба должна переключиться на 40 мм
        page.locator("#modal-pump-calculator button.btn-preset-est:has-text('45 кВт')").click()
        assert page.locator("#pump-calc-power-input").input_value() == "45"
        pipe_45 = page.locator("#res-pump-pipe-dia").text_content()
        assert "40" in pipe_45

        browser.close()

def test_copy_pump_calculation_and_materials(http_server):
    """Проверка копирования отчета для Telegram и добавления на склад материалов"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 851})
        page = context.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        page.evaluate("() => window.app.openPumpCalculator()")
        page.wait_for_selector("#modal-pump-calculator.open")

        # 1. Проверка копирования
        page.click("#btn-copy-pump-calc")
        page.wait_for_selector("#app-toast")
        toast_text = page.locator("#app-toast").text_content()
        assert "насос" in toast_text.lower() or "скопирован" in toast_text.lower()

        # 2. Добавление на склад материалов
        page.click("#btn-add-pump-to-materials")
        page.wait_for_selector("#modal-pump-calculator", state="hidden")

        # Переходим на экран склада и проверяем наличие добавленного насоса
        page.click(".bottom-nav button[data-screen='materials']")
        page.wait_for_selector("#screen-materials.active")

        materials_list = page.locator("#materials-list-container").text_content()
        assert "Grundfos" in materials_list
        assert "Rehau Rautitan Stabil" in materials_list

        browser.close()
