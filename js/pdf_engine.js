/* ==========================================================================
   LIGA OS — Генератор Исполнительного Инженерного Паспорта
   Формат А4 • Опрессовка 16 бар • Живые фотопривязки трасс • Без серверов
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

  // Генерация и открытие официального паспорта объекта с реальными фото
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

    // Хелпер рендеринга блока фото
    const renderPhotoBox = (photoData, defaultTitle, defaultSubtitle) => {
      if (photoData) {
        return `
          <div class="photo-card">
            <div class="photo-img-wrap">
              <img src="${photoData}" alt="${defaultTitle}" class="passport-real-photo">
            </div>
            <div class="photo-caption">${defaultSubtitle}</div>
          </div>
        `;
      }
      return `
        <div class="photo-card">
          <div class="photo-placeholder">
            <svg width="36" height="36" fill="none" stroke="#64748b" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span style="margin-top:5px;">${defaultTitle}</span>
          </div>
          <div class="photo-caption">${defaultSubtitle}</div>
        </div>
      `;
    };

    const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Исполнительный Инженерный Паспорт — ${site.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Segoe UI', -apple-system, Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.4;
      font-size: 13px;
    }
    .page-container {
      max-width: 210mm;
      margin: 0 auto;
      padding: 10px;
    }
    /* Шапка документа */
    .passport-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #b8832a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .header-logo {
      width: 64px;
      height: 64px;
    }
    .brand-text h1 {
      font-size: 21px;
      font-weight: 900;
      color: #080e1a;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .brand-text p {
      font-size: 11px;
      color: #8c6322;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .header-status-box {
      text-align: right;
    }
    .stamp-badge {
      display: inline-block;
      font-weight: 900;
      font-size: 11px;
      padding: 6px 12px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stamp-badge-passed {
      border: 2px solid #00a86b;
      color: #00875a;
      background: #f0fdf4;
    }
    .stamp-badge-draft {
      border: 2px solid #d97706;
      color: #b45309;
      background: #fef3c7;
    }
    .passport-num {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
      font-weight: 600;
    }

    /* Блоки сведений */
    .section-title {
      font-size: 12px;
      font-weight: 800;
      color: #b8832a;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin: 12px 0 6px 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 14px;
    }
    .meta-row {
      display: flex;
      flex-direction: column;
    }
    .meta-label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }
    .meta-value {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }

    /* Протокол опрессовки 16 бар */
    .protocol-box {
      border: 2px solid #b8832a;
      border-radius: 6px;
      padding: 12px;
      background: #fffdfa;
      margin-bottom: 14px;
    }
    .protocol-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
    }
    .protocol-table th, .protocol-table td {
      border: 1px solid #cbd5e1;
      padding: 7px 10px;
      font-size: 12px;
      text-align: left;
    }
    .protocol-table th {
      background: #f1f5f9;
      font-weight: 800;
      color: #334155;
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
      border-left: 4px solid #dc2626;
      background: #fef2f2;
      padding: 10px 14px;
      margin-bottom: 14px;
      border-radius: 0 6px 6px 0;
    }
    .warning-title {
      font-size: 11px;
      font-weight: 800;
      color: #dc2626;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .warning-desc {
      font-size: 11px;
      color: #991b1b;
      line-height: 1.35;
    }

    /* Сетка фотопривязок */
    .photo-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }
    .photo-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px;
      background: #f8fafc;
      text-align: center;
    }
    .photo-img-wrap {
      width: 100%;
      height: 135px;
      overflow: hidden;
      border-radius: 4px;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .passport-real-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .photo-placeholder {
      width: 100%;
      height: 135px;
      background: #e2e8f0;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
    }
    .photo-caption {
      font-size: 11px;
      font-weight: 700;
      color: #334155;
      margin-top: 5px;
    }

    /* Подписи и печати */
    .signatures-block {
      display: flex;
      justify-content: space-between;
      margin-top: 18px;
      padding-top: 12px;
      border-top: 2px solid #e2e8f0;
    }
    .sign-col {
      width: 45%;
    }
    .sign-title {
      font-size: 11px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 26px;
    }
    .sign-line {
      border-bottom: 1px solid #0f172a;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 11px;
      color: #475569;
      padding-bottom: 3px;
      position: relative;
    }
    .facsimile-stamp {
      position: absolute;
      right: 20px;
      bottom: -15px;
      color: #b8832a;
      border: 2px dashed #b8832a;
      border-radius: 50%;
      width: 65px;
      height: 65px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 8px;
      font-weight: 900;
      text-transform: uppercase;
      transform: rotate(-12deg);
      opacity: 0.85;
      pointer-events: none;
    }
    .facsimile-stamp.draft {
      color: #b45309;
      border-color: #d97706;
    }

    /* Панель печати */
    .print-bar {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      gap: 10px;
    }
    .btn-print {
      background: linear-gradient(135deg, #b8832a 0%, #8c5d13 100%);
      color: #fff;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    @media print {
      .print-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">Сохранить в PDF / Распечатать</button>
  </div>

  <div class="page-container">
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
    <div class="section-title">1. Паспортные данные инженерного объекта</div>
    <div class="meta-grid">
      <div class="meta-row">
        <span class="meta-label">Наименование объекта:</span>
        <span class="meta-value">${site.name}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Адрес / Помещение:</span>
        <span class="meta-value">${site.unit || 'Премиальный жилой фонд'}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Заказчик (Владелец):</span>
        <span class="meta-value">${site.client} (${site.phone})</span>
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
    <div class="section-title">2. Протокол гидравлических испытаний (Акт опрессовки)</div>
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
      <div style="margin-top: 8px; padding: 6px 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 10px; color: #475569; line-height: 1.4;">
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
      <div style="margin-top: 10px; padding: 8px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 11px; color: #92400e; line-height: 1.4;">
        ⚠️ <strong>Внимание:</strong> Гидравлические испытания давлением 16 бар не зафиксированы или отсутствует фото манометра. Данный документ является предварительным <strong>рабочим черновиком</strong> и не подтверждает готовность скрытых систем к заливке стяжки или обшивке.
      </div>
      `}
    </div>

    <!-- Юридическое предупреждение для отделочников -->
    <div class="warning-box">
      <div class="warning-title">⚠️ Внимание отделочникам, гипсокартонщикам и установщикам мебели:</div>
      <div class="warning-desc">
        В стенах и полу проложены скрытые магистрали отопления и водоснабжения под рабочим давлением. Любое сверление, бурение и крепление плинтусов/мебели производить <strong>СТРОГО ПО ЛИНЕЙНЫМ РАЗМЕРАМ ДАННОГО ИСПОЛНИТЕЛЬНОГО ПАСПОРТА</strong>. В случае повреждения труб при несоблюдении схемы ответственность возлагается на производителя сверлильных работ.
      </div>
    </div>

    <!-- Фотогалерея узлов и привязок -->
    <div class="section-title">3. Фотофиксация скрытых трасс и узлов распределения</div>
    <div class="photo-grid">
      ${renderPhotoBox(photos.manifold, 'Фото узла ввода FAR', 'Распределительный узел ГВС/ХВС с манометрами')}
      ${renderPhotoBox(photos.pressure, 'Фото манометра 16 BAR', 'Показания гидропресса (16 бар • 24 часа)')}
      ${renderPhotoBox(photos.wall, 'Трассы в стенах с рулеткой', 'Привязка выводов к углам помещения')}
      ${renderPhotoBox(photos.floor, 'Трассы в полу перед стяжкой', 'Шаг укладки труб и теплоизоляция')}
    </div>

    <!-- Блок гарантии и подписей -->
    <div class="section-title">4. Двухуровневая модель гарантии и приемка</div>
    ${isPressureVerified ? `
    <p style="font-size:11px; color:#475569; margin-bottom: 12px;">
      1. Заводская гарантия на оригинальные европейские материалы (Rehau, FAR, Geberit) составляет от 10 до 50 лет согласно паспортам заводов-изготовителей.<br>
      2. Официальная гарантия на качество монтажных работ предоставляется по индивидуальному договору под проект на основании успешного прохождения гидравлического испытания 16 бар.
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
    <p style="font-size:11px; color:#b45309; margin-bottom: 12px; font-weight: 600;">
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
</body>
</html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}

window.ligaPdfEngine = new LigaPdfEngine();
