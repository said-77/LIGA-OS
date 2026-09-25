# -*- coding: utf-8 -*-
"""
Тест автоматизации сметы (пресеты + утверждение договора) и склада (базовый комплект Rehau/FAR)
"""
import pytest
from playwright.sync_api import sync_playwright
import http.server
import threading
import time

PORT = 8098

@pytest.fixture(scope="module")
def local_server():
    server = http.server.HTTPServer(('127.0.0.1', PORT), http.server.SimpleHTTPRequestHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)
    yield f"http://127.0.0.1:{PORT}"
    server.shutdown()

def test_estimate_presets_and_bazaar_pack(local_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{local_server}/index.html")
        page.wait_for_selector(".bottom-nav")
        page.wait_for_timeout(600)

        # 1. Переходим на экран Сметы
        page.click('.bottom-nav .nav-item[data-screen="estimate"]')
        page.wait_for_timeout(300)
        assert page.locator("#screen-estimate").is_visible(), "Экран сметы не открылся"

        # 2. Применяем пресет «👑 4-комн. (Mirabad)»
        page.click("button:has-text('4-комн. (Mirabad)')")
        page.wait_for_timeout(300)

        # Проверяем, что значения обновились
        assert page.locator("#val-waterPoints").inner_text() == "18", "Количество точек должно быть 18"
        assert page.locator("#val-floorHeatingSqM").inner_text() == "80", "Площадь теплого пола должна быть 80"

        # Проверяем, что вилка цен пересчитана
        range_sum_text = page.locator("#est-range-sum").inner_text()
        assert "сум" in range_sum_text and len(range_sum_text) > 10, "Вилка цен не пересчиталась"

        # 3. Нажимаем «Утвердить как сумму договора объекта»
        page.click("#btn-apply-estimate-to-site")
        page.wait_for_timeout(400)

        # Проверяем, что вернулись на главный дашборд
        assert page.locator("#screen-dashboard").is_visible(), "Не вернулись на дашборд после утверждения сметы"

        # 4. Переходим на экран Склада
        page.click('.bottom-nav .nav-item[data-screen="materials"]')
        page.wait_for_timeout(300)
        assert page.locator("#screen-materials").is_visible(), "Экран материалов не открылся"

        # 5. Загружаем базовый комплект Rehau/FAR
        page.click("#btn-load-standard-materials")
        page.wait_for_timeout(400)

        # Проверяем, что в списке появились позиции
        mat_text = page.locator("#materials-list-container").inner_text()
        assert "Rehau" in mat_text, "Труба Rehau должна появиться в списке"
        assert "FAR" in mat_text, "Коллектор FAR должен появиться в списке"
        assert "Caleffi" in mat_text, "Редуктор Caleffi должен появиться в списке"

        browser.close()
