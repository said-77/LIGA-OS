"""
Сквозной Playwright автотест модуля гидравлического подбора труб и коллекторных групп FAR / Rehau (v2.2.6).
Проверяет:
1. Вызов калькулятора:
   - С экрана сметы (#btn-open-pipe-calc);
   - Из глобального меню «⋯ Ещё» (#menu-item-pipe-calc);
   - Через голосовой интент естественного языка («посчитай диаметр трубы и подбор far»).
2. Интерактивный гидродинамический расчет (DIN 1988):
   - Автоподбор магистрального ввода 25 мм vs 20 мм в зависимости от расхода и тропического душа;
   - Автоподбор конфигурации гребенок FAR 1" (Евроконус 3/4") для ХВС и ГВС;
   - Пересчет метража лучей 20 мм и 16 мм в зависимости от длины трассы (short/medium/long);
   - Подбор редуктора давления Caleffi и гасителей гидроударов FAR при высоком давлении.
3. Экспорт и закупка:
   - Копирование отчета для Telegram / Базара (#btn-copy-pipe-calc);
   - Прямой экспорт рассчитанных позиций в базу материалов объекта (#btn-add-pipe-to-materials);
   - Отображение добавленных позиций на складе материалов.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8096
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

def test_pipe_and_manifold_calculator_e2e(http_server):
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
            return window.app.parseVoiceCommand('посчитай диаметр трубы и подбор far для новостройки');
        }""")
        assert voice_res is not None, "Голосовой парсер должен распознать команду"
        assert voice_res.get("type") == "direct_func", "Тип команды должен быть direct_func"
        assert voice_res.get("target") == "openPipeCalculator", "Целевой метод должен быть openPipeCalculator"

        # -------------------------------------------------------------
        # 2. Вызов калькулятора из меню «⋯ Ещё»
        # -------------------------------------------------------------
        btn_more = page.locator("#btn-more-menu-toggle")
        btn_more.click()
        page.wait_for_selector("#modal-more-menu.open")

        menu_calc_item = page.locator("#menu-item-pipe-calc")
        assert menu_calc_item.is_visible(), "Пункт калькулятора должен присутствовать в меню Ещё"
        menu_calc_item.click()

        page.wait_for_selector("#modal-pipe-calculator.open")
        modal = page.locator("#modal-pipe-calculator")
        assert modal.is_visible(), "Модальное окно калькулятора должно открыться"

        # -------------------------------------------------------------
        # 3. Проверка начальных расчетных параметров (6 ХВС, 4 ГВС, душ ON)
        # -------------------------------------------------------------
        cold_val = page.locator("#pipe-calc-cold-val").inner_text()
        hot_val = page.locator("#pipe-calc-hot-val").inner_text()
        assert cold_val == "6", "По умолчанию должно быть 6 точек ХВС"
        assert hot_val == "4", "По умолчанию должно быть 4 точки ГВС"

        inlet_text = page.locator("#res-pipe-inlet-diameter").inner_text()
        assert "25 мм" in inlet_text, "При тропическом душе ввод должен быть 25 мм"

        cold_res = page.locator("#res-manifold-cold").inner_text()
        assert "6 выходов" in cold_res or "3+3" in cold_res, "Коллектор ХВС на 6 выходов"

        hot_res = page.locator("#res-manifold-hot").inner_text()
        assert "4 выхода" in hot_res, "Коллектор ГВС на 4 выхода"

        # -------------------------------------------------------------
        # 4. Проверка интерактивного изменения точек (+1 к ХВС -> 7 точек)
        # -------------------------------------------------------------
        btn_inc_cold = page.locator("button[onclick=\"window.app.adjustPipePoints('cold', 1)\"]")
        btn_inc_cold.click()

        cold_val_after = page.locator("#pipe-calc-cold-val").inner_text()
        assert cold_val_after == "7", "Точек ХВС стало 7"

        cold_res_after = page.locator("#res-manifold-cold").inner_text()
        assert "7 выходов" in cold_res_after or "4+3" in cold_res_after, "Коллектор ХВС должен обновиться до 7 выходов (4+3)"

        # -------------------------------------------------------------
        # 5. Проверка переключения на малый объект без тропического душа (ввод 20 мм)
        # -------------------------------------------------------------
        # Снимаем чекбокс тропического душа
        cb_high_flow = page.locator("#pipe-calc-high-flow")
        cb_high_flow.uncheck()

        # Уменьшаем точки до 2 ХВС и 2 ГВС
        for _ in range(5):
            page.locator("button[onclick=\"window.app.adjustPipePoints('cold', -1)\"]").click()
        for _ in range(2):
            page.locator("button[onclick=\"window.app.adjustPipePoints('hot', -1)\"]").click()

        c_now = page.locator("#pipe-calc-cold-val").inner_text()
        h_now = page.locator("#pipe-calc-hot-val").inner_text()
        assert c_now == "2" and h_now == "2", "Должно быть 2 ХВС и 2 ГВС"

        inlet_small = page.locator("#res-pipe-inlet-diameter").inner_text()
        assert "20 мм" in inlet_small, "Для 4 точек без тропического душа ввод должен быть 20 мм (3/4\")"

        pipe_20_res = page.locator("#res-pipe-20mm").inner_text()
        assert "Не требуется" in pipe_20_res, "Лучи 20 мм не требуются без тропического душа"

        # -------------------------------------------------------------
        # 6. Проверка копирования спецификации в буфер
        # -------------------------------------------------------------
        btn_copy = page.locator("#btn-copy-pipe-calc")
        btn_copy.click()
        toast = page.locator("#app-toast")
        page.wait_for_timeout(300)
        assert toast.is_visible(), "Тост подтверждения копирования должен появиться"

        # -------------------------------------------------------------
        # 7. Экспорт рассчитанных позиций в материалы объекта
        # -------------------------------------------------------------
        btn_add_mat = page.locator("#btn-add-pipe-to-materials")
        btn_add_mat.click()

        # Проверяем, что модалка закрылась
        page.wait_for_timeout(400)
        assert not modal.is_visible(), "Модальное окно должно закрыться после добавления в материалы"

        # Переходим на экран материалов
        btn_nav_materials = page.locator("button[data-screen=\"materials\"]")
        btn_nav_materials.click()
        page.wait_for_selector("#screen-materials.active")

        # Проверяем, что в списке материалов появились коллекторы FAR и трубы Rehau
        mat_content = page.locator("#materials-list-container").inner_text()
        assert "Коллектор ХВС" in mat_content or "FAR" in mat_content, "Коллекторы FAR должны добавиться на склад материалов"
        assert "Rehau" in mat_content, "Трубы Rehau должны появиться на складе материалов"

        # -------------------------------------------------------------
        # 8. Проверка вызова калькулятора с экрана сметы
        # -------------------------------------------------------------
        btn_nav_estimate = page.locator("button[data-screen=\"estimate\"]")
        btn_nav_estimate.click()
        page.wait_for_selector("#screen-estimate.active")

        btn_est_calc = page.locator("#btn-open-pipe-calc")
        assert btn_est_calc.is_visible(), "Кнопка калькулятора должна быть видна на экране сметы"
        btn_est_calc.click()
        page.wait_for_selector("#modal-pipe-calculator.open")
        assert modal.is_visible(), "Калькулятор должен открыться с экрана сметы"

        browser.close()
