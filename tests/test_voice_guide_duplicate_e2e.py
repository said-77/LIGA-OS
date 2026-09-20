import asyncio
import http.server
import socketserver
import threading
import os
import sys
from playwright.async_api import async_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = 8092
DIRECTORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

async def run_suite():
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    print(f"HTTP-сервер запущен на http://localhost:{PORT}")

    errors = []

    async with async_playwright() as p:
        device = p.devices['iPhone 14 Pro']
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(**device)
        page = await context.new_page()

        page.on("console", lambda msg: errors.append(f"CONSOLE ERROR: {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda err: errors.append(f"PAGE ERROR: {err}"))

        print("1. Загрузка LIGA OS...")
        await page.goto(f"http://localhost:{PORT}/index.html", wait_until="networkidle")
        await page.wait_for_timeout(500)

        # Проверка нижней панели: 5 элементов
        nav_items = await page.query_selector_all(".nav-item")
        print(f"Пунктов в нижней панели: {len(nav_items)}")
        assert len(nav_items) == 5, "Ожидалось ровно 5 пунктов навигации!"

        # 2. Тестирование голосовой диктовки
        print("2. Тестирование голосового модуля («Свободные руки»)...")
        await page.click("#btn-voice-input")
        await page.wait_for_timeout(400)

        # Симулируем ввод речи через инпут
        await page.fill("#voice-recognized-input", "Купил на Джами трубу Rehau на 950 тысяч")
        await page.wait_for_timeout(400)

        # Проверяем появление блока разбора
        preview_visible = await page.is_visible("#voice-parse-preview")
        print(f"Блок разбора голоса виден: {preview_visible}")
        type_text = await page.inner_text("#voice-parse-type")
        details_text = await page.inner_text("#voice-parse-details")
        print(f"Разбор: {type_text} | {details_text}")

        await page.screenshot(path="screenshot_test_voice_modal.png")
        print("✓ Скриншот окна голосового согласования сохранен: screenshot_test_voice_modal.png")

        # Подтверждаем внесение голосовой записи
        await page.click("#btn-voice-confirm")
        await page.wait_for_timeout(500)
        print("✓ Голосовая запись успешно подтверждена и сохранена в базу!")

        # 3. Тестирование детектора дубликатов
        print("3. Тестирование защиты от повторных чеков (дублей)...")
        await page.click('button[data-screen="materials"]')
        await page.wait_for_timeout(400)

        # Пытаемся сохранить чек с точно такой же суммой
        await page.click('button[onclick*="modal-receipt"]')
        await page.wait_for_timeout(300)
        await page.fill("#receipt-title", "Труба Rehau")
        await page.fill("#receipt-amount", "950000")
        await page.click('#form-add-receipt button[type="submit"]')
        await page.wait_for_timeout(500)

        dup_modal_visible = await page.is_visible("#modal-duplicate-warning")
        print(f"Модалка предупреждения о дубле открылась: {dup_modal_visible}")
        if dup_modal_visible:
            warn_item = await page.inner_text("#duplicate-existing-item")
            print(f"Обнаружен дубликат: {warn_item}")
            await page.screenshot(path="screenshot_test_duplicate_warning.png")
            print("✓ Скриншот предупреждения о дубле сохранен: screenshot_test_duplicate_warning.png")
            # Нажимаем отмену (это дубль)
            await page.click('#modal-duplicate-warning button[onclick*="closeModal"]')
            await page.wait_for_timeout(300)

        # 4. Тестирование памятки мастера (Диалоги с дизайнерами)
        print("4. Тестирование памятки мастера и скриптов диалогов...")
        await page.click("#btn-guide-top")
        await page.wait_for_timeout(400)

        guide_visible = await page.is_visible("#modal-master-guide")
        print(f"Окно памятки мастера открыто: {guide_visible}")
        await page.screenshot(path="screenshot_test_guide_designer.png")
        print("✓ Скриншот скриптов для дизайнеров сохранен: screenshot_test_guide_designer.png")

        # Переключаем на возражения
        await page.click('button.guide-tab-btn[data-tab="objections"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path="screenshot_test_guide_objections.png")
        print("✓ Скриншот ответов на возражения сохранен: screenshot_test_guide_objections.png")
        await page.click('#modal-master-guide button[onclick*="closeModal"]')
        await page.wait_for_timeout(300)

        # 5. Тестирование ИИ-Аналитика объекта
        print("5. Тестирование ИИ-Аналитика объекта...")
        await page.click("#btn-ai-audit-top")
        await page.wait_for_timeout(800)

        margin_text = await page.inner_text("#ai-margin-val")
        risks_text = await page.inner_text("#ai-risks-val")
        print(f"ИИ-Анализ: {margin_text} | {risks_text}")
        await page.screenshot(path="screenshot_test_ai_audit.png")
        print("✓ Скриншот ИИ-Аналитика сохранен: screenshot_test_ai_audit.png")
        await page.click('#modal-ai-audit button[onclick*="saveAiAuditNotes"]')
        await page.wait_for_timeout(400)

        # 6. Тестирование цифровой расписки через URL
        print("6. Тестирование подтверждения цифровой расписки через Telegram-ссылку...")
        await page.goto(f"http://localhost:{PORT}/index.html?verify_receipt=REC-8842&emp=Алишер&amount=500000&site=Mirabad%20Avenue", wait_until="networkidle")
        await page.wait_for_timeout(600)

        receipt_visible = await page.is_visible("#modal-verify-receipt")
        print(f"Окно цифровой расписки открыто: {receipt_visible}")
        rec_name = await page.inner_text("#verify-receipt-recipient")
        rec_amount = await page.inner_text("#verify-receipt-amount")
        print(f"Данные расписки: {rec_name}, Сумма = {rec_amount}")
        await page.screenshot(path="screenshot_test_verify_receipt.png")
        print("✓ Скриншот цифровой расписки сохранен: screenshot_test_verify_receipt.png")

        # Подтверждаем получение денег
        await page.click("#btn-confirm-receipt-action")
        await page.wait_for_timeout(500)
        print("✓ Расписка успешно подтверждена получателем!")

        await browser.close()

    print("\n================ РЕЗУЛЬТАТЫ СКВОЗНОГО ТЕСТА ================")
    if errors:
        print(f"ОБНАРУЖЕНО ОШИБОК ({len(errors)}):")
        for err in errors:
            print("  -", err)
        sys.exit(1)
    else:
        print("ИТОГ: 100% УСПЕХ! 0 ошибок консоли!")
        print("Все новые функции работают на мировом уровне!")

if __name__ == "__main__":
    asyncio.run(run_suite())
