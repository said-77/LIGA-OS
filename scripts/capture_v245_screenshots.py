# -*- coding: utf-8 -*-
"""
Генерация детальных скриншотов высокого качества для аудита LIGA OS v2.4.5:
1. Секция гербовой печати и ЭЦП в Настройках (Золотое VIP-тиснение)
2. Официальный Акт 16 бар с впечатанной швейцарской гербовой печатью и подписью
3. Мобильный экран настроек на смартфоне (393x852)
"""

import os
from playwright.sync_api import sync_playwright

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    index_path = os.path.join(project_root, "index.html")
    file_url = "file:///" + index_path.replace("\\", "/")

    artifacts_dir = r"C:\Users\Admin\.gemini\antigravity\brain\4edf7a96-61be-4326-a9ad-2ef298bcbb5e"
    screenshots_dir = os.path.join(project_root, "screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)

    with sync_playwright() as p:
        # 1. Десктоп скриншот настроек
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 850})
        page = context.new_page()
        page.goto(file_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(600)

        # Открываем настройки
        page.click("#btn-settings-top")
        page.wait_for_selector("#modal-settings.open", timeout=5000)

        # Прокручиваем к секции печати
        page.evaluate("() => { const el = document.getElementById('settings-section-seal'); if(el) el.scrollIntoView({block:'center'}); }")
        page.wait_for_timeout(300)

        # Скриншот настроек в дефолтной синей мастике
        shot_path_1 = os.path.join(artifacts_dir, "screenshot_v245_settings_seal_blue.png")
        page.screenshot(path=shot_path_1)
        page.screenshot(path=os.path.join(screenshots_dir, "screenshot_v245_settings_seal_blue.png"))

        # Переключаем на Золотое VIP-тиснение и меняем имя
        page.fill("#input-master-stamp-name", "Хакимов Улугбек (Лига Мастеров)")
        page.select_option("#select-master-stamp-style", "gold_seal")
        page.click("#btn-save-master-seal")
        page.wait_for_timeout(300)

        shot_path_2 = os.path.join(artifacts_dir, "screenshot_v245_settings_seal_gold.png")
        page.screenshot(path=shot_path_2)
        page.screenshot(path=os.path.join(screenshots_dir, "screenshot_v245_settings_seal_gold.png"))

        browser.close()

        # 2. Мобильный скриншот (iPhone 15 Pro, 393x852)
        context_m = p.chromium.launch(headless=True).new_context(viewport={"width": 393, "height": 852}, is_mobile=True)
        page_m = context_m.new_page()
        page_m.goto(file_url)
        page_m.wait_for_load_state("domcontentloaded")
        page_m.wait_for_timeout(600)

        page_m.click("#btn-settings-top")
        page_m.wait_for_selector("#modal-settings.open", timeout=5000)
        page_m.evaluate("() => { const el = document.getElementById('settings-section-seal'); if(el) el.scrollIntoView({block:'center'}); }")
        page_m.wait_for_timeout(300)

        shot_path_3 = os.path.join(artifacts_dir, "screenshot_v245_mobile_seal_preview.png")
        page_m.screenshot(path=shot_path_3)
        page_m.screenshot(path=os.path.join(screenshots_dir, "screenshot_v245_mobile_seal_preview.png"))

        context_m.close()

    print("[OK] All v2.4.5 screenshots captured successfully!")

if __name__ == "__main__":
    main()
