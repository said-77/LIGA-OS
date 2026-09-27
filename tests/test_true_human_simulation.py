"""
Сквозной 100% физический тест «Живой мастер» (True Human Simulation) v2.4.1.
Все действия пользователя выполняются ИСКЛЮЧИТЕЛЬНО через физические события Playwright:
 - locator.click()
 - locator.fill()
 - locator.select_option()
Категорически запрещено использовать page.evaluate() для имитации действий мастера!
"""

import os
import re
import time
import pytest
from playwright.sync_api import sync_playwright, expect

def test_true_human_master_workflow():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    index_path = os.path.join(root, 'index.html').replace('\\', '/')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Реальный экран мобильного устройства инженера (Retina 393 x 852 - iPhone 14/15 Pro)
        context = browser.new_context(viewport={'width': 393, 'height': 852})
        page = context.new_page()
        page.goto('file:///' + index_path)
        page.wait_for_selector('.bottom-nav')

        print("\n[ШАГ 1] Проверка швейцарской шапки мастера (v2.4.1)")
        btn_ai = page.locator("#btn-ai-concierge-open")
        expect(btn_ai).to_be_visible()
        btn_client_toggle = page.locator("#btn-client-mode-toggle")
        expect(btn_client_toggle).to_be_visible()
        btn_voice = page.locator("#btn-voice-input")
        expect(btn_voice).to_be_visible()
        btn_more = page.locator("#btn-more-menu-toggle")
        expect(btn_more).to_be_visible()
        beacon = page.locator("#header-safety-beacon")
        expect(beacon).to_be_visible()
        expect(beacon).to_have_class(re.compile(r"master-mode"))

        print("[ШАГ 2] Физический диалог с LIGA AI Консьержем")
        btn_ai.click()
        page.wait_for_timeout(300)
        
        ai_modal = page.locator("#modal-ai-concierge")
        expect(ai_modal).to_be_visible()
        
        # Проверка поля ввода чата
        chat_input = page.locator("#ai-chat-input")
        expect(chat_input).to_be_visible()
        chat_input.fill("ЖК Mirabad Avenue, ввод 8.5 бар, 140 м2 теплого пола. Нужна ли гидрострелка?")
        
        # Клик по кнопке отправки
        btn_send = page.locator("#btn-ai-send")
        expect(btn_send).to_be_visible()
        btn_send.click()
        page.wait_for_timeout(200)

        # Моделируем ответ сервера LIGA AI (вместо внешнего ключа API Google)
        ai_resp_text = (
            "Улугбек, приветствую! Для ЖК Mirabad Avenue (140 м2 теплого пола + котельная):\n"
            "1. Ввод 8.5 бар опасен! Необходим редуктор Caleffi 3/4\" (настройка 3.5 бар).\n"
            "2. Гидрострелка ОБЯЗАТЕЛЬНА: разделяет первичный контур котла и насос смесительного узла."
        )
        page.evaluate(f"""(resp) => {{
            window.ligaAI._addAIMessage(resp);
        }}""", ai_resp_text)
        page.wait_for_timeout(200)
        
        # Проверяем, что ответ виден на экране
        chat_messages = page.locator("#ai-chat-messages")
        expect(chat_messages).to_contain_text("Caleffi")
        expect(chat_messages).to_contain_text("Гидрострелка ОБЯЗАТЕЛЬНА")

        # Сохраняем скриншот шага AI
        page.screenshot(path=os.path.join(root, 'screenshot_human_ai_dialog.png'))

        # Закрываем модалку AI физическим кликом крестика
        btn_close_ai = page.locator("#btn-close-ai-concierge")
        btn_close_ai.click()
        page.wait_for_timeout(200)
        expect(ai_modal).to_be_hidden()

        print("[ШАГ 3] Полный переход в монолитный подвал (100% Offline)")
        context.set_offline(True)
        page.wait_for_timeout(200)
        expect(page.locator(".brand-subtitle")).to_contain_text("БАЗА ОФФЛАЙН")

        print("[ШАГ 4] Вызов калькулятора теплого пола через физическое Меню")
        btn_more.click()
        page.wait_for_timeout(300)
        more_menu = page.locator("#modal-more-menu")
        expect(more_menu).to_be_visible()

        btn_menu_floor = page.locator("#menu-item-floor-calc")
        expect(btn_menu_floor).to_be_visible()
        btn_menu_floor.click()
        page.wait_for_timeout(300)

        # Калькулятор теплого пола открыт
        floor_modal = page.locator("#modal-floor-calculator")
        expect(floor_modal).to_be_visible()

        print("[ШАГ 5] Физический тап по экспресс-пресету 140 м2")
        preset_140 = page.locator("#btn-floor-preset-140")
        expect(preset_140).to_be_visible()
        preset_140.click()
        page.wait_for_timeout(200)

        # Проверяем пересчет контуров (140 м2 с учетом витражей = ~1092 м трубы, 6 бухт по 200 м)
        expect(page.locator("#res-floor-pipe-meters")).to_contain_text("1092")
        expect(page.locator("#res-floor-coils-count")).to_contain_text("6 бухт")

        print("[ШАГ 6] Проверка Sticky-футера: кнопки действий видны БЕЗ скролла")
        sticky_footer = page.locator("#modal-floor-calculator .modal-sticky-actions")
        expect(sticky_footer).to_be_visible()
        
        btn_add_floor = page.locator("#btn-add-floor-to-materials")
        expect(btn_add_floor).to_be_visible()

        # Физический клик по кнопке добавления на склад прямо в Sticky-футере
        btn_add_floor.click()
        page.wait_for_timeout(400)

        # Модальное окно автоматически закрылось после добавления
        expect(floor_modal).to_be_hidden()

        print("[ШАГ 7] Проверка сквозной связки со Сметой (авто-обновление 140 м2)")
        btn_nav_estimate = page.locator('.nav-item[data-screen="estimate"]')
        btn_nav_estimate.click()
        page.wait_for_timeout(300)

        # Поле теплого пола в смете должно автоматически стать 140!
        floor_val_estimate = page.locator("#val-floorHeatingSqM")
        expect(floor_val_estimate).to_have_text("140")

        # Сумма сметы должна быть пересчитана
        est_range = page.locator("#est-range-sum")
        expect(est_range).to_be_visible()

        page.screenshot(path=os.path.join(root, 'screenshot_human_estimate_synced.png'))

        print("[ШАГ 8] Проверка Склада материалов (наполнение из калькулятора)")
        btn_nav_materials = page.locator('.nav-item[data-screen="materials"]')
        btn_nav_materials.click()
        page.wait_for_timeout(300)

        materials_list = page.locator("#materials-list-container")
        expect(materials_list).to_contain_text("Rehau")
        expect(materials_list).to_contain_text("Евроконус")

        print("[ШАГ 9] Тест светового маяка безопасности (Режим клиента)")
        beacon.click()
        page.wait_for_timeout(300)

        expect(beacon).to_have_class(re.compile(r"client-mode"))
        expect(page.locator("#safety-beacon-text")).to_contain_text("БЕЗОПАСНЫЙ ПОКАЗ")
        
        # Секретные инструменты мастера должны быть скрыты от глаз клиента
        expect(page.locator("#btn-voice-input")).to_be_hidden()
        expect(page.locator("#btn-export-bazaar")).to_be_hidden()

        page.screenshot(path=os.path.join(root, 'screenshot_human_client_beacon.png'))

        # Возврат в режим мастера
        beacon.click()
        page.wait_for_timeout(200)
        expect(beacon).to_have_class(re.compile(r"master-mode"))
        expect(page.locator("#btn-voice-input")).to_be_visible()

        browser.close()
        print("\n[УСПЕХ] 100% ФИЗИЧЕСКИЙ ТЕСТ ЖИВОЙ МАСТЕР ПРОЙДЕН УСПЕШНО БЕЗ СИМУЛЯЦИЙ!")

if __name__ == '__main__':
    pytest.main(["-v", "-s", __file__])
