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

def test_hands_free_voice_and_telegram_flow(local_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{local_server}/index.html")
        page.wait_for_timeout(800)

        # 1. Проверяем наличие плавающего микрофона (#btn-floating-voice)
        btn_floating = page.locator("#btn-floating-voice")
        assert btn_floating.is_visible(), "Плавающий микрофон «Свободные руки» должен быть виден"

        # Проверяем видимость микрофона при навигации по экранам
        screens = ['finances', 'materials', 'checklist', 'estimate', 'history', 'dashboard']
        for s in screens:
            page.click(f'.bottom-nav button[data-screen="{s}"]')
            page.wait_for_timeout(200)
            assert btn_floating.is_visible(), f"Плавающий микрофон должен сопровождать мастера на экране {s}"

        # 2. Клик по плавающему микрофону открывает модалку голоса
        btn_floating.click()
        page.wait_for_timeout(300)
        modal_voice = page.locator("#modal-voice")
        assert modal_voice.evaluate("el => el.classList.contains('open')"), "Клик по плавающему микрофону должен открывать модалку голоса"

        # Закрываем модалку голоса
        page.evaluate("window.app.closeModal('modal-voice')")
        page.wait_for_timeout(300)

        # 3. Проверка режима клиента: плавающий микрофон должен скрываться
        page.click("#btn-client-mode-toggle")
        page.wait_for_timeout(300)
        is_floating_hidden = page.evaluate("""() => {
            const el = document.getElementById('btn-floating-voice');
            return !el || window.getComputedStyle(el).display === 'none';
        }""")
        assert is_floating_hidden, "Плавающий микрофон должен быть скрыт в Режиме показа клиенту"

        # Выходим из режима клиента
        page.click("#btn-client-mode-toggle")
        page.wait_for_timeout(300)

        # 4. Проверка кнопки голосового создания объекта в modal-add-site
        page.evaluate("window.app.openModal('modal-add-site')")
        page.wait_for_timeout(300)

        btn_voice_site = page.locator("#btn-voice-fill-site")
        assert btn_voice_site.is_visible(), "Кнопка голосового заполнения объекта должна быть видна в modal-add-site"

        # 5. Тестируем разбор естественной речи мастера:
        # «Заказчик Самир Чиланзар 3-комнатная квартира договор 25 млн аванс 10 млн срок 20 дней»
        page.evaluate("""() => {
            window.app.applyVoiceToSiteForm("Заказчик Самир, Чиланзар 3-комнатная, договор 25 млн, аванс 10 млн, срок 20 дней");
        }""")
        page.wait_for_timeout(300)

        val_name = page.input_value("#new-site-name")
        val_client = page.input_value("#new-site-client")
        val_contract = page.input_value("#new-site-contract")
        val_advance = page.input_value("#new-site-advance")
        val_duration = page.input_value("#new-site-duration")

        assert "Чиланзар" in val_name, f"В названии объекта должен быть район/ЖК Чиланзар, получено: {val_name}"
        assert "Самир" in val_client, f"Имя клиента должно быть Самир, получено: {val_client}"
        assert val_contract == "25000000", f"Сумма договора должна быть 25 000 000, получено: {val_contract}"
        assert val_advance == "10000000", f"Аванс должен быть 10 000 000, получено: {val_advance}"
        assert val_duration == "20", f"Срок монтажа должен быть 20 дней, получено: {val_duration}"

        page.evaluate("window.app.closeModal('modal-add-site')")
        page.wait_for_timeout(200)

        # 6. Проверка инженерного калькулятора в parseVoiceCommand:
        # а) Теплый пол
        floor_calc = page.evaluate("""() => {
            return window.app.parseVoiceCommand("посчитай теплый пол 60 квадратов");
        }""")
        assert floor_calc["type"] == "calc_floor", "Тип команды должен быть calc_floor"
        assert floor_calc["area"] == 60, "Площадь должна быть 60 кв.м"
        assert floor_calc["meters"] == 390, "60 кв.м * 6.5 = 390 метров трубы"
        assert floor_calc["coils"] == 2, "390 м / 200 м = 2 бухты"
        assert floor_calc["loops"] == 6, "Контуров должно быть 6 (коллектор на 6 выходов)"

        # б) Конвертер валют
        currency_calc = page.evaluate("""() => {
            return window.app.parseVoiceCommand("сколько будет 500 долларов");
        }""")
        assert currency_calc["type"] == "currency_conv", "Тип команды должен быть currency_conv"
        assert currency_calc["usd"] == 500, "Сумма USD должна быть 500"
        assert currency_calc["som"] > 5000000, "Сумма в сумах должна быть рассчитана по курсу мастера"

        # 7. Проверка кнопки быстрой отправки отчета в Telegram (#btn-share-telegram)
        btn_tg = page.locator("#btn-share-telegram")
        assert btn_tg.is_visible(), "Кнопка «Отправить отчет заказчику в Telegram» должна быть на дашборде"

        browser.close()
