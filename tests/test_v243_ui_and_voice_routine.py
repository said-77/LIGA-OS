# -*- coding: utf-8 -*-
"""
Тест LIGA OS v2.4.3: Премиальные переключатели (Toggle Switch),
Живые кнопки действий (Affordance), Шелковистый скролл и Карточка экспресс-подтверждения.
"""
import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8113
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


def test_v243_settings_toggles(http_server):
    """Проверка рендеринга и тактильного переключения Toggle Switch в Настройках."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector("#site-name-display")

        # Открываем модальное окно настроек
        page.evaluate("window.app.openModal('modal-settings')")
        page.wait_for_selector("#modal-settings.open")

        # Находим переключатели
        toggles = page.locator(".toggle-switch")
        assert toggles.count() >= 3, "В настройках должно быть не менее 3 переключателей"

        first_toggle = toggles.first
        input_elem = first_toggle.locator("input[type='checkbox']")
        track_elem = first_toggle.locator(".toggle-track")

        # Проверяем, что псевдоэлемент бегунка ::before валидно вычисляется браузером (content не равен none)
        before_content = page.evaluate("""() => {
            const track = document.querySelector('.toggle-track');
            if (!track) return null;
            return window.getComputedStyle(track, '::before').content;
        }""")
        assert before_content and before_content != 'none', f"Псевдоэлемент ::before должен рендериться! Получено: {before_content}"

        # Проверяем переключение кликом
        initial_checked = input_elem.is_checked()
        track_elem.click()
        page.wait_for_timeout(150)
        assert input_elem.is_checked() != initial_checked, "Клик по треку должен менять состояние чекбокса"

        # Закрываем настройки
        page.evaluate("window.app.closeModal('modal-settings')")
        page.wait_for_timeout(100)
        browser.close()


def test_v243_live_payment_button(http_server):
    """Проверка живой кнопки + Платеж (affordance, объем и изумрудный неон)."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector("#btn-open-payment")

        btn_payment = page.locator("#btn-open-payment")
        assert btn_payment.is_visible(), "Кнопка платежа должна быть видна мастеру на дашборде"

        # Проверяем новые классы объема и доступности
        btn_class = btn_payment.get_attribute("class") or ""
        assert "btn-luxury-payment-pulse" in btn_class, "Кнопка должна использовать актуальное оформление платежа"

        # Кликаем по кнопке — должно открыться окно платежа
        btn_payment.click()
        page.wait_for_selector("#modal-payment.open")

        # Закрываем модал
        page.evaluate("window.app.closeModal('modal-payment')")
        browser.close()


def test_v243_history_screen_scroll(http_server):
    """Проверка плавного скролла экрана истории объекта и ленты вех."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector("#site-name-display")

        # Переходим на экран истории
        page.evaluate("window.app.switchScreen('history')")
        page.wait_for_selector("#screen-history.active")

        # Добавляем тестовые события, чтобы лента гарантированно превышала высоту экрана
        page.evaluate("""async () => {
            for (let i = 1; i <= 8; i++) {
                await window.ligaDB.add('site_timeline_events', {
                    siteId: window.app.currentSiteId,
                    eventType: 'rough',
                    title: 'Тестовый узел монтажа ' + i,
                    description: 'Описание скрытых работ для проверки прокрутки ' + i,
                    date: '2026-09-' + (10 + i)
                });
            }
            await window.app.renderTimeline();
        }""")
        page.wait_for_timeout(300)

        # Проверяем, что элементы отрендерились
        events = page.locator(".timeline-item")
        assert events.count() >= 5, "В ленте должно быть не менее 5 событий"

        # Выполняем вертикальную прокрутку страницы
        scroll_pos_before = page.evaluate("() => window.scrollY")
        page.evaluate("() => window.scrollBy(0, 300)")
        page.wait_for_timeout(200)
        scroll_pos_after = page.evaluate("() => window.scrollY")

        assert scroll_pos_after > scroll_pos_before, f"Скролл должен свободно перемещаться! До: {scroll_pos_before}, После: {scroll_pos_after}"
        browser.close()


def test_v243_voice_fast_confirmation_bazaar(http_server):
    """Проверка модальной карточки экспресс-подтверждения для базара Джами."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html?profile=demo")
        page.wait_for_selector("#site-name-display")

        # Имитируем диктовку покупки на базаре Джами
        page.evaluate("""() => {
            window.app.showVoiceFastConfirmation({
                type: 'material',
                title: 'Коллектор FAR 1 дюйм на 6 выходов',
                amount: 1800000,
                category: 'Коллекторы'
            });
        }""")
        page.wait_for_timeout(200)

        overlay = page.locator("#voice-confirmation-overlay")
        assert overlay.is_visible(), "Оверлей экспресс-подтверждения должен быть видим"

        # Проверяем сумму и объект
        amount_text = page.locator("#voice-conf-amount").inner_text().replace('\xa0', ' ')
        assert "1 800 000" in amount_text, f"Сумма должна быть отформатирована, получено: {amount_text}"

        # Нажимаем крупную кнопку подтверждения пальцем
        page.locator("#btn-voice-conf-confirm").click()
        page.wait_for_timeout(300)

        assert not overlay.is_visible(), "После подтверждения оверлей должен скрыться"

        # Проверяем, что в базе материалов появилась запись
        materials_count = page.evaluate("""async () => {
            const items = await window.ligaDB.getBySiteId('materials', window.app.currentSiteId);
            return items.filter(m => m.name && m.name.includes('Коллектор FAR')).length;
        }""")
        assert materials_count >= 1, "Материал должен быть успешно записан в базу снабжения!"
        browser.close()
