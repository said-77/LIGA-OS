# -*- coding: utf-8 -*-
"""
Тест кастомизации блоков дашборда и десктопной двухколоночной сетки (v2.2.2)
"""
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

def test_dashboard_customization_presets_and_desktop_grid(local_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Начинаем с десктопного экрана 1280x800
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(f"{local_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # 1. Проверяем десктопную сетку: левая и правая колонки расположены рядом
        col_left = page.locator(".dashboard-col-left").bounding_box()
        col_right = page.locator(".dashboard-col-right").bounding_box()

        assert col_left is not None and col_right is not None, "Колонки десктопной сетки не найдены"
        assert col_right["x"] > col_left["x"], (
            f"Ожидалось расположение колонок бок о бок на экране 1280px, получено: "
            f"left_x={col_left['x']}, right_x={col_right['x']}"
        )

        # 2. По умолчанию все блоки видны
        assert page.locator("#site-chrono-radar").is_visible(), "Радар должен быть виден по умолчанию"
        assert page.locator("#site-next-action-card").is_visible(), "Следующий шаг должен быть виден"
        assert page.locator("#quick-fact-action-box").is_visible(), "Кнопка факта должна быть видна"
        assert page.locator("#dashboard-timeline-preview-card").is_visible(), "Хроника должна быть видна"
        assert page.locator("#dashboard-finances-card").is_visible(), "Финансы должны быть видны"

        # 3. Открываем Настройки ⚙️
        page.click("#btn-settings-top")
        page.wait_for_timeout(300)
        assert page.locator("#modal-settings").is_visible(), "Модалка настроек не открылась"

        # 4. Применяем пресет «⚡ Экспресс-минимал»
        page.click("#btn-preset-minimal")
        page.wait_for_timeout(300)

        # Закрываем настройки
        page.click("#btn-close-settings")
        page.wait_for_timeout(300)

        # Проверяем, что радар и хроника скрылись
        assert not page.locator("#site-chrono-radar").is_visible(), "Радар должен быть скрыт в минимализме"
        assert not page.locator("#site-next-action-card").is_visible(), "Следующий шаг должен быть скрыт"
        assert not page.locator("#dashboard-timeline-preview-card").is_visible(), "Хроника должна быть скрыта"

        # Но кнопка факта и финансы остались видны
        assert page.locator("#quick-fact-action-box").is_visible(), "Кнопка факта должна остаться видимой"
        assert page.locator("#dashboard-finances-card").is_visible(), "Финансы должны остаться видимыми"

        # 5. Снова открываем Настройки и возвращаем «💎 Все блоки (Полный)»
        page.click("#btn-settings-top")
        page.wait_for_timeout(300)
        page.click("#btn-preset-full")
        page.wait_for_timeout(300)
        page.click("#btn-close-settings")
        page.wait_for_timeout(300)

        # Все блоки снова видны
        assert page.locator("#site-chrono-radar").is_visible(), "Радар должен восстановиться"
        assert page.locator("#site-next-action-card").is_visible(), "Следующий шаг должен восстановиться"
        assert page.locator("#dashboard-timeline-preview-card").is_visible(), "Хроника должна восстановиться"

        browser.close()
