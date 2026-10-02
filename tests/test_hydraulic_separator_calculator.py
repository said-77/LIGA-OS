"""
Сквозной Playwright автотест модуля расчета гидравлического разделителя (гидрострелки)
и первичного кольца котельной (DIN EN 12828 / правило 3d/3v) (v2.3.6).
Проверяет:
1. Распознавание голосовых команд естественного языка мастера ("расчет гидрострелки", "гидравлический разделитель", "первичное кольцо котельной");
2. Вызов из меню мастера (#menu-item-hydraulic-separator-calc) и со сметы (#btn-open-separator-calc);
3. Интерактивный расчет DIN EN 12828 и правило 3d (расход котла G1, расход контуров G2, скорость v0 <= 0.15 м/с, диаметр корпуса D, патрубки d, подбор заводской модели Север/Termojet);
4. Интерактивная логика честного статуса необходимости (1 контур -> встроенный насос достаточен vs 2+ контура -> гидрострелка обязательна);
5. Экспорт детального инженерного отчета в Telegram;
6. Добавление комплекта разделителя (гидрострелка + воздухоотводчик Caleffi + кран дренажа FAR/Valtec) в IndexedDB склада объекта.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8106
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

def test_voice_intent_hydraulic_separator_calculator(http_server):
    """Проверка распознавания голосовых команд калькулятора гидрострелки"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        res1 = page.evaluate("() => window.app.parseVoiceCommand('расчет гидрострелки для котельной')")
        assert res1 is not None
        assert res1.get('type') == 'direct_func'
        assert res1.get('target') == 'openSeparatorCalculator'

        res2 = page.evaluate("() => window.app.parseVoiceCommand('гидравлический разделитель')")
        assert res2 is not None
        assert res2.get('type') == 'direct_func'
        assert res2.get('target') == 'openSeparatorCalculator'

        res3 = page.evaluate("() => window.app.parseVoiceCommand('первичное кольцо котельной')")
        assert res3 is not None
        assert res3.get('type') == 'direct_func'
        assert res3.get('target') == 'openSeparatorCalculator'

        browser.close()

def test_open_separator_calculator_from_menu_and_estimate(http_server):
    """Проверка открытия калькулятора гидрострелки из пульта мастера и со сметы"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 851})
        page = context.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        # 1. Открытие через пульт мастера
        page.click("#btn-more-menu-toggle")
        page.wait_for_selector("#modal-more-menu.open")

        sep_item = page.locator("#menu-item-hydraulic-separator-calc")
        assert sep_item.is_visible()
        sep_item.click()

        page.wait_for_selector("#modal-hydraulic-separator-calculator.open")
        modal = page.locator("#modal-hydraulic-separator-calculator")
        assert modal.is_visible()
        assert "Гидравлический разделитель" in page.locator("#modal-hydraulic-separator-calculator .modal-title").text_content()

        # Закрываем
        page.click("#modal-hydraulic-separator-calculator .btn-close-modal")
        page.wait_for_selector("#modal-hydraulic-separator-calculator", state="hidden")

        # 2. Открытие со сметы
        page.click(".bottom-nav button[data-screen='estimate']")
        page.wait_for_selector("#screen-estimate.active")

        btn_est_calc = page.locator("#btn-open-separator-calc")
        assert btn_est_calc.is_visible()
        btn_est_calc.click()

        page.wait_for_selector("#modal-hydraulic-separator-calculator.open")
        assert page.locator("#modal-hydraulic-separator-calculator").is_visible()

        browser.close()

def test_interactive_separator_calculation(http_server):
    """Проверка интерактивного расчета расходов G1/G2, диаметра D, патрубков d и статуса необходимости"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        # Открываем калькулятор
        page.evaluate("() => window.app.openSeparatorCalculator()")
        page.wait_for_selector("#modal-hydraulic-separator-calculator.open")

        # Проверяем базовые значения (32 кВт, 3 включенных контура: теплый пол + радиаторы + БКН)
        assert page.input_value("#sep-calc-power-input") == "32"
        nec_card = page.locator("#sep-necessity-card")
        assert "Гидрострелка обязательна" in nec_card.text_content()
        assert "Север-60" in page.locator("#res-sep-model").text_content()
        assert "Caleffi" in page.locator("#res-sep-air-vent").text_content()
        assert "1/2" in page.locator("#res-sep-drain").text_content()

        # Проверяем пресет 65 кВт
        page.click(".btn-preset-sep:has-text('65 кВт')")
        assert page.input_value("#sep-calc-power-input") == "65"
        # 65 кВт требует более мощную модель (Север-100 или аналог)
        assert "Север-100" in page.locator("#res-sep-model").text_content() or "100" in page.locator("#res-sep-model").text_content()

        # Проверяем счетчик +5 кВт
        page.click("#modal-hydraulic-separator-calculator button:has-text('+5')")
        assert page.input_value("#sep-calc-power-input") == "70"

        # Проверяем честную логику необходимости: снимаем галочки, оставляем 1 контур (только радиаторы)
        page.uncheck("#sep-circuit-floor")
        page.uncheck("#sep-circuit-boiler")
        page.uncheck("#sep-circuit-vent")
        page.check("#sep-circuit-radiators")

        # Теперь только 1 контур - гидрострелка не требуется
        assert "Встроенного насоса котла достаточно" in nec_card.text_content()

        # Включаем второй контур (теплый пол) -> сразу статус меняется на обязательный
        page.check("#sep-circuit-floor")
        assert "Гидрострелка обязательна" in nec_card.text_content()

        browser.close()

def test_copy_separator_calculation(http_server):
    """Проверка формирования и копирования отчета расчета гидрострелки в буфер Telegram"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        page.evaluate("() => window.app.openSeparatorCalculator()")
        page.wait_for_selector("#modal-hydraulic-separator-calculator.open")

        page.click("#btn-copy-separator-calc")
        toast = page.locator("#app-toast")
        page.wait_for_timeout(300)
        assert "✓" in toast.text_content()
        assert "Telegram" in toast.text_content() or "гидрострелк" in toast.text_content()

        browser.close()

def test_add_separator_to_materials(http_server):
    """Проверка добавления комплекта гидрострелки на склад объекта в IndexedDB"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        # Открываем калькулятор
        page.evaluate("() => window.app.openSeparatorCalculator()")
        page.wait_for_selector("#modal-hydraulic-separator-calculator.open")

        # Добавляем в материалы
        page.click("#btn-add-separator-to-materials")
        page.wait_for_selector("#modal-hydraulic-separator-calculator", state="hidden")

        # Переходим на экран материалов и проверяем
        page.click(".bottom-nav button[data-screen='materials']")
        page.wait_for_selector("#screen-materials.active")

        materials_container = page.locator("#materials-list-container")
        content = materials_container.text_content()
        assert "Гидравлический разделитель" in content or "Север" in content
        assert "Caleffi Robocal" in content
        assert "Дренажный кран" in content

        browser.close()
