"""
Сквозной Playwright автотест модуля гидравлического балансировщика ротаметров (v2.3.2).
Проверяет:
1. Распознавание голосовых команд мастера ("балансировка коллектора", "настрой ротаметры", "расходомеры");
2. Открытие калькулятора из швейцарского меню мастера (#menu-item-balancing-calc) и с экрана сметы (#btn-open-balancing-calc);
3. Интерактивное управление количеством контуров (пресеты 3, 4, 6 выходов, счетчик +/-) и длинами петель;
4. Точный гидравлический расчет уставок ротаметров (л/мин), положение поплавков и автоподбор режима насоса Grundfos;
5. Копирование инженерной шпаргалки для Telegram;
6. Генерацию печатной наклейки-памятки на дверцу коллекторного шкафа ШРВ.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8102
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

def test_voice_intent_balancing_calculator(http_server):
    """Проверка распознавания голосовых команд балансировки коллектора"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        # Тестируем метод parseVoiceCommand
        res1 = page.evaluate("() => window.app.parseVoiceCommand('настрой ротаметры на коллекторе')")
        assert res1 is not None
        assert res1.get('type') == 'direct_func'
        assert res1.get('target') == 'openBalancingCalculator'

        res2 = page.evaluate("() => window.app.parseVoiceCommand('гидравлическая балансировка теплого пола')")
        assert res2 is not None
        assert res2.get('type') == 'direct_func'
        assert res2.get('target') == 'openBalancingCalculator'

        res3 = page.evaluate("() => window.app.parseVoiceCommand('расходомер гребенки')")
        assert res3 is not None
        assert res3.get('type') == 'direct_func'
        assert res3.get('target') == 'openBalancingCalculator'

        browser.close()

def test_open_balancing_calculator_from_menu_and_estimate(http_server):
    """Проверка открытия калькулятора балансировки из меню и со сметы"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 851})
        page = context.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        # 1. Открытие через кнопку Меню
        page.click("#btn-more-menu-toggle")
        page.wait_for_selector("#modal-more-menu.open")

        balancing_item = page.locator("#menu-item-balancing-calc")
        assert balancing_item.is_visible()
        balancing_item.click()

        page.wait_for_selector("#modal-balancing-calculator.open")
        modal = page.locator("#modal-balancing-calculator")
        assert modal.is_visible()
        assert "Балансировка ротаметров" in page.locator("#modal-balancing-calculator .modal-title").text_content()

        # Закрываем модальное окно
        page.click("#modal-balancing-calculator .btn-close-modal")
        page.wait_for_selector("#modal-balancing-calculator", state="hidden")

        # 2. Открытие с экрана сметы
        page.click(".bottom-nav button[data-screen='estimate']")
        page.wait_for_selector("#screen-estimate.active")

        btn_est_calc = page.locator("#btn-open-balancing-calc")
        assert btn_est_calc.is_visible()
        btn_est_calc.click()

        page.wait_for_selector("#modal-balancing-calculator.open")
        assert page.locator("#modal-balancing-calculator").is_visible()

        browser.close()

def test_interactive_calculation_and_rotameters(http_server):
    """Интерактивное изменение контуров, длин петель, расчет л/мин и положение поплавков"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 851})
        page = context.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        # Открываем калькулятор
        page.evaluate("() => window.app.openBalancingCalculator()")
        page.wait_for_selector("#modal-balancing-calculator.open")

        # По умолчанию 5 контуров
        count_val = page.locator("#balancing-loops-count-val").text_content().strip()
        assert count_val == "5"

        loops = page.locator("#balancing-loops-list .balancing-loop-card")
        assert loops.count() == 5

        # Проверяем уставку первого контура (по умолчанию 75 м -> 2.4 л/мин)
        first_flow = page.locator("#loop-flow-val-0").text_content().strip()
        assert "2.4" in first_flow

        # Увеличиваем длину первого контура на +5 м (станет 80 м -> 80 * 0.03152 = 2.52 -> 2.5 л/мин)
        page.locator("#balancing-loops-list .balancing-loop-card").nth(0).locator("button:has-text('+5')").click()
        time.sleep(0.1)

        first_flow_updated = page.locator("#loop-flow-val-0").text_content().strip()
        assert "2.5" in first_flow_updated

        # Проверяем положение поплавка (pct = 2.5 / 5.0 * 100 = 50%)
        float_style = page.locator("#loop-rotameter-float-0").get_attribute("style")
        assert "50%" in float_style

        # Переключаем пресет на 4 выхода
        page.locator("button.btn-preset-est:has-text('4 выхода')").click()
        assert page.locator("#balancing-loops-count-val").text_content().strip() == "4"
        assert page.locator("#balancing-loops-list .balancing-loop-card").count() == 4

        # Проверяем сводные показатели
        total_pipe = page.locator("#res-balancing-total-pipe").text_content()
        assert "м" in total_pipe

        total_flow = page.locator("#res-balancing-total-flow").text_content()
        assert "л/мин" in total_flow
        assert "м³/ч" in total_flow

        pump_mode = page.locator("#res-balancing-pump-mode").text_content()
        assert "Grundfos 25-60" in pump_mode

        browser.close()

def test_copy_cheat_sheet_and_cabinet_sticker(http_server):
    """Проверка копирования шпаргалки для Telegram и создания наклейки на шкаф"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 851})
        page = context.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        # Открываем калькулятор
        page.evaluate("() => window.app.openBalancingCalculator()")
        page.wait_for_selector("#modal-balancing-calculator.open")

        # 1. Проверка копирования шпаргалки
        page.click("#btn-copy-balancing-calc")
        # Должен появиться Toast с подтверждением
        page.wait_for_selector("#app-toast")
        toast_text = page.locator("#app-toast").text_content()
        assert "Шпаргалка" in toast_text or "скопирован" in toast_text

        # 2. Проверка генерации печатного стикера
        # Переопределяем window.print чтобы не блокировать выполнение в headless
        page.evaluate("() => { window.__printed = false; window.print = () => { window.__printed = true; }; }")
        page.click("#btn-print-balancing-sticker")

        was_printed = page.evaluate("() => window.__printed")
        assert was_printed is True

        # Проверяем созданный стикер
        sticker = page.locator("#balancing-print-sticker-container")
        assert sticker.count() > 0
        sticker_text = sticker.text_content()
        assert "Лига Опытных Мастеров" in sticker_text
        assert "Улугбека Хакимова" in sticker_text
        assert "Коллекторный шкаф" in sticker_text
        assert "Гарантийные условия — по договору" in sticker_text
        assert "Стандарт 16 бар" not in sticker_text

        browser.close()
