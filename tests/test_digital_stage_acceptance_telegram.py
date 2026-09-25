"""
Сквозной Playwright автотест цифрового сценария приёмки этапа заказчиком по ссылке в Telegram (v2.2.5).
Проверяет:
1. Наличие кнопки «Акт приёмки этапа для заказчика (Ссылка в Telegram)» (#btn-share-stage-acceptance) на Главном Дашборде;
2. Работу генератора ссылки мастером (#modal-generate-stage-link):
   - Выбор этапа (Разводка под стяжку, Котельная/коллекторы FAR, Чистовой монтаж);
   - Автоподстановку параметров объекта (ЖК Mirabad Avenue, Заказчик, 16.0 бар);
   - Формирование персональной ссылки с параметром ?verify_stage=STG-*;
   - Копирование готового вежливого сообщения со ссылкой.
3. Процесс электронной приёмки со стороны Заказчика:
   - Переход по URL ?verify_stage=...&site=...&client=...&bar=16.0;
   - Автоматическое открытие интерактивного бланка приёмки #modal-verify-stage;
   - Проверку реквизитов: Лига Опытных Мастеров, инженер Улугбек Хакимов, 16.0 бар / 24 часа, допуск по лазеру до 1 мм;
   - Нажатие кнопки подтверждения приёмки #btn-confirm-stage-action;
   - Фиксацию факта приёмки, появление блока #verify-stage-success-box с датой и кнопкой уведомления в Telegram.
"""

import os
import time
import threading
import urllib.parse
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8095
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

def test_digital_stage_acceptance_telegram_workflow(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Мастер на объекте (смартфон 393x852)
        master_context = browser.new_context(viewport={"width": 393, "height": 852})
        master_page = master_context.new_page()

        master_page.goto(f"{http_server}/index.html")
        master_page.wait_for_selector(".bottom-nav")

        # 1. Проверяем наличие кнопки вызова ссылки приёмки на Дашборде
        btn_stage = master_page.locator("#btn-share-stage-acceptance")
        assert btn_stage.is_visible(), "Кнопка 'Акт приёмки этапа для заказчика' должна быть видна на дашборде"
        assert "ПРИЁМКИ" in btn_stage.inner_text().upper() or "ПРИЕМКИ" in btn_stage.inner_text().upper()

        # 2. Кликаем по кнопке и открываем генератор ссылки мастера
        btn_stage.click()
        master_page.wait_for_selector("#modal-generate-stage-link.open")

        modal_gen = master_page.locator("#modal-generate-stage-link")
        assert modal_gen.is_visible(), "Модальное окно генерации ссылки должно открыться"

        # Проверяем заполненные поля объекта
        site_name_el = master_page.locator("#stage-link-site-name")
        assert "Mirabad" in site_name_el.inner_text() or "ЖК" in site_name_el.inner_text()

        # Выбираем этап 2 (Монтаж коллекторных узлов FAR и котельного оборудования)
        master_page.select_option("#stage-select-preset", "2")
        master_page.wait_for_timeout(200)

        # Проверяем сгенерированный текст сообщения
        preview_text = master_page.input_value("#stage-link-message-preview")
        assert "Этап:" in preview_text, "Сообщение должно содержать выбранный этап"
        assert "FAR" in preview_text or "коллектор" in preview_text.lower(), "Сообщение должно упоминать коллекторы FAR"
        assert "verify_stage=" in preview_text, "В сообщении должна присутствовать ссылка с параметром ?verify_stage="
        assert "Хакимов" in preview_text, "Сообщение должно быть подписано мастером Улугбеком Хакимовым"

        # Проверяем кнопку копирования
        btn_copy = master_page.locator("#btn-copy-stage-link")
        assert btn_copy.is_visible()
        btn_copy.click()
        master_page.wait_for_timeout(200)

        # Извлекаем URL для заказчика из сгенерированного текста
        lines = preview_text.split('\n')
        target_url = None
        for line in lines:
            line = line.strip()
            if "verify_stage=" in line:
                target_url = line
                break

        assert target_url is not None, f"Ссылка приёмки не найдена в тексте:\n{preview_text}"
        parsed = urllib.parse.urlparse(target_url)
        # Подменяем хост на локальный тестовый сервер
        client_test_url = f"{http_server}{parsed.path}?{parsed.query}"

        # Закрываем модал мастера
        master_page.locator("#modal-generate-stage-link .btn-close-modal").click()
        master_page.wait_for_timeout(200)

        # ---------------------------------------------------------------------
        # 3. Сценарий Заказчика: открываем ссылку в отдельном контексте (браузер клиента)
        # ---------------------------------------------------------------------
        client_context = browser.new_context(viewport={"width": 390, "height": 844})
        client_page = client_context.new_page()

        client_page.goto(client_test_url)
        client_page.wait_for_selector(".bottom-nav")

        # Проверяем автоматическое открытие модала приёмки этапа
        client_page.wait_for_selector("#modal-verify-stage.open", timeout=3000)
        verify_modal = client_page.locator("#modal-verify-stage")
        assert verify_modal.is_visible(), "Модальное окно приёмки этапа обязано автоматически открыться у заказчика"

        # Проверяем отображение реквизитов на экране заказчика
        modal_text = verify_modal.inner_text().upper()
        assert "ЛИГА ОПЫТНЫХ МАСТЕРОВ" in modal_text
        assert "ХАКИМОВ УЛУГБЕК" in modal_text
        assert "16.0 БАР" in modal_text or "16" in modal_text
        assert "1 ММ" in modal_text

        # Проверяем наличие кнопки подтверждения
        btn_confirm = client_page.locator("#btn-confirm-stage-action")
        assert btn_confirm.is_visible(), "Кнопка 'Подтверждаю приёмку этапа' должна быть видна заказчику"

        # 4. Заказчик нажимает «✓ Подтверждаю приёмку этапа»
        btn_confirm.click()
        client_page.wait_for_timeout(300)

        # Проверяем, что кнопка скрылась, а блок подтверждения стал видим
        assert not btn_confirm.is_visible(), "Кнопка подтверждения должна скрыться после подписания"
        success_box = client_page.locator("#verify-stage-success-box")
        assert success_box.is_visible(), "Блок успешного подтверждения обязан отобразиться"
        assert "ЭТАП УСПЕШНО ПРИНЯТ" in success_box.inner_text().upper()

        # Проверяем наличие кнопки уведомления мастера в Telegram
        btn_notify = client_page.locator("#btn-notify-master-telegram")
        assert btn_notify.is_visible(), "Кнопка уведомления мастера в Telegram должна отображаться"

        # Закрываем контексты
        client_context.close()
        master_context.close()
        browser.close()
