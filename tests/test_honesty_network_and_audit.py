"""
Автоматический тест честности сетевых и инженерных статусов (P0-5)
Проверяет:
1. Индикатор автономности в шапке (🟢 БАЗА ОФФЛАЙН).
2. Замену AI-washing на честное именование: "Инженерный экспресс-аудит (экспертные правила)".
3. Модальное окно аудита: отсутствие маркетологических формулировок, фиксация выводов в журнал.
4. Предупреждение о сетевой зависимости голосового ввода (Web Speech API) и альтернативу ручного ввода.
5. Разграничение онлайн и офлайн функций на экране Финансов (бейджи 🌐 Онлайн и 🟢 100% Офлайн).
6. Пояснение о сетевом характере цифровых расписок в модальном окне подтверждения.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8096
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


def test_offline_header_indicator(http_server):
    """1. Проверка наличия индикатора автономности в шапке приложения"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".top-header")

        status_text = page.locator(".brand-subtitle").inner_text()
        assert "БАЗА ОФФЛАЙН" in status_text, f"Ожидался статус 'БАЗА ОФФЛАЙН', получено: {status_text}"
        browser.close()


def test_engineering_audit_honesty(http_server):
    """2. Проверка инженерного аудита (отсутствие AI-washing, честные термины)"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # Кнопка аудита в шапке
        btn_audit = page.locator("#btn-ai-audit-top")
        assert btn_audit.is_visible(), "Кнопка аудита должна быть видна"
        title_attr = btn_audit.get_attribute("title")
        assert "Инженерный экспресс-аудит" in title_attr, f"Неверный title: {title_attr}"
        assert "ИИ" not in title_attr, f"Найдено некорректное упоминание ИИ: {title_attr}"

        # Открываем модальное окно
        btn_audit.click()
        page.wait_for_selector("#modal-ai-audit.open")

        modal_title = page.locator("#modal-ai-audit .modal-title span").inner_text()
        assert "Инженерный экспресс-аудит" in modal_title
        assert "ИИ" not in modal_title

        # Проверяем описание с инженерными нормами (DIN 1988, СП 30.13330)
        sheet_text = page.locator("#modal-ai-audit .modal-sheet").inner_text()
        assert "DIN 1988" in sheet_text or "СП 30.13330" in sheet_text or "100% автономно" in sheet_text

        # Сохранение выводов и проверка текста подтверждения
        btn_save = page.locator('#modal-ai-audit button[onclick*="saveAiAuditNotes"]')
        btn_save.click()

        page.wait_for_selector("#app-toast")
        toast = page.locator("#app-toast")
        toast_text = toast.inner_text()
        assert "инженерного аудита" in toast_text.lower()
        assert "ии" not in toast_text.lower().split()

        browser.close()


def test_voice_input_network_disclaimer(http_server):
    """3. Проверка предупреждения о необходимости сети для Web Speech API"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # Открываем голосовой ввод
        page.click("#btn-voice-input")
        page.wait_for_selector("#modal-voice.open")

        voice_modal = page.locator("#modal-voice")
        modal_content = voice_modal.inner_text().lower()

        # Должно быть предупреждение о сети и возможности ручного ввода в подвалах
        assert "сетевая зависимость" in modal_content or "интернет" in modal_content
        assert "ручную" in modal_content or "подвал" in modal_content

        # Проверяем наличие текстового поля ввода для ручного ввода
        manual_input = page.locator("#voice-recognized-input")
        assert manual_input.is_visible(), "Поле ручного ввода должно быть доступно"

        browser.close()


def test_finances_online_offline_badges(http_server):
    """4. Проверка бейджей 🌐 Онлайн и 🟢 100% Офлайн на экране Финансов"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # Переходим на вкладку Финансы
        page.click('.nav-item[data-screen="finances"]')
        page.wait_for_selector("#screen-finances.active")

        fin_text = page.locator("#screen-finances").inner_text()

        # Проверяем наличие бейджей
        assert "офлайн" in fin_text.lower(), "Должен присутствовать бейдж 'Локально (офлайн)' для бэкапа"
        assert "онлайн" in fin_text.lower(), "Должен присутствовать бейдж 'Онлайн' для внешних ссылок"

        browser.close()


def test_digital_receipt_network_notice(http_server):
    """5. Проверка пояснения о сетевом статусе в модальном окне цифровой расписки"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})

        # Открываем по прямой ссылке верификации расписки
        page.goto(f"{http_server}/index.html?verify_receipt=TEST-001&emp=Рустам&amount=700000&site=Tashkent%20City")
        page.wait_for_selector("#modal-verify-receipt.open")

        receipt_modal = page.locator("#modal-verify-receipt")
        receipt_text = receipt_modal.inner_text().lower()

        assert "сетевой статус" in receipt_text or "telegram" in receipt_text
        assert "интернет" in receipt_text or "офлайн" in receipt_text

        browser.close()
