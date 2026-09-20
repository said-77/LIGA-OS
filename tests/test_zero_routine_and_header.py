import pytest
from playwright.sync_api import sync_playwright
import http.server
import threading
import time

PORT = 8097

@pytest.fixture(scope="module")
def local_server():
    server = http.server.HTTPServer(('127.0.0.1', PORT), http.server.SimpleHTTPRequestHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)
    yield f"http://127.0.0.1:{PORT}"
    server.shutdown()

def test_zero_routine_header_and_quick_fact(local_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{local_server}/index.html")
        page.wait_for_timeout(800)

        # 1. Проверяем кнопку «⋯ Ещё» в шапке
        btn_more = page.locator("#btn-more-menu-toggle")
        assert btn_more.is_visible(), "Кнопка «⋯ Ещё» должна быть видна в шапке"
        btn_more.click()
        page.wait_for_timeout(300)

        modal_more = page.locator("#modal-more-menu")
        assert modal_more.evaluate("el => el.classList.contains('open')"), "Модалка меню инструментов мастера должна открыться"

        # 2. Проверяем переключение темы через пункт в меню инструментов
        initial_theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
        page.click("#menu-item-theme")
        page.wait_for_timeout(300)
        toggled_theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
        assert initial_theme != toggled_theme, "Тема должна переключиться при клике по пункту меню"
        # Возвращаем тему назад
        page.click("#btn-more-menu-toggle")
        page.wait_for_timeout(200)
        page.click("#menu-item-theme")
        page.wait_for_timeout(200)

        # 3. Проверяем кнопку «📸 Зафиксировать факт (3 сек)» на Дашборде
        btn_quick_fact = page.locator("#btn-quick-fact-capture")
        assert btn_quick_fact.is_visible(), "Кнопка «Зафиксировать факт» должна присутствовать на Дашборде"
        btn_quick_fact.click()
        page.wait_for_timeout(300)

        modal_fact = page.locator("#modal-quick-fact")
        assert modal_fact.evaluate("el => el.classList.contains('open')"), "Модалка быстрой фиксации факта должна открыться"

        # 4. Проверяем выбор зоны «Ванная» и работы «Монтаж смесителя»
        page.click('#quick-fact-rooms-tags button[data-room="Ванная"]')
        assert page.input_value("#input-quick-fact-room") == "Ванная"

        page.click('#quick-fact-works-tags button[data-work="Монтаж смесителя скрытого монтажа"]')
        assert page.input_value("#input-quick-fact-title") == "Монтаж смесителя скрытого монтажа"

        # 5. Убеждаемся, что чекбокс «Выполнено заранее» активен
        check_early = page.locator("#check-quick-fact-early")
        check_early.check()

        # Сохраняем факт
        page.click("#btn-save-quick-fact")
        page.wait_for_timeout(600)

        # Проверяем, что модалка закрылась
        assert not modal_fact.evaluate("el => el.classList.contains('open')"), "Модалка должна закрыться после сохранения"

        # 6. Проверяем появление вехи в блоке Хроники на Дашборде
        timeline_html = page.inner_html("#dash-timeline-list")
        assert "Ванная: Монтаж смесителя скрытого монтажа" in timeline_html, "Зафиксированный факт должен отобразиться в хронике дашборда"
        assert "Зачтено заранее" in timeline_html or "✨" in timeline_html, "Должен отображаться бейдж нелинейной работы «Зачтено заранее»"

        # Снимаем скриншот обновленного главного дашборда
        page.screenshot(path="screenshot_zero_routine_v2_0_9.png")

        browser.close()
