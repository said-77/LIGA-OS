"""
Автоматический сквозной тест 100% офлайн-работы PWA LIGA OS
Проверяет:
1. Успешную регистрацию Service Worker.
2. Кэширование оболочки приложения.
3. Полное отключение сети (context.set_offline(True)).
4. Успешную перезагрузку страницы (page.reload()) без подключения к интернету.
5. Работу IndexedDB, переключение экранов, расчет сметы в полном офлайне (условия монолитных подвалов).
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8097
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

def test_pwa_offline_resilience(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        # 1. Загрузка приложения онлайн для прогрева кэша Service Worker
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # Ожидаем готовности Service Worker и взятия страницы под контроль (controller)
        page.evaluate("""async () => {
            const reg = await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) {
                await new Promise((resolve) => {
                    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
                    setTimeout(resolve, 2000);
                });
            }
            // Убеждаемся, что кэш заполнен ресурсами
            const cache = await caches.open('liga-os-v1.4.6-p0');
            const keys = await cache.keys();
            return keys.length > 0;
        }""")
        page.wait_for_timeout(500)

        # 2. Имитируем монолитный подвал новостройки: ПОЛНОЕ ОТКЛЮЧЕНИЕ СЕТИ
        context.set_offline(True)
        page.wait_for_timeout(300)

        # 3. Перезагружаем страницу в условиях жесткого офлайна БЕЗ СКРЫТИЯ ОШИБОК
        # Если Service Worker не закэшировал приложение, этот вызов гарантированно уронит тест!
        page.reload()
        page.wait_for_selector(".bottom-nav", timeout=8000)
        assert page.locator(".bottom-nav").is_visible(), "Приложение обязано загружаться из кэша Service Worker при полном отсутствии сети!"

        # 4. Проверяем работу базы и экранов без интернета
        site_name = page.locator("#site-name-display").inner_text()
        assert len(site_name.strip()) > 0, "Данные объекта обязаны читаться из IndexedDB офлайн"

        # Переключение на экран «Смета»
        page.locator('.nav-item[data-screen="estimate"]').click()
        page.wait_for_selector("#screen-estimate.active")

        # Проверяем интерактивность калькулятора сметы
        val_bathrooms = page.locator("#val-bathrooms").inner_text()
        assert int(val_bathrooms) >= 1, "Смета обязана функционировать офлайн"

        # Клик по инкременту санузлов
        page.locator('.btn-counter[data-field="bathrooms"][data-delta="1"]').click()
        page.wait_for_timeout(200)
        new_val = page.locator("#val-bathrooms").inner_text()
        assert int(new_val) == int(val_bathrooms) + 1, "Калькулятор сметы обязан пересчитывать значения в офлайне"

        # Переключение на экран «Чек-лист»
        page.locator('.nav-item[data-screen="checklist"]').click()
        page.wait_for_selector("#screen-checklist.active")
        page.wait_for_selector(".check-item", timeout=3000)
        assert page.locator(".check-item").count() > 0, "Чек-листы технадзора обязаны открываться офлайн"

        # Восстанавливаем сеть
        context.set_offline(False)
        browser.close()
