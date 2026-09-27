# -*- coding: utf-8 -*-
import os
from playwright.sync_api import sync_playwright

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    index_path = os.path.join(project_root, "index.html")
    file_url = "file:///" + index_path.replace("\\", "/")

    artifacts_dir = r"C:\Users\Admin\.gemini\antigravity\brain\4edf7a96-61be-4326-a9ad-2ef298bcbb5e"
    screenshots_dir = os.path.join(project_root, "screenshots")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1000, "height": 1300})
        page = context.new_page()
        page.goto(file_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(600)

        # Вызываем генерацию HTML акта и рендерим в отдельной вкладке
        act_html = page.evaluate("""() => {
            const mockPhoto = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="%231e293b"/><text x="100" y="80" fill="%23ffd175" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">16.0 BAR VERIFIED</text></svg>';
            const site = {
                id: '01',
                name: 'ЖК Mirabad Avenue',
                unit: 'кв. 142',
                client: 'Самир',
                status: 3,
                pressTestPassed: true,
                pressureTest: {
                    pressureBar: 16.0,
                    startDate: '2026-09-27',
                    startTime: '10:00',
                    endDate: '2026-09-28',
                    endTime: '10:00',
                    durationHours: 24,
                    notes: 'Падение давления 0.00 бар за 24 часа. Трассы монолитны, протечек нет.',
                    photo: mockPhoto
                }
            };
            const photos = { pressure: mockPhoto };

            let capturedHtml = '';
            const origOpen = window.open;
            window.open = function(url, target) {
                return {
                    document: {
                        open: function() {},
                        write: function(html) { capturedHtml = html; },
                        close: function() {}
                    }
                };
            };
            window.ligaPdfEngine.generatePressureAct(site, photos);
            window.open = origOpen;
            return capturedHtml;
        }""")

        if act_html:
            act_page = context.new_page()
            act_page.set_content(act_html)
            act_page.wait_for_timeout(400)
            shot_path = os.path.join(artifacts_dir, "screenshot_v245_pressure_act_with_seal.png")
            act_page.screenshot(path=shot_path, full_page=True)
            act_page.screenshot(path=os.path.join(screenshots_dir, "screenshot_v245_pressure_act_with_seal.png"), full_page=True)
            act_page.close()
            print("[OK] Pressure Act HTML successfully captured and saved!")
        else:
            print("[WARN] act_html is empty!")

        browser.close()

if __name__ == "__main__":
    main()
