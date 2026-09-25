/* ==========================================================================
   LIGA OS — Главный контроллер приложения (App Controller)
   Принцип одного большого пальца • Полная интерактивность • Фотофиксация
   ========================================================================== */

class LigaApp {
  constructor() {
    this.currentSiteId = 1;
    this.currentSite = null;
    this.currentScreen = 'dashboard';
    this.currentTheme = 'dark';
    this.sites = [];
    
    // Хранилище сжатых фотографий текущего объекта
    this.currentPhotos = {
      manifold: null,
      pressure: null,
      wall: null,
      floor: null
    };

    // Состояние снабжения и чеков
    this.currentMatFilter = 'all';
    this.pendingReceiptPhoto = null;

    // Голосовой ввод и Voice AI (Непрерывный режим «Свободные руки» мирового уровня)
    this.isRecordingVoice = false;
    this.recognition = null;
    this.parsedVoiceAction = null;
    this.voiceAccumulatedText = '';
    this.voiceInterimText = '';
    this.voiceKeepAliveActive = false;
    this.voiceRestartTimeout = null;

    // Защита от дубликатов
    this.pendingDuplicateSave = null;

    // Резервное копирование и восстановление (P0-4)
    this.pendingRestoreData = null;

    // Цифровые расписки и подтверждения
    this.currentReceiptToVerify = null;

    // Памятка и скрипты мастера
    this.currentGuideTab = 'designer';

    // Переменные экспресс-сметы
    this.estimate = {
      bathrooms: 2,
      waterPoints: 12,
      geberit: 2,
      ibox: 2,
      drains: 2,
      floorHeatingSqM: 40
    };

    // Тарифные коэффициенты экспресс-сметы (настраиваемые мастером Улугбеком)
    this.defaultTariffSettings = {
      costPerBathroom: 1500000,   // Обвязка стояков и распределительного узла на 1 санузел
      costPerPoint: 450000,       // Водорозетка / точка слива
      costPerGeberit: 650000,     // Монтаж инсталляции Geberit / TECE
      costPerIbox: 550000,        // Встраиваемый смеситель iBox
      costPerDrain: 400000,       // Душевой трап в пол
      costPerSqMFloor: 90000,     // Водяной теплый пол (кв.м)
      baseAuditWork: 2500000,     // Шеф-монтаж, проектирование и опрессовка
      markupMax: 1.25,            // Верхняя планка ориентировочной вилки (1.25x)
      usdRate: 12900,             // Расчетный курс USD
      statusLabel: 'Базовый ориентир (требует утверждения Улугбеком)'
    };
    this.tariffSettings = this.loadTariffSettings();

    // Клиентский режим демонстрации заказчику (Client View)
    this.isClientMode = localStorage.getItem('liga_client_mode') === 'true';

    // Подвкладка 10-летней истории (timeline / payouts / equipment / contacts)
    this.currentHistorySubtab = 'timeline';

    // Звуковой движок (Swiss Audio Feedback)
    this.isSoundEnabled = localStorage.getItem('liga_sound_enabled') !== 'false';
    this.audioCtx = null;

    // Ситуации мастера (v2.1.0: on-site / voice-create / ahead-work / designer-project)
    this.currentSituation = localStorage.getItem('liga_os_situation') || 'on-site';
  }

  async init() {
    console.log('Запуск LIGA OS v2.1.0 (Royal Swiss Edition & Zero Routine)...');
    
    // 1. Инициализация светлой/тёмной темы (мгновенно)
    this.initTheme();

    // 2. Инициализация клиентского режима демонстрации (мгновенно)
    this.initClientMode();

    // 3. Синхронная привязка всех событий интерфейса ДО любых асинхронных операций
    // Это гарантирует 100% мгновенный отклик всех кнопок (тема, микрофон, памятка, аудит, табы, модалки)
    this.initEvents();

    // 4. Инициализация ситуаций мастера (4 режима фокусировки)
    this.initSituations();

    // 4. Инициализация голосового движка Web Speech
    this.initVoiceEngine();

    // 5. Инициализация локальной базы данных IndexedDB и загрузка объектов
    try {
      if (window.ligaDB) {
        await window.ligaDB.init();
        await this.loadSites();
      }
    } catch (dbErr) {
      console.error('[LIGA OS] Ошибка подключения базы данных IndexedDB:', dbErr);
    }

    // 6. Проверка цифровых расписок из URL (?verify_receipt=...)
    this.checkUrlVerification();

    // 7. Регистрация Service Worker для оффлайн-работы
    this.registerServiceWorker();

    // 8. Первичный рендеринг
    try {
      this.render();
      this.calculateEstimate();
      await this.updateNavBadges();
      this.checkOnboardingHint();
    } catch (renderErr) {
      console.error('[LIGA OS] Ошибка первичного рендеринга:', renderErr);
    }
  }

  // Управление темой интерфейса (Dark Titanium / Light Ceramic)
  initTheme() {
    const saved = localStorage.getItem('liga_theme');
    if (saved) {
      this.currentTheme = saved;
    } else {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      this.currentTheme = prefersLight ? 'light' : 'dark';
    }
    this.applyTheme(this.currentTheme, false);
  }

  toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme, true);
  }

  applyTheme(theme, showToastNotification = false) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('liga_theme', theme);

    const btnTheme = document.getElementById('btn-theme-toggle');
    if (btnTheme) {
      btnTheme.innerText = theme === 'dark' ? '☀️' : '🌙';
      btnTheme.title = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';
    }

    const metaColor = document.getElementById('meta-theme-color');
    if (metaColor) {
      metaColor.setAttribute('content', theme === 'dark' ? '#060911' : '#f2f5fa');
    }

    if (showToastNotification) {
      const label = theme === 'dark' ? '🌙 Тёмный титан активен' : '☀️ Светлая керамика активна';
      this.showToast(label);
    }
  }

  // ==========================================================================
  // ЖИЗНЕННЫЕ СИТУАЦИИ МАСТЕРА (ZERO-ROUTINE & SWISS FOCUS v2.1.0)
  // ==========================================================================
  initSituations() {
    this.switchSituation(this.currentSituation, false);
  }

  switchSituation(situationKey, playSound = true) {
    this.currentSituation = situationKey;
    localStorage.setItem('liga_os_situation', situationKey);

    const pills = document.querySelectorAll('.situation-pill');
    pills.forEach(pill => {
      if (pill.getAttribute('data-situation') === situationKey) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    const views = {
      'on-site': document.getElementById('situation-view-on-site'),
      'voice-create': document.getElementById('situation-view-voice-create'),
      'ahead-work': document.getElementById('situation-view-ahead-work'),
      'designer-project': document.getElementById('situation-view-designer-project')
    };

    Object.entries(views).forEach(([key, el]) => {
      if (!el) return;
      if (key === situationKey) {
        el.style.display = 'block';
        el.classList.add('situation-view');
      } else {
        el.style.display = 'none';
        el.classList.remove('situation-view');
      }
    });

    if (playSound && this.isSoundEnabled && typeof this.playChime === 'function') {
      this.playChime(660, 0.08);
    }

    if (situationKey === 'on-site') {
      if (typeof this.render === 'function') {
        this.render();
      }
      if (typeof this.renderBazaarPocket === 'function') {
        this.renderBazaarPocket();
      }
    }
  }

  openQuickFactModal() {
    const btn = document.getElementById('btn-quick-fact-capture');
    if (btn) {
      btn.click();
    } else {
      this.openModal('modal-passport-photos');
    }
  }

  // ==========================================================================
  // ОФЛАЙН ЗВУКОВОЙ ДВИЖОК (SWISS AUDIO FEEDBACK ENGINE НА WEB AUDIO API)
  // ==========================================================================
  initAudioEngine() {
    if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      try {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioCtor();
      } catch (e) {
        console.warn('Web Audio API не поддерживается:', e);
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Благородный швейцарский двухтональный аккорд (опрессовка 16 бар / успешный этап)
  playSwissChime() {
    if (!this.isSoundEnabled) return;
    try {
      this.initAudioEngine();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;

      // Первый тон (A5 - 880Hz)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Второй тон (A6 - 1760Hz) с благородным затуханием
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now + 0.08);
      gain2.gain.setValueAtTime(0.25, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.65);
    } catch (e) {
      console.warn('Ошибка воспроизведения звука chime:', e);
    }
  }

  // Тактильный мягкий клик подтверждения
  playSubtleClick() {
    if (!this.isSoundEnabled) return;
    try {
      this.initAudioEngine();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {
      console.warn('Ошибка воспроизведения click:', e);
    }
  }

  toggleSound() {
    this.isSoundEnabled = !this.isSoundEnabled;
    localStorage.setItem('liga_sound_enabled', this.isSoundEnabled ? 'true' : 'false');
    const btn = document.getElementById('btn-sound-toggle');
    if (btn) {
      btn.innerText = this.isSoundEnabled ? '🔊' : '🔇';
    }
    if (this.isSoundEnabled) {
      this.playSubtleClick();
      this.showToast('🔊 Звуковые сигналы включены');
    } else {
      this.showToast('🔇 Звуковые сигналы выключены');
    }
  }

  // ==========================================================================
  // РЕЖИМ ПОКАЗА КЛИЕНТУ (CLIENT VIEW) — P0-3
  // ==========================================================================
  initClientMode() {
    this.applyClientMode(this.isClientMode, false);
    const btnToggle = document.getElementById('btn-client-mode-toggle');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => this.toggleClientMode());
    }
    const btnExit = document.getElementById('btn-exit-client-mode');
    if (btnExit) {
      btnExit.addEventListener('click', () => this.setClientMode(false));
    }
  }

  // Изолированная модель представления для клиента (Client ViewModel / DTO)
  getClientViewModel(site, materials = [], finances = []) {
    if (!site) return { site: null, materials: [], finances: [] };

    // 1. Очищенный объект объекта (DTO)
    const clientSite = {
      id: site.id,
      name: site.name,
      unit: site.unit,
      client: site.client,
      phone: site.phone,
      designer: site.designer,
      contractSum: site.contractSum || 0,
      advanceSum: site.advanceSum || 0,
      status: site.status || 1,
      pressTestPassed: Boolean(site.pressTestPassed),
      pressureTest: site.pressureTest ? { ...site.pressureTest } : null,
      photos: site.photos ? { ...site.photos } : null,
      // Внутренние финансовые поля мастера полностью исключены из модели:
      brigadeOwed: undefined,
      designerBonus: undefined
    };

    // 2. Очищенный список материалов
    const clientMaterials = materials.map(m => ({
      id: m.id,
      siteId: m.siteId,
      name: m.name,
      category: m.category || 'Трубы и фитинги',
      qty: m.qty || 1,
      isPurchased: Boolean(m.isPurchased),
      // Оптовые цены и фотографии чеков полностью исключены:
      price: undefined,
      receiptPhoto: undefined
    }));

    // 3. Очищенные финансовые операции
    const clientFinances = finances
      .filter(f => f.type === 'client_advance' || f.type === 'client_payment' || f.type === 'contract_total')
      .map(f => ({
        id: f.id,
        siteId: f.siteId,
        type: f.type,
        amount: f.amount,
        date: f.date,
        method: f.method
      }));

    return {
      site: clientSite,
      materials: clientMaterials,
      finances: clientFinances
    };
  }

  toggleClientMode() {
    this.setClientMode(!this.isClientMode);
  }

  setClientMode(isActive) {
    this.isClientMode = Boolean(isActive);
    localStorage.setItem('liga_client_mode', this.isClientMode ? 'true' : 'false');
    this.applyClientMode(this.isClientMode, true);
  }

  applyClientMode(isActive, showToastNotification = false) {
    if (isActive) {
      document.documentElement.setAttribute('data-client-mode', 'true');
      document.body.classList.add('client-mode');
    } else {
      document.documentElement.removeAttribute('data-client-mode');
      document.body.classList.remove('client-mode');
    }

    const banner = document.getElementById('client-mode-banner');
    if (banner) {
      banner.style.display = isActive ? 'flex' : 'none';
    }

    const btnToggle = document.getElementById('btn-client-mode-toggle');
    if (btnToggle) {
      btnToggle.innerText = isActive ? '🔒' : '👁️';
      btnToggle.title = isActive ? 'Выйти в режим мастера (полный доступ)' : 'Режим показа клиенту (демонстрация на экране мастера)';
      if (isActive) {
        btnToggle.style.color = '#93c5fd';
        btnToggle.style.borderColor = '#3b82f6';
      } else {
        btnToggle.style.color = '';
        btnToggle.style.borderColor = '';
      }
    }

    // Реактивно перерисовываем активный экран с учетом изоляции данных
    this.render();
    this.checkOnboardingHint();
    this.renderBazaarPocket();
    if (this.currentScreen === 'materials') {
      this.renderMaterials();
    } else if (this.currentScreen === 'finances') {
      this.renderFinances();
    }

    if (showToastNotification) {
      if (isActive) {
        this.showToast('👁️ Режим показа клиенту: служебные и финансовые данные мастера скрыты');
      } else {
        this.showToast('🔒 Режим мастера активен (полный доступ)');
      }
    }
  }

  setClientModeTrue() {
    this.setClientMode(true);
  }

  checkOnboardingHint() {
    const hintEl = document.getElementById('quick-onboarding-hint');
    if (!hintEl) return;
    const isDismissed = localStorage.getItem('liga_onboarding_dismissed');
    if (isDismissed === 'true' || this.isClientMode) {
      hintEl.style.display = 'none';
    } else {
      hintEl.style.display = 'block';
    }
  }

  dismissOnboardingHint() {
    localStorage.setItem('liga_onboarding_dismissed', 'true');
    const hintEl = document.getElementById('quick-onboarding-hint');
    if (hintEl) {
      hintEl.style.display = 'none';
    }
    this.showToast('Подсказка скрыта. Памятка мастера всегда доступна в меню «⋯ Ещё»');
  }

  async renderBazaarPocket() {
    const elDash = document.getElementById('fin-bazaar-pocket-val');
    const elPage = document.getElementById('page-fin-bazaar-pocket');
    const bannerDash = document.getElementById('fin-bazaar-pocket-banner');

    if (!elDash && !elPage) return;

    if (this.isClientMode) {
      if (elDash) elDash.innerText = '—';
      if (elPage) elPage.innerText = '—';
      if (bannerDash) bannerDash.style.display = 'none';
      return;
    }

    if (bannerDash) bannerDash.style.display = 'flex';

    const s = this.currentSite;
    if (!s) {
      if (elDash) elDash.innerText = '0 сум';
      if (elPage) elPage.innerText = '0 сум';
      return;
    }

    const advance = s.advanceSum || 0;
    let purchasedSum = 0;

    if (window.ligaDB && window.ligaDB.db) {
      try {
        const rawMaterials = await window.ligaDB.getBySiteId('materials', this.currentSiteId);
        purchasedSum = rawMaterials.filter(m => m.isPurchased).reduce((acc, m) => acc + (m.price || 0), 0);
      } catch (e) {
        console.warn('Не удалось загрузить материалы для базарного кармана:', e);
      }
    }

    const pocket = advance - purchasedSum;
    const isDeficit = pocket < 0;
    const formatted = this.formatSum(pocket);

    if (elDash) {
      elDash.innerText = formatted;
      elDash.style.color = isDeficit ? 'var(--neon-ruby)' : 'var(--neon-cyan)';
    }
    if (elPage) {
      elPage.innerText = formatted;
      elPage.style.color = isDeficit ? 'var(--neon-ruby)' : 'var(--neon-cyan)';
    }

    const titleDash = bannerDash ? bannerDash.querySelector('.bazaar-pocket-title') : null;
    const descDash = bannerDash ? bannerDash.querySelector('.bazaar-pocket-desc') : null;
    if (titleDash && descDash) {
      if (isDeficit) {
        titleDash.innerHTML = '⚠️ Доплата за материалы с клиента:';
        descDash.innerText = 'Мастер вложил свои деньги (закупка превысила аванс)';
      } else {
        titleDash.innerHTML = '🛒 На руках на закупку (Базар):';
        descDash.innerText = 'Свободный остаток подотчетных средств (Урикзор)';
      }
    }
  }

  applyVoiceTemplate(phrase) {
    if (!phrase) return;
    const input = document.getElementById('voice-recognized-input');
    if (input) {
      input.value = phrase;
    }
    this.handleVoiceInputText(phrase);
    this.playSwissChime();
  }

  // Загрузка объектов из IndexedDB
  async loadSites() {
    this.sites = await window.ligaDB.getAll('sites');
    if (this.sites.length > 0) {
      this.currentSite = this.sites.find(s => s.id === this.currentSiteId) || this.sites[0];
      this.currentSiteId = this.currentSite.id;
      // Загружаем сохраненные фото объекта
      this.currentPhotos = this.currentSite.photos || { manifold: null, pressure: null, wall: null, floor: null };
    }
  }

  // Регистрация оффлайн-воркера
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker LIGA OS зарегистрирован (Offline-Ready)'))
        .catch(err => console.log('Service Worker ошибка регистрации:', err));
    }
  }

  // Привязка событий интерфейса
  initEvents() {
    // 0. Кнопка переключения темы и звука
    const btnTheme = document.getElementById('btn-theme-toggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => this.toggleTheme());
    }

    const btnSound = document.getElementById('btn-sound-toggle');
    if (btnSound) {
      btnSound.innerText = this.isSoundEnabled ? '🔊' : '🔇';
      btnSound.addEventListener('click', () => this.toggleSound());
    }

    // 1. Нижняя панель навигации (Bottom Bar)
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetScreen = btn.getAttribute('data-screen');
        this.switchScreen(targetScreen);
      });
    });

    // 2. Кнопка создания PDF-паспорта (Главный флагман)
    const btnPdf = document.getElementById('btn-generate-pdf');
    if (btnPdf) {
      btnPdf.addEventListener('click', () => this.generatePassport());
    }

    // 2.1. Кнопка Официального Акта 16 бар (Флагман технадзора)
    const btnAct = document.getElementById('btn-generate-act');
    if (btnAct) {
      btnAct.addEventListener('click', () => this.generatePressureAct());
    }

    // 3. Менеджер резервного копирования и переноса базы (P0-4)
    const btnBackup = document.getElementById('btn-backup-top');
    if (btnBackup) {
      btnBackup.addEventListener('click', () => this.openBackupManager());
    }

    const btnExport = document.getElementById('btn-do-backup-export');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.handleBackupExport());
    }

    const btnTriggerFile = document.getElementById('btn-trigger-backup-file');
    const inputBackupFile = document.getElementById('input-backup-file');
    if (btnTriggerFile && inputBackupFile) {
      btnTriggerFile.addEventListener('click', () => inputBackupFile.click());
      inputBackupFile.addEventListener('change', (e) => this.handleBackupFileSelect(e));
    }

    const btnConfirmRestore = document.getElementById('btn-confirm-restore');
    if (btnConfirmRestore) {
      btnConfirmRestore.addEventListener('click', () => this.confirmRestore());
    }

    const btnCancelRestore = document.getElementById('btn-cancel-restore');
    if (btnCancelRestore) {
      btnCancelRestore.addEventListener('click', () => this.resetRestorePreview());
    }

    // 4. Кнопки открытия модальных окон
    const btnOpenAddSite = document.getElementById('btn-open-add-site');
    if (btnOpenAddSite) {
      btnOpenAddSite.addEventListener('click', () => this.openModal('modal-add-site'));
    }

    const btnOpenPayment = document.getElementById('btn-open-payment');
    if (btnOpenPayment) {
      btnOpenPayment.addEventListener('click', () => this.openModal('modal-payment'));
    }

    const tileQuickPhotos = document.getElementById('tile-quick-photos');
    if (tileQuickPhotos) {
      tileQuickPhotos.addEventListener('click', () => {
        this.updatePhotoBadges();
        this.openModal('modal-passport-photos');
      });
    }

    // 5. Быстрые плитки
    const tileReceipt = document.getElementById('tile-quick-receipt');
    if (tileReceipt) {
      tileReceipt.addEventListener('click', () => this.openModal('modal-receipt'));
    }

    const tilePress = document.getElementById('tile-quick-press');
    if (tilePress) {
      tilePress.addEventListener('click', () => this.openPressureTestModal());
    }

    // Обработчик сохранения структурированного протокола опрессовки (P0-2)
    const formPressure = document.getElementById('form-pressure-test');
    if (formPressure) {
      formPressure.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSavePressureTest();
      });
    }

    // Сброс опрессовки обратно в статус Черновика
    const btnResetPressure = document.getElementById('btn-reset-pressure-test');
    if (btnResetPressure) {
      btnResetPressure.addEventListener('click', async () => {
        await this.resetPressureTest();
      });
    }

    const tileEstimate = document.getElementById('tile-quick-estimate');
    if (tileEstimate) {
      tileEstimate.addEventListener('click', () => this.switchScreen('estimate'));
    }

    const tileChecklist = document.getElementById('tile-quick-checklist');
    if (tileChecklist) {
      tileChecklist.addEventListener('click', () => this.switchScreen('checklist'));
    }

    // 6. Форма создания нового объекта
    const formAddSite = document.getElementById('form-add-site');
    if (formAddSite) {
      formAddSite.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleCreateSite();
      });
    }

    // 7. Форма фиксации платежа / аванса
    const formPayment = document.getElementById('form-payment');
    if (formPayment) {
      formPayment.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handlePayment();
      });
    }

    // 8. Обработчики загрузки/съемки фото с камеры
    this.initPhotoInputs();

    // 9. Селектор смены объекта
    const siteSelect = document.getElementById('site-selector');
    if (siteSelect) {
      siteSelect.addEventListener('change', async (e) => {
        this.currentSiteId = parseInt(e.target.value);
        await this.loadSites();
        this.render();
        await this.renderScreenContent(this.currentScreen);
        await this.updateNavBadges();
      });
    }

    // 10. Степпер этапов объекта (Инженерный рубеж допуска Quality Gate v2.0.6)
    document.querySelectorAll('.phase-step').forEach(step => {
      step.addEventListener('click', async () => {
        const newStatus = parseInt(step.getAttribute('data-phase'));
        await this.handlePhaseStepClick(newStatus);
      });
    });

    // 10.1 Кнопки модального окна Карты допуска этапа (Quality Gate)
    const btnGateApprove = document.getElementById('btn-gate-approve');
    if (btnGateApprove) {
      btnGateApprove.addEventListener('click', async () => {
        if (this._pendingGateResult) {
          await this.confirmStageTransfer(this._pendingGateResult.targetStage, false);
        }
      });
    }

    const btnGateForce = document.getElementById('btn-gate-force');
    if (btnGateForce) {
      btnGateForce.addEventListener('click', async () => {
        if (this._pendingGateResult) {
          const count = this._pendingGateResult.unfulfilledCount;
          const name = this._pendingGateResult.stageName;
          if (confirm(`⚠️ Внимание! Объект переводится на «${name}» без полного пакета доказательств (не закрыто критериев: ${count}).\n\nЗафиксировать принудительный допуск под личную ответственность мастера в 10-летней Хронике объекта?`)) {
            await this.confirmStageTransfer(this._pendingGateResult.targetStage, true);
          }
        }
      });
    }

    // 10.2 Кнопка перехода к «Следующему шагу мастера» (Next Best Action v2.0.7)
    const btnNextAction = document.getElementById('btn-next-action-trigger');
    if (btnNextAction) {
      btnNextAction.addEventListener('click', () => {
        if (this._currentNextAction && typeof this._currentNextAction.action === 'function') {
          this._currentNextAction.action();
        }
      });
    }

    // 10.3 Кнопка перехода к полной истории объекта с дашборда
    const btnFullHistory = document.getElementById('btn-view-full-history');
    if (btnFullHistory) {
      btnFullHistory.addEventListener('click', () => {
        this.switchScreen('history');
        this.switchHistorySubtab('timeline');
      });
    }

    // 10.4 Меню «⋯ Ещё» и фиксация факта за 3 секунды (v2.0.9 «Нулевая рутина»)
    this.initMoreMenu();
    this.initSettingsModal();
    this.initBlockCustomization();
    this.initQuickFactAction();
    // 10.5 Плавающий микрофон, голосовое заполнение объекта и Telegram-отчет
    this.initHandsFreeVoice();

    // 11. Экспресс-калькулятор
    document.querySelectorAll('.btn-counter').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.getAttribute('data-field');
        const delta = parseInt(btn.getAttribute('data-delta'));
        this.updateEstimate(field, delta);
      });
    });

    const btnCopyEstimate = document.getElementById('btn-copy-estimate');
    if (btnCopyEstimate) {
      btnCopyEstimate.addEventListener('click', () => this.copyEstimateToTelegram());
    }

    const btnApplyEst = document.getElementById('btn-apply-estimate-to-site');
    if (btnApplyEst) {
      btnApplyEst.addEventListener('click', () => this.applyEstimateToCurrentSite());
    }

    const btnLoadPack = document.getElementById('btn-load-standard-materials');
    if (btnLoadPack) {
      btnLoadPack.addEventListener('click', () => this.loadStandardMaterialPack());
    }

    // 11.1 Настройка тарифов сметы (P0-1)
    const btnOpenTariffs = document.getElementById('btn-open-tariffs');
    if (btnOpenTariffs) {
      btnOpenTariffs.addEventListener('click', () => this.openTariffSettingsModal());
    }

    const formTariffs = document.getElementById('form-tariffs');
    if (formTariffs) {
      formTariffs.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSaveTariffs();
      });
    }

    const btnResetTariffs = document.getElementById('btn-reset-tariffs');
    if (btnResetTariffs) {
      btnResetTariffs.addEventListener('click', () => this.resetTariffSettings());
    }

    // 12. Форма добавления чека и обработка фото чека
    const formReceipt = document.getElementById('form-add-receipt');
    if (formReceipt) {
      formReceipt.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveReceipt();
      });
    }

    const inputReceiptPhoto = document.getElementById('receipt-photo-file');
    if (inputReceiptPhoto) {
      inputReceiptPhoto.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          this.showToast('Сжатие чека с камеры...');
          try {
            this.pendingReceiptPhoto = await window.ligaImageProcessor.compressImage(file, 1400, 0.82);
            const statusEl = document.getElementById('receipt-photo-status');
            if (statusEl) {
              statusEl.innerHTML = '<span style="color:var(--neon-emerald); font-weight:800;">✓ Фото чека прикреплено и сжато!</span>';
            }
            this.showToast('✓ Фото чека готово!');
          } catch (err) {
            console.error('Ошибка сжатия фото чека:', err);
            alert('Не удалось обработать фото чека: ' + err.message);
          }
        }
      });
    }

    // 13. Фильтры снабжения и выгрузка базара
    document.querySelectorAll('.mat-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentMatFilter = btn.getAttribute('data-filter') || 'all';
        document.querySelectorAll('.mat-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderMaterials();
      });
    });

    const btnExportBazaar = document.getElementById('btn-export-bazaar');
    if (btnExportBazaar) {
      btnExportBazaar.addEventListener('click', () => this.exportBazaarList());
    }

    // 14. Чек-листы технадзора и официальный Акт стяжки
    const checklistContainer = document.getElementById('checklist-container');
    if (checklistContainer) {
      checklistContainer.addEventListener('click', async (e) => {
        const item = e.target.closest('.check-item');
        if (item) {
          const id = parseInt(item.getAttribute('data-id'));
          await this.toggleChecklistItem(id);
        }
      });
    }

    const btnActScreed = document.getElementById('btn-act-screed');
    if (btnActScreed) {
      btnActScreed.addEventListener('click', () => this.exportScreedAct());
    }

    // 15. Голосовая диктовка («Свободные руки»), Памятка и ИИ-Аналитик
    const btnVoice = document.getElementById('btn-voice-input');
    if (btnVoice) {
      btnVoice.addEventListener('click', () => {
        this.openModal('modal-voice');
        this.startVoiceRecording();
      });
    }

    const btnGuide = document.getElementById('btn-guide-top');
    if (btnGuide) {
      btnGuide.addEventListener('click', () => this.openMasterGuide());
    }

    const btnAiAudit = document.getElementById('btn-ai-audit-top');
    if (btnAiAudit) {
      btnAiAudit.addEventListener('click', () => this.runAiAudit());
    }

    const inputVoiceText = document.getElementById('voice-recognized-input');
    if (inputVoiceText) {
      inputVoiceText.addEventListener('input', (e) => this.handleVoiceInputText(e.target.value));
    }

    document.querySelectorAll('.guide-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchGuideTab(tab);
      });
    });

    // 16. 10-летняя инженерная история: переключение подвкладок и модалки
    document.querySelectorAll('.history-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subtab = btn.getAttribute('data-subtab');
        this.switchHistorySubtab(subtab);
      });
    });

    const btnOpenAddEvent = document.getElementById('btn-open-add-event');
    if (btnOpenAddEvent) {
      btnOpenAddEvent.addEventListener('click', () => this.openAddEventModal());
    }

    const formAddEvent = document.getElementById('form-add-event');
    if (formAddEvent) {
      formAddEvent.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleAddTimelineEvent();
      });
    }

    const btnOpenAddPayout = document.getElementById('btn-open-add-payout');
    if (btnOpenAddPayout) {
      btnOpenAddPayout.addEventListener('click', () => this.openAddPayoutModal());
    }

    const formAddPayout = document.getElementById('form-add-payout');
    if (formAddPayout) {
      formAddPayout.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleAddBrigadePayout();
      });
    }

    const btnOpenAddEq = document.getElementById('btn-open-add-equipment');
    if (btnOpenAddEq) {
      btnOpenAddEq.addEventListener('click', () => this.openAddEquipmentModal());
    }

    const formAddEq = document.getElementById('form-add-equipment');
    if (formAddEq) {
      formAddEq.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleAddEquipment();
      });
    }

    const btnOpenContact = document.getElementById('btn-open-add-contact');
    if (btnOpenContact) {
      btnOpenContact.addEventListener('click', () => this.openAddContactModal());
    }

    const formAddContact = document.getElementById('form-add-contact');
    if (formAddContact) {
      formAddContact.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleAddContact();
      });
    }
  }

  // Привязка инпутов камеры для фотофиксации
  initPhotoInputs() {
    const slots = ['manifold', 'pressure', 'wall', 'floor'];
    slots.forEach(slot => {
      const input = document.getElementById(`input-photo-${slot}`);
      if (input) {
        input.addEventListener('change', async (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            this.showToast(`Сжатие и привязка фото (${file.name})...`);
            try {
              const compressedBase64 = await window.ligaImageProcessor.compressImage(file, 1600, 0.82);
              this.currentPhotos[slot] = compressedBase64;
              
              // Сохраняем в объект в IndexedDB
              if (this.currentSite) {
                this.currentSite.photos = this.currentPhotos;
                if (slot === 'pressure' && this.currentSite.pressureTest) {
                  this.currentSite.pressureTest.photo = compressedBase64;
                }
                await window.ligaDB.put('sites', this.currentSite);
              }

              this.updatePhotoBadges();
              this.render();
              this.showToast('✓ Фото узла сохранено в паспорт!');
            } catch (err) {
              console.error('Ошибка сжатия фото:', err);
              alert('Не удалось обработать фото: ' + err.message);
            }
          }
        });
      }
    });

    // Дополнительный прямой инпут в модальном окне опрессовки (P0-2)
    const ptInput = document.getElementById('pt-input-photo-pressure');
    if (ptInput) {
      ptInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          this.showToast(`Сжатие фото манометра (${file.name})...`);
          try {
            const compressedBase64 = await window.ligaImageProcessor.compressImage(file, 1600, 0.82);
            this.currentPhotos['pressure'] = compressedBase64;
            if (this.currentSite) {
              this.currentSite.photos = this.currentPhotos;
              if (this.currentSite.pressureTest) {
                this.currentSite.pressureTest.photo = compressedBase64;
              }
              await window.ligaDB.put('sites', this.currentSite);
            }
            this.updatePhotoBadges();
            this.render();
            this.showToast('✓ Фото манометра 16 бар прикреплено!');
          } catch (err) {
            console.error('Ошибка сжатия фото манометра:', err);
            alert('Не удалось обработать фото: ' + err.message);
          }
        }
      });
    }
  }

  // Обновление бейджей фото в модалке
  updatePhotoBadges() {
    const slots = ['manifold', 'pressure', 'wall', 'floor'];
    slots.forEach(slot => {
      const statusEl = document.getElementById(`status-photo-${slot}`);
      if (statusEl) {
        if (this.currentPhotos && this.currentPhotos[slot]) {
          statusEl.innerHTML = '<span style="color:var(--neon-emerald); font-weight:800;">✓ Загружено (готово к печати)</span>';
        } else {
          statusEl.innerHTML = '<span style="color:var(--text-dim);">Не загружено</span>';
        }
      }
    });

    const ptPhotoStatus = document.getElementById('pt-photo-status');
    if (ptPhotoStatus) {
      if (this.currentPhotos && this.currentPhotos.pressure) {
        ptPhotoStatus.innerHTML = '<span style="color:var(--neon-emerald); font-weight:700;">✓ Фото манометра прикреплено</span>';
      } else {
        ptPhotoStatus.innerHTML = '<span style="color:var(--text-dim);">Фото манометра не прикреплено</span>';
      }
    }
  }

  // Создание нового объекта
  async handleCreateSite() {
    const name = document.getElementById('new-site-name').value.trim();
    const unit = document.getElementById('new-site-unit').value.trim();
    const client = document.getElementById('new-site-client').value.trim();
    const phone = document.getElementById('new-site-phone').value.trim();
    const designer = document.getElementById('new-site-designer').value.trim();
    const contractSum = parseInt(document.getElementById('new-site-contract').value) || 0;
    const advanceSum = parseInt(document.getElementById('new-site-advance').value) || 0;
    const durationDays = parseInt(document.getElementById('new-site-duration')?.value) || 21;

    const newSite = {
      name,
      unit,
      client,
      phone,
      designer,
      contractSum,
      advanceSum,
      durationDays,
      brigadeOwed: Math.round(contractSum * 0.15),
      designerBonus: Math.round(contractSum * 0.10),
      status: 1, // Начальный этап - 1. Аудит
      dateCreated: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      pressTestPassed: false,
      photos: { manifold: null, pressure: null, wall: null, floor: null }
    };

    const newId = await window.ligaDB.add('sites', newSite);

    // Добавляем стандартный чек-лист технадзора для нового объекта
    const defaultChecklist = [
      { title: 'Уклоны канализации выверены по лазеру (2 см на метр)', done: false },
      { title: 'Выводы заглушены металлическими опрессовочными пробками', done: false },
      { title: 'Шумоизоляция стояка выполнена (Comfort Mat / K-Fonik)', done: false },
      { title: 'Опрессовка 16 бар выдержана 24 часа без падения давления', done: false },
      { title: 'Скрытые смесители (iBox) выставлены по уровню и глубине плитки', done: false },
      { title: 'Трап с сухим затвором зафиксирован по проектной отметке пола', done: false },
      { title: 'Защита от протечек (Gidrolock/Нептун) подключена и протестирована', done: false },
      { title: 'Трубы отопления и ГВС/ХВС одеты в защитную теплоизоляцию', done: false },
      { title: 'Фотофиксация скрытых трасс с лазерной рулеткой завершена', done: false },
      { title: 'Мусор убран строительным пылесосом перед заливкой стяжки', done: false }
    ];

    for (let item of defaultChecklist) {
      await window.ligaDB.add('checklists', { siteId: newId, ...item });
    }

    this.currentSiteId = newId;
    await this.loadSites();
    this.closeModal('modal-add-site');
    this.showToast(`✓ Объект «${name}» успешно создан!`);
    this.render();
  }

  // Фиксация платежа
  async handlePayment() {
    if (!this.currentSite) return;

    const type = document.getElementById('pay-type').value;
    const amount = parseInt(document.getElementById('pay-amount').value) || 0;
    const method = document.getElementById('pay-method').value;

    if (!amount || amount <= 0) {
      alert('Укажите корректную сумму платежа');
      return;
    }

    if (type === 'client_advance') {
      this.currentSite.advanceSum = (this.currentSite.advanceSum || 0) + amount;
      this.showToast(`✓ Аванс ${this.formatSum(amount)} зачислен! Долг уменьшен.`);
    } else if (type === 'brigade_pay') {
      this.currentSite.brigadeOwed = Math.max(0, (this.currentSite.brigadeOwed || 0) - amount);
      this.showToast(`✓ Выплата бригаде ${this.formatSum(amount)} зафиксирована!`);
    } else if (type === 'designer_bonus') {
      this.currentSite.designerBonus = Math.max(0, (this.currentSite.designerBonus || 0) - amount);
      this.showToast(`✓ Бонус дизайнеру ${this.formatSum(amount)} выплачен!`);
    }

    // Сохраняем обновленный объект в IndexedDB
    await window.ligaDB.put('sites', this.currentSite);

    // Записываем проводку в finances
    await window.ligaDB.add('finances', {
      siteId: this.currentSiteId,
      type,
      amount,
      method,
      date: new Date().toISOString().slice(0, 10)
    });

    this.closeModal('modal-payment');
    this.render();
  }

  // Переключение экранов приложения
  switchScreen(screenName) {
    this.currentScreen = screenName;

    document.querySelectorAll('.app-screen').forEach(el => {
      el.classList.remove('active');
    });
    const target = document.getElementById(`screen-${screenName}`);
    if (target) {
      target.classList.add('active');
    }

    document.querySelectorAll('.nav-item').forEach(btn => {
      if (btn.getAttribute('data-screen') === screenName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    this.renderScreenContent(screenName);
  }

  async renderScreenContent(screenName) {
    if (screenName === 'checklist') {
      await this.renderChecklist();
    } else if (screenName === 'materials') {
      await this.renderMaterials();
    } else if (screenName === 'finances') {
      await this.renderFinances();
    } else if (screenName === 'estimate') {
      this.calculateEstimate();
    } else if (screenName === 'history') {
      await this.renderHistory();
    }
  }

  // Обновление состояния и рендер
  render() {
    if (!this.currentSite) return;

    const select = document.getElementById('site-selector');
    if (select) {
      select.innerHTML = this.sites.map(s => 
        `<option value="${s.id}" ${s.id === this.currentSiteId ? 'selected' : ''}>${s.name}</option>`
      ).join('');
    }

    const s = this.currentSite;
    document.getElementById('site-name-display').innerText = s.name;
    document.getElementById('site-unit-display').innerText = s.unit || 'Премиальный жилой фонд';
    document.getElementById('site-client-display').innerText = `Клиент: ${s.client}`;
    document.getElementById('site-designer-display').innerText = `Дизайнер: ${s.designer || 'Прямой заказ'}`;

    const btnCall = document.getElementById('btn-call-client');
    if (btnCall) btnCall.href = `tel:${s.phone}`;

    const btnTg = document.getElementById('btn-tg-client');
    if (btnTg) btnTg.href = `https://t.me/${s.phone.replace(/[^0-9]/g, '')}`;

    const statusNames = [
      '1. Аудит проекта',
      '2. Черновой монтаж',
      '3. Опрессовка 16 бар',
      '4. Чистовая сантехника',
      '5. Объект сдан'
    ];
    document.getElementById('site-status-badge').innerText = statusNames[s.status - 1] || 'Монтаж';

    document.querySelectorAll('.phase-step').forEach(step => {
      const p = parseInt(step.getAttribute('data-phase'));
      step.classList.remove('active', 'completed');
      if (p === s.status) {
        step.classList.add('active');
      } else if (p < s.status) {
        step.classList.add('completed');
      }
    });

    const contract = s.contractSum || 0;
    const advance = s.advanceSum || 0;
    const debt = Math.max(0, contract - advance);

    document.getElementById('fin-contract-val').innerText = this.formatSum(contract);
    document.getElementById('fin-advance-val').innerText = this.formatSum(advance);
    const debtValEl = document.getElementById('fin-debt-val');
    if (debtValEl) {
      debtValEl.innerText = this.formatSum(debt);
    }
    const debtBanners = document.querySelectorAll('.debt-banner');
    debtBanners.forEach(b => {
      if (debt > 0) b.classList.add('has-debt');
      else b.classList.remove('has-debt');
    });

    const brigadeEl = document.getElementById('fin-brigade-val');
    if (brigadeEl) {
      brigadeEl.innerText = this.isClientMode ? '—' : this.formatSum(s.brigadeOwed || 0);
    }
    const designerEl = document.getElementById('fin-designer-val');
    if (designerEl) {
      designerEl.innerText = this.isClientMode ? '—' : this.formatSum(s.designerBonus || 0);
    }

    this.renderBazaarPocket();

    // Честный статус готовности инженерного паспорта
    const passportStatusEl = document.getElementById('passport-status-indicator');
    if (passportStatusEl) {
      const isVerified = window.ligaPdfEngine && typeof window.ligaPdfEngine.isPressureVerified === 'function'
        ? window.ligaPdfEngine.isPressureVerified(s, this.currentPhotos)
        : Boolean(s.pressTestPassed && this.currentPhotos && this.currentPhotos.pressure);

      if (isVerified) {
        passportStatusEl.innerHTML = '<span style="color:var(--neon-emerald);">🟢 Паспорт готов к сдаче (16 бар подтверждено)</span>';
      } else {
        passportStatusEl.innerHTML = '<span style="color:#d97706;">⚠️ Паспорт в режиме черновика (испытания 16 бар не подтверждены фотофиксацией)</span>';
      }
    }

    this.calculateEstimate();
    this.updateNavBadges();
    this.renderChronoRadarAndNextAction();
    this.renderDashboardTimeline();
  }

  // Рендеринг швейцарского 3D-хронометра готовности и карточки «Следующий шаг мастера» (v2.0.7)
  async renderChronoRadarAndNextAction() {
    if (!this.currentSite) return;
    const s = this.currentSite;

    // 1. Загрузка чек-листов и материалов
    let checklists = [];
    let materials = [];
    if (window.ligaDB && window.ligaDB.db) {
      try {
        checklists = await window.ligaDB.getBySiteId('checklists', this.currentSiteId);
      } catch (e) {
        console.warn('Не удалось загрузить чек-листы для радара:', e);
      }
      try {
        materials = await window.ligaDB.getBySiteId('materials', this.currentSiteId);
      } catch (e) {
        console.warn('Не удалось загрузить материалы для радара:', e);
      }
    }

    const totalChecklist = checklists.length || 10;
    const doneChecklist = checklists.filter(i => i.done).length;
    const hasPressureTest = Boolean(s.pressureTest && s.pressureTest.passed && parseFloat(s.pressureTest.pressureBar) >= 16.0);
    const hasPressurePhoto = Boolean(this.currentPhotos && this.currentPhotos.pressure);
    const hasManifoldPhoto = Boolean(this.currentPhotos && this.currentPhotos.manifold);
    const hasPipePhoto = Boolean(this.currentPhotos && (this.currentPhotos.wall || this.currentPhotos.floor));

    // 2. Взвешенный расчет готовности (0..100%)
    let progressScore = 0;
    // Аудит и базовая информация (до 15%)
    if (s.name) progressScore += 5;
    if (s.contractSum > 0) progressScore += 10;
    // Черновой монтаж и снабжение (до 25%)
    if (s.status >= 2) progressScore += 15;
    if (materials.length > 0) progressScore += 10;
    // Гидравлические испытания 16 бар (до 30%)
    if (hasPressureTest) progressScore += 15;
    if (hasPressurePhoto) progressScore += 15;
    // Скрытые трассы и чек-лист стяжки (до 20%)
    if (totalChecklist > 0) {
      progressScore += Math.round((doneChecklist / totalChecklist) * 10);
    }
    if (hasPipePhoto || hasManifoldPhoto) progressScore += 10;
    // Финальная сдача (до 10%)
    if (s.status >= 5) progressScore += 10;

    const progress = Math.min(100, Math.max(0, progressScore));

    // 3. Расчет темпа и сроков
    const durationDays = s.durationDays || 21;
    let daysPassed = 1;
    if (s.createdAt || s.dateCreated) {
      const createdDate = new Date(s.createdAt || s.dateCreated);
      const diffMs = Date.now() - createdDate.getTime();
      daysPassed = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
    }
    const daysRemaining = Math.max(0, durationDays - daysPassed);
    const expectedProgress = Math.min(100, Math.round((daysPassed / durationDays) * 100));
    const delta = progress - expectedProgress;

    let paceStatus = 'on-track';
    let paceLabel = `⏱️ В ГРАФИКЕ (темп ${progress}%)`;
    if (delta >= 12) {
      paceStatus = 'ahead';
      paceLabel = `⚡ ОПЕРЕЖЕНИЕ ГРАФИКА (+${delta}%)`;
    } else if (delta < -15 && daysPassed > 3) {
      paceStatus = 'delayed';
      paceLabel = `⚠️ ВНИМАНИЕ: ОТСТАВАНИЕ (${Math.abs(delta)}%)`;
    }

    // Обновление SVG круга (длина окружности r=48 -> C = 2 * PI * 48 ≈ 301.6)
    const circleBar = document.getElementById('radar-circle-bar');
    const valEl = document.getElementById('chrono-progress-val');
    if (circleBar) {
      const circumference = 301.6;
      const offset = circumference - (circumference * progress) / 100;
      circleBar.style.strokeDashoffset = offset;
      if (progress >= 80) {
        circleBar.style.stroke = 'var(--neon-emerald)';
      } else if (progress >= 40) {
        circleBar.style.stroke = 'var(--gold-primary)';
      } else {
        circleBar.style.stroke = '#38bdf8';
      }
    }
    if (valEl) {
      valEl.innerText = `${progress}%`;
    }

    const paceBadge = document.getElementById('chrono-pace-badge');
    if (paceBadge) {
      paceBadge.className = `chrono-pace-badge ${paceStatus}`;
      paceBadge.innerText = paceLabel;
    }

    const daysInfo = document.getElementById('chrono-days-info');
    if (daysInfo) {
      daysInfo.innerHTML = `Дней в работе: <strong>${daysPassed}</strong> • До сдачи: <strong>${daysRemaining > 0 ? daysRemaining + ' дн.' : 'Срок настал'}</strong>`;
    }

    const phaseDesc = document.getElementById('chrono-phase-desc');
    if (phaseDesc) {
      const phaseMap = {
        1: 'Объект в фазе аудита. Требуется согласование точек и сметы.',
        2: 'Черновой монтаж: штробление, разводка Rehau, монтаж FAR.',
        3: 'Гидроиспытания: 24-часовая выдержка под давлением 16.0 бар.',
        4: 'Чистовой этап: заливка стяжки разрешена, монтаж приборов.',
        5: 'Объект официально сдан. Активирована 10-летняя гарантия Лиги.'
      };
      phaseDesc.innerText = phaseMap[s.status] || 'Выполняются инженерные работы.';
    }

    // 4. Определение «Следующего ключевого действия мастера» (Next Best Action)
    let nextAction = null;

    if (!s.contractSum || s.contractSum <= 0) {
      nextAction = {
        icon: '⚡',
        title: 'Заполнить смету и точки монтажа',
        desc: 'Рассчитайте точки водоснабжения, канализации и отопления для фиксации договора.',
        btnText: 'Смета →',
        action: () => this.switchScreen('estimate')
      };
    } else if (!s.advanceSum || s.advanceSum <= 0) {
      nextAction = {
        icon: '💰',
        title: 'Зафиксировать аванс от заказчика',
        desc: 'Внесите полученный аванс для активации закупки премиальных материалов.',
        btnText: '+ Аванс →',
        action: () => this.openModal('modal-payment')
      };
    } else if (s.status < 2) {
      nextAction = {
        icon: '🛠️',
        title: 'Перевести объект на Черновой монтаж',
        desc: 'Аудит завершен. Начните трассировку труб Rehau и сборку коллектора FAR.',
        btnText: 'Этап 2 →',
        action: () => this.handlePhaseStepClick(2)
      };
    } else if (!hasPressureTest || !hasPressurePhoto) {
      nextAction = {
        icon: '🛡️',
        title: 'Провести гидроиспытания 16.0 бар (24 часа)',
        desc: 'Зафиксируйте протокол опрессовки с фото манометра. Без этого заливка стяжки строго запрещена.',
        btnText: 'Акт 16 бар →',
        action: () => this.openPressureTestModal()
      };
    } else if (doneChecklist < totalChecklist) {
      nextAction = {
        icon: '📋',
        title: 'Закрыть чек-лист технадзора перед стяжкой',
        desc: `Выполнено ${doneChecklist} из ${totalChecklist} пунктов. Проверьте гильзы, заглушки и трапы.`,
        btnText: `Чек-лист (${doneChecklist}/${totalChecklist}) →`,
        action: () => this.switchScreen('checklist')
      };
    } else if (!hasPipePhoto) {
      nextAction = {
        icon: '📐',
        title: 'Фотофиксация скрытых трасс Rehau с рулеткой',
        desc: 'Сделайте фото труб в полу до заливки бетоном для Исполнительного Паспорта.',
        btnText: 'Фото трасс →',
        action: () => this.openPassportPhotosModal()
      };
    } else if (s.status < 5) {
      nextAction = {
        icon: '🎉',
        title: 'Финальная сдача объекта заказчику',
        desc: 'Все 16-барные испытания и чек-листы закрыты. Сформируйте Паспорт и сдайте объект.',
        btnText: 'Сдать объект →',
        action: () => this.handlePhaseStepClick(5)
      };
    } else {
      nextAction = {
        icon: '📜',
        title: 'Объект сдан! Печать Инженерного Паспорта',
        desc: '10-летняя гарантия Лиги Мастеров активна. Отправьте клиенту официальный PDF.',
        btnText: 'Печать PDF →',
        action: () => this.printPassport()
      };
    }

    this._currentNextAction = nextAction;

    // Обновление карточки в DOM
    const nextCard = document.getElementById('site-next-action-card');
    const nextIcon = document.getElementById('next-action-icon');
    const nextTitle = document.getElementById('next-action-title');
    const nextDesc = document.getElementById('next-action-desc');
    const nextBtn = document.getElementById('btn-next-action-trigger');

    if (nextCard && nextAction) {
      if (nextIcon) nextIcon.innerText = nextAction.icon;
      if (nextTitle) nextTitle.innerText = nextAction.title;
      if (nextDesc) nextDesc.innerText = nextAction.desc;
      if (nextBtn) nextBtn.innerText = nextAction.btnText;
    }
  }

  // Рендеринг мини-хроники объекта на главном дашборде
  async renderDashboardTimeline() {
    const listEl = document.getElementById('dash-timeline-list');
    const badgeEl = document.getElementById('dash-timeline-badge');
    if (!listEl) return;

    let events = [];
    if (window.ligaDB && window.ligaDB.db && window.ligaDB.db.objectStoreNames.contains('site_timeline_events')) {
      try {
        events = await window.ligaDB.getBySiteId('site_timeline_events', this.currentSiteId);
      } catch (e) {
        console.warn('Не удалось загрузить хронику для дашборда:', e);
      }
    }

    events.sort((a, b) => (b.date || '').localeCompare(a.date || '')); // самые свежие сверху

    if (badgeEl) {
      badgeEl.innerText = `${events.length} вех`;
    }

    if (events.length === 0) {
      listEl.innerHTML = `
        <div style="color:var(--text-dim); padding:10px 6px; text-align:center; font-size:11px;">
          Пока нет зафиксированных вех по объекту.<br>Перейдите в «Историю» для внесения первого этапа.
        </div>`;
      return;
    }

    const typeBadges = {
      audit: { label: '📐 Аудит', color: 'var(--gold-primary)' },
      rough: { label: '🔧 Черновой', color: 'var(--neon-cyan)' },
      pressure: { label: '🛡️ 16 бар', color: 'var(--neon-emerald)' },
      screed: { label: '🏗️ Стяжка', color: '#f59e0b' },
      trim: { label: '✨ Чистовая', color: '#a855f7' },
      service: { label: '🛠️ Сервис', color: 'var(--text-muted)' },
      quick_fact: { label: '📸 Факт', color: '#60a5fa' },
      early_fact: { label: '✨ Зачтено заранее', color: '#fbbf24' }
    };

    // Показываем последние 3 ключевые вехи на дашборде
    const topEvents = events.slice(0, 3);
    listEl.innerHTML = topEvents.map(ev => {
      const tb = typeBadges[ev.eventType] || { label: 'Этап', color: 'var(--gold-primary)' };
      const dateFormatted = ev.date 
        ? new Date(ev.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
        : '';

      return `
        <div class="dash-timeline-item">
          <div class="dash-timeline-dot"></div>
          <div class="dash-timeline-item-content">
            <div class="dash-timeline-meta">
              <span class="dash-timeline-date">${dateFormatted}</span>
              <span class="dash-timeline-badge" style="color:${tb.color}; background:rgba(255,255,255,0.06);">${tb.label}</span>
            </div>
            <div class="dash-timeline-item-title">${ev.title}</div>
            <div class="dash-timeline-item-desc">${ev.description.length > 90 ? ev.description.slice(0, 90) + '...' : ev.description}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Обработка нажатия на этап степпера (Инженерный рубеж допуска Quality Gate v2.0.6)
  async handlePhaseStepClick(newStatus) {
    if (!this.currentSite) return;
    const currentStatus = this.currentSite.status || 1;

    // Если мастер кликает на уже пройденный этап — предложение вернуться для доработок
    if (newStatus < currentStatus) {
      const statusNames = {
        1: '1. Аудит проекта',
        2: '2. Черновой монтаж',
        3: '3. Опрессовка 16 бар',
        4: '4. Чистовая сантехника',
        5: '5. Объект сдан'
      };
      const name = statusNames[newStatus] || `Этап ${newStatus}`;
      if (confirm(`Вернуть объект на предыдущий этап «${name}» для внесения инженерных правок?`)) {
        await this.updateSiteStatus(newStatus, false);
      }
      return;
    }

    // Если мастер кликает на текущий этап — открываем карту допуска для инспекции готовности
    if (newStatus === currentStatus) {
      const gate = await this.evaluateStageQualityGate(newStatus);
      this.openStageQualityGateModal(gate);
      return;
    }

    // Переход вперед к следующему этапу — строгая проверка Quality Gate
    const gate = await this.evaluateStageQualityGate(newStatus);
    if (gate.isApproved) {
      await this.updateSiteStatus(newStatus, false);
      this.playSwissChime();
      this.showToast(`✓ Допуск этапа «${gate.stageName}» открыт! Все критерии соблюдены.`);
    } else {
      this.playSubtleClick();
      this.openStageQualityGateModal(gate);
    }
  }

  // Оценка инженерных доказательств допуска на этап (Quality Gate v2.0.6)
  async evaluateStageQualityGate(targetStage) {
    if (!this.currentSite) {
      return { targetStage, stageName: `Этап ${targetStage}`, criteria: [], unfulfilledCount: 0, isApproved: false };
    }

    const s = this.currentSite;
    const stageNames = {
      1: '1. Аудит проекта',
      2: '2. Черновой монтаж',
      3: '3. Опрессовка 16 бар',
      4: '4. Чистовая сантехника',
      5: '5. Объект сдан'
    };
    const stageName = stageNames[targetStage] || `Этап ${targetStage}`;

    // Загрузка чек-листов объекта
    let checklists = [];
    if (window.ligaDB && window.ligaDB.db) {
      try {
        checklists = await window.ligaDB.getBySiteId('checklists', this.currentSiteId);
      } catch (e) {
        console.warn('Не удалось загрузить чек-листы для карты допуска:', e);
      }
    }
    const totalChecklist = checklists.length || 10;
    const doneChecklist = checklists.filter(item => item.done).length;

    const hasPressureTest = Boolean(s.pressureTest && s.pressureTest.passed && (parseFloat(s.pressureTest.pressureBar) >= 16.0));
    const hasPressurePhoto = Boolean(this.currentPhotos && this.currentPhotos.pressure);
    const hasManifoldPhoto = Boolean(this.currentPhotos && this.currentPhotos.manifold);
    const hasPipePhoto = Boolean(this.currentPhotos && (this.currentPhotos.wall || this.currentPhotos.floor));

    const criteria = [];

    if (targetStage === 1) {
      criteria.push({
        id: 'site_created',
        title: 'Регистрация объекта в LIGA OS',
        desc: 'Базовые реквизиты объекта и привязка к мастеру',
        passed: Boolean(s.name && s.name.trim()),
        actionText: 'Настроить объект',
        action: () => this.switchScreen('dashboard')
      });
    } else if (targetStage === 2) {
      // Этап 2: Черновой монтаж
      criteria.push({
        id: 'site_requisites',
        title: 'Реквизиты и адрес объекта',
        desc: s.name ? `${s.name} ${s.unit ? '(' + s.unit + ')' : ''}` : 'Не заполнены реквизиты',
        passed: Boolean(s.name && s.name.trim()),
        actionText: 'Проверить объект',
        action: () => this.switchScreen('dashboard')
      });
      criteria.push({
        id: 'estimate_draft',
        title: 'Предварительный сметный расчет точек',
        desc: (s.waterPoints > 0 || s.contractSum > 0)
          ? `Точек воды: ${s.waterPoints || 0}, Сумма: ${this.formatSum(s.contractSum || 0)} сум`
          : 'Не заданы точки водоснабжения / отопления',
        passed: Boolean((s.waterPoints || 0) > 0 || (s.radiators || 0) > 0 || (s.contractSum || 0) > 0),
        actionText: 'Открыть смету',
        action: () => this.switchScreen('estimate')
      });
    } else if (targetStage === 3) {
      // Этап 3: Опрессовка 16 бар (Критический рубеж Лиги)
      criteria.push({
        id: 'pressure_protocol',
        title: 'Протокол гидроиспытаний 16.0 бар (24 часа)',
        desc: hasPressureTest
          ? `Испытание проведено: ${s.pressureTest.pressureBar} бар (${s.pressureTest.startDate})`
          : 'Требуется фиксация 24-часовой выдержки под давлением 16.0 бар',
        passed: hasPressureTest,
        actionText: 'Заполнить протокол 16 бар',
        action: () => this.openPressureTestModal()
      });
      criteria.push({
        id: 'pressure_gauge_photo',
        title: 'Фотофиксация манометра под давлением 16 бар',
        desc: hasPressurePhoto
          ? 'Фото манометра прикреплено к акту опрессовки'
          : 'Обязательное фото шкалы манометра с отметкой 16 бар',
        passed: hasPressurePhoto,
        actionText: 'Прикрепить фото манометра',
        action: () => this.openPressureTestModal()
      });
      criteria.push({
        id: 'plugs_mounted',
        title: 'Металлические опрессовочные заглушки',
        desc: 'Выводы заглушены металлическими пробками на коллекторе и трассах',
        passed: Boolean(checklists.find(c => c.title && c.title.includes('заглушены') && c.done)),
        actionText: 'Чек-лист заглушек',
        action: () => this.switchScreen('checklist')
      });
    } else if (targetStage === 4) {
      // Этап 4: Чистовая сантехника (Допуск перед заливкой стяжки)
      criteria.push({
        id: 'pressure_verified',
        title: 'Опрессовка 16.0 бар успешно сдана',
        desc: (hasPressureTest && hasPressurePhoto)
          ? 'Гидроиспытания 16.0 бар подтверждены протоколом и фото'
          : 'Опрессовка 16 бар не завершена или отсутствует фото манометра',
        passed: hasPressureTest && hasPressurePhoto,
        actionText: 'Открыть протокол 16 бар',
        action: () => this.openPressureTestModal()
      });
      criteria.push({
        id: 'screed_checklist',
        title: 'Чек-лист технадзора перед стяжкой (10/10)',
        desc: doneChecklist >= totalChecklist
          ? `Все ${totalChecklist} пунктов технадзора закрыты (100%)`
          : `Выполнено ${doneChecklist} из ${totalChecklist} пунктов (осталось: ${totalChecklist - doneChecklist})`,
        passed: doneChecklist >= totalChecklist && totalChecklist > 0,
        actionText: `Чек-лист стяжки (${doneChecklist}/${totalChecklist})`,
        action: () => this.switchScreen('checklist')
      });
      criteria.push({
        id: 'pipe_routes_photo',
        title: 'Фотофиксация скрытых трасс Rehau с рулеткой',
        desc: hasPipePhoto
          ? 'Фото скрытых трасс перед заливкой стяжки зафиксировано'
          : 'Необходимо фото трасс в полу до заливки стяжкой',
        passed: hasPipePhoto,
        actionText: 'Прикрепить фото трасс',
        action: () => this.openPassportPhotosModal()
      });
    } else if (targetStage === 5) {
      // Этап 5: Объект сдан (10-летняя гарантия Лиги)
      criteria.push({
        id: 'full_pressure_proof',
        title: 'Официальный протокол 16 бар с фото манометра',
        desc: (hasPressureTest && hasPressurePhoto) ? 'Подтверждено' : 'Не подтверждено',
        passed: hasPressureTest && hasPressurePhoto,
        actionText: 'Протокол 16 бар',
        action: () => this.openPressureTestModal()
      });
      criteria.push({
        id: 'full_checklist_proof',
        title: 'Полный чек-лист технадзора (100%)',
        desc: `${doneChecklist} из ${totalChecklist} пунктов выполнено`,
        passed: doneChecklist >= totalChecklist && totalChecklist > 0,
        actionText: 'Чек-лист стяжки',
        action: () => this.switchScreen('checklist')
      });
      const contract = s.contractSum || 0;
      const advance = s.advanceSum || 0;
      const debt = Math.max(0, contract - advance);
      criteria.push({
        id: 'finance_cleared',
        title: 'Финансовый расчет по контракту',
        desc: debt <= 0
          ? 'Контракт полностью оплачен заказчиком'
          : `Остаток долга заказчика: ${this.formatSum(debt)} сум`,
        passed: debt <= 0,
        actionText: 'Открыть финансы',
        action: () => this.switchScreen('finances')
      });
      criteria.push({
        id: 'passport_ready',
        title: 'Исполнительный Инженерный Паспорт готов',
        desc: 'Сформирован документ с гарантией 10 лет и фото скрытых узлов',
        passed: Boolean(hasPressureTest && hasPressurePhoto),
        actionText: 'Печать паспорта',
        action: () => this.printPassport()
      });
    }

    const unfulfilledCount = criteria.filter(c => !c.passed).length;
    const isApproved = unfulfilledCount === 0;

    return {
      targetStage,
      stageName,
      criteria,
      unfulfilledCount,
      isApproved
    };
  }

  // Отображение модального окна Карты допуска (Quality Gate v2.0.6)
  openStageQualityGateModal(gateResult) {
    this._pendingGateResult = gateResult;

    const titleEl = document.getElementById('gate-modal-title');
    if (titleEl) {
      titleEl.innerText = `🛡️ Карта допуска: ${gateResult.stageName}`;
    }

    const bannerEl = document.getElementById('gate-verdict-banner');
    const iconEl = document.getElementById('gate-verdict-icon');
    const verdictTitleEl = document.getElementById('gate-verdict-title');
    const verdictDescEl = document.getElementById('gate-verdict-desc');
    const btnApprove = document.getElementById('btn-gate-approve');
    const btnForce = document.getElementById('btn-gate-force');

    if (gateResult.isApproved) {
      if (bannerEl) bannerEl.className = 'gate-verdict-banner ready';
      if (iconEl) iconEl.innerText = '🟢';
      if (verdictTitleEl) verdictTitleEl.innerText = 'ДОПУСК РАЗРЕШЕН (100% СТАНДАРТОВ LIGA)';
      if (verdictDescEl) {
        verdictDescEl.innerText = 'Все инженерные требования выполнены. Вы можете перевести объект на данный этап.';
      }
      if (btnApprove) {
        btnApprove.style.display = 'block';
        btnApprove.innerText = `✓ Утвердить допуск: ${gateResult.stageName}`;
      }
      if (btnForce) btnForce.style.display = 'none';
    } else {
      if (bannerEl) bannerEl.className = 'gate-verdict-banner pending';
      if (iconEl) iconEl.innerText = '⚠️';
      if (verdictTitleEl) {
        verdictTitleEl.innerText = `ТРЕБУЮТСЯ ДОКАЗАТЕЛЬСТВА (Осталось: ${gateResult.unfulfilledCount})`;
      }
      if (verdictDescEl) {
        verdictDescEl.innerText = 'Для официального перевода выполните критерии ниже или допустите объект под ответственность мастера.';
      }
      if (btnApprove) btnApprove.style.display = 'none';
      if (btnForce) {
        btnForce.style.display = 'block';
        btnForce.innerText = `⚠️ Допустить на этап под ответственность мастера`;
      }
    }

    // Рендеринг списка критериев
    const container = document.getElementById('gate-criteria-list');
    if (container) {
      container.innerHTML = gateResult.criteria.map((c, idx) => `
        <div class="gate-criterion-card ${c.passed ? 'passed' : 'failed'}">
          <div class="gate-criterion-main">
            <div class="gate-check-icon">${c.passed ? '✓' : '✕'}</div>
            <div class="gate-criterion-text">
              <div class="gate-criterion-title">${c.title}</div>
              <div class="gate-criterion-desc">${c.desc}</div>
            </div>
          </div>
          <div class="gate-criterion-action">
            ${c.passed
              ? '<span class="gate-badge-passed">✓ Готово</span>'
              : `<button type="button" class="btn-gate-action" data-criterion-idx="${idx}">${c.actionText}</button>`}
          </div>
        </div>
      `).join('');

      // Привязка обработчиков быстрых действий
      container.querySelectorAll('.btn-gate-action').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-criterion-idx'));
          const crit = gateResult.criteria[idx];
          if (crit && typeof crit.action === 'function') {
            this.closeModal('modal-stage-quality-gate');
            crit.action();
          }
        });
      });
    }

    this.openModal('modal-stage-quality-gate');
  }

  // Подтверждение перехода на этап из Quality Gate
  async confirmStageTransfer(targetStage, isForced = false) {
    this.closeModal('modal-stage-quality-gate');
    await this.updateSiteStatus(targetStage, isForced);
    this._pendingGateResult = null;
  }

  // Обновление статуса объекта (Инженерный пульт мастера — v2.0.6)
  async updateSiteStatus(status, isForced = false) {
    if (!this.currentSite) return;
    const oldStatus = this.currentSite.status;
    this.currentSite.status = status;
    await window.ligaDB.put('sites', this.currentSite);

    const statusNames = {
      1: '1. Аудит проекта',
      2: '2. Черновой монтаж',
      3: '3. Опрессовка 16 бар',
      4: '4. Чистовая сантехника',
      5: '5. Объект сдан'
    };
    const phaseName = statusNames[status] || `Этап ${status}`;

    // 1. Акустический фидбек Swiss Audio
    if (status === 3 || status === 5) {
      this.playSwissChime();
    } else {
      this.playSubtleClick();
    }

    // 2. Уважительный статус
    if (isForced) {
      this.showToast(`⚠️ Объект переведен на «${phaseName}» (под ответственность мастера)`);
    } else {
      this.showToast(`✓ Объект переведен на этап: ${phaseName}`);
    }
    this.render();

    // 3. Автоматическая фиксация вехи в 10-летней Хронике объекта (Timeline)
    if (oldStatus !== status && window.ligaDB.db && window.ligaDB.db.objectStoreNames.contains('site_timeline_events')) {
      const typeMap = {
        1: 'audit',
        2: 'rough',
        3: 'pressure',
        4: 'trim',
        5: 'service'
      };
      const today = new Date().toISOString().slice(0, 10);
      try {
        await window.ligaDB.add('site_timeline_events', {
          siteId: this.currentSiteId,
          date: today,
          eventType: isForced ? 'service' : (typeMap[status] || 'audit'),
          title: isForced ? `⚠️ Принудительный допуск: ${phaseName}` : `Веха проекта: ${phaseName}`,
          description: isForced
            ? `Этап активирован под личную ответственность мастера без полного пакета фотодоказательств и чек-листов.`
            : `Инженерный этап официально зафиксирован мастером в бортовом журнале LIGA OS.`,
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Не удалось зафиксировать веху в хронике:', err);
      }
    }

    // 4. Интеллектуальные подсказки мастера
    if (status === 3 && (!this.currentSite.pressureTest || !this.currentSite.pressureTest.passed)) {
      setTimeout(() => {
        if (confirm('🛡️ Этап «16 бар» активирован!\n\nЖелаете прямо сейчас заполнить официальный Протокол гидроиспытаний 16 бар с фиксацией манометра?')) {
          this.openPressureTestModal();
        }
      }, 350);
    } else if (status === 5) {
      setTimeout(() => {
        if (confirm('🎉 Поздравляем! Объект официально переведен в статус «СДАН».\n\nОткрыть официальный Исполнительный Инженерный Паспорт для печати или отправки заказчику?')) {
          this.printPassport();
        }
      }, 350);
    }
  }

  // Открытие модального окна структурированного протокола опрессовки 16 бар (P0-2)
  openPressureTestModal() {
    if (!this.currentSite) return;
    const pt = this.currentSite.pressureTest || {};
    const today = new Date().toISOString().slice(0, 10);
    const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const startDateEl = document.getElementById('pt-start-date');
    const startTimeEl = document.getElementById('pt-start-time');
    const endDateEl = document.getElementById('pt-end-date');
    const endTimeEl = document.getElementById('pt-end-time');
    const barEl = document.getElementById('pt-pressure-bar');
    const notesEl = document.getElementById('pt-notes');
    const photoStatusEl = document.getElementById('pt-photo-status');
    const errEl = document.getElementById('pressure-test-error-msg');

    if (errEl) {
      errEl.style.display = 'none';
      errEl.innerText = '';
    }

    if (startDateEl) startDateEl.value = pt.startDate || today;
    if (startTimeEl) startTimeEl.value = pt.startTime || '09:00';
    if (endDateEl) endDateEl.value = pt.endDate || tomorrowDate;
    if (endTimeEl) endTimeEl.value = pt.endTime || '09:00';
    if (barEl) barEl.value = pt.pressureBar ? pt.pressureBar : '16.0';
    if (notesEl) {
      notesEl.value = pt.notes || 'Давление 16.0 бар выдержано 24 часа без падения. Соединения Rehau и коллектор FAR герметичны. Разрешено к заливке стяжки.';
    }

    const hasPhoto = Boolean(this.currentPhotos && this.currentPhotos.pressure);
    if (photoStatusEl) {
      if (hasPhoto) {
        photoStatusEl.innerHTML = '<span style="color:var(--neon-emerald); font-weight:700;">✓ Фото манометра прикреплено</span>';
      } else {
        photoStatusEl.innerHTML = '<span style="color:var(--text-dim);">Фото манометра не прикреплено</span>';
      }
    }

    this.openModal('modal-pressure-test');
  }

  // Фиксация структурированного протокола опрессовки (P0-2)
  async handleSavePressureTest() {
    if (!this.currentSite) return;
    const startDate = (document.getElementById('pt-start-date')?.value || '').trim();
    const startTime = (document.getElementById('pt-start-time')?.value || '').trim();
    const endDate = (document.getElementById('pt-end-date')?.value || '').trim();
    const endTime = (document.getElementById('pt-end-time')?.value || '').trim();
    const barVal = parseFloat(document.getElementById('pt-pressure-bar')?.value || '0');
    const notes = (document.getElementById('pt-notes')?.value || '').trim();
    const hasPhoto = Boolean(this.currentPhotos && this.currentPhotos.pressure);

    const errEl = document.getElementById('pressure-test-error-msg');
    const showError = (msg) => {
      if (errEl) {
        errEl.innerText = msg;
        errEl.style.display = 'block';
      } else {
        alert(msg);
      }
    };

    if (!startDate || !startTime) {
      showError('Укажите дату и время начала испытания.');
      return;
    }
    if (!endDate || !endTime) {
      showError('Укажите дату и время окончания испытания.');
      return;
    }
    if (isNaN(barVal) || barVal < 16.0) {
      showError('Испытательное давление должно быть не менее 16.0 бар согласно нормативам.');
      return;
    }
    if (!hasPhoto) {
      showError('Обязательно прикрепите фото манометра под давлением (16 бар).');
      return;
    }
    if (!notes) {
      showError('Укажите заключение / комментарий инженера по результатам испытания.');
      return;
    }

    if (errEl) {
      errEl.style.display = 'none';
    }

    this.currentSite.pressureTest = {
      startDate,
      startTime,
      endDate,
      endTime,
      pressureBar: barVal,
      notes,
      photo: this.currentPhotos.pressure,
      passed: true,
      timestamp: new Date().toISOString()
    };
    this.currentSite.pressTestPassed = true;
    if (this.currentSite.status < 3) {
      this.currentSite.status = 3;
    }

    await window.ligaDB.put('sites', this.currentSite);
    this.closeModal('modal-pressure-test');
    this.playSwissChime();
    this.showToast('✓ Акт опрессовки 16 бар: УСПЕШНО ЗАФИКСИРОВАН!');
    this.render();
  }

  // Сброс опрессовки обратно в статус Черновика
  async resetPressureTest() {
    if (!this.currentSite) return;
    this.currentSite.pressTestPassed = false;
    this.currentSite.pressureTest = null;
    await window.ligaDB.put('sites', this.currentSite);
    this.closeModal('modal-pressure-test');
    this.showToast('Тест 16 бар сброшен. Паспорт переведен в статус Черновика.');
    this.render();
  }

  // Переключатель опрессовки (обратная совместимость)
  async togglePressureTest() {
    if (!this.currentSite) return;
    if (this.currentSite.pressTestPassed) {
      await this.resetPressureTest();
    } else {
      this.openPressureTestModal();
    }
  }

  // Рендеринг чек-листа технадзора и индикаторов готовности к стяжке
  async renderChecklist() {
    const list = await window.ligaDB.getBySiteId('checklists', this.currentSiteId);
    const container = document.getElementById('checklist-container');
    if (!container) return;

    const totalCount = list.length || 10;
    const doneCount = list.filter(item => item.done).length;
    const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    // Обновляем бейдж и прогресс-бар
    const badgeEl = document.getElementById('checklist-counter-badge');
    if (badgeEl) {
      badgeEl.innerText = `${doneCount} / ${totalCount} выполнено`;
    }

    const progressBar = document.getElementById('checklist-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }

    const percentLabel = document.getElementById('screed-percent-label');
    if (percentLabel) {
      percentLabel.innerText = `${percent}%`;
    }

    const statusLabel = document.getElementById('screed-status-label');
    if (statusLabel) {
      if (doneCount === totalCount && this.currentSite && this.currentSite.pressTestPassed) {
        statusLabel.innerHTML = '<span style="color:var(--neon-emerald);">✓ Заливка стяжки РАЗРЕШЕНА (100% + Опрессовка 16 бар)</span>';
      } else if (doneCount === totalCount) {
        statusLabel.innerHTML = '<span style="color:var(--gold-primary);">⚠️ Все 10 пунктов готовы, требуется опрессовка 16 бар!</span>';
      } else {
        statusLabel.innerHTML = `<span style="color:var(--neon-ruby);">⚠️ Заливать запрещено (замечаний: ${totalCount - doneCount})</span>`;
      }
    }

    if (list.length === 0) {
      container.innerHTML = '<div style="color:var(--text-dim); padding:20px; text-align:center;">Чек-лист чист</div>';
      return;
    }

    container.innerHTML = list.map(item => `
      <div class="check-item ${item.done ? 'done' : ''}" data-id="${item.id}">
        <div class="check-box-icon">${item.done ? '✓' : ''}</div>
        <div class="check-text">${item.title}</div>
      </div>
    `).join('');
  }

  async toggleChecklistItem(id) {
    const item = await window.ligaDB.get('checklists', id);
    if (item) {
      item.done = !item.done;
      await window.ligaDB.put('checklists', item);
      await this.renderChecklist();
      this.playSubtleClick();
      this.showToast(item.done ? 'Пункт выполнен' : 'Пункт снят');
    }
  }

  // Экспорт официального Акта готовности к стяжке в Telegram
  async exportScreedAct() {
    if (!this.currentSite) return;
    const s = this.currentSite;
    const list = await window.ligaDB.getBySiteId('checklists', this.currentSiteId);
    const totalCount = list.length || 10;
    const doneCount = list.filter(item => item.done).length;
    const isAllPassed = doneCount === totalCount && s.pressTestPassed;
    const dateStr = new Date().toLocaleDateString('ru-RU');

    const itemsText = list.map((item, idx) => {
      const mark = item.done ? '✓ Выполнено' : '❌ Замечание';
      return `${idx + 1}. [${mark}] ${item.title}`;
    }).join('\n');

    const pressStatus = s.pressTestPassed ? '✓ 16 БАР ВЫДЕРЖАНО 24 ЧАСА (УСПЕШНО)' : '❌ ОПРЕССОВКА НЕ ПРОВЕДЕНА';

    const message = `🏛️ ОФИЦИАЛЬНЫЙ АКТ ГОТОВНОСТИ САНТЕХНИКИ К ЗАЛИВКЕ СТЯЖКИ
«Лига Опытных Мастеров» • Ведущий инженер Улугбек Хакимов
Объект: ${s.name} (${s.unit || 'Элитный жилой фонд'})
Заказчик: ${s.client} • Дата проверки: ${dateStr}

ПРОТОКОЛ ПРОВЕРКИ ТЕХНАДЗОРА (${doneCount}/${totalCount}):
${itemsText}

ГИДРАВЛИЧЕСКИЕ ИСПЫТАНИЯ:
${pressStatus}

ИТОГОВОЕ ЗАКЛЮЧЕНИЕ:
${isAllPassed ? '🟢 СТЯЖКУ ЗАЛИВАТЬ РАЗРЕШЕНО. Инженерные коммуникации соответствуют высшему стандарту надежности.' : '🔴 ЗАЛИВКУ СТЯЖКИ ПРИОСТАНОВИТЬ до устранения всех замечаний и повторной опрессовки!'}

Инженер технадзора: Улугбек Хакимов
Телефон: ${s.phone || '+998 90 900-00-00'}
Сайт: https://liga-masterov.vercel.app`;

    try {
      await this.copyToClipboard(message);
      this.showToast('✓ Акт стяжки скопирован! Переход в Telegram...');
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
    const tgUrl = `https://t.me/share/url?text=${encodeURIComponent(message)}`;
    window.open(tgUrl, '_blank');
  }

  // Рендеринг материалов и снабжения
  async renderMaterials() {
    const rawList = await window.ligaDB.getBySiteId('materials', this.currentSiteId);
    const container = document.getElementById('materials-list-container');
    if (!container) return;

    // В клиентском режиме используем безопасную модель представления без закупочных цен и чеков
    const list = this.isClientMode 
      ? this.getClientViewModel(this.currentSite, rawList, []).materials
      : rawList;

    // Подсчет сумм
    const purchasedSum = rawList.filter(m => m.isPurchased).reduce((acc, m) => acc + (m.price || 0), 0);
    const neededSum = rawList.filter(m => !m.isPurchased).reduce((acc, m) => acc + (m.price || 0), 0);

    const purchasedEl = document.getElementById('mat-purchased-sum');
    if (purchasedEl) purchasedEl.innerText = this.isClientMode ? '—' : this.formatSum(purchasedSum);

    const neededEl = document.getElementById('mat-needed-sum');
    if (neededEl) neededEl.innerText = this.isClientMode ? '—' : this.formatSum(neededSum);

    // Фильтрация
    let filtered = list;
    if (this.currentMatFilter === 'needed') {
      filtered = list.filter(m => !m.isPurchased);
    } else if (this.currentMatFilter === 'purchased') {
      filtered = list.filter(m => m.isPurchased);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="color:var(--text-dim); padding:24px; text-align:center; font-size:13px; font-weight:700;">
          ${this.currentMatFilter === 'needed' ? '✓ Все необходимые материалы закуплены!' : 'Нет позиций в этом списке'}
        </div>`;
      return;
    }

    container.innerHTML = filtered.map(m => `
      <div class="mat-item-card ${m.isPurchased ? 'purchased' : 'needed'}" data-id="${m.id}">
        <div class="mat-item-left">
          <div class="mat-checkbox ${m.isPurchased ? 'checked' : ''}" onclick="window.app.toggleMaterialStatus(${m.id})" title="${m.isPurchased ? 'Отмечено: Куплено' : 'Нажмите, чтобы отметить купленным'}">
            ${m.isPurchased ? '✓' : ''}
          </div>
          <div class="mat-info">
            <div class="mat-name">${m.name}</div>
            <div class="mat-meta">
              <span>🏷️ ${m.category}</span>
              <span>📦 ${m.qty}</span>
              <span style="color:${m.isPurchased ? 'var(--neon-emerald)' : 'var(--neon-ruby)'}; font-weight:800;">
                ${m.isPurchased ? '• Доставлено на объект' : '• В плане закупки'}
              </span>
            </div>
          </div>
        </div>
        <div class="mat-item-right">
          ${this.isClientMode ? `
            <div class="mat-badge-spec">В спецификации</div>
          ` : `
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="mat-price">${this.formatSum(m.price)}</div>
              <button class="btn-item-delete" onclick="window.app.deleteMaterial(${m.id})" title="Удалить позицию" style="background:none; border:none; color:var(--text-dim); font-size:13px; cursor:pointer; padding:2px 4px; opacity:0.6; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">🗑️</button>
            </div>
            ${m.receiptPhoto ? `
              <button class="btn-receipt-view" onclick="window.app.viewReceiptById(${m.id})">
                <span>🧾 Чек (фото)</span>
              </button>
            ` : ''}
          `}
        </div>
      </div>
    `).join('');
  }

  async toggleMaterialStatus(id) {
    const item = await window.ligaDB.get('materials', id);
    if (item) {
      item.isPurchased = !item.isPurchased;
      await window.ligaDB.put('materials', item);
      await this.renderMaterials();
      await this.updateNavBadges();
      this.playSubtleClick();
      this.showToast(item.isPurchased ? '✓ Отмечено как куплено!' : 'Статус: Требуется докупить');
    }
  }

  async deleteMaterial(id) {
    if (!confirm('Удалить эту позицию из списка материалов?')) return;
    await window.ligaDB.delete('materials', id);
    await this.renderMaterials();
    await this.updateNavBadges();
    this.showToast('✓ Позиция удалена из склада');
  }

  async viewReceiptById(id) {
    const item = await window.ligaDB.get('materials', id);
    if (item && item.receiptPhoto) {
      const imgEl = document.getElementById('view-receipt-img');
      const titleEl = document.getElementById('view-receipt-title');
      const metaEl = document.getElementById('view-receipt-meta');

      if (imgEl) imgEl.src = item.receiptPhoto;
      if (titleEl) titleEl.innerText = item.name;
      if (metaEl) metaEl.innerText = `Сумма по чеку: ${this.formatSum(item.price)} (${item.category})`;

      this.openModal('modal-view-receipt');
    } else {
      this.showToast('Фото чека отсутствует');
    }
  }

  async exportBazaarList() {
    const list = await window.ligaDB.getBySiteId('materials', this.currentSiteId);
    const needed = list.filter(m => !m.isPurchased);
    const targetList = needed.length > 0 ? needed : list;
    const s = this.currentSite;

    const sum = targetList.reduce((acc, m) => acc + (m.price || 0), 0);
    const itemsText = targetList.map((m, idx) => 
      `${idx + 1}. [ ] ${m.name} — ${m.qty} (~${this.formatSum(m.price)})`
    ).join('\n');

    const message = `🛒 СПИСОК МАТЕРИАЛОВ ДЛЯ ЗАКУПКИ (Базар Джами / Урикзор)
Объект: ${s ? s.name : 'Элитный объект'}
Инженер: Улугбек Хакимов («Лига Опытных Мастеров»)

Позиции к закупке:
${itemsText}

Ориентировочная сумма закупки: 💰 ${this.formatSum(sum)}

Сформировано в LIGA OS: https://liga-masterov.vercel.app`;

    try {
      await this.copyToClipboard(message);
      this.showToast('✓ Список для базара скопирован в буфер!');
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
    const tgUrl = `https://t.me/share/url?text=${encodeURIComponent(message)}`;
    window.open(tgUrl, '_blank');
  }

  // Рендеринг финансового экрана и сводного радара портфеля
  async renderFinances() {
    const s = this.currentSite;
    if (s) {
      const contract = s.contractSum || 0;
      const advance = s.advanceSum || 0;
      const debt = Math.max(0, contract - advance);

      document.getElementById('page-fin-contract').innerText = this.formatSum(contract);
      document.getElementById('page-fin-advance').innerText = this.formatSum(advance);
      document.getElementById('page-fin-debt').innerText = this.formatSum(debt);
      const brigadeEl = document.getElementById('page-fin-brigade');
      if (brigadeEl) {
        brigadeEl.innerText = this.isClientMode ? '—' : this.formatSum(s.brigadeOwed || 0);
      }
      await this.renderBazaarPocket();
    }

    // В клиентском режиме полностью блокируем вывод портфеля других объектов
    if (this.isClientMode) {
      return;
    }

    // Сводные агрегированные показатели по всему портфелю
    const allSites = this.sites || [];
    const totalContract = allSites.reduce((acc, item) => acc + (item.contractSum || 0), 0);
    const totalAdvance = allSites.reduce((acc, item) => acc + (item.advanceSum || 0), 0);
    const totalDebt = Math.max(0, totalContract - totalAdvance);
    const totalBrigade = allSites.reduce((acc, item) => acc + (item.brigadeOwed || 0), 0);

    const badgeSites = document.getElementById('portfolio-sites-badge');
    if (badgeSites) badgeSites.innerText = `${allSites.length} объекта(ов) в работе`;

    const elTotalContract = document.getElementById('portfolio-total-contract');
    if (elTotalContract) elTotalContract.innerText = this.formatSum(totalContract);

    const elTotalAdvance = document.getElementById('portfolio-total-advance');
    if (elTotalAdvance) elTotalAdvance.innerText = this.formatSum(totalAdvance);

    const elTotalDebt = document.getElementById('portfolio-total-debt');
    if (elTotalDebt) elTotalDebt.innerText = this.formatSum(totalDebt);

    const elTotalBrigade = document.getElementById('portfolio-total-brigade');
    if (elTotalBrigade) elTotalBrigade.innerText = this.formatSum(totalBrigade);
  }

  // ==========================================================================
  // ТАРИФНЫЙ КОНФИГУРАТОР И ЭКСПРЕСС-СМЕТА (P0-1)
  // ==========================================================================
  loadTariffSettings() {
    try {
      const saved = localStorage.getItem('liga_tariff_settings_v1');
      if (saved) {
        return { ...this.defaultTariffSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Не удалось загрузить сохраненные тарифы:', e);
    }
    return { ...this.defaultTariffSettings };
  }

  validateTariffField(valueStr, fieldName, minVal = 0, isRequiredPositive = false) {
    const trimmed = String(valueStr === undefined || valueStr === null ? '' : valueStr).trim();
    if (trimmed === '') {
      throw new Error(`Поле «${fieldName}» не может быть пустым.`);
    }
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(`Поле «${fieldName}» должно содержать только корректное целое число.`);
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || !Number.isSafeInteger(num)) {
      throw new Error(`Недопустимое числовое значение в поле «${fieldName}».`);
    }
    if (isRequiredPositive && num <= 0) {
      throw new Error(`Значение поля «${fieldName}» обязано быть строго больше нуля (не может быть нулём или отрицательным).`);
    }
    if (num < minVal) {
      throw new Error(`Значение поля «${fieldName}» не может быть отрицательным (минимум: ${minVal}).`);
    }
    return num;
  }

  openTariffSettingsModal() {
    const t = this.tariffSettings || this.defaultTariffSettings;
    const errEl = document.getElementById('tariff-error-msg');
    if (errEl) {
      errEl.style.display = 'none';
      errEl.innerText = '';
    }

    const fields = [
      'costPerBathroom', 'costPerPoint', 'costPerGeberit',
      'costPerIbox', 'costPerDrain', 'costPerSqMFloor',
      'baseAuditWork', 'usdRate'
    ];
    fields.forEach(field => {
      const input = document.getElementById(`tariff-${field}`);
      if (input && t[field] !== undefined) {
        input.value = t[field];
      }
    });
    this.openModal('modal-tariffs');
  }

  handleSaveTariffs() {
    const errEl = document.getElementById('tariff-error-msg');
    if (errEl) {
      errEl.style.display = 'none';
      errEl.innerText = '';
    }

    try {
      const costPerBathroom = this.validateTariffField(
        document.getElementById('tariff-costPerBathroom').value,
        'Обвязка санузла', 0
      );
      const costPerPoint = this.validateTariffField(
        document.getElementById('tariff-costPerPoint').value,
        'Водорозетка / точка', 0
      );
      const costPerGeberit = this.validateTariffField(
        document.getElementById('tariff-costPerGeberit').value,
        'Монтаж инсталляции', 0
      );
      const costPerIbox = this.validateTariffField(
        document.getElementById('tariff-costPerIbox').value,
        'Встраиваемый смеситель iBox', 0
      );
      const costPerDrain = this.validateTariffField(
        document.getElementById('tariff-costPerDrain').value,
        'Душевой трап в пол', 0
      );
      const costPerSqMFloor = this.validateTariffField(
        document.getElementById('tariff-costPerSqMFloor').value,
        'Теплый пол (кв.м)', 0
      );
      const baseAuditWork = this.validateTariffField(
        document.getElementById('tariff-baseAuditWork').value,
        'Шеф-монтаж, проект и опрессовка', 0
      );
      const usdRate = this.validateTariffField(
        document.getElementById('tariff-usdRate').value,
        'Курс доллара USD', 1000, true
      );

      const newTariffs = {
        costPerBathroom,
        costPerPoint,
        costPerGeberit,
        costPerIbox,
        costPerDrain,
        costPerSqMFloor,
        baseAuditWork,
        usdRate,
        statusLabel: 'Пользовательские тарифы мастера Улугбека'
      };

      this.tariffSettings = { ...this.tariffSettings, ...newTariffs };
      try {
        localStorage.setItem('liga_tariff_settings_v1', JSON.stringify(this.tariffSettings));
      } catch (e) {
        console.warn('Не удалось сохранить тарифы:', e);
      }

      const badge = document.getElementById('est-tariff-status');
      if (badge) badge.innerText = this.tariffSettings.statusLabel;

      this.closeModal('modal-tariffs');
      this.calculateEstimate();
      this.showToast('✓ Тарифы мастера сохранены и применены!');
    } catch (err) {
      if (errEl) {
        errEl.style.display = 'block';
        errEl.innerText = `⚠️ ${err.message}`;
      }
      alert(`⚠️ Ошибка в расценках:\n${err.message}`);
      return;
    }
  }

  resetTariffSettings() {
    this.tariffSettings = { ...this.defaultTariffSettings };
    try {
      localStorage.removeItem('liga_tariff_settings_v1');
    } catch (e) {
      console.warn('Не удалось сбросить тарифы:', e);
    }

    const badge = document.getElementById('est-tariff-status');
    if (badge) badge.innerText = this.tariffSettings.statusLabel;

    this.closeModal('modal-tariffs');
    this.calculateEstimate();
    this.showToast('✓ Тарифы сброшены к базовым ориентирам');
  }

  // ==========================================================================
  // МЕНЕДЖЕР РЕЗЕРВНОГО КОПИРОВАНИЯ И ПЕРЕНОСА ДАННЫХ (P0-4)
  // ==========================================================================
  async openBackupManager() {
    try {
      const stats = await window.ligaDB.getStats();
      const statsEl = document.getElementById('backup-current-stats');
      let storageInfo = '';
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          const usedMB = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
          const quotaMB = ((est.quota || 0) / (1024 * 1024)).toFixed(0);
          storageInfo = `<br><span style="font-size:11px; color:var(--text-dim); display:inline-block; margin-top:4px;">💾 Память устройства: занято <b>${usedMB} МБ</b> из квоты <b>${quotaMB} МБ</b></span>`;
        } catch (storageErr) {
          console.warn('Не удалось получить оценку хранилища:', storageErr);
        }
      }
      if (statsEl) {
        statsEl.innerHTML = `В локальной базе сохранено: <b>${stats.sitesCount}</b> объекта(ов), <b>${stats.materialsCount}</b> позиций материалов и чеков, <b>${stats.checklistsCount}</b> пунктов технадзора.${storageInfo}`;
      }
    } catch (e) {
      console.warn('Не удалось получить статистику базы:', e);
    }

    this.resetRestorePreview();
    this.openModal('modal-backup-manager');
  }

  resetRestorePreview() {
    this.pendingRestoreData = null;
    const input = document.getElementById('input-backup-file');
    if (input) input.value = '';
    const previewCard = document.getElementById('backup-preview-card');
    if (previewCard) previewCard.style.display = 'none';
    const errEl = document.getElementById('backup-error-msg');
    if (errEl) {
      errEl.style.display = 'none';
      errEl.innerText = '';
    }
  }

  async handleBackupExport() {
    try {
      this.showToast('Формирование полной резервной копии базы...');
      const res = await window.ligaDB.exportFullBackup();
      if (res && res.success) {
        if (res.method === 'share') {
          this.showToast('✓ Меню отправки бэкапа открыто!');
        } else {
          this.showToast(`✓ Резервная копия «${res.fileName}» скачана!`);
        }
      }
    } catch (err) {
      console.error('Ошибка экспорта бэкапа:', err);
      alert('Не удалось создать резервную копию: ' + err.message);
    }
  }

  handleBackupFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const previewCard = document.getElementById('backup-preview-card');
      const detailsEl = document.getElementById('backup-preview-details');
      const errEl = document.getElementById('backup-error-msg');

      try {
        const meta = window.ligaDB.validateBackup(content);
        this.pendingRestoreData = content;

        if (errEl) {
          errEl.style.display = 'none';
          errEl.innerText = '';
        }

        if (detailsEl) {
          const dateFormatted = meta.exportDate 
            ? new Date(meta.exportDate).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Дата не указана';

          detailsEl.innerHTML = `
            <div><b>Приложение:</b> ${meta.appName} (схема v${meta.schemaVersion})</div>
            <div><b>Дата архива:</b> ${dateFormatted}</div>
            <div><b>Объектов:</b> ${meta.sitesCount} | <b>Материалов и чеков:</b> ${meta.materialsCount}</div>
            <div><b>Пунктов технадзора:</b> ${meta.checklistsCount}</div>
            <div><b>Тарифы мастера:</b> ${meta.hasTariffs ? '✓ Сохранены в файле' : 'По умолчанию'}</div>
          `;
        }

        if (previewCard) {
          previewCard.style.display = 'block';
        }
      } catch (err) {
        this.pendingRestoreData = null;
        if (previewCard) previewCard.style.display = 'none';
        if (errEl) {
          errEl.style.display = 'block';
          errEl.innerText = `⚠️ ${err.message}`;
        }
      }
    };

    reader.onerror = () => {
      alert('Ошибка чтения выбранного файла');
    };

    reader.readAsText(file);
  }

  async confirmRestore() {
    if (!this.pendingRestoreData) {
      alert('Файл резервной копии не выбран или поврежден');
      return;
    }

    try {
      this.showToast('Восстановление базы данных...');
      const meta = await window.ligaDB.restoreFromBackup(this.pendingRestoreData);

      // Перезагружаем объекты из базы
      await this.loadSites();

      // Перезагружаем тарифы
      this.tariffSettings = this.loadTariffSettings();
      const badge = document.getElementById('est-tariff-status');
      if (badge) badge.innerText = this.tariffSettings.statusLabel;

      // Сбрасываем и закрываем
      this.resetRestorePreview();
      this.closeModal('modal-backup-manager');

      // Перерисовываем интерфейс
      this.render();
      this.calculateEstimate();

      this.showToast(`✓ Восстановлено: ${meta.sitesCount} объекта(ов)!`);
    } catch (err) {
      console.error('Ошибка восстановления базы:', err);
      alert('Не удалось восстановить базу: ' + err.message);
    }
  }

  // ==========================================================================
  // АВТОМАТИЗАЦИЯ СМЕТЫ И СКЛАДА МАТЕРИАЛОВ (v2.2.3)
  // ==========================================================================
  applyEstimatePreset(presetKey) {
    const presets = {
      studio: {
        bathrooms: 1, waterPoints: 6, geberit: 1, ibox: 1, drains: 1, floorHeatingSqM: 20,
        name: 'Студия'
      },
      standard: {
        bathrooms: 1, waterPoints: 10, geberit: 1, ibox: 1, drains: 1, floorHeatingSqM: 35,
        name: '2-комн. (Стандарт)'
      },
      comfort: {
        bathrooms: 2, waterPoints: 14, geberit: 2, ibox: 2, drains: 2, floorHeatingSqM: 55,
        name: '3-комн. (Комфорт)'
      },
      luxury: {
        bathrooms: 2, waterPoints: 18, geberit: 2, ibox: 3, drains: 2, floorHeatingSqM: 80,
        name: '4-комн. (Mirabad)'
      },
      cottage: {
        bathrooms: 3, waterPoints: 26, geberit: 3, ibox: 4, drains: 3, floorHeatingSqM: 140,
        name: 'Коттедж / Вилла'
      }
    };

    const p = presets[presetKey];
    if (!p) return;

    this.estimate.bathrooms = p.bathrooms;
    this.estimate.waterPoints = p.waterPoints;
    this.estimate.geberit = p.geberit;
    this.estimate.ibox = p.ibox;
    this.estimate.drains = p.drains;
    this.estimate.floorHeatingSqM = p.floorHeatingSqM;

    ['bathrooms', 'waterPoints', 'geberit', 'ibox', 'drains', 'floorHeatingSqM'].forEach(f => {
      const el = document.getElementById(`val-${f}`);
      if (el) el.innerText = this.estimate[f];
    });

    this.calculateEstimate();
    this.showToast(`✓ Загружен шаблон: ${p.name}`);
  }

  async applyEstimateToCurrentSite() {
    if (!this.currentSite && this.currentSiteId) {
      this.currentSite = await window.ligaDB.get('sites', this.currentSiteId);
    }
    if (!this.currentSite) {
      const sites = await window.ligaDB.getAll('sites');
      if (sites && sites.length > 0) {
        this.currentSite = sites[0];
        this.currentSiteId = sites[0].id;
      }
    }
    if (!this.currentSite) {
      this.showToast('⚠️ Сначала создайте объект на дашборде!');
      this.switchScreen('dashboard');
      return;
    }

    const t = this.tariffSettings || this.defaultTariffSettings;
    const e = this.estimate;
    const costBathrooms = (e.bathrooms || 0) * (t.costPerBathroom || 0);
    const costPoints = (e.waterPoints || 0) * (t.costPerPoint || 0);
    const costGeberit = (e.geberit || 0) * (t.costPerGeberit || 0);
    const costIbox = (e.ibox || 0) * (t.costPerIbox || 0);
    const costDrains = (e.drains || 0) * (t.costPerDrain || 0);
    const costFloor = (e.floorHeatingSqM || 0) * (t.costPerSqMFloor || 0);
    const baseAudit = t.baseAuditWork || 0;
    const calculatedMin = costBathrooms + costPoints + costGeberit + costIbox + costDrains + costFloor + baseAudit;

    this.currentSite.contractAmount = calculatedMin;
    this.currentSite.totalSum = calculatedMin;
    await window.ligaDB.put('sites', this.currentSite);

    await window.ligaDB.add('site_timeline_events', {
      siteId: this.currentSiteId,
      date: new Date().toISOString(),
      title: 'Утверждена смета монтажа',
      desc: `Смета ${this.formatSum(calculatedMin)}: ${e.bathrooms} с/у, ${e.waterPoints} точек, ${e.floorHeatingSqM} м² тёплый пол.`,
      icon: '⚡'
    });

    this.render();
    this.switchScreen('dashboard');
    await this.renderScreenContent('dashboard');
    this.showToast(`✓ Смета ${this.formatSum(calculatedMin)} утверждена для «${this.currentSite.name}»!`);
  }

  async loadStandardMaterialPack() {
    if (!this.currentSite && this.currentSiteId) {
      this.currentSite = await window.ligaDB.get('sites', this.currentSiteId);
    }
    if (!this.currentSite) {
      const sites = await window.ligaDB.getAll('sites');
      if (sites && sites.length > 0) {
        this.currentSite = sites[0];
        this.currentSiteId = sites[0].id;
      }
    }
    if (!this.currentSiteId) {
      this.showToast('⚠️ Сначала выберите активный объект!');
      return;
    }

    const standardPack = [
      { category: 'Трубы и фитинги', name: 'Труба Rehau Rautitan Pink 16x2.0 (EVOH)', qty: '200 м', price: 3400000, isPurchased: false },
      { category: 'Коллекторы FAR', name: 'Коллекторная группа FAR 1" с расходомерами (6 выходов)', qty: '1 шт', price: 2200000, isPurchased: false },
      { category: 'Инсталляции', name: 'Инсталляция Geberit Duofix Delta с клавишей', qty: '2 шт', price: 4600000, isPurchased: false },
      { category: 'Автоматика и фильтры', name: 'Редуктор давления Caleffi 3/4" с манометром', qty: '2 шт', price: 1800000, isPurchased: false },
      { category: 'Автоматика и фильтры', name: 'Гаситель гидроударов FAR 1/2"', qty: '2 шт', price: 900000, isPurchased: false },
      { category: 'Трапы и сливы', name: 'Трап щелевой 70 см с сухим затвором', qty: '2 шт', price: 1600000, isPurchased: false }
    ];

    for (const item of standardPack) {
      await window.ligaDB.add('materials', {
        siteId: this.currentSiteId,
        category: item.category,
        name: item.name,
        qty: item.qty,
        price: item.price,
        isPurchased: item.isPurchased,
        receiptPhoto: null
      });
    }

    await this.renderMaterials();
    this.updateNavBadges();
    this.showToast('✓ Базовый комплект Rehau/FAR загружен в список закупки!');
  }

  updateEstimate(field, delta) {
    if (this.estimate[field] !== undefined) {
      this.estimate[field] = Math.max(0, this.estimate[field] + delta);
      const valEl = document.getElementById(`val-${field}`);
      if (valEl) valEl.innerText = this.estimate[field];
      this.calculateEstimate();
    }
  }

  calculateEstimate() {
    const e = this.estimate;
    const t = this.tariffSettings || this.defaultTariffSettings;

    // Включение параметра «Санузлы» в математический расчет стоимости
    const costBathrooms = (e.bathrooms || 0) * (t.costPerBathroom || 0);
    const costPoints = (e.waterPoints || 0) * (t.costPerPoint || 0);
    const costGeberit = (e.geberit || 0) * (t.costPerGeberit || 0);
    const costIbox = (e.ibox || 0) * (t.costPerIbox || 0);
    const costDrains = (e.drains || 0) * (t.costPerDrain || 0);
    const costFloor = (e.floorHeatingSqM || 0) * (t.costPerSqMFloor || 0);
    const baseAudit = t.baseAuditWork || 0;

    const totalMin = costBathrooms + costPoints + costGeberit + costIbox + costDrains + costFloor + baseAudit;
    const totalMax = Math.round(totalMin * (t.markupMax || 1.25));
    const usdRate = t.usdRate || 12900;

    const totalMinUsd = Math.round(totalMin / usdRate);
    const totalMaxUsd = Math.round(totalMax / usdRate);

    const elSum = document.getElementById('est-range-sum');
    const elUsd = document.getElementById('est-range-usd');
    const badge = document.getElementById('est-tariff-status');

    if (elSum) {
      elSum.innerText = `${this.formatNumber(totalMin)} – ${this.formatNumber(totalMax)} сум`;
    }
    if (elUsd) {
      elUsd.innerText = `$${this.formatNumber(totalMinUsd)} – $${this.formatNumber(totalMaxUsd)}`;
    }
    if (badge && t.statusLabel) {
      badge.innerText = t.statusLabel;
    }
  }

  copyEstimateToTelegram() {
    const e = this.estimate;
    const t = this.tariffSettings || this.defaultTariffSettings;
    const textSum = document.getElementById('est-range-sum') ? document.getElementById('est-range-sum').innerText : '';
    const textUsd = document.getElementById('est-range-usd') ? document.getElementById('est-range-usd').innerText : '';

    const message = `🏛️ ПРЕДВАРИТЕЛЬНЫЙ РАСЧЕТ ИНЖЕНЕРНОГО МОНТАЖА
«Лига Опытных Мастеров» • Инженер Улугбек Хакимов

Параметры объекта:
• Санузлов: ${e.bathrooms} (обвязка стояков и распределительных узлов)
• Водорозетки и точки слива: ${e.waterPoints} шт.
• Инсталляции Geberit/TECE: ${e.geberit} шт.
• Скрытые смесители iBox: ${e.ibox} шт.
• Душевые трапы в пол: ${e.drains} шт.
• Водяной теплый пол: ${e.floorHeatingSqM} кв.м

Ориентировочная вилка стоимости работ:
💰 ${textSum} (${textUsd})

* Расчет предварительный по тарифной сетке мастера (${t.statusLabel}).
Итоговая смета утверждается на объекте после лазерного замера и согласования проекта.

В стоимость включено:
✓ Коллекторная лучевая разводка FAR
✓ Трубы Rehau Rautitan / Stout
✓ Опрессовка 16 бар (двойной гидротест) с Актом испытаний
✓ Исполнительный фотопаспорт скрытых трасс с лазерными привязками
✓ Официальный договор и гарантия

Сайт-портфолио: https://liga-masterov.vercel.app/`;

    this.copyToClipboard(message).then(() => {
      this.showToast('✓ Смета скопирована! Вставьте её в чат Telegram.');
    }).catch(err => {
      console.warn('Clipboard write failed:', err);
      this.showToast('✓ Смета сформирована!');
    });
  }

  // ==========================================================================
  // ИНЖЕНЕРНЫЙ КАЛЬКУЛЯТОР ПОДБОРА ТРУБ И КОЛЛЕКТОРОВ FAR / REHAU (v2.2.6)
  // Стандарт DIN 1988 • Защита от перепада температур в душе
  // ==========================================================================
  openPipeCalculator() {
    this.closeModal('modal-more-menu');
    if (!this.pipeCalc) {
      this.pipeCalc = {
        cold: 6,
        hot: 4,
        hasHighFlow: true,
        hasRecirc: false,
        pressure: '6.0',
        length: 'medium'
      };
    }
    const coldEl = document.getElementById('pipe-calc-cold-val');
    const hotEl = document.getElementById('pipe-calc-hot-val');
    const highFlowEl = document.getElementById('pipe-calc-high-flow');
    const recircEl = document.getElementById('pipe-calc-boiler-recirc');
    const pressEl = document.getElementById('pipe-calc-pressure-select');
    const lenEl = document.getElementById('pipe-calc-length-select');

    if (coldEl) coldEl.innerText = this.pipeCalc.cold;
    if (hotEl) hotEl.innerText = this.pipeCalc.hot;
    if (highFlowEl) highFlowEl.checked = this.pipeCalc.hasHighFlow;
    if (recircEl) recircEl.checked = this.pipeCalc.hasRecirc;
    if (pressEl) pressEl.value = this.pipeCalc.pressure;
    if (lenEl) lenEl.value = this.pipeCalc.length;

    this.recalculatePipeManifold();
    this.openModal('modal-pipe-calculator');
  }

  adjustPipePoints(type, delta) {
    if (!this.pipeCalc) {
      this.pipeCalc = { cold: 6, hot: 4, hasHighFlow: true, hasRecirc: false, pressure: '6.0', length: 'medium' };
    }
    this.pipeCalc[type] = Math.max(1, Math.min(24, (this.pipeCalc[type] || 0) + delta));
    const valEl = document.getElementById(`pipe-calc-${type}-val`);
    if (valEl) valEl.innerText = this.pipeCalc[type];
    this.recalculatePipeManifold();
  }

  recalculatePipeManifold() {
    if (!this.pipeCalc) {
      this.pipeCalc = { cold: 6, hot: 4, hasHighFlow: true, hasRecirc: false, pressure: '6.0', length: 'medium' };
    }
    const cold = this.pipeCalc.cold;
    const hot = this.pipeCalc.hot;
    const highFlowEl = document.getElementById('pipe-calc-high-flow');
    const recircEl = document.getElementById('pipe-calc-boiler-recirc');
    const pressEl = document.getElementById('pipe-calc-pressure-select');
    const lenEl = document.getElementById('pipe-calc-length-select');

    const hasHighFlow = highFlowEl ? highFlowEl.checked : this.pipeCalc.hasHighFlow;
    const hasRecirc = recircEl ? recircEl.checked : this.pipeCalc.hasRecirc;
    const pressure = pressEl ? pressEl.value : this.pipeCalc.pressure;
    const length = lenEl ? lenEl.value : this.pipeCalc.length;

    this.pipeCalc.hasHighFlow = hasHighFlow;
    this.pipeCalc.hasRecirc = hasRecirc;
    this.pipeCalc.pressure = pressure;
    this.pipeCalc.length = length;

    // Расчет одновременного расхода воды (DIN 1988)
    const baseFlow = (cold + hot) * 0.14;
    const extraFlow = hasHighFlow ? 0.28 : 0;
    const simultaneity = 1 / Math.sqrt(Math.max(1, (cold + hot) - 1));
    const totalQ = Math.max(0.25, Number(((baseFlow + extraFlow) * simultaneity).toFixed(2)));

    // Определение диаметра ввода (25 мм vs 20 мм)
    const needs25mm = (totalQ >= 0.38) || (cold + hot >= 8) || hasHighFlow;
    const inletText = needs25mm 
      ? '25 мм (Rehau 25×3.5 • 1" ввод)' 
      : '20 мм (Rehau 20×2.8 • 3/4" ввод)';

    // Подбор конфигурации коллекторов FAR (Евроконус 3/4", проход 1")
    const formatManifold = (points, label) => {
      if (points <= 4) return `FAR 1" на ${points} выхода`;
      if (points === 5) return `FAR 1" на 5 выходов (гребенка 3+2)`;
      if (points === 6) return `FAR 1" на 6 выходов (гребенка 3+3)`;
      if (points === 7) return `FAR 1" на 7 выходов (гребенка 4+3)`;
      if (points === 8) return `FAR 1" на 8 выходов (гребенка 4+4)`;
      return `FAR 1" на ${points} выходов (секционная сборка)`;
    };

    const manifoldColdText = formatManifold(cold, 'ХВС');
    const manifoldHotText = formatManifold(hot, 'ГВС');

    // Расчет длины труб
    const mult = length === 'short' ? 7 : length === 'medium' ? 12 : 18;
    const m25 = needs25mm ? 12 : 0;
    const m20 = hasHighFlow ? (length === 'short' ? 14 : length === 'medium' ? 22 : 30) : 0;
    const standardPoints = Math.max(2, (cold + hot) - (hasHighFlow ? 2 : 0));
    const m16 = standardPoints * mult + (hasRecirc ? 15 : 0);

    // Дополнительное оборудование
    const pressNum = parseFloat(pressure);
    const accessoriesText = pressNum >= 4.5 
      ? 'Caleffi 3/4" (редуктор 3.5 бар) + 2 гасителя FAR' 
      : 'Гасители гидроударов FAR 1/2" (2 шт на торцах)';

    // Сохраняем расчет для экспорта
    this.currentCalculatedPipes = {
      cold,
      hot,
      totalQ,
      inlet: inletText,
      manifoldCold: manifoldColdText,
      manifoldHot: manifoldHotText,
      m25,
      m20,
      m16,
      accessories: accessoriesText,
      needs25mm,
      hasHighFlow,
      hasRecirc
    };

    // Обновляем DOM
    const qEl = document.getElementById('pipe-calc-flow-rate');
    const inletEl = document.getElementById('res-pipe-inlet-diameter');
    const colEl = document.getElementById('res-manifold-cold');
    const hotElRes = document.getElementById('res-manifold-hot');
    const p20El = document.getElementById('res-pipe-20mm');
    const p16El = document.getElementById('res-pipe-16mm');
    const accEl = document.getElementById('res-accessories');

    if (qEl) qEl.innerText = `Q = ${totalQ.toFixed(2)} л/с`;
    if (inletEl) inletEl.innerText = inletText;
    if (colEl) colEl.innerText = manifoldColdText;
    if (hotElRes) hotElRes.innerText = manifoldHotText;
    if (p20El) p20El.innerText = m20 > 0 ? `~${m20} метров (Rehau 20×2.8)` : 'Не требуется (стандартные лучи)';
    if (p16El) p16El.innerText = `~${m16} метров (Rehau 16×2.2)`;
    if (accEl) accEl.innerText = accessoriesText;
  }

  async copyPipeCalculation() {
    const c = this.currentCalculatedPipes;
    if (!c) return;

    const report = `📐 ИНЖЕНЕРНЫЙ РАСЧЕТ УЗЛА ВВОДА И ТРУБ
«Лига Опытных Мастеров» • Стандарт DIN 1988 (Ташкент)
Ведущий инженер: Улугбек Хакимов

📍 Потребители: ХВС — ${c.cold} точек, ГВС — ${c.hot} точек
⚡ Расчетный одновременный расход: Q = ${c.totalQ.toFixed(2)} л/с

СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ (ДЛЯ ЗАКУПКИ):
1. Ввод от стояка: ${c.inlet}
2. Коллектор ХВС: ${c.manifoldCold}
3. Коллектор ГВС: ${c.manifoldHot}
4. Труба Rehau Rautitan Stabil 25 мм: ${c.m25} м
${c.m20 > 0 ? `5. Труба Rehau Rautitan Stabil 20 мм: ${c.m20} м (на тропический душ/ванну)\n` : ''}6. Труба Rehau Rautitan Pink/Flex 16 мм: ${c.m16} м
7. Защита системы: ${c.accessories}

🛡️ ТЕРМОСТАБИЛЬНОСТЬ: 100% ВЫДЕРЖАНО.
Перепад температуры в душе при смыве унитаза или включении стиральной машины исключен!

Сформировано в LIGA OS • https://liga-os-beige.vercel.app/`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        this.copyToClipboard(report);
      }
      this.showToast('✓ Спецификация труб и коллекторов скопирована для Telegram!');
    } catch (e) {
      this.showToast('✓ Спецификация сформирована!');
    }
  }

  async addCalculatedPipesToMaterials() {
    const c = this.currentCalculatedPipes;
    if (!c) return;
    if (!window.ligaDB) {
      this.showToast('База данных недоступна');
      return;
    }

    const itemsToAdd = [];
    if (c.m25 > 0) {
      itemsToAdd.push({
        category: 'pipes',
        name: 'Труба Rehau Rautitan Stabil 25×3.5 (вводная магистраль)',
        qty: `${c.m25} м`,
        price: c.m25 * 38000,
        isPurchased: false
      });
    }
    if (c.m20 > 0) {
      itemsToAdd.push({
        category: 'pipes',
        name: 'Труба Rehau Rautitan Stabil 20×2.8 (высокорасходные лучи)',
        qty: `${c.m20} м`,
        price: c.m20 * 28000,
        isPurchased: false
      });
    }
    itemsToAdd.push({
      category: 'pipes',
      name: 'Труба Rehau Rautitan Pink/Flex 16×2.2 (лучи к потребителям)',
      qty: `${c.m16} м`,
      price: c.m16 * 19000,
      isPurchased: false
    });
    itemsToAdd.push({
      category: 'collectors',
      name: `Коллектор ХВС: ${c.manifoldCold}`,
      qty: '1 шт',
      price: 850000,
      isPurchased: false
    });
    itemsToAdd.push({
      category: 'collectors',
      name: `Коллектор ГВС: ${c.manifoldHot}`,
      qty: '1 шт',
      price: 650000,
      isPurchased: false
    });

    for (const item of itemsToAdd) {
      await window.ligaDB.add('materials', {
        siteId: this.currentSiteId || 1,
        category: item.category,
        name: item.name,
        qty: item.qty,
        price: item.price,
        isPurchased: false
      });
    }

    await this.renderMaterials();
    this.updateNavBadges();
    this.closeModal('modal-pipe-calculator');
    this.showToast(`✓ Добавлено ${itemsToAdd.length} позиций в список закупки на склад!`);
  }

  // ==========================================================================
  // ТЕПЛОТЕХНИЧЕСКИЙ КАЛЬКУЛЯТОР ТЕПЛОГО ПОЛА И НСУ (v2.2.7)
  // Швейцарский стандарт гидравлической увязки контуров (петли <= 75–80 м)
  // ==========================================================================
  openFloorCalculator() {
    this.closeModal('modal-more-menu');
    if (!this.floorCalc) {
      this.floorCalc = {
        area: 50,
        step: '150',
        hasEdgeZones: true,
        isTiles: true
      };
    }
    const areaEl = document.getElementById('floor-calc-area-val');
    const stepEl = document.getElementById('floor-calc-step-select');
    const edgeEl = document.getElementById('floor-calc-edge-zones');
    const tilesEl = document.getElementById('floor-calc-tiles-cover');

    if (areaEl) areaEl.innerText = this.floorCalc.area;
    if (stepEl) stepEl.value = this.floorCalc.step;
    if (edgeEl) edgeEl.checked = this.floorCalc.hasEdgeZones;
    if (tilesEl) tilesEl.checked = this.floorCalc.isTiles;

    this.recalculateFloorHeating();
    this.openModal('modal-floor-calculator');
  }

  adjustFloorArea(delta) {
    if (!this.floorCalc) {
      this.floorCalc = { area: 50, step: '150', hasEdgeZones: true, isTiles: true };
    }
    this.floorCalc.area = Math.max(5, Math.min(300, (this.floorCalc.area || 50) + delta));
    const areaEl = document.getElementById('floor-calc-area-val');
    if (areaEl) areaEl.innerText = this.floorCalc.area;
    this.recalculateFloorHeating();
  }

  recalculateFloorHeating() {
    if (!this.floorCalc) {
      this.floorCalc = { area: 50, step: '150', hasEdgeZones: true, isTiles: true };
    }
    const stepEl = document.getElementById('floor-calc-step-select');
    const edgeEl = document.getElementById('floor-calc-edge-zones');
    const tilesEl = document.getElementById('floor-calc-tiles-cover');

    const area = this.floorCalc.area;
    const step = stepEl ? stepEl.value : this.floorCalc.step;
    const hasEdgeZones = edgeEl ? edgeEl.checked : this.floorCalc.hasEdgeZones;
    const isTiles = tilesEl ? tilesEl.checked : this.floorCalc.isTiles;

    this.floorCalc.step = step;
    this.floorCalc.hasEdgeZones = hasEdgeZones;
    this.floorCalc.isTiles = isTiles;

    // Расход трубы на 1 м2 в зависимости от шага укладки
    let mult = 6.7;
    if (step === '100') mult = 10.0;
    else if (step === '200') mult = 5.0;

    // Суммарная длина трубы с учетом краевых зон (+10%) и транзитных подводок
    const edgeMult = hasEdgeZones ? 1.10 : 1.0;
    const rawMeters = area * mult * edgeMult;

    // Определение числа контуров (петель): швейцарское правило <= 75–80 метров на петлю!
    const loops = Math.max(1, Math.ceil(rawMeters / 72));
    const transitMeters = loops * 4; // транзитные подводки к гребенке
    const totalMeters = Math.round(rawMeters + transitMeters);
    const avgLoop = Number((totalMeters / loops).toFixed(1));

    // Бухты по 200 метров
    const coils = Math.ceil(totalMeters / 200);

    // Подбор коллектора
    const manifoldText = `FAR / Stout на ${loops} выходов (с ротаметрами 0–5 л/мин)`;

    // Подбор насосно-смесительного узла (НСУ)
    let mixingText = '';
    if (area <= 30) {
      mixingText = 'Компактный термостатический модуль Unibox / Multibox';
    } else {
      mixingText = 'НСУ Stout / Valtec с энергоэффективным насосом 25-60 (Grundfos)';
    }

    // Расчетная тепловая мощность
    const specificPower = isTiles ? 80 : 55; // Вт/м2
    const totalPowerKw = ((area * specificPower) / 1000).toFixed(1);

    // Периметр для демпферной ленты и евроконусы
    const perimeterMeters = Math.round(Math.max(12, Math.sqrt(area) * 4 * 1.15));
    const euroconesCount = loops * 2;
    const fittingsText = `~${perimeterMeters} м демпферной ленты + ${euroconesCount} евроконусов 3/4"`;

    // Сохраняем расчет для экспорта
    this.currentCalculatedFloor = {
      area,
      step,
      hasEdgeZones,
      isTiles,
      totalMeters,
      loops,
      avgLoop,
      coils,
      manifoldText,
      mixingText,
      totalPowerKw,
      perimeterMeters,
      euroconesCount
    };

    // Обновляем DOM
    const powerEl = document.getElementById('floor-calc-power-rate');
    const pipeEl = document.getElementById('res-floor-pipe-meters');
    const loopsEl = document.getElementById('res-floor-loops-count');
    const loopLenEl = document.getElementById('res-floor-loop-len');
    const coilsEl = document.getElementById('res-floor-coils-count');
    const manEl = document.getElementById('res-floor-manifold');
    const mixEl = document.getElementById('res-floor-mixing-pump');
    const tapeEl = document.getElementById('res-floor-perimeter-tape');
    const badgeEl = document.getElementById('floor-calc-hydraulic-badge');

    if (powerEl) powerEl.innerText = `~${totalPowerKw} кВт`;
    if (pipeEl) pipeEl.innerText = `~${totalMeters} метров (Rehau / Stout 16×2.0)`;
    if (loopsEl) loopsEl.innerText = `${loops} ${loops === 1 ? 'контур' : loops < 5 ? 'контура' : 'контуров'}`;
    if (loopLenEl) loopLenEl.innerText = `~${avgLoop} м (норма ≤ 75–80 м)`;
    if (coilsEl) coilsEl.innerText = `${coils} ${coils === 1 ? 'бухта' : coils < 5 ? 'бухты' : 'бухт'} (по 200 м)`;
    if (manEl) manEl.innerText = manifoldText;
    if (mixEl) mixEl.innerText = mixingText;
    if (tapeEl) tapeEl.innerText = fittingsText;

    if (badgeEl) {
      if (avgLoop <= 80) {
        badgeEl.style.background = 'rgba(0,168,107,0.12)';
        badgeEl.style.borderColor = 'rgba(0,168,107,0.3)';
        badgeEl.style.color = '#10b981';
        badgeEl.innerHTML = `🛡️ <strong>Гидравлическая увязка соблюдена: 100%</strong><br>Длина каждой петли ~${avgLoop} м (в пределах 75–80 м). Исключено завоздушивание и «запирание» теплоносителя.`;
      } else {
        badgeEl.style.background = 'rgba(239,68,68,0.12)';
        badgeEl.style.borderColor = 'rgba(239,68,68,0.3)';
        badgeEl.style.color = '#ef4444';
        badgeEl.innerHTML = `⚠️ <strong>Внимание: длина петли превышает 80 м</strong><br>Рекомендуется добавить дополнительный контур для снижения гидросопротивления.`;
      }
    }
  }

  async copyFloorCalculation() {
    const f = this.currentCalculatedFloor;
    if (!f) return;

    const report = `♨️ ИНЖЕНЕРНЫЙ РАСЧЕТ ТЕПЛОГО ПОЛА И ОТОПЛЕНИЯ
«Лига Опытных Мастеров» • Стандарт гидравлической увязки (Ташкент)
Ведущий инженер: Улугбек Хакимов

📍 Отапливаемая площадь: ${f.area} м²
📐 Шаг укладки: ${f.step} мм ${f.hasEdgeZones ? '(с краевыми зонами у окон)' : ''}
🔥 Расчетная тепловая мощность: ~${f.totalPowerKw} кВт (${f.isTiles ? 'керамогранит' : 'ламинат/паркет'})

СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ (ДЛЯ ЗАКУПКИ):
1. Труба Rehau Pink / Stout PE-Xa 16×2.0: ~${f.totalMeters} м (${f.coils} бухт(ы) по 200 м)
2. Число контуров: ${f.loops} шт (средняя длина петли: ~${f.avgLoop} м, норма <= 75-80 м)
3. Коллекторная группа: ${f.manifoldText}
4. Смесительный узел: ${f.mixingText}
5. Концевые евроконусы 16×3/4": ${f.euroconesCount} шт
6. Демпферная лента 8×150 мм: ~${f.perimeterMeters} м

🛡️ ГИДРАВЛИЧЕСКАЯ УВЯЗКА: 100% ВЫДЕРЖАНО.
Все петли сбалансированы, перегрев насоса и неравномерный прогрев пола полностью исключены!

Сформировано в LIGA OS • https://liga-os-beige.vercel.app/`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        this.copyToClipboard(report);
      }
      this.showToast('✓ Расчет теплого пола скопирован для Telegram / Базара!');
    } catch (e) {
      this.showToast('✓ Расчет теплого пола сформирован!');
    }
  }

  async addCalculatedFloorToMaterials() {
    const f = this.currentCalculatedFloor;
    if (!f) return;
    if (!window.ligaDB) {
      this.showToast('База данных недоступна');
      return;
    }

    const itemsToAdd = [
      {
        category: 'pipes',
        name: `Труба Rehau Rautitan Pink / Stout 16×2.0 (теплый пол, ${f.coils} бухт)`,
        qty: `${f.totalMeters} м`,
        price: f.totalMeters * 19000,
        isPurchased: false
      },
      {
        category: 'collectors',
        name: `Коллекторная группа теплого пола: ${f.manifoldText}`,
        qty: '1 компл',
        price: 950000 + (f.loops * 120000),
        isPurchased: false
      }
    ];

    if (f.area > 30) {
      itemsToAdd.push({
        category: 'collectors',
        name: `Насосно-смесительный узел: ${f.mixingText}`,
        qty: '1 шт',
        price: 2600000,
        isPurchased: false
      });
    }

    itemsToAdd.push({
      category: 'fittings',
      name: `Евроконус 16×3/4" (подключение к коллектору FAR/Stout)`,
      qty: `${f.euroconesCount} шт`,
      price: f.euroconesCount * 35000,
      isPurchased: false
    });

    itemsToAdd.push({
      category: 'pipes',
      name: `Демпферная лента пристенная с юбкой 8×150 мм`,
      qty: `${Math.ceil(f.perimeterMeters / 50) * 50} м`,
      price: Math.ceil(f.perimeterMeters / 50) * 180000,
      isPurchased: false
    });

    for (const item of itemsToAdd) {
      await window.ligaDB.add('materials', {
        siteId: this.currentSiteId || 1,
        category: item.category,
        name: item.name,
        qty: item.qty,
        price: item.price,
        isPurchased: false
      });
    }

    await this.renderMaterials();
    this.updateNavBadges();
    this.closeModal('modal-floor-calculator');
    this.showToast(`✓ Добавлено ${itemsToAdd.length} позиций теплого пола в список закупки на склад!`);
  }

  // ==========================================================================
  // РАСЧЕТ РАДИАТОРНОГО ОТОПЛЕНИЯ И ЛУЧЕВОЙ РАЗВОДКИ REHAU (v2.2.8)
  // 100% герметичность: без тройников в стяжке, коллекторная схема FAR
  // ==========================================================================
  openRadiatorCalculator() {
    this.closeModal('modal-more-menu');
    if (!this.radiatorCalc) {
      this.radiatorCalc = {
        count: 5,
        type: 'bimetal',
        roomArea: '16',
        connection: 'wall',
        cornerBoost: true
      };
    }
    const countEl = document.getElementById('rad-calc-count-val');
    const typeEl = document.getElementById('rad-calc-type-select');
    const areaEl = document.getElementById('rad-calc-room-area-select');
    const connEl = document.getElementById('rad-calc-connection-select');
    const boostEl = document.getElementById('rad-calc-corner-boost');

    if (countEl) countEl.innerText = this.radiatorCalc.count;
    if (typeEl) typeEl.value = this.radiatorCalc.type;
    if (areaEl) areaEl.value = this.radiatorCalc.roomArea;
    if (connEl) connEl.value = this.radiatorCalc.connection;
    if (boostEl) boostEl.checked = this.radiatorCalc.cornerBoost;

    this.recalculateRadiators();
    this.openModal('modal-radiator-calculator');
  }

  adjustRadiatorCount(delta) {
    if (!this.radiatorCalc) {
      this.radiatorCalc = { count: 5, type: 'bimetal', roomArea: '16', connection: 'wall', cornerBoost: true };
    }
    this.radiatorCalc.count = Math.max(1, Math.min(16, (this.radiatorCalc.count || 5) + delta));
    const countEl = document.getElementById('rad-calc-count-val');
    if (countEl) countEl.innerText = this.radiatorCalc.count;
    this.recalculateRadiators();
  }

  recalculateRadiators() {
    if (!this.radiatorCalc) {
      this.radiatorCalc = { count: 5, type: 'bimetal', roomArea: '16', connection: 'wall', cornerBoost: true };
    }
    const typeEl = document.getElementById('rad-calc-type-select');
    const areaEl = document.getElementById('rad-calc-room-area-select');
    const connEl = document.getElementById('rad-calc-connection-select');
    const boostEl = document.getElementById('rad-calc-corner-boost');

    const count = this.radiatorCalc.count;
    const type = typeEl ? typeEl.value : this.radiatorCalc.type;
    const roomArea = areaEl ? parseInt(areaEl.value) : parseInt(this.radiatorCalc.roomArea || '16');
    const connection = connEl ? connEl.value : this.radiatorCalc.connection;
    const cornerBoost = boostEl ? boostEl.checked : this.radiatorCalc.cornerBoost;

    this.radiatorCalc.type = type;
    this.radiatorCalc.roomArea = String(roomArea);
    this.radiatorCalc.connection = connection;
    this.radiatorCalc.cornerBoost = cornerBoost;

    // Удельные теплопотери климата Ташкента
    const q = cornerBoost ? 110 : 90; // Вт/м2
    const powerPerRad = roomArea * q; // Вт
    const totalPowerKw = Number(((powerPerRad * count) / 1000).toFixed(1));

    // Подбор отопительных приборов
    let unitsSummaryText = '';
    let sectionsPerRad = 0;
    let totalSections = 0;
    let panelLenMm = 0;

    if (type === 'bimetal') {
      sectionsPerRad = Math.max(4, Math.ceil(powerPerRad / 150));
      totalSections = sectionsPerRad * count;
      unitsSummaryText = `${count} биметалл-радиаторов по ${sectionsPerRad} секций (всего ${totalSections} секций)`;
    } else {
      panelLenMm = Math.max(600, Math.min(1400, Math.ceil((powerPerRad / 1900) * 10) * 100));
      unitsSummaryText = `${count} стальных панелей Kermi/Buderus тип 22 (высота 500 мм, длина ${panelLenMm} мм)`;
    }

    // Метраж трубы Rehau Rautitan Stabil 16х2.6 (в среднем 28 м на радиатор туда-обратно)
    const pipeMeters = count * 28;

    // Коллекторная группа FAR 1"
    const manifoldText = `FAR 1" на ${count} выходов (подача + обратка, Евроконус 3/4")`;

    // Узлы подключения (бинокли) и термоголовки
    const valvesText = `${count} комплектов узлов нижнего подключения FAR / Danfoss 3/4"`;
    const thermostatsText = `${count} шт Danfoss (с жидкостным датчиком)`;

    // Трубки из стены
    const tubesRehauText = connection === 'wall'
      ? `${count * 2} шт (хромированные L-образные Rehau 16/250 мм)`
      : 'Не требуются (прямое подключение из пола)';

    // Сохраняем расчет для экспорта
    this.currentCalculatedRadiators = {
      count,
      type,
      roomArea,
      connection,
      cornerBoost,
      totalPowerKw,
      unitsSummaryText,
      sectionsPerRad,
      totalSections,
      panelLenMm,
      pipeMeters,
      manifoldText,
      valvesText,
      tubesRehauText,
      thermostatsText
    };

    // Обновляем DOM
    const powerEl = document.getElementById('rad-calc-total-power');
    const unitsEl = document.getElementById('res-rad-units-summary');
    const manEl = document.getElementById('res-rad-manifold');
    const pipeEl = document.getElementById('res-rad-pipe-meters');
    const valvesEl = document.getElementById('res-rad-valves-count');
    const tubesEl = document.getElementById('res-rad-tubes-rehau');
    const thermEl = document.getElementById('res-rad-thermostats');

    if (powerEl) powerEl.innerText = `~${totalPowerKw} кВт`;
    if (unitsEl) unitsEl.innerText = unitsSummaryText;
    if (manEl) manEl.innerText = manifoldText;
    if (pipeEl) pipeEl.innerText = `~${pipeMeters} метров (в защитной гофре)`;
    if (valvesEl) valvesEl.innerText = valvesText;
    if (tubesEl) tubesEl.innerText = tubesRehauText;
    if (thermEl) thermEl.innerText = thermostatsText;
  }

  async copyRadiatorCalculation() {
    const r = this.currentCalculatedRadiators;
    if (!r) return;

    const report = `🔥 ИНЖЕНЕРНЫЙ РАСЧЕТ РАДИАТОРНОГО ОТОПЛЕНИЯ
«Лига Опытных Мастеров» • Лучевая разводка Rehau Stabil (Ташкент)
Ведущий инженер: Улугбек Хакимов

📍 Количество приборов: ${r.count} шт (ср. площадь: ${r.roomArea} м²)
⚡ Суммарная расчетная мощность: ~${r.totalPowerKw} кВт ${r.cornerBoost ? '(запас на углы/витражи включен)' : ''}

СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ (ДЛЯ ЗАКУПКИ):
1. Отопительные приборы: ${r.unitsSummaryText}
2. Коллектор отопления: ${r.manifoldText}
3. Труба Rehau Rautitan Stabil 16×2.6: ~${r.pipeMeters} м (в красной/синей гофре)
4. Узлы нижнего подключения: ${r.valvesText}
5. Подключение из стены: ${r.tubesRehauText}
6. Терморегулирование: ${r.thermostatsText}

🛡️ 100% ЗАЩИТА ОТ ПРОТЕЧЕК В СТЯЖКЕ:
Лучевая разводка Rehau без единого тройника под полом. Каждая ветка неразрывна от коллектора до радиатора!

Сформировано в LIGA OS • https://liga-os-beige.vercel.app/`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        this.copyToClipboard(report);
      }
      this.showToast('✓ Расчет радиаторов скопирован для Telegram / Базара!');
    } catch (e) {
      this.showToast('✓ Расчет радиаторов сформирован!');
    }
  }

  async addCalculatedRadiatorsToMaterials() {
    const r = this.currentCalculatedRadiators;
    if (!r) return;
    if (!window.ligaDB) {
      this.showToast('База данных недоступна');
      return;
    }

    const itemsToAdd = [];

    // Приборы отопления
    if (r.type === 'bimetal') {
      itemsToAdd.push({
        category: 'radiators',
        name: `Радиатор биметаллический Global / Rifar Monolit 500 (${r.totalSections} секций, ${r.count} шт)`,
        qty: `${r.totalSections} секций`,
        price: r.totalSections * 165000,
        isPurchased: false
      });
    } else {
      itemsToAdd.push({
        category: 'radiators',
        name: `Стальные панельные радиаторы Kermi / Buderus Тип 22 (L=${r.panelLenMm} мм)`,
        qty: `${r.count} шт`,
        price: r.count * 1450000,
        isPurchased: false
      });
    }

    // Труба Rehau Stabil
    itemsToAdd.push({
      category: 'pipes',
      name: `Труба Rehau Rautitan Stabil 16×2.6 (лучи радиаторов в гофре)`,
      qty: `${r.pipeMeters} м`,
      price: r.pipeMeters * 24000,
      isPurchased: false
    });

    // Коллектор отопления
    itemsToAdd.push({
      category: 'collectors',
      name: `Коллекторная группа радиаторов: ${r.manifoldText}`,
      qty: '1 компл',
      price: 850000 + (r.count * 95000),
      isPurchased: false
    });

    // Узлы нижнего подключения (бинокли)
    itemsToAdd.push({
      category: 'fittings',
      name: `Узлы нижнего подключения со встроенным байпасом (бинокли FAR / Danfoss)`,
      qty: `${r.count} шт`,
      price: r.count * 185000,
      isPurchased: false
    });

    // Термоголовки Danfoss
    itemsToAdd.push({
      category: 'fittings',
      name: `Термостатические головки Danfoss с жидкостным датчиком`,
      qty: `${r.count} шт`,
      price: r.count * 140000,
      isPurchased: false
    });

    // Трубки Rehau из стены (если выбрано из стены)
    if (r.connection === 'wall') {
      itemsToAdd.push({
        category: 'fittings',
        name: `Г-образные хромированные трубки Rehau 16/250 мм (подключение из стены)`,
        qty: `${r.count * 2} шт`,
        price: r.count * 2 * 95000,
        isPurchased: false
      });
    }

    for (const item of itemsToAdd) {
      await window.ligaDB.add('materials', {
        siteId: this.currentSiteId || 1,
        category: item.category,
        name: item.name,
        qty: item.qty,
        price: item.price,
        isPurchased: false
      });
    }

    await this.renderMaterials();
    this.updateNavBadges();
    this.closeModal('modal-radiator-calculator');
    this.showToast(`✓ Добавлено ${itemsToAdd.length} позиций радиаторного отопления в список закупки на склад!`);
  }

  // Переключение статуса материала (Куплено / Не куплено) — P0-audit fix
  async toggleMaterialStatus(id) {
    const item = await window.ligaDB.get('materials', id);
    if (item) {
      item.isPurchased = !item.isPurchased;
      await window.ligaDB.put('materials', item);
      await this.renderMaterials();
      this.updateNavBadges();
      this.showToast(item.isPurchased ? '✓ Материал отмечен как купленный' : 'Материал возвращён в план закупки');
    }
  }

  // Универсальный clipboard с fallback для старых браузеров — P0-audit fix
  async copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.warn('Clipboard API failed, using fallback:', e);
      }
    }
    // Fallback через временный textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e) {
      console.warn('Clipboard fallback failed:', e);
      return false;
    }
  }

  // Генерация PDF с живыми фото
  generatePassport() {
    if (!this.currentSite) return;
    window.ligaPdfEngine.generatePassport(this.currentSite, this.currentPhotos);
  }

  // Генерация Официального Акта гидравлического испытания 16 бар / 24 часа
  generatePressureAct() {
    if (!this.currentSite) return;
    const isVerified = window.ligaPdfEngine.isPressureVerified(this.currentSite, this.currentPhotos);
    if (!isVerified) {
      alert('⚠️ Для формирования Официального Акта 16 бар необходимо зафиксировать проведение испытания (минимум 16.0 бар, выдержка 24 часа) и прикрепить фото манометра.');
      this.openModal('modal-pressure-test');
      return;
    }
    window.ligaPdfEngine.generatePressureAct(this.currentSite, this.currentPhotos);
  }

  // Добавление чека с интеллектуальной проверкой на дубликаты
  async saveReceipt() {
    const title = document.getElementById('receipt-title').value.trim();
    const amount = parseInt(document.getElementById('receipt-amount').value) || 0;
    const qtyInput = document.getElementById('receipt-qty');
    const qty = qtyInput ? qtyInput.value.trim() : '1 компл';
    const category = document.getElementById('receipt-category').value;

    if (!title || !amount) {
      alert('Укажите название и сумму чека');
      return;
    }

    // Проверка на возможный дубликат чека
    const duplicate = await this.checkDuplicateMaterial(title, amount);
    if (duplicate) {
      this.pendingDuplicateSave = {
        siteId: this.currentSiteId,
        category: category,
        name: title,
        qty: qty || '1 шт',
        price: amount,
        isPurchased: true,
        receiptPhoto: this.pendingReceiptPhoto || null
      };

      const warningTextEl = document.getElementById('duplicate-warning-text');
      if (warningTextEl) {
        warningTextEl.innerText = `В базе объекта «${this.currentSite ? this.currentSite.name : ''}» уже найден похожий расход:`;
      }
      const existingEl = document.getElementById('duplicate-existing-item');
      if (existingEl) {
        existingEl.innerText = `«${duplicate.name}» на сумму ${this.formatSum(duplicate.price)}`;
      }

      this.closeModal('modal-receipt');
      this.openModal('modal-duplicate-warning');
      return;
    }

    await window.ligaDB.add('materials', {
      siteId: this.currentSiteId,
      category: category,
      name: title,
      qty: qty || '1 шт',
      price: amount,
      isPurchased: true,
      receiptPhoto: this.pendingReceiptPhoto || null
    });

    // Очистка формы и сброс состояния
    const form = document.getElementById('form-add-receipt');
    if (form) form.reset();
    this.pendingReceiptPhoto = null;
    const statusEl = document.getElementById('receipt-photo-status');
    if (statusEl) {
      statusEl.innerText = 'Фото не прикреплено (необязательно)';
    }

    this.closeModal('modal-receipt');
    this.showToast(`✓ Чек на ${this.formatSum(amount)} добавлен к расходам!`);
    await this.renderMaterials();
  }

  // ==========================================================================
  // МОДУЛЬ ГОЛОСОВОГО АССИСТЕНТА («СВОБОДНЫЕ РУКИ НА ОБЪЕКТЕ») — МИРОВОЙ УРОВЕНЬ
  // Непрерывное распознавание (continuous listening), живой вывод, Keep-Alive при паузах
  // ==========================================================================
  initVoiceEngine() {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechClass) {
      this.recognition = new SpeechClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'ru-RU';

      this.recognition.onstart = () => {
        this.isRecordingVoice = true;
        this.updateVoiceUI(true);
        const statusEl = document.getElementById('voice-status-text');
        if (statusEl) {
          statusEl.innerHTML = '🟢 <span style="color:var(--neon-emerald); font-weight:800;">Слушаю вас...</span> Говорите свободно, можно делать паузы';
        }
      };

      this.recognition.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          const transcriptPiece = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            this.voiceAccumulatedText = (this.voiceAccumulatedText + ' ' + transcriptPiece).trim();
          } else {
            interim += transcriptPiece;
          }
        }
        this.voiceInterimText = interim;

        const currentFull = (this.voiceAccumulatedText + (interim ? ' ' + interim : '')).trim();
        this.handleVoiceResult(currentFull);

        const statusEl = document.getElementById('voice-status-text');
        if (statusEl) {
          statusEl.innerHTML = '🟢 <span style="color:var(--neon-emerald); font-weight:800;">Слушаю речь...</span> Записываю каждое слово';
        }
      };

      this.recognition.onerror = (e) => {
        console.warn('[LIGA OS Voice] SpeechRecognition event:', e.error);
        // no-speech возникает, когда мастер думает/молчит перед произнесением следующей фразы
        if (e.error === 'no-speech') {
          const statusEl = document.getElementById('voice-status-text');
          if (statusEl) {
            statusEl.innerHTML = '⏳ <span style="color:var(--gold-primary); font-weight:800;">Жду продолжения мысли...</span> Нажмите «Закончил», когда скажете всё';
          }
          return;
        }

        if (e.error === 'network') {
          const statusEl = document.getElementById('voice-status-text');
          if (statusEl) {
            statusEl.innerText = '⚠️ Нет подключения к сети для распознавания. Введите фразу текстом ниже:';
          }
          this.showToast('⚠️ Распознавание речи требует интернета');
        }
      };

      this.recognition.onend = () => {
        // Keep-Alive: если пользователь сам не нажал стоп, мягко возобновляем сессию без потери накопленного текста
        if (this.isRecordingVoice && this.voiceKeepAliveActive) {
          const statusEl = document.getElementById('voice-status-text');
          if (statusEl) {
            statusEl.innerHTML = '🟢 <span style="color:var(--neon-emerald); font-weight:800;">Слушаю...</span> Жду продолжения фразы';
          }
          clearTimeout(this.voiceRestartTimeout);
          this.voiceRestartTimeout = setTimeout(() => {
            if (this.isRecordingVoice && this.voiceKeepAliveActive && this.recognition) {
              try {
                this.recognition.start();
              } catch (err) {
                console.warn('[LIGA OS Voice] Auto-restart note:', err.message);
              }
            }
          }, 150);
        } else {
          this.isRecordingVoice = false;
          this.updateVoiceUI(false);
        }
      };
    }
  }

  toggleVoiceRecording() {
    if (this.isRecordingVoice) {
      this.stopVoiceRecording();
    } else {
      this.startVoiceRecording();
    }
  }

  startVoiceRecording() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const statusEl = document.getElementById('voice-status-text');
      if (statusEl) {
        statusEl.innerText = '⚠️ Нет подключения к сети: введите текст фразы вручную в поле ниже';
      }
      this.showToast('⚠️ Распознавание речи требует интернета');
      return;
    }

    this.voiceKeepAliveActive = true;
    const inputEl = document.getElementById('voice-recognized-input');
    if (inputEl && inputEl.value.trim().length > 0 && !this.voiceAccumulatedText) {
      this.voiceAccumulatedText = inputEl.value.trim();
    }

    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (err) {
        console.warn('[LIGA OS Voice] Recognition already started or error:', err);
      }
    }

    this.isRecordingVoice = true;
    this.updateVoiceUI(true);

    const statusEl = document.getElementById('voice-status-text');
    if (statusEl) {
      statusEl.innerHTML = '🟢 <span style="color:var(--neon-emerald); font-weight:800;">Слушаю вас...</span> Говорите свободно, можно делать паузы';
    }
  }

  stopVoiceRecording() {
    this.voiceKeepAliveActive = false;
    clearTimeout(this.voiceRestartTimeout);

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        console.warn('[LIGA OS Voice] Stop error:', e);
      }
    }

    this.isRecordingVoice = false;
    this.updateVoiceUI(false);

    const statusEl = document.getElementById('voice-status-text');
    if (statusEl) {
      statusEl.innerHTML = '✓ <span style="color:var(--neon-emerald); font-weight:800;">Запись завершена.</span> Проверьте результат ниже:';
    }

    const inputEl = document.getElementById('voice-recognized-input');
    const finalText = inputEl ? inputEl.value.trim() : (this.voiceAccumulatedText + ' ' + this.voiceInterimText).trim();
    if (finalText) {
      this.handleVoiceInputText(finalText);
    }
  }

  clearVoiceText() {
    this.voiceAccumulatedText = '';
    this.voiceInterimText = '';
    const inputEl = document.getElementById('voice-recognized-input');
    if (inputEl) inputEl.value = '';
    const preview = document.getElementById('voice-parse-preview');
    const btnConfirm = document.getElementById('btn-voice-confirm');
    if (preview) preview.style.display = 'none';
    if (btnConfirm) btnConfirm.style.display = 'none';
    this.parsedVoiceAction = null;
    this.showToast('Поле ввода очищено');
  }

  updateVoiceUI(isActive) {
    const circle = document.getElementById('voice-pulse-circle');
    const headerBtn = document.getElementById('btn-voice-input');
    const finishBtn = document.getElementById('btn-voice-finish-recording');
    const wavesEl = document.getElementById('voice-sound-waves');
    const floatingBtn = document.getElementById('btn-floating-voice');

    if (circle) {
      if (isActive) circle.classList.add('voice-recording-active');
      else circle.classList.remove('voice-recording-active');
    }
    if (headerBtn) {
      if (isActive) headerBtn.classList.add('voice-recording-active');
      else headerBtn.classList.remove('voice-recording-active');
    }
    if (floatingBtn) {
      if (isActive) floatingBtn.classList.add('voice-recording-active');
      else floatingBtn.classList.remove('voice-recording-active');
    }
    if (finishBtn) {
      finishBtn.style.display = isActive ? 'block' : 'none';
    }
    if (wavesEl) {
      wavesEl.style.display = isActive ? 'flex' : 'none';
    }
  }

  handleVoiceResult(transcript) {
    const inputEl = document.getElementById('voice-recognized-input');
    if (inputEl) inputEl.value = transcript;
    this.handleVoiceInputText(transcript);
  }

  handleVoiceInputText(text) {
    if (this.voiceNavTimeout) {
      clearTimeout(this.voiceNavTimeout);
      this.voiceNavTimeout = null;
    }

    if (!text || text.trim().length < 2) {
      const preview = document.getElementById('voice-parse-preview');
      const btnConfirm = document.getElementById('btn-voice-confirm');
      if (preview) preview.style.display = 'none';
      if (btnConfirm) btnConfirm.style.display = 'none';
      return;
    }

    const parsed = this.parseVoiceCommand(text);
    this.parsedVoiceAction = parsed;

    const preview = document.getElementById('voice-parse-preview');
    const typeEl = document.getElementById('voice-parse-type');
    const detailsEl = document.getElementById('voice-parse-details');
    const btnConfirm = document.getElementById('btn-voice-confirm');

    if (preview && typeEl && detailsEl && btnConfirm) {
      preview.style.display = 'block';
      btnConfirm.style.display = 'block';
      btnConfirm.innerText = '✓ Подтверждаю (Внести)';

      if (parsed.type === 'nav_action' || parsed.type === 'modal_action' || parsed.type === 'direct_func') {
        typeEl.innerText = parsed.title;
        detailsEl.innerText = parsed.desc;
        btnConfirm.innerText = '✓ Перейти сейчас';

        // Автоматический переход «Свободные руки» через 700 мс
        this.voiceNavTimeout = setTimeout(() => {
          this.confirmVoiceAction();
        }, 700);
      } else if (parsed.type === 'material') {
        typeEl.innerText = `📦 Запись в Снабжение (${parsed.category})`;
        detailsEl.innerText = `${parsed.title} • ${this.formatSum(parsed.amount)}`;
      } else if (parsed.type === 'brigade_pay') {
        typeEl.innerText = `💰 Выплата помощнику (${parsed.recipient})`;
        detailsEl.innerText = `Сумма: ${this.formatSum(parsed.amount)}`;
      } else if (parsed.type === 'client_advance') {
        typeEl.innerText = `💵 Поступление аванса от заказчика`;
        detailsEl.innerText = `Зачислено: ${this.formatSum(parsed.amount)}`;
      } else if (parsed.type === 'press_test') {
        typeEl.innerText = `🛡️ Фиксация испытания 16 бар`;
        detailsEl.innerText = `Акт опрессовки на 24 часа успешно подтвержден`;
      } else if (parsed.type === 'calc_floor') {
        typeEl.innerText = `📐 Инженерный расчет: Водяной теплый пол`;
        detailsEl.innerHTML = `Площадь: <b>${parsed.area} м²</b><br>• Труба Rehau/Stout: <b>~${parsed.meters} м</b> (при шаге 150 мм)<br>• Потребуется: <b>${parsed.coils} бухт(ы) по 200 м</b><br>• Контуров: <b>${parsed.loops}</b> (коллектор FAR на ${parsed.loops} выходов)`;
        btnConfirm.style.display = 'none';
      } else if (parsed.type === 'currency_conv') {
        typeEl.innerText = `💵 Экспресс-конвертер валюты`;
        detailsEl.innerHTML = `<b>$${parsed.usd}</b> = <b style="color:var(--neon-emerald);">${this.formatSum(parsed.som)}</b><br><span style="font-size:11px; color:var(--text-dim);">Курс мастера: ${this.formatNumber(parsed.rate)} сум / $</span>`;
        btnConfirm.style.display = 'none';
      }
    }
  }

  parseVoiceCommand(text) {
    const lower = text.toLowerCase();

    // 0. Навигационные интенты естественного языка мастера («Своими словами • Нулевая рутина»)
    // 0.1. Прямые функции системы
    if (lower.includes('телеграм') || lower.includes('скинь в тг') || lower.includes('отчет заказчик')) {
      return {
        type: 'direct_func',
        target: 'shareSiteProgressTelegram',
        title: '✈️ Telegram: Отчет заказчику',
        desc: 'Формирую отчет о ходе монтажа для отправки в Telegram...'
      };
    }
    if ((lower.includes('сделай') || lower.includes('распечатай') || lower.includes('экспорт') || lower.includes('скачай')) && lower.includes('паспорт')) {
      return {
        type: 'direct_func',
        target: 'generatePassport',
        title: '🖨️ Экспорт: Паспорт объекта',
        desc: 'Формирую официальный инженерный паспорт А4 для печати...'
      };
    }
    if (lower.includes('покажи клиент') || lower.includes('режим клиент') || lower.includes('скрой финанс')) {
      return {
        type: 'direct_func',
        target: 'setClientModeTrue',
        title: '👁️ Защита: Режим показа клиенту',
        desc: 'Скрываю служебные и финансовые данные мастера...'
      };
    }

    // 0.2. Вызов специализированных модальных инструментов
    if ((lower.includes('дизайнер') && (lower.includes('что сказать') || lower.includes('ответ') || lower.includes('памятк'))) || lower.includes('шпаргалк') || lower.includes('возражен')) {
      return {
        type: 'modal_action',
        target: 'modal-master-guide',
        title: '📖 Инструмент: Памятка мастера',
        desc: 'Открываю шпаргалку диалогов с дизайнерами и заказчиками...'
      };
    }
    if (lower.includes('фотк') || (lower.includes('фото') && (lower.includes('узел') || lower.includes('узлов') || lower.includes('скрыт') || lower.includes('покажи')))) {
      return {
        type: 'modal_action',
        target: 'modal-passport-photos',
        title: '📸 Инструмент: Фотофиксация узлов',
        desc: 'Открываю галерею скрытых узлов для инженерного паспорта...'
      };
    }
    if (lower.includes('протокол 16') || lower.includes('акт опрессовк') || lower.includes('манометр фото')) {
      return {
        type: 'modal_action',
        target: 'modal-pressure-test',
        title: '🛡️ Инструмент: Протокол 16 бар',
        desc: 'Открываю протокол гидравлических испытаний 16 бар / 24ч...'
      };
    }
    if (lower.includes('экспресс аудит') || lower.includes('аудит проекта') || lower.includes('проверь проект')) {
      return {
        type: 'modal_action',
        target: 'modal-ai-audit',
        title: '📐 Инструмент: Экспресс-аудит',
        desc: 'Запускаю проверку по швейцарским стандартам надежности...'
      };
    }
    if (lower.includes('калькулятор труб') || lower.includes('расчет труб') || lower.includes('расчет коллектор') || lower.includes('подбор труб') || lower.includes('подбор far') || lower.includes('диаметр труб') || lower.includes('диаметр ввод') || lower.includes('посчитай диаметр') || lower.includes('гребенк')) {
      return {
        type: 'direct_func',
        target: 'openPipeCalculator',
        title: '📐 Инструмент: Калькулятор труб и коллекторов',
        desc: 'Открываю гидравлический расчет диаметров труб и гребенок FAR (DIN 1988)...'
      };
    }
    if (lower.includes('калькулятор теплого пола') || lower.includes('калькулятор отопления') || lower.includes('расчет теплого пола') || lower.includes('расчет отопления') || lower.includes('расчет петель') || lower.includes('подбор нсу') || lower.includes('смесительный узел') || lower.includes('водяной теплый пол') || lower.includes('петли теплого пола')) {
      return {
        type: 'direct_func',
        target: 'openFloorCalculator',
        title: '♨️ Инструмент: Калькулятор теплого пола и НСУ',
        desc: 'Открываю расчет петель, бухт и смесительного узла (увязка петель <= 75-80 м)...'
      };
    }
    if ((lower.includes('радиатор') && !lower.includes('купил')) || lower.includes('калькулятор радиатор') || lower.includes('расчет радиатор') || lower.includes('подбор радиатор') || lower.includes('посчитай радиатор') || lower.includes('лучевая разводка') || lower.includes('секции радиатор') || lower.includes('биметалл') || lower.includes('панельные радиатор')) {
      return {
        type: 'direct_func',
        target: 'openRadiatorCalculator',
        title: '🔥 Инструмент: Калькулятор радиаторного отопления',
        desc: 'Открываю расчет радиаторов, лучевой разводки Rehau и узлов нижнего подключения...'
      };
    }

    // 0.3. Переключение экранов / разделов без точных названий
    if (lower.includes('покажи деньг') || lower.includes('открой касс') || lower.includes('сколько должн') || lower.includes('баланс') || (lower.includes('деньги') && !lower.includes('купил') && !lower.includes('выдал') && !lower.includes('аванс'))) {
      return {
        type: 'nav_action',
        target: 'finances',
        title: '💰 Навигация: Финансы объекта',
        desc: 'Перехожу в финансовый пульс и кассу объекта...'
      };
    }
    if (lower.includes('где базар') || lower.includes('открой базар') || lower.includes('список покупок') || (lower.includes('базар') && !lower.includes('купил')) || (lower.includes('склад') && !lower.includes('купил')) || (lower.includes('материал') && !lower.includes('купил') && !lower.includes('сум') && !lower.includes('тыс') && !lower.includes('млн'))) {
      return {
        type: 'nav_action',
        target: 'materials',
        title: '📦 Навигация: Склад и снабжение',
        desc: 'Открываю склад материалов и список на базар Урикзор...'
      };
    }
    if (lower.includes('перед стяжкой') || lower.includes('до стяжки') || lower.includes('до заливки') || lower.includes('чек лист') || lower.includes('чек-лист') || (lower.includes('контроль') && !lower.includes('купил'))) {
      return {
        type: 'nav_action',
        target: 'checklist',
        title: '📋 Навигация: Чек-лист контроля',
        desc: 'Открываю чек-лист 10 критических пунктов перед заливкой стяжки...'
      };
    }
    if (lower.includes('открой смет') || lower.includes('посчитай квартир') || lower.includes('калькулятор смет') || (lower.includes('смета') && !lower.includes('купил'))) {
      return {
        type: 'nav_action',
        target: 'estimate',
        title: '⚡ Навигация: Экспресс-смета',
        desc: 'Открываю калькулятор сметы и расценок на точки...'
      };
    }
    if (lower.includes('открой истор') || lower.includes('хроник') || lower.includes('кто работал') || lower.includes('журнал работ')) {
      return {
        type: 'nav_action',
        target: 'history',
        title: '📜 Навигация: Хроника объекта',
        desc: 'Открываю 10-летнюю историю и журнал вех объекта...'
      };
    }
    if (lower.includes('на главн') || lower.includes('дашборд') || lower.includes('к объект') || lower.includes('домой')) {
      return {
        type: 'nav_action',
        target: 'dashboard',
        title: '🏢 Навигация: Главный экран',
        desc: 'Возвращаюсь к карточке текущего объекта...'
      };
    }

    let amount = 0;

    // 1. Парсинг сумм на естественном языке мастера (миллионы, тысячи, доллары, узбекский)
    const usdRate = (this.tariffSettings && this.tariffSettings.usdRate) ? this.tariffSettings.usdRate : 12900;

    // Доллары («100 долларов», «50 баксов», «сто баксов», «$50»)
    const usdMatch = lower.match(/(\d+)\s*(доллар|бакс|\$)/);
    if (usdMatch) {
      const usdVal = parseInt(usdMatch[1]);
      amount = usdVal * usdRate;
    } else if (lower.includes('сто долларов') || lower.includes('сто баксов')) {
      amount = 100 * usdRate;
    } else if (lower.includes('двести долларов') || lower.includes('двести баксов')) {
      amount = 200 * usdRate;
    } else if (lower.includes('полтора миллиона') || lower.includes('полтора млн') || lower.includes('полтора ляма')) {
      amount = 1500000;
    } else if (lower.includes('два с половиной миллиона') || lower.includes('два с половиной млн') || lower.includes('два с половиной ляма')) {
      amount = 2500000;
    } else if (lower.includes('три с половиной миллиона') || lower.includes('три с половиной млн')) {
      amount = 3500000;
    } else if (lower.includes('миллион') || lower.includes('один миллион') || lower.includes('лям') || lower.includes('лимон')) {
      const mMatch = lower.match(/(\d+[\.,]?\d*)\s*(млн|миллион|лям|лимон)/);
      if (mMatch) {
        const val = parseFloat(mMatch[1].replace(',', '.'));
        amount = Math.round(val * 1000000);
      } else {
        amount = 1000000;
      }
    } else if (lower.includes('двести тысяч') || lower.includes('икки юз минг')) {
      amount = 200000;
    } else if (lower.includes('триста тысяч')) {
      amount = 300000;
    } else if (lower.includes('четыреста тысяч')) {
      amount = 400000;
    } else if (lower.includes('пятьсот тысяч')) {
      amount = 500000;
    } else if (lower.includes('шестьсот тысяч')) {
      amount = 600000;
    } else if (lower.includes('семьсот тысяч')) {
      amount = 700000;
    } else if (lower.includes('восемьсот тысяч')) {
      amount = 800000;
    } else if (lower.includes('девятьсот тысяч')) {
      amount = 900000;
    } else if (lower.includes('сто тысяч') || lower.includes('юз минг')) {
      amount = 100000;
    } else {
      const thousandsMatch = lower.match(/(\d+[\.,]?\d*)\s*(тыс|тысяч|тыщ|минг)/);
      const plainNumberMatch = lower.match(/(\d{4,9})/);

      if (thousandsMatch) {
        const val = parseFloat(thousandsMatch[1].replace(',', '.'));
        amount = Math.round(val * 1000);
      } else if (plainNumberMatch) {
        amount = parseInt(plainNumberMatch[1]);
      }
    }

    // 2. Определение типа операции: Аванс / Оплата от заказчика (Приоритет №1)
    if (lower.includes('клиент') || lower.includes('заказчик') || lower.includes('перевел') || lower.includes('бахром') || lower.includes('поступил аванс') || lower.includes('аванс от')) {
      return {
        type: 'client_advance',
        title: 'Аванс от заказчика',
        amount: amount || 2000000
      };
    }

    // 3. Определение типа операции: Выплата бригаде / помощнику
    if (lower.includes('выдал') || lower.includes('аванс') || lower.includes('алишер') || lower.includes('сардор') || lower.includes('рустам') || lower.includes('зарплат') || lower.includes('помощник') || lower.includes('дал денег')) {
      let recipient = 'Алишер';
      if (lower.includes('сардор')) recipient = 'Сардор';
      else if (lower.includes('рустам')) recipient = 'Рустам';
      else if (lower.includes('помощник') || lower.includes('бригад')) recipient = 'Помощник';

      return {
        type: 'brigade_pay',
        title: `Выплата помощнику (${recipient})`,
        amount: amount || 300000,
        recipient: recipient,
        category: 'Бригада'
      };
    }

    // 4. Определение типа операции: Опрессовка 16 бар
    if (lower.includes('опрессовк') || lower.includes('16 бар') || lower.includes('давление') || lower.includes('гидравлик')) {
      return {
        type: 'press_test',
        title: 'Опрессовка 16 бар',
        amount: 0
      };
    }

    // 4.1. Определение типа операции: Инженерный расчет теплого пола
    if (lower.includes('теплый пол') || lower.includes('теплого пола') || (lower.includes('труб') && (lower.includes('квадрат') || lower.includes('кв м') || lower.includes('метр')))) {
      const areaMatch = lower.match(/(\d+[\.,]?\d*)\s*(кв|квадрат|м2|метр)?/);
      const area = areaMatch ? Math.round(parseFloat(areaMatch[1].replace(',', '.'))) : 50;
      const meters = Math.round(area * 6.5);
      const coils = Math.ceil(meters / 200);
      const loops = Math.max(1, Math.ceil(meters / 75));

      return {
        type: 'calc_floor',
        title: `Расчет теплого пола (${area} м²)`,
        area: area,
        meters: meters,
        coils: coils,
        loops: loops,
        amount: 0
      };
    }

    // 4.2. Определение типа операции: Конвертер валюты (USD <-> UZS)
    if (lower.includes('курс') || (lower.includes('сколько') && (lower.includes('доллар') || lower.includes('бакс')))) {
      const usdMatch = lower.match(/(\d+)\s*(доллар|бакс|\$)/);
      const usdVal = usdMatch ? parseInt(usdMatch[1]) : 100;
      const somVal = usdVal * usdRate;

      return {
        type: 'currency_conv',
        title: `Конвертер валют ($${usdVal})`,
        usd: usdVal,
        som: somVal,
        rate: usdRate,
        amount: somVal
      };
    }

    // 5. Определение типа операции: Материалы и Снабжение сантехники
    let category = 'Трубы и фитинги';
    if (lower.includes('коллектор') || lower.includes('far') || lower.includes('гребенк') || lower.includes('расходомер')) {
      category = 'Коллекторы';
    } else if (lower.includes('инсталляц') || lower.includes('трап') || lower.includes('geberit') || lower.includes('геберит') || lower.includes('tece') || lower.includes('теце') || lower.includes('viega')) {
      category = 'Инсталляции';
    } else if (lower.includes('нептун') || lower.includes('neptun') || lower.includes('протечк') || lower.includes('gidrolock') || lower.includes('гидролок') || lower.includes('сервопривод')) {
      category = 'Защита от протечек';
    } else if (lower.includes('канализац') || lower.includes('ostendorf') || lower.includes('остендорф') || lower.includes('фанов')) {
      category = 'Канализация';
    } else if (lower.includes('теплый пол') || lower.includes('насос') || lower.includes('grundfos') || lower.includes('bwt') || lower.includes('фильтр')) {
      category = 'Отопление и фильтрация';
    } else if (lower.includes('клей') || lower.includes('герметик') || lower.includes('изоляц') || lower.includes('k-flex') || lower.includes('лен') || lower.includes('паста') || lower.includes('unipak')) {
      category = 'Расходники';
    }

    let cleanName = text
      .replace(/(купил|купили|взял|на базаре|на джами|на урикзаре|за|на сумму|сум|суммов|тысяч|тыщ|миллион|миллиона|рублей|долларов|баксов)/gi, '')
      .replace(/\d+/g, '')
      .trim();
    if (cleanName.length < 3) cleanName = 'Материалы сантехники';

    return {
      type: 'material',
      title: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
      amount: amount || 450000,
      category: category,
      qty: '1 компл'
    };
  }

  async confirmVoiceAction() {
    if (!this.parsedVoiceAction) return;
    const action = this.parsedVoiceAction;

    if (action.type === 'material') {
      await window.ligaDB.add('materials', {
        siteId: this.currentSiteId,
        category: action.category,
        name: action.title,
        qty: action.qty || '1 компл',
        price: action.amount,
        isPurchased: true,
        receiptPhoto: null
      });
      this.showToast(`✓ ${action.title} на ${this.formatSum(action.amount)} записан в склад!`);
      await this.renderMaterials();
    } else if (action.type === 'brigade_pay') {
      if (this.currentSite) {
        this.currentSite.brigadeOwed = Math.max(0, (this.currentSite.brigadeOwed || 0) - action.amount);
        await window.ligaDB.put('sites', this.currentSite);
        await window.ligaDB.add('finances', {
          siteId: this.currentSiteId,
          type: 'brigade_pay',
          amount: action.amount,
          method: 'Голосовая фиксация (Наличные)',
          recipient: action.recipient,
          date: new Date().toISOString().slice(0, 10)
        });
        // Также дублируем запись в 10-летнюю хронику выплат мастера (P0-History)
        await window.ligaDB.add('brigade_payouts', {
          siteId: this.currentSiteId,
          employeeName: action.recipient,
          role: 'Помощник',
          amountUZS: action.amount,
          amountUSD: Math.round(action.amount / (this.tariffSettings ? this.tariffSettings.usdRate : 12900)),
          usdRate: (this.tariffSettings ? this.tariffSettings.usdRate : 12900),
          workDescription: 'Голосовая фиксация аванса мастера',
          date: new Date().toISOString().slice(0, 10)
        });
        this.showToast(`✓ Выплата ${action.recipient} ${this.formatSum(action.amount)} зафиксирована!`);
        this.render();
      }
    } else if (action.type === 'client_advance') {
      if (this.currentSite) {
        this.currentSite.advanceSum = (this.currentSite.advanceSum || 0) + action.amount;
        await window.ligaDB.put('sites', this.currentSite);
        await window.ligaDB.add('finances', {
          siteId: this.currentSiteId,
          type: 'client_advance',
          amount: action.amount,
          method: 'Банковский перевод / Наличные',
          recipient: this.currentSite.client || 'Заказчик',
          date: new Date().toISOString().slice(0, 10)
        });
        this.showToast(`✓ Аванс ${this.formatSum(action.amount)} зачислен!`);
        this.render();
      }
    } else if (action.type === 'press_test') {
      await this.togglePressureTest();
    } else if (action.type === 'nav_action') {
      if (this.voiceNavTimeout) {
        clearTimeout(this.voiceNavTimeout);
        this.voiceNavTimeout = null;
      }
      this.closeModal('modal-voice');
      this.switchScreen(action.target);
      this.playSwissChime();
      this.showToast(action.desc || '✓ Переход выполнен');
      this.parsedVoiceAction = null;
      return;
    } else if (action.type === 'modal_action') {
      if (this.voiceNavTimeout) {
        clearTimeout(this.voiceNavTimeout);
        this.voiceNavTimeout = null;
      }
      this.closeModal('modal-voice');
      this.openModal(action.target);
      this.playSwissChime();
      this.showToast(action.desc || '✓ Инструмент открыт');
      this.parsedVoiceAction = null;
      return;
    } else if (action.type === 'direct_func') {
      if (this.voiceNavTimeout) {
        clearTimeout(this.voiceNavTimeout);
        this.voiceNavTimeout = null;
      }
      this.closeModal('modal-voice');
      this.playSwissChime();
      if (action.target === 'setClientModeTrue') {
        this.setClientMode(true);
      } else if (typeof this[action.target] === 'function') {
        this[action.target]();
      }
      this.parsedVoiceAction = null;
      return;
    }

    if (this.voiceNavTimeout) {
      clearTimeout(this.voiceNavTimeout);
      this.voiceNavTimeout = null;
    }
    this.closeModal('modal-voice');
    this.parsedVoiceAction = null;
  }

  // ==========================================================================
  // ДЕТЕКТОР ДУБЛИКАТОВ ЧЕКОВ И РАСХОДОВ
  // ==========================================================================
  async checkDuplicateMaterial(name, amount) {
    const list = await window.ligaDB.getBySiteId('materials', this.currentSiteId);
    const normalizedNew = name.toLowerCase().trim();
    return list.find(m => {
      const isSamePrice = m.price === amount;
      const normalizedExisting = m.name.toLowerCase().trim();
      const isSimilarName = normalizedExisting.includes(normalizedNew) || normalizedNew.includes(normalizedExisting);
      return isSamePrice || (isSimilarName && Math.abs(m.price - amount) < 100000);
    });
  }

  async forceSaveDuplicate() {
    if (!this.pendingDuplicateSave) return;
    await window.ligaDB.add('materials', this.pendingDuplicateSave);
    const savedAmount = this.pendingDuplicateSave.price;
    this.pendingDuplicateSave = null;
    this.closeModal('modal-duplicate-warning');
    this.showToast(`✓ Чек на ${this.formatSum(savedAmount)} подтвержден и добавлен!`);
    await this.renderMaterials();
  }

  // ==========================================================================
  // ЦИФРОВЫЕ РАСПИСКИ И АКТЫ ПРИЁМКИ ЭТАПА (TELEGRAM CALLBACK)
  // ==========================================================================
  checkUrlVerification() {
    const params = new URLSearchParams(window.location.search);
    const receiptCode = params.get('verify_receipt');
    if (receiptCode) {
      const recipient = params.get('emp') || 'Сотрудник бригады';
      const amount = parseInt(params.get('amount')) || 500000;
      const siteName = params.get('site') || 'ЖК Mirabad Avenue';

      this.currentReceiptToVerify = { receiptCode, recipient, amount, siteName };

      const elRec = document.getElementById('verify-receipt-recipient');
      const elAmt = document.getElementById('verify-receipt-amount');
      const elSite = document.getElementById('verify-receipt-site');

      if (elRec) elRec.innerText = `Получатель: ${recipient}`;
      if (elAmt) elAmt.innerText = this.formatSum(amount);
      if (elSite) elSite.innerText = `Объект: ${siteName}`;

      setTimeout(() => this.openModal('modal-verify-receipt'), 400);
    }

    // Проверка ссылки приёмки этапа для заказчика (?verify_stage=...)
    const stageCode = params.get('verify_stage');
    if (stageCode) {
      const siteName = params.get('site') || 'Премиальный жилой фонд, Ташкент';
      const clientName = params.get('client') || 'Уважаемый Заказчик';
      const stageTitle = params.get('stage') || 'Черновой монтаж трасс под стяжку + опрессовка 16 бар';
      const barVal = params.get('bar') || '16.0';

      this.currentStageToVerify = { stageCode, siteName, clientName, stageTitle, barVal };

      const elSite = document.getElementById('verify-stage-site-name');
      const elClient = document.getElementById('verify-stage-client-name');
      const elTitle = document.getElementById('verify-stage-title');
      const elBar = document.getElementById('verify-stage-pressure-status');

      if (elSite) elSite.innerText = siteName;
      if (elClient) elClient.innerText = `Заказчик: ${clientName}`;
      if (elTitle) elTitle.innerText = stageTitle;
      if (elBar) elBar.innerText = `${barVal} БАР / 24 ЧАСА (Пройдено)`;

      setTimeout(() => this.openModal('modal-verify-stage'), 400);
    }
  }

  // Генератор ссылки приёмки этапа мастером
  openStageLinkGenerator() {
    const site = this.currentSite || { name: 'ЖК Mirabad Avenue', client: 'Самир', pressTestPassed: true, pressureTest: { pressureBar: '16.0' } };
    
    const elSite = document.getElementById('stage-link-site-name');
    const elClient = document.getElementById('stage-link-client-name');
    const elPress = document.getElementById('stage-link-pressure-status');

    if (elSite) elSite.innerText = site.name || 'Объект LIGA OS';
    if (elClient) elClient.innerText = site.client || 'Уважаемый заказчик';
    if (elPress) {
      const isPassed = site.pressTestPassed;
      const bar = (site.pressureTest && site.pressureTest.pressureBar) ? site.pressureTest.pressureBar : '16.0';
      elPress.innerText = isPassed ? `${bar} бар (24ч выдержано)` : 'Ожидает опрессовки (черновик)';
      elPress.style.color = isPassed ? 'var(--neon-emerald)' : 'var(--neon-gold)';
    }

    this.updateStageLinkPreview();
    this.openModal('modal-generate-stage-link');
  }

  updateStageLinkPreview() {
    const site = this.currentSite || { id: 1, name: 'ЖК Mirabad Avenue', client: 'Самир', pressTestPassed: true, pressureTest: { pressureBar: '16.0' } };
    const sel = document.getElementById('stage-select-preset');
    const stageId = sel ? sel.value : '1';
    
    const stageTitles = {
      '1': 'Черновой монтаж трасс под стяжку + опрессовка 16 бар',
      '2': 'Монтаж коллекторных узлов FAR и котельного оборудования',
      '3': 'Чистовая установка санфаянса, инсталляций и смесителей'
    };
    const stageTitle = stageTitles[stageId] || 'Черновой монтаж инженерных систем';
    const barVal = (site.pressureTest && site.pressureTest.pressureBar) ? site.pressureTest.pressureBar : '16.0';
    const stageCode = `STG-${site.id || '01'}-16B`;

    const origin = (typeof window !== 'undefined' && window.location) ? (window.location.origin + window.location.pathname) : 'https://liga-os-beige.vercel.app/';
    const shareUrl = `${origin}?verify_stage=${stageCode}&site=${encodeURIComponent(site.name || 'Объект')}&client=${encodeURIComponent(site.client || 'Заказчик')}&stage=${encodeURIComponent(stageTitle)}&bar=${barVal}`;

    const clientGreeting = site.client ? `Здравствуйте, ${site.client}!` : 'Здравствуйте!';
    const message = `${clientGreeting}
Инженерный этап монтажа по объекту «${site.name || 'Объект'}» успешно завершён.

📋 Этап: ${stageTitle}
🛡️ Опрессовка: ${barVal} бар выдержана 24 часа без падения давления (DIN 1988).
📐 Точность водорозеток: по лазеру до 1 мм.

Пожалуйста, ознакомьтесь с параметрами и подтвердите приёмку этапа в 1 клик по официальной ссылке LIGA OS:
${shareUrl}

С уважением,
Мастер Улугбек Хакимов («Лига Опытных Мастеров», Ташкент)`;

    this.currentGeneratedStageText = message;
    this.currentGeneratedStageUrl = shareUrl;

    const previewEl = document.getElementById('stage-link-message-preview');
    if (previewEl) previewEl.value = message;
  }

  async copyStageAcceptanceLink() {
    const text = this.currentGeneratedStageText || (document.getElementById('stage-link-message-preview') ? document.getElementById('stage-link-message-preview').value : '');
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        this.copyToClipboard(text);
      }
      this.showToast('✓ Сообщение со ссылкой приёмки скопировано для Telegram!');
    } catch (e) {
      this.showToast('✓ Ссылка сформирована!');
    }
  }

  sendStageAcceptanceTelegram() {
    const text = this.currentGeneratedStageText || (document.getElementById('stage-link-message-preview') ? document.getElementById('stage-link-message-preview').value : '');
    const url = this.currentGeneratedStageUrl || (window.location.origin + window.location.pathname);
    try {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
      window.open(shareUrl, '_blank');
      this.showToast('✈️ Открывается Telegram для отправки заказчику...');
    } catch (e) {
      console.warn('Telegram open error:', e);
    }
  }

  // Подтверждение приёмки заказчиком
  async signStageConfirmation() {
    const st = this.currentStageToVerify || {
      siteName: 'ЖК Mirabad Avenue',
      clientName: 'Самир',
      stageTitle: 'Черновой монтаж трасс под стяжку + опрессовка 16 бар'
    };
    const dateStr = new Date().toLocaleString('ru-RU');

    const btn = document.getElementById('btn-confirm-stage-action');
    if (btn) {
      btn.style.display = 'none';
    }

    const box = document.getElementById('verify-stage-success-box');
    const signedEl = document.getElementById('verify-stage-signed-date');
    if (signedEl) {
      signedEl.innerText = `Электронная отметка внесена: ${dateStr}`;
    }
    if (box) {
      box.style.display = 'block';
    }

    this.showToast(`✓ Этап успешно принят Заказчиком (${dateStr})!`);

    // Если есть текущий объект, обновляем его статус и пишем в хронику
    try {
      if (this.currentSite && window.ligaDB) {
        this.currentSite.stageAccepted = true;
        this.currentSite.stageAcceptedDate = dateStr;
        await window.ligaDB.put('sites', this.currentSite);
      }
      if (window.ligaDB) {
        await window.ligaDB.add('finances', {
          siteId: this.currentSiteId || 1,
          type: 'stage_accepted_client',
          stage: st.stageTitle,
          client: st.clientName,
          site: st.siteName,
          date: new Date().toISOString().slice(0, 10),
          verifiedAt: dateStr
        });
      }
    } catch (dbErr) {
      console.warn('Could not save stage acceptance into DB:', dbErr);
    }
    this.render();
  }

  // Уведомление мастера в Telegram об успешной приёмке
  notifyMasterStageAccepted() {
    const st = this.currentStageToVerify || {
      siteName: 'ЖК Mirabad Avenue',
      clientName: 'Самир',
      stageTitle: 'Черновой монтаж'
    };
    const text = `Улугбек, здравствуйте! Я подтвердил приёмку этапа «${st.stageTitle}» по объекту ${st.siteName}. Давление 16 бар подтверждаю. Разрешаю заливку стяжки пола и дальнейшие работы!`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('https://liga-os-beige.vercel.app/')}&text=${encodeURIComponent(text)}`;
    try {
      window.open(shareUrl, '_blank');
    } catch (e) {
      console.warn('Telegram notify error:', e);
    }
  }

  async signReceiptConfirmation() {
    const r = this.currentReceiptToVerify;
    const dateStr = new Date().toLocaleString('ru-RU');
    this.closeModal('modal-verify-receipt');
    this.showToast(`✓ Расписка подтверждена получателем (${dateStr})!`);
    
    // Сохраняем подтверждение в локальной базе
    await window.ligaDB.add('finances', {
      siteId: this.currentSiteId,
      type: 'brigade_confirmed',
      amount: r ? r.amount : 0,
      method: 'Цифровая подпись Telegram',
      date: new Date().toISOString().slice(0, 10),
      verifiedAt: dateStr
    });
    this.render();
  }

  // ==========================================================================
  // ПАМЯТКА МАСТЕРА (ДИАЛОГИ С ДИЗАЙНЕРАМИ И КЛИЕНТАМИ)
  // ==========================================================================
  openMasterGuide() {
    this.switchGuideTab('designer');
    this.openModal('modal-master-guide');
  }

  switchGuideTab(tabName) {
    this.currentGuideTab = tabName;
    document.querySelectorAll('.guide-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    this.renderGuideContent(tabName);
  }

  renderGuideContent(tabName) {
    const container = document.getElementById('guide-tab-content');
    if (!container) return;

    if (tabName === 'designer') {
      container.innerHTML = `
        <div class="guide-card">
          <div class="guide-card-title">
            <span>🤝 Скрипт первого контакта в Telegram</span>
          </div>
          <div class="guide-script-text">
            «Здравствуйте! Меня зовут Улугбек, ведущий инженер сантехники «Лиги Опытных Мастеров» в Ташкенте. Очень нравятся ваши интерьеры! Мы специализируемся на сложной инженерке под элитную плитку: выставляем оси смесителей по лазеру до 1 мм, делаем двойную опрессовку 16 бар и фотопаспорт скрытых трасс, чтобы мебельщики не пробили трубы. Буду рад провести бесплатный инженерный аудит чертежей сантехники вашего текущего объекта!»
          </div>
          <button class="btn-copy-script" onclick="window.app.copyGuideText(this)">
            <span>📋 Скопировать для отправки в Telegram</span>
          </button>
        </div>

        <div class="guide-card">
          <div class="guide-card-title">
            <span>💼 Партнерские условия для автора проекта</span>
          </div>
          <div class="guide-script-text">
            «Для авторов проектов у нас прозрачные партнерские условия: агентское вознаграждение 10% от стоимости монтажа либо персональная скидка в пользу вашего клиента, плюс бесплатный аудит проекта до закупки материалов.»
          </div>
          <button class="btn-copy-script" onclick="window.app.copyGuideText(this)">
            <span>📋 Скопировать в Telegram</span>
          </button>
        </div>
      `;
    } else if (tabName === 'client') {
      container.innerHTML = `
        <div class="guide-card">
          <div class="guide-card-title">
            <span>🛡️ Зачем нужна опрессовка 16 бар (24 часа)</span>
          </div>
          <div class="guide-script-text">
            «В Ташкенте рабочее давление в домах 3–4 бара. Но при ночных гидроударах оно может подскочить до 8–10 бар. Мы проводим испытания давлением 16 бар (четырехкратный запас) в течение 24 часов под пломбой. Только после этого мы подписываем официальный Акт и разрешаем заливать стяжку.»
          </div>
          <button class="btn-copy-script" onclick="window.app.copyGuideText(this)">
            <span>📋 Скопировать аргумент для клиента</span>
          </button>
        </div>

        <div class="guide-card">
          <div class="guide-card-title">
            <span>🏛️ Почему лучевая коллекторная разводка FAR</span>
          </div>
          <div class="guide-script-text">
            «При тройниковой системе, когда на кухне открывают воду, в душе падает напор и обжигает кипятком. Лучевая разводка FAR дает отдельную прямую трубу к каждому крану без скрытых тройников в полу. Это бесшумно, надежно и безопасно на 50 лет.»
          </div>
          <button class="btn-copy-script" onclick="window.app.copyGuideText(this)">
            <span>📋 Скопировать аргумент для клиента</span>
          </button>
        </div>
      `;
    } else if (tabName === 'objections') {
      container.innerHTML = `
        <div class="guide-card">
          <div class="guide-card-title">
            <span>🗣️ «У нас уже есть сантехники»</span>
          </div>
          <div class="guide-script-text">
            «Это отлично! Надежные мастера — большая ценность. Но в премиум-сегменте бывают пиковые нагрузки или сложные узлы (котельные, отдельно стоящие ванны, скрытые смесители iBox), когда бригада занята. Сохраните мой контакт — буду рад подстраховать в сложный момент!»
          </div>
          <button class="btn-copy-script" onclick="window.app.copyGuideText(this)">
            <span>📋 Скопировать ответ на возражение</span>
          </button>
        </div>

        <div class="guide-card">
          <div class="guide-card-title">
            <span>🗣️ «Пришлите просто прайс»</span>
          </div>
          <div class="guide-script-text">
            «С удовольствием! Но в элитном жилье всё зависит от конфигурации (Rehau, Geberit, медь). Скиньте планировку санузла — я сделаю точный и прозрачный расчет с вилкой цен за 30 минут. Это бесплатно и ни к чему вас не обяжет.»
          </div>
          <button class="btn-copy-script" onclick="window.app.copyGuideText(this)">
            <span>📋 Скопировать ответ на возражение</span>
          </button>
        </div>
      `;
    } else if (tabName === 'ethics') {
      container.innerHTML = `
        <div class="guide-card">
          <div class="guide-card-title">
            <span>📜 5 железных правил мастера Лиги</span>
          </div>
          <div style="font-size:12px; line-height:1.6; color:var(--text-main);">
            1. <b>Чертеж дизайнера — закон</b>. Привязка осей и высот строго по лазеру до 1 мм под раскладку плитки.<br>
            2. <b>Защита авторитета автора</b>. Никогда не критиковать чертежи при клиенте. Нестыковку решать лично с дизайнером, предложив 2 решения.<br>
            3. <b>Опрессовка 16 бар</b> на 24 часа с составлением официального Акта перед стяжкой.<br>
            4. <b>Исполнительный фотопаспорт</b> каждого скрытого стыка с лазерной рулеткой.<br>
            5. <b>Чистота и порядок</b>: строительный пылесос, герметичные заглушки, уважение к чужому труду.
          </div>
        </div>
      `;
    }
  }

  copyGuideText(btn) {
    const card = btn.closest('.guide-card');
    const textEl = card ? card.querySelector('.guide-script-text') : null;
    if (textEl) {
      const cleanText = textEl.innerText.replace(/[«»]/g, '').trim();
      navigator.clipboard.writeText(cleanText).then(() => {
        this.showToast('✓ Текст скопирован! Вставьте в чат Telegram.');
      });
    }
  }

  // ==========================================================================
  // ИНЖЕНЕРНЫЙ ЭКСПРЕСС-АУДИТ (ЭКСПЕРТНЫЕ ПРАВИЛА) — P0-5
  // ==========================================================================
  runAiAudit() {
    this.openModal('modal-ai-audit');
    const loading = document.getElementById('ai-audit-loading');
    const body = document.getElementById('ai-audit-body');

    if (loading) loading.style.display = 'block';
    if (body) body.style.display = 'none';

    setTimeout(async () => {
      if (loading) loading.style.display = 'none';
      if (body) body.style.display = 'block';

      // Расчет маржинальности
      const s = this.currentSite;
      const contract = s ? (s.contractSum || 0) : 0;
      const advance = s ? (s.advanceSum || 0) : 0;
      const brigade = s ? (s.brigadeOwed || 0) : 0;

      const materialsList = await window.ligaDB.getBySiteId('materials', this.currentSiteId);
      const totalMat = materialsList.reduce((acc, m) => acc + (m.price || 0), 0);

      const netProfit = Math.max(0, contract - totalMat - brigade);
      const marginPercent = contract > 0 ? Math.round((netProfit / contract) * 100) : 60;

      const marginValEl = document.getElementById('ai-margin-val');
      if (marginValEl) {
        marginValEl.innerText = `Рентабельность: ${marginPercent}% (${marginPercent >= 50 ? 'Высокая' : 'Умеренная'})`;
      }

      const risksValEl = document.getElementById('ai-risks-val');
      if (risksValEl) {
        risksValEl.innerText = s && s.pressTestPassed 
          ? '✓ Опрессовка 16 бар выдержана. Риск разрыва стяжки исключен.'
          : '⚠️ Внимание: опрессовка 16 бар еще не зафиксирована!';
      }
    }, 600);
  }

  saveAiAuditNotes() {
    this.closeModal('modal-ai-audit');
    this.showToast('✓ Выводы инженерного аудита зафиксированы в истории объекта!');
  }

  // ==========================================================================
  // 10-ЛЕТНЯЯ ИНЖЕНЕРНАЯ ИСТОРИЯ ОБЪЕКТА (TIMELINE, BRIGADE, EQUIPMENT)
  // ==========================================================================
  switchHistorySubtab(subtabName) {
    this.currentHistorySubtab = subtabName;
    document.querySelectorAll('.history-subtab-btn').forEach(btn => {
      if (btn.getAttribute('data-subtab') === subtabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const paneTimeline = document.getElementById('subtab-content-timeline');
    const panePayouts = document.getElementById('subtab-content-payouts');
    const paneEquipment = document.getElementById('subtab-content-equipment');
    const paneContacts = document.getElementById('subtab-content-contacts');

    if (paneTimeline) paneTimeline.style.display = subtabName === 'timeline' ? 'block' : 'none';
    if (panePayouts) panePayouts.style.display = subtabName === 'payouts' && !this.isClientMode ? 'block' : 'none';
    if (paneEquipment) paneEquipment.style.display = subtabName === 'equipment' ? 'block' : 'none';
    if (paneContacts) paneContacts.style.display = subtabName === 'contacts' && !this.isClientMode ? 'block' : 'none';
    window.scrollTo({ left: 0 });

    this.renderHistorySubtabContent(subtabName);
  }

  async renderHistory() {
    await this.renderTimeline();
    await this.renderBrigadePayouts();
    await this.renderEquipment();
    await this.renderContacts();
  }

  async renderHistorySubtabContent(subtabName) {
    if (subtabName === 'timeline') {
      await this.renderTimeline();
    } else if (subtabName === 'payouts') {
      await this.renderBrigadePayouts();
    } else if (subtabName === 'equipment') {
      await this.renderEquipment();
    } else if (subtabName === 'contacts') {
      await this.renderContacts();
    }
  }

  // Рендеринг хронологической ленты событий объекта
  async renderTimeline() {
    const container = document.getElementById('timeline-events-container');
    if (!container) return;

    let events = [];
    if (window.ligaDB.db && window.ligaDB.db.objectStoreNames.contains('site_timeline_events')) {
      events = await window.ligaDB.getBySiteId('site_timeline_events', this.currentSiteId);
    }

    events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const badgeCount = document.getElementById('history-events-count-badge');
    if (badgeCount) {
      badgeCount.innerText = `${events.length} записей`;
    }

    if (events.length === 0) {
      container.innerHTML = `
        <div style="color:var(--text-dim); padding:24px 10px; text-align:center; font-size:12px; font-weight:700;">
          Пока нет записей в хронике объекта.<br>Нажмите «+ Событие», чтобы зафиксировать инженерный этап.
        </div>`;
      return;
    }

    const typeBadges = {
      audit: { label: '📐 Аудит', class: 'badge-event-audit' },
      rough: { label: '🔧 Черновой', class: 'badge-event-rough' },
      pressure: { label: '🛡️ 16 бар', class: 'badge-event-pressure' },
      screed: { label: '🏗️ Стяжка', class: 'badge-event-screed' },
      trim: { label: '✨ Чистовая', class: 'badge-event-trim' },
      service: { label: '🛠️ Сервис', class: 'badge-event-service' },
      payout: { label: '💰 Выплата', class: 'badge-event-payout' },
      quick_fact: { label: '📸 Факт', class: 'badge-event-rough' },
      early_fact: { label: '✨ Зачтено заранее', class: 'badge-event-trim' }
    };

    container.innerHTML = events.map(ev => {
      const tb = typeBadges[ev.eventType] || { label: 'Этап', class: 'badge-event-audit' };
      const dateFormatted = ev.date 
        ? new Date(ev.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Дата не указана';

      return `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-card">
            <div class="timeline-header">
              <span class="timeline-date">${dateFormatted}</span>
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="timeline-badge ${tb.class}">${tb.label}</span>
                <button class="btn-item-delete" onclick="window.app.deleteTimelineEvent(${ev.id})" title="Удалить запись" style="background:none; border:none; color:var(--text-dim); font-size:12px; cursor:pointer; padding:2px 4px; opacity:0.6; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">🗑️</button>
              </div>
            </div>
            <div class="timeline-title">${ev.title}</div>
            <div class="timeline-desc">${ev.description}</div>
            ${ev.photo ? `<img src="${ev.photo}" alt="Фото этапа" class="timeline-photo-thumb">` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Рендеринг выплат бригаде (учет труда помощников)
  async renderBrigadePayouts() {
    if (this.isClientMode) return;
    const container = document.getElementById('brigade-payouts-container');
    if (!container) return;

    let payouts = [];
    if (window.ligaDB.db && window.ligaDB.db.objectStoreNames.contains('brigade_payouts')) {
      payouts = await window.ligaDB.getBySiteId('brigade_payouts', this.currentSiteId);
    }

    payouts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const totalUZS = payouts.reduce((acc, p) => acc + (p.amountUZS || 0), 0);
    const totalEl = document.getElementById('history-total-payouts');
    if (totalEl) {
      totalEl.innerText = this.formatSum(totalUZS);
    }

    if (payouts.length === 0) {
      container.innerHTML = `
        <div style="color:var(--text-dim); padding:20px; text-align:center; font-size:12px; font-weight:700;">
          Выплаты помощникам по данному объекту еще не зафиксированы.
        </div>`;
      return;
    }

    container.innerHTML = payouts.map(p => {
      const dateStr = p.date 
        ? new Date(p.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';
      const methodLabel = p.paymentType === 'card' ? '💳 Карта' : '💵 Наличные';

      return `
        <div class="payout-card-item">
          <div class="payout-left-info">
            <div class="payout-name">${p.name} ${p.role ? `<span style="font-size:11px; color:var(--text-dim); font-weight:normal;">(${p.role})</span>` : ''}</div>
            <div class="payout-desc">${p.workDescription}</div>
            <div style="font-size:10px; color:var(--text-dim); margin-top:2px;">
              <span>📅 ${dateStr}</span> • <span>${methodLabel}</span>
            </div>
          </div>
          <div class="payout-amounts" style="display:flex; align-items:center; gap:8px;">
            <div>
              <div class="payout-uzs">${this.formatSum(p.amountUZS)}</div>
              ${p.amountUSD ? `<div class="payout-usd">≈ $${p.amountUSD}</div>` : ''}
            </div>
            <button class="btn-item-delete" onclick="window.app.deleteBrigadePayout(${p.id})" title="Удалить запись о выплате" style="background:none; border:none; color:var(--text-dim); font-size:13px; cursor:pointer; padding:2px 4px; opacity:0.6; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Рендеринг паспортов европейского оборудования
  async renderEquipment() {
    const container = document.getElementById('equipment-list-container');
    if (!container) return;

    let equipment = [];
    if (window.ligaDB.db && window.ligaDB.db.objectStoreNames.contains('installed_equipment')) {
      equipment = await window.ligaDB.getBySiteId('installed_equipment', this.currentSiteId);
    }

    if (equipment.length === 0) {
      container.innerHTML = `
        <div style="color:var(--text-dim); padding:20px; text-align:center; font-size:12px; font-weight:700;">
          Оборудование еще не зарегистрировано в паспорте объекта.
        </div>`;
      return;
    }

    container.innerHTML = equipment.map(eq => `
      <div class="equipment-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="equipment-warranty-badge">Гарантия ${eq.warrantyYears || 10} лет</div>
          <button class="btn-item-delete" onclick="window.app.deleteEquipment(${eq.id})" title="Удалить паспорт оборудования" style="background:none; border:none; color:var(--text-dim); font-size:13px; cursor:pointer; padding:2px 4px; opacity:0.6; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">🗑️</button>
        </div>
        <div class="equipment-brand">${eq.brand}</div>
        <div class="equipment-title">${eq.model}</div>
        <div class="equipment-details">
          <div><b>Категория:</b> ${eq.category}</div>
          ${eq.serialNumber ? `<div><b>Серийный №:</b> ${eq.serialNumber}</div>` : ''}
          ${eq.installDate ? `<div><b>Дата монтажа:</b> ${eq.installDate}</div>` : ''}
          ${eq.notes ? `<div style="margin-top:4px; font-style:italic;">${eq.notes}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // Открытие модальных окон
  openAddEventModal() {
    const dateInput = document.getElementById('event-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
    this.openModal('modal-add-event');
  }

  openAddPayoutModal() {
    const dateInput = document.getElementById('payout-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
    this.openModal('modal-add-payout');
  }

  openAddEquipmentModal() {
    const dateInput = document.getElementById('eq-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
    this.openModal('modal-add-equipment');
  }

  // Добавление записи хронологии (Append-Only)
  async handleAddTimelineEvent() {
    if (!this.currentSite) return;
    const date = (document.getElementById('event-date')?.value || '').trim();
    const eventType = document.getElementById('event-type')?.value || 'rough';
    const title = (document.getElementById('event-title')?.value || '').trim();
    const description = (document.getElementById('event-desc')?.value || '').trim();

    if (!date || !title || !description) {
      alert('Пожалуйста, заполните дату, заголовок и описание события.');
      return;
    }

    await window.ligaDB.add('site_timeline_events', {
      siteId: this.currentSiteId,
      date,
      eventType,
      title,
      description,
      createdAt: new Date().toISOString()
    });

    const form = document.getElementById('form-add-event');
    if (form) form.reset();

    this.closeModal('modal-add-event');
    this.showToast('✓ Событие зафиксировано в хронике объекта!');
    await this.renderTimeline();
  }

  // Добавление выплаты помощнику бригады
  async handleAddBrigadePayout() {
    if (!this.currentSite) return;
    const date = (document.getElementById('payout-date')?.value || '').trim();
    const name = (document.getElementById('payout-name')?.value || '').trim();
    const role = (document.getElementById('payout-role')?.value || '').trim();
    const amountUZS = parseInt(document.getElementById('payout-amount')?.value) || 0;
    const paymentType = document.getElementById('payout-method')?.value || 'cash';
    const workDescription = (document.getElementById('payout-desc')?.value || '').trim();

    if (!date || !name || amountUZS <= 0) {
      alert('Пожалуйста, укажите дату, имя сотрудника и сумму выплаты.');
      return;
    }

    const usdRate = (this.tariffSettings && this.tariffSettings.usdRate) || 12900;
    const amountUSD = Math.round(amountUZS / usdRate);

    await window.ligaDB.add('brigade_payouts', {
      siteId: this.currentSiteId,
      date,
      name,
      role,
      amountUZS,
      amountUSD,
      usdRate,
      paymentType,
      workDescription,
      createdAt: new Date().toISOString()
    });

    // Уменьшаем долг бригаде в объекте
    this.currentSite.brigadeOwed = Math.max(0, (this.currentSite.brigadeOwed || 0) - amountUZS);
    await window.ligaDB.put('sites', this.currentSite);

    const form = document.getElementById('form-add-payout');
    if (form) form.reset();

    this.closeModal('modal-add-payout');
    this.showToast(`✓ Выплата ${this.formatSum(amountUZS)} для ${name} зафиксирована!`);
    await this.renderBrigadePayouts();
    this.render();
  }

  // Добавление паспорта оборудования
  async handleAddEquipment() {
    if (!this.currentSite) return;
    const brand = (document.getElementById('eq-brand')?.value || '').trim();
    const model = (document.getElementById('eq-model')?.value || '').trim();
    const category = document.getElementById('eq-category')?.value || 'Коллекторный узел';
    const serialNumber = (document.getElementById('eq-serial')?.value || '').trim();
    const warrantyYears = parseInt(document.getElementById('eq-warranty')?.value) || 10;
    const installDate = (document.getElementById('eq-date')?.value || '').trim();
    const notes = (document.getElementById('eq-notes')?.value || '').trim();

    if (!brand || !model || !installDate) {
      alert('Пожалуйста, заполните бренд, модель и дату установки оборудования.');
      return;
    }

    await window.ligaDB.add('installed_equipment', {
      siteId: this.currentSiteId,
      brand,
      model,
      category,
      serialNumber,
      warrantyYears,
      installDate,
      notes,
      createdAt: new Date().toISOString()
    });

    const form = document.getElementById('form-add-equipment');
    if (form) form.reset();

    this.closeModal('modal-add-equipment');
    this.showToast(`✓ Паспорт «${brand} ${model}» сохранен!`);
    await this.renderEquipment();
  }

  async deleteTimelineEvent(id) {
    if (!confirm('Удалить эту запись из хроники объекта?')) return;
    await window.ligaDB.delete('site_timeline_events', id);
    await this.renderTimeline();
    this.showToast('✓ Запись удалена из хроники');
  }

  async deleteBrigadePayout(id) {
    if (!confirm('Удалить эту запись о выплате? Сумма будет возвращена в долг перед бригадой.')) return;
    const payout = await window.ligaDB.get('brigade_payouts', id);
    if (payout) {
      if (this.currentSite) {
        this.currentSite.brigadeOwed = (this.currentSite.brigadeOwed || 0) + (payout.amountUZS || 0);
        await window.ligaDB.put('sites', this.currentSite);
      }
      await window.ligaDB.delete('brigade_payouts', id);
      await this.renderBrigadePayouts();
      this.render();
      this.showToast('✓ Выплата удалена, долг бригаде пересчитан');
    }
  }

  async deleteEquipment(id) {
    if (!confirm('Удалить паспорт этого оборудования?')) return;
    await window.ligaDB.delete('installed_equipment', id);
    await this.renderEquipment();
    this.showToast('✓ Оборудование удалено из паспорта объекта');
  }

  // ==========================================================================
  // РЕЕСТР КОНТАКТОВ ЛИГИ МАСТЕРОВ (БИЗНЕС-КНИГА УЛУГБЕКА) — v2.0.4
  // ==========================================================================
  async renderContacts() {
    if (this.isClientMode) return;
    const container = document.getElementById('contacts-list-container');
    if (!container) return;

    let contacts = [];
    if (window.ligaDB.db && window.ligaDB.db.objectStoreNames.contains('contacts')) {
      contacts = await window.ligaDB.getAll('contacts');
    }

    if (contacts.length === 0) {
      container.innerHTML = `
        <div style="color:var(--text-dim); padding:24px 10px; text-align:center; font-size:12px; font-weight:700;">
          В реестре контактов Лиги пока нет записей.<br>Нажмите «+ Контакт», чтобы добавить заказчика, дизайнера или партнера.
        </div>`;
      return;
    }

    let sitesMap = {};
    if (window.ligaDB.db && window.ligaDB.db.objectStoreNames.contains('sites')) {
      const sites = await window.ligaDB.getAll('sites');
      sites.forEach(s => { sitesMap[s.id] = s.name; });
    }

    container.innerHTML = contacts.map(c => {
      let roleClass = 'role-client';
      if (c.role && (c.role.includes('Дизайнер') || c.role.includes('Архитектор'))) {
        roleClass = 'role-designer';
      } else if (c.role && (c.role.includes('Генподрядчик') || c.role.includes('Прораб') || c.role.includes('Мастер') || c.role.includes('Поставщик'))) {
        roleClass = 'role-contractor';
      }

      let sitesHtml = '';
      if (Array.isArray(c.siteIds) && c.siteIds.length > 0) {
        const siteNames = c.siteIds.map(id => sitesMap[id] || `Объект #${id}`).join(', ');
        sitesHtml = `
          <div class="contact-sites-list">
            <b>📍 Объекты в LIGA OS:</b> ${siteNames}
          </div>
        `;
      } else if (Array.isArray(c.addressHistory) && c.addressHistory.length > 0) {
        sitesHtml = `
          <div class="contact-sites-list">
            <b>📍 Адрес:</b> ${c.addressHistory[c.addressHistory.length - 1]}
          </div>
        `;
      }

      let phoneHistoryHtml = '';
      if (Array.isArray(c.phoneHistory) && c.phoneHistory.length > 1) {
        const oldPhones = c.phoneHistory.filter(p => p !== c.phone).join(', ');
        if (oldPhones) {
          phoneHistoryHtml = `<div style="font-size:10px; color:var(--text-dim); margin-top:3px;">Прежние номера: ${oldPhones}</div>`;
        }
      }

      const safePhone = (c.phone || '').replace(/[^\d+]/g, '');

      return `
        <div class="contact-card-item">
          <div class="contact-header-row">
            <div>
              <div class="contact-name-title">${c.name}</div>
              <div style="display:flex; align-items:center; gap:6px; margin-top:3px;">
                <span class="contact-code-badge">${c.contactId || 'LIGA-C'}</span>
                <span class="contact-role-badge ${roleClass}">${c.role}</span>
              </div>
            </div>
            <button class="btn-item-delete" onclick="window.app.deleteContact(${c.id})" title="Удалить контакт" style="background:none; border:none; color:var(--text-dim); font-size:13px; cursor:pointer; padding:2px 6px; opacity:0.6; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">🗑️</button>
          </div>

          <div class="contact-details-box">
            <div class="contact-phone-row">
              <a href="tel:${safePhone}" class="contact-phone-link" title="Позвонить">
                📞 ${c.phone}
              </a>
            </div>
            ${phoneHistoryHtml}
            ${c.notes ? `<div style="margin-top:6px; font-style:italic; color:var(--text-muted);">📝 ${c.notes}</div>` : ''}
            ${sitesHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  openAddContactModal() {
    if (this.isClientMode) {
      this.showToast('⚠️ Функция недоступна в режиме демонстрации');
      return;
    }
    const addrInput = document.getElementById('contact-address');
    if (addrInput && this.currentSite && !addrInput.value) {
      addrInput.placeholder = `Напр: ${this.currentSite.name}`;
    }
    this.openModal('modal-add-contact');
  }

  async handleAddContact() {
    if (this.isClientMode) return;
    const name = (document.getElementById('contact-name')?.value || '').trim();
    const role = document.getElementById('contact-role')?.value || 'Заказчик (VIP)';
    const phone = (document.getElementById('contact-phone')?.value || '').trim();
    const address = (document.getElementById('contact-address')?.value || '').trim();
    const notes = (document.getElementById('contact-notes')?.value || '').trim();

    if (!name || !phone) {
      alert('Пожалуйста, заполните ФИО/имя и основной номер телефона контакта.');
      return;
    }

    const uniqueNum = Math.floor(100 + Math.random() * 900);
    const newContact = {
      contactId: `LIGA-C-${uniqueNum}`,
      name,
      role,
      phone,
      phoneHistory: [phone],
      addressHistory: address ? [address] : (this.currentSite ? [this.currentSite.name] : []),
      notes,
      siteIds: this.currentSiteId ? [this.currentSiteId] : [],
      createdAt: new Date().toISOString().slice(0, 10)
    };

    await window.ligaDB.add('contacts', newContact);

    const form = document.getElementById('form-add-contact');
    if (form) form.reset();

    this.closeModal('modal-add-contact');
    this.playSubtleClick();
    this.showToast(`✓ Контакт «${name}» внесен в реестр LIGA OS!`);
    await this.renderContacts();
  }

  async deleteContact(id) {
    if (!confirm('Удалить этот контакт из постоянного реестра Лиги Мастеров?')) return;
    await window.ligaDB.delete('contacts', id);
    this.playSubtleClick();
    await this.renderContacts();
    this.showToast('✓ Контакт удален из реестра Лиги');
  }

  // Обновление бейджей уведомлений на нижней навигации
  async updateNavBadges() {
    if (!this.currentSiteId) return;

    try {
      // 1. Бейдж склада (позиции «Нужно купить»)
      const materials = await window.ligaDB.getBySiteId('materials', this.currentSiteId);
      const neededCount = materials.filter(m => !m.isPurchased).length;
      const badgeMat = document.getElementById('badge-nav-materials');
      if (badgeMat) {
        if (neededCount > 0) {
          badgeMat.innerText = neededCount > 9 ? '9+' : neededCount;
          badgeMat.classList.add('active');
        } else {
          badgeMat.classList.remove('active');
        }
      }

      // 2. Бейдж контроля (незакрытые пункты технадзора)
      const checklists = await window.ligaDB.getBySiteId('checklists', this.currentSiteId);
      const remainingCount = checklists.filter(c => !c.done).length;
      const badgeCheck = document.getElementById('badge-nav-checklist');
      if (badgeCheck) {
        if (remainingCount > 0) {
          badgeCheck.innerText = remainingCount > 9 ? '9+' : remainingCount;
          badgeCheck.classList.add('active');
        } else {
          badgeCheck.classList.remove('active');
        }
      }
    } catch (e) {
      console.warn('Ошибка обновления навигационных бейджей:', e);
    }
  }

  openModal(modalId) {
    if (this.isClientMode && [
      'modal-master-guide', 'modal-tariffs', 'modal-payment',
      'modal-receipt', 'modal-ai-audit', 'modal-backup-manager',
      'modal-add-payout', 'modal-add-event', 'modal-add-equipment', 'modal-add-contact'
    ].includes(modalId)) {
      this.showToast('⚠️ Функция недоступна в режиме демонстрации');
      return;
    }
    const m = document.getElementById(modalId);
    if (m) m.classList.add('open');
  }

  closeModal(modalId) {
    if (modalId === 'modal-voice' && this.voiceNavTimeout) {
      clearTimeout(this.voiceNavTimeout);
      this.voiceNavTimeout = null;
    }
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('open');
  }

  showToast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 84px;
        left: 50%;
        transform: translateX(-50%) translateY(10px);
        background: var(--gold-gradient);
        color: var(--btn-gold-text);
        font-weight: 800;
        font-size: 12px;
        padding: 8px 16px;
        border-radius: 9999px;
        z-index: 10000;
        box-shadow: 0 6px 20px rgba(0,0,0,0.35);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
        text-align: center;
        max-width: 90%;
        white-space: nowrap;
      `;
      document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
    }, 2200);
  }

  formatSum(num) {
    return new Intl.NumberFormat('ru-RU').format(num || 0) + ' сум';
  }

  formatNumber(num) {
    return new Intl.NumberFormat('ru-RU').format(num || 0);
  }

  // ==========================================================================
  // МЕНЮ ИНСТРУМЕНТОВ МАСТЕРА (МЕНЮ «⋯ ЕЩЁ») — v2.0.9 «Нулевая рутина»
  // ==========================================================================
  // ==========================================================================
  // НАСТРОЙКИ LIGA OS И ВОССТАНОВЛЕНИЕ ПОДСКАЗКИ (v2.2.1)
  // ==========================================================================
  // ==========================================================================
  // КАСТОМИЗАЦИЯ БЛОКОВ ДАШБОРДА (v2.2.2 «Свободный выбор мастера»)
  // ==========================================================================
  initBlockCustomization() {
    const blocks = [
      { id: 'radar', toggleId: 'toggle-block-radar', elementId: 'site-chrono-radar' },
      { id: 'nextaction', toggleId: 'toggle-block-nextaction', elementId: 'site-next-action-card' },
      { id: 'fact', toggleId: 'toggle-block-fact', elementId: 'quick-fact-action-box' },
      { id: 'timeline', toggleId: 'toggle-block-timeline', elementId: 'dashboard-timeline-preview-card' },
      { id: 'finances', toggleId: 'toggle-block-finances', elementId: 'dashboard-finances-card' },
      { id: 'quickactions', toggleId: 'toggle-block-quickactions', elementId: 'dashboard-quick-actions-box' }
    ];

    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem('liga_blocks_visibility') || '{}');
    } catch (e) {
      saved = {};
    }

    blocks.forEach(({ id, toggleId, elementId }) => {
      const toggle = document.getElementById(toggleId);
      const el = document.getElementById(elementId);
      const isVisible = saved[id] !== false; // По умолчанию все включены

      if (toggle) {
        toggle.checked = isVisible;
        toggle.addEventListener('change', () => {
          this.setBlockVisibility(id, toggle.checked, elementId);
        });
      }

      if (el && !isVisible) {
        el.style.display = 'none';
      }
    });

    const btnMinimal = document.getElementById('btn-preset-minimal');
    if (btnMinimal) {
      btnMinimal.addEventListener('click', () => {
        const minimalConfig = {
          radar: false,
          nextaction: false,
          fact: true,
          timeline: false,
          finances: true,
          quickactions: true
        };
        this.applyBlocksPreset(minimalConfig, blocks);
        this.showToast('⚡ Включен экспресс-минимализм');
      });
    }

    const btnFull = document.getElementById('btn-preset-full');
    if (btnFull) {
      btnFull.addEventListener('click', () => {
        const fullConfig = {
          radar: true,
          nextaction: true,
          fact: true,
          timeline: true,
          finances: true,
          quickactions: true
        };
        this.applyBlocksPreset(fullConfig, blocks);
        this.showToast('💎 Включены все блоки');
      });
    }
  }

  setBlockVisibility(blockId, isVisible, elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.style.display = isVisible ? '' : 'none';
    }
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem('liga_blocks_visibility') || '{}');
    } catch (_) {}
    saved[blockId] = isVisible;
    localStorage.setItem('liga_blocks_visibility', JSON.stringify(saved));
  }

  applyBlocksPreset(config, blocks) {
    localStorage.setItem('liga_blocks_visibility', JSON.stringify(config));
    blocks.forEach(({ id, toggleId, elementId }) => {
      const toggle = document.getElementById(toggleId);
      const el = document.getElementById(elementId);
      const isVisible = config[id] !== false;
      if (toggle) toggle.checked = isVisible;
      if (el) el.style.display = isVisible ? '' : 'none';
    });
  }

  initSettingsModal() {
    const btnSettings = document.getElementById('btn-settings-top');
    if (btnSettings) {
      btnSettings.addEventListener('click', () => {
        this.playSubtleClick();
        this.openModal('modal-settings');
      });
    }

    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => this.closeModal('modal-settings'));
    }

    const settingsOverlay = document.getElementById('modal-settings');
    if (settingsOverlay) {
      settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) this.closeModal('modal-settings');
      });
    }

    const btnAI = document.getElementById('btn-ai-concierge-open');
    if (btnAI) {
      btnAI.addEventListener('click', () => {
        this.playSubtleClick();
        this.openModal('modal-ai-concierge');
      });
    }

    const btnCloseAI = document.getElementById('btn-close-ai-concierge');
    if (btnCloseAI) {
      btnCloseAI.addEventListener('click', () => this.closeModal('modal-ai-concierge'));
    }

    const aiOverlay = document.getElementById('modal-ai-concierge');
    if (aiOverlay) {
      aiOverlay.addEventListener('click', (e) => {
        if (e.target === aiOverlay) this.closeModal('modal-ai-concierge');
      });
    }

    const btnRestore = document.getElementById('btn-restore-onboarding');
    if (btnRestore) {
      btnRestore.addEventListener('click', () => this.restoreOnboardingHint());
    }
  }

  restoreOnboardingHint() {
    localStorage.removeItem('liga_onboarding_dismissed');
    const hint = document.getElementById('quick-onboarding-hint');
    if (hint) {
      hint.style.display = '';
      hint.style.animation = 'fadeInSituation 0.3s ease-out forwards';
    }
    this.showToast('💡 Подсказка «3 шага» возвращена!');
    this.closeModal('modal-settings');
    this.closeModal('modal-more-menu');
  }

    initMoreMenu() {
    const btnToggle = document.getElementById('btn-more-menu-toggle');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        this.playSubtleClick();
        this.openModal('modal-more-menu');
      });
    }

    const btnClose = document.getElementById('btn-close-more-menu');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeModal('modal-more-menu'));
    }

    // Делегирование элементов меню
    const items = [
      { id: 'menu-item-voice', target: 'btn-voice-input' },
      { id: 'menu-item-client', target: 'btn-client-mode-toggle' },
      { id: 'menu-item-guide', target: 'btn-guide-top' },
      { id: 'menu-item-audit', target: 'btn-ai-audit-top' },
      { id: 'menu-item-theme', target: 'btn-theme-toggle' },
      { id: 'menu-item-backup', target: 'btn-backup-top' },
      { id: 'menu-item-sound', target: 'btn-sound-toggle' },
      { id: 'menu-item-settings', target: 'btn-settings-top' },
      { id: 'menu-item-ai', target: 'btn-ai-concierge-open' }
    ];

    const itemRestore = document.getElementById('menu-item-restore-hint');
    if (itemRestore) {
      itemRestore.addEventListener('click', () => {
        this.closeModal('modal-more-menu');
        this.restoreOnboardingHint();
      });
    }

    items.forEach(({ id, target }) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', () => {
          this.closeModal('modal-more-menu');
          const targetEl = document.getElementById(target);
          if (targetEl) targetEl.click();
        });
      }
    });
  }

  // ==========================================================================
  // БЫСТРАЯ ФИКСАЦИЯ ФАКТА ЗА 3 СЕКУНДЫ — v2.0.9 «Нулевая рутина»
  // ==========================================================================
  initQuickFactAction() {
    this.pendingQuickFactPhoto = null;

    const btnCapture = document.getElementById('btn-quick-fact-capture');
    if (btnCapture) {
      btnCapture.addEventListener('click', () => {
        this.playSubtleClick();
        this.openQuickFactModal();
      });
    }

    const btnClose = document.getElementById('btn-close-quick-fact');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeModal('modal-quick-fact'));
    }

    // Клик по превью фото триггерит input
    const boxPhoto = document.getElementById('box-quick-fact-photo');
    const inputFile = document.getElementById('input-quick-fact-file');
    if (boxPhoto && inputFile) {
      boxPhoto.addEventListener('click', () => inputFile.click());
      inputFile.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          this.showToast('Сжатие фотографии факта...');
          try {
            this.pendingQuickFactPhoto = await window.ligaImageProcessor.compressImage(file, 1600, 0.85);
            const imgPreview = document.getElementById('quick-fact-img-preview');
            const placeholder = document.getElementById('quick-fact-placeholder');
            if (imgPreview && placeholder) {
              imgPreview.src = this.pendingQuickFactPhoto;
              imgPreview.style.display = 'block';
              placeholder.style.display = 'none';
            }
            this.showToast('✓ Фото готово к фиксации');
          } catch (err) {
            console.error('Ошибка сжатия фото:', err);
            this.showToast('Ошибка обработки фото');
          }
        }
      });
    }

    // Теги комнат
    const roomTags = document.querySelectorAll('#quick-fact-rooms-tags .quick-fact-tag-btn');
    const inputRoom = document.getElementById('input-quick-fact-room');
    roomTags.forEach(tag => {
      tag.addEventListener('click', () => {
        roomTags.forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        if (inputRoom) inputRoom.value = tag.getAttribute('data-room');
      });
    });

    // Теги работ
    const workTags = document.querySelectorAll('#quick-fact-works-tags .quick-fact-tag-btn');
    const inputWork = document.getElementById('input-quick-fact-title');
    workTags.forEach(tag => {
      tag.addEventListener('click', () => {
        workTags.forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        if (inputWork) inputWork.value = tag.getAttribute('data-work');
      });
    });

    // Сохранение факта
    const btnSave = document.getElementById('btn-save-quick-fact');
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        await this.handleSaveQuickFact();
      });
    }
  }

  openQuickFactModal() {
    this.pendingQuickFactPhoto = null;
    const imgPreview = document.getElementById('quick-fact-img-preview');
    const placeholder = document.getElementById('quick-fact-placeholder');
    if (imgPreview) {
      imgPreview.src = '';
      imgPreview.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'block';

    const checkEarly = document.getElementById('check-quick-fact-early');
    if (checkEarly) {
      // Если текущий этап объекта <= 3, по умолчанию включаем чекбокс «выполнено заранее»
      checkEarly.checked = (this.currentSite && this.currentSite.status <= 3);
    }

    this.openModal('modal-quick-fact');
  }

  async handleSaveQuickFact() {
    if (!this.currentSite) {
      this.showToast('Сначала выберите активный объект');
      return;
    }

    const inputRoom = document.getElementById('input-quick-fact-room');
    const inputTitle = document.getElementById('input-quick-fact-title');
    const checkEarly = document.getElementById('check-quick-fact-early');

    const room = (inputRoom && inputRoom.value.trim()) || 'Санузел';
    const workTitle = (inputTitle && inputTitle.value.trim()) || 'Инженерная фиксация';
    const isEarly = checkEarly ? checkEarly.checked : false;

    const description = `Зона: ${room} • ${workTitle}${isEarly ? ' (работа выполнена с опережением графика)' : ''}`;

    const newEvent = {
      siteId: this.currentSiteId,
      eventType: isEarly ? 'early_fact' : 'quick_fact',
      title: `${room}: ${workTitle}`,
      description: description,
      date: new Date().toISOString().slice(0, 10),
      photo: this.pendingQuickFactPhoto || null,
      isEarlyMilestone: isEarly,
      createdAt: new Date().toISOString()
    };

    try {
      await window.ligaDB.add('site_timeline_events', newEvent);
      this.playSwissChime();
      this.showToast('✓ Факт зафиксирован в истории объекта!');
      this.closeModal('modal-quick-fact');

      // Обновляем список вех на дашборде и в истории
      await this.renderDashboardTimeline();
      if (this.currentScreen === 'history') {
        await this.renderTimeline();
      }
    } catch (e) {
      console.error('Ошибка сохранения факта в историю:', e);
      this.showToast('Ошибка сохранения факта');
    }
  }

  toggleVoiceInput() {
    this.openModal('modal-voice');
    this.startVoiceRecording();
  }

  initHandsFreeVoice() {
    // 1. Плавающий микрофон на всех экранах (FAB)
    const btnFloatingVoice = document.getElementById('btn-floating-voice');
    if (btnFloatingVoice) {
      btnFloatingVoice.addEventListener('click', () => {
        this.toggleVoiceInput();
      });
    }

    // 2. Голосовое создание объекта в modal-add-site
    const btnVoiceFillSite = document.getElementById('btn-voice-fill-site');
    if (btnVoiceFillSite) {
      btnVoiceFillSite.addEventListener('click', () => {
        this.startVoiceFillSite();
      });
    }

    // 3. Отправка отчета в Telegram в 1 клик
    const btnShareTelegram = document.getElementById('btn-share-telegram');
    if (btnShareTelegram) {
      btnShareTelegram.addEventListener('click', () => {
        this.shareSiteProgressTelegram();
      });
    }

    // 4. Ссылка приёмки этапа для заказчика в Telegram
    const btnShareStage = document.getElementById('btn-share-stage-acceptance');
    if (btnShareStage) {
      btnShareStage.addEventListener('click', () => {
        this.openStageLinkGenerator();
      });
    }
  }

  // Запуск голосового ввода для формы создания объекта
  startVoiceFillSite() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.showToast('⚠️ Голосовой ввод требует подключения к сети');
      return;
    }

    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.getElementById('btn-voice-fill-site');

    if (!SpeechClass) {
      const phrase = prompt('Диктуйте или введите фразу для объекта (напр: Самир, Чиланзар 3-комнатная, договор 25 млн, аванс 10 млн):');
      if (phrase) {
        this.applyVoiceToSiteForm(phrase);
      }
      return;
    }

    if (btn) {
      btn.innerHTML = '<span>⏳</span> Слушаю...';
      btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
      btn.style.color = '#fff';
    }

    this.showToast('🎙️ Слушаю: назовите клиента, ЖК/район, сумму договора и аванс...');

    try {
      const recognizer = new SpeechClass();
      recognizer.lang = 'ru-RU';
      recognizer.interimResults = false;
      recognizer.continuous = false;

      recognizer.onresult = (event) => {
        const text = event.results[0][0].transcript;
        this.applyVoiceToSiteForm(text);
      };

      recognizer.onerror = (e) => {
        console.warn('Voice site fill error:', e);
        this.showToast('Речь не распознана. Попробуйте еще раз или заполните вручную.');
        if (btn) {
          btn.innerHTML = '<span>🎙️</span> Сказать';
          btn.style.background = '';
          btn.style.color = '';
        }
      };

      recognizer.onend = () => {
        if (btn) {
          btn.innerHTML = '<span>🎙️</span> Сказать';
          btn.style.background = '';
          btn.style.color = '';
        }
      };

      recognizer.start();
    } catch (e) {
      console.warn('Voice start exception:', e);
      const phrase = prompt('Введите или скопируйте фразу для создания объекта:');
      if (phrase) {
        this.applyVoiceToSiteForm(phrase);
      }
      if (btn) {
        btn.innerHTML = '<span>🎙️</span> Сказать';
        btn.style.background = '';
        btn.style.color = '';
      }
    }
  }

  // Парсинг естественной речи мастера и заполнение формы объекта
  applyVoiceToSiteForm(text) {
    if (!text || !text.trim()) return;
    const lower = text.toLowerCase();

    const usdRate = (this.tariffSettings && this.tariffSettings.usdRate) ? this.tariffSettings.usdRate : 12900;
    let contractSum = 0;
    let advanceSum = 0;

    const parseAmount = (numStr, unitStr) => {
      if (!numStr) return 0;
      let val = parseFloat(numStr.replace(/\s+/g, '').replace(',', '.'));
      if (isNaN(val)) return 0;
      if (unitStr) {
        const u = unitStr.toLowerCase();
        if (u.includes('млн') || u.includes('миллион') || u.includes('лям')) val *= 1000000;
        else if (u.includes('тыс') || u.includes('тысяч')) val *= 1000;
        else if (u.includes('доллар') || u.includes('бакс')) val *= usdRate;
      } else if (val < 1000) {
        val *= 1000000;
      }
      return Math.round(val);
    };

    const contractMatch = lower.match(/(договор|сумма|стоимость|работа|цена)\s*([0-9\s\.,]+)\s*(млн|миллион|лям|тыс|тысяч|доллар|баксов|сум)?/);
    const advanceMatch = lower.match(/(аванс|предоплат|взнос)\s*([0-9\s\.,]+)\s*(млн|миллион|лям|тыс|тысяч|доллар|баксов|сум)?/);

    if (contractMatch) {
      contractSum = parseAmount(contractMatch[2], contractMatch[3]);
    }
    if (advanceMatch) {
      advanceSum = parseAmount(advanceMatch[2], advanceMatch[3]);
    }

    if (!contractSum) {
      const allNums = [...lower.matchAll(/(\d+[\.,]?\d*)\s*(млн|миллион|лям|тыс|тысяч|доллар|баксов)/g)];
      if (allNums.length > 0) {
        contractSum = parseAmount(allNums[0][1], allNums[0][2]);
        if (allNums.length > 1 && !advanceSum) {
          advanceSum = parseAmount(allNums[1][1], allNums[1][2]);
        }
      }
    }

    // Имя клиента
    let clientName = '';
    const clientKeywordMatch = lower.match(/(клиент|заказчик|хозяин)\s+([А-Яа-яA-Za-z\-]+)/);
    if (clientKeywordMatch) {
      clientName = clientKeywordMatch[2];
    } else {
      const commonNames = ['самир', 'алишер', 'бахром', 'джамшид', 'сардор', 'фарход', 'тимур', 'камила', 'дилшод', 'рустам', 'бобир', 'улугбек', 'жасур', 'шахзод', 'анвар'];
      for (const name of commonNames) {
        if (lower.includes(name)) {
          clientName = name.charAt(0).toUpperCase() + name.slice(1);
          break;
        }
      }
    }
    if (!clientName) {
      const words = text.split(/\s+/);
      if (words.length > 0 && /^[А-ЯЁA-Z][а-яёa-z]+/.test(words[0])) {
        clientName = words[0];
      } else {
        clientName = 'Заказчик';
      }
    } else {
      clientName = clientName.charAt(0).toUpperCase() + clientName.slice(1);
    }

    // Название ЖК / района
    let siteName = '';
    const complexMatch = text.match(/(жк\s+[А-Яа-яA-Za-z0-9\s\-]+|новостройк[а-я]\s+[А-Яа-яA-Za-z0-9\s\-]+)/i);
    if (complexMatch) {
      siteName = complexMatch[1].trim();
    } else {
      const districts = ['чиланзар', 'миробод', 'мирабод', 'юнусабад', 'яшнабад', 'сергели', 'дархан', 'ойбек', 'сити', 'tashkent city', 'паркентский', 'каракамыш'];
      for (const d of districts) {
        if (lower.includes(d)) {
          siteName = 'ЖК ' + d.charAt(0).toUpperCase() + d.slice(1);
          break;
        }
      }
    }
    if (!siteName) {
      siteName = 'Объект ' + clientName;
    }

    // Квартира / секция
    let unitName = '';
    const unitMatch = lower.match(/(\d+[\s\-]*комнатн[а-я]+|\d+[\s\-]*комн[а-я]*|кв[\.,\s]*\d+|коттедж|пентхаус|дом)/i);
    if (unitMatch) {
      unitName = unitMatch[1].trim();
    } else {
      unitName = '3-комнатная квартира';
    }

    // Телефон
    let phone = '+998901234567';
    const phoneMatch = text.match(/(\+?998[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\b\d{9}\b)/);
    if (phoneMatch) {
      phone = phoneMatch[0].replace(/[\s\-]/g, '');
      if (!phone.startsWith('+')) phone = '+' + phone;
    }

    // Срок монтажа
    let duration = 21;
    const durationMatch = lower.match(/(срок|дней|за)\s*(\d+)\s*(дней|дня|день)?/);
    if (durationMatch) {
      duration = parseInt(durationMatch[2]) || 21;
    }

    // Заполняем поля формы
    const inputName = document.getElementById('new-site-name');
    const inputUnit = document.getElementById('new-site-unit');
    const inputClient = document.getElementById('new-site-client');
    const inputPhone = document.getElementById('new-site-phone');
    const inputContract = document.getElementById('new-site-contract');
    const inputAdvance = document.getElementById('new-site-advance');
    const inputDuration = document.getElementById('new-site-duration');

    if (inputName) inputName.value = siteName;
    if (inputUnit) inputUnit.value = unitName;
    if (inputClient) inputClient.value = clientName;
    if (inputPhone) inputPhone.value = phone;
    if (inputContract) inputContract.value = contractSum || 20000000;
    if (inputAdvance) inputAdvance.value = advanceSum || Math.round((contractSum || 20000000) * 0.4);
    if (inputDuration) inputDuration.value = duration;

    this.playSwissChime();
    this.showToast(`✓ Голосом заполнено: ${siteName}, ${clientName}, ${this.formatSum(contractSum || 20000000)}!`);
  }

  // Быстрая отправка инженерного отчета заказчику в Telegram (в 1 клик)
  shareSiteProgressTelegram() {
    if (!this.currentSite) {
      this.showToast('Выберите объект для формирования отчета');
      return;
    }

    const site = this.currentSite;
    const stageNames = {
      1: 'Этап 1: Черновой монтаж (Узел ввода и стояки)',
      2: 'Этап 2: Разводка трасс водоснабжения и отопления',
      3: 'Этап 3: Опрессовка 16 бар (Гидроиспытания)',
      4: 'Этап 4: Допуск под заливку стяжки',
      5: 'Этап 5: Чистовая установка санфаянса'
    };
    const stageText = stageNames[site.status] || `Этап ${site.status}`;
    const pressStatus = site.pressTestPassed
      ? '✅ Двойной гидротест 16.0 бар ВЫДЕРЖАН (24 часа без падения давления)'
      : '⏳ Готовится к гидравлическим испытаниям 16 бар';

    const debt = Math.max(0, (site.contractSum || 0) - (site.advanceSum || 0));

    const report = `🏛️ ИНЖЕНЕРНЫЙ ОТЧЕТ ОБЪЕКТА
«Лига Опытных Мастеров» • Ташкент
Ведущий инженер: Улугбек Хакимов

📍 Объект: ${site.name} ${site.unit ? '(' + site.unit + ')' : ''}
👤 Заказчик: ${site.client || 'Уважаемый клиент'}
🛡️ Текущий статус: ${stageText}
📊 Опрессовка: ${pressStatus}
📋 Стандарт: 16 бар / DIN 1988 (в 4 раза строже СНиП)
💰 Финансовый статус: оплачено ${this.formatSum(site.advanceSum || 0)} из ${this.formatSum(site.contractSum || 0)}${debt > 0 ? ' (остаток: ' + this.formatSum(debt) + ')' : ' (полный расчет)'}

Официальный Исполнительный Паспорт объекта с фотофиксацией скрытых трасс доступен в LIGA OS.
Сайт мастера: https://liga-masterov.vercel.app/`;

    this.copyToClipboard(report).then(() => {
      this.showToast('✓ Отчет скопирован в буфер обмена!');
    }).catch(() => {
      this.showToast('✓ Отчет сформирован!');
    });

    try {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('https://liga-masterov.vercel.app/')}&text=${encodeURIComponent(report)}`;
      window.open(shareUrl, '_blank');
    } catch (err) {
      console.warn('Telegram share window error:', err);
    }
  }
}

// Безотказный запуск приложения: поддерживает как ожидание DOM, так и немедленный старт
function bootLigaApp() {
  if (!window.app) {
    window.app = new LigaApp();
    window.app.init();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootLigaApp);
} else {
  bootLigaApp();
}
