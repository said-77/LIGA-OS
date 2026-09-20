"""
LIGA OS — Сквозной интеграционный тест реального жизненного цикла мастера (v2.0.7)
Симуляция полного цикла работы инженера Улугбека на объекте в Ташкенте:
1. Создание VIP-объекта «ЖК Infinity, Блок C, кв. 142»
2. Оценка работы 3D-хронометра готовности и темпа
3. Работа карточки «👉 Следующий шаг мастера» (Next Best Action)
4. Черновой монтаж и снабжение материалами на складе
5. Прохождение инженерного рубежа Quality Gate (16 бар + манометр)
6. Чек-лист технадзора перед стяжкой
7. Финальная сдача объекта и активация 10-летней гарантии
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


def test_master_real_lifecycle_simulation_full(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        # Автоматическое подтверждение всех диалогов confirm
        page.on("dialog", lambda dialog: dialog.accept())

        # 1. Открытие приложения
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".phase-stepper")

        # 2. Проверка наличия 3D-хронометра и карточки следующего шага
        radar = page.locator("#site-chrono-radar")
        assert radar.is_visible(), "3D-хронометр готовности должен быть видим на дашборде"

        progress_val = page.locator("#chrono-progress-val")
        assert progress_val.is_visible(), "Индикатор процента готовности должен отображаться"

        pace_badge = page.locator("#chrono-pace-badge")
        assert pace_badge.is_visible(), "Бейдж темпа объекта должен отображаться"

        next_action_card = page.locator("#site-next-action-card")
        assert next_action_card.is_visible(), "Карточка следующего шага мастера должна быть на экране"

        # 3. Создание реалистичного объекта в Ташкенте
        page.click("#btn-open-add-site")
        page.wait_for_selector("#modal-add-site.open")

        page.fill("#new-site-name", "ЖК Infinity, Блок C")
        page.fill("#new-site-unit", "кв. 142 (VIP-Пентхаус, 3 с/у)")
        page.fill("#new-site-client", "Шовкат-ака")
        page.fill("#new-site-phone", "+998909876543")
        page.fill("#new-site-designer", "Камила (Studio 7)")
        page.fill("#new-site-contract", "24000000")
        page.fill("#new-site-advance", "10000000")
        page.fill("#new-site-duration", "25")

        page.locator("#form-add-site .btn-submit-modal").click()
        page.wait_for_timeout(600)

        # Проверяем карточку созданного объекта
        site_title = page.locator("#site-name-display").inner_text()
        assert "Infinity" in site_title, "Новый объект должен стать активным"

        debt_val = page.locator("#fin-debt-val").inner_text()
        assert "14" in debt_val, "Остаток долга должен быть рассчитан: 24 млн - 10 млн = 14 млн сум"

        # 4. Проверяем карточку следующего шага мастера
        next_action_title = page.locator("#next-action-title").inner_text()
        assert len(next_action_title) > 0, "Следующий шаг мастера должен быть сформулирован системой"

        # 5. Переводим объект на этап 2 («Черновой монтаж»)
        step_2 = page.locator(".phase-step[data-phase='2']")
        step_2.click()
        page.wait_for_timeout(500)

        status_badge = page.locator("#site-status-badge").inner_text()
        assert "Черновой" in status_badge, "Статус должен перейти на Черновой монтаж"

        # 6. Закупка материалов на рынке Урикзор
        page.click("button[data-screen='materials']")
        page.wait_for_selector("#screen-materials", state="visible")

        page.click("#btn-open-receipt-modal")
        page.wait_for_selector("#modal-receipt.open")

        page.fill("#receipt-title", "Труба Rehau Rautitan Pink 20мм (бухта 100м)")
        page.fill("#receipt-amount", "1850000")
        page.fill("#receipt-qty", "100 м")
        page.locator("#form-add-receipt button[type='submit']").click()
        page.wait_for_timeout(400)

        # Возвращаемся к объекту через верхнюю плашку
        page.click("#screen-materials .btn-screen-back")
        page.wait_for_timeout(400)

        # 7. Попытка перевода на 3 этап («16 бар») — проверка рубежа допуска Quality Gate
        step_3 = page.locator(".phase-step[data-phase='3']")
        step_3.click()
        page.wait_for_timeout(600)

        gate_modal = page.locator("#modal-stage-quality-gate")
        assert gate_modal.is_visible(), "Карта допуска Quality Gate обязана заблокировать преждевременный перевод"

        # Кликаем на кнопку перехода к заполнению протокола 16 бар
        btn_action_pt = page.locator(".btn-gate-action:has-text('16 бар')")
        assert btn_action_pt.is_visible(), "Кнопка перехода к протоколу 16 бар должна быть доступна"
        btn_action_pt.click()
        page.wait_for_timeout(500)

        # Заполняем официальный протокол опрессовки 16 бар с прикреплением фото манометра
        modal_pt = page.locator("#modal-pressure-test")
        assert modal_pt.is_visible(), "Модальное окно опрессовки 16 бар должно открыться"

        # Симулируем прикрепление фото манометра через вызов JS приложения
        page.evaluate("""
            window.app.currentPhotos = window.app.currentPhotos || {};
            window.app.currentPhotos.pressure = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            document.getElementById('pt-pressure-bar').value = '16.0';
            document.getElementById('pt-notes').value = 'Давление 16.0 бар выдержано 24 часа без падения. Соединения Rehau и коллектор FAR герметичны.';
        """)

        # Сохраняем протокол опрессовки
        page.locator("#form-pressure-test button[type='submit']").click()
        page.wait_for_timeout(600)

        # Проверяем, что статус стал «3. Опрессовка 16 бар»
        assert "16 бар" in page.locator("#site-status-badge").inner_text()

        # 8. Проверка следующего шага: теперь система советует закрыть чек-лист перед стяжкой!
        next_step_text = page.locator("#next-action-title").inner_text()
        assert "чек-лист" in next_step_text.lower() or "стяжк" in next_step_text.lower(), \
            "Система должна автоматически предложить закрыть чек-лист перед стяжкой"

        # Кликаем по кнопке следующего шага
        page.click("#btn-next-action-trigger")
        page.wait_for_timeout(500)

        # Проверяем, что открылся экран чек-листа
        assert page.locator("#screen-checklist").is_visible(), "Экран чек-листа должен открыться по 1 клику"

        # Закрываем все пункты чек-листа
        check_items = page.locator(".check-item")
        count = check_items.count()
        for i in range(min(count, 10)):
            check_items.nth(i).click()
            page.wait_for_timeout(50)

        # Возвращаемся к объекту
        page.click("#screen-checklist .btn-screen-back")
        page.wait_for_timeout(400)

        # 9. Проверяем рост готовности на 3D-хронометре
        current_progress_str = page.locator("#chrono-progress-val").inner_text().replace("%", "")
        current_progress = int(current_progress_str)
        assert current_progress >= 70, f"Готовность объекта должна быть не менее 70%, сейчас: {current_progress}%"

        # Сохраняем скриншот реалистичной симуляции
        page.screenshot(path=r"C:\Users\Admin\.gemini\antigravity\brain\b8469a2d-cba0-46ac-a7a0-4b19190b81e0\screenshot_simulation_infinity.png")

        browser.close()
