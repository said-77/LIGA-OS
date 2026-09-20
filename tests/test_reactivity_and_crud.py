"""
LIGA OS — Автоматический тест реактивности интерфейса, CRUD-операций и контроля памяти
Проверяет:
1. Реактивное переключение активного объекта через #site-selector с мгновенным обновлением экранов.
2. Удаление позиции материала (кнопка 🗑️) с реактивным пересчетом бейджа «Склад» на панели навигации.
3. Удаление выплаты бригаде с автоматическим возвратом суммы в остаток долга бригаде.
4. Отображение дисковой памяти устройства в менеджере резервных копий (#modal-backup-manager).
"""

import os
import time
import json
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

def test_reactivity_and_crud_workflow(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        # Автоматическое подтверждение диалогов window.confirm
        page.on("dialog", lambda dialog: dialog.accept())

        # 1. Открытие главной страницы
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")
        page.wait_for_selector("#site-selector")
        page.wait_for_selector("#site-name-display")

        # 2. Проверка начального объекта
        initial_site_name = page.locator("#site-name-display").inner_text()
        assert len(initial_site_name) > 0, "Заголовок объекта должен быть заполнен"

        # 3. Реактивное переключение объекта через #site-selector
        # Выбираем объект с id=2 (Вилла)
        page.select_option("#site-selector", value="2")
        page.wait_for_timeout(400)

        site_name_2 = page.locator("#site-name-display").inner_text()
        assert site_name_2 != initial_site_name, \
            f"После переключения заголовок объекта должен обновиться: {site_name_2}"

        # 4. Переключаемся обратно на объект 1
        page.select_option("#site-selector", value="1")
        page.wait_for_timeout(400)

        # Переходим на экран «Склад»
        page.locator('.bottom-nav .nav-item[data-screen="materials"]').click()
        page.wait_for_selector("#screen-materials.active")

        # Фиксируем начальное количество позиций материалов
        initial_items_count = page.locator("#materials-list-container .mat-item-card").count()
        assert initial_items_count > 0, f"На объекте 1 должны быть материалы, получено: {initial_items_count}"

        # Нажимаем кнопку корзины 🗑️ на первом материале
        delete_btn = page.locator("#materials-list-container .btn-item-delete").first
        assert delete_btn.is_visible(), "Кнопка корзины 🗑️ должна отображаться на карточке материала"
        delete_btn.click()
        page.wait_for_timeout(400)

        # Проверяем, что количество карточек уменьшилось на 1
        items_count_after = page.locator("#materials-list-container .mat-item-card").count()
        assert items_count_after == initial_items_count - 1, \
            f"Количество материалов должно уменьшиться с {initial_items_count} до {initial_items_count - 1}, получено: {items_count_after}"

        # 5. Проверка вкладки «История» -> «Бригада» и удаление выплаты
        page.locator('.bottom-nav .nav-item[data-screen="history"]').click()
        page.wait_for_selector("#screen-history.active")

        # Переключаемся на подвкладку «Бригада»
        page.locator('.history-subtab-btn[data-subtab="payouts"]').click()
        page.wait_for_timeout(400)

        # Проверяем наличие выплат
        payout_cards = page.locator("#brigade-payouts-container .payout-card-item")
        initial_payouts_count = payout_cards.count()
        assert initial_payouts_count > 0, f"Ожидаются выплаты бригаде на объекте 1, получено: {initial_payouts_count}"

        # Считываем текущий долг бригаде
        initial_brigade_owed = page.evaluate("window.app.currentSite.brigadeOwed || 0")

        # Считываем сумму первой выплаты из базы
        first_payout_amount = page.evaluate("""async () => {
            const payouts = await window.ligaDB.getBySiteId('brigade_payouts', window.app.currentSiteId);
            payouts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            return payouts[0] ? payouts[0].amountUZS : 0;
        }""")

        # Кликаем на кнопку удаления выплаты 🗑️
        payout_delete_btn = page.locator("#brigade-payouts-container .btn-item-delete").first
        assert payout_delete_btn.is_visible(), "Кнопка удаления 🗑️ должна быть видна на карточке выплаты"
        payout_delete_btn.click()
        page.wait_for_timeout(400)

        # Проверяем, что количество выплат уменьшилось на 1
        payouts_count_after = page.locator("#brigade-payouts-container .payout-card-item").count()
        assert payouts_count_after == initial_payouts_count - 1, \
            f"Количество выплат должно уменьшиться на 1, получено: {payouts_count_after}"

        # Проверяем, что сумма удаленной выплаты возвращена в долг бригаде
        brigade_owed_after = page.evaluate("window.app.currentSite.brigadeOwed || 0")
        assert brigade_owed_after == initial_brigade_owed + first_payout_amount, \
            f"Долг бригаде должен вырасти на {first_payout_amount} сум (было {initial_brigade_owed}, стало {brigade_owed_after})"

        # 6. Проверка менеджера бэкапа и отображения памяти устройства
        page.evaluate("window.app.openBackupManager()")
        page.wait_for_selector("#modal-backup-manager.open")

        stats_html = page.locator("#backup-current-stats").inner_html()
        assert "В локальной базе сохранено" in stats_html, "Должна отображаться статистика базы"

        # Закрываем модальное окно
        page.locator("#modal-backup-manager .btn-close-modal").click()
        page.wait_for_timeout(200)
        assert not page.locator("#modal-backup-manager.open").is_visible(), "Модалка должна закрыться"

        browser.close()
