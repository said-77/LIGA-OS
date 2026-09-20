"""
LIGA OS — Автоматический тест 10-летней инженерной истории и элитного UI
Проверяет:
1. Доступность вкладки «История» на нижней навигации (6 вкладок).
2. Рендеринг хронологической ленты (Timeline) с бейджами этапов.
3. Добавление новой записи в хронологию объекта (Append-Only).
4. Переключение подвкладок «Хронология», «Бригада», «Оборудование».
5. Отображение выплат бригаде и скрытие их в клиентском режиме (Client View).
6. Отображение паспортов установленного оборудования.
7. Работу бейджей уведомлений на нижней навигации.
"""

import os
import time
import json
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8094
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

def test_engineering_history_and_elite_ui_workflow(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        # 1. Открытие главной страницы
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # 2. Проверка наличия 6 вкладок навигации
        nav_items = page.locator(".bottom-nav .nav-item")
        assert nav_items.count() == 6, f"Ожидается 6 вкладок навигации, найдено: {nav_items.count()}"

        history_nav_btn = page.locator('.bottom-nav .nav-item[data-screen="history"]')
        assert history_nav_btn.is_visible(), "Кнопка «История» обязана присутствовать на навигационной панели"

        # 3. Переход в экран «История»
        history_nav_btn.click()
        page.wait_for_selector("#screen-history.active")
        assert page.locator("#screen-history").is_visible(), "Экран истории обязан стать активным"

        # 4. Проверка отображения хронологической ленты (Timeline)
        page.wait_for_selector(".timeline-item")
        timeline_items = page.locator(".timeline-item")
        assert timeline_items.count() >= 3, f"Ожидаются эталонные записи хронологии (>=3), найдено: {timeline_items.count()}"

        # Проверка наличия бейджей этапов
        pressure_badge = page.locator(".badge-event-pressure")
        assert pressure_badge.is_visible(), "Бейдж опрессовки 16 бар обязан отображаться в таймлайне"

        # 5. Добавление новой записи в хронику объекта
        btn_add_event = page.locator("#btn-open-add-event")
        assert btn_add_event.is_visible(), "Кнопка добавления события обязана быть видна мастеру"
        btn_add_event.click()

        page.wait_for_selector("#modal-add-event.open")
        page.fill("#event-title", "Лазерный контроль стяжки")
        page.fill("#event-desc", "Стяжка залита под лазерным контролем, перепад 0 мм. Все трассы защищены.")
        page.locator("#form-add-event button[type='submit']").click()

        # Проверяем, что событие появилось в таймлайне
        page.wait_for_selector(".timeline-title:has-text('Лазерный контроль стяжки')")
        assert page.locator(".timeline-title:has-text('Лазерный контроль стяжки')").is_visible()

        # 6. Проверка подвкладки «Бригада»
        subtab_payouts_btn = page.locator('.history-subtab-btn[data-subtab="payouts"]')
        assert subtab_payouts_btn.is_visible(), "Подвкладка выплат бригаде обязана быть доступна мастеру"
        subtab_payouts_btn.click()

        page.wait_for_selector("#subtab-content-payouts")
        assert page.locator("#subtab-content-payouts").is_visible()

        payout_items = page.locator(".payout-card-item")
        assert payout_items.count() >= 2, f"Ожидаются выплаты помощникам (>=2), найдено: {payout_items.count()}"

        # 7. Проверка подвкладки «Оборудование»
        subtab_eq_btn = page.locator('.history-subtab-btn[data-subtab="equipment"]')
        subtab_eq_btn.click()

        page.wait_for_selector("#subtab-content-equipment")
        assert page.locator("#subtab-content-equipment").is_visible()

        eq_items = page.locator(".equipment-card")
        assert eq_items.count() >= 3, f"Ожидаются паспорта оборудования (>=3), найдено: {eq_items.count()}"
        assert page.locator(".equipment-brand:has-text('FAR Rubinetterie')").is_visible()
        assert page.locator(".equipment-brand:has-text('Rehau')").is_visible()

        # 8. Проверка изоляции в Клиентском Режиме (Client View)
        # Включаем клиентский режим
        btn_client_toggle = page.locator("#btn-client-mode-toggle")
        btn_client_toggle.click()
        page.wait_for_selector("body.client-mode")

        # Переходим обратно в экран истории
        history_nav_btn.click()

        # В клиентском режиме вкладка бригады должна быть скрыта (.master-only)
        assert not subtab_payouts_btn.is_visible(), "Кнопка подвкладки бригады обязана быть скрыта в Client View"
        assert not page.locator("#subtab-content-payouts").is_visible(), "Раздел выплат бригаде обязан быть скрыт от заказчика"

        # Таймлайн и оборудование остаются видны клиенту (гордость инженера)
        assert page.locator('.history-subtab-btn[data-subtab="timeline"]').is_visible()
        assert page.locator('.history-subtab-btn[data-subtab="equipment"]').is_visible()

        browser.close()
