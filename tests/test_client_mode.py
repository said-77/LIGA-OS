"""
Автоматический сквозной тест изолированного клиентского режима (Client View) LIGA OS (P0-3)
Проверяет:
1. Наличие и работу переключателя клиентского режима в шапке.
2. Гарантированное скрытие внутренних долгов бригаде и бонусов дизайнерам на дашборде.
3. Отображение представительского блока доверия для заказчика.
4. Скрытие сводного радара портфеля и выплат бригаде на экране «Финансы».
5. Скрытие оптовых цен закупки и товарных чеков на экране «Материалы» с заменой на бейджи спецификации.
6. Скрытие кнопки настройки тарифов мастера на экране «Смета».
7. Защиту служебных модалок мастера от несанкционированного открытия.
8. Персистентность клиентского режима после reload страницы.
9. Безупречное восстановление полного режима мастера при выходе.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8094
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

def test_client_view_mode_full_isolation(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        # 1. Открытие приложения в обычном режиме мастера
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # Проверяем, что в режиме мастера видны служебные кнопки и внутренние финансы
        btn_client_toggle = page.locator("#btn-client-mode-toggle")
        assert btn_client_toggle.is_visible(), "Кнопка клиентского режима не найдена в шапке"
        assert "👁️" in btn_client_toggle.inner_text()

        assert page.locator("#btn-voice-input").is_visible(), "Кнопка голоса должна быть видна мастеру"
        assert page.locator("#btn-guide-top").is_visible(), "Кнопка шпаргалки должна быть видна мастеру"
        assert page.locator("#btn-backup-top").is_visible(), "Кнопка бэкапа должна быть видна мастеру"
        assert page.locator("#btn-open-payment").is_visible(), "Кнопка платежа должна быть видна мастеру"
        assert page.locator("#tile-quick-receipt").is_visible(), "Плитка чека должна быть видна мастеру"

        # Внутренние строки долгов бригаде и бонусов дизайнерам видны и содержат суммы
        sub_finances = page.locator(".sub-finances-row")
        assert sub_finances.is_visible(), "Строка долгов бригаде/дизайнеру должна быть видна мастеру"
        brigade_val = page.locator("#fin-brigade-val").inner_text().strip()
        assert "сум" in brigade_val, f"Ожидалась сумма бригаде, получено: {brigade_val}"

        # Баннер клиентского режима скрыт
        client_banner = page.locator("#client-mode-banner")
        assert not client_banner.is_visible(), "Баннер клиентского режима не должен отображаться у мастера"

        # 2. Активация клиентского режима демонстрации заказчику
        btn_client_toggle.click()
        page.wait_for_timeout(300)

        # Проверяем атрибут и плашку
        assert page.locator("html").get_attribute("data-client-mode") == "true"
        assert client_banner.is_visible(), "Плашка клиентского режима обязана стать видимой"
        assert "🔒" in btn_client_toggle.inner_text()

        # 3. Проверка дашборда в клиентском режиме
        assert not page.locator("#btn-voice-input").is_visible(), "Голосовой ввод обязан быть скрыт от заказчика"
        assert not page.locator("#btn-guide-top").is_visible(), "Скрипты диалогов обязаны быть скрыты от заказчика"
        assert not page.locator("#btn-backup-top").is_visible(), "Бэкап базы обязан быть скрыт от заказчика"
        assert not page.locator("#btn-open-payment").is_visible(), "Кнопка платежа обязана быть скрыта от заказчика"
        assert not page.locator("#tile-quick-receipt").is_visible(), "Чек с базара обязан быть скрыт от заказчика"

        # Внутренние долги бригаде и дизайнеру гарантированно скрыты
        assert not sub_finances.is_visible(), "Долги бригаде и бонусы дизайнерам обязаны быть скрыты!"
        assert page.locator("#fin-brigade-val").inner_text().strip() == "—", "В DOM не должно быть цифр выплат бригаде!"
        assert page.locator("#fin-designer-val").inner_text().strip() == "—", "В DOM не должно быть цифр бонусов дизайнерам!"

        # Отображается представительский блок доверия для заказчика
        trust_badge = page.locator(".client-view-trust-badge")
        assert trust_badge.is_visible(), "Блок доверия заказчику не отображается"
        assert "Премиальный инженерный монтаж" in trust_badge.inner_text()

        # 4. Проверка экрана «Финансы»
        page.locator('.nav-item[data-screen="finances"]').click()
        page.wait_for_selector("#screen-finances.active")

        # Взаиморасчеты с заказчиком видны
        assert page.locator("#page-fin-contract").is_visible()
        assert page.locator("#page-fin-advance").is_visible()
        assert page.locator("#page-fin-debt").is_visible()

        # Конфиденциальные данные скрыты
        assert not page.locator("#page-fin-brigade").is_visible(), "Начисления бригаде обязаны быть скрыты!"
        assert not page.locator("#portfolio-radar-card").is_visible(), "Сводный радар портфеля обязан быть скрыт!"
        assert not page.locator("#btn-backup-finances").is_visible(), "Кнопка бэкапа обязана быть скрыта!"

        # 5. Проверка экрана «Материалы»
        page.locator('.nav-item[data-screen="materials"]').click()
        page.wait_for_selector("#screen-materials.active")

        assert not page.locator("#mat-finance-summary").is_visible(), "Сводка затрат на закупку обязана быть скрыта!"
        assert not page.locator("#btn-open-receipt-modal").is_visible(), "Кнопка сфоткать чек обязана быть скрыта!"
        assert not page.locator("#btn-export-bazaar").is_visible(), "Кнопка базара обязана быть скрыта!"

        # Проверяем, что в списке отображается бейдж спецификации, а не оптовые цены
        spec_badges = page.locator(".mat-badge-spec")
        assert spec_badges.count() > 0, "В клиентском режиме должны отображаться бейджи спецификации"
        assert "спецификаци" in spec_badges.first.inner_text().lower()
        assert not page.locator(".mat-price").is_visible(), "Закупочные цены обязаны отсутствовать!"
        assert not page.locator(".btn-receipt-view").is_visible(), "Кнопки чеков обязаны отсутствовать!"

        # 6. Проверка экрана «Смета»
        page.locator('.nav-item[data-screen="estimate"]').click()
        page.wait_for_selector("#screen-estimate.active")

        assert not page.locator("#btn-open-tariffs").is_visible(), "Кнопка калибровки тарифов обязана быть скрыта!"

        # 7. Проверка защиты модальных окон
        page.evaluate("window.app.openModal('modal-master-guide')")
        page.wait_for_timeout(200)
        assert not page.locator("#modal-master-guide.open").is_visible(), "Служебное окно не должно открываться в клиентском режиме!"

        # 8. Проверка персистентности после перезагрузки страницы
        page.reload()
        page.wait_for_selector(".bottom-nav")
        assert page.locator("html").get_attribute("data-client-mode") == "true", "Клиентский режим должен сохраняться после reload"
        assert client_banner.is_visible()
        assert not page.locator(".sub-finances-row").is_visible()

        # 9. Выход из клиентского режима
        btn_exit = page.locator("#btn-exit-client-mode")
        btn_exit.click()
        page.wait_for_timeout(300)

        # Полное восстановление режима мастера
        assert page.locator("html").get_attribute("data-client-mode") is None
        assert not client_banner.is_visible()
        assert "👁️" in btn_client_toggle.inner_text()
        assert sub_finances.is_visible(), "Долги бригаде должны снова стать видимыми мастеру"
        assert "сум" in page.locator("#fin-brigade-val").inner_text().strip(), "Реальные суммы должны восстановиться!"
        assert page.locator("#btn-voice-input").is_visible()
        assert page.locator("#btn-guide-top").is_visible()

        browser.close()
