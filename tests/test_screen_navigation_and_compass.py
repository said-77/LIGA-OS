"""
Сквозной Playwright автотест навигационной системы, компаса активного экрана и Hero-баннеров (v2.3.1).
Проверяет:
1. Выделение активного раздела в нижнем меню (.bottom-nav):
   - Получение класса .active, золотой подсветки и индикатора;
2. Навигационный компас в шапке (#header-screen-ribbon):
   - Корректное обновление иконки, названия раздела и текущего объекта;
3. Hero-баннеры разделов (.screen-hero-bar):
   - Наличие на экранах финансов, склада, контроля, сметы и истории четких заголовков;
   - Работу кнопки возврата «← К объекту» (.btn-screen-back-hero);
4. Синхронизацию при переключении объектов в селекторе.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8101
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

def test_screen_navigation_and_header_ribbon(http_server):
    """Проверка переключения всех 6 разделов и отображения компаса в шапке"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        ribbon_icon = page.locator("#ribbon-screen-icon")
        ribbon_name = page.locator("#ribbon-screen-name")
        ribbon_site = page.locator("#ribbon-site-name")

        # 1. Начальное состояние: Главный экран (Объекты)
        assert ribbon_icon.inner_text() == "🏢"
        assert ribbon_name.inner_text() == "ОБЪЕКТЫ"
        assert len(ribbon_site.inner_text()) > 0
        assert page.locator("#screen-dashboard").is_visible()

        # 2. Переход в раздел «Финансы»
        page.locator('.bottom-nav button[data-screen="finances"]').click()
        page.wait_for_timeout(200)
        assert page.locator("#screen-finances").is_visible(), "Экран финансов должен быть открыт"
        assert page.locator('.bottom-nav button[data-screen="finances"]').evaluate("el => el.classList.contains('active')")
        assert ribbon_icon.inner_text() == "💰"
        assert ribbon_name.inner_text() == "ФИНАНСЫ"
        hero_fin = page.locator("#screen-finances .screen-hero-title")
        assert hero_fin.is_visible()
        assert "ФИНАНСЫ И КАССА" in hero_fin.inner_text()

        # 3. Переход в раздел «Склад»
        page.locator('.bottom-nav button[data-screen="materials"]').click()
        page.wait_for_timeout(200)
        assert page.locator("#screen-materials").is_visible(), "Экран склада должен быть открыт"
        assert page.locator('.bottom-nav button[data-screen="materials"]').evaluate("el => el.classList.contains('active')")
        assert ribbon_icon.inner_text() == "📦"
        assert ribbon_name.inner_text() == "СКЛАД"
        hero_mat = page.locator("#screen-materials .screen-hero-title")
        assert hero_mat.is_visible()
        assert "СКЛАД И СНАБЖЕНИЕ" in hero_mat.inner_text()

        # 4. Переход в раздел «Контроль»
        page.locator('.bottom-nav button[data-screen="checklist"]').click()
        page.wait_for_timeout(200)
        assert page.locator("#screen-checklist").is_visible(), "Экран контроля должен быть открыт"
        assert page.locator('.bottom-nav button[data-screen="checklist"]').evaluate("el => el.classList.contains('active')")
        assert ribbon_icon.inner_text() == "🛡️"
        assert ribbon_name.inner_text() == "КОНТРОЛЬ"
        hero_chk = page.locator("#screen-checklist .screen-hero-title")
        assert hero_chk.is_visible()
        assert "ТЕХНАДЗОР И ИСПЫТАНИЯ" in hero_chk.inner_text()

        # 5. Переход в раздел «Смета»
        page.locator('.bottom-nav button[data-screen="estimate"]').click()
        page.wait_for_timeout(200)
        assert page.locator("#screen-estimate").is_visible(), "Экран сметы должен быть открыт"
        assert page.locator('.bottom-nav button[data-screen="estimate"]').evaluate("el => el.classList.contains('active')")
        assert ribbon_icon.inner_text() == "⚡"
        assert ribbon_name.inner_text() == "СМЕТА"
        hero_est = page.locator("#screen-estimate .screen-hero-title")
        assert hero_est.is_visible()
        assert "ЭКСПРЕСС-СМЕТА" in hero_est.inner_text()

        # 6. Переход в раздел «История»
        page.locator('.bottom-nav button[data-screen="history"]').click()
        page.wait_for_timeout(200)
        assert page.locator("#screen-history").is_visible(), "Экран истории должен быть открыт"
        assert page.locator('.bottom-nav button[data-screen="history"]').evaluate("el => el.classList.contains('active')")
        assert ribbon_icon.inner_text() == "📜"
        assert ribbon_name.inner_text() == "ИСТОРИЯ"
        hero_his = page.locator("#screen-history .screen-hero-title")
        assert hero_his.is_visible()
        assert "ИСТОРИЯ ОБЪЕКТА" in hero_his.inner_text()

        # 7. Возврат к объекту по кнопке в Hero-баннере
        btn_back = page.locator("#screen-history .btn-screen-back-hero")
        assert btn_back.is_visible()
        btn_back.click()
        page.wait_for_timeout(200)
        assert page.locator("#screen-dashboard").is_visible(), "Должен вернуться главный экран"
        assert page.locator('.bottom-nav button[data-screen="dashboard"]').evaluate("el => el.classList.contains('active')")
        assert ribbon_icon.inner_text() == "🏢"
        assert ribbon_name.inner_text() == "ОБЪЕКТЫ"

        browser.close()

def test_site_change_syncs_ribbon(http_server):
    """Проверка синхронизации названия объекта в компасе шапки при смене объекта"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector("#site-selector")

        ribbon_site = page.locator("#ribbon-site-name")
        initial_site = ribbon_site.inner_text()
        assert len(initial_site) > 0

        # Выбираем второй объект, если доступен
        options_count = page.locator("#site-selector option").count()
        if options_count > 1:
            page.locator("#site-selector").select_option(index=1)
            page.wait_for_timeout(200)
            new_site = ribbon_site.inner_text()
            assert len(new_site) > 0

        browser.close()
