"""Реальные браузерные проверки AI boundary, мини-плеера и индекса заполнения."""

import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import pytest
from playwright.sync_api import sync_playwright


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8123


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


@pytest.fixture(scope="module")
def app_url():
    os.chdir(ROOT_DIR)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{PORT}"
    server.shutdown()
    server.server_close()


def test_api_key_save_visibility_and_safe_prompt(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{app_url}/index.html?profile=demo")
        page.wait_for_selector(".bottom-nav")
        page.evaluate("window.app.openModal('modal-settings')")

        key_input = page.locator("#ai-api-key-input")
        assert key_input.get_attribute("type") == "password"
        key_input.fill("temporary-provider-key-format")
        page.locator("#btn-save-ai-key").click()
        assert page.evaluate("localStorage.getItem('liga_ai_key')") == "temporary-provider-key-format"
        assert "Связь ещё не проверена" in page.locator("#ai-provider-status").inner_text()

        page.locator('[data-toggle-secret="ai-api-key-input"]').click()
        assert key_input.get_attribute("type") == "text"
        page.locator('[data-toggle-secret="ai-api-key-input"]').click()
        assert key_input.get_attribute("type") == "password"

        page.evaluate("""() => {
          window.app.currentSite = {title:'SENTINEL_SITE', address:'SENTINEL_ADDRESS', clientName:'SENTINEL_CLIENT', clientPhone:'SENTINEL_PHONE', contractSum:987654321, pressureTest:{pressureBar:91}};
          window.app.switchScreen('finances');
        }""")
        prompt = page.evaluate("window.ligaAI._buildHelpPrompt()")
        for sensitive in ["SENTINEL_SITE", "SENTINEL_ADDRESS", "SENTINEL_CLIENT", "SENTINEL_PHONE", "987654321", "91 бар"]:
            assert sensitive not in prompt
        assert "ФИНАНСЫ" in prompt
        page.evaluate("window.app.openFloorCalculator()")
        page.wait_for_selector("#modal-floor-calculator.open")
        calculator_prompt = page.evaluate("window.ligaAI._buildHelpPrompt()")
        assert "тепл" in calculator_prompt.lower()
        assert "SENTINEL_CLIENT" not in calculator_prompt
        browser.close()


def test_contextual_help_uses_catalog_without_live_page_values(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{app_url}/index.html?profile=demo")
        page.wait_for_function("Array.isArray(window.LIGA_HELP_CATALOG) && window.ligaAI")
        page.evaluate("""() => {
          window.app.currentSite = {title:'PRIVATE_SITE_1', address:'PRIVATE_ADDRESS_2', clientName:'PRIVATE_CLIENT_3', contractSum:91827364};
          window.app.switchScreen('checklist');
          document.querySelector('#ai-chat-input').value = 'Объясни испытание и почему бывает 16 бар';
        }""")
        prompt = page.evaluate("window.ligaAI._buildHelpPrompt()")
        assert "КОНТРОЛЬ, ЭТАПЫ И ИСПЫТАНИЯ" in prompt
        assert "16 бар — возможный усиленный стандарт" in prompt
        for private_value in ["PRIVATE_SITE_1", "PRIVATE_ADDRESS_2", "PRIVATE_CLIENT_3", "91827364"]:
            assert private_value not in prompt

        page.evaluate("window.app.openModal('modal-ai-concierge')")
        page.evaluate("window.app.openModal('modal-floor-calculator')")
        page.evaluate("window.ligaAI._sendMessage = () => { window.helpQuestion = document.querySelector('#ai-chat-input').value; }")
        page.locator("#btn-ai-explain-screen").click()
        assert "Калькулятор тёплого пола" in page.evaluate("window.helpQuestion")
        browser.close()


def test_gemini_request_contains_user_question_and_catalog_not_object_data(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{app_url}/index.html?profile=demo")
        page.wait_for_function("window.ligaAI && Array.isArray(window.LIGA_HELP_CATALOG)")
        result = page.evaluate("""async () => {
          window.app.currentSite = {title:'PRIVATE_SITE', address:'PRIVATE_ADDRESS', clientName:'PRIVATE_CLIENT', contractSum:1234567};
          window.app.currentScreen = 'estimate';
          window.ligaAI.apiKey = 'test-only-key';
          window.ligaAI.chatHistory = [];
          let captured = null;
          window.fetch = async (url, options) => {
            captured = {url, headers: options.headers, body: JSON.parse(options.body)};
            return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Расчёт — предварительная оценка.'}]}}]}), {status:200, headers:{'Content-Type':'application/json'}});
          };
          const answer = await window.ligaAI._callGeminiAPI('QUESTION_SENTINEL: объясни назначение сметы');
          return {answer, captured};
        }""")
        assert result["answer"] == "Расчёт — предварительная оценка."
        request = result["captured"]
        assert request["headers"]["x-goog-api-key"] == "test-only-key"
        assert "test-only-key" not in request["url"]
        assert request["body"]["contents"][-1]["parts"][0]["text"] == "QUESTION_SENTINEL: объясни назначение сметы"
        prompt = request["body"]["contents"][0]["parts"][0]["text"]
        assert "Смета и расчёт стоимости" in prompt
        for private_value in ["PRIVATE_SITE", "PRIVATE_ADDRESS", "PRIVATE_CLIENT", "1234567"]:
            assert private_value not in str(request)
        browser.close()


def test_help_context_follows_core_workflow_modals(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{app_url}/index.html?profile=demo")
        page.wait_for_function("window.ligaAI && Array.isArray(window.LIGA_HELP_CATALOG)")
        modal_entries = {
            "modal-add-site": "site-create",
            "modal-payment": "payment-form",
            "modal-receipt": "receipt-form",
            "modal-pressure-test": "pressure-form",
            "modal-passport-photos": "photos",
            "modal-quick-fact": "quick-fact",
            "modal-backup-manager": "backup",
            "modal-add-event": "event-form",
        }
        for modal_id, entry_id in modal_entries.items():
            page.evaluate("id => window.app.openModal(id)", modal_id)
            actual = page.evaluate("window.ligaAI._getActiveHelpEntry().id")
            assert actual == entry_id, f"Для {modal_id} выбрана статья {actual}"
            page.evaluate("id => window.app.closeModal(id)", modal_id)
        browser.close()


def test_public_help_page_is_standalone_and_privacy_clear(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        response = page.goto(f"{app_url}/help/")
        assert response and response.status == 200
        assert page.title() == "Руководство пользователя — LIGA OS"
        text = page.locator("body").inner_text()
        for phrase in ["ChatGPT, Gemini", "не даёт нейросети доступ", "16 бар — усиленный стандарт", "калькуляторы"]:
            assert phrase.lower() in text.lower()
        for phrase in ["Создать объект", "Платёж или выплата", "Гидравлическое испытание", "Резервная копия и перенос", "содержимым архива"]:
            assert phrase.lower() in text.lower()
        browser.close()


def test_video_controls_follow_playback_across_screens(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{app_url}/index.html?profile=demo")
        page.wait_for_selector(".bottom-nav")
        page.evaluate("window.app.openVideoTour()")
        page.wait_for_selector("#modal-video-tour.open")
        page.evaluate("""async () => {
          const video = document.getElementById('liga-real-mp4-player');
          video.muted = true;
          await video.play();
        }""")
        page.wait_for_function("!document.getElementById('liga-real-mp4-player').paused")
        page.locator("#btn-close-video-tour").click()
        page.wait_for_function("!document.getElementById('liga-video-mini-player').hidden")
        page.locator('.bottom-nav button[data-screen="finances"]').click()
        assert page.locator("#liga-video-mini-player").is_visible()

        page.locator("#liga-video-mini-toggle").click()
        page.wait_for_function("document.getElementById('liga-real-mp4-player').paused")
        assert page.locator("#liga-video-mini-player").is_visible()
        page.locator("#liga-video-mini-toggle").click()
        page.wait_for_function("!document.getElementById('liga-real-mp4-player').paused")
        page.locator("#liga-video-mini-stop").click()
        page.wait_for_function("document.getElementById('liga-video-mini-player').hidden")
        assert page.locator("#liga-real-mp4-player").evaluate("el => el.currentTime") == 0
        browser.close()


def test_readiness_score_has_honest_explanation(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{app_url}/index.html?profile=demo")
        page.wait_for_selector("#chrono-progress-val")
        assert page.locator(".radar-label").inner_text() == "ЗАПОЛНЕНИЕ"
        page.locator("#btn-readiness-breakdown").click()
        detail = page.locator("#readiness-breakdown").inner_text()
        assert "не оценка качества работ" in detail
        assert "+" in detail and "Название объекта" in detail
        page.evaluate("""async () => {
          window.app.currentSite = {id:999999, name:'Тест', contractSum:100, status:5, durationDays:3, createdAt:'2026-01-01'};
          window.app.currentSiteId = 999999;
          await window.app.renderChronoRadarAndNextAction();
        }""")
        badge = page.locator("#chrono-pace-badge").inner_text()
        assert "СОГЛАСОВАННЫЙ СРОК" in badge
        assert "ОПЕРЕЖЕНИЕ" not in badge and "ОТСТАВАНИЕ" not in badge
        browser.close()


def test_backup_provider_status_drives_header_indicator(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.add_init_script("""
          localStorage.setItem('liga_ai_backup_provider', 'groq');
          localStorage.setItem('liga_ai_backup_key', 'saved-backup-key');
          localStorage.setItem('liga_ai_backup_connection_status', 'connected');
        """)
        page.goto(f"{app_url}/index.html?profile=demo")
        page.wait_for_selector(".bottom-nav")
        indicator = page.locator("#btn-ai-concierge-open")
        assert "Groq" in (indicator.get_attribute("title") or "")
        assert "offline" not in (indicator.get_attribute("class") or "")

        page.evaluate("window.app.openModal('modal-settings')")
        page.locator("#select-ai-backup-provider").select_option("openai")
        assert page.evaluate("localStorage.getItem('liga_ai_backup_connection_status')") == "unknown"
        assert "не подтверждено" in (indicator.get_attribute("title") or "")
        browser.close()


def test_work_and_demo_profiles_keep_separate_local_databases(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.on("dialog", lambda dialog: dialog.accept())
        page.goto(f"{app_url}/index.html?profile=legacy")
        page.wait_for_selector(".bottom-nav")
        assert page.evaluate("window.ligaDB.databaseName") == "LigaOS_DB"
        legacy_site_id = page.evaluate("window.ligaDB.add('sites', {name:'Сохранённый объект', status:1})")
        assert legacy_site_id

        page.evaluate("window.app.switchDataProfile('work')")
        page.wait_for_function("window.ligaDB && window.ligaDB.profileMode === 'work'")
        assert page.evaluate("window.ligaDB.databaseName") == "LigaOS_DB_Work"
        assert page.evaluate("window.ligaDB.getAll('sites').then(sites => sites.length)") == 0
        assert page.locator("#empty-workspace-state").is_visible()
        assert page.locator("#dashboard-site-card").is_hidden()

        page.evaluate("window.app.switchDataProfile('demo')")
        page.wait_for_function("window.ligaDB && window.ligaDB.profileMode === 'demo'")
        assert page.evaluate("window.ligaDB.databaseName") == "LigaOS_DB_Demo"
        demo_count = page.evaluate("window.ligaDB.getAll('sites').then(sites => sites.length)")
        assert demo_count > 0

        page.evaluate("window.app.switchDataProfile('legacy')")
        page.wait_for_function("window.ligaDB && window.ligaDB.profileMode === 'legacy'")
        assert page.evaluate("id => window.ligaDB.get('sites', id)", legacy_site_id)["name"] == "Сохранённый объект"
        assert page.evaluate("window.ligaDB.getAll('sites').then(sites => sites.length)") == 1
        assert page.evaluate("indexedDB.databases().then(items => items.map(item => item.name).sort())") == ["LigaOS_DB", "LigaOS_DB_Demo", "LigaOS_DB_Work"]
        browser.close()


def test_empty_work_profile_card_keeps_clear_contrast_in_light_theme(app_url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852})
        page.goto(f"{app_url}/index.html?profile=work")
        page.wait_for_selector("#empty-workspace-state:visible")

        page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
        heading_color = page.locator("#empty-workspace-state h1").evaluate("el => getComputedStyle(el).color")
        description_color = page.locator("#empty-workspace-state p").evaluate("el => getComputedStyle(el).color")
        create_button = page.locator("#empty-workspace-state .btn-action")
        button_color = create_button.evaluate("el => getComputedStyle(el).color")
        button_background = create_button.evaluate("el => getComputedStyle(el).backgroundColor")

        assert heading_color == "rgb(248, 250, 252)"
        assert description_color == "rgb(203, 213, 225)"
        assert button_color == "rgb(23, 18, 10)"
        assert button_background != "rgb(255, 255, 255)"
        browser.close()
