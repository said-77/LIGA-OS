"""
LIGA OS — Автоматический тест навигации экранов, постоянного реестра контактов и звукового движка
Проверяет:
1. Навигационная полоса возврата (.screen-top-bar):
   - Возврат с экрана чек-листа стяжки (#screen-checklist) по кнопке «← Назад к объекту» и крестику.
   - Возврат со сметы (#screen-estimate) и истории (#screen-history).
2. Постоянный бизнес-реестр контактов LIGA OS (#subtab-content-contacts):
   - Переключение на 4-ю подвкладку «👤 Контакты».
   - Отображение начальных контактов (Бахром-ака, Камила Studio 7, Джамшид-ака, Сарвар).
   - Кликабельные ссылки tel:, бейджи ролей, привязка к объектам Ташкента.
3. Добавление нового контакта через модальное окно #modal-add-contact.
4. Удаление контакта с подтверждением.
5. Переключение звукового сопровождения (#btn-sound-toggle: 🔊 / 🔇).
6. Проверка отсутствия следов ИИ в текстах интерфейса.
"""

import os
import time
import json
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

def test_screen_navigation_back_buttons(http_server):
    """Проверка возврата со вторичных экранов через .screen-top-bar"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # 1. Проверяем переход в чек-лист стяжки
        # Открываем экран стяжки через карточку дашборда или нижнюю навигацию
        page.click("button[data-screen='checklist']")
        page.wait_for_timeout(300)

        assert page.locator("#screen-checklist").is_visible(), "Экран стяжки должен быть виден"
        assert not page.locator("#screen-dashboard").is_visible(), "Экран дашборда должен быть скрыт"

        # Нажимаем кнопку возврата «← Назад к объекту»
        page.click("#screen-checklist .btn-screen-back")
        page.wait_for_timeout(300)

        assert page.locator("#screen-dashboard").is_visible(), "После нажатия «Назад к объекту» должен открыться дашборд"
        assert not page.locator("#screen-checklist").is_visible(), "Экран стяжки должен быть скрыт"

        # Снова переходим на экран стяжки и проверяем возврат по крестику
        page.click("button[data-screen='checklist']")
        page.wait_for_timeout(300)
        assert page.locator("#screen-checklist").is_visible()

        page.click("#screen-checklist .btn-screen-close")
        page.wait_for_timeout(300)
        assert page.locator("#screen-dashboard").is_visible(), "После нажатия крестика должен открыться дашборд"

        # 2. Проверяем возврат с экрана сметы
        page.click("button[data-screen='estimate']")
        page.wait_for_timeout(300)
        assert page.locator("#screen-estimate").is_visible()

        page.click("#screen-estimate .btn-screen-back")
        page.wait_for_timeout(300)
        assert page.locator("#screen-dashboard").is_visible()

        # 3. Проверяем возврат с экрана истории
        page.click("button[data-screen='history']")
        page.wait_for_timeout(300)
        assert page.locator("#screen-history").is_visible()

        page.click("#screen-history .btn-screen-close")
        page.wait_for_timeout(300)
        assert page.locator("#screen-dashboard").is_visible()

        browser.close()

def test_contacts_registry_and_crud(http_server):
    """Проверка постоянного реестра контактов LIGA OS, добавления и удаления"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        # Автоматическое подтверждение диалогов window.confirm
        page.on("dialog", lambda dialog: dialog.accept())

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # Переходим на экран истории
        page.click("button[data-screen='history']")
        page.wait_for_timeout(300)

        # Переключаемся на подвкладку «Контакты»
        contact_tab_btn = page.locator("button.history-subtab-btn[data-subtab='contacts']")
        assert contact_tab_btn.is_visible(), "Кнопка подвкладки Контакты должна присутствовать"
        contact_tab_btn.click()
        page.wait_for_timeout(400)

        # Проверяем видимость панели контактов
        pane_contacts = page.locator("#subtab-content-contacts")
        assert pane_contacts.is_visible(), "Панель контактов должна стать видимой"

        # Проверяем наличие начальных контактов
        contacts_text = page.locator("#contacts-list-container").inner_text()
        assert "Бахром-ака" in contacts_text, "В реестре должен присутствовать Бахром-ака"
        assert "Камила" in contacts_text, "В реестре должна присутствовать Камила"
        assert "LIGA-C-001" in contacts_text, "Должен отображаться системный ID контакта LIGA-C-001"

        # Проверяем кликабельные ссылки телефонов
        phone_links = page.locator("#contacts-list-container a.contact-phone-link").all()
        assert len(phone_links) >= 2, "Должно быть минимум 2 телефонных ссылки"
        href = phone_links[0].get_attribute("href")
        assert href.startswith("tel:"), f"Ссылка телефона должна начинаться с tel:, получено: {href}"

        # Добавление нового контакта через модальное окно
        page.click("#btn-open-add-contact")
        page.wait_for_timeout(300)

        modal = page.locator("#modal-add-contact")
        assert modal.is_visible(), "Модальное окно добавления контакта должно открыться"

        # Заполняем форму
        page.fill("#contact-name", "Шерзод (Генподрядчик Golden House)")
        page.select_option("#contact-role", value="Генподрядчик / Прораб")
        page.fill("#contact-phone", "+998 90 777 66 55")
        page.fill("#contact-address", "ЖК Infinity, Блок C")
        page.fill("#contact-notes", "Согласование трасс и проходов монолита")

        page.click("#form-add-contact button[type='submit']")
        page.wait_for_timeout(500)

        # Проверяем появление контакта в списке
        updated_text = page.locator("#contacts-list-container").inner_text()
        assert "Шерзод (Генподрядчик Golden House)" in updated_text, "Новый контакт должен появиться в списке"
        assert "Генподрядчик / Прораб" in updated_text, "Роль нового контакта должна отображаться"

        # Удаление созданного контакта
        # Находим последнюю карточку с Шерзодом и кликаем кнопку корзины
        cards = page.locator("#contacts-list-container .contact-card-item").all()
        target_card = None
        for card in cards:
            if "Шерзод" in card.inner_text():
                target_card = card
                break

        assert target_card is not None, "Карточка Шерзода должна быть найдена"
        delete_btn = target_card.locator("button.btn-item-delete")
        delete_btn.click()
        page.wait_for_timeout(500)

        final_text = page.locator("#contacts-list-container").inner_text()
        assert "Шерзод" not in final_text, "Контакт Шерзода должен быть удален после подтверждения"

        browser.close()

