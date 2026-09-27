"""
Сквозной Playwright автотест Интерактивного Видеогида, VIP-шоурума
и живого Spotlight-тура по интерфейсу LIGA OS (v2.4.2).
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8112
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

def test_video_tour_header_button_and_modal_open(http_server):
    """Проверка открытия видеогида из шапки и навигации по главам"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector("#btn-video-tour-open")

        btn_header = page.locator("#btn-video-tour-open")
        assert btn_header.is_visible()

        # Кликаем по кнопке видеогида
        btn_header.click()
        page.wait_for_timeout(300)

        # Модалка видеотура должна открыться
        modal_tour = page.locator("#modal-video-tour")
        assert "open" in (modal_tour.get_attribute("class") or "")

        # Заголовок и 5 глав мастера
        title_el = page.locator("#video-tour-main-title")
        assert len(title_el.inner_text()) > 5

        chips = page.locator(".video-chapter-chip")
        assert chips.count() == 5

        # Переключаем на следующую главу
        next_btn = page.locator("#btn-video-next")
        assert next_btn.is_visible()
        next_btn.click()
        page.wait_for_timeout(200)

        badge_el = page.locator("#video-chapter-num-badge")
        assert "2/5" in badge_el.inner_text()

        # Закрываем видеогид
        close_btn = page.locator("#btn-close-video-tour")
        close_btn.click()
        page.wait_for_timeout(200)
        assert "open" not in (modal_tour.get_attribute("class") or "")

        critical_errors = [e for e in console_errors if "favicon" not in e.lower()]
        assert len(critical_errors) == 0, f"JS errors: {critical_errors}"
        browser.close()

def test_video_tour_vip_client_mode_switch(http_server):
    """Проверка переключения в режим VIP-презентации для заказчика"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector("#btn-video-tour-open")

        page.locator("#btn-video-tour-open").click()
        page.wait_for_timeout(300)

        # Переключаем на режим «👑 Для заказчика (VIP)»
        client_mode_tab = page.locator("#tab-video-mode-client")
        assert client_mode_tab.is_visible()
        client_mode_tab.click()
        page.wait_for_timeout(200)

        # Заголовок должен измениться на VIP Презентацию
        title_el = page.locator("#video-tour-main-title")
        assert "VIP" in title_el.inner_text()

        # В клиентском режиме 4 главы стандартов
        chips = page.locator(".video-chapter-chip")
        assert chips.count() == 4

        # Проверяем субтитры первого урока клиента
        sub_text = page.locator("#video-subtitles-text")
        assert "16.0" in sub_text.inner_text()

        # Закрываем
        page.locator("#btn-close-video-tour").click()
        browser.close()

def test_spotlight_live_tour_flow(http_server):
    """Проверка живого Spotlight-тура по реальным элементам интерфейса"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector("#header-safety-beacon")

        # Запуск тура через метод app
        page.evaluate("window.app.startSpotlightTour()")
        page.wait_for_timeout(400)

        # Оверлей живого тура отобразился
        overlay = page.locator("#spotlight-tour-overlay")
        assert overlay.is_visible()

        # Шаг 1: Световой маяк безопасности
        badge_step = page.locator("#spotlight-badge-step")
        assert "1" in badge_step.inner_text() and "5" in badge_step.inner_text()

        title_text = page.locator("#spotlight-title-text")
        assert len(title_text.inner_text()) > 3

        # Нажимаем «Далее →»
        btn_next = page.locator("#btn-spotlight-next")
        assert btn_next.is_visible()
        btn_next.click(force=True)
        page.wait_for_timeout(300)

        # Шаг 2: Смета
        assert "2" in badge_step.inner_text() and "5" in badge_step.inner_text()

        # Нажимаем «Назад»
        btn_prev = page.locator("#btn-spotlight-prev")
        assert btn_prev.is_visible()
        btn_prev.click(force=True)
        page.wait_for_timeout(300)
        assert "1" in badge_step.inner_text() and "5" in badge_step.inner_text()

        # Закрываем тур крестиком
        btn_close = page.locator(".btn-spotlight-close")
        btn_close.click(force=True)
        page.wait_for_timeout(300)
        assert not overlay.is_visible()

        browser.close()

def test_more_menu_video_tour_banner(http_server):
    """Проверка открытия видеотура из модального «⋯ Меню мастера»"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector("#btn-more-menu-toggle")

        # Открываем Меню мастера
        page.locator("#btn-more-menu-toggle").click()
        page.wait_for_timeout(300)

        # Баннер видеотура виден в меню
        menu_banner = page.locator("#banner-video-tour-menu")
        assert menu_banner.is_visible()

        # Кликаем по баннеру
        menu_banner.click()
        page.wait_for_timeout(300)

        # Меню должно закрыться, а плеер открыться
        assert "open" not in (page.locator("#modal-more-menu").get_attribute("class") or "")
        assert "open" in (page.locator("#modal-video-tour").get_attribute("class") or "")

        page.locator("#btn-close-video-tour").click()
        browser.close()
