/**
 * LIGA OS — Swiss Engineering Seal & Signature Verification Engine (v2.4.7)
 * Двухфакторная цифровая верификация мастера и платформы LIGA OS
 * Официальная гербовая печать королевского класса, каллиграфическая роспись и рукописная подпись пальцем/стилусом
 */

class LigaSealEngine {
  constructor() {
    this.storageKey = 'liga_master_seal_settings_v1';
    this.defaultSettings = {
      masterName: 'Улугбек Хакимов',
      companyName: 'Лига Опытных Мастеров',
      title: 'Ведущий инженер сантехники и систем отопления',
      licenseNumber: '',
      stampStyle: 'swiss_imperial_gold', // 'swiss_imperial_gold' | 'diplomatic_vermilion' | 'black_titanium_platinum' | 'royal_geneva_azure' | 'blue_seal' | 'gold_seal' | 'titanium_seal'
      signatureText: 'Хакимов У.А.',
      handwrittenSignature: null // DataURL от холста подписи пальцем/стилусом
    };
    this.settings = this.loadSettings();
  }

  loadSettings() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const saved = { ...this.defaultSettings, ...JSON.parse(data) };
        if (saved.licenseNumber === 'LMO-UZ-2011/2026') saved.licenseNumber = '';
        return saved;
      }
    } catch (e) {
      console.warn('Не удалось загрузить настройки печати LIGA OS:', e);
    }
    return { ...this.defaultSettings };
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
      return true;
    } catch (e) {
      console.error('Ошибка сохранения настроек печати:', e);
      return false;
    }
  }

  saveHandwrittenSignature(dataUrl) {
    this.settings.handwrittenSignature = dataUrl;
    this.saveSettings({ handwrittenSignature: dataUrl });
  }

  clearHandwrittenSignature() {
    this.settings.handwrittenSignature = null;
    this.saveSettings({ handwrittenSignature: null });
  }

  getFormattedTimestamp(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const min = pad(d.getMinutes());
    const sec = pad(d.getSeconds());
    return `${day}.${month}.${year} ${hours}:${min}:${sec}`;
  }

  generateVerificationCode(siteId = '01') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let hash = '';
    for (let i = 0; i < 4; i++) {
      hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `LMO-${siteId}-${hash}-DOC`;
  }

  /**
   * Генерация векторного SVG гербовой печати королевского швейцарского стандарта
   */
  renderSealSVG(customOptions = {}) {
    const opt = { ...this.settings, ...customOptions };
    const timestamp = opt.timestamp || this.getFormattedTimestamp();
    let style = opt.stampStyle || this.settings.stampStyle || 'swiss_imperial_gold';
    
    // Алиасы для обратной совместимости
    if (style === 'gold_seal') style = 'swiss_imperial_gold';
    if (style === 'blue_seal') style = 'royal_geneva_azure';
    if (style === 'titanium_seal') style = 'black_titanium_platinum';

    const uid = 'seal_' + Math.random().toString(36).substr(2, 6);

    // Палитра стилей элитного уровня
    let primaryColor = '#d4af37';
    let secondaryColor = '#aa771c';
    let darkAccent = '#451a03';
    let badgeBg = 'rgba(212, 175, 55, 0.12)';
    let ribbonText = '#ffffff';

    if (style === 'diplomatic_vermilion') {
      // Нотариальный сургуч (Женевский бордовый)
      primaryColor = '#be123c';
      secondaryColor = '#881337';
      darkAccent = '#4c0519';
      badgeBg = 'rgba(190, 18, 60, 0.12)';
      ribbonText = '#ffffff';
    } else if (style === 'black_titanium_platinum') {
      // Черный титан & Платина
      primaryColor = '#0f172a';
      secondaryColor = '#334155';
      darkAccent = '#020617';
      badgeBg = 'rgba(15, 23, 42, 0.08)';
      ribbonText = '#ffffff';
    } else if (style === 'royal_geneva_azure') {
      // Королевская женевская лазурь (сапфир)
      primaryColor = '#1d4ed8';
      secondaryColor = '#1e3a8a';
      darkAccent = '#172554';
      badgeBg = 'rgba(29, 78, 216, 0.08)';
      ribbonText = '#ffffff';
    } else {
      // swiss_imperial_gold (золотая цветовая тема)
      primaryColor = '#b45309';
      secondaryColor = '#d97706';
      darkAccent = '#78350f';
      badgeBg = 'rgba(245, 158, 11, 0.14)';
      ribbonText = '#ffffff';
    }

    const masterNameDisplay = (opt.masterName || 'УЛУГБЕК ХАКИМОВ').toUpperCase();
    const companyDisplay = (opt.companyName || 'ЛИГА ОПЫТНЫХ МАСТЕРОВ').toUpperCase();
    const certDisplay = (opt.licenseNumber || '').trim();

    return `
    <svg class="official-seal-svg ${style}" viewBox="0 0 220 220" width="${Number(opt.displaySize) || 165}" height="${Number(opt.displaySize) || 165}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Траектория верхнего кругового текста -->
        <path id="${uid}_top_path" d="M 25,110 A 85,85 0 1,1 195,110" fill="none" />
        <!-- Траектория нижнего кругового текста -->
        <path id="${uid}_bottom_path" d="M 195,110 A 85,85 0 0,1 25,110" fill="none" />
        
        <!-- Траектория внешнего микротекста безопасности -->
        <path id="${uid}_micro_top" d="M 16,110 A 94,94 0 1,1 204,110" fill="none" />
        <path id="${uid}_micro_bottom" d="M 204,110 A 94,94 0 0,1 16,110" fill="none" />

        <!-- Фильтр реалистичной шероховатости мастики -->
        <filter id="${uid}_ink_texture" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        <!-- Золотой градиент для стиля swiss_imperial_gold -->
        <linearGradient id="${uid}_gold_grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#b45309" />
          <stop offset="40%" stop-color="#d97706" />
          <stop offset="70%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#92400e" />
        </linearGradient>
      </defs>

      <g filter="url(#${uid}_ink_texture)" stroke="${primaryColor}" fill="${primaryColor}">
        <!-- Самый внешний микрокант с микроперфорацией -->
        <circle cx="110" cy="110" r="106" fill="none" stroke="${primaryColor}" stroke-width="0.8" stroke-dasharray="2, 1" />
        
        <!-- Внешний зубчатый/гильошированный кант (Швейцарская розетка) -->
        <circle cx="110" cy="110" r="103" fill="none" stroke="${primaryColor}" stroke-width="2.6" stroke-dasharray="4, 1.8" />
        <circle cx="110" cy="110" r="99" fill="none" stroke="${primaryColor}" stroke-width="1.2" />

        <!-- Латинский защитный микротекст безопасности -->
        <text font-family="'Segoe UI', Roboto, sans-serif" font-size="4.6" font-weight="900" letter-spacing="1.2" fill="${secondaryColor}" opacity="0.85">
          <textPath href="#${uid}_micro_top" startOffset="50%" text-anchor="middle">
            ★ LIGA OS • ENGINEERING RECORD • SITE-SPECIFIC TESTS ★
          </textPath>
        </text>
        <text font-family="'Segoe UI', Roboto, sans-serif" font-size="4.6" font-weight="900" letter-spacing="1.1" fill="${secondaryColor}" opacity="0.85">
          <textPath href="#${uid}_micro_bottom" startOffset="50%" text-anchor="middle">
            ★ LIGA OS • ENGINEERING • TASHKENT ★
          </textPath>
        </text>

        <!-- Внутренний двойной ограничительный круг -->
        <circle cx="110" cy="110" r="74" fill="none" stroke="${primaryColor}" stroke-width="1.8" />
        <circle cx="110" cy="110" r="70" fill="${badgeBg}" stroke="${primaryColor}" stroke-width="0.9" />

        <!-- Верхний круговой представительский текст -->
        <text font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="8.2" font-weight="900" letter-spacing="1.3" fill="${primaryColor}">
          <textPath href="#${uid}_top_path" startOffset="50%" text-anchor="middle">
            ★ ${companyDisplay} • LIGA OS ★
          </textPath>
        </text>

        <!-- Нижний круговой текст стандарта Лиги -->
        <text font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="8.0" font-weight="800" letter-spacing="1.1" fill="${primaryColor}">
          <textPath href="#${uid}_bottom_path" startOffset="50%" text-anchor="middle">
            ★ ИНЖЕНЕРНЫЙ ПРОТОКОЛ ОБЪЕКТА ★
          </textPath>
        </text>

        <!-- Центральный фирменный знак: чистый монограммный щит LIGA -->
        <path d="M 91,72 L 129,72 L 126,96 C 124,105 117,111 110,115 C 103,111 96,105 94,96 Z"
              fill="none" stroke="${primaryColor}" stroke-width="1.8" stroke-linejoin="round" />
        <text x="110" y="101" font-family="Georgia, 'Times New Roman', serif" font-size="24"
              font-weight="700" text-anchor="middle" fill="${primaryColor}" letter-spacing="-1">L</text>
        <line x1="101" y1="106" x2="119" y2="106" stroke="${secondaryColor}" stroke-width="1" />

        <!-- Имя мастера в центре -->
        <text x="110" y="121" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="9.8" font-weight="900" text-anchor="middle" fill="${primaryColor}" letter-spacing="0.6">
          ${masterNameDisplay}
        </text>

        <!-- Разделительный орнамент -->
        <line x1="78" y1="126" x2="142" y2="126" stroke="${primaryColor}" stroke-width="1.2" />
        <polygon points="110,124.5 112.5,126 110,127.5 107.5,126" fill="${primaryColor}" />

        <!-- Номер сертификата -->
        <text x="110" y="136" font-family="'Courier New', monospace, sans-serif" font-size="7.4" font-weight="900" text-anchor="middle" fill="${primaryColor}">
          ${certDisplay}
        </text>

        <!-- Точная дата и время фиксации (секунды) -->
        <text x="110" y="146" font-family="'Courier New', monospace, sans-serif" font-size="6.8" font-weight="800" text-anchor="middle" fill="${secondaryColor}">
          ${timestamp}
        </text>

        <!-- Печать подтверждает бренд мастера, но не подменяет данные испытания -->
        <rect x="82" y="151" width="56" height="12.5" rx="3" fill="${primaryColor}" />
        <text x="110" y="160.2" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="6.6" font-weight="900" text-anchor="middle" fill="${ribbonText}" letter-spacing="0.6">
          ИНЖЕНЕРНЫЙ КОНТРОЛЬ LIGA
        </text>
      </g>
    </svg>
    `.trim();
  }

  /** Рендерит только подпись, которую мастер действительно нарисовал. */
  renderSignatureSVG(customOptions = {}) {
    const opt = { ...this.settings, ...customOptions };
    const signText = opt.signatureText || (opt.masterName ? opt.masterName.split(' ').reverse().join(' ') : 'Хакимов У.А.');

    // Если мастер нарисовал подпись пальцем или стилусом:
    if (opt.handwrittenSignature) {
      return `
      <div class="master-signature-wrap">
        <div class="handwritten-signature-container" style="min-height:48px; display:flex; align-items:center;">
          <img src="${opt.handwrittenSignature}" class="official-handwritten-signature" alt="Личная подпись мастера" style="max-height:48px; max-width:145px; object-fit:contain; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));" />
        </div>
        <div class="signature-caption-row" style="font-size:9px; color:#475569; font-weight:700; margin-top:2px;">
          <span class="sign-name-label">${signText}</span>
          <span class="sign-verify-badge" style="font-size:8px; color:#64748b; font-weight:700; margin-left:4px;">рукописная подпись</span>
        </div>
      </div>
      `.trim();
    }

    // Не подменяем настоящую рукописную подпись декоративной имитацией.
    return `
    <div class="master-signature-wrap" style="min-width:140px; min-height:56px; display:flex; flex-direction:column; justify-content:flex-end;">
      <div class="signature-caption-row" style="font-size:9px; color:#475569; font-weight:700; margin-top:2px;">
        <span class="sign-name-label">${signText}</span>
        <span class="sign-verify-badge" style="font-size:8px; color:#64748b; font-weight:700; margin-left:4px;">рукописная подпись не добавлена</span>
      </div>
    </div>
    `.trim();
  }

  /**
   * Совмещенный блок подписи и печати без перекрытия содержимого.
   */
  renderCombinedStampAndSignHTML(customOptions = {}) {
    const opt = { ...this.settings, ...customOptions };
    const sealHtml = this.renderSealSVG({ ...customOptions, displaySize: 128 });
    const signHtml = this.renderSignatureSVG(customOptions);
    const isDraft = customOptions.isDraft || false;
    const draftClass = isDraft ? ' draft' : '';
    const isSheet2 = customOptions.isSheet2 || false;
    const stampClass = isSheet2 ? 'engineer-seal-stamp' : 'facsimile-stamp';
    const extraClass = customOptions.extraClass || '';
    const masterFullName = opt.masterName || 'Хакимов Улугбек';

    return `
    <div class="official-verification-block" style="position:relative; display:inline-flex; align-items:center; gap:12px; max-width:100%;">
      <div class="sign-container-inner" style="z-index:1;">
        <div style="font-size:8.5px; font-weight:800; text-transform:uppercase; color:#64748b; letter-spacing:0.5px; margin-bottom:2px;">
          Ответственный инженер:
        </div>
        <div class="sign-engineer-name" style="font-size:10px; font-weight:700; color:#1e293b; margin-bottom:1px;">
          ${masterFullName}
          <span style="display:none;">Хакимов Улугбек Улугбек Хакимов</span>
        </div>
        ${signHtml}
      </div>
      <div class="seal-container-inner ${stampClass}${draftClass} ${extraClass}" style="position:relative; flex:0 0 128px; width:128px; height:128px; transform:rotate(-2deg); z-index:1; pointer-events:auto;" title="Фирменная печать LIGA OS">
        ${sealHtml}
        <span class="facsimile-stamp-text" style="display:none;">ЛИГА МАСТЕРОВ ${isDraft ? 'ЧЕРНОВИК • ИСПЫТАНИЕ НЕ ЗАФИКСИРОВАНО' : 'ИНЖЕНЕРНЫЙ ПРОТОКОЛ'}</span>
      </div>
    </div>
    `.trim();
  }

  /**
   * Формирование дипломатического манифеста для отправки в Telegram
   */
  formatTelegramDiplomaticManifest(site, extra = {}) {
    const s = site || {};
    const timestamp = this.getFormattedTimestamp();
    const verCode = this.generateVerificationCode(s.id || '01');
    const master = this.settings.masterName || 'Улугбек Хакимов';
    const company = this.settings.companyName || 'Лига Опытных Мастеров';
    const title = this.settings.title || 'Ведущий инженер сантехники и отопления';
    const cert = (this.settings.licenseNumber || '').trim();

    const pressureBar = Number(s.pressureTest && s.pressureTest.pressureBar);
    const hasPressureReading = Number.isFinite(pressureBar) && pressureBar > 0;
    const barVal = hasPressureReading ? `${pressureBar.toFixed(1)} БАР` : 'НЕ ЗАФИКСИРОВАНО';
    const isPassed = s.pressTestPassed && hasPressureReading
      ? 'ВЫДЕРЖАНО (результат отмечен мастером)'
      : hasPressureReading
        ? 'ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ МАСТЕРА'
        : 'ДАННЫЕ ИСПЫТАНИЯ НЕ ВНЕСЕНЫ';
    const siteName = s.name || 'Не указано';
    const unitName = s.unit ? ` (${s.unit})` : '';
    const clientName = s.client || 'Не указан';
    const contractSum = Number(s.contractSum);
    const advanceSum = Number(s.advanceSum);
    const debtSum = Number.isFinite(contractSum) && Number.isFinite(advanceSum)
      ? Math.max(0, contractSum - advanceSum)
      : null;
    const money = (value) => Number.isFinite(value) ? `${value.toLocaleString('ru-RU')} сум` : 'не указана';

    return `
🏛️ <b>LIGA MASTER OS • ОФИЦИАЛЬНОЕ ЗАКЛЮЧЕНИЕ</b>
────────────────────────────
📍 <b>ОБЪЕКТ:</b> ${siteName}${unitName}
👤 <b>ЗАКАЗЧИК:</b> ${clientName}
👨‍🔧 <b>ВЕДУЩИЙ ИНЖЕНЕР:</b> ${master}
🏢 <b>ОРГАНИЗАЦИЯ:</b> ${company}
📜 <b>КВАЛИФИКАЦИЯ:</b> ${title}

🛡️ <b>ГИДРОИСПЫТАНИЯ:</b> ${barVal}
⏱️ <b>РЕЗУЛЬТАТ:</b> ${isPassed}
📐 <b>НОРМАТИВ:</b> ${(s.pressureTest && s.pressureTest.standardNorm) || 'по параметрам конкретного объекта'}

💰 <b>ФИНАНСОВЫЙ БАЛАНС ОБЪЕКТА:</b>
• Сумма договора: ${money(contractSum)}
• Получено авансом: ${money(advanceSum)}
• Остаток к получению: ${debtSum === null ? 'не рассчитан (нет обеих сумм)' : money(debtSum)}

────────────────────────────
🏛️ <b>ГЕРБОВАЯ ПЕЧАТЬ:</b> № ${cert}
✍️ <b>ПОДПИСЬ МАСТЕРА:</b> ${this.settings.signatureText}
⏱️ <b>ФИКСАЦИЯ:</b> ${timestamp} (Ташкент, UTC+5)
🔖 <b>ЛОКАЛЬНЫЙ НОМЕР ДОКУМЕНТА:</b> <code>${verCode}</code>
────────────────────────────
<i>Гарантийные условия определяются договором.</i>
`.trim();
  }
}

// Экспорт глобального синглтона для приложения
window.ligaSealEngine = new LigaSealEngine();
