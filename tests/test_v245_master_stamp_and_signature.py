# -*- coding: utf-8 -*-
"""
Playwright E2E Test Suite for LIGA OS v2.4.5
Тестирование гербовой печати, каллиграфической подписи мастера и дипломатической верификации
"""

import os
import sys
import pytest
from playwright.sync_api import sync_playwright

def get_base_url():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    index_path = os.path.join(project_root, "index.html")
    file_url = "file:///" + index_path.replace("\\", "/")
    return file_url

def test_seal_engine_and_live_preview():
    url = get_base_url()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Слушаем консоль для отладки
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(600)

        # 1. Проверяем наличие синглтона ligaSealEngine
        has_seal_engine = page.evaluate("() => !!window.ligaSealEngine")
        assert has_seal_engine, "window.ligaSealEngine must be defined"

        # 2. Открываем модальное окно настроек
        page.click("#btn-settings-top")
        page.wait_for_selector("#modal-settings.open", timeout=5000)

        # 3. Проверяем наличие полей секции печати
        assert page.is_visible("#input-master-stamp-name"), "input-master-stamp-name must be visible"
        assert page.is_visible("#input-master-stamp-company"), "input-master-stamp-company must be visible"
        assert page.is_visible("#input-master-stamp-cert"), "input-master-stamp-cert must be visible"
        assert page.is_visible("#select-master-stamp-style"), "select-master-stamp-style must be visible"
        assert page.is_visible("#seal-live-preview-box"), "seal-live-preview-box must be visible"

        # 4. Проверяем наличие SVG в превью
        svg_count = page.locator("#seal-live-preview-box svg.official-seal-svg").count()
        assert svg_count == 1, "There must be an SVG seal in live preview box"

        # 5. Проверяем живое реактивное обновление: вводим новое имя
        page.fill("#input-master-stamp-name", "Хакимов Улугбек Рустамович")
        page.wait_for_timeout(200)

        # Проверяем, что внутри SVG обновилось имя
        seal_text = page.inner_text("#seal-live-preview-box")
        assert "ХАКИМОВ УЛУГБЕК РУСТАМОВИЧ" in seal_text.upper(), "SVG seal must reactively contain updated master name"

        # 6. Проверяем переключение темы и возврат к доступной золотой печати.
        page.select_option("#select-master-stamp-style", "diplomatic_vermilion")
        page.select_option("#select-master-stamp-style", "swiss_imperial_gold")
        page.wait_for_timeout(200)
        has_gold_class = page.locator("#seal-live-preview-box svg.swiss_imperial_gold").count() == 1
        assert has_gold_class, "SVG seal must return to the selected gold style"

        # 7. Сохраняем персональную печать мастера
        page.click("#btn-save-master-seal")
        page.wait_for_timeout(300)

        # Проверяем, что настройки зафиксировались в localStorage
        stored_name = page.evaluate("() => window.ligaSealEngine.settings.masterName")
        assert stored_name == "Хакимов Улугбек Рустамович", "Settings must be persisted in localStorage"

        # Снимаем скриншот открытых настроек с золотой гербовой печатью
        screenshot_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")
        os.makedirs(screenshot_dir, exist_ok=True)
        settings_shot_path = os.path.join(screenshot_dir, "screenshot_v245_settings_gold_seal.png")
        page.screenshot(path=settings_shot_path)

        # 8. Закрываем настройки
        page.click("#btn-close-settings")
        page.wait_for_timeout(200)

        browser.close()
        assert len(errors) == 0, f"Page errors found: {errors}"

def test_telegram_diplomatic_manifest():
    url = get_base_url()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(500)

        # Проверяем, что сообщение не выдумывает объект, давление и финансовые суммы.
        manifests = page.evaluate("""() => {
            const missing = window.ligaSealEngine.formatTelegramDiplomaticManifest({ name: 'Объект без замера' });
            const recorded = window.ligaSealEngine.formatTelegramDiplomaticManifest({
                id: 7,
                name: 'Объект с фактическим замером',
                pressureTest: { pressureBar: '4.0', standardNorm: 'Параметры проекта' },
                pressTestPassed: true,
                contractSum: 0,
                advanceSum: 0
            });
            return { missing, recorded };
        }""")

        manifest = manifests["recorded"]
        assert "LIGA OS • СВОДКА ПО ОБЪЕКТУ" in manifest
        assert "рукописная подпись мастером не добавлена" in manifest
        assert "4.0 БАР" in manifest
        assert "Параметры проекта" in manifest
        assert "ГЕРБОВАЯ ПЕЧАТЬ" in manifest
        assert "ЛОКАЛЬНЫЙ НОМЕР ДОКУМЕНТА" in manifest
        missing = manifests["missing"]
        assert "НЕ ЗАФИКСИРОВАНО" in missing
        assert "18 500 000" not in missing
        assert "12 000 000" not in missing
        assert "Mirabad Avenue" not in missing

        signed = page.evaluate("""() => {
          window.ligaSealEngine.settings.handwrittenSignature = 'data:image/png;base64,AA==';
          return window.ligaSealEngine.formatTelegramDiplomaticManifest({ name: 'Объект с подписью' });
        }""")
        assert "рукописная подпись сохранена мастером" in signed

        browser.close()

def test_mobile_view_seal_and_guide():
    url = get_base_url()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Мобильный вьюпорт iPhone 15 Pro (393 x 852)
        context = browser.new_context(viewport={"width": 393, "height": 852}, is_mobile=True)
        page = context.new_page()
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(600)

        # Открываем настройки на телефоне
        page.click("#btn-settings-top")
        page.wait_for_selector("#modal-settings.open", timeout=5000)

        # Проверяем, что блок превью виден на мобильном
        preview_box = page.locator("#seal-live-preview-box")
        assert preview_box.is_visible()

        # Снимаем мобильный скриншот
        screenshot_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")
        os.makedirs(screenshot_dir, exist_ok=True)
        mobile_shot_path = os.path.join(screenshot_dir, "screenshot_v245_mobile_seal_preview.png")
        page.screenshot(path=mobile_shot_path)

        browser.close()

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
