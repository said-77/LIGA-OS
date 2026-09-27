# -*- coding: utf-8 -*-
"""
Playwright E2E Test Suite for LIGA OS v2.4.6
Тестирование швейцарских 3D-тумблеров, флагманской кнопки + ПЛАТЕЖ,
живого тура с диктором и открытием окон, и мобильной адаптации.
"""

import os
import re
import pytest
from playwright.sync_api import sync_playwright

def get_base_url():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    index_path = os.path.join(project_root, "index.html")
    return "file:///" + index_path.replace("\\", "/")

def test_v246_luxury_tumbler_toggles():
    """Проверка швейцарских 3D-тумблеров в настройках (отсутствие желтых пятен, надписи ОТКЛ/ВКЛ)"""
    url = get_base_url()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        page.goto(url)
        page.wait_for_selector("#modal-settings", state="attached")

        # Открываем Настройки
        page.evaluate("window.app.openModal('modal-settings')")
        assert page.locator("#modal-settings").is_visible()

        # Проверяем чекбоксы тогглов
        sound_toggle = page.locator("#toggle-sound")
        assert sound_toggle.count() > 0
        
        # Проверяем стили трека и кругляшка
        track_style = page.evaluate("""() => {
            const el = document.querySelector('#toggle-sound + .toggle-track');
            const before = window.getComputedStyle(el, '::before');
            const after = window.getComputedStyle(el, '::after');
            return {
                beforeDisplay: before.display,
                beforeWidth: before.width,
                afterContent: after.content
            };
        }""")
        assert track_style["beforeDisplay"] == "block"
        assert "22px" in track_style["beforeWidth"]
        assert "ВКЛ" in track_style["afterContent"]

        # Кликаем для переключения в ОТКЛ
        page.locator("#toggle-sound + .toggle-track").click()
        after_off = page.evaluate("""() => {
            const el = document.querySelector('#toggle-sound + .toggle-track');
            const after = window.getComputedStyle(el, '::after');
            return after.content;
        }""")
        assert "ОТКЛ" in after_off

        page.screenshot(path="screenshot_v246_swiss_toggles.png")
        browser.close()

def test_v246_luxury_payment_button():
    """Проверка флагманской 3D-кнопки + ПЛАТЕЖ и открытия кассы"""
    url = get_base_url()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        page.goto(url)
        
        pay_btn = page.locator("#btn-open-payment")
        assert pay_btn.is_visible()
        btn_class = pay_btn.get_attribute("class")
        assert "btn-luxury-payment-pulse" in btn_class
        assert "+ ПЛАТЁЖ" in pay_btn.inner_text()

        # Клик по кнопке платежа реально открывает модалку кассы
        pay_btn.click()
        assert page.locator("#modal-payment").is_visible()
        page.screenshot(path="screenshot_v246_payment_modal_opened.png")
        page.locator("#modal-payment .btn-close-modal").first.click()
        assert not page.locator("#modal-payment").is_visible()
        browser.close()

def test_v246_voice_tour_and_window_actions():
    """Проверка живого тура с голосом диктора и реальным открытием окон"""
    url = get_base_url()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        page.goto(url)

        # Запускаем тур
        page.evaluate("window.app.startSpotlightTour()")
        assert page.locator("#spotlight-tour-overlay").is_visible()

        # Проверяем кнопку переключения голоса
        voice_btn = page.locator("#btn-spotlight-voice-toggle")
        assert voice_btn.is_visible()
        assert "🔊 Диктор: ВКЛ" in voice_btn.inner_text()

        # Переключаем голос
        voice_btn.click()
        assert "🔇 Диктор: ВЫКЛ" in voice_btn.inner_text()
        voice_btn.click()
        assert "🔊 Диктор: ВКЛ" in voice_btn.inner_text()

        # Переходим на шаг 2 (+ Платеж)
        page.locator("#btn-spotlight-next").click()
        page.wait_for_timeout(600)
        # На шаге 2 модалка платежа РЕАЛЬНО открывается!
        assert page.locator("#modal-payment").is_visible()
        page.screenshot(path="screenshot_v246_tour_step2_payment_opened.png")

        # Завершаем тур
        page.locator("#btn-spotlight-finish").click()
        assert not page.locator("#spotlight-tour-overlay").is_visible()
        assert not page.locator("#modal-payment").is_visible()
        browser.close()

def test_v246_mobile_video_tour_dimensions():
    """Проверка мобильной адаптации видеотура на экране смартфона (393x852)"""
    url = get_base_url()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()
        page.goto(url)

        # Проверяем кнопку ГИД в шапке
        guide_btn = page.locator("#btn-video-tour-open")
        assert guide_btn.is_visible()
        assert "ГИД" in guide_btn.inner_text()

        # Открываем модалку видеотура
        page.evaluate("window.app.openVideoTour()")
        assert page.locator("#modal-video-tour").is_visible()

        # Проверяем высоту сцены на мобильном (должна быть <= 185px)
        stage_height = page.evaluate("() => document.getElementById('video-cinema-stage').getBoundingClientRect().height")
        assert stage_height <= 185, f"Stage height {stage_height} exceeds mobile budget!"

        page.screenshot(path="screenshot_v246_mobile_video_compact.png")
        page.evaluate("window.app.closeVideoTour()")
        assert not page.locator("#modal-video-tour").is_visible()
        browser.close()
