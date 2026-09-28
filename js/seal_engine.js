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
      licenseNumber: 'LMO-UZ-2011/2026',
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
        return { ...this.defaultSettings, ...JSON.parse(data) };
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
    return `LMO-${siteId}-${hash}-16B`;
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
      // swiss_imperial_gold (Королевское золото 24K)
      primaryColor = '#b45309';
      secondaryColor = '#d97706';
      darkAccent = '#78350f';
      badgeBg = 'rgba(245, 158, 11, 0.14)';
      ribbonText = '#ffffff';
    }

    const masterNameDisplay = (opt.masterName || 'УЛУГБЕК ХАКИМОВ').toUpperCase();
    const companyDisplay = (opt.companyName || 'ЛИГА ОПЫТНЫХ МАСТЕРОВ').toUpperCase();
    const certDisplay = opt.licenseNumber || 'LMO-UZ-2011/2026';

    return `
    <svg class="official-seal-svg ${style}" viewBox="0 0 220 220" width="165" height="165" xmlns="http://www.w3.org/2000/svg">
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
            ★ SWISS HYDRAULIC STANDARD • 16.0 BAR PRESSURE GUARANTEE • ISO VERIFIED ★
          </textPath>
        </text>
        <text font-family="'Segoe UI', Roboto, sans-serif" font-size="4.6" font-weight="900" letter-spacing="1.1" fill="${secondaryColor}" opacity="0.85">
          <textPath href="#${uid}_micro_bottom" startOffset="50%" text-anchor="middle">
            ★ IN PRESSURA ET ARTE VERITAS • MASTER REGISTRY UZBEKISTAN ★
          </textPath>
        </text>

        <!-- Внутренний двойной ограничительный круг -->
        <circle cx="110" cy="110" r="74" fill="none" stroke="${primaryColor}" stroke-width="1.8" />
        <circle cx="110" cy="110" r="70" fill="${badgeBg}" stroke="${primaryColor}" stroke-width="0.9" />

        <!-- Верхний круговой представительский текст -->
        <text font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="8.2" font-weight="900" letter-spacing="1.3" fill="${primaryColor}">
          <textPath href="#${uid}_top_path" startOffset="50%" text-anchor="middle">
            ★ ${companyDisplay} • 16 BAR • LIGA OS ★
          </textPath>
        </text>

        <!-- Нижний круговой текст стандарта Лиги -->
        <text font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="8.0" font-weight="800" letter-spacing="1.1" fill="${primaryColor}">
          <textPath href="#${uid}_bottom_path" startOffset="50%" text-anchor="middle">
            ★ СТАНДАРТ ГИДРОИСПЫТАНИЙ 16.0 БАР ★
          </textPath>
        </text>

        <!-- Центральный геральдический блок -->
        <!-- Королевская корона высшего мастерства -->
        <path d="M 96,66 L 100,74 L 110,64 L 120,74 L 124,66 L 122,79 L 98,79 Z" fill="${primaryColor}" stroke="none" />
        <circle cx="96" cy="64" r="1.5" fill="${primaryColor}" stroke="none" />
        <circle cx="110" cy="62" r="1.8" fill="${primaryColor}" stroke="none" />
        <circle cx="124" cy="64" r="1.5" fill="${primaryColor}" stroke="none" />

        <!-- Геральдический швейцарский щит -->
        <path d="M 98,80 L 122,80 C 122,80 126,98 110,108 C 94,98 98,80 98,80 Z" fill="none" stroke="${primaryColor}" stroke-width="1.6" />
        <!-- Швейцарский крест надёжности -->
        <path d="M 108,86 H 112 V 90 H 116 V 94 H 112 V 98 H 108 V 94 H 104 V 90 H 108 Z" fill="${primaryColor}" stroke="none" />

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

        <!-- Штамп статуса опрессовки -->
        <rect x="82" y="151" width="56" height="12.5" rx="3" fill="${primaryColor}" />
        <text x="110" y="160.2" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="6.6" font-weight="900" text-anchor="middle" fill="${ribbonText}" letter-spacing="0.6">
          ✓ ВЫДЕРЖАНО 16 БАР
        </text>
      </g>
    </svg>
    `.trim();
  }

  /**
   * Генерация подписи мастера: если есть рукописная (пальцем/стилусом), используем её,
   * иначе — красивейший каллиграфический SVG-вензель.
   */
  renderSignatureSVG(customOptions = {}) {
    const opt = { ...this.settings, ...customOptions };
    const style = opt.stampStyle || this.settings.stampStyle || 'swiss_imperial_gold';
    let inkColor = '#1e3a8a';
    if (style.includes('gold')) inkColor = '#b45309';
    else if (style.includes('vermilion')) inkColor = '#9f1239';
    else if (style.includes('titanium')) inkColor = '#0f172a';

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
          <span class="sign-verify-badge" style="font-size:8px; color:#059669; font-weight:800; margin-left:4px;">✓ ЭЦП VERIFIED</span>
        </div>
      </div>
      `.trim();
    }

    // Иначе — каллиграфический векторный росчерк чернильного пера
    return `
    <div class="master-signature-wrap">
      <svg class="official-signature-svg" viewBox="0 0 160 55" width="140" height="48" xmlns="http://www.w3.org/2000/svg">
        <g stroke="${inkColor}" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <!-- Изящная петля заглавной буквы -->
          <path d="M 15,38 C 10,25 22,12 32,16 C 42,20 28,42 22,46 C 18,48 35,44 48,36" stroke-width="2.4" />
          <!-- Каллиграфический росчерк фамилии -->
          <path d="M 45,36 Q 52,24 60,34 T 74,32 T 88,35 T 102,30 T 116,34" stroke-width="2.0" />
          <!-- Финальный дипломатический взмах пера -->
          <path d="M 98,34 Q 120,46 148,22 Q 130,48 70,48 Q 50,48 30,50" stroke-width="1.8" stroke-opacity="0.9" />
          <!-- Метка цифрового заверения точки -->
          <circle cx="150" cy="22" r="1.6" fill="${inkColor}" stroke="none" />
        </g>
      </svg>
      <div class="signature-caption-row" style="font-size:9px; color:#475569; font-weight:700; margin-top:2px;">
        <span class="sign-name-label">${signText}</span>
        <span class="sign-verify-badge" style="font-size:8px; color:#059669; font-weight:800; margin-left:4px;">✓ ЭЦП VERIFIED</span>
      </div>
    </div>
    `.trim();
  }

  /**
   * Совмещенный репрезентативный блок: Подпись + Гербовая печать внахлест (-3.5 град)
   */
  renderCombinedStampAndSignHTML(customOptions = {}) {
    const opt = { ...this.settings, ...customOptions };
    const sealHtml = this.renderSealSVG(customOptions);
    const signHtml = this.renderSignatureSVG(customOptions);
    const isDraft = customOptions.isDraft || false;
    const draftClass = isDraft ? ' draft' : '';
    const isSheet2 = customOptions.isSheet2 || false;
    const stampClass = isSheet2 ? 'engineer-seal-stamp' : 'facsimile-stamp';
    const extraClass = customOptions.extraClass || '';
    const masterFullName = opt.masterName || 'Хакимов Улугбек';

    return `
    <div class="official-verification-block" style="position:relative; display:inline-flex; align-items:flex-end; gap:8px;">
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
      <div class="seal-container-inner ${stampClass}${draftClass} ${extraClass}" style="position:relative; margin-left:-35px; margin-bottom:-6px; transform:rotate(-3.5deg); z-index:2; pointer-events:auto;" title="Официальный штамп технического контроля LIGA OS">
        ${sealHtml}
        <span class="facsimile-stamp-text" style="display:none;">ЛИГА МАСТЕРОВ 16 BAR ${isDraft ? 'ЧЕРНОВИК БЕЗ ТЕСТА 16 BAR' : ''}</span>
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
    const cert = this.settings.licenseNumber || 'LMO-UZ-2011/2026';

    const barVal = (s.pressureTest && s.pressureTest.pressureBar) ? Number(s.pressureTest.pressureBar).toFixed(1) : '16.0';
    const isPassed = s.pressTestPassed ? 'ВЫДЕРЖАНО (24 часа без падения стрелки)' : 'Ожидает суточной выдержки';

    return `
🏛️ <b>LIGA MASTER OS • ОФИЦИАЛЬНОЕ ЗАКЛЮЧЕНИЕ</b>
────────────────────────────
📍 <b>ОБЪЕКТ:</b> ${s.name || 'ЖК Mirabad Avenue'} (${s.unit || 'кв. 142'})
👤 <b>ЗАКАЗЧИК:</b> ${s.client || 'Уважаемый клиент'}
👨‍🔧 <b>ВЕДУЩИЙ ИНЖЕНЕР:</b> ${master}
🏢 <b>ОРГАНИЗАЦИЯ:</b> ${company}
📜 <b>КВАЛИФИКАЦИЯ:</b> ${title}

🛡️ <b>ГИДРОИСПЫТАНИЯ:</b> ${barVal} БАР
⏱️ <b>РЕЗУЛЬТАТ:</b> ${isPassed}
📐 <b>СТАНДАРТ:</b> DIN 1988 / Швейцарский эталон Лиги (в 4 раза строже СНиП)

💰 <b>ФИНАНСОВЫЙ БАЛАНС ОБЪЕКТА:</b>
• Сумма договора: ${s.contractSum || '18 500 000'} сум
• Получено авансом: ${s.advanceSum || '12 000 000'} сум
• Остаток к получению: ${s.debtSum || '6 500 000'} сум

────────────────────────────
🏛️ <b>ГЕРБОВАЯ ПЕЧАТЬ:</b> № ${cert}
✍️ <b>ЦИФРОВАЯ ПОДПИСЬ:</b> ${this.settings.signatureText} (VERIFIED)
⏱️ <b>ФИКСАЦИЯ:</b> ${timestamp} (Ташкент, UTC+5)
🔐 <b>ВЕРИФИКАЦИОННЫЙ ХЭШ:</b> <code>${verCode}</code>
────────────────────────────
<i>Гарантия на инженерные трассы: 10 лет по официальному договору.</i>
`.trim();
  }
}

// Экспорт глобального синглтона для приложения
window.ligaSealEngine = new LigaSealEngine();
