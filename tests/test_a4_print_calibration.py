"""
Автоматический тест калибровки шаблонов печати формата А4 в LIGA OS (v2.2.4).
Проверяет:
1. Строгую посадку Официального Акта гидравлического испытания 16 бар ровно на 1 страницу А4:
   - Стили @page { size: A4 portrait; margin: 6mm 8mm; }
   - Защиту от разрывов блоков (break-inside: avoid / page-break-inside: avoid);
   - Наличие векторного QR-кода верификации подлинности (DIN 1988 VERIFIED);
   - Панель быстрого управления печатью и закрытия окна.
2. Идеальную двухстраничную раскладку Исполнительного Инженерного Паспорта:
   - Наличие ровно двух листов .page-sheet и разделителя страниц .page-break;
   - Лист 1: Шапка, метаданные, таблица протокола 16 бар / 24ч, предупреждение отделочникам, гарантия и факсимиле;
   - Лист 2: Заголовок 2-го листа, сетка 4 фотопривязок с линейными размерами, регламент безопасности и печать инженера;
   - Корректность колонтитулов «Лист 1 из 2» и «Лист 2 из 2».
"""

import os
import time
import base64
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8094
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
    img_dir = tmp_path_factory.mktemp("test_a4_images")
    file_path = os.path.join(str(img_dir), "manometer_a4.png")
    with open(file_path, "wb") as f:
        f.write(base64.b64decode(TINY_PNG_B64))
    return file_path

