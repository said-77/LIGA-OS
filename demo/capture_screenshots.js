/**
 * LIGA OS v2.4.7 — Automated Screenshot Capture Script
 * Делает серию скриншотов каждого экрана для демо-гида
 * Запуск: node demo/capture_screenshots.js
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36'
  });

  const page = await context.newPage();
  const outDir = path.join(__dirname);
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  console.log('🚀 Opening LIGA OS...');
  await page.goto('http://localhost:8765', { waitUntil: 'networkidle' });
  await delay(2000);

  // 1. Dashboard
  console.log('📸 01: Dashboard');
  await page.screenshot({ path: path.join(outDir, 'demo_01_dashboard.png'), fullPage: false });

  // 2. Scroll down dashboard to see site card
  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(500);
  console.log('📸 02: Dashboard - Site card');
  await page.screenshot({ path: path.join(outDir, 'demo_02_site_card.png'), fullPage: false });

  // 3. Scroll back up
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(500);

  // 4. Finances screen
  console.log('📸 03: Finances');
  await page.click('text=Финансы');
  await delay(1000);
  await page.screenshot({ path: path.join(outDir, 'demo_03_finances.png'), fullPage: false });

  // 5. Materials screen
  console.log('📸 04: Materials (Warehouse)');
  await page.click('text=Склад');
  await delay(1000);
  await page.screenshot({ path: path.join(outDir, 'demo_04_materials.png'), fullPage: false });

  // 6. Checklist screen
  console.log('📸 05: Quality Control');
  await page.click('text=Контроль');
  await delay(1000);
  await page.screenshot({ path: path.join(outDir, 'demo_05_checklist.png'), fullPage: false });

  // 7. Estimate screen
  console.log('📸 06: Express Estimate');
  await page.click('text=Смета');
  await delay(1000);
  await page.screenshot({ path: path.join(outDir, 'demo_06_estimate.png'), fullPage: false });

  // 8. History screen
  console.log('📸 07: History');
  await page.click('text=История');
  await delay(1000);
  await page.screenshot({ path: path.join(outDir, 'demo_07_history.png'), fullPage: false });

  // 9. Back to dashboard, open More Menu
  console.log('📸 08: More Menu');
  await page.click('text=Объекты');
  await delay(500);
  const menuBtn = await page.$('text=⋯ Меню');
  if (menuBtn) {
    await menuBtn.click();
    await delay(800);
    await page.screenshot({ path: path.join(outDir, 'demo_08_more_menu.png'), fullPage: false });
    // Close menu
    await page.click('text=⋯ Закрыть');
    await delay(500);
  }

  // 10. Settings
  console.log('📸 09: Settings');
  const settingsBtn = await page.$('#btn-open-settings');
  if (settingsBtn) {
    await settingsBtn.click();
    await delay(1000);
    await page.screenshot({ path: path.join(outDir, 'demo_09_settings.png'), fullPage: false });

    // Scroll down in settings to see seal preview
    await page.evaluate(() => {
      const modal = document.querySelector('#modal-settings .modal-sheet');
      if (modal) modal.scrollBy(0, 600);
    });
    await delay(500);
    console.log('📸 10: Seal & Signature settings');
    await page.screenshot({ path: path.join(outDir, 'demo_10_seal_settings.png'), fullPage: false });

    // Scroll more to see signature pad
    await page.evaluate(() => {
      const modal = document.querySelector('#modal-settings .modal-sheet');
      if (modal) modal.scrollBy(0, 600);
    });
    await delay(500);
    console.log('📸 11: Signature Pad');
    await page.screenshot({ path: path.join(outDir, 'demo_11_signature_pad.png'), fullPage: false });

    // Close settings
    await page.keyboard.press('Escape');
    await delay(500);
  }

  // 11. Header buttons closeup
  console.log('📸 12: Header buttons');
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(300);
  await page.screenshot({ path: path.join(outDir, 'demo_12_header.png'), fullPage: false, clip: { x: 0, y: 0, width: 412, height: 140 } });

  // 12. Desktop view (wide)
  console.log('📸 13: Desktop view');
  await page.setViewportSize({ width: 1280, height: 800 });
  await delay(1000);
  await page.click('text=Объекты');
  await delay(500);
  await page.screenshot({ path: path.join(outDir, 'demo_13_desktop.png'), fullPage: false });

  // Back to mobile
  await page.setViewportSize({ width: 412, height: 915 });
  await delay(500);

  console.log('✅ All screenshots captured!');
  await browser.close();
})();
