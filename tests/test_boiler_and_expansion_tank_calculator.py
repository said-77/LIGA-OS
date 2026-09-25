"""
Сквозной Playwright автотест модуля подбора бойлера и расширительного бака ГВС Reflex (v2.2.9).
Проверяет:
1. Распознавание голосовых команд естественного языка:
   - «посчитай бойлер и расширительный бак для коттеджа»;
   - «калькулятор бойлера косвенного нагрева и бака reflex».
2. Вызов калькулятора:
   - Из глобального меню «⋯ Ещё» (#menu-item-boiler-calc);
   - С экрана сметы (#btn-open-boiler-calc).
3. Инженерный расчет ГВС:
   - Подбор объема бойлера (БКН Drazice OKC / электрический OKCE);
   - Расчет объема расширительного мембранного бака Reflex Refix DE (10% от объема бойлера, 12-35 л);
   - Учет расхода тропического душа (+50 л) и большой ванны (+50 л);
   - Подбор группы безопасности Caleffi / Watts 6.0 бар и насоса рециркуляции Grundfos Comfort PM.
4. Экспорт и снабжение:
   - Формирование отчета для Telegram / Базара (#btn-copy-boiler-calc);
   - Прямой экспорт оборудования в базу материалов объекта (#btn-add-boiler-to-materials);
   - Проверка появления позиций бойлера, бака Reflex и насоса на складе.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8099
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

def test_boiler_and_expansion_tank_calculator_e2e(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # -------------------------------------------------------------
        # 1. Проверка распознавания голосовой команды мастера
        # -------------------------------------------------------------
        voice_res = page.evaluate("""() => {
            return window.app.parseVoiceCommand('посчитай бойлер и расширительный бак гвс reflex для коттеджа');
        }""")
        assert voice_res is not None, "Голосовой парсер должен распознать команду"
        assert voice_res.get("type") == "direct_func", "Тип команды должен быть direct_func"
        assert voice_res.get("target") == "openBoilerCalculator", "Целевой метод должен быть openBoilerCalculator"

        # -------------------------------------------------------------
        # 2. Вызов калькулятора из меню «⋯ Ещё»
        # -------------------------------------------------------------
        btn_more = page.locator("#btn-more-menu-toggle")
        btn_more.click()
        page.wait_for_selector("#modal-more-menu.open")

        menu_calc_item = page.locator("#menu-item-boiler-calc")
        assert menu_calc_item.is_visible(), "Пункт калькулятора бойлера должен присутствовать в меню Ещё"
        menu_calc_item.click()

        page.wait_for_selector("#modal-boiler-calculator.open")
        modal = page.locator("#modal-boiler-calculator")
        assert modal.is_visible(), "Модальное окно калькулятора бойлера должно открыться"

        # -------------------------------------------------------------
        # 3. Проверка начальных расчетных параметров (4 чел, БКН, тропический душ)
        # -------------------------------------------------------------
        res_val = page.locator("#boiler-calc-residents-val").inner_text()
        assert res_val == "4", "По умолчанию должно быть 4 проживающих"

        vol_res = page.locator("#res-boiler-volume").inner_text()
        assert "200" in vol_res, "Для 4 человек с тропическим душем объем должен быть 200 л"

        tank_res = page.locator("#res-boiler-tank").inner_text()
        assert "24" in tank_res and "Reflex" in tank_res, "Для бойлера 200 л бак Reflex должен быть 24 л"

        safety_res = page.locator("#res-boiler-safety-group").inner_text()
        assert "6.0 бар" in safety_res and "Caleffi" in safety_res

        pump_res = page.locator("#res-boiler-recirc-pump").inner_text()
        assert "Grundfos Comfort" in pump_res

        # -------------------------------------------------------------
        # 4. Проверка интерактивного изменения жителей и опций
        # -------------------------------------------------------------
        # Увеличиваем до 6 человек (+2 нажатия)
        btn_inc = page.locator("button[onclick=\"window.app.adjustBoilerResidents(1)\"]")
        btn_inc.click()
        btn_inc.click()

        res_after = page.locator("#boiler-calc-residents-val").inner_text()
        assert res_after == "6", "Должно стать 6 человек"

        # Включаем также большую ванну
        bath_checkbox = page.locator("#boiler-calc-big-bath")
        bath_checkbox.check()

        vol_after = page.locator("#res-boiler-volume").inner_text()
        assert "250" in vol_after or "300" in vol_after

        tank_after = page.locator("#res-boiler-tank").inner_text()
        assert "35" in tank_after, "Для объема свыше 220 л бак Reflex должен быть 35 л"

        # -------------------------------------------------------------
        # 5. Переключение типа водонагревателя на электрический
        # -------------------------------------------------------------
        page.select_option("#boiler-calc-type-select", "electric")
        model_el = page.locator("#res-boiler-model").inner_text()
        assert "Электрический" in model_el or "OKCE" in model_el

        # -------------------------------------------------------------
        # 6. Проверка копирования спецификации в буфер
        # -------------------------------------------------------------
        btn_copy = page.locator("#btn-copy-boiler-calc")
        btn_copy.click()
        toast = page.locator("#app-toast")
        page.wait_for_timeout(300)
        assert toast.is_visible(), "Тост подтверждения копирования должен появиться"

        # -------------------------------------------------------------
        # 7. Экспорт рассчитанного комплекта ГВС в материалы склада
        # -------------------------------------------------------------
        btn_add_mat = page.locator("#btn-add-boiler-to-materials")
        btn_add_mat.click()

        page.wait_for_timeout(400)
        assert not modal.is_visible(), "Модальное окно должно закрыться после добавления в материалы"

        # Переходим на экран материалов
        btn_nav_materials = page.locator("button[data-screen=\"materials\"]")
        btn_nav_materials.click()
        page.wait_for_selector("#screen-materials.active")

        # Проверяем наличие добавленных позиций оборудования ГВС
        mat_content = page.locator("#materials-list-container").inner_text()
        assert "drazice" in mat_content.lower() or "водонагреватель" in mat_content.lower()
        assert "reflex" in mat_content.lower() or "мембранный бак" in mat_content.lower()
        assert "grundfos" in mat_content.lower() or "рециркуляции" in mat_content.lower()

        # -------------------------------------------------------------
        # 8. Проверка вызова калькулятора с экрана сметы
        # -------------------------------------------------------------
        btn_nav_estimate = page.locator("button[data-screen=\"estimate\"]")
        btn_nav_estimate.click()
        page.wait_for_selector("#screen-estimate.active")

        btn_est_boiler = page.locator("#btn-open-boiler-calc")
        assert btn_est_boiler.is_visible(), "Кнопка калькулятора бойлера должна быть видна на экране сметы"
        btn_est_boiler.click()
        page.wait_for_selector("#modal-boiler-calculator.open")
        assert modal.is_visible(), "Калькулятор бойлера должен открыться с экрана сметы"

        browser.close()
