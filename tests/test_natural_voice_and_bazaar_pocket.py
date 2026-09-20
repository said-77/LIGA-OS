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

def test_onboarding_hint_and_bazaar_pocket_flow(local_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{local_server}/index.html")
        page.wait_for_timeout(800)

        # 1. Проверка подсказки онбординга новичка
        hint_locator = page.locator("#quick-onboarding-hint")
        assert hint_locator.is_visible(), "Подсказка для новичка (#quick-onboarding-hint) должна быть видна при первом входе"
        hint_text = hint_locator.inner_text()
        assert "LIGA OS" in hint_text
        assert "3" in hint_text
        assert "Голос" in hint_text or "ГОЛОС" in hint_text.upper()
        assert "Зафиксировать факт" in hint_text
        assert "Печать / Экспорт в PDF" in hint_text

        # Закрытие подсказки по кнопке ✕
        page.click("#btn-dismiss-onboarding")
        page.wait_for_timeout(300)
        assert not hint_locator.is_visible(), "Подсказка должна скрыться после клика на кнопку закрытия"
        is_dismissed = page.evaluate("localStorage.getItem('liga_onboarding_dismissed')")
        assert is_dismissed == 'true', "Флаг liga_onboarding_dismissed должен сохраниться в localStorage"

        # 2. Проверка расчета и отображения Базарного кармана (Деньги на закупку на руках)
        bazaar_banner = page.locator("#fin-bazaar-pocket-banner")
        assert bazaar_banner.is_visible(), "Баннер базарного кармана должен быть виден мастеру"

        bazaar_val = page.locator("#fin-bazaar-pocket-val").inner_text()
        assert "сум" in bazaar_val, "Значение базарного кармана должно содержать сумму в сумах"

        # Переходим в Финансы и проверяем отображение там
        page.click('.bottom-nav button[data-screen="finances"]')
        page.wait_for_timeout(300)
        page_bazaar_val = page.locator("#page-fin-bazaar-pocket").inner_text()
        assert "сум" in page_bazaar_val, "На странице финансов должен отображаться свободный остаток на закупку"

        # 3. Проверка режима показа клиенту: базарный карман изолирован от глаз заказчика
        page.click("#btn-client-mode-toggle")
        page.wait_for_timeout(300)

        is_pocket_safe = page.evaluate("""() => {
            const banner = document.getElementById('fin-bazaar-pocket-banner');
            const pageEl = document.getElementById('page-fin-bazaar-pocket');
            const bannerHidden = !banner || window.getComputedStyle(banner).display === 'none';
            const pageSafe = !pageEl || pageEl.innerText.trim() === '—';
            return bannerHidden || pageSafe;
        }""")
        assert is_pocket_safe, "В режиме показа клиенту базарный карман мастера должен быть строго скрыт или обезличен"

        # Выходим из режима клиента
        page.click("#btn-client-mode-toggle")
        page.wait_for_timeout(300)

        # 4. Проверка офлайн-шаблонов в модальном окне голоса
        page.evaluate("window.app.openModal('modal-voice')")
        page.wait_for_timeout(300)

        tmpl_far = page.locator("#btn-tmpl-far")
        tmpl_payout = page.locator("#btn-tmpl-payout")
        tmpl_press = page.locator("#btn-tmpl-press")
        tmpl_advance = page.locator("#btn-tmpl-advance")

        assert tmpl_far.is_visible(), "Кнопка офлайн-шаблона Коллектор FAR должна быть видна"
        assert tmpl_payout.is_visible(), "Кнопка офлайн-шаблона Аванс помощнику должна быть видна"
        assert tmpl_press.is_visible(), "Кнопка офлайн-шаблона Опрессовка 16 бар должна быть видна"
        assert tmpl_advance.is_visible(), "Кнопка офлайн-шаблона Аванс клиента должна быть видна"

        # Нажимаем шаблон Коллектор FAR в 1 тап
        tmpl_far.click()
        page.wait_for_timeout(300)

        recognized_val = page.locator("#voice-recognized-input").input_value()
        assert "Коллектор FAR" in recognized_val or "FAR" in recognized_val

        preview_type = page.locator("#voice-parse-type").inner_text()
        assert "Снабжение" in preview_type or "Коллекторы" in preview_type

        # Закрываем модалку голоса
        page.evaluate("window.app.closeModal('modal-voice')")
        page.wait_for_timeout(300)

        # 5. Проверка голосовой навигации естественным языком («Своими словами»)
        # 5.1. «Покажи деньги» -> навигация в экран финансов
        page.evaluate("window.app.switchScreen('dashboard')")
        page.wait_for_timeout(200)
        nav_res1 = page.evaluate("""() => {
            const cmd = window.app.parseVoiceCommand('Покажи деньги');
            window.app.handleVoiceInputText('Покажи деньги');
            window.app.confirmVoiceAction();
            return { type: cmd.type, target: cmd.target, screen: window.app.currentScreen };
        }""")
        assert nav_res1['type'] == 'nav_action'
        assert nav_res1['target'] == 'finances'
        assert nav_res1['screen'] == 'finances', "Команда «Покажи деньги» должна переключать экран на finances"

        # 5.2. «Где базар» -> навигация в экран материалов
        nav_res2 = page.evaluate("""() => {
            const cmd = window.app.parseVoiceCommand('Где базар');
            window.app.handleVoiceInputText('Где базар');
            window.app.confirmVoiceAction();
            return { type: cmd.type, target: cmd.target, screen: window.app.currentScreen };
        }""")
        assert nav_res2['type'] == 'nav_action'
        assert nav_res2['target'] == 'materials'
        assert nav_res2['screen'] == 'materials', "Команда «Где базар» должна переключать экран на materials"

        # 5.3. «Перед стяжкой» -> навигация в чек-лист контроля
        nav_res3 = page.evaluate("""() => {
            const cmd = window.app.parseVoiceCommand('Перед стяжкой');
            window.app.handleVoiceInputText('Перед стяжкой');
            window.app.confirmVoiceAction();
            return { type: cmd.type, target: cmd.target, screen: window.app.currentScreen };
        }""")
        assert nav_res3['type'] == 'nav_action'
        assert nav_res3['target'] == 'checklist'
        assert nav_res3['screen'] == 'checklist', "Команда «Перед стяжкой» должна переключать экран на checklist"

        # 5.4. «Что сказать дизайнеру» -> открытие шпаргалки диалогов
        nav_res4 = page.evaluate("""() => {
            const cmd = window.app.parseVoiceCommand('Что сказать дизайнеру');
            window.app.handleVoiceInputText('Что сказать дизайнеру');
            window.app.confirmVoiceAction();
            const modalOpen = document.getElementById('modal-master-guide').classList.contains('open');
            window.app.closeModal('modal-master-guide');
            return { type: cmd.type, target: cmd.target, modalOpen: modalOpen };
        }""")
        assert nav_res4['type'] == 'modal_action'
        assert nav_res4['target'] == 'modal-master-guide'
        assert nav_res4['modalOpen'] is True, "Команда «Что сказать дизайнеру» должна открывать modal-master-guide"

        # 5.5. «Покажи фотки» -> открытие фотофиксации узлов
        nav_res5 = page.evaluate("""() => {
            const cmd = window.app.parseVoiceCommand('Покажи фотки');
            window.app.handleVoiceInputText('Покажи фотки');
            window.app.confirmVoiceAction();
            const modalOpen = document.getElementById('modal-passport-photos').classList.contains('open');
            window.app.closeModal('modal-passport-photos');
            return { type: cmd.type, target: cmd.target, modalOpen: modalOpen };
        }""")
        assert nav_res5['type'] == 'modal_action'
        assert nav_res5['target'] == 'modal-passport-photos'
        assert nav_res5['modalOpen'] is True, "Команда «Покажи фотки» должна открывать modal-passport-photos"

        browser.close()
