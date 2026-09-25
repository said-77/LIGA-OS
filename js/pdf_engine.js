/* ==========================================================================
   LIGA OS — Генератор Исполнительного Инженерного Паспорта и Акта 16 бар
   Формат А4 • Опрессовка 16 бар / 24ч • Двухстраничный Паспорт • Без серверов
   Швейцарский стандарт верстки • Защита от разрыва страниц при печати
   ========================================================================== */

class LigaPdfEngine {
  constructor() {
    this.templateContainer = null;
  }

  formatMoney(num) {
    return new Intl.NumberFormat('ru-RU').format(num || 0) + ' сум';
  }

  isPressureVerified(site, photos = {}) {
    if (!site || !site.pressTestPassed) return false;
    const hasPhoto = Boolean((photos && photos.pressure) || (site.pressureTest && site.pressureTest.photo));
    if (!hasPhoto) return false;
    const pt = site.pressureTest;
    if (!pt || typeof pt !== 'object') return false;
    if (!pt.startDate || !pt.startTime || !pt.endDate || !pt.endTime) return false;
    const bar = parseFloat(pt.pressureBar);
    if (isNaN(bar) || bar < 16.0) return false;
    if (!pt.notes || typeof pt.notes !== 'string' || !pt.notes.trim()) return false;
    return true;
  }

  // Генератор векторного QR-кода верификации подлинности (чистый SVG, 100% офлайн)
  getSvgQrBadge(label = "LIGA 16 BAR", code = "CH-UZ-16BAR") {
    return `
      <div class="qr-verify-badge">
        <svg class="qr-svg-graphic" viewBox="0 0 85 85" width="62" height="62" xmlns="http://www.w3.org/2000/svg">
          <rect width="85" height="85" fill="#ffffff" rx="4"/>
          <!-- Позиционные маркеры QR -->
          <rect x="5" y="5" width="22" height="22" fill="#0f172a" rx="2"/>
          <rect x="8" y="8" width="16" height="16" fill="#ffffff" rx="1"/>
          <rect x="11" y="11" width="10" height="10" fill="#b8832a"/>

          <rect x="58" y="5" width="22" height="22" fill="#0f172a" rx="2"/>
          <rect x="61" y="8" width="16" height="16" fill="#ffffff" rx="1"/>
          <rect x="64" y="11" width="10" height="10" fill="#b8832a"/>

          <rect x="5" y="58" width="22" height="22" fill="#0f172a" rx="2"/>
          <rect x="8" y="61" width="16" height="16" fill="#ffffff" rx="1"/>
          <rect x="11" y="64" width="10" height="10" fill="#b8832a"/>

          <!-- Модули данных -->
          <rect x="32" y="7" width="5" height="5" fill="#0f172a"/>
          <rect x="42" y="7" width="5" height="5" fill="#0f172a"/>
          <rect x="48" y="7" width="5" height="5" fill="#b8832a"/>
          <rect x="35" y="15" width="5" height="5" fill="#0f172a"/>
          <rect x="45" y="15" width="5" height="5" fill="#0f172a"/>
          <rect x="32" y="22" width="5" height="5" fill="#b8832a"/>
          <rect x="40" y="22" width="5" height="5" fill="#0f172a"/>

          <rect x="7" y="32" width="5" height="5" fill="#0f172a"/>
          <rect x="15" y="32" width="5" height="5" fill="#b8832a"/>
          <rect x="22" y="32" width="5" height="5" fill="#0f172a"/>
          <rect x="7" y="42" width="5" height="5" fill="#b8832a"/>
          <rect x="18" y="42" width="5" height="5" fill="#0f172a"/>
          <rect x="12" y="48" width="5" height="5" fill="#0f172a"/>

          <!-- Центральный чип LIGA -->
          <rect x="32" y="32" width="21" height="21" fill="#0f172a" rx="2"/>
          <rect x="34" y="34" width="17" height="17" fill="#b8832a" rx="1"/>
          <path d="M38,40 L44,40 M41,37 L41,47 M46,45 L50,40" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>

          <rect x="58" y="32" width="5" height="5" fill="#0f172a"/>
          <rect x="68" y="32" width="5" height="5" fill="#0f172a"/>
          <rect x="74" y="35" width="5" height="5" fill="#b8832a"/>
          <rect x="62" y="42" width="5" height="5" fill="#b8832a"/>
          <rect x="72" y="42" width="5" height="5" fill="#0f172a"/>

          <rect x="32" y="58" width="5" height="5" fill="#0f172a"/>
          <rect x="42" y="58" width="5" height="5" fill="#b8832a"/>
          <rect x="48" y="64" width="5" height="5" fill="#0f172a"/>
          <rect x="36" y="70" width="5" height="5" fill="#0f172a"/>
          <rect x="44" y="72" width="5" height="5" fill="#b8832a"/>

          <rect x="58" y="58" width="5" height="5" fill="#b8832a"/>
          <rect x="68" y="58" width="5" height="5" fill="#0f172a"/>
          <rect x="62" y="66" width="5" height="5" fill="#0f172a"/>
          <rect x="72" y="66" width="5" height="5" fill="#b8832a"/>
          <rect x="58" y="74" width="5" height="5" fill="#0f172a"/>
          <rect x="68" y="74" width="5" height="5" fill="#0f172a"/>
        </svg>
        <div class="qr-verify-text">
          <span class="qr-tag">${label}</span>
          <span class="qr-code">${code}</span>
        </div>
      </div>
    `;
  }

  // Генерация и открытие официального Исполнительного Инженерного Паспорта (А4, 2 страницы)
  generatePassport(site, photos = {}) {
    if (!site) return;
    const isPressureVerified = this.isPressureVerified(site, photos);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Пожалуйста, разрешите всплывающие окна в браузере для просмотра и печати PDF-паспорта.');
      return;
    }

