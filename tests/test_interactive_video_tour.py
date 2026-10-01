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

        # Кликаем по кнопке видеогида в шапке
        btn_header.click()
        page.wait_for_timeout(300)

        # Открывается модалка выбора формата гида (или сразу видеотура)
        guide_video_btn = page.locator("#btn-guide-choice-video")
        if guide_video_btn.is_visible():
            guide_video_btn.click()
            page.wait_for_timeout(300)

        # Модалка видеотура должна открыться
        modal_tour = page.locator("#modal-video-tour")
        assert "open" in (modal_tour.get_attribute("class") or "")

        # Текущая версия гида показывает готовую видеозапись MP4.
        player = page.locator("#liga-real-mp4-player")
        assert player.is_visible()
        assert page.locator("#modal-video-tour").inner_text().find("Видеогид по системе LIGA OS") >= 0

        # Закрываем видеогид
        close_btn = page.locator("#btn-close-video-tour")
        close_btn.click()
        page.wait_for_timeout(200)
        assert "open" not in (modal_tour.get_attribute("class") or "")

        critical_errors = [e for e in console_errors if "favicon" not in e.lower()]
        assert len(critical_errors) == 0, f"JS errors: {critical_errors}"
        browser.close()

def test_video_tour_vip_client_mode_switch(http_server):
    """Проверка актуального перехода от гида к режиму показа клиенту"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector("#btn-video-tour-open")

        page.locator("#btn-video-tour-open").click()
        page.wait_for_timeout(300)

        guide_video_btn = page.locator("#btn-guide-choice-video")
        if guide_video_btn.is_visible():
            guide_video_btn.click()
            page.wait_for_timeout(300)

        # VIP-вкладка видеоплеера больше не используется. Проверяем действующий
        # независимый режим показа клиенту в шапке приложения.
        page.locator("#btn-close-video-tour").click()
        page.locator("#btn-client-mode-toggle").click()
        assert page.locator("html").get_attribute("data-client-mode") == "true"
        assert page.locator("#client-mode-banner").is_visible()
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
        assert "ШАГ 1 ИЗ" in badge_step.inner_text()

        title_text = page.locator("#spotlight-title-text")
        assert len(title_text.inner_text()) > 3

        # Нажимаем «Далее →»
        btn_next = page.locator("#btn-spotlight-next")
        assert btn_next.is_visible()
        btn_next.click(force=True)
        page.wait_for_timeout(300)

        # Шаг 2: Смета
        assert "2" in badge_step.inner_text()

        # Нажимаем «Назад»
        btn_prev = page.locator("#btn-spotlight-prev")
        assert btn_prev.is_visible()
        btn_prev.click(force=True)
        page.wait_for_timeout(300)
        assert "1" in badge_step.inner_text()

        # Закрываем тур крестиком
        btn_close = page.locator("#btn-spotlight-finish")
        btn_close.click(force=True)
        page.wait_for_function("() => document.getElementById('spotlight-tour-overlay').style.display === 'none'")
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
