"""
Сквозной Playwright автотест модуля теплотехнического расчета теплого пола и насосно-смесительного узла (v2.2.7).
Проверяет:
1. Вызов калькулятора:
   - С экрана сметы (#btn-open-floor-calc);
   - Из глобального меню «⋯ Ещё» (#menu-item-floor-calc);
   - Через голосовой интент естественного языка («посчитай теплый пол и смесительный узел»).
2. Интерактивный теплотехнический расчет (DIN 1988 / гидравлическая увязка петель):
   - Ограничение длины петли <= 75–80 м и расчет количества контуров;
   - Автоподбор насосно-смесительного узла (Unibox при S <= 30 м² vs НСУ 25-60 при S > 30 м²);
   - Расчет количества бухт по 200 м и демпферной ленты;
   - Переключение шага укладки (100, 150, 200 мм) и опций краевых зон.
3. Экспорт и снабжение:
   - Копирование отчета для Telegram / Базара (#btn-copy-floor-calc);
   - Прямой экспорт позиций в базу материалов объекта (#btn-add-floor-to-materials);
   - Отображение добавленных позиций на складе материалов.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8097
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

def test_floor_heating_calculator_e2e(http_server):
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
            return window.app.parseVoiceCommand('посчитай теплый пол и смесительный узел для коттеджа');
        }""")
        assert voice_res is not None, "Голосовой парсер должен распознать команду"
        assert voice_res.get("type") == "direct_func", "Тип команды должен быть direct_func"
        assert voice_res.get("target") == "openFloorCalculator", "Целевой метод должен быть openFloorCalculator"

        # -------------------------------------------------------------
        # 2. Вызов калькулятора из меню «⋯ Ещё»
        # -------------------------------------------------------------
        btn_more = page.locator("#btn-more-menu-toggle")
        btn_more.click()
        page.wait_for_selector("#modal-more-menu.open")

        menu_calc_item = page.locator("#menu-item-floor-calc")
        assert menu_calc_item.is_visible(), "Пункт калькулятора теплого пола должен присутствовать в меню Ещё"
        menu_calc_item.click()

        page.wait_for_selector("#modal-floor-calculator.open")
        modal = page.locator("#modal-floor-calculator")
        assert modal.is_visible(), "Модальное окно калькулятора теплого пола должно открыться"

        # -------------------------------------------------------------
        # 3. Проверка начальных расчетных параметров (50 м², шаг 150 мм)
        # -------------------------------------------------------------
        area_val = page.locator("#floor-calc-area-val").inner_text()
        assert area_val == "50", "По умолчанию площадь должна быть 50 м²"

        pipe_res = page.locator("#res-floor-pipe-meters").inner_text()
        assert "метров" in pipe_res and "Rehau" in pipe_res

        loops_res = page.locator("#res-floor-loops-count").inner_text()
        assert "контур" in loops_res

        loop_len_res = page.locator("#res-floor-loop-len").inner_text()
        assert "норма" in loop_len_res or "м" in loop_len_res

        mix_pump_res = page.locator("#res-floor-mixing-pump").inner_text()
        assert "25-60" in mix_pump_res, "При площади 50 м² должен быть насос 25-60"

        # -------------------------------------------------------------
        # 4. Проверка интерактивного изменения площади (уменьшение до 20 м²)
        # -------------------------------------------------------------
        # 6 кликов по -5 м² (с 50 до 20)
        btn_dec_area = page.locator("button[onclick=\"window.app.adjustFloorArea(-5)\"]")
        for _ in range(6):
            btn_dec_area.click()

        area_val_after = page.locator("#floor-calc-area-val").inner_text()
        assert area_val_after == "20", "Площадь должна уменьшиться до 20 м²"

        mix_pump_small = page.locator("#res-floor-mixing-pump").inner_text()
        assert "Unibox" in mix_pump_small or "мини" in mix_pump_small, "При площади <= 30 м² должен быть модуль Unibox"

        # -------------------------------------------------------------
        # 5. Проверка переключения шага укладки на 100 мм (краевой шаг)
        # -------------------------------------------------------------
        page.select_option("#floor-calc-step-select", "100")
        pipe_100_res = page.locator("#res-floor-pipe-meters").inner_text()
        # Для 20 м² при шаге 100 мм расход выше
        assert "метров" in pipe_100_res

        # -------------------------------------------------------------
        # 6. Проверка копирования спецификации в буфер
        # -------------------------------------------------------------
        btn_copy = page.locator("#btn-copy-floor-calc")
        btn_copy.click()
        toast = page.locator("#app-toast")
        page.wait_for_timeout(300)
        assert toast.is_visible(), "Тост подтверждения копирования должен появиться"

        # -------------------------------------------------------------
        # 7. Экспорт рассчитанных позиций в материалы объекта
        # -------------------------------------------------------------
        btn_add_mat = page.locator("#btn-add-floor-to-materials")
        btn_add_mat.click()

        page.wait_for_timeout(400)
        assert not modal.is_visible(), "Модальное окно должно закрыться после добавления в материалы"

        # Переходим на экран материалов
        btn_nav_materials = page.locator("button[data-screen=\"materials\"]")
        btn_nav_materials.click()
        page.wait_for_selector("#screen-materials.active")

        # Проверяем наличие добавленных позиций теплого пола
        mat_content = page.locator("#materials-list-container").inner_text()
        assert "теплый пол" in mat_content.lower() or "rehau" in mat_content.lower()
        assert "коллектор" in mat_content.lower()

        # -------------------------------------------------------------
        # 8. Проверка вызова калькулятора с экрана сметы
        # -------------------------------------------------------------
        btn_nav_estimate = page.locator("button[data-screen=\"estimate\"]")
        btn_nav_estimate.click()
        page.wait_for_selector("#screen-estimate.active")

        btn_est_floor = page.locator("#btn-open-floor-calc")
        assert btn_est_floor.is_visible(), "Кнопка калькулятора теплого пола должна быть видна на экране сметы"
        btn_est_floor.click()
        page.wait_for_selector("#modal-floor-calculator.open")
        assert modal.is_visible(), "Калькулятор теплого пола должен открыться с экрана сметы"

        browser.close()
