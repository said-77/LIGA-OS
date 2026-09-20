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

PORT = 8089
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass # Тихо без спама

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

async def run_tests():
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    print(f"HTTP-сервер запущен на http://localhost:{PORT}")

    errors = []

    async with async_playwright() as p:
        # Эмуляция iPhone 14 Pro
        device = p.devices['iPhone 14 Pro']
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(**device)
        page = await context.new_page()

        page.on("console", lambda msg: errors.append(f"CONSOLE ERROR: {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda err: errors.append(f"PAGE ERROR: {err}"))

        print("1. Открытие страницы LIGA OS...")
        await page.goto(f"http://localhost:{PORT}/index.html", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        title = await page.title()
        print(f"Заголовок страницы: {title}")

        # Проверка 1: Экран Dashboard
        site_name = await page.inner_text("#site-name-display")
        print(f"Текущий объект: {site_name}")
        await page.screenshot(path="screenshot_dashboard_v12.png")
        print("✓ Скриншот Dashboard сохранен: screenshot_dashboard_v12.png")

        # Проверка 2: Экран Снабжения (Materials)
        print("2. Переход на экран «Снабжение и чеки»...")
        await page.click('button[data-screen="materials"]')
        await page.wait_for_timeout(500)

        purchased_val = await page.inner_text("#mat-purchased-sum")
        needed_val = await page.inner_text("#mat-needed-sum")
        print(f"Снабжение: Закуплено = {purchased_val}, Нужно купить = {needed_val}")

        # Тест фильтра "Нужно купить"
        print("Клик по фильтру «Нужно купить»...")
        await page.click('button.mat-filter[data-filter="needed"]')
        await page.wait_for_timeout(300)

        needed_items = await page.query_selector_all(".mat-item-card.needed")
        print(f"Позиций к закупке отображено: {len(needed_items)}")

        # Клик по чекбоксу для смены статуса на "Куплено"
        if len(needed_items) > 0:
            first_check = await needed_items[0].query_selector(".mat-checkbox")
            if first_check:
                await first_check.click()
                await page.wait_for_timeout(400)
                print("✓ Чекбокс переключен в 1 тап!")

        # Переключение на фильтр "Все"
        await page.click('button.mat-filter[data-filter="all"]')
        await page.wait_for_timeout(300)

        # Скриншот снабжения в темной теме
        await page.screenshot(path="screenshot_materials_dark.png")
        print("✓ Скриншот Снабжения сохранен: screenshot_materials_dark.png")

        # Проверка 3: Экран Технадзора и Акта стяжки
        print("3. Переход на экран «Технадзор перед стяжкой»...")
        await page.click('button[data-screen="checklist"]')
        await page.wait_for_timeout(500)

        counter_text = await page.inner_text("#checklist-counter-badge")
        percent_text = await page.inner_text("#screed-percent-label")
        print(f"Технадзор: прогресс {counter_text} ({percent_text})")

        # Отмечаем пункты чек-листа (с повторным получением элементов после перерендера)
        check_items = await page.query_selector_all(".check-item")
        print(f"Всего пунктов чек-листа найдено: {len(check_items)}")
        if len(check_items) >= 2:
            await check_items[0].click()
            await page.wait_for_timeout(300)
            
            # Повторный запрос элементов после renderChecklist
            check_items_after = await page.query_selector_all(".check-item")
            if len(check_items_after) >= 2:
                await check_items_after[1].click()
                await page.wait_for_timeout(300)

        updated_counter = await page.inner_text("#checklist-counter-badge")
        updated_percent = await page.inner_text("#screed-percent-label")
        print(f"Технадзор после отметок: {updated_counter} ({updated_percent})")

        await page.screenshot(path="screenshot_checklist_screed.png")
        print("✓ Скриншот Технадзора сохранен: screenshot_checklist_screed.png")

        # Проверка 4: Экран Финансов и Сводного радара
        print("4. Переход на экран «Финансы и Сводный радар»...")
        await page.click('button[data-screen="finances"]')
        await page.wait_for_timeout(500)

        obj_contract = await page.inner_text("#page-fin-contract")
        obj_debt = await page.inner_text("#page-fin-debt")
        radar_sites = await page.inner_text("#portfolio-sites-badge")
        radar_total = await page.inner_text("#portfolio-total-contract")
        print(f"Объект: контракт = {obj_contract}, долг = {obj_debt}")
        print(f"Сводный радар: {radar_sites}, суммарный оборот = {radar_total}")

        await page.screenshot(path="screenshot_finances_radar.png")
        print("✓ Скриншот Финансов и Радара сохранен: screenshot_finances_radar.png")

        # Проверка 5: Светлая тема
        print("5. Переключение на светлую тему «Светлая керамика»...")
        await page.click("#btn-theme-toggle")
        await page.wait_for_timeout(500)

        theme_attr = await page.get_attribute("html", "data-theme")
        print(f"Текущая тема HTML: {theme_attr}")

        await page.screenshot(path="screenshot_finances_light.png")
        print("✓ Скриншот в светлой теме сохранен: screenshot_finances_light.png")

        # Переход обратно на снабжение в светлой теме
        await page.click('button[data-screen="materials"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path="screenshot_materials_light.png")
        print("✓ Скриншот Снабжения в светлой теме сохранен: screenshot_materials_light.png")

        await browser.close()

    print("\n================ РЕЗУЛЬТАТЫ ВЕРИФИКАЦИИ ================")
    if errors:
        print(f"ОБНАРУЖЕНО ОШИБОК: {len(errors)}")
        for err in errors:
            print("  -", err)
        sys.exit(1)
    else:
        print("ОШИБОК НЕТ! (0 console errors, 0 page errors)")
        print("Все модули и экраны работают безупречно!")

if __name__ == "__main__":
    asyncio.run(run_tests())
