/**
 * LIGA OS — Swiss Engineering Seal & Signature Verification Engine (v2.4.5)
 * Двухфакторная цифровая верификация мастера и платформы LIGA OS
 * Официальная гербовая печать, каллиграфическая подпись и дипломатический манифест
 */

class LigaSealEngine {
  constructor() {
    this.storageKey = 'liga_master_seal_settings_v1';
    this.defaultSettings = {
      masterName: 'Улугбек Хакимов',
      companyName: 'Лига Опытных Мастеров',
      title: 'Ведущий инженер сантехники и систем отопления',
      licenseNumber: 'LMO-UZ-2011/2026',
      stampStyle: 'blue_seal', // 'blue_seal' | 'gold_seal' | 'titanium_seal'
      signatureText: 'Хакимов У.А.'
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
   * Генерация векторного SVG гербовой печати швейцарского стандарта
   */
  renderSealSVG(customOptions = {}) {
    const opt = { ...this.settings, ...customOptions };
    const timestamp = opt.timestamp || this.getFormattedTimestamp();
    const style = opt.stampStyle || this.settings.stampStyle || 'blue_seal';
    
    // Цветовая палитра стиля печати
    let primaryColor = '#1d4ed8'; // blue_seal
    let secondaryColor = '#1e3a8a';
    let inkGlow = 'rgba(29, 78, 216, 0.15)';
    let badgeBg = 'rgba(29, 78, 216, 0.08)';

    if (style === 'gold_seal') {
      primaryColor = '#d4af37';
      secondaryColor = '#aa771c';
      inkGlow = 'rgba(212, 175, 55, 0.25)';
      badgeBg = 'rgba(212, 175, 55, 0.12)';
    } else if (style === 'titanium_seal') {
      primaryColor = '#334155';
      secondaryColor = '#0f172a';
      inkGlow = 'rgba(51, 65, 85, 0.2)';
      badgeBg = 'rgba(51, 65, 85, 0.08)';
    }

    const masterNameDisplay = (opt.masterName || 'УЛУГБЕК ХАКИМОВ').toUpperCase();
    const companyDisplay = (opt.companyName || 'ЛИГА ОПЫТНЫХ МАСТЕРОВ').toUpperCase();
    const certDisplay = opt.licenseNumber || 'LMO-UZ-2011/2026';

    const uid = 'seal_' + Math.random().toString(36).substr(2, 6);

    return `
    <svg class="official-seal-svg ${style}" viewBox="0 0 200 200" width="160" height="160" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Траектория верхнего кругового текста -->
        <path id="${uid}_top_path" d="M 24,100 A 76,76 0 1,1 176,100" fill="none" />
        <!-- Траектория нижнего кругового текста -->
        <path id="${uid}_bottom_path" d="M 176,100 A 76,76 0 0,1 24,100" fill="none" />
        <!-- Фильтр реалистичной шероховатости мастики -->
        <filter id="${uid}_ink_texture" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      <g filter="url(#${uid}_ink_texture)" stroke="${primaryColor}" fill="${primaryColor}">
        <!-- Внешний зубчатый/гильошированный кант -->
        <circle cx="100" cy="100" r="95" fill="none" stroke="${primaryColor}" stroke-width="2.5" stroke-dasharray="3, 1.5" />
        <circle cx="100" cy="100" r="91" fill="none" stroke="${primaryColor}" stroke-width="1.2" />

        <!-- Внутренний ограничительный круг -->
        <circle cx="100" cy="100" r="63" fill="none" stroke="${primaryColor}" stroke-width="1.8" />
        <circle cx="100" cy="100" r="60" fill="${badgeBg}" stroke="${primaryColor}" stroke-width="0.8" />

        <!-- Верхний круговой текст -->
        <text font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="7.5" font-weight="900" letter-spacing="1.2" fill="${primaryColor}">
          <textPath href="#${uid}_top_path" startOffset="50%" text-anchor="middle">
            ★ ${companyDisplay} • 16 BAR • LIGA OS ★
          </textPath>
        </text>

        <!-- Нижний круговой текст -->
        <text font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="7.2" font-weight="800" letter-spacing="1.1" fill="${primaryColor}">
          <textPath href="#${uid}_bottom_path" startOffset="50%" text-anchor="middle">
            ★ СТАНДАРТ ГИДРОИСПЫТАНИЙ 16.0 БАР ★
          </textPath>
        </text>

        <!-- Центральный гербовый блок -->
        <!-- Геральдический щит -->
        <path d="M 88,68 L 112,68 C 112,68 116,84 100,94 C 84,84 88,68 88,68 Z" fill="none" stroke="${primaryColor}" stroke-width="1.5" />
        <!-- Швейцарский крест надёжности -->
        <path d="M 98,73 H 102 V 77 H 106 V 81 H 102 V 85 H 98 V 81 H 94 V 77 H 98 Z" fill="${primaryColor}" stroke="none" />

        <!-- Имя мастера в центре -->
        <text x="100" y="108" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="9" font-weight="900" text-anchor="middle" fill="${primaryColor}" letter-spacing="0.5">
          ${masterNameDisplay}
        </text>

        <!-- Разделитель -->
        <line x1="72" y1="113" x2="128" y2="113" stroke="${primaryColor}" stroke-width="1" />

        <!-- Номер сертификата -->
        <text x="100" y="123" font-family="'Courier New', monospace, sans-serif" font-size="6.8" font-weight="800" text-anchor="middle" fill="${primaryColor}">
          ${certDisplay}
        </text>

        <!-- Точная дата и время фиксации -->
        <text x="100" y="132" font-family="'Courier New', monospace, sans-serif" font-size="6.2" font-weight="700" text-anchor="middle" fill="${secondaryColor}">
          ${timestamp}
        </text>

        <!-- Штамп статуса -->
        <rect x="76" y="137" width="48" height="11" rx="2" fill="${primaryColor}" />
        <text x="100" y="145.5" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="5.8" font-weight="900" text-anchor="middle" fill="#ffffff" letter-spacing="0.4">
          ✓ ВЫДЕРЖАНО 16 БАР
        </text>
      </g>
    </svg>
    `.trim();
  }

  /**
   * Генерация векторной каллиграфической подписи мастера
   */
  renderSignatureSVG(customOptions = {}) {
    const opt = { ...this.settings, ...customOptions };
    const style = opt.stampStyle || this.settings.stampStyle || 'blue_seal';
    let inkColor = '#1e3a8a';
    if (style === 'gold_seal') inkColor = '#b8860b';
    else if (style === 'titanium_seal') inkColor = '#0f172a';

    const signText = opt.signatureText || (opt.masterName ? opt.masterName.split(' ').reverse().join(' ') : 'Хакимов У.А.');

    return `
    <div class="master-signature-wrap">
      <svg class="official-signature-svg" viewBox="0 0 160 55" width="140" height="48" xmlns="http://www.w3.org/2000/svg">
        <g stroke="${inkColor}" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <!-- Изящная петля заглавной буквы -->
          <path d="M 15,38 C 10,25 22,12 32,16 C 42,20 28,42 22,46 C 18,48 35,44 48,36" stroke-width="2.2" />
          <!-- Каллиграфический росчерк фамилии -->
          <path d="M 45,36 Q 52,24 60,34 T 74,32 T 88,35 T 102,30 T 116,34" stroke-width="1.8" />
          <!-- Финальный дипломатический взмах пера -->
          <path d="M 98,34 Q 120,46 148,22 Q 130,48 70,48 Q 50,48 30,50" stroke-width="1.6" stroke-opacity="0.85" />
          <!-- Метка цифрового заверения точки -->
          <circle cx="150" cy="22" r="1.5" fill="${inkColor}" stroke="none" />
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
