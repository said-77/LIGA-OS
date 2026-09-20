"""
LIGA OS — Тест интеграции эталонного объекта ЖК Infinity и блока хроники на главном дашборде (v2.0.8)
Проверяет:
1. Автоматическое создание эталонного объекта «ЖК Infinity, Блок C» с полной 6-шаговой историей
2. Отображение блока «📜 Хроника объекта (Пройденные вехи)» прямо на Главном Дашборде
3. Корректность отображения вех (16 бар, стяжка, чистовая) и переход на полный экран истории
4. Фотофиксация экранов для аудитора и мастера
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8098
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


def test_dashboard_timeline_and_infinity_demo(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 1100})
        page = context.new_page()

        # 1. Открытие приложения
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".phase-stepper")
        page.wait_for_timeout(1000)

        # 2. Проверяем селектор объектов: там обязан быть эталонный объект «ЖК Infinity, Блок C»
        selector = page.locator("#site-selector")
        options_text = selector.inner_text()
        assert "Infinity" in options_text, f"Объект 'ЖК Infinity' обязан автоматически присутствовать в базе! Список: {options_text}"

        # 3. Выбираем объект «ЖК Infinity, Блок C»
        # Ищем option с Infinity
        infinity_val = page.evaluate("""() => {
            const sel = document.getElementById('site-selector');
            for (let opt of sel.options) {
                if (opt.text.includes('Infinity')) return opt.value;
            }
            return null;
        }""")
        assert infinity_val is not None, "Значение option для ЖК Infinity должно существовать"

        selector.select_option(value=infinity_val)
        page.wait_for_timeout(800)

        # 4. Проверяем заголовок объекта на дашборде
        site_name = page.locator("#site-name-display").inner_text()
        assert "Infinity" in site_name, f"Заголовок объекта должен быть ЖК Infinity, сейчас: {site_name}"

        # 5. Проверяем блок хроники прямо на Главном Дашборде
        preview_card = page.locator("#dashboard-timeline-preview-card")
        assert preview_card.is_visible(), "Блок 'Хроника объекта' обязан быть видим прямо на дашборде!"

        badge_text = page.locator("#dash-timeline-badge").inner_text()
        assert "вех" in badge_text, f"Бейдж количества вех должен отображаться, сейчас: {badge_text}"

        # Проверяем наличие записей вех в блоке дашборда
        items = page.locator(".dash-timeline-item")
        assert items.count() > 0, "На дашборде должны отображаться последние вехи объекта"

        first_item_text = items.first.inner_text().lower()
        assert ("чистов" in first_item_text or "стяжк" in first_item_text or "16 бар" in first_item_text or "аудит" in first_item_text), \
            f"В первой вехе должно быть описание ключевого этапа, сейчас: {first_item_text}"

        # Снимаем скриншот дашборда с 3D-хронометром и хроникой
        artifacts_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b8469a2d-cba0-46ac-a7a0-4b19190b81e0"
        page.screenshot(path=os.path.join(artifacts_dir, "screenshot_dashboard_timeline_infinity.png"))

        # 6. Кликаем по кнопке перехода к полной истории объекта с дашборда
        btn_more = page.locator("#btn-view-full-history")
        assert btn_more.is_visible(), "Кнопка 'Вся история объекта' должна быть доступна на дашборде"
        btn_more.click()
        page.wait_for_timeout(600)

        # 7. Проверяем, что открылся полноценный экран «История»
        history_screen = page.locator("#screen-history")
        assert history_screen.is_visible(), "Экран 'История' должен открыться по клику с дашборда"

        # Проверяем, что в Хронологии отображаются все 6 вех объекта
        timeline_items = page.locator("#timeline-events-container .timeline-item")
        assert timeline_items.count() >= 5, f"В полной истории должно быть не менее 5-6 вех, найдено: {timeline_items.count()}"

        # Снимаем скриншот полного экрана истории
        page.screenshot(path=os.path.join(artifacts_dir, "screenshot_history_screen_infinity.png"))

        browser.close()