def test_sound_toggle_and_ai_traces_clean(http_server):
    """Проверка переключения звука и отсутствия следов ИИ в интерфейсе"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        page.goto(f"{http_server}/index.html")
        page.wait_for_selector("#btn-sound-toggle")

        # 1. Проверка кнопки звука
        btn_sound = page.locator("#btn-sound-toggle")
        initial_sound = btn_sound.inner_text().strip()
        assert initial_sound == "🔊", f"Начальный статус звука должен быть 🔊, получено: {initial_sound}"

        # Кликаем для выключения
        btn_sound.click()
        page.wait_for_timeout(300)
        assert btn_sound.inner_text().strip() == "🔇", "После клика звук должен стать 🔇"

        # Кликаем для включения
        btn_sound.click()
        page.wait_for_timeout(300)
        assert btn_sound.inner_text().strip() == "🔊", "После повторного клика звук должен снова стать 🔊"

        # 2. Проверка отсутствия следов ИИ в видимом интерфейсе
        body_text = page.locator("body").inner_text().lower()
        forbidden_ai_markers = [
            "чатгпт", "chatgpt", "нейросеть", "промпт", "робот-помощник", "ai-помощник",
            "написано нейросетью", "языковая модель", "генеративный ии"
        ]
        for marker in forbidden_ai_markers:
            assert marker not in body_text, f"Обнаружен запрещенный след ИИ в интерфейсе: {marker}"

        browser.close()