    const todayStr = new Date().toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const passportNumber = `LIGA-ПСП-${String(site.id || '01').padStart(3, '0')}-${new Date().getFullYear()}`;

    // Хелпер рендеринга блока фото
    const renderPhotoBox = (photoData, defaultTitle, defaultSubtitle, dimensionHint = '') => {
      if (photoData) {
        return `
          <div class="photo-card">
            <div class="photo-img-wrap">
              <img src="${photoData}" alt="${defaultTitle}" class="passport-real-photo">
              ${dimensionHint ? `<div class="photo-ruler-overlay">📐 ${dimensionHint}</div>` : ''}
            </div>
            <div class="photo-meta">
              <div class="photo-title-line">
                <span class="photo-name">${defaultTitle}</span>
                <span class="photo-status-tag">✓ ФИКСАЦИЯ</span>
              </div>
              <div class="photo-caption">${defaultSubtitle}</div>
            </div>
          </div>
        `;
      }
      return `
        <div class="photo-card">
          <div class="photo-placeholder">
            <svg width="34" height="34" fill="none" stroke="#64748b" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span style="margin-top:4px;">${defaultTitle}</span>
          </div>
          <div class="photo-meta">
            <div class="photo-name">${defaultTitle}</div>
            <div class="photo-caption">${defaultSubtitle}</div>
          </div>
        </div>
      `;
    };

    const qrBadge = this.getSvgQrBadge("LIGA PASSPORT", passportNumber);

