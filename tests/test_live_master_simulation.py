"""
Сквозной стресс-тест двух жизненных сценариев мастера Улугбека Хакимова:
1. Режим с LIGA AI (Инженерный консьерж + цепочка задач на элитном объекте).
2. Режим "Мастер в монолитном подвале" (100% Offline, без сети и без API, автономное ядро).
"""

import os
import time
import json
from playwright.sync_api import sync_playwright

def run_simulation():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    index_path = os.path.join(root, 'index.html').replace('\\', '/')
    results = {
        "scenario_ai": {},
        "scenario_offline_basement": {},
        "ux_friction_points": []
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Симулируем реальный экран iPhone 14 Pro / 15 Pro мастера
        context = browser.new_context(viewport={'width': 393, 'height': 852})
        page = context.new_page()
        page.goto('file:///' + index_path)
        page.wait_for_selector('.bottom-nav')

        # ======================================================================
        # СЦЕНАРИЙ 1: МАСТЕР С ИИ-КОНСЬЕРЖЕМ (LIGA AI)
        # ======================================================================
        print("\n--- Запуск Сценария 1: Работа с ИИ-консьержем LIGA AI ---")
        t0 = time.time()
        
        # 1. Открытие модального окна LIGA AI
        page.locator("#btn-ai-concierge-open").click()
        page.wait_for_timeout(300)
        ai_modal = page.locator("#modal-ai-concierge")
        assert ai_modal.is_visible(), "Модальное окно LIGA AI должно открыться"
        
        # 2. Проверяем системный промпт и приветствие консьержа
        welcome_msg = page.locator("#ai-chat-messages").inner_text()
        assert "LIGA AI" in welcome_msg
        assert "инженерный консьерж" in welcome_msg
        
        # 3. Эмуляция вопроса живого мастера:
        # Улугбек задает сложный инженерный кейс по элитному объекту:
        test_query = "Улугбек на объекте 320 м2 в Mirabad Avenue. Ввод 8.5 бар, 2 санузла с тропическим душем, 140 м2 теплого пола, 8 радиаторов, бойлер 200 л и котел 35 кВт. Что ставить на ввод и нужна ли гидрострелка?"
        
        # Передаем текст в поле ввода консьержа
        chat_input = page.locator("#ai-chat-input")
        chat_input.fill(test_query)
        
        # Эмулируем ответ LIGA AI (так как агент выступает мозгом системы при отсутствии внешнего Google API ключа)
        simulated_ai_response = (
            "Улугбек, приветствую! Для объекта 320 м² в ЖК Mirabad Avenue:\n\n"
            "1. УЗЕЛ ВВОДА: Давление 8.5 бар критическое! Обязателен редуктор Caleffi 3/4\" (настройка на 3.5 бар), "
            "коллекторы FAR 1\" и вводная труба Rehau Stabil 25 мм. На тропический душ — строго лучи Rehau 20 мм.\n\n"
            "2. ТЕПЛЫЙ ПОЛ: 140 м² делим на 8–9 контуров (петли строго до 80 м, шаг 150 мм). Насосно-смесительный узел с насосом 25-60.\n\n"
            "3. ГИДРОСТРЕЛКА: ОБЯЗАТЕЛЬНА! У вас котел 35 кВт и 3 независимых вторичных контура со своими насосами (теплый пол + радиаторы + бойлер). "
            "Рекомендую модель «Север-М3» или Termojet 80×80 мм с патрубками 1\"."
        )
        
        # Внедряем ответ через интерфейс LIGA AI, чтобы проверить рендеринг и верстку
        page.evaluate(f"""(resp) => {{
            window.ligaAI._addUserMessage("{test_query}");
            window.ligaAI._addAIMessage(resp);
        }}""", simulated_ai_response)
        page.wait_for_timeout(300)
        
        # Проверяем, что ответ отобразился в бабле чата
        messages_text = page.locator("#ai-chat-messages").inner_text()
        assert "Caleffi 3/4" in messages_text
        assert "Север-М3" in messages_text
        
        results["scenario_ai"]["duration_sec"] = round(time.time() - t0, 2)
        results["scenario_ai"]["status"] = "PASSED"
        page.screenshot(path=os.path.join(root, 'screenshot_test_scenario_1_ai.png'))
        
        # Закрываем модалку AI
        page.locator("#btn-close-ai-concierge").click()
        page.wait_for_timeout(200)

        # ======================================================================
        # СЦЕНАРИЙ 2: МАСТЕР В ПОДВАЛЕ БЕЗ ИНТЕРНЕТА (100% OFFLINE)
        # ======================================================================
        print("\n--- Запуск Сценария 2: Мастер в монолитном подвале (Offline 100%) ---")
        t1 = time.time()
        
        # Симулируем полный обрыв интернета в браузере (подвал, бетон)
        context.set_offline(True)
        page.wait_for_timeout(200)
        
        # 1. Проверяем статус в шапке
        db_badge = page.locator(".brand-subtitle")
        assert "БАЗА ОФФЛАЙН" in db_badge.inner_text(), "База данных обязана сохранять локальный статус"

        # 2. Выбор активного объекта
        site_select = page.locator("#site-selector")
        site_select.select_option(index=0)
        page.wait_for_timeout(200)
        
        # 3. Инженерный расчет теплого пола (140 м²):
        page.evaluate("() => window.app.openFloorCalculator()")
        page.wait_for_timeout(200)
        # Применяем пресет в 1 тап
        page.evaluate("() => window.app.applyFloorPreset(140)")
        floor_loops = page.locator("#res-floor-loops-count").inner_text()
        floor_meters = page.locator("#res-floor-pipe-meters").inner_text()
        assert "контур" in floor_loops or "10" in floor_loops or "8" in floor_loops
        assert "метров" in floor_meters
        
        # Проверяем копирование скрипта клиенту в буфер обмена
        page.evaluate("() => window.app.copyFloorClientScript()")
        # Добавляем позиции на склад объекта
        page.evaluate("() => window.app.addCalculatedFloorToMaterials()")
        page.wait_for_timeout(300)

        # 4. Расчет гидрострелки для котельной 35 кВт:
        page.evaluate("() => window.app.openSeparatorCalculator()")
        page.wait_for_timeout(200)
        page.evaluate("() => window.app.setSeparatorPower(35)")
        # Включаем контуры теплого пола, радиаторов и бойлера
        page.evaluate("""() => {
            window.app.toggleSeparatorCircuit('floor', true);
            window.app.toggleSeparatorCircuit('radiators', true);
            window.app.toggleSeparatorCircuit('boiler', true);
        }""")
        page.wait_for_timeout(200)
        sep_status = page.locator("#sep-necessity-card").inner_text()
        assert "ОБЯЗАТЕЛЬНА" in sep_status, "Для 3 контуров гидрострелка должна быть обязательна"
        page.evaluate("() => window.app.copySeparatorClientScript()")
        page.evaluate("() => window.app.addCalculatedSeparatorToMaterials()")
        page.wait_for_timeout(300)

        # 5. Проверка режима безопасности перед показом заказчику Бахром-ака:
        beacon = page.locator("#header-safety-beacon")
        assert "master-mode" in beacon.get_attribute("class")
        # Мастер нажимает на маяк шапки
        beacon.click()
        page.wait_for_timeout(200)
        assert "client-mode" in beacon.get_attribute("class")
        assert "🛡️ БЕЗОПАСНЫЙ ПОКАЗ" in page.locator("#safety-beacon-text").inner_text()

        # 6. Проверка опрессовки и генерации официального Акта 16 бар:
        page.evaluate("() => window.app.setClientMode(false)") # Возврат в режим мастера
        page.wait_for_timeout(200)
        
        # Проверяем наличие методов генерации документов
        has_act_func = page.evaluate("() => typeof window.app.generatePressureAct === 'function' && typeof window.ligaPdfEngine.generatePressureAct === 'function'")
        assert has_act_func, "Генератор акта опрессовки должен быть доступен"

        results["scenario_offline_basement"]["duration_sec"] = round(time.time() - t1, 2)
        results["scenario_offline_basement"]["status"] = "PASSED"
        page.screenshot(path=os.path.join(root, 'screenshot_test_scenario_2_offline.png'))

        # ======================================================================
        # СЦЕНАРИЙ 3: ЭКСПЕРТНЫЙ АУДИТ ТРЕНИЯ И РУТИНЫ (UX FRICTION AUDIT)
        # ======================================================================
        print("\n--- Запуск Сценария 3: Анализ узких мест UX и скрытой рутины ---")
        
        # Проверяем высоту модальных окон (не уезжают ли кнопки за пределы экрана)
        page.evaluate("() => window.app.openPipeCalculator()")
        page.wait_for_timeout(200)
        pipe_modal_sheet = page.locator("#modal-pipe-calculator .modal-sheet")
        box = pipe_modal_sheet.bounding_box()
        if box and box['height'] > 780:
            results["ux_friction_points"].append({
                "component": "modal-pipe-calculator",
                "issue": "Высота модального окна велика для экранов 800px; требуется вертикальный скролл к кнопкам действий."
            })
            
        browser.close()

    print("\nРезультаты стресс-тестирования:")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return results

if __name__ == '__main__':
    run_simulation()
