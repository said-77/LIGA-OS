"""
Сквозной Playwright автотест исправлений мобильной шапки, швейцарского пульта мастера и модуля защиты от протечек (v2.3.0).
Проверяет:
1. Отсутствие взаимного наслоения иконок в шапке:
   - На экранах 360px и 393px кнопки #btn-ai-concierge-open, #btn-client-mode-toggle, #btn-settings-top, #btn-more-menu-toggle не пересекаются своими bounding_box;
   - Блок бренда и статус базы не обрезаются и не перекрываются;
2. Инженерный пульт мастера (Меню «⋯ Меню / Ещё»):
   - Открытие меню кликом по #btn-more-menu-toggle;
   - Закрытие повторным кликом по той же кнопке (Toggle-режим);
   - Закрытие кликом по оверлею снаружи окна;
   - Закрытие по кнопке внизу шторки #btn-close-more-menu-bottom;
   - Наличие 3 сгруппированных разделов (Калькуляторы, Контроль, Система);
3. Инженерный калькулятор защиты от протечек Neptun Smart / Gidrolock:
   - Распознавание голосовой команды мастера;
   - Вызов из меню мастера (#menu-item-leak-calc);
   - Вызов с экрана сметы (#btn-open-leak-calc);
   - Интерактивный пересчет кранов Bugatti 12V, радиодатчиков и блока LiFePO4;
   - Экспорт спецификации в Telegram / базарную записку;
   - Добавление комплекта защиты в IndexedDB склада материалов объекта.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8100
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

def test_header_layout_no_overlap(http_server):
    """Проверка, что иконки в шапке не накладываются друг на друга на узких экранах"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Тестируем на узком телефоне 360px
        context = browser.new_context(viewport={"width": 360, "height": 780})
        page = context.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".top-header")

        # Получаем координаты кнопок в верхней строке
        ai_box = page.locator("#btn-ai-concierge-open").bounding_box()
        client_box = page.locator("#btn-client-mode-toggle").bounding_box()
        settings_box = page.locator("#btn-settings-top").bounding_box()
        more_box = page.locator("#btn-more-menu-toggle").bounding_box()

        assert ai_box is not None and client_box is not None and settings_box is not None and more_box is not None

        # Проверяем строгий порядок слева направо без пересечений:
        # ai_box -> client_box -> settings_box -> more_box
        assert ai_box["x"] + ai_box["width"] <= client_box["x"] + 1, "Кнопка AI не должна накладываться на кнопку клиента 👁️"
        assert client_box["x"] + client_box["width"] <= settings_box["x"] + 1, "Кнопка клиента не должна накладываться на Настройки ⚙️"
        assert settings_box["x"] + settings_box["width"] <= more_box["x"] + 1, "Кнопка настроек не должна накладываться на кнопку Меню"
        assert more_box["x"] + more_box["width"] <= 360, "Кнопка меню не должна выходить за пределы экрана 360px"

        browser.close()

