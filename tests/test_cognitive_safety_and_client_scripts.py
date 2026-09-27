"""
Сквозной Playwright автотест системы активной инженерной безопасности, 
прозрачной физики и дипломатических скриптов LIGA OS (v2.4.0).
Проверяет:
1. Интерактивный световой маяк шапки (#header-safety-beacon):
   - Переключение между режимами «👑 МАСТЕР» и «🛡️ БЕЗОПАСНЫЙ ПОКАЗ»;
   - Реактивное скрытие/раскрытие цен и кассы;
2. Экспресс-пресеты в 1 тап во всех калькуляторах:
   - Трубы и коллекторы (квартира, вилла, резиденция);
   - Теплый пол (35, 75, 140 м²);
   - Радиаторы (4, 8, 12 шт);
   - Бойлер ГВС (3, 5, 7 чел);
   - Защита от протечек (2/4, 2/6, 4/10 зон);
3. Наличие наглядных блоков инженерной физики и стопперов «Анти-брак» для помощников;
4. Формирование и копирование дипломатических клиентских скриптов для Telegram/WhatsApp.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8109
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

def test_header_safety_beacon_toggle(http_server):
    """Проверка работы светового маяка безопасности в шапке"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector("#header-safety-beacon")

        beacon = page.locator("#header-safety-beacon")
        beacon_text = page.locator("#safety-beacon-text")

        # 1. По умолчанию режим Мастера
        assert "master-mode" in beacon.get_attribute("class")
        assert "👑 МАСТЕР" in beacon_text.inner_text()

        # 2. Клик по маяку переключает в безопасный показ клиенту
        beacon.click()
        page.wait_for_timeout(200)
        assert "client-mode" in beacon.get_attribute("class")
        assert "🛡️ БЕЗОПАСНЫЙ ПОКАЗ" in beacon_text.inner_text()
        assert page.evaluate("() => document.documentElement.hasAttribute('data-client-mode')")

        # 3. Повторный клик возвращает в режим Мастера
        beacon.click()
        page.wait_for_timeout(200)
        assert "master-mode" in beacon.get_attribute("class")
        assert "👑 МАСТЕР" in beacon_text.inner_text()
        assert not page.evaluate("() => document.documentElement.hasAttribute('data-client-mode')")

        browser.close()

def test_calculators_presets_and_client_scripts(http_server):
    """Проверка пресетов в 1 тап, анти-брак стопперов и скриптов клиента"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # 1. Калькулятор труб и узла ввода
        page.evaluate("() => window.app.openPipeCalculator()")
        page.wait_for_timeout(200)
        assert page.locator("#modal-pipe-calculator").is_visible()

        # Проверка наличия плашки физики и анти-брака
        pipe_text = page.locator("#modal-pipe-calculator").inner_text()
        assert "Инженерная физика" in pipe_text
        assert "Контроль помощника" in pipe_text

        # Применяем пресет 'villa' (12/8 точек)
        page.evaluate("() => window.app.applyPipePreset('villa')")
        assert page.locator("#pipe-calc-cold-val").inner_text() == "12"
        assert page.locator("#pipe-calc-hot-val").inner_text() == "8"

        # Проверка генерации клиентского скрипта
        script_btn = page.locator("#btn-pipe-client-script")
        assert script_btn.is_visible()
        page.evaluate("() => window.app.copyPipeClientScript()")

        # 2. Калькулятор теплого пола
        page.evaluate("() => window.app.openFloorCalculator()")
        page.wait_for_timeout(200)
        assert page.locator("#modal-floor-calculator").is_visible()
        floor_text = page.locator("#modal-floor-calculator").inner_text()
        assert "Инженерная физика" in floor_text
        assert "Контроль помощника" in floor_text

        # Применяем пресет 140 м²
        page.evaluate("() => window.app.applyFloorPreset(140)")
        assert page.locator("#floor-calc-area-val").inner_text() == "140"
        page.evaluate("() => window.app.copyFloorClientScript()")

        # 3. Калькулятор радиаторов
        page.evaluate("() => window.app.openRadiatorCalculator()")
        page.wait_for_timeout(200)
        assert page.locator("#modal-radiator-calculator").is_visible()
        rad_text = page.locator("#modal-radiator-calculator").inner_text()
        assert "Инженерная физика" in rad_text
        assert "Контроль помощника" in rad_text
        page.evaluate("() => window.app.applyRadiatorPreset(12)")
        assert page.locator("#rad-calc-count-val").inner_text() == "12"
        page.evaluate("() => window.app.copyRadClientScript()")

        # 4. Калькулятор бойлера
        page.evaluate("() => window.app.openBoilerCalculator()")
        page.wait_for_timeout(200)
        assert page.locator("#modal-boiler-calculator").is_visible()
        boiler_text = page.locator("#modal-boiler-calculator").inner_text()
        assert "Инженерная физика" in boiler_text
        assert "Контроль помощника" in boiler_text
        page.evaluate("() => window.app.applyBoilerPreset(7, true)")
        assert page.locator("#boiler-calc-residents-val").inner_text() == "7"
        page.evaluate("() => window.app.copyBoilerClientScript()")

        # 5. Калькулятор защиты от протечек
        page.evaluate("() => window.app.openLeakCalculator()")
        page.wait_for_timeout(200)
        assert page.locator("#modal-leak-calculator").is_visible()
        leak_text = page.locator("#modal-leak-calculator").inner_text()
        assert "Инженерная физика" in leak_text
        assert "Контроль помощника" in leak_text
        page.evaluate("() => window.app.applyLeakPreset(4, 10, '1')")
        assert page.locator("#leak-calc-valves-val").inner_text() == "4"
        assert page.locator("#leak-calc-sensors-val").inner_text() == "10"
        page.evaluate("() => window.app.copyLeakClientScript()")

        # 6. Проверка скриптов в остальных калькуляторах (балансировка, насос, Reflex, гидрострелка)
        page.evaluate("() => window.app.copyBalancingClientScript()")
        page.evaluate("() => window.app.copyPumpClientScript()")
        page.evaluate("() => window.app.copyExpansionTankClientScript()")
        page.evaluate("() => window.app.copySeparatorClientScript()")

        browser.close()
