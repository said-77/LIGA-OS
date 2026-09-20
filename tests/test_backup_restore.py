"""
Автоматический сквозной тест надежного резервного копирования и восстановления (P0-4)
Проверяет:
1. Открытие менеджера резервного копирования (#modal-backup-manager) и отображение статистики.
2. Экспорт базы данных: формирование JSON с полной структурой (appName, schemaVersion, sites, materials, checklists, tariffSettings, exportDate).
3. Строгость валидатора схемы: отказ и вывод понятной ошибки при попытке загрузить битый/чужой файл.
4. Полный цикл End-to-End: создание уникального объекта -> экспорт -> изменение базы -> импорт бэкапа -> проверка карточки метаданных -> подтверждение восстановления -> сверка данных в DOM.
5. Защита от вызова менеджера резервного копирования в клиентском режиме (Client View).
"""

import os
import time
import json
import threading
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

def test_backup_and_restore_full_workflow(http_server, tmp_path):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852}, accept_downloads=True)
        page = context.new_page()

        # 1. Загрузка приложения
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # 2. Открытие менеджера резервного копирования
        btn_backup_top = page.locator("#btn-backup-top")
        assert btn_backup_top.is_visible(), "Кнопка бэкапа в шапке должна быть видна мастеру"
        btn_backup_top.click()

        modal = page.locator("#modal-backup-manager")
        page.wait_for_selector("#modal-backup-manager.open")
        assert modal.is_visible(), "Модальное окно бэкапа обязано открыться"

        # Проверка статистики текущей базы
        stats_el = page.locator("#backup-current-stats")
        assert "объекта" in stats_el.inner_text().lower(), "Статистика базы должна содержать информацию об объектах"

        # 3. Тест экспорта: скачивание файла резервной копии
        with page.expect_download() as download_info:
            page.locator("#btn-do-backup-export").click()
        download = download_info.value

        download_name = download.suggested_filename
        assert download_name.startswith("liga_backup_"), f"Имя файла бэкапа должно начинаться с liga_backup_, получено: {download_name}"
        assert download_name.endswith(".json"), f"Файл должен иметь расширение .json, получено: {download_name}"

        download_path = tmp_path / download_name
        download.save_as(str(download_path))

        # Валидация структуры скачанного файла JSON
        with open(download_path, "r", encoding="utf-8") as f:
            backup_data = json.load(f)

        assert backup_data.get("appName") == "LIGA OS", "В бэкапе обязано быть поле appName='LIGA OS'"
        assert backup_data.get("schemaVersion") == 1, "Версия схемы обязана быть 1"
        assert isinstance(backup_data.get("sites"), list) and len(backup_data["sites"]) > 0, "Список объектов не должен быть пустым"
        assert isinstance(backup_data.get("materials"), list), "Список материалов обязан быть массивом"
        assert isinstance(backup_data.get("checklists"), list), "Список чек-листов обязан быть массивом"
        assert "exportDate" in backup_data, "Поле exportDate обязано присутствовать"

        # 4. Тест строгости валидатора: загрузка некорректного файла
        invalid_file_path = tmp_path / "corrupted_backup.json"
        with open(invalid_file_path, "w", encoding="utf-8") as f:
            f.write(json.dumps({"foreign_app": "Unknown", "data": [1, 2, 3]}))

        page.set_input_files("#input-backup-file", str(invalid_file_path))
        page.wait_for_timeout(300)

        err_msg = page.locator("#backup-error-msg")
        assert err_msg.is_visible(), "Сообщение об ошибке валидации обязано появиться!"
        assert "не является резервной копией liga os" in err_msg.inner_text().lower()
        assert not page.locator("#backup-preview-card").is_visible(), "Карточка подтверждения не должна отображаться для битого файла"

        # Закрываем модалку
        page.locator("#modal-backup-manager .btn-close-modal").click()
        page.wait_for_timeout(200)

        # 5. Тест End-to-End: создаем новый уникальный объект
        page.locator("#btn-open-add-site").click()
        page.wait_for_selector("#modal-add-site.open")

        test_site_name = "Вилла Самарканд E2E"
        page.fill("#new-site-name", test_site_name)
        page.fill("#new-site-client", "Баходир-ака VIP")
        page.fill("#new-site-phone", "+998901234567")
        page.fill("#new-site-contract", "55000000")
        page.locator("#form-add-site .btn-submit-modal").click()
        page.wait_for_timeout(400)

        # Проверяем, что новый объект появился на экране
        site_title = page.locator("#site-name-display").inner_text()
        assert test_site_name in site_title, f"Новый объект должен отображаться, получено: {site_title}"

        # Делаем экспорт бэкапа с новым объектом
        btn_backup_top.click()
        page.wait_for_selector("#modal-backup-manager.open")

        with page.expect_download() as download_info2:
            page.locator("#btn-do-backup-export").click()
        download2 = download_info2.value
        backup_with_site_path = tmp_path / download2.suggested_filename
        download2.save_as(str(backup_with_site_path))

        # Закрываем модалку
        page.locator("#modal-backup-manager .btn-close-modal").click()
        page.wait_for_timeout(200)

        # Меняем активный объект на другой (например, создаем еще один объект «Служебный объект X»)
        page.locator("#btn-open-add-site").click()
        page.wait_for_selector("#modal-add-site.open")
        page.fill("#new-site-name", "Служебный объект X")
        page.fill("#new-site-client", "Тест")
        page.fill("#new-site-contract", "10000000")
        page.locator("#form-add-site .btn-submit-modal").click()
        page.wait_for_timeout(400)
        assert "Служебный объект X" in page.locator("#site-name-display").inner_text()

        # 6. Теперь восстанавливаемся из сохраненного бэкапа
        btn_backup_top.click()
        page.wait_for_selector("#modal-backup-manager.open")

        # Выбираем валидный файл бэкапа
        page.set_input_files("#input-backup-file", str(backup_with_site_path))
        page.wait_for_timeout(300)

        # Проверяем отображение карточки предпросмотра метаданных
        preview_card = page.locator("#backup-preview-card")
        assert preview_card.is_visible(), "Карточка предпросмотра метаданных обязана появиться"
        preview_details = page.locator("#backup-preview-details").inner_text().lower()
        assert "liga os" in preview_details
        assert "объектов" in preview_details

        # Нажимаем кнопку подтверждения восстановления
        page.locator("#btn-confirm-restore").click()
        page.wait_for_timeout(600)

        # Модалка должна закрыться
        assert not page.locator("#modal-backup-manager.open").is_visible(), "Модалка должна закрыться после восстановления"

        # Проверяем, что в селекторе объектов присутствует объект из архива
        site_select_options = page.locator("#site-selector").inner_text()
        assert test_site_name in site_select_options, f"Объект «{test_site_name}» обязан присутствовать в восстановленной базе!"
        # А объект «Служебный объект X» (которого не было в бэкапе) должен отсутствовать!
        assert "Служебный объект X" not in site_select_options, "Объекты, созданные после бэкапа, должны быть заменены архивными данными!"

        # 7. Защита в клиентском режиме
        page.locator("#btn-client-mode-toggle").click()
        page.wait_for_timeout(200)

        # Кнопка бэкапа в шапке должна быть скрыта
        assert not page.locator("#btn-backup-top").is_visible(), "Кнопка бэкапа обязана быть скрыта в клиентском режиме!"

        # Попытка открыть модалку программно блокируется
        page.evaluate("window.app.openModal('modal-backup-manager')")
        page.wait_for_timeout(200)
        assert not page.locator("#modal-backup-manager.open").is_visible(), "Модалка бэкапа не должна открываться в клиентском режиме!"

        browser.close()
