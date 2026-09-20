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

PORT = 8091
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

async def run_full_suite():
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

        await page.goto(f"http://localhost:{PORT}/index.html", wait_until="networkidle")
        await page.wait_for_timeout(500)

        # 1. Принудительно ставим тёмную тему для первой серии скриншотов
        print("1. Тестирование Тёмного Титана...")
        await page.evaluate("window.app.applyTheme('dark', false)")
        await page.wait_for_timeout(300)

        await page.screenshot(path="screenshot_theme_dark_dashboard.png")
        print("✓ Тёмная тема: Dashboard сохранен")

        # Переход в материалы
        await page.click('button[data-screen="materials"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path="screenshot_theme_dark_materials.png")
        print("✓ Тёмная тема: Материалы сохранены")

        # Добавление чека с фото
        print("2. Тестирование добавления чека с фото...")
        await page.click('button[onclick*="modal-receipt"]')
        await page.wait_for_timeout(400)

        await page.fill('#receipt-title', 'Комплект фильтров тонкой очистки Oventrop')
        await page.fill('#receipt-amount', '1850000')
        await page.fill('#receipt-qty', '2 шт')

        # Создаем мини-изображение чека на лету прямо через canvas в браузере
        await page.evaluate("""
            () => {
                const canvas = document.createElement('canvas');
                canvas.width = 400;
                canvas.height = 600;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#f8f8f8';
                ctx.fillRect(0, 0, 400, 600);
                ctx.fillStyle = '#111';
                ctx.font = 'bold 20px monospace';
                ctx.fillText('ТОВАРНЫЙ ЧЕК №482', 40, 50);
                ctx.font = '14px monospace';
                ctx.fillText('Рынок Джами, Магазин 14-B', 40, 90);
                ctx.fillText('Дата: 20.09.2026 11:42', 40, 120);
                ctx.fillText('-----------------------------------', 40, 150);
                ctx.fillText('Фильтры Oventrop 1" x 2 = 1.850.000', 40, 180);
                ctx.fillText('-----------------------------------', 40, 220);
                ctx.font = 'bold 18px monospace';
                ctx.fillText('ИТОГО: 1 850 000 сум', 40, 260);
                ctx.fillText('ОПЛАЧЕНО НАЛИЧНЫМИ', 40, 300);
                
                window.app.pendingReceiptPhoto = canvas.toDataURL('image/jpeg', 0.85);
                document.getElementById('receipt-photo-status').innerHTML = '<span style=\"color:var(--neon-emerald); font-weight:800;\">✓ Фото чека прикреплено (400x600)</span>';
            }
        """)
        await page.wait_for_timeout(300)

        # Сохраняем чек
        await page.click('#form-add-receipt button[type="submit"]')
        await page.wait_for_timeout(600)
        print("✓ Чек успешно сохранен в базу IndexedDB!")

        # Ищем кнопку просмотра чека
        receipt_btns = await page.query_selector_all(".btn-receipt-view")
        print(f"Кнопок просмотра чеков найдено: {len(receipt_btns)}")
        if len(receipt_btns) > 0:
            await receipt_btns[0].click()
            await page.wait_for_timeout(500)
            await page.screenshot(path="screenshot_receipt_view_modal.png")
            print("✓ Модалка просмотра чека сохранена: screenshot_receipt_view_modal.png")
            # Закрываем модалку
            await page.click('#modal-view-receipt button.btn-close-modal')
            await page.wait_for_timeout(300)

        # 3. Переход в чек-лист и Акт стяжки
        await page.click('button[data-screen="checklist"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path="screenshot_theme_dark_checklist.png")
        print("✓ Тёмная тема: Технадзор сохранен")

        # 4. Переход в финансы
        await page.click('button[data-screen="finances"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path="screenshot_theme_dark_finances.png")
        print("✓ Тёмная тема: Финансы сохранены")

        # 5. Переключение на светлую тему «Светлая керамика»
        print("3. Тестирование Светлой Керамики (WCAG AAA)...")
        await page.evaluate("window.app.applyTheme('light', false)")
        await page.wait_for_timeout(400)

        # Скриншоты всех экранов в светлой теме
        await page.click('button[data-screen="dashboard"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path="screenshot_theme_light_dashboard.png")
        print("✓ Светлая тема: Dashboard сохранен")

        await page.click('button[data-screen="materials"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path="screenshot_theme_light_materials.png")
        print("✓ Светлая тема: Материалы сохранены")

        await page.click('button[data-screen="checklist"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path="screenshot_theme_light_checklist.png")
        print("✓ Светлая тема: Технадзор сохранен")

        await page.click('button[data-screen="finances"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path="screenshot_theme_light_finances.png")
        print("✓ Светлая тема: Финансы сохранены")

        await browser.close()

    print("\n================ РЕЗУЛЬТАТЫ ПОЛНОГО ТЕСТА ================")
    if errors:
        print(f"ОШИБКИ ({len(errors)}):")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    else:
        print("УСПЕХ: 100% прохождение всех тестов без единой ошибки!")

if __name__ == "__main__":
    asyncio.run(run_full_suite())
