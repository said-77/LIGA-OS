"""
Сквозной Playwright автотест модуля расчета радиаторного отопления и лучевой разводки Rehau Stabil (v2.2.8).
Проверяет:
1. Вызов калькулятора:
   - С экрана сметы (#btn-open-radiator-calc);
   - Из глобального меню «⋯ Ещё» (#menu-item-radiator-calc);
   - Через голосовой интент естественного языка («посчитай радиаторы и лучевую разводку rehau»).
2. Интерактивный инженерный расчет:
   - Автоподбор секций биметалла (Global/Rifar) vs стальных панелей (Kermi/Buderus);
   - Расчет метража трубы Rehau Rautitan Stabil 16×2.6 в гофре (без тройников в полу);
   - Конфигурация коллекторной группы FAR 1" с отсечными вентилями;
   - Подбор узлов нижнего подключения, термоголовок Danfoss и хромированных трубок Rehau из стены.
3. Экспорт и снабжение:
   - Копирование отчета для Telegram / Базара (#btn-copy-rad-calc);
   - Прямой экспорт в базу материалов объекта (#btn-add-rad-to-materials);
   - Отображение добавленных позиций на складе материалов.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8098
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

def test_radiator_heating_calculator_e2e(http_server):
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
            return window.app.parseVoiceCommand('посчитай радиаторы и лучевую разводку rehau для пентхауса');
        }""")
        assert voice_res is not None, "Голосовой парсер должен распознать команду"
        assert voice_res.get("type") == "direct_func", "Тип команды должен быть direct_func"
        assert voice_res.get("target") == "openRadiatorCalculator", "Целевой метод должен быть openRadiatorCalculator"

        # -------------------------------------------------------------
        # 2. Вызов калькулятора из меню «⋯ Ещё»
        # -------------------------------------------------------------
        btn_more = page.locator("#btn-more-menu-toggle")
        btn_more.click()
        page.wait_for_selector("#modal-more-menu.open")

        menu_calc_item = page.locator("#menu-item-radiator-calc")
        assert menu_calc_item.is_visible(), "Пункт калькулятора радиаторов должен присутствовать в меню Ещё"
        menu_calc_item.click()

        page.wait_for_selector("#modal-radiator-calculator.open")
        modal = page.locator("#modal-radiator-calculator")
        assert modal.is_visible(), "Модальное окно калькулятора радиаторов должно открыться"

        # -------------------------------------------------------------
        # 3. Проверка начальных расчетных параметров (5 радиаторов, биметалл)
        # -------------------------------------------------------------
        count_val = page.locator("#rad-calc-count-val").inner_text()
        assert count_val == "5", "По умолчанию должно быть 5 радиаторов"

        summary_res = page.locator("#res-rad-units-summary").inner_text()
        assert "секций" in summary_res and "5" in summary_res

        manifold_res = page.locator("#res-rad-manifold").inner_text()
        assert "5 выходов" in manifold_res

        pipe_res = page.locator("#res-rad-pipe-meters").inner_text()
        assert "140" in pipe_res and "метров" in pipe_res

        tubes_res = page.locator("#res-rad-tubes-rehau").inner_text()
        assert "10 шт" in tubes_res, "Для 5 радиаторов из стены должно быть 10 трубок Rehau"

        # -------------------------------------------------------------
        # 4. Проверка интерактивного изменения (+2 радиатора -> 7 шт)
        # -------------------------------------------------------------
        btn_inc = page.locator("button[onclick=\"window.app.adjustRadiatorCount(1)\"]")
        btn_inc.click()
        btn_inc.click()

        count_after = page.locator("#rad-calc-count-val").inner_text()
        assert count_after == "7", "Должно стать 7 радиаторов"

        manifold_after = page.locator("#res-rad-manifold").inner_text()
        assert "7 выходов" in manifold_after

        # -------------------------------------------------------------
        # 5. Проверка переключения на стальные панели Kermi
        # -------------------------------------------------------------
        page.select_option("#rad-calc-type-select", "panel")
        summary_panel = page.locator("#res-rad-units-summary").inner_text()
        assert "панелей" in summary_panel or "Kermi" in summary_panel or "стальных" in summary_panel

        # -------------------------------------------------------------
        # 6. Проверка копирования спецификации в буфер
        # -------------------------------------------------------------
        btn_copy = page.locator("#btn-copy-rad-calc")
        btn_copy.click()
        toast = page.locator("#app-toast")
        page.wait_for_timeout(300)
        assert toast.is_visible(), "Тост подтверждения копирования должен появиться"

        # -------------------------------------------------------------
        # 7. Экспорт рассчитанных позиций в материалы объекта
        # -------------------------------------------------------------
        btn_add_mat = page.locator("#btn-add-rad-to-materials")
        btn_add_mat.click()

        page.wait_for_timeout(400)
        assert not modal.is_visible(), "Модальное окно должно закрыться после добавления в материалы"

        # Переходим на экран материалов
        btn_nav_materials = page.locator("button[data-screen=\"materials\"]")
        btn_nav_materials.click()
        page.wait_for_selector("#screen-materials.active")

        # Проверяем наличие добавленных позиций радиаторов
        mat_content = page.locator("#materials-list-container").inner_text()
        assert "радиатор" in mat_content.lower() or "kermi" in mat_content.lower()
        assert "rehau" in mat_content.lower()

        # -------------------------------------------------------------
        # 8. Проверка вызова калькулятора с экрана сметы
        # -------------------------------------------------------------
        btn_nav_estimate = page.locator("button[data-screen=\"estimate\"]")
        btn_nav_estimate.click()
        page.wait_for_selector("#screen-estimate.active")

        btn_est_rad = page.locator("#btn-open-radiator-calc")
        assert btn_est_rad.is_visible(), "Кнопка калькулятора радиаторов должна быть видна на экране сметы"
        btn_est_rad.click()
        page.wait_for_selector("#modal-radiator-calculator.open")
        assert modal.is_visible(), "Калькулятор радиаторов должен открыться с экрана сметы"

        browser.close()