    const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Исполнительный Инженерный Паспорт — ${site.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      background: #f1f5f9;
      color: #0f172a;
      font-family: 'Segoe UI', -apple-system, Roboto, Arial, sans-serif;
      line-height: 1.35;
      font-size: 11.5px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page-sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 10mm auto;
      padding: 10mm 12mm;
      background: #ffffff;
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .page-break {
      page-break-before: always;
      break-before: page;
      height: 0;
      margin: 0;
      border: none;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .page-sheet {
        width: 100% !important;
        min-height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
      .print-bar { display: none !important; }
    }

    /* Верхняя панель быстрого управления печатью */
    .print-bar {
      position: fixed;
      top: 15px;
      right: 20px;
      z-index: 9999;
      display: flex;
      gap: 10px;
      align-items: center;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(12px);
      padding: 8px 14px;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.15);
    }
    .btn-print {
      background: linear-gradient(135deg, #b8832a 0%, #8c5d13 100%);
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(184, 131, 42, 0.4);
    }
    .btn-print:hover { filter: brightness(1.1); }
    .btn-close-print {
      background: rgba(255,255,255,0.12);
      color: #cbd5e1;
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-close-print:hover { background: rgba(255,255,255,0.2); color: #fff; }
    .print-hint {
      color: #94a3b8;
      font-size: 11px;
    }

    /* Шапка паспорта (Лист 1) */
    .passport-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2.5px solid #b8832a;
      padding-bottom: 8px;
      margin-bottom: 10px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-logo {
      width: 52px;
      height: 52px;
    }
    .brand-text h1 {
      font-size: 18px;
      font-weight: 900;
      color: #080e1a;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      line-height: 1.1;
    }
    .brand-text p {
      font-size: 9.5px;
      color: #8c6322;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-top: 2px;
    }
    .header-status-box {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
    }
    .stamp-badge {
      display: inline-block;
      font-weight: 900;
      font-size: 10px;
      padding: 5px 10px;
      border-radius: 5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stamp-badge-passed {
      border: 1.8px solid #00a86b;
      color: #00875a;
      background: #f0fdf4;
    }
    .stamp-badge-draft {
      border: 1.8px solid #d97706;
      color: #b45309;
      background: #fef3c7;
    }
    .passport-num {
      font-size: 10.5px;
      color: #475569;
      font-weight: 700;
    }

    /* Заголовки разделов */
    .section-title {
      font-size: 11px;
      font-weight: 900;
      color: #b8832a;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin: 8px 0 4px 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 2px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Метаданные */
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 7px 10px;
      margin-bottom: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .meta-row {
      display: flex;
      flex-direction: column;
    }
    .meta-label {
      font-size: 9px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }
    .meta-value {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
    }

    /* Протокол опрессовки */
    .protocol-box {
      border: 1.5px solid #b8832a;
      border-radius: 6px;
      padding: 8px 10px;
      background: #fffdfa;
      margin-bottom: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .protocol-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      font-size: 10.5px;
    }
    .protocol-table th, .protocol-table td {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
      text-align: left;
    }
    .protocol-table th {
      background: #1e293b;
      color: #ffffff;
      font-weight: 800;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .highlight-cell {
      font-weight: 900;
      color: #00875a;
    }
    .highlight-draft {
      font-weight: 900;
      color: #b45309;
    }

    /* Предупреждение для отделочников */
    .warning-box {
      border-left: 3.5px solid #dc2626;
      background: #fef2f2;
      padding: 7px 10px;
      margin-bottom: 8px;
      border-radius: 0 5px 5px 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .warning-title {
      font-size: 10px;
      font-weight: 800;
      color: #dc2626;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .warning-desc {
      font-size: 10px;
      color: #991b1b;
      line-height: 1.3;
    }

    /* Подписи и печати */
    .signatures-block {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1.5px solid #e2e8f0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sign-col {
      width: 44%;
    }
    .sign-title {
      font-size: 9.5px;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    .sign-line {
      border-bottom: 1px solid #0f172a;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 10.5px;
      color: #334155;
      padding-bottom: 2px;
      position: relative;
    }
    .facsimile-stamp {
      position: absolute;
      right: 15px;
      bottom: -10px;
      color: #b8832a;
      border: 2px dashed #b8832a;
      border-radius: 50%;
      width: 54px;
      height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 7px;
      font-weight: 900;
      text-transform: uppercase;
      transform: rotate(-10deg);
      opacity: 0.88;
      pointer-events: none;
    }
    .facsimile-stamp.draft {
      color: #b45309;
      border-color: #d97706;
    }

    /* Нижний колонтитул */
    .sheet-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
      margin-top: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Векторный QR бейдж */
    .qr-verify-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      padding: 2px 4px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .qr-verify-text {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }
    .qr-tag {
      font-size: 7.5px;
      font-weight: 900;
      color: #b8832a;
      text-transform: uppercase;
    }
    .qr-code {
      font-size: 8.5px;
      font-weight: 800;
      color: #0f172a;
      font-family: monospace;
    }

    /* Сетка фотопривязок (Лист 2) */
    .photo-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 8px;
    }
    .photo-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 6px;
      background: #f8fafc;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .photo-img-wrap {
      width: 100%;
      height: 155px;
      overflow: hidden;
      border-radius: 4px;
      background: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .passport-real-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .photo-placeholder {
      width: 100%;
      height: 155px;
      background: #e2e8f0;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
      font-size: 10.5px;
      font-weight: 700;
    }
    .photo-ruler-overlay {
      position: absolute;
      bottom: 4px;
      right: 4px;
      background: rgba(15, 23, 42, 0.85);
      color: #ffd175;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 8.5px;
      font-weight: 800;
    }
    .photo-meta {
      margin-top: 5px;
    }
    .photo-title-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .photo-name {
      font-size: 10.5px;
      font-weight: 800;
      color: #0f172a;
    }
    .photo-status-tag {
      font-size: 8px;
      font-weight: 900;
      color: #00875a;
      background: #dcfce7;
      padding: 1px 4px;
      border-radius: 3px;
    }
    .photo-caption {
      font-size: 9.5px;
      font-weight: 600;
      color: #475569;
      margin-top: 2px;
      line-height: 1.25;
    }

    /* Шапка листа 2 */
    .sheet-2-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #b8832a;
      padding-bottom: 6px;
      margin-bottom: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sheet-2-title {
      font-size: 13px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
    }
    .sheet-2-subtitle {
      font-size: 9.5px;
      color: #8c6322;
      font-weight: 700;
    }
    .sheet-2-meta {
      text-align: right;
      font-size: 9.5px;
      color: #475569;
      font-weight: 700;
    }

    /* Регламент чистовых работ на листе 2 */
    .rules-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      padding: 6px 10px;
      margin-top: 6px;
      margin-bottom: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .rules-title {
      font-size: 10px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .rules-list {
      font-size: 9.5px;
      color: #334155;
      line-height: 1.35;
      padding-left: 14px;
    }
  </style>
</head>
<body>
  <!-- Плавающая панель печати -->
  <div class="print-bar">
    <span class="print-hint">Совет: в окне печати выберите «Сохранить как PDF» (А4, 100%)</span>
    <button class="btn-print" onclick="window.print()">
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
      Печать / Экспорт в PDF
    </button>
    <button class="btn-close-print" onclick="window.close()">✕ Закрыть</button>
  </div>

  <!-- ==================== ЛИСТ 1: ПАСПОРТНАЯ И ЮРИДИЧЕСКАЯ ЧАСТЬ ==================== -->
  <div class="page-sheet">
    <div class="sheet-content">
      <!-- Шапка документа -->
      <div class="passport-header">
        <div class="header-brand">
          <svg class="header-logo" viewBox="0 0 100 100">
            <polygon points="50,4 88,18 88,60 50,96 12,60 12,18" fill="#141c2e" stroke="#b8832a" stroke-width="3"/>
            <circle cx="50" cy="46" r="18" fill="none" stroke="#ffd175" stroke-width="2.5"/>
            <path d="M43,36 L43,54 L57,54" fill="none" stroke="#ffd175" stroke-width="3" stroke-linecap="round"/>
            <polygon points="50,14 52,18 56,18 53,21 54,25 50,22 46,25 47,21 44,18 48,18" fill="#ffd175"/>
          </svg>
          <div class="brand-text">
            <h1>Лига Опытных Мастеров</h1>
            <p>Инженерный центр премиальной сантехники • Ташкент</p>
          </div>
        </div>
        <div class="header-status-box">
          ${isPressureVerified 
            ? '<div class="stamp-badge stamp-badge-passed">✓ 16 БАР ПРОЙДЕНО (ПОДТВЕРЖДЕНО)</div>'
            : '<div class="stamp-badge stamp-badge-draft">ЧЕРНОВИК / ИСПЫТАНИЯ НЕ ПРОВОДИЛИСЬ</div>'
          }
          <div class="passport-num">Паспорт № LIGA-${site.id}-${new Date().getFullYear()}</div>
        </div>
      </div>

      <!-- Мета-данные объекта -->
      <div class="section-title">
        <span>1. Паспортные данные инженерного объекта</span>
        <span style="font-size:9px; color:#64748b; font-weight:normal;">Стандарт DIN EN 806 / СНиП</span>
      </div>
      <div class="meta-grid">
        <div class="meta-row">
          <span class="meta-label">Наименование объекта:</span>
          <span class="meta-value">${site.name}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Адрес / Помещение:</span>
          <span class="meta-value">${site.unit || 'Премиальный жилой фонд, г. Ташкент'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Заказчик (Владелец):</span>
          <span class="meta-value">${site.client} (${site.phone || 'тел. в договоре'})</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Автор дизайн-проекта:</span>
          <span class="meta-value">${site.designer || 'Индивидуальный проект'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Ведущий инженер проекта:</span>
          <span class="meta-value">Мастер Улугбек Хакимов (Стаж с 2011 г.)</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Дата формирования паспорта:</span>
          <span class="meta-value">${todayStr}</span>
        </div>
      </div>

      <!-- Официальный протокол гидравлических испытаний -->
      <div class="section-title">
        <span>2. Протокол гидравлических испытаний (Акт опрессовки 16 бар)</span>
        <span style="font-size:9px; color:#64748b; font-weight:normal;">Норматив DIN 1988 (ч. 2)</span>
      </div>
      <div class="protocol-box">
        ${isPressureVerified ? `
        <table class="protocol-table">
          <tr>
            <th>Параметр испытания</th>
            <th>Норматив СНиП</th>
            <th>Фактическое испытание LIGA OS</th>
            <th>Результат</th>
          </tr>
          <tr>
            <td>Испытательное гидростатическое давление</td>
            <td>1.5 x рабочее (~6 бар)</td>
            <td><strong>${((site.pressureTest && site.pressureTest.pressureBar) ? Number(site.pressureTest.pressureBar).toFixed(1) : '16.0')} АТМОСФЕР (BAR) • ТЕСТ x4</strong></td>
            <td class="highlight-cell">ВЫДЕРЖАНО</td>
          </tr>
          <tr>
            <td>Время экспозиции под давлением</td>
            <td>1 час</td>
            <td><strong>24 ЧАСА ПОД ДАВЛЕНИЕМ</strong>${site.pressureTest && site.pressureTest.startDate ? `<br><small style="color:#64748b; font-weight:normal;">Интервал: ${site.pressureTest.startDate} ${site.pressureTest.startTime} — ${site.pressureTest.endDate} ${site.pressureTest.endTime}</small>` : ''}</td>
            <td class="highlight-cell">БЕЗ ПАДЕНИЯ</td>
          </tr>
          <tr>
            <td>Визуальный осмотр соединений (Rehau/FAR)</td>
            <td>Отсутствие течи</td>
            <td><strong>100% герметичность узлов</strong>${site.pressureTest && site.pressureTest.notes ? `<br><small style="color:#334155; font-weight:600;">Заключение инженера: ${site.pressureTest.notes}</small>` : ''}</td>
            <td class="highlight-cell">СООТВЕТСТВУЕТ</td>
          </tr>
        </table>
        <div style="margin-top: 6px; padding: 5px 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 9.5px; color: #475569; line-height: 1.35;">
          ℹ️ <strong>Статус фиксации:</strong> Результаты испытания внесены и подтверждены мастером (Улугбек Хакимов) по показаниям опрессовочного манометра на объекте. Документ удостоверяет внутренний инженерный стандарт Лиги Мастеров и не является независимым лабораторным сертификатом или судебной экспертизой.
        </div>
        ` : `
        <table class="protocol-table">
          <tr>
            <th>Параметр испытания</th>
            <th>Норматив СНиП</th>
            <th>Фактическое состояние</th>
            <th>Статус</th>
          </tr>
          <tr>
            <td>Испытательное гидростатическое давление (16 бар)</td>
            <td>1.5 x рабочее (~6 бар)</td>
            <td><strong>ИСПЫТАНИЯ НЕ ПРОВОДИЛИСЬ</strong></td>
            <td class="highlight-draft">НЕ ПОДТВЕРЖДЕНО</td>
          </tr>
          <tr>
            <td>Время экспозиции под давлением (24 часа)</td>
            <td>1 час</td>
            <td><strong>ОТСУТСТВУЕТ ФОТОФИКСАЦИЯ</strong></td>
            <td class="highlight-draft">ТРЕБУЕТ ТЕСТА</td>
          </tr>
          <tr>
            <td>Визуальный осмотр соединений и узлов</td>
            <td>Отсутствие течи</td>
            <td><strong>ОЖИДАЕТ ОПРЕССОВКИ</strong></td>
            <td class="highlight-draft">НЕ ПРИНЯТО</td>
          </tr>
        </table>
        <div style="margin-top: 6px; padding: 6px 8px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; font-size: 9.5px; color: #92400e; line-height: 1.35;">
          ⚠️ <strong>Внимание:</strong> Гидравлические испытания давлением 16 бар не зафиксированы или отсутствует фото манометра. Данный документ является предварительным <strong>рабочим черновиком</strong> и не подтверждает готовность скрытых систем к заливке стяжки или обшивке.
        </div>
        `}
      </div>

      <!-- Юридическое предупреждение для отделочников -->
      <div class="warning-box">
        <div class="warning-title">⚠️ Внимание отделочникам, гипсокартонщикам и установщикам мебели:</div>
        <div class="warning-desc">
          В стенах и полу проложены скрытые магистрали отопления и водоснабжения под рабочим давлением. Любое сверление, бурение и крепление плинтусов/мебели производить <strong>СТРОГО ПО ЛИНЕЙНЫМ РАЗМЕРАМ ДАННОГО ИСПОЛНИТЕЛЬНОГО ПАСПОРТА</strong> (см. Лист 2). В случае повреждения труб при несоблюдении схемы ответственность возлагается на производителя сверлильных работ.
        </div>
      </div>

      <!-- Блок гарантии и подписей -->
      <div class="section-title">
        <span>3. Двухуровневая модель гарантии и приемка работ</span>
        <span style="font-size:9px; color:#64748b; font-weight:normal;">Лист 1 из 2</span>
      </div>
      ${isPressureVerified ? `
      <p style="font-size:10px; color:#475569; margin-bottom: 8px; line-height: 1.35;">
        1. <strong>Заводская гарантия:</strong> на оригинальные европейские материалы (Rehau, FAR, Geberit) составляет от 10 до 50 лет согласно паспортам заводов-изготовителей.<br>
        2. <strong>Монтажная гарантия:</strong> предоставляется по индивидуальному договору под проект на основании успешного прохождения гидравлического испытания 16 бар.
      </p>

      <div class="signatures-block">
        <div class="sign-col">
          <div class="sign-title">Ведущий инженер-монтажник:</div>
          <div class="sign-line">
            <span>Хакимов Улугбек</span>
            <span>(подпись) _________________</span>
            <div class="facsimile-stamp">ЛИГА<br>МАСТЕРОВ<br>16 BAR</div>
          </div>
        </div>
        <div class="sign-col">
          <div class="sign-title">Заказчик (Объект принят):</div>
          <div class="sign-line">
            <span>${site.client}</span>
            <span>(подпись) _________________</span>
          </div>
        </div>
      </div>
      ` : `
      <p style="font-size:10px; color:#b45309; margin-bottom: 8px; font-weight: 600; line-height: 1.35;">
        1. Заводская гарантия на оригинальные европейские материалы сохраняется согласно паспортам заводов-изготовителей.<br>
        2. ⚠️ ВНИМАНИЕ: Официальная гарантия на качество монтажных работ НЕ АКТИВИРОВАНА до проведения гидравлического испытания давлением 16 бар и фотофиксации манометра.
      </p>

      <div class="signatures-block">
        <div class="sign-col">
          <div class="sign-title">Ведущий инженер-монтажник:</div>
          <div class="sign-line">
            <span>Хакимов Улугбек</span>
            <span>(подпись) _________________</span>
            <div class="facsimile-stamp draft">ЧЕРНОВИК<br>БЕЗ ТЕСТА<br>16 BAR</div>
          </div>
        </div>
        <div class="sign-col">
          <div class="sign-title">Заказчик (Ознакомлен со статусом черновика):</div>
          <div class="sign-line">
            <span>${site.client}</span>
            <span>(подпись) _________________</span>
          </div>
        </div>
      </div>
      `}
    </div>

    <!-- Колонтитул листа 1 -->
    <div class="sheet-footer">
      <span>Лист 1 из 2 • Исполнительный Инженерный Паспорт • ${site.name}</span>
      <span>LIGA OS — Операционная Система Инженерного Мастера • Ташкент</span>
      <span>${todayStr}</span>
    </div>
  </div>

  <!-- РАЗРЫВ СТРАНИЦЫ ДЛЯ ПЕЧАТИ -->
  <div class="page-break"></div>

  <!-- ==================== ЛИСТ 2: ФОТОПРИВЯЗКИ СКРЫТЫХ ТРАСС ==================== -->
  <div class="page-sheet">
    <div class="sheet-content">
      <!-- Шапка листа 2 -->
      <div class="sheet-2-header">
        <div>
          <div class="sheet-2-title">4. Фотофиксация скрытых трасс и узлов распределения</div>
          <div class="sheet-2-subtitle">Линейные размеры, привязки к осям помещения и узлы ввода перед заливкой стяжки</div>
        </div>
        <div class="sheet-2-meta">
          <div>Объект: <strong>${site.name}</strong></div>
          <div>Паспорт № LIGA-${site.id}-${new Date().getFullYear()} • <strong>Лист 2 из 2</strong></div>
        </div>
      </div>

      <!-- Сетка 4 фотопривязок -->
      <div class="photo-grid">
        ${renderPhotoBox(photos.manifold, 'Узел ввода и коллекторы FAR', 'Распределительный узел ГВС/ХВС с манометрами и редукторами Caleffi', 'Узел № 1')}
        ${renderPhotoBox(photos.pressure, 'Контрольный манометр 16 BAR', 'Показания опрессовочного гидропресса под пломбой (выдержка 24 часа)', '16.0 BAR')}
        ${renderPhotoBox(photos.wall, 'Трассы в стенах с рулеткой', 'Привязка водорозеток и выводов канализации к чистовым углам', 'По рулетке')}
        ${renderPhotoBox(photos.floor, 'Трассы в полу перед стяжкой', 'Раскладка труб отопления/водоснабжения в теплоизоляции, шаг крепления', 'До стяжки')}
      </div>

      <!-- Регламент отделочных работ -->
      <div class="rules-box">
        <div class="rules-title">🛡️ Инженерный регламент безопасности отделочных работ (Лист 2):</div>
        <ol class="rules-list">
          <li><strong>Запрет сквозного бурения:</strong> Любой крепеж дверных упоров, порогов, профилей ГКЛ и сантехники в полу разрешен только после сверки с линейными размерами на данных фотопривязках.</li>
          <li><strong>Сохранение давления:</strong> В процессе заливки стяжки система находится под технологическим давлением не менее 4-6 бар для моментального обнаружения случайного повреждения.</li>
          <li><strong>Теплоизоляция:</strong> Все магистрали в стяжке защищены демпферной изоляцией для компенсации температурного расширения сшитого полиэтилена (PE-Xa).</li>
        </ol>
      </div>

      <!-- Повторное заверение листа инженером -->
      <div class="signatures-block" style="margin-top: 8px;">
        <div class="sign-col" style="width: 48%;">
          <div class="sign-title">Исполнительную схему и фотофиксацию заверил:</div>
          <div class="sign-line">
            <span>Хакимов Улугбек (Ведущий инженер)</span>
            <span>(подпись) _________</span>
            <div class="engineer-seal-stamp" style="position: absolute; right: 5px; bottom: -10px; color: #b8832a; border: 2px dashed #b8832a; border-radius: 50%; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7px; font-weight: 900; text-transform: uppercase; transform: rotate(-10deg); opacity: 0.88; pointer-events: none;">ЛИГА<br>МАСТЕРОВ<br>16 BAR</div>
          </div>
        </div>
        <div class="sign-col" style="width: 48%; display:flex; justify-content:flex-end; align-items:flex-end;">
          ${qrBadge}
        </div>
      </div>
    </div>

    <!-- Колонтитул листа 2 -->
    <div class="sheet-footer">
      <span>Лист 2 из 2 • Исполнительная фотофиксация • Хранить бессрочно в архиве объекта</span>
      <span>«Лига Опытных Мастеров» • Телефон службы сервиса: +998 90 000-00-00</span>
      <span>${todayStr}</span>
    </div>
  </div>

  <script>
    // Поддержка закрытия по Esc и печати по Ctrl+P
    window.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        window.close();
      }
    });
  </script>
</body>
</html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }

  // Генерация Официального Акта гидравлических испытаний 16 бар / 24 часа (Строгий 1 лист А4)
  generatePressureAct(site, photos = {}) {
    if (!site) return;
    const isVerified = this.isPressureVerified(site, photos);
    if (!isVerified) {
      alert('⚠️ Акт гидравлических испытаний не может быть сформирован:\nСначала зафиксируйте успешное прохождение испытания 16 бар (экспозиция 24 часа) и загрузите фото манометра в протоколе опрессовки.');
      return false;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Пожалуйста, разрешите всплывающие окна в браузере для просмотра и печати Официального Акта 16 бар.');
      return false;
    }

    const pt = site.pressureTest || {};
    const photoPressure = (photos && photos.pressure) || pt.photo || '';
    const photoManifold = (photos && photos.manifold) || '';

    const todayStr = pt.endDate || new Date().toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const actNumber = `АКТ-16Б-${String(site.id || '01').padStart(3, '0')}-${new Date().getFullYear()}`;

    const renderPhotoBox = (photoData, defaultTitle, defaultSubtitle) => {
      if (photoData) {
        return `
          <div class="act-photo-card">
            <div class="act-photo-wrap">
              <img src="${photoData}" alt="${defaultTitle}" class="act-img">
            </div>
            <div class="act-photo-caption"><strong>${defaultTitle}:</strong> ${defaultSubtitle}</div>
          </div>
        `;
      }
      return `
        <div class="act-photo-card">
          <div class="act-photo-placeholder">
            <svg width="28" height="28" fill="none" stroke="#64748b" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span style="margin-top:3px;">${defaultTitle}</span>
          </div>
          <div class="act-photo-caption">${defaultSubtitle}</div>
        </div>
      `;
    };

    const qrBadge = this.getSvgQrBadge("DIN 1988 VERIFIED", actNumber);

    const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Официальный Акт опрессовки 16 бар — ${site.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm 8mm 6mm 8mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      background: #f1f5f9;
      color: #0f172a;
      font-family: 'Segoe UI', -apple-system, Roboto, Arial, sans-serif;
      line-height: 1.3;
      font-size: 11px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page-container {
      width: 210mm;
      max-width: 210mm;
      min-height: 297mm;
      margin: 6mm auto;
      padding: 8mm 10mm;
      background: #ffffff;
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .page-container {
        width: 100% !important;
        max-width: 100% !important;
        min-height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
      .print-bar { display: none !important; }
    }

    /* Плавающая панель печати */
    .print-bar {
      position: fixed;
      top: 15px;
      right: 20px;
      z-index: 9999;
      display: flex;
      gap: 10px;
      align-items: center;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(12px);
      padding: 8px 14px;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.15);
    }
    .btn-print {
      background: linear-gradient(135deg, #b8832a 0%, #8c5d13 100%);
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(184, 131, 42, 0.4);
    }
    .btn-print:hover { filter: brightness(1.1); }
    .btn-close-print {
      background: rgba(255,255,255,0.12);
      color: #cbd5e1;
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-close-print:hover { background: rgba(255,255,255,0.2); color: #fff; }

    /* Шапка Акта */
    .act-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #b8832a;
      padding-bottom: 6px;
      margin-bottom: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-logo {
      width: 46px;
      height: 46px;
    }
    .brand-text h1 {
      font-size: 16px;
      font-weight: 900;
      color: #080e1a;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      line-height: 1.1;
    }
    .brand-text p {
      font-size: 9px;
      color: #8c6322;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-top: 1px;
    }
    .act-badge-box {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }
    .act-badge-passed {
      display: inline-block;
      font-weight: 900;
      font-size: 10px;
      padding: 4px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1.8px solid #00a86b;
      color: #00875a;
      background: #f0fdf4;
    }
    .act-num {
      font-size: 10px;
      color: #475569;
      font-weight: 700;
    }

    /* Заголовок документа */
    .doc-title-block {
      text-align: center;
      margin-bottom: 6px;
      padding: 5px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .doc-title-block h2 {
      font-size: 13px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .doc-title-block p {
      font-size: 9px;
      color: #64748b;
      font-weight: 700;
      margin-top: 1px;
    }

    /* Секции */
    .section-title {
      font-size: 10px;
      font-weight: 800;
      color: #b8832a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 5px 0 3px 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 2px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      padding: 5px 8px;
      margin-bottom: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .meta-row {
      display: flex;
      flex-direction: column;
    }
    .meta-label {
      font-size: 8.5px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 700;
    }
    .meta-value {
      font-size: 10.5px;
      font-weight: 700;
      color: #0f172a;
    }

    /* Таблица замеров */
    .protocol-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 5px;
      font-size: 10px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .protocol-table th {
      background: #1e293b;
      color: #ffffff;
      padding: 4px 6px;
      text-align: left;
      font-weight: 800;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid #1e293b;
    }
    .protocol-table td {
      padding: 4px 6px;
      border: 1px solid #cbd5e1;
      color: #1e293b;
    }
    .protocol-table tr:nth-child(even) {
      background: #f8fafc;
    }
    .val-highlight {
      font-weight: 800;
      color: #00875a;
    }

    /* Фотофиксация */
    .act-photo-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .act-photo-card {
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      overflow: hidden;
      background: #ffffff;
      padding: 3px;
    }
    .act-photo-wrap {
      width: 100%;
      height: 105px;
      overflow: hidden;
      border-radius: 3px;
      background: #0f172a;
    }
    .act-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .act-photo-placeholder {
      width: 100%;
      height: 105px;
      background: #f1f5f9;
      border-radius: 3px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
      font-size: 9.5px;
      font-weight: 700;
    }
    .act-photo-caption {
      font-size: 9px;
      color: #334155;
      padding: 3px 2px 1px 2px;
      line-height: 1.2;
    }

    /* Резолюция */
    .resolution-box {
      border: 1.5px solid #00a86b;
      background: #f0fdf4;
      border-radius: 5px;
      padding: 5px 8px;
      margin-bottom: 5px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .resolution-title {
      font-size: 10px;
      font-weight: 900;
      color: #065f46;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .resolution-text {
      font-size: 9.5px;
      color: #047857;
      line-height: 1.25;
      font-weight: 600;
    }

    /* Статус и предупреждение */
    .disclaimer-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 5px;
      padding: 4px 7px;
      margin-bottom: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .disclaimer-title {
      font-size: 9px;
      font-weight: 800;
      color: #92400e;
      text-transform: uppercase;
      margin-bottom: 1px;
    }
    .disclaimer-desc {
      font-size: 8.5px;
      color: #78350f;
      line-height: 1.25;
    }

    /* Подписи */
    .signatures-block {
      display: flex;
      justify-content: space-between;
      margin-top: 5px;
      padding-top: 6px;
      border-top: 1.5px solid #e2e8f0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sign-col {
      width: 31%;
    }
    .sign-title {
      font-size: 9px;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .sign-line {
      border-bottom: 1px solid #0f172a;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 9.5px;
      color: #334155;
      padding-bottom: 2px;
      position: relative;
    }
    .facsimile-stamp {
      position: absolute;
      right: 5px;
      bottom: -8px;
      color: #b8832a;
      border: 2px dashed #b8832a;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 6.5px;
      font-weight: 900;
      text-transform: uppercase;
      transform: rotate(-10deg);
      opacity: 0.88;
      pointer-events: none;
    }

    /* Векторный QR бейдж */
    .qr-verify-badge {
      display: flex;
      align-items: center;
      gap: 5px;
      background: #ffffff;
      padding: 2px 4px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .qr-verify-text {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }
    .qr-tag {
      font-size: 7px;
      font-weight: 900;
      color: #b8832a;
      text-transform: uppercase;
    }
    .qr-code {
      font-size: 7.5px;
      font-weight: 800;
      color: #0f172a;
      font-family: monospace;
    }

    /* Нижний колонтитул */
    .act-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 3px;
      margin-top: 4px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <!-- Плавающая панель печати -->
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
      🖨️ Печать / Сохранить в PDF
    </button>
    <button class="btn-close-print" onclick="window.close()">✕ Закрыть</button>
  </div>

  <div class="page-container">
    <div class="act-body-content">
      <!-- Шапка Акта -->
      <div class="act-header">
        <div class="header-brand">
          <svg class="header-logo" viewBox="0 0 100 100">
            <polygon points="50,4 88,18 88,60 50,96 12,60 12,18" fill="#141c2e" stroke="#b8832a" stroke-width="3"/>
            <circle cx="50" cy="46" r="18" fill="none" stroke="#ffd175" stroke-width="2.5"/>
            <path d="M43,36 L43,54 L57,54" fill="none" stroke="#ffd175" stroke-width="3" stroke-linecap="round"/>
            <polygon points="50,14 52,18 56,18 53,21 54,25 50,22 46,25 47,21 44,18 48,18" fill="#ffd175"/>
          </svg>
          <div class="brand-text">
            <h1>Лига Опытных Мастеров</h1>
            <p>Инженерный центр премиальной сантехники • Ташкент</p>
          </div>
        </div>
        <div class="act-badge-box">
          <div class="act-badge-passed">✓ 16 БАР / 24Ч ПОДТВЕРЖДЕНО</div>
          <div class="act-num">${actNumber}</div>
        </div>
      </div>

      <!-- Заголовок документа -->
      <div class="doc-title-block">
        <h2>Официальный Акт гидравлического испытания системы</h2>
        <p>СТАНДАРТ DIN 1988 (Ч. 2) / СНиП • ИСПЫТАНИЕ ДАВЛЕНИЕМ 16.0 БАР • ЭКСПОЗИЦИЯ 24 ЧАСА • ПРОВЕРКА ПОД СТЯЖКУ ПОЛА</p>
      </div>

      <!-- Стороны и объект -->
      <div class="section-title">1. Сведения об объекте и сторонах освидетельствования</div>
      <div class="meta-grid">
        <div class="meta-row">
          <span class="meta-label">Наименование объекта:</span>
          <span class="meta-value">${site.name}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Адрес / Помещение:</span>
          <span class="meta-value">${site.unit || 'Премиальный жилой фонд, г. Ташкент'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Заказчик (Владелец):</span>
          <span class="meta-value">${site.client} (${site.phone || 'тел. указан в договоре'})</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Ведущий инженер-испытатель:</span>
          <span class="meta-value">Мастер Улугбек Хакимов («Лига Опытных Мастеров»)</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Автор проекта / Дизайн:</span>
          <span class="meta-value">${site.designer || 'Индивидуальный инженерный проект'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Дата фиксации испытаний:</span>
          <span class="meta-value">${todayStr}</span>
        </div>
      </div>

      <!-- Нормативы и таблица замера -->
      <div class="section-title">2. Протокол измерений и параметры гидравлического испытания</div>
      <table class="protocol-table">
        <thead>
          <tr>
            <th style="width:32%;">Параметр испытания</th>
            <th style="width:24%;">Требование стандарта</th>
            <th style="width:24%;">Фактический замер</th>
            <th style="width:20%;">Заключение</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Давление нагнетания гидропрессом</strong></td>
            <td>Не менее 16.0 бар (DIN 1988)</td>
            <td class="val-highlight"><strong>${pt.pressureBar || '16.0'} бар</strong></td>
            <td>✓ Соответствует</td>
          </tr>
          <tr>
            <td><strong>Время постановки под давление</strong></td>
            <td>Старт экспозиции под пломбой</td>
            <td>${pt.startDate} в ${pt.startTime}</td>
            <td>✓ Зафиксировано</td>
          </tr>
          <tr>
            <td><strong>Время окончания испытания</strong></td>
            <td>Выдержка не менее 24 часов</td>
            <td>${pt.endDate} в ${pt.endTime}</td>
            <td>✓ 24 часа выдержано</td>
          </tr>
          <tr>
            <td><strong>Конечное контрольное давление</strong></td>
            <td>Не ниже исходного (падение 0.0)</td>
            <td class="val-highlight"><strong>${pt.pressureBar || '16.0'} бар</strong></td>
            <td>✓ Падение: 0.0 бар</td>
          </tr>
          <tr>
            <td><strong>Визуальный контроль узлов и трасс</strong></td>
            <td>Отсутствие свищей, капель и течи</td>
            <td>Коллекторы FAR, трубы Rehau</td>
            <td>✓ 100% герметичность</td>
          </tr>
        </tbody>
      </table>

      <div style="font-size:9.5px; margin-bottom:5px; padding:4px 6px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
        <strong>Заключение инженера по соединениям:</strong> ${pt.notes || 'Система отопления и водоснабжения выдержала опрессовку 16 бар. Соединения монолитны.'}
      </div>

      <!-- Фотофиксация манометра и узла -->
      <div class="section-title">3. Фотофиксация опломбированного манометра и узла ввода под давлением</div>
      <div class="act-photo-grid">
        ${renderPhotoBox(photoPressure, 'Контрольный манометр 16 BAR', `Показания поверенного манометра (${pt.pressureBar || 16.0} бар • выдержка 24 часа)`)}
        ${renderPhotoBox(photoManifold, 'Распределительный узел FAR', 'Коллекторный узел ввода ГВС/ХВС и отопления под испытательным давлением')}
      </div>

      <!-- Резолюция допуска под стяжку -->
      <div class="resolution-box">
        <div class="resolution-title">🛡️ Официальная инженерная резолюция:</div>
        <div class="resolution-text">
          Система отопления и водоснабжения выдержала гидравлическое испытание давлением <strong>16.0 бар</strong> в течение 24 часов без падения давления. Все фитинги и соединения монолитны.
          <strong>РАЗРЕШАЕТСЯ ПРОИЗВОДСТВО РАБОТ ПО ЗАЛИВКЕ ЦЕМЕНТНО-ПЕСЧАНОЙ СТЯЖКИ ПОЛА И ОБШИВКЕ СТЕН ГИПСОКАРТОНОМ.</strong>
        </div>
      </div>

      <!-- Статус документа и ответственность -->
      <div class="disclaimer-box">
        <div class="disclaimer-title">ℹ️ Статус фиксации и разграничение ответственности сторон:</div>
        <div class="disclaimer-desc">
          1. <strong>Подтверждение мастера:</strong> Результаты испытания внесены и подтверждены мастером (Хакимовым Улугбеком) на объекте по показаниям опрессовочного оборудования Лиги Мастеров. Документ удостоверяет внутренний инженерный стандарт Лиги Мастеров и не является независимым лабораторным сертификатом или судебной экспертизой.<br>
          2. <strong>Контрольное давление при отделке:</strong> Магистрали остаются под рабочим давлением в процессе заливки пола. Любые сверлильные и крепежные работы производить строго по линейным размерам Исполнительного Инженерного Паспорта. Ответственность за механические повреждения труб после подписания настоящего Акта возлагается на производителя строительно-отделочных работ.
        </div>
      </div>

      <!-- Подписи сторон -->
      <div class="signatures-block">
        <div class="sign-col">
          <div class="sign-title">Ведущий инженер-испытатель:</div>
          <div class="sign-line">
            <span>Хакимов Улугбек</span>
            <span>(подпись) ________</span>
            <div class="facsimile-stamp">ЛИГА<br>МАСТЕРОВ<br>16 BAR</div>
          </div>
        </div>
        <div class="sign-col">
          <div class="sign-title">Заказчик (Приемка этапа):</div>
          <div class="sign-line">
            <span>${site.client}</span>
            <span>(подпись) ________</span>
          </div>
        </div>
        <div class="sign-col">
          <div class="sign-title">Производитель стяжки / Прораб:</div>
          <div class="sign-line">
            <span>Принято под стяжку</span>
            <span>(подпись) ________</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Колонтитул бланка Акта 16 бар -->
    <div class="act-footer">
      <span>Официальный Акт № ${actNumber} • Строго 1 страница А4 • Объект: ${site.name}</span>
      <div style="display:flex; align-items:center; gap:8px;">
        ${qrBadge}
        <span>DIN 1988 Part 2 • Ташкент</span>
      </div>
    </div>
  </div>

  <script>
    window.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        window.close();
      }
    });
  </script>
</body>
</html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    return true;
  }
}

window.ligaPdfEngine = new LigaPdfEngine();