def test_a4_print_calibration_workflow(http_server, sample_image_path):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # Настраиваем подтвержденный протокол опрессовки с фото
        page.set_input_files("#input-photo-pressure", sample_image_path)
        page.wait_for_timeout(300)

        page.locator("#tile-quick-press").click()
        page.wait_for_selector("#modal-pressure-test.open")
        page.fill("#pt-pressure-bar", "16.0")
        page.fill("#pt-notes", "Опрессовка 16.0 бар успешно выдержана 24 часа. Все соединения монолитны.")
        page.locator("#form-pressure-test .btn-submit-modal").click()
        page.wait_for_timeout(400)

        # ---------------------------------------------------------------------
        # ТЕСТ 1: Калибровка бланка Официального Акта 16 бар (Строго 1 лист А4)
        # ---------------------------------------------------------------------
        with context.expect_page() as new_page_info:
            page.locator("#btn-generate-act").click()
        act_page = new_page_info.value
        act_page.wait_for_load_state("domcontentloaded")

        # 1.1. Проверка наличия стилей печати и размеров А4
        act_html = act_page.content()
        assert "@page" in act_html, "Акт должен содержать CSS-директиву @page"
        assert "size: A4 portrait" in act_html, "Размер страницы должен быть строго A4 portrait"

        # 1.2. Проверка плавающей панели быстрого управления печатью
        print_bar = act_page.locator(".print-bar")
        assert print_bar.is_visible(), "Плавающая панель печати обязана присутствовать"
        btn_print = print_bar.locator(".btn-print")
        assert btn_print.is_visible(), "Кнопка 'Печать / Сохранить в PDF' должна быть в панели"
        btn_close = print_bar.locator(".btn-close-print")
        assert btn_close.is_visible(), "Кнопка '✕ Закрыть' должна быть в панели"

        # 1.3. Проверка векторного QR-кода верификации подлинности
        qr_badge = act_page.locator(".qr-verify-badge")
        assert qr_badge.count() >= 1, "Акт 16 бар обязан содержать векторный QR-код верификации"
        assert "DIN 1988 VERIFIED" in act_page.locator(".qr-tag").inner_text()
        assert act_page.locator(".qr-svg-graphic").count() >= 1, "QR-код должен быть векторным SVG"

        # 1.4. Проверка защиты от разрыва страниц при печати
        act_page.emulate_media(media="print")
        page_container = act_page.locator(".page-container")
        assert page_container.is_visible()

        # Проверяем, что в разметке Акта ровно 1 контейнер страницы (1 лист)
        assert page_container.count() == 1, "Официальный Акт 16 бар обязан состоять строго из одного листа"
        assert not act_page.locator(".page-break").is_visible(), "В одностраничном Акте 16 бар не должно быть разрывов страниц"

        # Проверка стилей защиты от разрыва блоков
        box_styles = act_page.evaluate("""() => {
            const table = document.querySelector('.protocol-table');
            const res = document.querySelector('.resolution-box');
            const signs = document.querySelector('.signatures-block');
            const getBreak = el => window.getComputedStyle(el).breakInside || window.getComputedStyle(el).pageBreakInside;
            return {
                table: getBreak(table),
                resolution: getBreak(res),
                signatures: getBreak(signs)
            };
        }""")
        assert "avoid" in box_styles["table"], "Таблица протокола должна иметь break-inside: avoid"
        assert "avoid" in box_styles["resolution"], "Резолюция должна иметь break-inside: avoid"
        assert "avoid" in box_styles["signatures"], "Блок подписей должен иметь break-inside: avoid"

        act_page.close()

        # ---------------------------------------------------------------------
        # ТЕСТ 2: Калибровка Исполнительного Инженерного Паспорта (2 листа А4)
        # ---------------------------------------------------------------------
        with context.expect_page() as new_page_info2:
            page.locator("#btn-generate-pdf").click()
        passport_page = new_page_info2.value
        passport_page.wait_for_load_state("domcontentloaded")

        # 2.1. Проверка двухстраничной раскладки
        sheets = passport_page.locator(".page-sheet")
        assert sheets.count() == 2, f"Исполнительный Паспорт обязан иметь ровно 2 листа А4, найдено: {sheets.count()}"

        # 2.2. Проверка наличия явного разрыва страницы
        page_break = passport_page.locator(".page-break")
        assert page_break.count() == 1, "Между Листом 1 и Листом 2 обязан быть разделитель .page-break"

        # 2.3. Проверка содержимого Листа 1
        sheet_1 = sheets.nth(0)
        assert sheet_1.locator(".passport-header").is_visible(), "На Листе 1 должна быть шапка с гербом Лиги"
        assert sheet_1.locator(".stamp-badge-passed").is_visible(), "На Листе 1 должен быть штамп пройденных испытаний"
        assert sheet_1.locator(".meta-grid").is_visible(), "На Листе 1 должны быть паспортные данные объекта"
        assert sheet_1.locator(".protocol-box").is_visible(), "На Листе 1 должен быть протокол 16 бар"
        assert sheet_1.locator(".warning-box").is_visible(), "На Листе 1 должно быть предупреждение для отделочников"
        assert sheet_1.locator(".facsimile-stamp").is_visible(), "На Листе 1 должен быть факсимиле-штамп Лиги"
        assert "Лист 1 из 2" in sheet_1.locator(".sheet-footer").inner_text()

        # 2.4. Проверка содержимого Листа 2
        sheet_2 = sheets.nth(1)
        assert sheet_2.locator(".sheet-2-header").is_visible(), "На Листе 2 должна быть шапка фотофиксации"
        assert "Лист 2 из 2" in sheet_2.locator(".sheet-2-header").inner_text()
        
        # Сетка 4 фотопривязок с рулеткой
        photo_cards = sheet_2.locator(".photo-grid .photo-card")
        assert photo_cards.count() == 4, f"На Листе 2 должно быть 4 фотокарточки, найдено: {photo_cards.count()}"
        assert sheet_2.locator(".rules-box").is_visible(), "На Листе 2 должен быть регламент безопасности"
        assert sheet_2.locator(".engineer-seal-stamp").is_visible(), "На Листе 2 должна быть печать ведущего инженера"
        assert sheet_2.locator(".qr-verify-badge").is_visible(), "На Листе 2 должен быть QR-код верификации"
        assert "Лист 2 из 2" in sheet_2.locator(".sheet-footer").inner_text()

        # 2.5. Проверка медиа-эмуляции печати паспорта
        passport_page.emulate_media(media="print")
        assert sheets.nth(0).is_visible()
        assert sheets.nth(1).is_visible()

        passport_page.close()
        browser.close()
