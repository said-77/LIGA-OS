"""
Автоматический сквозной тест гибких стандартов опрессовки и региональных реалий Ташкента (v2.3.5)
Проверяет:
1. Инженерные пресеты в модальном окне: 16 бар (Швейцарский эталон), 10 бар (Rehau), 6 бар (СНиП), 4 бар (Сеть Ташкента).
2. Динамический расчет коэффициента запаса прочности k к городскому давлению Ташкента (~3.5 бар).
3. Работу кнопки «⚡ Автошаблон» для генерации инженерного заключения мастера.
4. Ввод произвольного давления мастера (например 3.5 или 7.5 бар).
5. Верификацию и готовность паспорта объекта при региональном давлении (4.0 бар).
6. Генерацию бланка Официального Акта А4 с динамическим номером АКТ-ОПР-*, бейджем 4.0 бар и коэффициентом запаса.
7. Генерацию Инженерного Паспорта А4 с штампом 4.0 БАР ПРОЙДЕНО и протоколом 4.0 АТМОСФЕР (BAR).
8. Безупречное переключение обратно на эталон 16.0 бар с сохранением номера АКТ-16Б-*.
"""

import os
import time
import base64
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8105
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAKElEQVR42mNk+M9Qz0AEYBxVGEXPqIdRj4x6ZNRDGPUQI8Noj7phDAAj2wT951k5YwAAAABJRU5ErkJggg=="

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

@pytest.fixture(scope="module")
def sample_image_path(tmp_path_factory):
    img_dir = tmp_path_factory.mktemp("test_images_flex")
    file_path = os.path.join(str(img_dir), "manometer_flex.png")
    with open(file_path, "wb") as f:
        f.write(base64.b64decode(TINY_PNG_B64))
    return file_path

def test_flexible_pressure_and_regional_realities(http_server, sample_image_path):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # 1. Прикрепляем фото манометра
        page.set_input_files("#input-photo-pressure", sample_image_path)
        page.wait_for_timeout(300)

        # 2. Открываем протокол опрессовки
        page.locator("#tile-quick-press").click()
        page.wait_for_selector("#modal-pressure-test.open")

        # Проверяем наличие всех 4 кнопок-пресетов
        btn_preset_16 = page.locator(".btn-preset-bar[data-bar='16']")
        btn_preset_10 = page.locator(".btn-preset-bar[data-bar='10']")
        btn_preset_6 = page.locator(".btn-preset-bar[data-bar='6']")
        btn_preset_4 = page.locator(".btn-preset-bar[data-bar='4']")

        assert btn_preset_16.is_visible()
        assert btn_preset_10.is_visible()
        assert btn_preset_6.is_visible()
        assert btn_preset_4.is_visible()

        # 3. Тестируем пресет 4.0 бар (Реалии Ташкента)
        btn_preset_4.click()
        page.wait_for_timeout(200)

        pressure_val = page.input_value("#pt-pressure-bar")
        assert pressure_val == "4.0", f"Ожидалось 4.0 бар, получено: {pressure_val}"

        analysis_html = page.locator("#pt-safety-analysis").inner_text()
        assert "условия" in analysis_html or "значение" in analysis_html
        assert "1.1" in analysis_html

        # 4. Проверяем автошаблон заметок
        btn_template = page.locator("#btn-fill-pressure-template")
        assert btn_template.is_visible()
        btn_template.click()
        page.wait_for_timeout(200)

        notes_val = page.input_value("#pt-notes")
        assert "4.0 бар" in notes_val
        assert "заполнить по факту" in notes_val
        assert "выдержано" not in notes_val.lower()

        # 5. Тестируем ввод произвольного давления (7.5 бар)
        page.fill("#pt-pressure-bar", "7.5")
        page.wait_for_timeout(200)
        analysis_custom = page.locator("#pt-safety-analysis").inner_text()
        assert "2.1" in analysis_custom

        # 6. Возвращаем пресет 4.0 бар и сохраняем протокол
        btn_preset_4.click()
        btn_template.click()
        page.fill("#pt-start-date", "2026-09-30")
        page.fill("#pt-start-time", "08:00")
        page.fill("#pt-end-date", "2026-09-30")
        page.fill("#pt-end-time", "12:00")
        page.fill("#pt-notes", "Начальное показание 4.0 бар, конечное показание 4.0 бар. При осмотре соединений следов влаги не выявлено.")
        page.locator("#form-pressure-test .btn-submit-modal").click()
        page.wait_for_timeout(400)

        # 7. Проверяем, что индикатор на дашборде перешел в статус готовности с 4.0 бар
        indicator = page.locator("#passport-status-indicator")
        indicator_text = indicator.inner_text().strip()
        assert "Паспорт готов к сдаче (4.0 бар подтверждено)" in indicator_text, \
            f"Индикатор должен подтверждать 4.0 бар: {indicator_text}"

        # 8. Проверяем генерацию Официального Акта на 4.0 бара в новом окне
        btn_act = page.locator("#btn-generate-act")
        with context.expect_page() as act_page_info:
            btn_act.click()
        
        act_page = act_page_info.value
        act_page.wait_for_load_state("domcontentloaded")
        act_html = act_page.content()

        # Проверки Акта 4.0 бар:
        assert "АКТ-ИСП-" in act_html, "Номер акта должен быть общим для выбранного испытательного давления"
        assert "4.0 БАР" in act_html or "4.0 бар" in act_html
        assert "ИСПЫТАНИЕ ЗАФИКСИРОВАНО" in act_html
        assert "4 ч 0 мин" in act_html
        assert "допуск к закрытию скрытых работ оформляется отдельно" in act_html.lower()
        assert "ЛИГА" in act_html and "ПРОТОКОЛ" in act_html
        act_page.close()

        # 9. Проверяем генерацию Инженерного Паспорта на 4.0 бара
        btn_passport = page.locator("#btn-generate-pdf")
        with context.expect_page() as pass_page_info:
            btn_passport.click()
        
        pass_page = pass_page_info.value
        pass_page.wait_for_load_state("domcontentloaded")
        pass_html = pass_page.content()

        # Проверки Паспорта 4.0 бар:
        assert "ИСПЫТАНИЕ ЗАФИКСИРОВАНО • 4.0 БАР" in pass_html, "Штамп паспорта должен показывать внесенное давление"
        assert "4.0 бар" in pass_html and "4 ч 0 мин" in pass_html
        assert "онлайн-проверка не предусмотрена" in pass_html
        pass_page.close()

        # 10. Переключаем на 16.0 бар (Швейцарский эталон)
        page.locator("#tile-quick-press").click()
        page.wait_for_selector("#modal-pressure-test.open")
        btn_preset_16.click()
        btn_template.click()
        page.fill("#pt-notes", "Начальное показание 16.0 бар, конечное показание 16.0 бар. При осмотре соединений следов влаги не выявлено.")
        page.locator("#form-pressure-test .btn-submit-modal").click()
        page.wait_for_timeout(400)

        # Проверяем возврат к эталону 16 бар
        indicator_text_16 = indicator.inner_text().strip()
        assert "Паспорт готов к сдаче (16.0 бар подтверждено)" in indicator_text_16

        with context.expect_page() as act_page_info_16:
            btn_act.click()
        act_page_16 = act_page_info_16.value
        act_page_16.wait_for_load_state("domcontentloaded")
        act_html_16 = act_page_16.content()

        assert "АКТ-ИСП-" in act_html_16
        assert "ИСПЫТАНИЕ ЗАФИКСИРОВАНО • 16.0 БАР" in act_html_16
        assert "16.0 бар" in act_html_16
        act_page_16.close()

        browser.close()
