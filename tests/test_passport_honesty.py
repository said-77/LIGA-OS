"""
Автоматический сквозной тест честного инженерного паспорта LIGA OS (P0-2)
Проверяет истинную булеву матрицу (2x2) честности гидроиспытаний:
1. Название кнопки: «Печать / Экспорт в PDF (Паспорт объекта)».
2. Состояние 1: pressTestPassed=true, но photo=null -> ЧЕРНОВИК (штамп черновика, гарантия не активирована).
3. Состояние 2: pressTestPassed=true И photo!=null -> ПОДТВЕРЖДЕНО (зеленый штамп 16 бар, реальное фото, гарантия).
4. Состояние 3: сброс опрессовки (pressTestPassed=false), даже при наличии фото -> возврат в ЧЕРНОВИК.
5. Состояние 4: pressTestPassed=false И photo=null (Объект 2) -> ЧЕРНОВИК.
"""

import os
import time
import base64
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8093
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
    img_dir = tmp_path_factory.mktemp("test_images")
    file_path = os.path.join(str(img_dir), "manometer_test.png")
    with open(file_path, "wb") as f:
        f.write(base64.b64decode(TINY_PNG_B64))
    return file_path

def test_passport_honesty_full_workflow(http_server, sample_image_path):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        # 1. Открытие главного экрана LIGA OS
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # 2. Проверка названия кнопки
        btn_pdf = page.locator("#btn-generate-pdf")
        btn_text = btn_pdf.inner_text().strip().replace('\xa0', ' ')
        assert "печать / экспорт в pdf (паспорт объекта)" in btn_text.lower(), f"Неверное название кнопки: {btn_text}"

        # 3. Состояние 1: У демо-объекта 1 (Mirabad Avenue) pressTestPassed=true, но фото манометра НЕТ!
        # Паспорт ОБЯЗАН быть черновиком, потому что без фото манометра опрессовка не подтверждена!
        indicator = page.locator("#passport-status-indicator")
        indicator_text = indicator.inner_text().strip()
        assert "Паспорт в режиме черновика" in indicator_text, f"Ожидался статус черновика, получено: {indicator_text}"
        assert "не подтверждены фотофиксацией" in indicator_text

        # Проверяем генерацию черновика
        with context.expect_page() as new_page_info:
            btn_pdf.click()
        draft_page = new_page_info.value
        draft_page.wait_for_load_state("domcontentloaded")

        # Проверяем штамп в шапке
        draft_stamp = draft_page.locator(".stamp-badge.stamp-badge-draft")
        assert draft_stamp.is_visible(), "Штамп черновика не найден на странице паспорта"
        assert "ЧЕРНОВИК / ИСПЫТАНИЯ НЕ ПРОВОДИЛИСЬ" in draft_stamp.inner_text()

        # Зеленый штамп подтверждения обязан отсутствовать
        passed_stamp = draft_page.locator(".stamp-badge.stamp-badge-passed")
        assert not passed_stamp.is_visible(), "Ошибочно отображается штамп пройденных испытаний в черновике!"

        # Проверяем таблицу протокола
        content = draft_page.content()
        assert "ИСПЫТАНИЯ НЕ ПРОВОДИЛИСЬ" in content
        assert "НЕ ПОДТВЕРЖДЕНО" in content
        assert "ОТСУТСТВУЕТ ФОТОФИКСАЦИЯ" in content
        assert "рабочим черновиком" in content

        # Проверяем блок гарантии и факсимиле
        assert "НЕ АКТИВИРОВАНА до проведения гидравлического испытания" in content
        draft_facsimile = draft_page.locator(".facsimile-stamp.draft")
        assert draft_facsimile.is_visible(), "Штамп факсимиле черновика не найден"
        assert "ЧЕРНОВИК" in draft_facsimile.inner_text()
        draft_page.close()

        # 4. Состояние 2: Прикрепляем реальное фото манометра (теперь pressTestPassed=true И есть фото)
        page.set_input_files("#input-photo-pressure", sample_image_path)
        page.wait_for_timeout(600)

        # Индикатор на дашборде должен стать зеленым
        indicator_text_verified = indicator.inner_text().strip()
        assert "Паспорт готов к сдаче (16 бар подтверждено)" in indicator_text_verified, f"Ожидалась готовность, получено: {indicator_text_verified}"

        # Открываем паспорт и проверяем подтвержденный статус
        with context.expect_page() as new_page_info2:
            btn_pdf.click()
        verified_page = new_page_info2.value
        verified_page.wait_for_load_state("domcontentloaded")

        # Проверяем зеленый штамп
        verified_stamp = verified_page.locator(".stamp-badge.stamp-badge-passed")
        assert verified_stamp.is_visible(), "Зеленый штамп подтверждения 16 бар не найден"
        assert "✓ 16 БАР ПРОЙДЕНО (ПОДТВЕРЖДЕНО)" in verified_stamp.inner_text()

        # Штамп черновика обязан отсутствовать
        assert not verified_page.locator(".stamp-badge.stamp-badge-draft").is_visible(), "Штамп черновика не должен отображаться!"

        # Проверяем подтвержденную таблицу протокола
        v_content = verified_page.content()
        assert "16.0 АТМОСФЕР (BAR) • ТЕСТ x4" in v_content
        assert "24 ЧАСА ПОД ДАВЛЕНИЕМ" in v_content
        assert "ВЫДЕРЖАНО" in v_content

        # Проверяем наличие реального фото манометра
        real_photos = verified_page.locator("img.passport-real-photo")
        assert real_photos.count() >= 1, "Фото манометра не отобразилось в фотогалерее паспорта"

        # Проверяем официальный факсимиле мастера
        facsimile = verified_page.locator(".facsimile-stamp")
        assert facsimile.is_visible()
        assert "ЧЕРНОВИК" not in facsimile.inner_text()
        assert "ЛИГА" in facsimile.inner_text()
        verified_page.close()

        # 5. Состояние 3: Сбрасываем опрессовку (pressTestPassed=false), хотя фото в базе есть!
        page.locator("#tile-quick-press").click()
        page.wait_for_timeout(300)

        # Проверяем, что индикатор мгновенно вернулся в режим черновика
        indicator_text_after_reset = indicator.inner_text().strip()
        assert "Паспорт в режиме черновика" in indicator_text_after_reset, "Сброс опрессовки должен возвращать паспорт в черновик!"

        # Открываем паспорт и проверяем, что статус снова черновик
        with context.expect_page() as new_page_info3:
            btn_pdf.click()
        draft_page3 = new_page_info3.value
        draft_page3.wait_for_load_state("domcontentloaded")
        assert draft_page3.locator(".stamp-badge.stamp-badge-draft").is_visible(), "Паспорт со сброшенной опрессовкой обязан быть черновиком!"
        draft_page3.close()

        # 6. Состояние 4: Переключаемся на Объект 2 (Nest One), у которого pressTestPassed=false и фото нет
        page.select_option("#site-selector", "2")
        page.wait_for_timeout(300)
        indicator_site2 = indicator.inner_text().strip()
        assert "Паспорт в режиме черновика" in indicator_site2, "Объект без опрессовки обязан показывать статус черновика!"

        browser.close()
