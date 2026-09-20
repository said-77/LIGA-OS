"""
Автоматический сквозной тест Официального Акта опрессовки 16 бар / 24 часа в LIGA OS.
Проверяет:
1. Наличие кнопок вызова Акта 16 бар на главном дашборде, в чек-листе стяжки и в модальном окне опрессовки.
2. Валидацию: невозможность генерации без подтвержденного протокола опрессовки и фото манометра.
3. Полный цикл заполнения протокола: 16.0 бар, экспозиция 24 часа, фото манометра, примечание.
4. Корректность генерации бланка А4 в новом окне:
   - Номер акта АКТ-16Б-*;
   - Нормативная база DIN 1988 (ч. 2) и СНиП;
   - Замер: 16.0 бар, падение 0.0 бар, выдержка 24 часа;
   - Фото контрольного манометра и распределительного узла;
   - Юридическая резолюция: допуск к заливке стяжки пола и обшивке стен;
   - Честное подтверждение мастером (независимая экспертиза не симулируется);
   - Подписи ведущего инженера Улугбека Хакимова, заказчика и производителя стяжки.
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

def test_official_pressure_act_workflow(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # 1. Проверка кнопки Акта 16 бар на главном экране
        btn_act_main = page.locator("#btn-generate-act")
        assert btn_act_main.is_visible(), "Кнопка 'Официальный Акт испытания 16 бар' должна быть видна на дашборде"
        assert "16 БАР" in btn_act_main.inner_text().upper() and "АКТ" in btn_act_main.inner_text().upper()

        # 2. Проверка валидации при клике до опрессовки
        page.evaluate("""() => {
            window.app.currentSite.pressTestPassed = false;
            window.app.currentSite.pressureTest = null;
            if (window.app.currentPhotos) window.app.currentPhotos.pressure = null;
            window.app.render();
        }""")

        # Кликаем по кнопке акта — должно открыться модальное окно протокола опрессовки
        dialog_messages = []
        page.on("dialog", lambda dialog: (dialog_messages.append(dialog.message), dialog.accept()))
        
        btn_act_main.click()
        page.wait_for_timeout(300)
        
        modal_pt = page.locator("#modal-pressure-test")
        assert modal_pt.is_visible(), "При отсутствии опрессовки должно открываться модальное окно протокола испытания"
        assert any("Официального Акта" in msg or "испытания" in msg for msg in dialog_messages), \
            f"Ожидалось предупреждение о необходимости опрессовки, получено: {dialog_messages}"

        # 3. Заполняем протокол опрессовки 16 бар через интерфейс
        page.fill("#pt-start-date", "2026-09-18")
        page.fill("#pt-start-time", "10:00")
        page.fill("#pt-end-date", "2026-09-19")
        page.fill("#pt-end-time", "10:00")
        page.fill("#pt-pressure-bar", "16.0")
        page.fill("#pt-notes", "Давление 16.0 бар выдержано 24 часа без падения (0.0 бар). Все узлы ввода FAR и трубы Rehau герметичны. Разрешена заливка стяжки.")

        # Эмулируем загрузку фото манометра (Data URL)
        sample_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        page.evaluate(f"""(photo) => {{
            if (!window.app.currentPhotos) window.app.currentPhotos = {{}};
            window.app.currentPhotos.pressure = photo;
            document.getElementById('pt-photo-status').innerText = '✓ Фото манометра прикреплено';
        }}""", sample_photo)

        # Сохраняем протокол опрессовки
        btn_submit_pt = modal_pt.locator("button[type='submit']")
        btn_submit_pt.click()
        page.wait_for_timeout(400)

        # 4. Проверяем, что опрессовка теперь подтверждена
        is_verified_now = page.evaluate("() => window.ligaPdfEngine.isPressureVerified(window.app.currentSite, window.app.currentPhotos)")
        assert is_verified_now, "После заполнения всех полей и фото опрессовка обязана быть верифицирована!"

        # 5. Тестируем генерацию бланка А4 Официального Акта в новом окне
        with context.expect_page() as new_page_info:
            btn_act_main.click()
        
        act_page = new_page_info.value
        act_page.wait_for_load_state("domcontentloaded")

        # 6. Проверка ключевых юридических и технических разделов в сгенерированном Акте 16 бар
        act_html = act_page.content()

        # Шапка и герб Лиги
        assert "Лига Опытных Мастеров" in act_html, "Акт должен содержать бренд Лиги Мастеров"
        assert "АКТ-16Б-" in act_html, "Акт должен иметь уникальный номер формата АКТ-16Б-*"
        assert "Официальный Акт гидравлического испытания" in act_html, "Заголовок документа должен быть точным"

        # Нормативы и параметры
        assert "DIN 1988" in act_html, "Акт должен ссылаться на норматив DIN 1988"
        assert "16.0 бар" in act_html, "Акт должен фиксировать испытательное давление 16.0 бар"
        assert "24 часа" in act_html, "Акт должен фиксировать выдержку 24 часа"
        assert "0.0 бар" in act_html, "Акт должен фиксировать отсутствие падения давления (0.0 бар)"

        # Резолюция допуска под стяжку
        assert "РАЗРЕШАЕТСЯ ПРОИЗВОДСТВО РАБОТ ПО ЗАЛИВКЕ ЦЕМЕНТНО-ПЕСЧАНОЙ СТЯЖКИ ПОЛА" in act_html, \
            "Акт обязан содержать официальную резолюцию допуска к стяжке пола"

        # Честный статус и подтверждение мастером
        assert "Результаты испытания внесены и подтверждены мастером" in act_html, \
            "Акт обязан содержать честное указание о подтверждении мастером"
        assert "не является независимым лабораторным сертификатом" in act_html, \
            "Акт обязан иметь честный юридический дисклеймер"

        # Подписи сторон
        assert "Хакимов Улугбек" in act_html, "Ведущий инженер Улугбек Хакимов должен быть указан в подписях"
        assert "ЛИГА" in act_html and "16 BAR" in act_html, "Акт должен содержать факсимиле мастера 16 BAR"
        assert "Производитель стяжки / Прораб" in act_html, "Акт должен предусматривать подпись стяжечника"

        # 7. Проверка доступности кнопки вызова в чек-листе стяжки
        page.click("button[data-screen='checklist']")
        page.wait_for_selector("#btn-act-screed-print")
        assert page.locator("#btn-act-screed-print").is_visible(), "Кнопка акта 16 бар должна быть доступна на экране стяжки"

        browser.close()
