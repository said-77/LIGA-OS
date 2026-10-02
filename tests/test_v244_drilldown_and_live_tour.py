# -*- coding: utf-8 -*-
"""
Тест LIGA OS v2.4.4: Сквозная кликабельность дашборда (Drill-Down),
понятный выбор Инженерного Гида и мобильная адаптивность Spotlight-тура.
"""
import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8118
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


def test_v244_drilldown_dashboard_to_finances(http_server):
    """Проверка сквозного перехода с карточек дашборда на экран финансов."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 850})
        page = context.new_page()

        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector("#site-name-display")

        # 1. Проверяем класс clickable-drilldown на карточке долга
        debt_card = page.locator("#card-fin-debt")
        classes = debt_card.get_attribute("class")
        assert "clickable-drilldown" in classes, "Карточка долга должна иметь класс clickable-drilldown"

        # 2. Клик по карточке остатка к получению переводит на screen-finances
        debt_card.click()
        page.wait_for_selector("#screen-finances.active", state="attached")
        assert page.locator("#screen-finances").is_visible(), "Экран финансов должен быть открыт"

        # 3. Возврат на дашборд через кнопку 'К объекту'
        page.locator("#screen-finances .btn-screen-back").first.click()
        page.wait_for_selector("#screen-dashboard.active", state="attached")

        # 4. Проверяем клик по карточке 'Сумма договора'
        contract_card = page.locator("#card-fin-contract")
        contract_card.click()
        page.wait_for_selector("#screen-finances.active", state="attached")
        assert page.locator("#screen-finances").is_visible(), "Экран финансов должен открыться после клика по 'Сумма договора'"

        page.locator("#screen-finances .btn-screen-back").first.click()
        page.wait_for_selector("#screen-dashboard.active", state="attached")

        # 5. Проверяем клик по карточке 'Аванс получен'
        advance_card = page.locator("#card-fin-advance")
        advance_card.click()
        page.wait_for_selector("#screen-finances.active", state="attached")
        assert page.locator("#screen-finances").is_visible(), "Экран финансов должен открыться после клика по 'Аванс получен'"

        browser.close()


def test_v244_drilldown_materials_and_pressure(http_server):
    """Проверка перехода с карточек базарного кармана и статуса опрессовки."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 850})
        page = context.new_page()

        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector("#site-name-display")

        # 1. Клик по базарному карману мастера переводит на экран материалов
        bazaar_banner = page.locator("#fin-bazaar-pocket-banner")
        bazaar_banner.click()
        page.wait_for_selector("#screen-materials.active", state="attached")
        assert page.locator("#screen-materials").is_visible(), "Экран материалов должен открыться"

        # Возвращаемся на дашборд через навигацию
        page.locator(".bottom-nav .nav-item[data-screen='dashboard']").click()
        page.wait_for_selector("#screen-dashboard.active", state="attached")

        # 2. Клик по бейджу опрессовки 16 бар открывает официальный протокол опрессовки
        pressure_badge = page.locator("#site-status-badge")
        pressure_badge.click()
        page.wait_for_selector("#modal-pressure-test", state="visible")
        assert page.locator("#modal-pressure-test").is_visible(), "Модальное окно опрессовки 16 бар должно открыться"

        # Закрываем модальное окно
        page.locator("#modal-pressure-test .btn-close-modal").first.click()
        page.wait_for_timeout(100)

        browser.close()


def test_v244_mobile_guide_modal_and_spotlight_viewport(http_server):
    """Проверка мобильной видимости кнопки гида ('ГИД') и адаптивности оверлея тура."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Мобильный экран iPhone / Samsung Galaxy
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector("#site-name-display")

        # 1. Проверяем кнопку гида в шапке на мобильном экране
        btn_guide = page.locator("#btn-video-tour-open")
        assert btn_guide.is_visible(), "Кнопка гида должна быть видна в шапке на мобильном"
        
        # На узком экране кнопка компактная; её назначение доступно через aria-label.
        assert page.locator("#btn-video-tour-open").get_attribute("aria-label") == "Инженерный гид и подсказки мастера"

        # 2. Клик открывает модальное окно выбора формата 'Инженерный Гид LIGA OS'
        btn_guide.click()
        page.wait_for_selector("#modal-system-guide", state="visible")
        assert page.locator("#modal-system-guide").is_visible(), "Окно выбора гида должно быть видно"

        # 3. Выбираем вариант '✨ 1. Живой обзор по экрану'
        choice_tour = page.locator("#btn-guide-choice-tour")
        choice_tour.click()
        page.wait_for_timeout(200)

        # Окно выбора закрылось, открылся оверлей тура
        assert not page.locator("#modal-system-guide").is_visible(), "Окно выбора гида должно закрыться"
        assert page.locator("#spotlight-tour-overlay").is_visible(), "Оверлей живого тура должен быть виден"

        # 4. Проверяем, что карточка тура находится внутри видимой области экрана на мобильном
        tooltip_card = page.locator("#spotlight-tooltip-card")
        assert tooltip_card.is_visible(), "Карточка подсказки тура должна быть видна"

        # Проверяем клик 'Далее →'
        btn_next = page.locator("#btn-spotlight-next")
        btn_next.click()
        page.wait_for_timeout(100)

        # 5. Проверяем клик по '✕ Закрыть' - он должен выполняться без ошибки viewport
        btn_finish = page.locator("#btn-spotlight-finish")
        assert btn_finish.is_visible(), "Кнопка '✕ Закрыть' должна быть видна на мобильном"
        btn_finish.click()
        page.wait_for_timeout(100)

        assert not page.locator("#spotlight-tour-overlay").is_visible(), "Тур должен успешно закрыться"

        browser.close()
