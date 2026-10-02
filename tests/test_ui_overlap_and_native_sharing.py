"""Браузерные проверки выявленных перекрытий, печати и системной отправки."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_args):
        pass


def open_app(width=393, height=852):
    server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    Thread(target=server.serve_forever, daemon=True).start()
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=width < 600)
    page.goto(f"http://127.0.0.1:{server.server_address[1]}/", wait_until="domcontentloaded")
    page.wait_for_function("() => window.app && window.ligaSealEngine")
    return server, playwright, browser, page


def close_app(server, playwright, browser):
    browser.close()
    playwright.stop()
    server.shutdown()
    server.server_close()


def test_more_menu_overlay_covers_fixed_header_on_phone_and_desktop():
    for width, height in ((393, 852), (1440, 900)):
        server, playwright, browser, page = open_app(width, height)
        try:
            page.locator("#btn-more-menu-toggle").click()
            page.wait_for_selector("#modal-more-menu.open")
            layers = page.evaluate("""() => ({
              overlay: Number(getComputedStyle(document.querySelector('#modal-more-menu')).zIndex),
              header: Number(getComputedStyle(document.querySelector('.top-header')).zIndex),
              titleTop: document.querySelector('#modal-more-menu .modal-title').getBoundingClientRect().top,
              headerBottom: document.querySelector('.top-header').getBoundingClientRect().bottom
            })""")
            assert layers["overlay"] > layers["header"], layers
            assert layers["titleTop"] >= 0, layers
            assert layers["headerBottom"] > 0, layers
        finally:
            close_app(server, playwright, browser)


def test_demo_phone_notch_does_not_cover_screen_content():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.goto(f"http://127.0.0.1:{server.server_address[1]}/demo", wait_until="domcontentloaded")
        page.wait_for_function("() => document.querySelector('#active-screenshot').naturalWidth > 0")
        geometry = page.evaluate("""() => ({
          notchBottom: document.querySelector('.phone-notch').getBoundingClientRect().bottom,
          contentTop: document.querySelector('#active-screenshot').getBoundingClientRect().top
        })""")
        assert geometry["contentTop"] >= geometry["notchBottom"], geometry
    finally:
        close_app(server, playwright, browser)


def test_elite_stamp_preview_is_larger_and_uses_selected_style():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.locator("#btn-settings-top").click()
        page.wait_for_selector("#modal-settings.open")
        page.locator("#settings-section-seal").scroll_into_view_if_needed()
        page.locator("#select-master-stamp-style").select_option("elite_graphite_gold")
        seal = page.locator("#seal-live-preview-box svg.official-seal-svg")
        assert "elite_graphite_gold" in (seal.get_attribute("class") or "")
        assert float(seal.get_attribute("width")) == 158
        assert page.locator("#seal-live-preview-box .official-handwritten-signature").count() == 0
    finally:
        close_app(server, playwright, browser)


def test_share_helper_prefers_telegram_app_and_exposes_official_download_fallback():
    server, playwright, browser, page = open_app(393, 852)
    try:
        result = page.evaluate("""() => {
          return window.app.buildTelegramShareLinks('Проверьте этап', 'https://liga-master-uz.vercel.app/?share=v2.5.10');
        }""")
        assert result["app"].startswith("tg://msg_url?")
        params = parse_qs(urlsplit(result["app"]).query)
        assert params["text"] == ["Проверьте этап"]
        assert "share=v2.5.10" in params["url"][0]
        assert result["download"] == "https://telegram.org/apps"
    finally:
        close_app(server, playwright, browser)


def test_main_header_remains_visible_during_long_page_scroll():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.evaluate("window.scrollTo(0, 900)")
        page.wait_for_timeout(200)
        geometry = page.evaluate("""() => ({
          top: document.querySelector('.top-header').getBoundingClientRect().top,
          position: getComputedStyle(document.querySelector('.top-header')).position,
          ancestors: (() => { const rows = []; let node = document.querySelector('.top-header'); while (node) { const style = getComputedStyle(node); rows.push({name: node.tagName + (node.className ? '.' + String(node.className).split(' ')[0] : ''), position: style.position, overflowX: style.overflowX, overflowY: style.overflowY, top: node.getBoundingClientRect().top}); node = node.parentElement; } return rows; })()
        })""")
        assert abs(geometry["top"]) <= 1, geometry
    finally:
        close_app(server, playwright, browser)


def test_demo_phone_stays_beside_the_steps_when_scrolling_desktop_guide():
    server, playwright, browser, page = open_app(1440, 900)
    try:
        page.goto(f"http://127.0.0.1:{server.server_address[1]}/demo", wait_until="domcontentloaded")
        page.evaluate("window.scrollTo(0, 900)")
        page.wait_for_timeout(250)
        geometry = page.evaluate("""() => ({
          top: document.querySelector('.phone-container').getBoundingClientRect().top,
          position: getComputedStyle(document.querySelector('.phone-container')).position
        })""")
        assert geometry["position"] == "sticky", geometry
        assert 80 <= geometry["top"] <= 100, geometry
    finally:
        close_app(server, playwright, browser)


def test_demo_gold_action_button_stays_gold_and_readable_on_hover():
    server, playwright, browser, page = open_app(1440, 900)
    try:
        page.goto(f"http://127.0.0.1:{server.server_address[1]}/demo", wait_until="domcontentloaded")
        button = page.locator(".btn-action.btn-gold")
        button.hover()
        colors = button.evaluate("el => ({color: getComputedStyle(el).color, backgroundImage: getComputedStyle(el).backgroundImage})")
        assert colors["color"] == "rgb(11, 15, 25)", colors
        assert "linear-gradient" in colors["backgroundImage"], colors
    finally:
        close_app(server, playwright, browser)


def test_new_site_voice_fill_does_not_invent_client_phone_finances_or_deadline():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.evaluate("window.app.openModal('modal-add-site')")
        page.evaluate("window.app.applyVoiceToSiteForm('Самир, Чиланзар, 3-комнатная квартира')")
        fields = page.evaluate("""() => ({
          name: document.querySelector('#new-site-name').value,
          client: document.querySelector('#new-site-client').value,
          phone: document.querySelector('#new-site-phone').value,
          contract: document.querySelector('#new-site-contract').value,
          advance: document.querySelector('#new-site-advance').value,
          duration: document.querySelector('#new-site-duration').value
        })""")
        assert fields["name"]
        assert fields["client"] == "Самир"
        assert fields["phone"] == ""
        assert fields["contract"] == ""
        assert fields["advance"] == ""
        assert fields["duration"] == ""
    finally:
        close_app(server, playwright, browser)


def test_new_site_can_be_created_before_contract_and_contact_phone_are_known():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.evaluate("window.app.openModal('modal-add-site')")
        page.locator("#new-site-name").fill("ЖК Тестовый объект")
        page.locator("#new-site-client").fill("Тестовый заказчик")
        page.evaluate("window.app.handleCreateSite()")
        page.wait_for_function("() => window.app.currentSite && window.app.currentSite.name === 'ЖК Тестовый объект'")
        created = page.evaluate("""() => ({
          phone: window.app.currentSite.phone,
          contract: window.app.currentSite.contractSum,
          advance: window.app.currentSite.advanceSum,
          duration: window.app.currentSite.durationDays,
          pace: document.querySelector('#chrono-pace-badge').innerText,
          days: document.querySelector('#chrono-days-info').innerText
        })""")
        assert created["phone"] == ""
        assert created["contract"] == 0
        assert created["advance"] == 0
        assert created["duration"] is None
        assert "СРОК СДАЧИ НЕ ЗАДАН" in created["pace"]
        assert "Согласованный срок не указан" in created["days"]
    finally:
        close_app(server, playwright, browser)


def test_seal_has_six_clear_visual_finishes_without_texture_blur():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.locator("#btn-settings-top").click()
        page.locator("#settings-section-seal").scroll_into_view_if_needed()
        options = page.locator("#select-master-stamp-style option").count()
        page.locator("#select-master-stamp-style").select_option("emerald_platinum")
        details = page.locator("#seal-live-preview-box svg.official-seal-svg").evaluate("el => ({className: el.getAttribute('class'), filter: getComputedStyle(el).filter, turbulence: Boolean(el.querySelector('feTurbulence'))})")
        assert options == 6
        assert "emerald_platinum" in details["className"]
        assert details["filter"] == "none"
        assert details["turbulence"] is False
    finally:
        close_app(server, playwright, browser)


def test_receipt_confirmation_prepares_message_without_forging_local_finance_entry():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.goto(f"http://127.0.0.1:{server.server_address[1]}/?verify_receipt=R-TEST&emp=Рустам&amount=700000&site=Тестовый%20объект", wait_until="domcontentloaded")
        page.wait_for_selector("#modal-verify-receipt.open")
        result = page.evaluate("""async () => {
          const before = (await window.ligaDB.getAll('finances')).length;
          window.__preparedTelegram = null;
          window.app.openShareSheet = async (text, url, title) => {
            window.__preparedTelegram = { text, url, title };
            return true;
          };
          await window.app.signReceiptConfirmation();
          const after = (await window.ligaDB.getAll('finances')).length;
          return { before, after, payload: window.__preparedTelegram };
        }""")
        assert result["after"] == result["before"]
        assert "700" in result["payload"]["text"]
        assert "мастер должен проверить и сохранить её у себя" in result["payload"]["text"]
    finally:
        close_app(server, playwright, browser)


def test_incomplete_receipt_link_does_not_fill_fake_amount_or_object():
    server, playwright, browser, page = open_app(393, 852)
    try:
        page.goto(f"http://127.0.0.1:{server.server_address[1]}/?verify_receipt=R-INCOMPLETE", wait_until="domcontentloaded")
        page.wait_for_timeout(150)
        assert not page.locator("#modal-verify-receipt.open").count()
        assert page.evaluate("window.app.currentReceiptToVerify") is None
        assert "ссылка расписки неполная" in page.locator("#app-toast").inner_text().lower()
    finally:
        close_app(server, playwright, browser)