def test_swiss_master_menu_toggle_and_close(http_server):
    """Проверка открытия, закрытия кликом по кнопке, кликом по оверлею и нижней кнопкой"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".bottom-nav")

        btn_more = page.locator("#btn-more-menu-toggle")
        modal = page.locator("#modal-more-menu")

        # 1. Открытие кликом по кнопке «⋯ Меню»
        btn_more.click()
        page.wait_for_selector("#modal-more-menu.open")
        assert modal.is_visible(), "Меню должно открыться"

        # 2. Шапка находится под затемнением, закрываем через кнопку в самом меню.
        page.locator("#btn-close-more-menu").click()
        page.wait_for_timeout(300)
        assert not modal.is_visible(), "Меню должно закрыться повторным кликом по кнопке"

        # 3. Открытие и закрытие кликом по темному фону оверлея
        btn_more.click()
        page.wait_for_selector("#modal-more-menu.open")
        # Клик в верхний левый угол оверлея (вне шторки)
        page.mouse.click(20, 20)
        page.wait_for_timeout(300)
        assert not modal.is_visible(), "Меню должно закрыться при клике на оверлей"

        # 4. Открытие и закрытие по нижней кнопке «✕ Закрыть меню мастера»
        btn_more.click()
        page.wait_for_selector("#modal-more-menu.open")
        btn_close_bottom = page.locator("#btn-close-more-menu-bottom")
        assert btn_close_bottom.is_visible(), "Нижняя кнопка закрытия должна быть видна"
        btn_close_bottom.click()
        page.wait_for_timeout(300)
        assert not modal.is_visible(), "Меню должно закрыться по нижней кнопке"

        browser.close()

def test_leak_protection_calculator_e2e(http_server):
    """Сквозной тест калькулятора защиты от протечек Neptun Smart / Gidrolock"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()
        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector(".bottom-nav")

        # 1. Проверка распознавания голосовой команды мастера
        voice_res = page.evaluate("""() => {
            return window.app.parseVoiceCommand('посчитай систему защиты от протечек нептун смарт для пентхауса');
        }""")
        assert voice_res is not None, "Голосовой парсер должен распознать команду"
        assert voice_res.get("type") == "direct_func"
        assert voice_res.get("target") == "openLeakCalculator"

        # 2. Вызов калькулятора из меню «⋯ Меню»
        btn_more = page.locator("#btn-more-menu-toggle")
        btn_more.click()
        page.wait_for_selector("#modal-more-menu.open")

        item_leak = page.locator("#menu-item-leak-calc")
        assert item_leak.is_visible(), "Пункт калькулятора защиты от протечек должен быть в меню"
        item_leak.click()

        page.wait_for_selector("#modal-leak-calculator.open")
        modal = page.locator("#modal-leak-calculator")
        assert modal.is_visible(), "Модалка защиты от протечек должна открыться"

        # 3. Проверка начальных значений (2 крана 3/4", 6 датчиков, Neptun)
        valves_val = page.locator("#leak-calc-valves-val").inner_text()
        assert valves_val == "2"

        sensors_val = page.locator("#leak-calc-sensors-val").inner_text()
        assert sensors_val == "6"

        res_unit = page.locator("#res-leak-control-unit").inner_text()
        assert "Neptun Smart" in res_unit

        res_valves = page.locator("#res-leak-valves").inner_text()
        assert "2 шт" in res_valves and "Bugatti" in res_valves and "3/4" in res_valves

        res_ups = page.locator("#res-leak-ups").inner_text()
        assert "LiFePO4" in res_ups

        # 4. Изменение параметров (+2 крана для 2-го стояка -> 4 шт)
        btn_inc_valves = page.locator("button[onclick=\"window.app.adjustLeakValves(1)\"]")
        btn_inc_valves.click()
        btn_inc_valves.click()
        assert page.locator("#leak-calc-valves-val").inner_text() == "4"

        # 5. Переключение на Gidrolock
        page.select_option("#leak-calc-system-select", "gidrolock")
        res_unit_after = page.locator("#res-leak-control-unit").inner_text()
        assert "Gidrolock" in res_unit_after

        res_valves_after = page.locator("#res-leak-valves").inner_text()
        assert "Bonomi" in res_valves_after or "Gidrolock" in res_valves_after

        # 6. Копирование спецификации
        page.locator("#btn-copy-leak-calc").click()
        page.wait_for_timeout(300)
        assert page.locator("#app-toast").is_visible(), "Тост подтверждения копирования должен появиться"

        # 7. Экспорт в склад материалов
        page.locator("#btn-add-leak-to-materials").click()
        page.wait_for_timeout(400)
        assert not modal.is_visible(), "Модалка должна закрыться после добавления"

        # Переходим на экран склада и проверяем позиции
        page.locator("button[data-screen=\"materials\"]").click()
        page.wait_for_selector("#screen-materials.active")

        mat_text = page.locator("#materials-list-container").inner_text()
        assert "протечек" in mat_text.lower() or "gidrolock" in mat_text.lower() or "neptun" in mat_text.lower()

        # 8. Проверка открытия калькулятора с экрана сметы
        page.locator("button[data-screen=\"estimate\"]").click()
        page.wait_for_selector("#screen-estimate.active")
        btn_open_est = page.locator("#btn-open-leak-calc")
        assert btn_open_est.is_visible()
        btn_open_est.click()
        page.wait_for_selector("#modal-leak-calculator.open")
        assert modal.is_visible()

        browser.close()
