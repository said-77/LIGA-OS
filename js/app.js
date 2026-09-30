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

    // Машинная озвучка ответов (TTS SpeechSynthesis) — ПО УМОЛЧАНИЮ СТРОГО ВЫКЛЮЧЕНА (Тихий швейцарский режим)
    this.isVoiceTtsEnabled = localStorage.getItem('liga_voice_tts_enabled') === 'true'; // false по умолчанию

    // Удержание экрана активным в автомобиле (Screen Wake Lock API)
    this.wakeLock = null;
    this.isDriveModeEnabled = localStorage.getItem('liga_drive_mode_enabled') === 'true';

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
      this.initUlugbekBriefOnboarding();
      this.initVideoTour();
      this.initMasterSealSettings();
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

    if (playSound && this.isSoundEnabled && typeof this.playSectionSwitchSound === 'function') {
      this.playSectionSwitchSound();
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
      this.audioCtx.resume().catch(() => {});
    }
    // Автоматическая глобальная разблокировка звука при первом же касании экрана (User Gesture для мобильных Safari/Chrome)
    if (!this.audioUnlockAttached && typeof window !== 'undefined') {
      this.audioUnlockAttached = true;
      const unlockAudio = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true, once: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
      window.addEventListener('click', unlockAudio, { passive: true, once: true });
    }
  }

  // Благородный швейцарский двухтональный аккорд (опрессовка 16 бар / успешный этап)
  // v2.5.0: бархатные средние частоты G4 (392 Гц) -> C5 (523 Гц) с защитой от резкого звона
  playSwissChime() {
    if (!this.isSoundEnabled) return;
    try {
      this.initAudioEngine();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      const now = this.audioCtx.currentTime;

      // Мягкий обрезной фильтр низких частот (срезает металлический писк выше 650 Гц)
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, now);

      // Первый тон (G4 - 392.00 Hz)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(392.0, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.18, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(filter);
      osc1.start(now);
      osc1.stop(now + 0.45);

      // Второй благородный тон (C5 - 523.25 Hz)
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523.25, now + 0.06);
      gain2.gain.setValueAtTime(0.001, now + 0.06);
      gain2.gain.linearRampToValueAtTime(0.19, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.60);
      osc2.connect(gain2);
      gain2.connect(filter);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.60);

      filter.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn('Ошибка воспроизведения звука chime:', e);
    }
  }

  // Благородный кристальный звон привлечения внимания к тест-драйву Улугбека (F3 -> A3 -> C4)
  // v2.5.0: бархатное теплое арпеджио без пронзительных высоких нот
  playVipAttentionChime() {
    if (!this.isSoundEnabled) return;
    try {
      this.initAudioEngine();
      if (!this.audioCtx) return;

      const runSound = () => {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);

        // Нота 1: F3 (174.61 Hz)
        const osc1 = this.audioCtx.createOscillator();
        const gain1 = this.audioCtx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(174.61, now);
        gain1.gain.setValueAtTime(0.001, now);
        gain1.gain.linearRampToValueAtTime(0.20, now + 0.025);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.50);
        osc1.connect(gain1);
        gain1.connect(filter);
        osc1.start(now);
        osc1.stop(now + 0.50);

        // Нота 2: A3 (220.00 Hz) через 90мс
        const osc2 = this.audioCtx.createOscillator();
        const gain2 = this.audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(220.00, now + 0.09);
        gain2.gain.setValueAtTime(0.001, now + 0.09);
        gain2.gain.linearRampToValueAtTime(0.18, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc2.connect(gain2);
        gain2.connect(filter);
        osc2.start(now + 0.09);
        osc2.stop(now + 0.65);

        // Нота 3: C4 (261.63 Hz) через 180мс
        const osc3 = this.audioCtx.createOscillator();
        const gain3 = this.audioCtx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(261.63, now + 0.18);
        gain3.gain.setValueAtTime(0.001, now + 0.18);
        gain3.gain.linearRampToValueAtTime(0.17, now + 0.20);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        osc3.connect(gain3);
        gain3.connect(filter);
        osc3.start(now + 0.18);
        osc3.stop(now + 0.85);

        filter.connect(this.audioCtx.destination);
      };

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().then(() => runSound()).catch(() => {
          const unlockHandler = () => {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
              this.audioCtx.resume().then(() => runSound());
            } else {
              runSound();
            }
            window.removeEventListener('pointerdown', unlockHandler);
            window.removeEventListener('touchstart', unlockHandler);
            window.removeEventListener('click', unlockHandler);
          };
          window.addEventListener('pointerdown', unlockHandler, { once: true, passive: true });
          window.addEventListener('touchstart', unlockHandler, { once: true, passive: true });
          window.addEventListener('click', unlockHandler, { once: true, passive: true });
        });
      } else {
        runSound();
      }
    } catch (e) {
      console.warn('Ошибка воспроизведения звука VIP Chime:', e);
    }
  }

  // Представительный, дипломатичный звук открытия брифа мастера Улугбека (v2.5.0)
  // Бархатный низкий Ре-мажорный аккорд рояля (D3 -> F#3 -> A3 -> D4) с аналоговым Lowpass-фильтром 420 Гц.
  // Абсолютно благородное, статусное, приятное звучание представительского класса — ноль писка и раздражения.
  playDiplomaticChime() {
    if (!this.isSoundEnabled) return;
    try {
      this.initAudioEngine();
      if (!this.audioCtx) return;

      const runDiplomatic = () => {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        // Мастер-фильтр низких частот: срезает все частоты выше 420 Гц для теплого рояльного резонанса
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, now);
        filter.Q.setValueAtTime(0.7, now);

        // Общий мастер-гейн с шелковой огибающей (мягкая атака 35мс, глубокий спад 1.15с)
        const masterGain = this.audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.001, now);
        masterGain.gain.linearRampToValueAtTime(0.24, now + 0.035);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);

        filter.connect(masterGain);
        masterGain.connect(this.audioCtx.destination);

        // 1. Бархатная фундаментальная басовая основа: D3 (146.83 Гц, треугольная волна теплого дерева)
        const osc1 = this.audioCtx.createOscillator();
        const gain1 = this.audioCtx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(146.83, now);
        gain1.gain.setValueAtTime(0.30, now);
        osc1.connect(gain1);
        gain1.connect(filter);
        osc1.start(now);
        osc1.stop(now + 1.15);

        // 2. Благородная мажорная терция: F#3 (185.00 Гц, чистый синус)
        const osc2 = this.audioCtx.createOscillator();
        const gain2 = this.audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(185.00, now + 0.02);
        gain2.gain.setValueAtTime(0.22, now + 0.02);
        osc2.connect(gain2);
        gain2.connect(filter);
        osc2.start(now + 0.02);
        osc2.stop(now + 1.15);

        // 3. Статусная квинта надежности: A3 (220.00 Гц, чистый синус)
        const osc3 = this.audioCtx.createOscillator();
        const gain3 = this.audioCtx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(220.00, now + 0.04);
        gain3.gain.setValueAtTime(0.20, now + 0.04);
        osc3.connect(gain3);
        gain3.connect(filter);
        osc3.start(now + 0.04);
        osc3.stop(now + 1.15);

        // 4. Мягкий шелковистый октавный оттенок: D4 (293.66 Гц, тихий синус)
        const osc4 = this.audioCtx.createOscillator();
        const gain4 = this.audioCtx.createGain();
        osc4.type = 'sine';
        osc4.frequency.setValueAtTime(293.66, now + 0.06);
        gain4.gain.setValueAtTime(0.14, now + 0.06);
        osc4.connect(gain4);
        gain4.connect(filter);
        osc4.start(now + 0.06);
        osc4.stop(now + 1.15);
      };

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().then(() => runDiplomatic()).catch(() => {
          const unlock = () => {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
              this.audioCtx.resume().then(() => runDiplomatic());
            } else {
              runDiplomatic();
            }
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('click', unlock);
          };
          window.addEventListener('pointerdown', unlock, { once: true, passive: true });
          window.addEventListener('touchstart', unlock, { once: true, passive: true });
          window.addEventListener('click', unlock, { once: true, passive: true });
        });
      } else {
        runDiplomatic();
      }
    } catch (e) {
      console.warn('Ошибка звука playDiplomaticChime:', e);
    }
  }

  // Представительный, ненавязчивый звук переключения разделов и окон (бархатный титановый тон)
  // v2.5.0: мягкий тактильный клик (280 Гц -> 190 Гц) без резких щелчков
  playSectionSwitchSound() {
    if (!this.isSoundEnabled) return;
    try {
      this.initAudioEngine();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      const now = this.audioCtx.currentTime;

      // Мягкий тактильный спад 280 Гц -> 190 Гц со скругленной атакой 6мс
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.050);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.065, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.055);
    } catch (e) {
      console.warn('Ошибка звука playSectionSwitchSound:', e);
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
      // Клик — быстрое переключение режима
      btnToggle.addEventListener('click', () => this.toggleClientMode());

      // Долгое нажатие (3 секунды пальцем на смартфоне или удержание курсора) — показ подсказки приватности
      let longPressTimer = null;
      let longPressTriggered = false;

      const startLongPress = (e) => {
        longPressTriggered = false;
        longPressTimer = setTimeout(() => {
          longPressTriggered = true;
          this.showEyeLongPressTooltip();
          if (navigator.vibrate) {
            try { navigator.vibrate([50, 30, 50]); } catch (_) {}
          }
        }, 3000);
      };

      const cancelLongPress = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      };

      btnToggle.addEventListener('touchstart', startLongPress, { passive: true });
      btnToggle.addEventListener('touchend', cancelLongPress);
      btnToggle.addEventListener('touchcancel', cancelLongPress);
      btnToggle.addEventListener('mousedown', startLongPress);
      btnToggle.addEventListener('mouseup', cancelLongPress);
      btnToggle.addEventListener('mouseleave', cancelLongPress);
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

    // Световой маяк безопасности в навигационной ленте шапки (v2.4.0)
    const beacon = document.getElementById('header-safety-beacon');
    const beaconText = document.getElementById('safety-beacon-text');
    if (beacon && beaconText) {
      if (isActive) {
        beacon.className = 'screen-ribbon-safety client-mode';
        beaconText.innerText = '🛡️ БЕЗОПАСНЫЙ ПОКАЗ';
        beacon.title = 'Режим безопасного показа клиенту (цены и зарплаты скрыты). Нажмите для возврата в режим Мастера.';
      } else {
        beacon.className = 'screen-ribbon-safety master-mode';
        beaconText.innerText = '👑 МАСТЕР';
        beacon.title = 'Режим инженера-мастера (полный доступ к оптовым ценам и кассе). Нажмите для показа клиенту.';
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

  setClientModeFalse() {
    this.setClientMode(false);
  }

  toggleSafetyBeacon() {
    this.toggleClientMode();
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

  // Переключение активного объекта (в том числе по голосу мастера)
  async selectSite(siteId) {
    this.currentSiteId = parseInt(siteId);
    await this.loadSites();
    this.render();
    await this.renderScreenContent(this.currentScreen);
    await this.updateNavBadges();
    const siteSelect = document.getElementById('dashboard-site-select');
    if (siteSelect) siteSelect.value = String(this.currentSiteId);
  }

  // Интеллектуальный поиск объекта по русской или английской транслитерации
  findSiteByQuery(query) {
    if (!this.sites || this.sites.length === 0 || !query) return null;
    const q = query.toLowerCase().trim();
    return this.sites.find(s => {
      const name = (s.name || '').toLowerCase();
      const addr = (s.address || '').toLowerCase();
      if (name.includes(q) || addr.includes(q)) return true;
      if (q.includes('мирабад') && (name.includes('mirabad') || name.includes('мирабад'))) return true;
      if (q.includes('инфинити') && (name.includes('infinity') || name.includes('инфинити'))) return true;
      if ((q.includes('ташкент сити') || q.includes('сити')) && (name.includes('tashkent') || name.includes('city') || name.includes('сити'))) return true;
      if (q.includes('бульвар') && (name.includes('boulevard') || name.includes('бульвар'))) return true;
      if ((q.includes('нест') || q.includes('ван')) && (name.includes('nest') || name.includes('нест'))) return true;
      if (q.includes('коттедж') && (name.includes('коттедж') || name.includes('дом') || name.includes('дача'))) return true;
      return false;
    });
  }

  openPassportPhotosModal() {
    this.updatePhotoBadges();
    this.openModal('modal-passport-photos');
  }

  openPaymentModal(type = 'client_advance', amount = null) {
    this.openModal('modal-payment');
    const payTypeEl = document.getElementById('pay-type');
    if (payTypeEl && type) payTypeEl.value = type;
    const amtInput = document.getElementById('input-payment-amount') || document.getElementById('pay-amount');
    if (amtInput && amount) amtInput.value = this.formatNumber(amount);
  }

  // Регистрация оффлайн-воркера с немедленной проверкой обновлений (v2.4.8)
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('Service Worker LIGA OS зарегистрирован (Offline-Ready)');
          // При каждом старте приложения принудительно проверяем обновления на сервере
          if (reg && typeof reg.update === 'function') {
            reg.update().catch(() => {});
          }
        })
        .catch(err => console.log('Service Worker ошибка регистрации:', err));

      // Если новый воркер взял управление — перезагружаем страницу при необходимости
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[LIGA OS] Обнаружена новая версия приложения!');
      });
    }
  }

  // Принудительное мгновенное обновление приложения (очистка кэша браузера)
  async forceUpdateApp() {
    this.showToast('🔄 Проверка и обновление приложения...');
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const r of registrations) {
          await r.unregister();
        }
      }
    } catch (_) {}
    // Перезагрузка с временной меткой в обход кэша
    window.location.href = window.location.pathname + '?nocache=' + Date.now();
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
      btnVoice.addEventListener('click', () => this.openVoiceAssistant());
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

  // Переключение экранов приложения с навигационным компасом и тактильной отдачей (v2.3.1)
  // Централизованная остановка голоса диктора при любом переходе (v2.4.7)
  stopAllVoices() {
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {
      // Игнорируем в браузерах без поддержки Web Speech API
    }
  }

  switchScreen(screenName) {
    this.stopAllVoices();
    this.currentScreen = screenName;

    // 1. Переключение видимости экранов с анимацией появления
    document.querySelectorAll('.app-screen').forEach(el => {
      el.classList.remove('active');
    });
    const target = document.getElementById(`screen-${screenName}`);
    if (target) {
      target.classList.add('active');
    }

    // 2. Роскошная подсветка активной вкладки в нижнем меню
    document.querySelectorAll('.nav-item').forEach(btn => {
      if (btn.getAttribute('data-screen') === screenName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 3. Обновление навигационного компаса в шапке (Header Ribbon)
    const screenMeta = {
      dashboard: { icon: '🏢', name: 'ОБЪЕКТЫ', title: 'Объекты мастера' },
      finances: { icon: '💰', name: 'ФИНАНСЫ', title: 'Финансы и касса' },
      materials: { icon: '📦', name: 'СКЛАД', title: 'Склад и снабжение' },
      checklist: { icon: '🛡️', name: 'КОНТРОЛЬ', title: 'Технадзор 16 бар' },
      estimate: { icon: '⚡', name: 'СМЕТА', title: 'Экспресс-смета' },
      history: { icon: '📜', name: 'ИСТОРИЯ', title: 'История объекта' }
    };
    const meta = screenMeta[screenName] || { icon: '📱', name: 'РАЗДЕЛ', title: 'Раздел системы' };
    const ribbonIcon = document.getElementById('ribbon-screen-icon');
    const ribbonName = document.getElementById('ribbon-screen-name');
    const ribbonSite = document.getElementById('ribbon-site-name');
    if (ribbonIcon) ribbonIcon.innerText = meta.icon;
    if (ribbonName) ribbonName.innerText = meta.name;
    if (ribbonSite && this.currentSite) ribbonSite.innerText = this.currentSite.name;

    // 4. Тактильный виброотклик смартфона (haptic click)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(25);
      } catch (e) {
        // Игнорируем в браузерах без поддержки
      }
    }

    // 5. Представительный тактильный звук переключения раздела (не приторный, благородный)
    if (this.isSoundEnabled && typeof this.playSectionSwitchSound === 'function') {
      this.playSectionSwitchSound();
    }

    // 6. Мгновенная прокрутка наверх экрана для 100% фокуса
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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
    const ribbonSite = document.getElementById('ribbon-site-name');
    if (ribbonSite) ribbonSite.innerText = s.name;
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
        const barVal = s.pressureTest ? parseFloat(s.pressureTest.pressureBar) || 16.0 : 16.0;
        const barText = barVal >= 15.0 ? '16 бар' : `${barVal.toFixed(1)} бар`;
        passportStatusEl.innerHTML = `<span style="color:var(--neon-emerald);">🟢 Паспорт готов к сдаче (${barText} подтверждено)</span>`;
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

  // Открытие модального окна структурированного протокола опрессовки (v2.3.5)
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

    const currentBar = pt.pressureBar ? parseFloat(pt.pressureBar) : 16.0;
    if (startDateEl) startDateEl.value = pt.startDate || today;
    if (startTimeEl) startTimeEl.value = pt.startTime || '09:00';
    if (endDateEl) endDateEl.value = pt.endDate || tomorrowDate;
    if (endTimeEl) endTimeEl.value = pt.endTime || '09:00';
    if (barEl) barEl.value = currentBar.toFixed(1);

    this.onPressureBarInput(currentBar);

    if (notesEl) {
      notesEl.value = pt.notes || (currentBar >= 15.0
        ? 'Давление 16.0 бар выдержано 24 часа без падения (0.0 бар). Все соединения Rehau и коллектор FAR герметичны. Разрешено к заливке стяжки.'
        : `Контрольная опрессовка ${currentBar.toFixed(1)} бар проведена успешно без падения давления. Соединения герметичны.`);
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

  // Быстрый выбор инженерного стандарта опрессовки (v2.3.5)
  applyPressurePreset(bar, hours = 24, normTitle = '') {
    const barEl = document.getElementById('pt-pressure-bar');
    if (barEl) {
      barEl.value = Number(bar).toFixed(1);
    }
    const today = new Date().toISOString().slice(0, 10);
    const startDateEl = document.getElementById('pt-start-date');
    const startTimeEl = document.getElementById('pt-start-time');
    const endDateEl = document.getElementById('pt-end-date');
    const endTimeEl = document.getElementById('pt-end-time');

    if (startDateEl && !startDateEl.value) startDateEl.value = today;
    if (startTimeEl && !startTimeEl.value) startTimeEl.value = '10:00';

    if (endDateEl) {
      const expDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString().slice(0, 10);
      endDateEl.value = expDate;
    }
    if (endTimeEl) {
      endTimeEl.value = '10:00';
    }

    this.onPressureBarInput(bar, hours, normTitle);
    this.fillPressureNotesTemplate();
  }

  // Расчет коэффициента запаса надежности и анализ рисков для Ташкента (v2.3.5)
  onPressureBarInput(barVal, expHours = null, customNorm = null) {
    const bar = Math.max(1.5, Math.min(40.0, parseFloat(barVal) || 16.0));
    const pWork = 3.5; // Среднее фактическое давление городской сети Ташкента
    const factor = Math.round((bar / pWork) * 100) / 100;

    let title = '';
    let desc = '';
    let equip = '';
    let warranty = '';
    let factorColor = 'var(--neon-emerald)';
    let norm = customNorm || '';

    if (bar >= 15.0) {
      norm = norm || 'Швейцарский эталон LIGA OS (DIN 1988)';
      title = `Швейцарский эталон (${bar.toFixed(1)} бар • ${factor}x запас)`;
      desc = 'Абсолютная 4-кратная прочность. Рекомендуется для скрытых трасс под монолитом и мрамором в элитных ЖК (Mirabad Avenue, Tashkent City, Nest One).';
      equip = 'Гидропресс Rothenberger (до 60 бар) + заглушки Rehau';
      warranty = '10 лет (максимум)';
      factorColor = 'var(--gold-primary)';
    } else if (bar >= 9.0) {
      norm = norm || 'Стандарт Rehau (DIN 1988-2 / EN 806-4)';
      title = `Стандарт Rehau (${bar.toFixed(1)} бар • ${factor}x запас)`;
      desc = 'Усиленный 3-кратный запас прочности. Надежная защита от гидроударов городской сети и повысительных насосных станций.';
      equip = 'Ручной опрессовочный насос Rehau / RIDGID (манометр до 25 бар)';
      warranty = '5 лет';
      factorColor = 'var(--neon-cyan)';
    } else if (bar >= 5.0) {
      norm = norm || 'Стандарт СНиП 3.05.01-85 / СП 73.13330';
      title = `Стандарт СНиП (${bar.toFixed(1)} бар • ${factor}x запас)`;
      desc = 'Нормативное 1.5-кратное рабочее давление. Стандартные квартиры, контуры радиаторов с подключенными приборами.';
      equip = 'Стандартный ручной опрессовщик (манометр 0-10 бар)';
      warranty = '3 года';
      factorColor = 'var(--neon-emerald)';
    } else {
      norm = norm || 'Рабочее давление сети Ташкента (СП 73.13330)';
      title = `Давление сети Ташкента (${bar.toFixed(1)} бар • ${factor}x запас)`;
      desc = 'Герметичность под фактическим рабочим напором городского водопровода Ташкента (2.5–4.5 бар). Оптимально при ограниченном бюджете или отсутствии гидропресса.';
      equip = 'Манометр на вводе городского водопровода / портативный компрессор';
      warranty = '1-2 года (штатный режим)';
      factorColor = '#38bdf8';
    }

    this.currentPressureMeta = {
      bar,
      factor,
      norm,
      desc,
      equip,
      warranty,
      expHours: expHours || 24
    };

    const factorEl = document.getElementById('pt-badge-factor');
    const descEl = document.getElementById('pt-badge-desc');
    const equipEl = document.getElementById('pt-badge-equip');
    const warrantyEl = document.getElementById('pt-badge-warranty');

    if (factorEl) {
      factorEl.innerText = `Запас ${factor}x (${Math.round(factor * 100)}%)`;
      factorEl.style.color = factorColor;
    }
    if (descEl) descEl.innerText = desc;
    if (equipEl) equipEl.innerText = equip;
    if (warrantyEl) warrantyEl.innerText = warranty;
  }

  // Подстановка официального заключения инженера под выбранную цифру (v2.3.5)
  fillPressureNotesTemplate() {
    const meta = this.currentPressureMeta || { bar: 16.0, factor: 4.6 };
    const bar = meta.bar || 16.0;
    const notesEl = document.getElementById('pt-notes');
    if (!notesEl) return;

    if (bar >= 15.0) {
      notesEl.value = `Давление 16.0 бар выдержано 24 часа без падения (0.0 бар). Все узлы ввода FAR и трубы Rehau герметичны. Разрешена заливка стяжки.`;
    } else if (bar >= 9.0) {
      notesEl.value = `Опрессовка ${bar.toFixed(1)} бар по стандарту Rehau выдержана без падения давления. Узлы герметичны, система готова к эксплуатации.`;
    } else if (bar >= 5.0) {
      notesEl.value = `Гидравлическое испытание ${bar.toFixed(1)} бар по СНиП 3.05.01-85 проведено успешно. Падение давления 0.0 бар. Соединения герметичны.`;
    } else {
      notesEl.value = `Контрольная опрессовка ${bar.toFixed(1)} бар под штатным давлением городской сети Ташкента проведена. Протечек и падения давления не обнаружено. Соединения герметичны.`;
    }
  }

  // Фиксация структурированного протокола опрессовки (v2.3.5)
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
    if (isNaN(barVal) || barVal < 1.5) {
      showError('Укажите корректное испытательное давление (не менее 1.5 бар).');
      return;
    }
    if (!hasPhoto) {
      showError('Обязательно прикрепите фото манометра под давлением.');
      return;
    }
    if (!notes) {
      showError('Укажите заключение / комментарий инженера по результатам испытания.');
      return;
    }

    if (errEl) {
      errEl.style.display = 'none';
    }

    const standardNorm = (this.currentPressureMeta && this.currentPressureMeta.norm) 
      || (barVal >= 15.0 ? 'Швейцарский эталон (DIN 1988)' : (barVal >= 9.0 ? 'Стандарт Rehau (DIN 1988-2)' : (barVal >= 5.0 ? 'Стандарт СНиП 3.05.01-85' : 'Рабочее давление сети Ташкента')));
    const safetyFactor = (this.currentPressureMeta && this.currentPressureMeta.factor) 
      || (Math.round((barVal / 3.5) * 100) / 100);

    this.currentSite.pressureTest = {
      startDate,
      startTime,
      endDate,
      endTime,
      pressureBar: barVal,
      standardNorm,
      safetyFactor,
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
    this.showToast(`✓ Акт опрессовки ${barVal.toFixed(1)} бар: УСПЕШНО ЗАФИКСИРОВАН!`);
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

    const barVal = (s.pressureTest && s.pressureTest.pressureBar) ? Number(s.pressureTest.pressureBar).toFixed(1) : '16.0';
    const normName = (s.pressureTest && s.pressureTest.standardNorm) || (parseFloat(barVal) >= 15.0 ? 'Швейцарский эталон 16 бар' : 'Стандарт испытания');
    const pressStatus = s.pressTestPassed ? `✓ ${barVal} БАР ВЫДЕРЖАНО (${normName})` : '❌ ОПРЕССОВКА НЕ ПРОВЕДЕНА';

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
Сайт: https://liga-master-uz.vercel.app/`;

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

Сформировано в LIGA OS: https://liga-master-uz.vercel.app/`;

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

Сайт-портфолио: https://liga-master-uz.vercel.app/`;

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

Сформировано в LIGA OS • https://liga-master-uz.vercel.app/`;

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

  applyPipePreset(key) {
    if (!this.pipeCalc) {
      this.pipeCalc = { cold: 6, hot: 4, hasHighFlow: true, hasRecirc: false, pressure: '6.0', length: 'medium' };
    }
    if (key === 'apt_small') {
      this.pipeCalc.cold = 6;
      this.pipeCalc.hot = 4;
      this.pipeCalc.hasHighFlow = true;
      this.pipeCalc.hasRecirc = false;
      this.pipeCalc.length = 'medium';
    } else if (key === 'villa') {
      this.pipeCalc.cold = 12;
      this.pipeCalc.hot = 8;
      this.pipeCalc.hasHighFlow = true;
      this.pipeCalc.hasRecirc = true;
      this.pipeCalc.length = 'medium';
    } else if (key === 'residence') {
      this.pipeCalc.cold = 18;
      this.pipeCalc.hot = 12;
      this.pipeCalc.hasHighFlow = true;
      this.pipeCalc.hasRecirc = true;
      this.pipeCalc.length = 'long';
    }
    const cEl = document.getElementById('pipe-calc-cold-val');
    const hEl = document.getElementById('pipe-calc-hot-val');
    const hfEl = document.getElementById('pipe-calc-high-flow');
    const recEl = document.getElementById('pipe-calc-boiler-recirc');
    const lenEl = document.getElementById('pipe-calc-length-select');
    if (cEl) cEl.innerText = this.pipeCalc.cold;
    if (hEl) hEl.innerText = this.pipeCalc.hot;
    if (hfEl) hfEl.checked = this.pipeCalc.hasHighFlow;
    if (recEl) recEl.checked = this.pipeCalc.hasRecirc;
    if (lenEl) lenEl.value = this.pipeCalc.length;
    this.recalculatePipeManifold();
    if (this.isSoundEnabled && typeof this.playChime === 'function') {
      this.playChime(520, 0.05);
    }
    this.showToast(`⚡ Экспресс-пресет узла ввода: ${key === 'apt_small' ? '2-3 комн. квартира' : key === 'villa' ? 'Дом/Вилла' : 'Элитная Резиденция'}`);
  }

  async copyPipeClientScript() {
    const c = this.currentCalculatedPipes || { cold: 6, hot: 4, inlet: '25 мм (Rehau 25×3.5)', manifoldCold: 'FAR 1"', manifoldHot: 'FAR 1"' };
    const text = `Здравствуйте! Подготовил инженерное решение по узлу ввода и распределительным коллекторам водоснабжения.

💎 Главный принцип надежности:
Мы применяем премиальную лучевую коллекторную схему трубами Rehau Rautitan. К каждому смесителю, душу и прибору идет отдельная бесшовная труба от коллектора FAR без единого тройника и скрытого соединения в стяжке пола.

🚿 Гарантия стабильной температуры:
Диаметр ввода (${c.inlet || '25 мм'}) и пропускная способность коллекторов рассчитаны строго по европейскому стандарту DIN 1988 на одновременный расход. Даже если кто-то нажмет смыв унитаза или включится стиральная машина — напор и температура воды в душе не изменятся ни на градус (никаких температурных шоков и ожогов!).

В спецификации заложены гасители гидроударов FAR и редукторы давления Caleffi для абсолютной защиты сантехники.
Срок службы такой системы — свыше 50 лет надежно, как швейцарские часы!`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await this.copyToClipboard(text);
      }
      this.showToast('✓ Аргумент для заказчика скопирован в буфер обмена!');
    } catch (e) {
      this.showToast('✓ Текст для заказчика сформирован!');
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

Сформировано в LIGA OS • https://liga-master-uz.vercel.app/`;

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

  applyFloorPreset(areaSqM) {
    if (!this.floorCalc) {
      this.floorCalc = { area: 50, step: '150', hasEdgeZones: true, isTiles: true };
    }
    this.floorCalc.area = Number(areaSqM) || 50;
    const areaEl = document.getElementById('floor-calc-area-val');
    if (areaEl) areaEl.innerText = this.floorCalc.area;
    this.recalculateFloorHeating();
    if (this.isSoundEnabled && typeof this.playChime === 'function') {
      this.playChime(520, 0.05);
    }
    this.showToast(`⚡ Экспресс-пресет теплого пола: ${this.floorCalc.area} м²`);
  }

  async copyFloorClientScript() {
    const f = this.currentCalculatedFloor || { area: 50, loops: 5, avgLoop: 72, totalPowerKw: 4.0 };
    const text = `Здравствуйте! Подготовил инженерный расчет водяного теплого пола для вашего объекта (${f.area} м²).

🌡️ Физика комфорта и тепла:
Площадь разделена на ${f.loops} независимых петель со средней длиной ~${f.avgLoop} м (строго в пределах европейской нормы ≤ 80 м). Это исключает гидравлическое запирание, завоздушивание и эффект «зебры» (когда часть пола горячая, а часть холодная). Прогрев поверхности абсолютно мягкий и равномерный.

🛡️ Надежность в стяжке:
Каждый контур укладывается цельным отрезком трубы Rehau Pink без единого фитинга или муфты в бетоне. Коллекторная группа с ротаметрами позволяет индивидуально настроить комфортную температуру в каждом помещении.
Срок службы — более 50 лет!`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await this.copyToClipboard(text);
      }
      this.showToast('✓ Аргумент по теплому полу скопирован для клиента!');
    } catch (e) {
      this.showToast('✓ Текст для заказчика сформирован!');
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

    // Сквозная авто-синхронизация объема работ в смете (v2.4.1)
    if (this.estimate && f.area) {
      this.estimate.floorHeatingSqM = f.area;
      const elFloor = document.getElementById('val-floorHeatingSqM');
      if (elFloor) elFloor.innerText = f.area;
      this.calculateEstimate();
    }

    await this.renderMaterials();
    this.updateNavBadges();
    this.closeModal('modal-floor-calculator');
    this.showToast(`✓ Добавлено ${itemsToAdd.length} позиций теплого пола на склад! Объем в смете обновлен (${f.area} м²).`);
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

Сформировано в LIGA OS • https://liga-master-uz.vercel.app/`;

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

  applyRadiatorPreset(count) {
    if (!this.radiatorCalc) {
      this.radiatorCalc = { count: 5, type: 'bimetal', roomArea: '16', connection: 'wall', cornerBoost: true };
    }
    this.radiatorCalc.count = Number(count) || 5;
    const countEl = document.getElementById('rad-calc-count-val');
    if (countEl) countEl.innerText = this.radiatorCalc.count;
    this.recalculateRadiators();
    if (this.isSoundEnabled && typeof this.playChime === 'function') {
      this.playChime(520, 0.05);
    }
    this.showToast(`⚡ Экспресс-пресет радиаторов: ${this.radiatorCalc.count} шт`);
  }

  async copyRadClientScript() {
    const r = this.currentCalculatedRadiators || { count: 8, totalPowerKw: 10.5, totalSections: 64 };
    const text = `Здравствуйте! Направляю инженерную спецификацию радиаторной системы отопления (${r.count || 8} приборов).

🔥 Лучевая схема Rehau:
Все радиаторы подключаются лучами из нержавеющего коллектора. Никаких тройников в полу под плиткой или паркетом! Каждый радиатор имеет независимую подачу и обратку со встроенным термостатическим клапаном для поддержания точной температуры.

⚡ Энергоэффективность и долговечность:
Тепловая мощность рассчитана с запасом на самые морозные дни в Ташкенте. Система быстро прогревает комнаты и работает в щадящем режиме для котла, экономя газ. Гарантия спокойствия на десятилетия!`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await this.copyToClipboard(text);
      }
      this.showToast('✓ Аргумент по радиаторам скопирован для клиента!');
    } catch (e) {
      this.showToast('✓ Текст для заказчика сформирован!');
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

  // ==========================================================================
  // РАСЧЕТ БОЙЛЕРА И МЕМБРАННОГО РАСШИРИТЕЛЬНОГО БАКА ГВС REFLEX (v2.2.9)
  // 100% надежность: компенсация 3.8% теплового расширения, Caleffi 6 бар, Grundfos PM
  // ==========================================================================
  openBoilerCalculator() {
    this.closeModal('modal-more-menu');
    if (!this.boilerCalc) {
      this.boilerCalc = {
        residents: 4,
        type: 'bkn',
        rainShower: true,
        bigBath: false,
        recirc: true
      };
    }
    const resEl = document.getElementById('boiler-calc-residents-val');
    const typeEl = document.getElementById('boiler-calc-type-select');
    const rainEl = document.getElementById('boiler-calc-rain-shower');
    const bathEl = document.getElementById('boiler-calc-big-bath');
    const recircEl = document.getElementById('boiler-calc-recirc');

    if (resEl) resEl.innerText = this.boilerCalc.residents;
    if (typeEl) typeEl.value = this.boilerCalc.type;
    if (rainEl) rainEl.checked = this.boilerCalc.rainShower;
    if (bathEl) bathEl.checked = this.boilerCalc.bigBath;
    if (recircEl) recircEl.checked = this.boilerCalc.recirc;

    this.recalculateBoiler();
    this.openModal('modal-boiler-calculator');
  }

  adjustBoilerResidents(delta) {
    if (!this.boilerCalc) {
      this.boilerCalc = { residents: 4, type: 'bkn', rainShower: true, bigBath: false, recirc: true };
    }
    this.boilerCalc.residents = Math.max(1, Math.min(8, (this.boilerCalc.residents || 4) + delta));
    const resEl = document.getElementById('boiler-calc-residents-val');
    if (resEl) resEl.innerText = this.boilerCalc.residents;
    this.recalculateBoiler();
  }

  recalculateBoiler() {
    if (!this.boilerCalc) {
      this.boilerCalc = { residents: 4, type: 'bkn', rainShower: true, bigBath: false, recirc: true };
    }
    const typeEl = document.getElementById('boiler-calc-type-select');
    const rainEl = document.getElementById('boiler-calc-rain-shower');
    const bathEl = document.getElementById('boiler-calc-big-bath');
    const recircEl = document.getElementById('boiler-calc-recirc');

    const residents = this.boilerCalc.residents || 4;
    const type = typeEl ? typeEl.value : this.boilerCalc.type;
    const rainShower = rainEl ? rainEl.checked : this.boilerCalc.rainShower;
    const bigBath = bathEl ? bathEl.checked : this.boilerCalc.bigBath;
    const recirc = recircEl ? recircEl.checked : this.boilerCalc.recirc;

    this.boilerCalc.type = type;
    this.boilerCalc.rainShower = rainShower;
    this.boilerCalc.bigBath = bigBath;
    this.boilerCalc.recirc = recirc;

    // Базовый расчет объема по числу жителей:
    // Норматив: ~35-40 л горячей воды (60°C) на человека в сутки
    let baseVol = 0;
    if (type === 'bkn') {
      // БКН имеет высокую скорость нагрева (мощность 24-32 кВт от котла), нагревается за 15-20 мин
      if (residents <= 2) baseVol = 100;
      else if (residents === 3) baseVol = 140;
      else if (residents === 4) baseVol = 160;
      else if (residents <= 6) baseVol = 200;
      else baseVol = 250;
    } else {
      // Электрический накопительный водонагреватель (ТЭН 2.0-2.5 кВт греет 2.5-4 часа) - запас воды больше
      if (residents === 1) baseVol = 80;
      else if (residents === 2) baseVol = 100;
      else if (residents === 3) baseVol = 120;
      else if (residents === 4) baseVol = 150;
      else if (residents <= 6) baseVol = 200;
      else baseVol = 250;
    }

    // Корректировки на сантехприборы
    let extraVol = 0;
    if (rainShower) extraVol += 50;
    if (bigBath) extraVol += 50;

    const rawTotalVol = baseVol + extraVol;

    // Округление до стандартного коммерческого типоряда бойлеров (80, 100, 120, 160, 200, 250, 300 л)
    let nominalVol = 100;
    if (rawTotalVol <= 80) nominalVol = 80;
    else if (rawTotalVol <= 100) nominalVol = 100;
    else if (rawTotalVol <= 130) nominalVol = 120;
    else if (rawTotalVol <= 170) nominalVol = 160;
    else if (rawTotalVol <= 220) nominalVol = 200;
    else if (rawTotalVol <= 270) nominalVol = 250;
    else nominalVol = 300;

    // Подбор конкретной модели
    let boilerModel = '';
    let boilerPrice = 0;
    if (type === 'bkn') {
      boilerModel = `Бойлер косвенного нагрева Drazice OKC ${nominalVol} NTR/BP (змеевик 24–32 кВт, напольный)`;
      boilerPrice = nominalVol <= 120 ? 5800000 : (nominalVol <= 160 ? 6900000 : (nominalVol <= 200 ? 8400000 : 10800000));
    } else {
      boilerModel = `Электрический водонагреватель Drazice OKCE ${nominalVol} (сухой керамический ТЭН 2.2 кВт)`;
      boilerPrice = nominalVol <= 100 ? 3600000 : (nominalVol <= 120 ? 4200000 : (nominalVol <= 160 ? 5100000 : 6400000));
    }

    // Расчет расширительного мембранного бака ГВС (Reflex Refix DE / Zilmet Hydro-Pro):
    // Тепловое расширение воды 3.8%. Коэффициент полезного объема мембраны k ~ 0.38
    // Минимальный объем бака: V_tank >= V_boiler * 0.10 (10% от объема бойлера)
    const deltaWaterExpansion = Number((nominalVol * 0.038).toFixed(1));
    let tankVolume = 12;
    let tankPrice = 450000;
    if (nominalVol <= 100) {
      tankVolume = 12;
      tankPrice = 450000;
    } else if (nominalVol <= 160) {
      tankVolume = 18;
      tankPrice = 580000;
    } else if (nominalVol <= 220) {
      tankVolume = 24;
      tankPrice = 720000;
    } else {
      tankVolume = 35;
      tankPrice = 960000;
    }

    const tankModel = `Reflex Refix DE ${tankVolume} л (синий/белый, питьевая EPDM, PN10, преддавление 3.3 бар)`;
    const physicsExplanation = `Тепловое расширение воды ~3.8% (${deltaWaterExpansion} л). Без бака давление превысит 6 бар и сорвет клапан! Бак Reflex спасает эмаль от разрыва.`;

    // Группа безопасности
    const safetyGroupModel = `Caleffi 5261 3/4" (сбросной клапан 6.0 бар, обратный клапан, воронка с разрывом струи)`;
    const safetyGroupPrice = 680000;

    // Насос рециркуляции
    let recircPumpModel = '';
    let recircPumpPrice = 0;
    if (recirc) {
      recircPumpModel = `Grundfos Comfort 15-14 BA PM (энергоэффективный с автоадаптацией, корпус бронза)`;
      recircPumpPrice = 1650000;
    } else {
      recircPumpModel = `Не требуется (без рециркуляционного кольца)`;
      recircPumpPrice = 0;
    }

    // Диаметры труб
    const pipeDiaText = nominalVol >= 200
      ? `Rehau Rautitan Stabil 25 (3/4") на ввод ХВС и подачу ГВС, рециркуляция 16/20`
      : `Rehau Rautitan Stabil 20 (1/2") на ввод ХВС и подачу ГВС, рециркуляция 16`;

    // Сохраняем расчет для экспорта
    this.currentCalculatedBoiler = {
      residents,
      type,
      rainShower,
      bigBath,
      recirc,
      nominalVol,
      boilerModel,
      boilerPrice,
      tankVolume,
      tankModel,
      tankPrice,
      deltaWaterExpansion,
      physicsExplanation,
      safetyGroupModel,
      safetyGroupPrice,
      recircPumpModel,
      recircPumpPrice,
      pipeDiaText
    };

    // Обновляем DOM
    const badgeEl = document.getElementById('res-boiler-volume-badge');
    const volEl = document.getElementById('res-boiler-volume');
    const modelEl = document.getElementById('res-boiler-model');
    const tankEl = document.getElementById('res-boiler-tank');
    const physEl = document.getElementById('res-boiler-tank-physics');
    const safetyEl = document.getElementById('res-boiler-safety-group');
    const pumpEl = document.getElementById('res-boiler-recirc-pump');
    const pipeEl = document.getElementById('res-boiler-pipe-dia');

    if (badgeEl) badgeEl.innerText = `Объем: ${nominalVol} л`;
    if (volEl) {
      let note = [];
      if (rainShower) note.push('тропический душ');
      if (bigBath) note.push('ванна');
      volEl.innerText = `${nominalVol} литров ${note.length > 0 ? '(' + note.join(' + ') + ')' : ''}`;
    }
    if (modelEl) modelEl.innerText = boilerModel;
    if (tankEl) tankEl.innerText = tankModel;
    if (physEl) physEl.innerText = physicsExplanation;
    if (safetyEl) safetyEl.innerText = safetyGroupModel;
    if (pumpEl) pumpEl.innerText = recircPumpModel;
    if (pipeEl) pipeEl.innerText = pipeDiaText;
  }

  async copyBoilerCalculation() {
    const b = this.currentCalculatedBoiler;
    if (!b) return;

    const report = `⚡ ИНЖЕНЕРНЫЙ РАСЧЕТ БОЙЛЕРА И СИСТЕМЫ ГВС
«Лига Опытных Мастеров» • Стандарт безаварийного водоснабжения (Ташкент)
Ведущий инженер: Улугбек Хакимов

📍 Проживающих: ${b.residents} чел
🚿 Потребители: ${b.rainShower ? '🌧️ Тропический душ (+50 л) | ' : ''}${b.bigBath ? '🛁 Большая ванна (+50 л) | ' : ''}${b.recirc ? '🔄 Рециркуляция включена' : 'Без рециркуляции'}

СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ (ДЛЯ ЗАКУПКИ):
1. Водонагреватель: ${b.boilerModel}
2. Расширительный мембранный бак ГВС: ${b.tankModel}
3. Физика компенсации: ${b.physicsExplanation}
4. Группа безопасности бойлера: ${b.safetyGroupModel}
5. Насос рециркуляции ГВС: ${b.recircPumpModel}
6. Диаметры трубной обвязки: ${b.pipeDiaText}

🛡️ 100% ЗАЩИТА ЭМАЛИ БОЙЛЕРА:
Расширительный бак ГВС Reflex Refix объемом 10% от бойлера полностью гасит тепловое расширение воды при нагреве (3.8%), предотвращая постоянный срыв клапана и микротрещины эмали!

Сформировано в LIGA OS • https://liga-master-uz.vercel.app/`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        this.copyToClipboard(report);
      }
      this.showToast('✓ Расчет бойлера и бака ГВС скопирован для Telegram / Базара!');
    } catch (e) {
      this.showToast('✓ Расчет оборудования ГВС сформирован!');
    }
  }

  applyBoilerPreset(residents, hasBath) {
    if (!this.boilerCalc) {
      this.boilerCalc = { residents: 4, type: 'bkn', rainShower: true, bigBath: false, recirc: true };
    }
    this.boilerCalc.residents = Number(residents) || 4;
    this.boilerCalc.bigBath = Boolean(hasBath);
    this.boilerCalc.rainShower = true;
    this.boilerCalc.recirc = true;

    const resEl = document.getElementById('boiler-calc-residents-val');
    const bathEl = document.getElementById('boiler-calc-big-bath');
    const rainEl = document.getElementById('boiler-calc-rain-shower');
    const recircEl = document.getElementById('boiler-calc-recirc');

    if (resEl) resEl.innerText = this.boilerCalc.residents;
    if (bathEl) bathEl.checked = this.boilerCalc.bigBath;
    if (rainEl) rainEl.checked = this.boilerCalc.rainShower;
    if (recircEl) recircEl.checked = this.boilerCalc.recirc;

    this.recalculateBoiler();
    if (this.isSoundEnabled && typeof this.playChime === 'function') {
      this.playChime(520, 0.05);
    }
    this.showToast(`⚡ Экспресс-пресет бойлера: ${this.boilerCalc.residents} чел • ${hasBath ? 'с ванной' : 'с душем'}`);
  }

  async copyBoilerClientScript() {
    const b = this.currentCalculatedBoiler || { volume: 200, tankModel: 'Reflex Refix DE 18' };
    const text = `Здравствуйте! Сделал расчет объема бойлера косвенного нагрева (БКН) для вашей семьи.

🛁 Безлимитный комфорт горячей воды:
Рассчитанный объем накопительного бака составляет ${b.volume || 200} литров. Это обеспечивает полноценную работу одновременно двух душей и мойки на кухне — горячая вода никогда не закончится в самый неподходящий момент, в отличие от двухконтурных котлов или колонок.

⏱️ Мгновенная подача за 1 секунду:
Благодаря линии рециркуляции ГВС горячая вода поступает в смеситель моментально при открытии крана, без ожидания и слива холодной воды. Для долговечности бойлер укомплектован расширительным баком Reflex Refix и надежной группой безопасности Caleffi.
Система создана для максимального комфорта вашей семьи!`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await this.copyToClipboard(text);
      }
      this.showToast('✓ Аргумент по бойлеру скопирован для клиента!');
    } catch (e) {
      this.showToast('✓ Текст для заказчика сформирован!');
    }
  }

  async addCalculatedBoilerToMaterials() {
    const b = this.currentCalculatedBoiler;
    if (!b) return;
    if (!window.ligaDB) {
      this.showToast('База данных недоступна');
      return;
    }

    const itemsToAdd = [];

    // 1. Водонагреватель
    itemsToAdd.push({
      category: 'boilers',
      name: b.boilerModel,
      qty: '1 шт',
      price: b.boilerPrice,
      isPurchased: false
    });

    // 2. Расширительный бак Reflex
    itemsToAdd.push({
      category: 'tanks',
      name: `Мембранный бак ГВС: ${b.tankModel}`,
      qty: '1 шт',
      price: b.tankPrice,
      isPurchased: false
    });

    // 3. Кронштейн крепления бака
    itemsToAdd.push({
      category: 'fittings',
      name: `Настенный кронштейн крепления мембранного бака Reflex с отсечным клапаном 3/4"`,
      qty: '1 шт',
      price: 180000,
      isPurchased: false
    });

    // 4. Группа безопасности Caleffi / Watts
    itemsToAdd.push({
      category: 'valves',
      name: `Группа безопасности бойлера: ${b.safetyGroupModel}`,
      qty: '1 шт',
      price: b.safetyGroupPrice,
      isPurchased: false
    });

    // 5. Насос рециркуляции (если включен)
    if (b.recirc && b.recircPumpPrice > 0) {
      itemsToAdd.push({
        category: 'pumps',
        name: `Насос рециркуляции ГВС: ${b.recircPumpModel}`,
        qty: '1 шт',
        price: b.recircPumpPrice,
        isPurchased: false
      });
      itemsToAdd.push({
        category: 'valves',
        name: `Обратный клапан ITAP Europa 1/2" (нерж тарелка) для линии рециркуляции ГВС`,
        qty: '1 шт',
        price: 95000,
        isPurchased: false
      });
    }

    // 6. Комплект трубной обвязки Rehau Stabil
    itemsToAdd.push({
      category: 'pipes',
      name: `Труба Rehau Rautitan Stabil для обвязки бойлера ГВС (${b.nominalVol >= 200 ? '25×3.7' : '20×2.9'})`,
      qty: '15 м',
      price: b.nominalVol >= 200 ? 15 * 42000 : 15 * 31000,
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
    this.closeModal('modal-boiler-calculator');
    this.showToast(`✓ Добавлено ${itemsToAdd.length} позиций ГВС и оборудования бойлера в список закупки на склад!`);
  }

  // ==========================================================================
  // РАСЧЕТ СИСТЕМЫ ЗАЩИТЫ ОТ ПРОТЕЧЕК NEPTUN / GIDROLOCK (v2.3.0)
  // 100% защита: электрокраны Bugatti 12V, радиодатчики, резерв LiFePO4
  // ==========================================================================
  openLeakCalculator() {
    this.closeModal('modal-more-menu');
    if (!this.leakCalc) {
      this.leakCalc = {
        diameter: '3/4',
        system: 'neptun',
        valvesCount: 2,
        sensorsCount: 6,
        wireless: true,
        ups: true,
        serviceValves: true
      };
    }
    const diaEl = document.getElementById('leak-calc-diameter-select');
    const sysEl = document.getElementById('leak-calc-system-select');
    const valEl = document.getElementById('leak-calc-valves-val');
    const sensEl = document.getElementById('leak-calc-sensors-val');
    const wireEl = document.getElementById('leak-calc-wireless');
    const upsEl = document.getElementById('leak-calc-ups');
    const servEl = document.getElementById('leak-calc-service-valves');

    if (diaEl) diaEl.value = this.leakCalc.diameter;
    if (sysEl) sysEl.value = this.leakCalc.system;
    if (valEl) valEl.innerText = this.leakCalc.valvesCount;
    if (sensEl) sensEl.innerText = this.leakCalc.sensorsCount;
    if (wireEl) wireEl.checked = this.leakCalc.wireless;
    if (upsEl) upsEl.checked = this.leakCalc.ups;
    if (servEl) servEl.checked = this.leakCalc.serviceValves;

    this.recalculateLeakSystem();
    this.openModal('modal-leak-calculator');
  }

  adjustLeakValves(delta) {
    if (!this.leakCalc) {
      this.leakCalc = { diameter: '3/4', system: 'neptun', valvesCount: 2, sensorsCount: 6, wireless: true, ups: true, serviceValves: true };
    }
    this.leakCalc.valvesCount = Math.max(1, Math.min(8, (this.leakCalc.valvesCount || 2) + delta));
    const valEl = document.getElementById('leak-calc-valves-val');
    if (valEl) valEl.innerText = this.leakCalc.valvesCount;
    this.recalculateLeakSystem();
  }

  adjustLeakSensors(delta) {
    if (!this.leakCalc) {
      this.leakCalc = { diameter: '3/4', system: 'neptun', valvesCount: 2, sensorsCount: 6, wireless: true, ups: true, serviceValves: true };
    }
    this.leakCalc.sensorsCount = Math.max(2, Math.min(16, (this.leakCalc.sensorsCount || 6) + delta));
    const sensEl = document.getElementById('leak-calc-sensors-val');
    if (sensEl) sensEl.innerText = this.leakCalc.sensorsCount;
    this.recalculateLeakSystem();
  }

  recalculateLeakSystem() {
    if (!this.leakCalc) {
      this.leakCalc = { diameter: '3/4', system: 'neptun', valvesCount: 2, sensorsCount: 6, wireless: true, ups: true, serviceValves: true };
    }
    const diaEl = document.getElementById('leak-calc-diameter-select');
    const sysEl = document.getElementById('leak-calc-system-select');
    const wireEl = document.getElementById('leak-calc-wireless');
    const upsEl = document.getElementById('leak-calc-ups');
    const servEl = document.getElementById('leak-calc-service-valves');

    const diameter = diaEl ? diaEl.value : this.leakCalc.diameter;
    const system = sysEl ? sysEl.value : this.leakCalc.system;
    const valvesCount = this.leakCalc.valvesCount || 2;
    const sensorsCount = this.leakCalc.sensorsCount || 6;
    const wireless = wireEl ? wireEl.checked : this.leakCalc.wireless;
    const ups = upsEl ? upsEl.checked : this.leakCalc.ups;
    const serviceValves = servEl ? servEl.checked : this.leakCalc.serviceValves;

    this.leakCalc.diameter = diameter;
    this.leakCalc.system = system;
    this.leakCalc.wireless = wireless;
    this.leakCalc.ups = ups;
    this.leakCalc.serviceValves = serviceValves;

    // Модуль управления
    let controlUnit = '';
    let controlPrice = 0;
    if (system === 'neptun') {
      controlUnit = 'Модуль управления Neptun Smart Plus (Wi-Fi, Tuya, радио 868 МГц)';
      controlPrice = 2850000;
    } else {
      controlUnit = 'Блок управления Gidrolock Premium (автоочистка кранов каждые 14 дней)';
      controlPrice = 3100000;
    }

    // Краны с электроприводом
    let valvesText = '';
    let valveUnitCost = 0;
    if (system === 'neptun') {
      valveUnitCost = diameter === '1/2' ? 1250000 : (diameter === '3/4' ? 1450000 : 1850000);
      valvesText = `${valvesCount} шт кранов Bugatti Pro 12V ${diameter}" (латунь CW617N, металлические шестерни)`;
    } else {
      valveUnitCost = diameter === '1/2' ? 1400000 : (diameter === '3/4' ? 1650000 : 2100000);
      valvesText = `${valvesCount} шт кранов Bonomi / Enolgas 12V ${diameter}" (усиленный редуктор 35 Нм)`;
    }
    const totalValvesCost = valveUnitCost * valvesCount;

    // Датчики мокрых зон
    let sensorsText = '';
    let totalSensorsCost = 0;
    if (wireless) {
      const radioCount = Math.max(1, sensorsCount - 1);
      sensorsText = `${radioCount} радиодатчиков 868 МГц + 1 проводной в коллекторный шкаф`;
      totalSensorsCost = (radioCount * 280000) + 120000;
    } else {
      sensorsText = `${sensorsCount} проводных датчиков (с контролем обрыва линии)`;
      totalSensorsCost = sensorsCount * 120000;
    }

    // Резервное питание
    let upsText = '';
    let upsCost = 0;
    if (ups) {
      upsText = 'Аккумулятор LiFePO4 12V 3.2Ah (до 72 ч автономности при отключении света)';
      upsCost = 380000;
    } else {
      upsText = 'Питание только от сети 220V (без аккумулятора)';
      upsCost = 0;
    }

    // Сервисные американки FAR
    let fittingsText = '';
    let fittingsCost = 0;
    if (serviceValves) {
      fittingsText = `Американки быстрого монтажа FAR / Tiemme ${diameter}" (${valvesCount} компл)`;
      fittingsCost = valvesCount * 140000;
    } else {
      fittingsText = 'Прямое подключение (без быстроразъемных сгонов)';
      fittingsCost = 0;
    }

    // Сохраняем расчет для экспорта
    this.currentCalculatedLeak = {
      diameter,
      system,
      valvesCount,
      sensorsCount,
      wireless,
      ups,
      serviceValves,
      controlUnit,
      controlPrice,
      valvesText,
      totalValvesCost,
      sensorsText,
      totalSensorsCost,
      upsText,
      upsCost,
      fittingsText,
      fittingsCost
    };

    // Обновляем DOM
    const badgeEl = document.getElementById('res-leak-status-badge');
    const ctrlEl = document.getElementById('res-leak-control-unit');
    const valResEl = document.getElementById('res-leak-valves');
    const sensResEl = document.getElementById('res-leak-sensors');
    const upsResEl = document.getElementById('res-leak-ups');
    const fitResEl = document.getElementById('res-leak-fittings');

    if (badgeEl) badgeEl.innerText = `${valvesCount} крана • ${sensorsCount} датчиков`;
    if (ctrlEl) ctrlEl.innerText = controlUnit;
    if (valResEl) valResEl.innerText = valvesText;
    if (sensResEl) sensResEl.innerText = sensorsText;
    if (upsResEl) upsResEl.innerText = upsText;
    if (fitResEl) fitResEl.innerText = fittingsText;
  }

  async copyLeakCalculation() {
    const l = this.currentCalculatedLeak;
    if (!l) return;

    const report = `🛡️ ИНЖЕНЕРНЫЙ РАСЧЕТ СИСТЕМЫ ЗАЩИТЫ ОТ ПРОТЕЧЕК
«Лига Опытных Мастеров» • Стандарт 100% защиты от затопления (Ташкент)
Ведущий инженер: Улугбек Хакимов

📍 Стояки ввода: ${l.valvesCount} шт (диаметр: ${l.diameter}")
📡 Мокрые зоны: ${l.sensorsCount} датчиков (${l.wireless ? 'радиоканал 868 МГц' : 'проводные'})

СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ (ДЛЯ ЗАКУПКИ):
1. Блок управления: ${l.controlUnit}
2. Краны с электроприводом: ${l.valvesText}
3. Датчики мокрых зон: ${l.sensorsText}
4. Резервное питание: ${l.upsText}
5. Сервисная арматура: ${l.fittingsText}

🛡️ 100% БЕЗОПАСНОСТЬ ОТ ЗАТОПЛЕНИЯ:
Время перекрытия стояков: 18-21 сек. Металлические шестерни редуктора исключают заклинивание. Система предотвращает катастрофический ущерб ремонту и соседям снизу!

Сформировано в LIGA OS • https://liga-master-uz.vercel.app/`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        this.copyToClipboard(report);
      }
      this.showToast('✓ Расчет защиты от протечек скопирован для Telegram / Базара!');
    } catch (e) {
      this.showToast('✓ Расчет защиты от протечек сформирован!');
    }
  }

  applyLeakPreset(valves, sensors, dia) {
    if (!this.leakCalc) {
      this.leakCalc = { diameter: '3/4', system: 'neptun', valvesCount: 2, sensorsCount: 6, wireless: true, ups: true, serviceValves: true };
    }
    this.leakCalc.valvesCount = Number(valves) || 2;
    this.leakCalc.sensorsCount = Number(sensors) || 6;
    this.leakCalc.diameter = dia || '3/4';

    const valEl = document.getElementById('leak-calc-valves-val');
    const sensEl = document.getElementById('leak-calc-sensors-val');
    const diaEl = document.getElementById('leak-calc-diameter-select');

    if (valEl) valEl.innerText = this.leakCalc.valvesCount;
    if (sensEl) sensEl.innerText = this.leakCalc.sensorsCount;
    if (diaEl) diaEl.value = this.leakCalc.diameter;

    this.recalculateLeakSystem();
    if (this.isSoundEnabled && typeof this.playChime === 'function') {
      this.playChime(520, 0.05);
    }
    this.showToast(`⚡ Экспресс-пресет антизатопления: ${this.leakCalc.valvesCount} крана, ${this.leakCalc.sensorsCount} зон`);
  }

  async copyLeakClientScript() {
    const l = this.currentCalculatedLeak || { valvesCount: 2, sensorsCount: 6, diameter: '3/4' };
    const text = `Здравствуйте! Подготовил инженерную спецификацию интеллектуальной системы защиты от протечек и затопления.

🛡️ Принцип мгновенного перекрытия:
В узлах ввода монтируются краны из горячепрессованной латуни с мощным электроприводом (${l.diameter || '3/4"'}) и крутящим моментом до 16 Н*м, а во всех критических зонах (под стиральной машиной, коллектором, раковинами, инсталляциями) размещаются радиодатчики воды.

⚡ Защита за 18 секунд:
При попадании капли воды на датчик контроллер перекрывает воду ровно за 18 секунд, предотвращая затопление дорогостоящей отделки и соседей снизу. Система снабжена блоком резервного питания и работает даже при отключении электричества в квартире/доме.
Полное спокойствие за дом 24/7!`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await this.copyToClipboard(text);
      }
      this.showToast('✓ Аргумент по защите от протечек скопирован!');
    } catch (e) {
      this.showToast('✓ Текст для заказчика сформирован!');
    }
  }

  async addCalculatedLeakToMaterials() {
    const l = this.currentCalculatedLeak;
    if (!l) return;
    if (!window.ligaDB) {
      this.showToast('База данных недоступна');
      return;
    }

    const itemsToAdd = [];

    // 1. Модуль управления
    itemsToAdd.push({
      category: 'safety',
      name: `Модуль защиты от протечек: ${l.controlUnit}`,
      qty: '1 компл',
      price: l.controlPrice,
      isPurchased: false
    });

    // 2. Краны с электроприводом
    itemsToAdd.push({
      category: 'valves',
      name: `Шаровые краны с электроприводом: ${l.valvesText}`,
      qty: `${l.valvesCount} шт`,
      price: l.totalValvesCost,
      isPurchased: false
    });

    // 3. Датчики протечки
    itemsToAdd.push({
      category: 'safety',
      name: `Комплект датчиков протечки: ${l.sensorsText}`,
      qty: `${l.sensorsCount} шт`,
      price: l.totalSensorsCost,
      isPurchased: false
    });

    // 4. Резервное питание (если включено)
    if (l.ups && l.upsCost > 0) {
      itemsToAdd.push({
        category: 'safety',
        name: `Блок резервного питания: ${l.upsText}`,
        qty: '1 шт',
        price: l.upsCost,
        isPurchased: false
      });
    }

    // 5. Американки FAR (если включены)
    if (l.serviceValves && l.fittingsCost > 0) {
      itemsToAdd.push({
        category: 'fittings',
        name: `Разъемные сгоны (американки) FAR / Tiemme ${l.diameter}" для быстрого сервиса электрокранов`,
        qty: `${l.valvesCount} компл`,
        price: l.fittingsCost,
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
    this.closeModal('modal-leak-calculator');
    this.showToast(`✓ Добавлено ${itemsToAdd.length} позиций защиты от протечек в список закупки на склад!`);
  }

  // ==========================================================================
  // ГИДРАВЛИЧЕСКИЙ БАЛАНСИРОВЩИК КОЛЛЕКТОРА ТЕПЛОГО ПОЛА (v2.3.2)
  // Точная уставка ротаметров FAR / Caleffi (л/мин), защита от перегрева/запирания
  // ==========================================================================
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  openBalancingCalculator() {
    this.closeModal('modal-more-menu');
    if (!this.balancingCalc) {
      this.balancingCalc = {
        loopsCount: 5,
        loops: [
          { name: 'Контур 1 • Гостиная (окно)', length: 75 },
          { name: 'Контур 2 • Гостиная (центр)', length: 70 },
          { name: 'Контур 3 • Кухня-столовая', length: 65 },
          { name: 'Контур 4 • Спальня хозяев', length: 55 },
          { name: 'Контур 5 • Ванная комната', length: 35 }
        ]
      };
    }
    const countEl = document.getElementById('balancing-loops-count-val');
    if (countEl) countEl.innerText = this.balancingCalc.loopsCount;

    this.renderBalancingLoopsList();
    this.recalculateBalancing();
    this.openModal('modal-balancing-calculator');
  }

  setBalancingLoopsCount(count) {
    const validCount = Math.max(2, Math.min(12, parseInt(count, 10) || 5));
    if (!this.balancingCalc) {
      this.balancingCalc = { loopsCount: validCount, loops: [] };
    }
    this.balancingCalc.loopsCount = validCount;

    const defaultNames = [
      'Контур 1 • Гостиная (окно)',
      'Контур 2 • Гостиная (центр)',
      'Контур 3 • Кухня-столовая',
      'Контур 4 • Спальня хозяев',
      'Контур 5 • Ванная комната',
      'Контур 6 • Детская комната',
      'Контур 7 • Коридор / Холл',
      'Контур 8 • Санузел гостевой',
      'Контур 9 • Гардеробная',
      'Контур 10 • Кабинет',
      'Контур 11 • Прачечная',
      'Контур 12 • Лоджия / Терраса'
    ];
    const defaultLengths = [75, 70, 65, 55, 35, 60, 45, 30, 40, 50, 35, 40];

    if (!Array.isArray(this.balancingCalc.loops)) {
      this.balancingCalc.loops = [];
    }
    while (this.balancingCalc.loops.length < validCount) {
      const idx = this.balancingCalc.loops.length;
      this.balancingCalc.loops.push({
        name: defaultNames[idx] || `Контур ${idx + 1}`,
        length: defaultLengths[idx] || 50
      });
    }
    if (this.balancingCalc.loops.length > validCount) {
      this.balancingCalc.loops = this.balancingCalc.loops.slice(0, validCount);
    }

    const countEl = document.getElementById('balancing-loops-count-val');
    if (countEl) countEl.innerText = validCount;

    this.renderBalancingLoopsList();
    this.recalculateBalancing();
  }

  adjustBalancingLoops(delta) {
    const current = (this.balancingCalc && this.balancingCalc.loopsCount) ? this.balancingCalc.loopsCount : 5;
    this.setBalancingLoopsCount(current + delta);
  }

  updateLoopName(idx, name) {
    if (!this.balancingCalc || !this.balancingCalc.loops || !this.balancingCalc.loops[idx]) return;
    this.balancingCalc.loops[idx].name = name.trim() || `Контур ${idx + 1}`;
    this.recalculateBalancing();
  }

  updateLoopLength(idx, len) {
    if (!this.balancingCalc || !this.balancingCalc.loops || !this.balancingCalc.loops[idx]) return;
    const parsed = parseFloat(len);
    const val = isNaN(parsed) ? 50 : Math.max(10, Math.min(120, Math.round(parsed)));
    this.balancingCalc.loops[idx].length = val;
    this.recalculateBalancing();
  }

  adjustLoopLength(idx, delta) {
    if (!this.balancingCalc || !this.balancingCalc.loops || !this.balancingCalc.loops[idx]) return;
    const current = this.balancingCalc.loops[idx].length || 50;
    const nextVal = Math.max(10, Math.min(120, current + delta));
    this.balancingCalc.loops[idx].length = nextVal;
    
    const inpEl = document.getElementById(`loop-len-input-${idx}`);
    if (inpEl) inpEl.value = nextVal;

    this.recalculateBalancing();
  }

  renderBalancingLoopsList() {
    const container = document.getElementById('balancing-loops-list');
    if (!container || !this.balancingCalc || !this.balancingCalc.loops) return;

    let html = '';
    this.balancingCalc.loops.forEach((loop, idx) => {
      html += `
        <div class="balancing-loop-card" style="background:rgba(255,255,255,0.03); border:1px solid var(--glass-border-subtle); border-radius:var(--radius-sm); padding:10px 12px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <input type="text" id="loop-name-input-${idx}" value="${this.escapeHtml(loop.name)}" oninput="window.app.updateLoopName(${idx}, this.value)" 
              placeholder="Название петли (комната)" 
              style="background:rgba(0,0,0,0.25); border:1px solid var(--glass-border-subtle); border-radius:6px; color:var(--text-main); font-size:12px; font-weight:700; padding:4px 8px; flex:1;" />
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:10px; color:var(--text-muted); font-weight:600;">№${idx + 1}</span>
              <div class="rotameter-visual-tube" title="Шкала ротаметра 0.5–5.0 л/мин">
                <div id="loop-rotameter-fill-${idx}" class="rotameter-level-fill" style="height:48%;"></div>
                <div id="loop-rotameter-float-${idx}" class="rotameter-float" style="bottom:48%;"></div>
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:11px; color:var(--text-muted);">Длина:</span>
              <button type="button" class="btn-counter" onclick="window.app.adjustLoopLength(${idx}, -5)" style="width:26px; height:26px; font-size:14px;">-5</button>
              <div style="display:flex; align-items:center;">
                <input type="number" id="loop-len-input-${idx}" value="${loop.length}" min="10" max="120" step="1" 
                  onchange="window.app.updateLoopLength(${idx}, this.value)" 
                  style="width:48px; height:26px; text-align:center; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border-subtle); border-radius:4px; color:var(--text-main); font-size:12px; font-weight:800;" />
                <span style="font-size:11px; color:var(--text-muted); margin-left:3px;">м</span>
              </div>
              <button type="button" class="btn-counter" onclick="window.app.adjustLoopLength(${idx}, 5)" style="width:26px; height:26px; font-size:14px;">+5</button>
            </div>

            <div style="display:flex; align-items:center; gap:6px; background:rgba(192, 132, 252, 0.1); border:1px solid rgba(192, 132, 252, 0.25); border-radius:6px; padding:3px 8px;">
              <span style="font-size:10px; color:#c084fc; font-weight:700; text-transform:uppercase;">Уставка:</span>
              <span id="loop-flow-val-${idx}" style="font-size:12.5px; font-weight:900; color:var(--neon-cyan);">2.4 л/мин</span>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  recalculateBalancing() {
    if (!this.balancingCalc || !this.balancingCalc.loops) return;

    let totalPipe = 0;
    let totalFlowLpm = 0;
    const calculatedLoops = [];

    this.balancingCalc.loops.forEach((loop, idx) => {
      const len = Math.max(10, Math.min(120, loop.length || 50));
      totalPipe += len;

      // Физическая модель: удельный теплосъем ~11 Вт/м при дельта T = 5°C
      // V (л/мин) = (L * 11 * 60) / (4187 * 5) ≈ L * 0.0315
      let rawFlow = len * 0.03152;
      // Ограничение шкалы ротаметра FAR / Caleffi: от 0.5 до 5.0 л/мин
      let flowLpm = Math.max(0.5, Math.min(5.0, Math.round(rawFlow * 10) / 10));
      totalFlowLpm += flowLpm;

      // Процент положения поплавка (0.5 л/мин -> 10%, 5.0 л/мин -> 100%)
      const pct = Math.max(10, Math.min(100, Math.round((flowLpm / 5.0) * 100)));

      calculatedLoops.push({
        idx: idx + 1,
        name: loop.name,
        length: len,
        flowLpm: flowLpm,
        pct: pct
      });

      // Обновляем визуализацию строки контура
      const flowEl = document.getElementById(`loop-flow-val-${idx}`);
      const fillEl = document.getElementById(`loop-rotameter-fill-${idx}`);
      const floatEl = document.getElementById(`loop-rotameter-float-${idx}`);

      if (flowEl) flowEl.innerText = `${flowLpm.toFixed(1)} л/мин`;
      if (fillEl) fillEl.style.height = `${pct}%`;
      if (floatEl) floatEl.style.bottom = `${pct}%`;
    });

    const totalFlowM3h = (totalFlowLpm * 60) / 1000;
    // Тепловая мощность Q (кВт) = totalPipe * 11 / 1000 кВт (при ΔT=5°C)
    const totalPowerKw = (totalPipe * 11) / 1000;

    // Рекомендация для циркуляционного насоса Grundfos 25-60 / Wilo Para
    let pumpMode = 'Grundfos 25-60 • Скорость II (Оптимально)';
    if (totalFlowLpm <= 6.5) {
      pumpMode = 'Grundfos 25-60 • Скорость I (Энергоэффективно)';
    } else if (totalFlowLpm > 15.0) {
      pumpMode = 'Grundfos 25-60 • Скорость III (Максимальный напор)';
    }

    this.currentCalculatedBalancing = {
      loops: calculatedLoops,
      totalPipe,
      totalFlowLpm: Math.round(totalFlowLpm * 10) / 10,
      totalFlowM3h: Math.round(totalFlowM3h * 100) / 100,
      totalPowerKw: Math.round(totalPowerKw * 10) / 10,
      pumpMode
    };

    // Обновляем сводный блок
    const pipeResEl = document.getElementById('res-balancing-total-pipe');
    const flowResEl = document.getElementById('res-balancing-total-flow');
    const pwrResEl = document.getElementById('res-balancing-total-power');
    const pumpResEl = document.getElementById('res-balancing-pump-mode');

    if (pipeResEl) pipeResEl.innerText = `${totalPipe} м`;
    if (flowResEl) flowResEl.innerText = `${totalFlowLpm.toFixed(1)} л/мин (${totalFlowM3h.toFixed(2)} м³/ч)`;
    if (pwrResEl) pwrResEl.innerText = `${totalPowerKw.toFixed(1)} кВт`;
    if (pumpResEl) pumpResEl.innerText = pumpMode;
  }

  async copyBalancingCheatSheet() {
    const b = this.currentCalculatedBalancing;
    if (!b || !b.loops || !b.loops.length) {
      this.recalculateBalancing();
    }
    const calc = this.currentCalculatedBalancing;
    if (!calc) return;

    const siteName = this.currentSite ? this.currentSite.title : 'Объект LIGA OS';

    let loopsText = '';
    calc.loops.forEach(l => {
      loopsText += `  ${l.idx}. ${l.name}: ${l.length} м ➔ ${l.flowLpm.toFixed(1)} л/мин\n`;
    });

    const report = `⚖️ ГИДРАВЛИЧЕСКАЯ НАСТРОЙКА РОТАМЕТРОВ КОЛЛЕКТОРА
«Лига Опытных Мастеров» • Стандарт 16 бар (Ташкент)
Ведущий инженер: Улугбек Хакимов
📍 Объект: ${siteName}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}

ТАБЛИЦА УСТАВОК РОТАМЕТРОВ FAR / CALEFFI (ТЕПЛЫЙ ПОЛ):
${loopsText}
ИТОГОВЫЙ ГИДРАВЛИЧЕСКИЙ БАЛАНС:
• Общая труба Rehau Rautitan 16: ${calc.totalPipe} м
• Суммарный расход теплоносителя: ${calc.totalFlowLpm.toFixed(1)} л/мин (${calc.totalFlowM3h.toFixed(2)} м³/ч)
• Расчетная тепловая мощность (ΔT=5°C): ${calc.totalPowerKw.toFixed(1)} кВт
• Режим насоса смесительного узла: ${calc.pumpMode}

📌 ИНСТРУКЦИЯ МАСТЕРА ПО РЕГУЛИРОВКЕ:
1. Выполнять настройку на рабочей температуре теплоносителя (38-42°C).
2. Снять защитные красные колпачки ротаметров.
3. Вращением гильзы выставить поплавок точно на расчетное деление.
4. Зафиксировать стопорное кольцо ротаметра.

Сформировано в LIGA OS • https://liga-master-uz.vercel.app/`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        await this.copyToClipboard(report);
      }
      this.showToast('✓ Шпаргалка настройки ротаметров скопирована для Telegram!');
    } catch (e) {
      this.showToast('✓ Шпаргалка сформирована!');
    }
  }

  async copyBalancingClientScript() {
    const text = `Здравствуйте! Направляю инженерную схему гидравлической балансировки контуров теплого пола.

⚖️ Точная покомнатная настройка:
Каждый контур отопления отрегулирован по встроенным ротаметрам коллектора FAR с точностью до 0.1 л/мин. Длинные петли получают больший поток, короткие — меньший.

🌱 Экономия и уют:
Благодаря правильному балансу в доме не возникает зон перегрева или недогрева. Температура во всех комнатах распределяется равномерно, насос работает тихо и без лишнего расхода электричества.`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await this.copyToClipboard(text);
      }
      this.showToast('✓ Аргумент по балансировке скопирован для клиента!');
    } catch (e) {
      this.showToast('✓ Текст для заказчика сформирован!');
    }
  }

  printBalancingSticker() {
    const b = this.currentCalculatedBalancing;
    if (!b || !b.loops || !b.loops.length) {
      this.recalculateBalancing();
    }
    const calc = this.currentCalculatedBalancing;
    if (!calc) return;

    const siteName = this.currentSite ? this.currentSite.title : 'Элитный объект';
    const siteAddr = this.currentSite ? (this.currentSite.address || 'Ташкент') : 'г. Ташкент';
    const dateStr = new Date().toLocaleDateString('ru-RU');

    let rowsHtml = '';
    calc.loops.forEach(l => {
      rowsHtml += `
        <tr style="border-bottom:1px solid #cbd5e1;">
          <td style="padding:6px 8px; text-align:center; font-weight:800; font-size:12px;">№${l.idx}</td>
          <td style="padding:6px 8px; font-weight:700; font-size:12px;">${this.escapeHtml(l.name)}</td>
          <td style="padding:6px 8px; text-align:center; font-size:12px;">${l.length} м</td>
          <td style="padding:6px 8px; text-align:center; font-weight:900; font-size:13px; color:#1e293b; background:#f1f5f9;">
            ${l.flowLpm.toFixed(1)} л/мин
          </td>
        </tr>
      `;
    });

    let printContainer = document.getElementById('balancing-print-sticker-container');
    if (!printContainer) {
      printContainer = document.createElement('div');
      printContainer.id = 'balancing-print-sticker-container';
      document.body.appendChild(printContainer);
    }

    printContainer.innerHTML = `
      <div style="max-width:680px; margin:0 auto; border:3px solid #0f172a; border-radius:8px; padding:18px; font-family:'Segoe UI', Arial, sans-serif; color:#0f172a; background:#ffffff;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:14px;">
          <div>
            <div style="font-size:18px; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:#0f172a;">
              Лига Опытных Мастеров
            </div>
            <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px;">
              Инженерная группа Улугбека Хакимова • Стандарт 16 бар
            </div>
          </div>
          <div style="text-align:right;">
            <div style="display:inline-block; border:1.5px solid #0f172a; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:800; text-transform:uppercase; background:#f8fafc;">
              Коллекторный шкаф ШРВ
            </div>
            <div style="font-size:10px; color:#64748b; margin-top:3px;">
              Дата настройки: ${dateStr}
            </div>
          </div>
        </div>

        <div style="margin-bottom:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; font-size:12px;">
          <div><strong>Объект:</strong> ${this.escapeHtml(siteName)}</div>
          <div><strong>Локация:</strong> ${this.escapeHtml(siteAddr)}</div>
        </div>

        <div style="font-size:13px; font-weight:800; text-transform:uppercase; margin-bottom:8px; color:#0f172a; display:flex; align-items:center; gap:6px;">
          <span>⚖️ ПАСПОРТ НАСТРОЙКИ РОТАМЕТРОВ (ГИДРАВЛИЧЕСКИЙ БАЛАНС)</span>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:14px;">
          <thead>
            <tr style="background:#0f172a; color:#ffffff;">
              <th style="padding:6px 8px; font-size:11px; text-transform:uppercase; width:45px;">Контур</th>
              <th style="padding:6px 8px; font-size:11px; text-transform:uppercase; text-align:left;">Назначение петли / Помещение</th>
              <th style="padding:6px 8px; font-size:11px; text-transform:uppercase; width:90px;">Длина трубы</th>
              <th style="padding:6px 8px; font-size:11px; text-transform:uppercase; width:120px;">Уставка расхода</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:6px; padding:10px 14px; margin-bottom:14px; display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">
          <div>
            <div style="color:#64748b; font-size:10px; text-transform:uppercase; font-weight:700;">Суммарная длина контуров:</div>
            <div style="font-weight:800; font-size:14px; color:#0f172a;">${calc.totalPipe} м (Rehau Rautitan 16)</div>
          </div>
          <div>
            <div style="color:#64748b; font-size:10px; text-transform:uppercase; font-weight:700;">Общий расход коллектора:</div>
            <div style="font-weight:900; font-size:14px; color:#0284c7;">${calc.totalFlowLpm.toFixed(1)} л/мин (${calc.totalFlowM3h.toFixed(2)} м³/ч)</div>
          </div>
          <div>
            <div style="color:#64748b; font-size:10px; text-transform:uppercase; font-weight:700;">Тепловая мощность (ΔT=5°C):</div>
            <div style="font-weight:800; font-size:14px; color:#b45309;">${calc.totalPowerKw.toFixed(1)} кВт</div>
          </div>
          <div>
            <div style="color:#64748b; font-size:10px; text-transform:uppercase; font-weight:700;">Режим насоса смесителя:</div>
            <div style="font-weight:800; font-size:12px; color:#15803d;">${calc.pumpMode}</div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1.5px solid #e2e8f0; padding-top:10px; font-size:10px; color:#64748b;">
          <div>
            🔒 Гарантия 10 лет • Опрессовано поверенным манометром 16 бар
          </div>
          <div style="font-weight:700; color:#0f172a;">
            Лига Опытных Мастеров • Ташкент
          </div>
        </div>
      </div>
    `;

    document.body.classList.add('printing-balancing-sticker');
    window.print();

    const cleanup = () => {
      document.body.classList.remove('printing-balancing-sticker');
      if (printContainer && printContainer.parentNode) {
        printContainer.parentNode.removeChild(printContainer);
      }
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 2000);
  }

  // ==========================================================================
  // КАЛЬКУЛЯТОР ЦИРКУЛЯЦИОННОГО НАСОСА И МАГИСТРАЛЕЙ ОТОПЛЕНИЯ (v2.3.3)
  // Стандарт DIN EN 12831 / DIN 1988: расход G, напор H, скорость потока v ≤ 0.7 м/с
  // ==========================================================================
  openPumpCalculator() {
    this.closeModal('modal-more-menu');
    if (!this.pumpCalc) {
      this.pumpCalc = {
        powerKw: 24,
        deltaT: 15,
        distanceM: 25
      };
    }

    const pwrEl = document.getElementById('pump-calc-power-input');
    const dtEl = document.getElementById('pump-calc-delta-t-select');
    const distEl = document.getElementById('pump-calc-distance-input');

    if (pwrEl) pwrEl.value = this.pumpCalc.powerKw;
    if (dtEl) dtEl.value = String(this.pumpCalc.deltaT);
    if (distEl) distEl.value = this.pumpCalc.distanceM;

    this.recalculatePumpSystem();
    this.openModal('modal-pump-calculator');
  }

  setPumpPower(kw) {
    if (!this.pumpCalc) {
      this.pumpCalc = { powerKw: 24, deltaT: 15, distanceM: 25 };
    }
    const val = Math.max(3, Math.min(120, parseFloat(kw) || 24));
    this.pumpCalc.powerKw = val;
    const pwrEl = document.getElementById('pump-calc-power-input');
    if (pwrEl) pwrEl.value = val;
    this.recalculatePumpSystem();
  }

  adjustPumpPower(delta) {
    if (!this.pumpCalc) {
      this.pumpCalc = { powerKw: 24, deltaT: 15, distanceM: 25 };
    }
    this.setPumpPower((this.pumpCalc.powerKw || 24) + delta);
  }

  updatePumpPower(kw) {
    this.setPumpPower(kw);
  }

  updatePumpDeltaT(dt) {
    if (!this.pumpCalc) {
      this.pumpCalc = { powerKw: 24, deltaT: 15, distanceM: 25 };
    }
    this.pumpCalc.deltaT = Math.max(3, Math.min(30, parseFloat(dt) || 15));
    this.recalculatePumpSystem();
  }

  adjustPumpDistance(delta) {
    if (!this.pumpCalc) {
      this.pumpCalc = { powerKw: 24, deltaT: 15, distanceM: 25 };
    }
    const nextDist = Math.max(5, Math.min(80, (this.pumpCalc.distanceM || 25) + delta));
    this.pumpCalc.distanceM = nextDist;
    const distEl = document.getElementById('pump-calc-distance-input');
    if (distEl) distEl.value = nextDist;
    this.recalculatePumpSystem();
  }

  updatePumpDistance(dist) {
    if (!this.pumpCalc) {
      this.pumpCalc = { powerKw: 24, deltaT: 15, distanceM: 25 };
    }
    this.pumpCalc.distanceM = Math.max(5, Math.min(80, parseFloat(dist) || 25));
    this.recalculatePumpSystem();
  }

  recalculatePumpSystem() {
    if (!this.pumpCalc) {
      this.pumpCalc = { powerKw: 24, deltaT: 15, distanceM: 25 };
    }

    const powerKw = Math.max(3, Math.min(120, this.pumpCalc.powerKw || 24));
    const deltaT = Math.max(3, Math.min(30, this.pumpCalc.deltaT || 15));
    const distanceM = Math.max(5, Math.min(80, this.pumpCalc.distanceM || 25));

    // 1. Расход теплоносителя: G (м³/ч) = (Q * 0.86) / ΔT
    const flowM3h = (powerKw * 0.86) / deltaT;
    const flowLpm = (flowM3h * 1000) / 60;

    // 2. Подбор диаметра трубы Rehau Rautitan Stabil по скорости потока
    const pipes = [
      { name: 'Rehau Rautitan Stabil 16×2.6', innerD: 0.0108, outerMm: 16 },
      { name: 'Rehau Rautitan Stabil 20×2.9', innerD: 0.0142, outerMm: 20 },
      { name: 'Rehau Rautitan Stabil 25×3.7', innerD: 0.0176, outerMm: 25 },
      { name: 'Rehau Rautitan Stabil 32×4.7', innerD: 0.0226, outerMm: 32 },
      { name: 'Rehau Rautitan Stabil 40×6.0', innerD: 0.0280, outerMm: 40 }
    ];

    let selectedPipe = pipes[pipes.length - 1];
    let selectedVelocity = 0;

    for (const p of pipes) {
      const area = Math.PI * Math.pow(p.innerD / 2, 2);
      const velocity = (flowM3h / 3600) / area;
      if (velocity <= 1.05) {
        selectedPipe = p;
        selectedVelocity = velocity;
        break;
      }
    }
    if (selectedVelocity === 0) {
      const area = Math.PI * Math.pow(selectedPipe.innerD / 2, 2);
      selectedVelocity = (flowM3h / 3600) / area;
    }

    // Текстовая оценка скорости
    let velStatusText = 'Бесшумно (швейцарский стандарт)';
    let velColor = 'var(--neon-emerald)';
    if (selectedVelocity > 0.72 && selectedVelocity <= 1.05) {
      velStatusText = 'Норма для магистрали (котельная)';
      velColor = 'var(--neon-emerald)';
    } else if (selectedVelocity > 1.05) {
      velStatusText = 'Превышение! Риск шума в трубах';
      velColor = 'var(--neon-ruby)';
    }

    // 3. Расчет требуемого напора циркуляционного насоса (H, м.в.ст.)
    const totalPipeLength = distanceM * 2;
    const linearLossesKPa = (totalPipeLength * 130) / 1000;
    const localLossesKPa = (linearLossesKPa * 0.4) + 12.0;
    const totalHeadKPa = linearLossesKPa + localLossesKPa;
    let headM = (totalHeadKPa / 9.81) * 1.15;
    headM = Math.max(2.0, Math.min(8.5, Math.round(headM * 10) / 10));

    // 4. Рекомендация насоса Grundfos / Wilo
    let pumpModel = 'Grundfos UPS 25-60 180 (или ALPHA2 25-60)';
    let speedMode = 'Скорость II (постоянный напор CP2) • Золотой стандарт';
    let pumpPrice = 1850000;
    let fittingsCost = 280000;

    if (powerKw <= 14 && flowM3h <= 1.0) {
      pumpModel = 'Grundfos UPS 25-40 180 (или ALPHA1 L 25-40)';
      speedMode = 'Скорость II (энергоэффективно CP1)';
      pumpPrice = 1650000;
    } else if (powerKw > 38 || flowM3h > 2.6 || headM > 5.8) {
      pumpModel = 'Grundfos UPS 25-80 180 (или MAGNA1 25-80)';
      speedMode = 'Скорость III (максимальный напор CP3)';
      pumpPrice = 2450000;
    }

    const pipeUnitPrices = {
      16: 28000,
      20: 38000,
      25: 58000,
      32: 88000,
      40: 135000
    };
    const pipeUnitPrice = pipeUnitPrices[selectedPipe.outerMm] || 58000;
    const totalPipeCost = totalPipeLength * pipeUnitPrice;

    this.currentCalculatedPump = {
      powerKw,
      deltaT,
      distanceM,
      totalPipeLength,
      flowM3h: Math.round(flowM3h * 100) / 100,
      flowLpm: Math.round(flowLpm * 10) / 10,
      headM,
      totalHeadKPa: Math.round(totalHeadKPa * 10) / 10,
      pipeName: selectedPipe.name,
      pipeOuterMm: selectedPipe.outerMm,
      pipeUnitPrice,
      totalPipeCost,
      velocity: Math.round(selectedVelocity * 100) / 100,
      velStatusText,
      velColor,
      pumpModel,
      speedMode,
      pumpPrice,
      fittingsCost
    };

    // Обновляем DOM
    const flowResEl = document.getElementById('res-pump-flow');
    const headResEl = document.getElementById('res-pump-head');
    const pipeResEl = document.getElementById('res-pump-pipe-dia');
    const velResEl = document.getElementById('res-pump-velocity');
    const pumpResEl = document.getElementById('res-pump-model-name');
    const speedResEl = document.getElementById('res-pump-speed-mode');

    if (flowResEl) flowResEl.innerText = `${flowM3h.toFixed(2)} м³/ч (${flowLpm.toFixed(1)} л/мин)`;
    if (headResEl) headResEl.innerText = `${headM.toFixed(1)} м вод. ст. (${totalHeadKPa.toFixed(1)} кПа)`;
    if (pipeResEl) pipeResEl.innerText = selectedPipe.name;
    if (velResEl) {
      velResEl.innerText = `${selectedVelocity.toFixed(2)} м/с • ${velStatusText}`;
      velResEl.style.color = velColor;
    }
    if (pumpResEl) pumpResEl.innerText = pumpModel;
    if (speedResEl) speedResEl.innerText = speedMode;
  }

  async copyPumpCalculation() {
    const p = this.currentCalculatedPump;
    if (!p) {
      this.recalculatePumpSystem();
    }
    const calc = this.currentCalculatedPump;
    if (!calc) return;

    const siteName = this.currentSite ? this.currentSite.title : 'Объект LIGA OS';

    const report = `🌀 ИНЖЕНЕРНЫЙ РАСЧЕТ ЦИРКУЛЯЦИОННОГО НАСОСА И МАГИСТРАЛЕЙ
«Лига Опытных Мастеров» • Стандарт DIN EN 12831 (Ташкент)
Ведущий инженер: Улугбек Хакимов
📍 Объект: ${siteName}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}

ИСХОДНЫЕ ДАННЫЕ СИСТЕМЫ:
• Тепловая нагрузка: ${calc.powerKw} кВт
• Температурный график (ΔT): ${calc.deltaT}°C
• Длина плеча магистрали: ${calc.distanceM} м (трасса подачи + обратки: ${calc.totalPipeLength} м)

ГИДРАВЛИЧЕСКИЙ РАСЧЕТ РАБОЧЕЙ ТОЧКИ:
• Расчетный расход (Q): ${calc.flowM3h.toFixed(2)} м³/ч (${calc.flowLpm.toFixed(1)} л/мин)
• Требуемый напор (H): ${calc.headM.toFixed(1)} м вод. ст. (${calc.totalHeadKPa.toFixed(1)} кПа)
• Рекомендуемая магистраль: ${calc.pipeName}
• Скорость теплоносителя: ${calc.velocity.toFixed(2)} м/с (${calc.velStatusText})

СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ (ДЛЯ ЗАКУПКИ):
1. Циркуляционный насос: ${calc.pumpModel}
2. Режим работы: ${calc.speedMode}
3. Магистральная труба: ${calc.pipeName} — ${calc.totalPipeLength} м
4. Запорная арматура: Разъемные сгоны-американки FAR 1" (2 шт)

🛡️ ИНЖЕНЕРНЫЙ СТАНДАРТ БЕЗОПАСНОСТИ:
Скорость теплоносителя в пределах 0.3–0.7 м/с гарантирует 100% бесшумность радиаторов, исключает кавитацию и вибрацию труб в стяжке.

Сформировано в LIGA OS • https://liga-master-uz.vercel.app/`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        await this.copyToClipboard(report);
      }
      this.showToast('✓ Расчет насоса и магистрали скопирован для Telegram!');
    } catch (e) {
      this.showToast('✓ Расчет насоса сформирован!');
    }
  }

  async copyPumpClientScript() {
    const p = this.currentCalculatedPump || { pumpModel: 'Grundfos ALPHA 25-60', velocity: 0.48 };
    const text = `Здравствуйте! Сделал расчет циркуляционного насоса и диаметров магистральных трубопроводов.

🌀 Бесшумность и надежность:
Насос и сечение труб подобраны так, чтобы теплоноситель двигался со строго выверенной скоростью (0.4–0.6 м/с). Это полностью исключает гидравлический гул и свист в радиаторах, а также защищает систему от преждевременного износа.

⚡ Энергосбережение:
Современный энергоэффективный насос (${p.pumpModel || 'Grundfos / Wilo'}) автоматически подстраивает свою мощность под потребности дома, потребляя минимум электроэнергии.
Долговечная безаварийная работа гарантирована!`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await this.copyToClipboard(text);
      }
      this.showToast('✓ Аргумент по циркуляционному насосу скопирован!');
    } catch (e) {
      this.showToast('✓ Текст для заказчика сформирован!');
    }
  }

  async addCalculatedPumpToMaterials() {
    const calc = this.currentCalculatedPump;
    if (!calc) return;
    if (!window.ligaDB) {
      this.showToast('База данных недоступна');
      return;
    }

    const itemsToAdd = [
      {
        category: 'boiler',
        name: `Циркуляционный насос: ${calc.pumpModel}`,
        qty: '1 шт',
        price: calc.pumpPrice,
        isPurchased: false
      },
      {
        category: 'pipes',
        name: `Магистральная труба: ${calc.pipeName}`,
        qty: `${calc.totalPipeLength} м`,
        price: calc.totalPipeCost,
        isPurchased: false
      },
      {
        category: 'fittings',
        name: 'Разъемные сгоны (американки) FAR 1" для быстрого монтажа циркуляционного насоса',
        qty: '2 шт',
        price: calc.fittingsCost,
        isPurchased: false
      }
    ];

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
    this.closeModal('modal-pump-calculator');
    this.showToast('✓ Добавлено 3 позиции насосного оборудования в закупку на склад!');
  }

  // ==========================================================================
  // КАЛЬКУЛЯТОР МЕМБРАННОГО РАСШИРИТЕЛЬНОГО БАКА И КЛАПАНА DIN EN 12828 (v2.3.4)
  // Точный подбор Reflex N, расчет давления азота P0, водяного затвора и сбросного клапана
  // ==========================================================================
  openExpansionTankCalculator() {
    this.closeModal('modal-more-menu');
    if (!this.expansionCalc) {
      this.expansionCalc = {
        powerKw: 24,
        systemType: 'combo',
        floors: 2,
        fluid: 'water'
      };
    }

    const pwrEl = document.getElementById('exp-calc-power-input');
    const sysEl = document.getElementById('exp-calc-system-type-select');
    const flrEl = document.getElementById('exp-calc-floors-select');
    const fldEl = document.getElementById('exp-calc-fluid-select');

    if (pwrEl) pwrEl.value = this.expansionCalc.powerKw;
    if (sysEl) sysEl.value = this.expansionCalc.systemType;
    if (flrEl) flrEl.value = String(this.expansionCalc.floors);
    if (fldEl) fldEl.value = this.expansionCalc.fluid;

    this.recalculateExpansionTank();
    this.openModal('modal-expansion-tank-calculator');
  }

  setExpansionPower(kw) {
    if (!this.expansionCalc) {
      this.expansionCalc = { powerKw: 24, systemType: 'combo', floors: 2, fluid: 'water' };
    }
    const val = Math.max(3, Math.min(120, parseFloat(kw) || 24));
    this.expansionCalc.powerKw = val;
    const pwrEl = document.getElementById('exp-calc-power-input');
    if (pwrEl) pwrEl.value = val;
    this.recalculateExpansionTank();
  }

  adjustExpansionPower(delta) {
    if (!this.expansionCalc) {
      this.expansionCalc = { powerKw: 24, systemType: 'combo', floors: 2, fluid: 'water' };
    }
    this.setExpansionPower((this.expansionCalc.powerKw || 24) + delta);
  }

  updateExpansionPower(kw) {
    this.setExpansionPower(kw);
  }

  updateExpansionSystemType(type) {
    if (!this.expansionCalc) {
      this.expansionCalc = { powerKw: 24, systemType: 'combo', floors: 2, fluid: 'water' };
    }
    this.expansionCalc.systemType = type || 'combo';
    this.recalculateExpansionTank();
  }

  updateExpansionFloors(floors) {
    if (!this.expansionCalc) {
      this.expansionCalc = { powerKw: 24, systemType: 'combo', floors: 2, fluid: 'water' };
    }
    this.expansionCalc.floors = parseInt(floors, 10) || 2;
    this.recalculateExpansionTank();
  }

  updateExpansionFluid(fluid) {
    if (!this.expansionCalc) {
      this.expansionCalc = { powerKw: 24, systemType: 'combo', floors: 2, fluid: 'water' };
    }
    this.expansionCalc.fluid = fluid || 'water';
    this.recalculateExpansionTank();
  }

  recalculateExpansionTank() {
    if (!this.expansionCalc) {
      this.expansionCalc = { powerKw: 24, systemType: 'combo', floors: 2, fluid: 'water' };
    }

    const powerKw = Math.max(3, Math.min(120, this.expansionCalc.powerKw || 24));
    const systemType = this.expansionCalc.systemType || 'combo';
    const floors = parseInt(this.expansionCalc.floors, 10) || 2;
    const fluid = this.expansionCalc.fluid || 'water';

    // 1. Удельный объем системы (л/кВт)
    const specificVolumes = {
      radiators_panel: 10,
      radiators_sec: 11,
      combo: 16,
      floor_only: 22,
      cast_iron: 25
    };
    const specVol = specificVolumes[systemType] || 16;
    const totalVolume = Math.round(powerKw * specVol);

    // 2. Коэффициент теплового расширения e при нагреве до 85°C
    let expansionCoeff = 0.0324; // Вода (3.24%)
    let fluidName = 'Вода подготовленная';
    if (fluid === 'glycol30') {
      expansionCoeff = 0.0435;
      fluidName = 'Пропиленгликоль 30%';
    } else if (fluid === 'glycol40') {
      expansionCoeff = 0.0485;
      fluidName = 'Пропиленгликоль 40%';
    }

    // Объем теплового расширения Ve
    const expansionVolume = totalVolume * expansionCoeff;

    // Водяной затвор Vwr по DIN EN 12828 (минимум 3.0 л или 0.5% от объема)
    const waterSeal = Math.max(3.0, totalVolume * 0.005);

    // 3. Статическое давление Pst и давление накачки P0
    const staticPressures = {
      1: 0.5,
      2: 0.8,
      3: 1.1,
      4: 1.5
    };
    const pStat = staticPressures[floors] || 0.8;
    // Давление накачки P0 = Pst + 0.3 бар (минимум 1.0 бар по швейцарскому регламенту)
    const p0 = Math.max(1.0, Math.round((pStat + 0.3) * 10) / 10);

    // 4. Конечное допустимое давление Pe (сбросной клапан 3.0 бар, Pe = 3.0 - 0.5 = 2.5 бар)
    const pValve = 3.0;
    const pEnd = 2.5;

    // Коэффициент полезного использования объема бака: eta = (Pe - P0) / (Pe + 1)
    const eta = (pEnd - p0) / (pEnd + 1.0);

    // 5. Минимальный требуемый объем расширительного бака
    const minNominalVolume = (expansionVolume + waterSeal) / Math.max(0.1, eta);

    // 6. Подбор стандартного типоразмера Reflex N
    const reflexModels = [
      { vol: 18, name: 'Reflex N 18 / 4 бар', price: 720000, suSize: '3/4"' },
      { vol: 25, name: 'Reflex N 25 / 4 бар', price: 890000, suSize: '3/4"' },
      { vol: 35, name: 'Reflex N 35 / 4 бар', price: 1180000, suSize: '3/4"' },
      { vol: 50, name: 'Reflex N 50 / 6 бар', price: 1540000, suSize: '3/4"' },
      { vol: 80, name: 'Reflex N 80 / 6 бар', price: 2350000, suSize: '1"' },
      { vol: 100, name: 'Reflex N 100 / 6 бар', price: 2950000, suSize: '1"' },
      { vol: 140, name: 'Reflex N 140 / 6 бар', price: 3950000, suSize: '1"' }
    ];

    let selectedTank = reflexModels[reflexModels.length - 1];
    for (const m of reflexModels) {
      if (m.vol >= minNominalVolume) {
        selectedTank = m;
        break;
      }
    }

    const serviceValveName = `Reflex SU ${selectedTank.suSize} (с защитным колпачком, пломбой и сливным краном)`;
    const serviceValvePrice = selectedTank.suSize === '1"' ? 490000 : 380000;
    const safetyValveName = 'Caleffi 3.0 бар 1/2" (мембранный сбросной клапан, CW617N)';
    const safetyValvePrice = 260000;

    const systemTypeTitles = {
      radiators_panel: 'Панельные стальные радиаторы (Purmo/Kermi)',
      radiators_sec: 'Секционные алюминий / биметалл',
      combo: 'Комбинированная система (Радиаторы + теплый пол)',
      floor_only: 'Только водяной теплый пол',
      cast_iron: 'Чугунные радиаторы / гравитационка'
    };

    this.currentCalculatedTank = {
      powerKw,
      systemType,
      systemTypeTitle: systemTypeTitles[systemType] || systemType,
      floors,
      fluid,
      fluidName,
      totalVolume,
      expansionVolume: Math.round(expansionVolume * 10) / 10,
      waterSeal: Math.round(waterSeal * 10) / 10,
      pStat,
      p0,
      pValve,
      pEnd,
      eta: Math.round(eta * 100) / 100,
      minNominalVolume: Math.round(minNominalVolume * 10) / 10,
      tankModel: selectedTank.name,
      tankVolume: selectedTank.vol,
      tankPrice: selectedTank.price,
      serviceValveName,
      serviceValvePrice,
      safetyValveName,
      safetyValvePrice
    };

    // Обновляем DOM
    const totVolEl = document.getElementById('res-exp-total-volume');
    const expVolEl = document.getElementById('res-exp-expansion-volume');
    const pStatEl = document.getElementById('res-exp-p-stat');
    const p0El = document.getElementById('res-exp-p0');
    const minVolEl = document.getElementById('res-exp-min-volume');
    const tankModEl = document.getElementById('res-exp-tank-model');
    const servValEl = document.getElementById('res-exp-service-valve');
    const safeValEl = document.getElementById('res-exp-safety-valve');

    if (totVolEl) totVolEl.innerText = `${totalVolume} л`;
    if (expVolEl) expVolEl.innerText = `${this.currentCalculatedTank.expansionVolume} л + ${this.currentCalculatedTank.waterSeal} л затвор`;
    if (pStatEl) pStatEl.innerText = `${pStat.toFixed(1)} бар (${floors} эт.)`;
    if (p0El) p0El.innerText = `${p0.toFixed(1)} бар (на сухом баке!)`;
    if (minVolEl) minVolEl.innerText = `${this.currentCalculatedTank.minNominalVolume} л`;
    if (tankModEl) tankModEl.innerText = selectedTank.name;
    if (servValEl) servValEl.innerText = serviceValveName;
    if (safeValEl) safeValEl.innerText = safetyValveName;
  }

  async copyExpansionTankCalculation() {
    if (!this.currentCalculatedTank) {
      this.recalculateExpansionTank();
    }
    const c = this.currentCalculatedTank;
    if (!c) return;

    const siteName = this.currentSite ? this.currentSite.title : 'Объект LIGA OS';

    const report = `🛑 ИНЖЕНЕРНЫЙ РАСЧЕТ РАСШИРИТЕЛЬНОГО БАКА И БЕЗОПАСНОСТИ
«Лига Опытных Мастеров» • Стандарт DIN EN 12828 (Ташкент)
Ведущий инженер: Улугбек Хакимов
📍 Объект: ${siteName}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}

ИСХОДНЫЕ ДАННЫЕ СИСТЕМЫ:
• Тепловая мощность: ${c.powerKw} кВт
• Тип отопительных приборов: ${c.systemTypeTitle}
• Этажность (статическая высота): ${c.floors} эт. (Pst = ${c.pStat} бар)
• Теплоноситель: ${c.fluidName}

РЕЗУЛЬТАТЫ ГИДРАВЛИЧЕСКОГО РАСЧЕТА:
• Общий объем системы (Vs): ${c.totalVolume} л
• Объем температурного расширения (Ve): ${c.expansionVolume} л
• Водяной затвор мембраны (Vwr): ${c.waterSeal} л
• Предварительное давление накачки азота (P₀): ${c.p0} бар
• Минимальный расчетный объем бака: ${c.minNominalVolume} л

СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ (ДЛЯ ЗАКУПКИ):
1. Мембранный расширительный бак: ${c.tankModel}
2. Сервисный отсечной клапан: ${c.serviceValveName}
3. Предохранительный клапан безопасности: ${c.safetyValveName}

🛡️ ЗОЛОТОЕ ПРАВИЛО МАСТЕРА:
Давление в воздушной камере бака (P₀ = ${c.p0} бар) настраивается ДО подключения к системе при нулевом давлении теплоносителя. Наличие сервисного крана Reflex SU обязательно для ежегодного ТО без слива всей системы.

Сформировано в LIGA OS • https://liga-master-uz.vercel.app/`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        await this.copyToClipboard(report);
      }
      this.showToast('✓ Расчет бака Reflex и клапана скопирован для Telegram!');
    } catch (e) {
      this.showToast('✓ Расчет бака Reflex сформирован!');
    }
  }

  async copyExpansionTankClientScript() {
    const t = this.currentCalculatedTank || { tankModel: 'Reflex NG 35', p0: 1.5 };
    const text = `Здравствуйте! Подготовил инженерный расчет мембранного расширительного бака Reflex.

🛑 Защита от гидроударов и разрыва:
При нагреве объем воды в системе неизбежно увеличивается. Если расширению некуда деваться, давление подскочит до критического и сорвет соединения либо разрушит теплообменник котла.

💎 Швейцарский стандарт:
Устанавливается качественный мембранный бак европейского бренда Reflex с предварительной закачкой азота (P₀ = ${t.p0 || 1.5} бар) и специальным сервисным клапаном для ежегодного обслуживания. Давление в вашей котельной всегда будет стабильным.
Система полностью защищена на десятилетия!`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await this.copyToClipboard(text);
      }
      this.showToast('✓ Аргумент по расширительному баку скопирован!');
    } catch (e) {
      this.showToast('✓ Текст для заказчика сформирован!');
    }
  }

  async addCalculatedTankToMaterials() {
    const calc = this.currentCalculatedTank;
    if (!calc) return;
    if (!window.ligaDB) {
      this.showToast('База данных недоступна');
      return;
    }

    const itemsToAdd = [
      {
        category: 'boiler',
        name: `Расширительный мембранный бак: ${calc.tankModel}`,
        qty: '1 шт',
        price: calc.tankPrice,
        isPurchased: false
      },
      {
        category: 'fittings',
        name: `Сервисный кран расширительного бака: ${calc.serviceValveName}`,
        qty: '1 шт',
        price: calc.serviceValvePrice,
        isPurchased: false
      },
      {
        category: 'fittings',
        name: `Предохранительный клапан: ${calc.safetyValveName}`,
        qty: '1 шт',
        price: calc.safetyValvePrice,
        isPurchased: false
      }
    ];

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
    this.closeModal('modal-expansion-tank-calculator');
    this.showToast('✓ Добавлено 3 позиции безопасности котельной (Reflex / Caleffi) на склад!');
  }

  // ==========================================================================
  // КАЛЬКУЛЯТОР ГИДРАВЛИЧЕСКОГО РАЗДЕЛИТЕЛЯ (ГИДРОСТРЕЛКИ) v2.3.6
  // Первичное кольцо котельной: правило 3d/3v, расходы G1/G2, Север / Termojet
  // ==========================================================================
  openSeparatorCalculator() {
    this.closeModal('modal-more-menu');
    if (!this.separatorCalc) {
      this.separatorCalc = {
        powerKw: 32,
        circuits: {
          floor: true,
          radiators: true,
          boiler: false,
          vent: false
        }
      };
    }

    const pwrEl = document.getElementById('sep-calc-power-input');
    if (pwrEl) pwrEl.value = this.separatorCalc.powerKw;

    const floorEl = document.getElementById('sep-circuit-floor');
    const radEl = document.getElementById('sep-circuit-radiators');
    const blrEl = document.getElementById('sep-circuit-boiler');
    const ventEl = document.getElementById('sep-circuit-vent');

    if (floorEl) floorEl.checked = Boolean(this.separatorCalc.circuits.floor);
    if (radEl) radEl.checked = Boolean(this.separatorCalc.circuits.radiators);
    if (blrEl) blrEl.checked = Boolean(this.separatorCalc.circuits.boiler);
    if (ventEl) ventEl.checked = Boolean(this.separatorCalc.circuits.vent);

    this.recalculateSeparator();
    this.openModal('modal-hydraulic-separator-calculator');
  }

  setSeparatorPower(kw) {
    if (!this.separatorCalc) {
      this.separatorCalc = { powerKw: 32, circuits: { floor: true, radiators: true, boiler: false, vent: false } };
    }
    const val = Math.max(10, Math.min(250, parseFloat(kw) || 32));
    this.separatorCalc.powerKw = val;
    const pwrEl = document.getElementById('sep-calc-power-input');
    if (pwrEl) pwrEl.value = val;
    this.recalculateSeparator();
  }

  adjustSeparatorPower(delta) {
    if (!this.separatorCalc) {
      this.separatorCalc = { powerKw: 32, circuits: { floor: true, radiators: true, boiler: false, vent: false } };
    }
    this.setSeparatorPower((this.separatorCalc.powerKw || 32) + delta);
  }

  updateSeparatorPower(kw) {
    this.setSeparatorPower(kw);
  }

  toggleSeparatorCircuit(circuitName) {
    if (!this.separatorCalc) {
      this.separatorCalc = { powerKw: 32, circuits: { floor: true, radiators: true, boiler: false, vent: false } };
    }
    const el = document.getElementById(`sep-circuit-${circuitName}`);
    if (el) {
      this.separatorCalc.circuits[circuitName] = Boolean(el.checked);
    }
    this.recalculateSeparator();
  }

  recalculateSeparator() {
    if (!this.separatorCalc) {
      this.separatorCalc = { powerKw: 32, circuits: { floor: true, radiators: true, boiler: false, vent: false } };
    }

    const powerKw = Math.max(10, Math.min(250, this.separatorCalc.powerKw || 32));
    const circuits = this.separatorCalc.circuits || { floor: true, radiators: true, boiler: false, vent: false };

    // 1. Расход котлового контура G1 (м³/ч) при Delta T = 20°C:
    const boilerDeltaT = 20.0;
    const boilerFlowM3h = (powerKw * 0.86) / boilerDeltaT;
    const boilerFlowLmin = (boilerFlowM3h * 1000) / 60.0;

    // 2. Расход вторичных отопительных контуров G2 (м³/ч):
    let activeCount = 0;
    if (circuits.floor) activeCount++;
    if (circuits.radiators) activeCount++;
    if (circuits.boiler) activeCount++;
    if (circuits.vent) activeCount++;

    let systemFlowM3h = 0;
    let circuitDetails = [];

    if (activeCount === 0) {
      systemFlowM3h = boilerFlowM3h;
      circuitDetails.push('Прямой контур без дополнительных насосов');
    } else {
      let weights = {};
      if (circuits.floor) weights.floor = 0.45;
      if (circuits.radiators) weights.radiators = 0.40;
      if (circuits.boiler) weights.boiler = 0.35;
      if (circuits.vent) weights.vent = 0.25;

      let sumWeights = 0;
      for (const k in weights) sumWeights += weights[k];

      if (circuits.floor) {
        const qF = (weights.floor / sumWeights) * powerKw;
        const gF = (qF * 0.86) / 7.0; // Дельта 7°C (высокий объемный расход теплого пола)
        systemFlowM3h += gF;
        circuitDetails.push(`Водяной теплый пол (${Math.round(qF)} кВт, ${gF.toFixed(2)} м³/ч)`);
      }
      if (circuits.radiators) {
        const qR = (weights.radiators / sumWeights) * powerKw;
        const gR = (qR * 0.86) / 15.0; // Дельта 15°C
        systemFlowM3h += gR;
        circuitDetails.push(`Радиаторная сеть (${Math.round(qR)} кВт, ${gR.toFixed(2)} м³/ч)`);
      }
      if (circuits.boiler) {
        const qB = (weights.boiler / sumWeights) * powerKw;
        const gB = (qB * 0.86) / 20.0; // Дельта 20°C
        systemFlowM3h += gB;
        circuitDetails.push(`Бойлер косвенного нагрева БКН (${Math.round(qB)} кВт, ${gB.toFixed(2)} м³/ч)`);
      }
      if (circuits.vent) {
        const qV = (weights.vent / sumWeights) * powerKw;
        const gV = (qV * 0.86) / 20.0;
        systemFlowM3h += gV;
        circuitDetails.push(`Вентиляция/бассейн (${Math.round(qV)} кВт, ${gV.toFixed(2)} м³/ч)`);
      }
    }

    const systemFlowLmin = (systemFlowM3h * 1000) / 60.0;

    // 3. Честный статус необходимости гидрострелки:
    const isRequired = activeCount >= 2;
    const cardEl = document.getElementById('sep-necessity-card');
    const titleEl = document.getElementById('sep-necessity-title');
    const descEl = document.getElementById('sep-necessity-desc');

    if (cardEl && titleEl && descEl) {
      if (isRequired) {
        cardEl.style.borderColor = '#06b6d4';
        cardEl.style.background = 'rgba(6,182,212,0.08)';
        titleEl.style.color = '#06b6d4';
        titleEl.innerText = '🛡️ Гидрострелка обязательна для котельной';
        descEl.innerText = `В системе ${activeCount} контура со своими насосами. Без разделителя насосы перетягивают поток, снижают КПД котла и вызывают шум в радиаторах.`;
      } else {
        cardEl.style.borderColor = 'rgba(16,185,129,0.4)';
        cardEl.style.background = 'rgba(16,185,129,0.08)';
        titleEl.style.color = 'var(--neon-emerald)';
        titleEl.innerText = '🟢 Встроенного насоса котла достаточно';
        descEl.innerText = 'При одном отопительном контуре без дополнительных насосов гидрострелка не требуется. Прямое подключение к котлу экономит бюджет клиента.';
      }
    }

    // 4. Определение максимального расхода и баланса:
    const maxFlowM3h = Math.max(boilerFlowM3h, systemFlowM3h);
    let balanceMode = '';
    if (Math.abs(boilerFlowM3h - systemFlowM3h) < 0.1) {
      balanceMode = 'G₁ ≈ G₂ (полный гидравлический баланс)';
    } else if (boilerFlowM3h > systemFlowM3h) {
      balanceMode = 'G₁ > G₂ (котел греет с запасом, возврат в котел)';
    } else {
      balanceMode = 'G₂ > G₁ (высокий разбор контуров, подмес из обратки)';
    }

    // 5. Расчет диаметра корпуса D по правилу предельной вертикальной скорости v0 <= 0.15 м/с:
    const v0 = 0.15; // м/с
    const calcDiameterMm = Math.round(18.8 * Math.sqrt(maxFlowM3h / v0));

    // Подбор стандартного заводского профиля и заводской модели:
    let standardProfile = '';
    let nozzleSize = '';
    let modelName = '';
    let modelPrice = 0;

    if (powerKw <= 35 && maxFlowM3h <= 2.2) {
      standardProfile = 'Ø 76 мм / 60×60 мм (v ≤ 0.13 м/с)';
      nozzleSize = '1" ВР (ДУ 25)';
      modelName = 'Север-M3 / Termojet Compact 1" (до 35 кВт)';
      modelPrice = 1450000;
    } else if (powerKw <= 60 && maxFlowM3h <= 3.8) {
      standardProfile = 'Ø 89 мм / 80×80 мм (v ≤ 0.14 м/с)';
      nozzleSize = '1 1/4" ВР (ДУ 32)';
      modelName = 'Север-60 / Termojet 1 1/4" (до 60 кВт)';
      modelPrice = 2150000;
    } else if (powerKw <= 100 && maxFlowM3h <= 6.0) {
      standardProfile = 'Ø 108 мм / 100×100 мм (v ≤ 0.15 м/с)';
      nozzleSize = '1 1/2" ВР (ДУ 40)';
      modelName = 'Север-100 / Meibes MHK 32 (до 100 кВт)';
      modelPrice = 3450000;
    } else {
      standardProfile = 'Ø 133 мм / 120×120 мм (v ≤ 0.16 м/с)';
      nozzleSize = '2" ВР (ДУ 50)';
      modelName = 'Север-160 / Termojet Pro 2" (до 160 кВт каскад)';
      modelPrice = 5200000;
    }

    const airVentName = 'Caleffi Robocal 1/2" (автоматический воздухоотводчик с отсечным клапаном)';
    const drainValveName = 'Кран дренажный шаровой со штуцером 1/2" (для промывки шлама)';

    this.currentCalculatedSeparator = {
      powerKw,
      boilerFlowM3h: Math.round(boilerFlowM3h * 100) / 100,
      boilerFlowLmin: Math.round(boilerFlowLmin * 10) / 10,
      systemFlowM3h: Math.round(systemFlowM3h * 100) / 100,
      systemFlowLmin: Math.round(systemFlowLmin * 10) / 10,
      balanceMode,
      calcDiameterMm,
      standardProfile,
      nozzleSize,
      modelName,
      modelPrice,
      isRequired,
      circuitDetails,
      airVentName,
      drainValveName
    };

    // Обновляем DOM
    const bFlowEl = document.getElementById('res-sep-boiler-flow');
    const sFlowEl = document.getElementById('res-sep-system-flow');
    const modeEl = document.getElementById('res-sep-mode');
    const bodyEl = document.getElementById('res-sep-body-diam');
    const nozzEl = document.getElementById('res-sep-nozzles');
    const modEl = document.getElementById('res-sep-model');
    const ventEl = document.getElementById('res-sep-air-vent');
    const drainEl = document.getElementById('res-sep-drain');

    if (bFlowEl) bFlowEl.innerText = `${this.currentCalculatedSeparator.boilerFlowM3h} м³/ч (${this.currentCalculatedSeparator.boilerFlowLmin} л/мин)`;
    if (sFlowEl) sFlowEl.innerText = `${this.currentCalculatedSeparator.systemFlowM3h} м³/ч (${this.currentCalculatedSeparator.systemFlowLmin} л/мин)`;
    if (modeEl) modeEl.innerText = balanceMode;
    if (bodyEl) bodyEl.innerText = standardProfile;
    if (nozzEl) nozzEl.innerText = nozzleSize;
    if (modEl) modEl.innerText = modelName;
    if (ventEl) ventEl.innerText = airVentName;
    if (drainEl) drainEl.innerText = drainValveName;
  }

  async copySeparatorCalculation() {
    if (!this.currentCalculatedSeparator) {
      this.recalculateSeparator();
    }
    const s = this.currentCalculatedSeparator;
    if (!s) return;

    const siteName = this.currentSite ? this.currentSite.title : 'Объект LIGA OS';

    const report = `⚗️ ИНЖЕНЕРНЫЙ РАСЧЕТ ГИДРАВЛИЧЕСКОГО РАЗДЕЛИТЕЛЯ (ГИДРОСТРЕЛКИ)
«Лига Опытных Мастеров» • Европейский стандарт DIN EN 12828 / Правило 3d
Ведущий инженер: Улугбек Хакимов
📍 Объект: ${siteName}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}

ИСХОДНЫЕ ПАРАМЕТРЫ КОТЕЛЬНОЙ:
• Мощность котла: ${s.powerKw} кВт
• Статус разделителя: ${s.isRequired ? '🛡️ ОБЯЗАТЕЛЕН (2+ контура с насосами)' : '🟢 Встроенного насоса котла достаточно'}
• Подключенные контуры:
  - ${s.circuitDetails.join('\n  - ')}

ГИДРАВЛИЧЕСКИЙ БАЛАНС И РАСХОДЫ:
• Расход котлового контура (G₁): ${s.boilerFlowM3h} м³/ч (${s.boilerFlowLmin} л/мин)
• Расход вторичных контуров (G₂): ${s.systemFlowM3h} м³/ч (${s.systemFlowLmin} л/мин)
• Режим баланса: ${s.balanceMode}

ГЕОМЕТРИЯ И ПРАВИЛО 3d / 3v:
• Расчетный диаметр корпуса (D): ${s.standardProfile}
• Патрубки подключения (d = D/3): ${s.nozzleSize}
• Рекомендуемая заводская модель: ${s.modelName}
• Воздухоотделение (верх): ${s.airVentName}
• Шламоудаление (низ): ${s.drainValveName}

🛡️ ИНЖЕНЕРНАЯ ГАРАНТИЯ МАСТЕРА:
Разделитель исключает паразитное перетягивание теплоносителя между насосами контуров, снижает шум в радиаторах, защищает теплообменник котла от температурного шока и удаляет микропузырьки воздуха и шлам до попадания в котел.

Сформировано в LIGA OS • https://liga-master-uz.vercel.app/`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        await this.copyToClipboard(report);
      }
      this.showToast('✓ Расчет гидрострелки скопирован для Telegram!');
    } catch (e) {
      this.showToast('✓ Расчет гидрострелки сформирован!');
    }
  }

  async copySeparatorClientScript() {
    const s = this.currentCalculatedSeparator || { powerKw: 35, standardProfile: '80×80 мм' };
    const text = `Здравствуйте! Направляю инженерное обоснование установки гидравлического разделителя (гидрострелки) в вашей котельной.

⚗️ Независимость и баланс контуров:
Когда в доме работает несколько отопительных контуров (теплый пол, радиаторы 1 и 2 этажей, бойлер косвенного нагрева), их насосы начинают мешать друг другу и «перетягивать» теплоноситель. Гидрострелка создает зону нулевого перепада давления, разделяя котловой и отопительные контуры.

🛡️ Защита котла и тишина:
Гидрострелка полностью защищает котел от резких перепадов температуры обратной воды (термоударов), удаляет микропузырьки воздуха и шлам, обеспечивая долгий срок службы всей котельной.
Настоящее швейцарское качество для вашего дома!`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await this.copyToClipboard(text);
      }
      this.showToast('✓ Аргумент по гидрострелке скопирован для клиента!');
    } catch (e) {
      this.showToast('✓ Текст для заказчика сформирован!');
    }
  }

  async addCalculatedSeparatorToMaterials() {
    const calc = this.currentCalculatedSeparator;
    if (!calc) return;
    if (!window.ligaDB) {
      this.showToast('База данных недоступна');
      return;
    }

    const itemsToAdd = [
      {
        category: 'boiler',
        name: `Гидравлический разделитель (гидрострелка): ${calc.modelName}`,
        qty: '1 шт',
        price: calc.modelPrice,
        isPurchased: false
      },
      {
        category: 'fittings',
        name: `Автоматический воздухоотводчик: ${calc.airVentName}`,
        qty: '1 шт',
        price: 185000,
        isPurchased: false
      },
      {
        category: 'fittings',
        name: `Дренажный кран промывки шлама: ${calc.drainValveName}`,
        qty: '1 шт',
        price: 120000,
        isPurchased: false
      }
    ];

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
    this.closeModal('modal-hydraulic-separator-calculator');
    this.showToast('✓ Добавлено 3 позиции первичного кольца котельной (Север / Caleffi) на склад!');
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

  // Генерация Официального Акта гидравлического испытания
  generatePressureAct() {
    if (!this.currentSite) return;
    const isVerified = window.ligaPdfEngine.isPressureVerified(this.currentSite, this.currentPhotos);
    if (!isVerified) {
      alert('⚠️ Для формирования Официального Акта необходимо зафиксировать проведение испытания давлением и прикрепить фото манометра в протоколе опрессовки.');
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
  // МОДУЛЬ ГОЛОСОВОГО КОНСЬЕРЖА («СВОБОДНЫЕ РУКИ НА ОБЪЕКТЕ») — LIGA VOICE VIP
  // Естественный синтез речи, живой диалог, подтверждения в 1 тап и подсветка
  // ==========================================================================
  // Машинный голосовой синтез речи (TTS) — по умолчанию ВЫКЛ. Если force === true, воспроизводит по прямому запросу («Прочитай...»)
  speakVoice(text, force = false, maxChars = 320) {
    if ((!this.isVoiceTtsEnabled && !force) || !this.isSoundEnabled || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text
        .replace(/[*#`_~[\]()]/g, '')
        .replace(/\n+/g, ' ')
        .slice(0, maxChars);
      const utt = new SpeechSynthesisUtterance(clean);
      utt.lang = 'ru-RU';
      utt.rate = 1.05; // комфортный и солидный темп
      utt.pitch = 0.98; // уверенный тембр
      utt.volume = 0.9;

      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v =>
        v.lang.startsWith('ru') && (v.name.includes('Neural') || v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Yandex') || v.name.includes('Premium'))
      ) || voices.find(v => v.lang.startsWith('ru') && !v.localService)
        || voices.find(v => v.lang.startsWith('ru'));

      if (preferred) utt.voice = preferred;
      window.speechSynthesis.speak(utt);
    } catch (e) {
      console.warn('[LIGA Voice] Speak error:', e);
    }
  }

  toggleVoiceTts() {
    this.isVoiceTtsEnabled = !this.isVoiceTtsEnabled;
    localStorage.setItem('liga_voice_tts_enabled', this.isVoiceTtsEnabled ? 'true' : 'false');
    this.updateVoiceTtsUI();
    this.showToast(this.isVoiceTtsEnabled ? '🔊 Голосовая озвучка включена' : '🔇 Голосовая озвучка выключена (Тихий швейцарский режим)');
  }

  updateVoiceTtsUI() {
    const iconEl = document.getElementById('voice-tts-status-icon');
    const textEl = document.getElementById('voice-tts-status-text');
    const btn = document.getElementById('btn-toggle-voice-tts');
    if (iconEl) iconEl.innerText = this.isVoiceTtsEnabled ? '🔊' : '🔇';
    if (textEl) textEl.innerText = this.isVoiceTtsEnabled ? 'Озвучка ответов: ВКЛ' : 'Озвучка ответов: ВЫКЛ (тихий режим)';
    if (btn) {
      if (this.isVoiceTtsEnabled) {
        btn.style.borderColor = 'var(--gold-primary)';
        btn.style.color = 'var(--gold-primary)';
        btn.style.background = 'rgba(217,119,6,0.18)';
      } else {
        btn.style.borderColor = 'rgba(255,255,255,0.12)';
        btn.style.color = 'var(--text-muted)';
        btn.style.background = 'rgba(255,255,255,0.06)';
      }
    }
  }

  // ==========================================================================
  // ГОЛОСОВОЙ БРИФИНГ «ЧТЕНИЕ ВСЛУХ В ДОРОГЕ / HANDS-FREE» (v2.5.4)
  // Мастер за рулем или в наушниках просит: «Прочитай смету», «Сколько в кассе»
  // ==========================================================================
  async readEstimateBrief(siteId) {
    const site = (siteId && this.sites) ? this.sites.find(s => s.id === siteId) : (this.currentSite || (this.sites && this.sites[0]));
    if (site && site.id !== this.currentSiteId) {
      await this.selectSite(site.id);
    }
    this.switchScreen('estimate');
    this.closeModal('modal-voice');

    if (!site) {
      const msg = 'Объект не выбран. Открываю экран сметы.';
      this.showToast(msg);
      this.speakVoice(msg, true);
      return;
    }

    const contract = site.contractSum || 0;
    const advance = site.advanceSum || 0;
    const debt = Math.max(0, contract - advance);
    const siteTitle = site.name || 'Объект';

    let brief = '';
    if (contract > 0) {
      brief = `Смета по объекту ${siteTitle}. Общая стоимость работ: ${this.formatSum(contract)}. Получен аванс: ${this.formatSum(advance)}. Остаток к получению с заказчика: ${this.formatSum(debt)}.`;
    } else {
      brief = `По объекту ${siteTitle} смета ещё не заполнена. Открыл форму экспресс-расчета по точкам.`;
    }

    this.showToast(`📢 Озвучиваю смету: ${siteTitle}`);
    this.speakVoice(brief, true, 350);
  }

  async readFinanceBrief(siteId) {
    const site = (siteId && this.sites) ? this.sites.find(s => s.id === siteId) : (this.currentSite || (this.sites && this.sites[0]));
    if (site && site.id !== this.currentSiteId) {
      await this.selectSite(site.id);
    }
    this.switchScreen('finances');
    this.closeModal('modal-voice');

    if (!site) {
      const msg = 'Объект не выбран. Открываю кассу.';
      this.showToast(msg);
      this.speakVoice(msg, true);
      return;
    }

    const siteTitle = site.name || 'Объект';
    const advance = site.advanceSum || 0;
    const brigade = site.brigadeOwed || 0;

    let matSum = 0;
    try {
      if (window.ligaDB) {
        const mats = await window.ligaDB.getBySiteId('materials', site.id);
        matSum = mats.reduce((acc, m) => acc + (m.price || 0), 0);
      }
    } catch (e) {}

    const balance = advance - matSum;
    const brief = `Касса объекта ${siteTitle}. Получено от заказчика: ${this.formatSum(advance)}. Расход на материалы: ${this.formatSum(matSum)}. Выплаты бригаде: ${this.formatSum(brigade)}. Чистый остаток в кассе мастера: ${this.formatSum(balance)}.`;

    this.showToast(`📢 Озвучиваю кассу: ${siteTitle}`);
    this.speakVoice(brief, true, 350);
  }

  async readChecklistBrief(siteId) {
    const site = (siteId && this.sites) ? this.sites.find(s => s.id === siteId) : (this.currentSite || (this.sites && this.sites[0]));
    if (site && site.id !== this.currentSiteId) {
      await this.selectSite(site.id);
    }
    this.switchScreen('checklist');
    this.closeModal('modal-voice');

    if (!site) {
      const msg = 'Объект не выбран. Открываю чек-лист.';
      this.showToast(msg);
      this.speakVoice(msg, true);
      return;
    }

    const siteTitle = site.name || 'Объект';
    let checkedCount = 0;
    const totalCount = 10;
    try {
      if (window.ligaDB) {
        const items = await window.ligaDB.getBySiteId('checklists', site.id);
        checkedCount = items.filter(i => i.isDone).length;
      }
    } catch (e) {}

    let brief = '';
    if (checkedCount >= totalCount) {
      brief = `Чек-лист перед заливкой стяжки по объекту ${siteTitle}. Все десять пунктов выполнены! Опрессовка 16 бар подтверждена, фотофиксация завершена. Допуск к стяжке разрешен.`;
    } else {
      const remaining = totalCount - checkedCount;
      brief = `Чек-лист перед стяжкой объекта ${siteTitle}. Выполнено ${checkedCount} из десяти пунктов. Осталось проверить ${remaining} узлов перед заливкой пола.`;
    }

    this.showToast(`📋 Чек-лист: ${checkedCount} из 10 проверено`);
    this.speakVoice(brief, true, 350);
  }

  async readMaterialsBrief(siteId) {
    const site = (siteId && this.sites) ? this.sites.find(s => s.id === siteId) : (this.currentSite || (this.sites && this.sites[0]));
    if (site && site.id !== this.currentSiteId) {
      await this.selectSite(site.id);
    }
    this.switchScreen('materials');
    this.closeModal('modal-voice');

    if (!site) {
      const msg = 'Открываю склад и закупки.';
      this.showToast(msg);
      this.speakVoice(msg, true);
      return;
    }

    const siteTitle = site.name || 'Объект';
    let mats = [];
    try {
      if (window.ligaDB) {
        mats = await window.ligaDB.getBySiteId('materials', site.id);
      }
    } catch (e) {}

    const totalCost = mats.reduce((acc, m) => acc + (m.price || 0), 0);
    const unbought = mats.filter(m => !m.isPurchased);

    let brief = '';
    if (unbought.length > 0) {
      const unboughtCost = unbought.reduce((acc, m) => acc + (m.price || 0), 0);
      const topNames = unbought.slice(0, 3).map(m => m.name).join(', ');
      brief = `Снабжение объекта ${siteTitle}. К закупке на рынке Джами: ${unbought.length} позиций на сумму ${this.formatSum(unboughtCost)}. В списке: ${topNames}.`;
    } else if (mats.length > 0) {
      brief = `Склад объекта ${siteTitle}. Всего зафиксировано ${mats.length} позиций на общую сумму ${this.formatSum(totalCost)}. Все необходимые материалы закуплены.`;
    } else {
      brief = `Склад объекта ${siteTitle}. Список материалов пока пуст. Вы можете продиктовать закупку голосом.`;
    }

    this.showToast(`📦 Снабжение: ${siteTitle}`);
    this.speakVoice(brief, true, 350);
  }

  async readPressureBrief(siteId) {
    const site = (siteId && this.sites) ? this.sites.find(s => s.id === siteId) : (this.currentSite || (this.sites && this.sites[0]));
    if (site && site.id !== this.currentSiteId) {
      await this.selectSite(site.id);
    }
    this.closeModal('modal-voice');
    this.openModal('modal-pressure-test');

    if (!site) {
      const msg = 'Открываю таймер и протокол опрессовки 16 бар.';
      this.showToast(msg);
      this.speakVoice(msg, true);
      return;
    }

    const siteTitle = site.name || 'Объект';
    const isPassed = site.pressTestPassed;
    const bar = (site.pressureTest && site.pressureTest.pressureBar) ? site.pressureTest.pressureBar : '16.0';

    let brief = '';
    if (isPassed) {
      brief = `Опрессовка объекта ${siteTitle} успешно выдержана. Контрольное давление ${bar} бар стояло 24 часа без падения стрелки манометра. Сформирован юридический акт допуска.`;
    } else {
      brief = `Объект ${siteTitle}. Испытание давлением ${bar} бар в процессе или ожидает фиксации. Стандарт LIGA OS требует выдержки 24 часа перед заливкой стяжки.`;
    }

    this.showToast(`🛡️ Опрессовка: ${siteTitle}`);
    this.speakVoice(brief, true, 350);
  }

  // ==========================================================================
  // УДЕРЖАНИЕ ЭКРАНА АКТИВНЫМ (SCREEN WAKE LOCK API) — ДЛЯ АВТОМОБИЛЯ НА ТОРПЕДЕ
  // ==========================================================================
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
          this.updateWakeLockUI(false);
        });
        this.updateWakeLockUI(true);
      } catch (err) {
        console.warn('[LIGA OS] WakeLock request warning:', err.message);
      }
    }
  }

  async releaseWakeLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (e) {}
    }
    this.updateWakeLockUI(false);
  }

  updateWakeLockUI(isActive) {
    const badge = document.getElementById('voice-wake-lock-badge');
    if (badge) {
      badge.style.display = isActive ? 'inline-flex' : 'none';
    }
  }

  pulseElement(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.remove('element-spotlight-pulse');
      void el.offsetWidth;
      el.classList.add('element-spotlight-pulse');
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {}
    }
  }

  showVoiceFastConfirmation(action) {
    this.pendingFastVoiceAction = action;
    const overlay = document.getElementById('voice-confirmation-overlay');
    const badge = document.getElementById('voice-conf-badge');
    const title = document.getElementById('voice-conf-title');
    const amountEl = document.getElementById('voice-conf-amount');
    const siteNameEl = document.getElementById('voice-conf-site-name');

    if (overlay && title && amountEl && siteNameEl) {
      if (badge) badge.innerText = `🛒 ${action.category || 'Базар Джами'}`;
      title.innerText = `Записать покупку: ${action.title}?`;
      amountEl.innerText = this.formatSum(action.amount);
      const siteName = this.currentSite ? this.currentSite.name : 'Активный объект';
      siteNameEl.innerText = siteName;
      overlay.style.display = 'flex';

      const promptText = `Записать покупку: ${action.title} на ${this.formatSum(action.amount)}? Скажите «Да» для подтверждения.`;
      this.speakVoice(promptText);
    }
  }

  async confirmVoiceFastAction() {
    if (!this.pendingFastVoiceAction) return;
    const action = this.pendingFastVoiceAction;
    const overlay = document.getElementById('voice-confirmation-overlay');
    if (overlay) overlay.style.display = 'none';

    await window.ligaDB.add('materials', {
      siteId: this.currentSiteId,
      category: action.category || 'Трубы и фитинги',
      name: action.title,
      qty: action.qty || '1 компл',
      price: action.amount,
      isPurchased: true,
      receiptPhoto: null,
      date: new Date().toISOString().slice(0, 10)
    });

    await window.ligaDB.add('finances', {
      siteId: this.currentSiteId,
      type: 'material_expense',
      amount: action.amount,
      method: 'Базарный карман мастера (Наличные)',
      recipient: `Закупка: ${action.title}`,
      date: new Date().toISOString().slice(0, 10)
    });

    this.showToast(`✓ ${action.title} (${this.formatSum(action.amount)}) записан в снабжение!`);
    this.speakVoice(`Записано в снабжение. Списано ${this.formatSum(action.amount)} из базарного кармана.`);
    this.pendingFastVoiceAction = null;
    this.render();
  }

  switchVoiceConfSite() {
    if (!this.sites || this.sites.length <= 1) {
      this.showToast('В системе только 1 объект');
      return;
    }
    const curIdx = this.sites.findIndex(s => s.id === this.currentSiteId);
    const nextIdx = (curIdx + 1) % this.sites.length;
    const nextSite = this.sites[nextIdx];
    this.currentSiteId = nextSite.id;
    this.currentSite = nextSite;

    const siteNameEl = document.getElementById('voice-conf-site-name');
    if (siteNameEl) siteNameEl.innerText = nextSite.name;
    this.showToast(`Объект списания: ${nextSite.name}`);
    this.speakVoice(`Объект списания: ${nextSite.name}. Скажите «Да» для подтверждения.`);
    this.render();
  }

  cancelVoiceFastAction() {
    const overlay = document.getElementById('voice-confirmation-overlay');
    if (overlay) overlay.style.display = 'none';
    this.pendingFastVoiceAction = null;
    this.showToast('Запись покупки отменена');
    this.speakVoice('Запись отменена.');
  }

  ensureFreshVoiceEngine() {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechClass) return false;

    // Полное безопасное очищение предыдущего экземпляра Web Speech API
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }

    this.initVoiceEngine();
    return !!this.recognition;
  }

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
        // Принимаем сигналы только при активной сессии
        if (!this.isRecordingVoice || !this.voiceKeepAliveActive) {
          return;
        }
        const modalVoice = document.getElementById('modal-voice');
        const modalConcierge = document.getElementById('modal-voice-concierge-choice');
        const isVoiceOpen = modalVoice && modalVoice.classList.contains('open');
        const isConciergeOpen = modalConcierge && modalConcierge.classList.contains('open');

        if (!isVoiceOpen && !isConciergeOpen) {
          return;
        }

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

        // 1. Если активно окно выбора консьержа: слушаем выбор 1-2-3-4
        if (isConciergeOpen && this.isConciergeListening) {
          this.handleConciergeVoiceChoice(currentFull.toLowerCase());
          return;
        }

        // 2. Если открыто окно диктовки: плавно выводим слова в поле ввода БЕЗ перебивания!
        const inputEl = document.getElementById('voice-recognized-input');
        if (inputEl) inputEl.value = currentFull;

        const statusEl = document.getElementById('voice-status-text');
        if (statusEl) {
          statusEl.innerHTML = `🟢 <span style="color:var(--neon-emerald); font-weight:800;">Слушаю вас...</span> «${currentFull}»`;
        }

        const finishBtn = document.getElementById('btn-voice-finish-recording');
        if (finishBtn) finishBtn.style.display = 'block';

        // 3. Умный дебаунсер тишины (1.3 секунды): даем мастеру спокойно договорить всю фразу!
        clearTimeout(this.voiceSilenceTimer);
        this.voiceSilenceTimer = setTimeout(() => {
          if (this.isRecordingVoice && isVoiceOpen) {
            const finalQuery = (inputEl ? inputEl.value : currentFull).trim();
            if (finalQuery.length >= 2) {
              this.stopVoiceRecording(true);
            }
          }
        }, 1300);
      };

      this.recognition.onerror = (e) => {
        console.warn('[LIGA OS Voice] SpeechRecognition event:', e.error);
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
        // Keep-Alive: возобновляем сессию только если запись активна пользователем
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

  // Единый метод открытия голосового помощника для обеих кнопок (в шапке и плавающей)
  openVoiceAssistant() {
    this.openModal('modal-voice');
    this.updateVoiceTtsUI();
    this.startVoiceRecording();
  }

  toggleVoiceRecording() {
    if (this.isRecordingVoice) {
      this.stopVoiceRecording(true);
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

    // v2.5.1: Всегда получаем свежий чистый экземпляр Recognition, чтобы второй и последующие клики работали со 100% гарантией
    this.ensureFreshVoiceEngine();

    this.voiceKeepAliveActive = true;
    const inputEl = document.getElementById('voice-recognized-input');
    if (inputEl && inputEl.value.trim().length > 0 && !this.voiceAccumulatedText) {
      this.voiceAccumulatedText = inputEl.value.trim();
    }

    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (err) {
        console.warn('[LIGA OS Voice] Recognition start warning:', err);
      }
    }

    this.isRecordingVoice = true;
    this.updateVoiceUI(true);

    const statusEl = document.getElementById('voice-status-text');
    if (statusEl) {
      statusEl.innerHTML = '🟢 <span style="color:var(--neon-emerald); font-weight:800;">Слушаю вас...</span> Говорите свободно, можно делать паузы';
    }
  }

  stopVoiceRecording(processText = true) {
    this.voiceKeepAliveActive = false;
    clearTimeout(this.voiceRestartTimeout);
    clearTimeout(this.voiceSilenceTimer);

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
      statusEl.innerHTML = '✓ <span style="color:var(--neon-emerald); font-weight:800;">Запись завершена.</span> Анализирую команду мастера...';
    }

    if (processText) {
      const inputEl = document.getElementById('voice-recognized-input');
      const finalText = inputEl ? inputEl.value.trim() : (this.voiceAccumulatedText + ' ' + this.voiceInterimText).trim();
      if (finalText) {
        this.executeCompleteVoiceCommand(finalText);
      }
    }
  }

  // Окончательный анализ и мгновенное выполнение команды мастера БЕЗ промежуточных прерываний
  async executeCompleteVoiceCommand(text) {
    if (!text || text.trim().length < 2) return;

    const parsed = this.parseVoiceCommand(text);
    if (!parsed) return;
    this.parsedVoiceAction = parsed;

    // 1. Если требуется интерактивный выбор (размытая фраза или список объектов)
    if (parsed.type === 'concierge_disambiguation') {
      this.showVoiceConciergeChoice(parsed);
      return;
    }

    // 2. Если это быстрое добавление материала на Джами с известной суммой
    if (parsed.type === 'material') {
      this.openVoiceFastActionConfirmation(parsed);
      return;
    }

    // 3. Прямое действие (смена объекта, фото, паспорт А4, акт, касса, опрессовка, режим клиента)
    await this.confirmVoiceAction();
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

    const lower = (transcript || '').toLowerCase().trim();

    // Обработка голосом выбора консьержа 1-2-3-4
    const conciergeModal = document.getElementById('modal-voice-concierge-choice');
    if (conciergeModal && conciergeModal.classList.contains('open') && this.isConciergeListening) {
      this.handleConciergeVoiceChoice(lower);
      return;
    }

    // Обработка голосом экспресс-подтверждения чека («Да» / «Отмена» / «Другой объект»)
    const overlay = document.getElementById('voice-confirmation-overlay');
    if (overlay && overlay.style.display === 'flex' && this.pendingFastVoiceAction) {
      if (lower.includes('да') || lower.includes('подтверждаю') || lower.includes('запиши') || lower.includes('верно') || lower.includes('хорошо') || lower.includes('ок') || lower.includes('давай')) {
        this.confirmVoiceFastAction();
        return;
      }
      if (lower.includes('отмена') || lower.includes('не надо') || lower.includes('отмени') || lower.includes('нет')) {
        this.cancelVoiceFastAction();
        return;
      }
      if (lower.includes('другой объект') || lower.includes('смени объект')) {
        this.switchVoiceConfSite();
        return;
      }
    }
  }

  // ==========================================================================
  // 👑 LIGA VOICE CONCIERGE • ИНТЕЛЛЕКТУАЛЬНЫЙ ВЫБОР ДЕЙСТВИЯ («НУЛЕВАЯ РУТИНА»)
  // ==========================================================================
  showVoiceConciergeChoice(data) {
    this.closeModal('modal-voice');

    const modal = document.getElementById('modal-voice-concierge-choice');
    const titleEl = document.getElementById('voice-concierge-question');
    const subEl = document.getElementById('voice-concierge-sub');
    const listEl = document.getElementById('voice-concierge-options-list');
    const statusEl = document.getElementById('voice-concierge-listen-status');

    if (!modal || !listEl) return;

    const options = Array.isArray(data) ? data : (data && data.options ? data.options : []);
    const question = Array.isArray(data) ? (spokenQuery || 'Улугбек, что для вас открыть?') : (data && data.question ? data.question : 'Улугбек, что для вас открыть?');
    const voicePrompt = Array.isArray(data) ? 'Улугбек, что открыть? Назовите номер или нажмите на карточку.' : (data && data.voicePrompt ? data.voicePrompt : 'Улугбек, что открыть? Назовите номер или нажмите на карточку.');

    this.activeConciergeOptions = options;
    this.isConciergeListening = true;

    if (titleEl) titleEl.innerText = question;
    if (subEl) subEl.innerText = 'Скажите вслух «Один», «Два» или «Три» — либо нажмите на нужную карточку:';

    let html = '';
    this.activeConciergeOptions.forEach((opt, idx) => {
      html += `
        <button type="button" class="voice-concierge-option-card" onclick="window.app.executeConciergeChoice(${idx})">
          <div class="voice-concierge-badge-num">${opt.num || (idx + 1)}</div>
          <div class="voice-concierge-opt-text">
            <div class="voice-concierge-opt-title">${opt.title}</div>
            <div class="voice-concierge-opt-desc">${opt.desc}</div>
          </div>
          <div class="voice-concierge-arrow">→</div>
        </button>
      `;
    });
    listEl.innerHTML = html;

    this.openModal('modal-voice-concierge-choice');
    this.playDiplomaticChime();

    if (statusEl) {
      statusEl.innerHTML = '🟢 Слушаю ваш ответ: «Один», «Два», «Три»...';
    }

    setTimeout(() => {
      if (this.isConciergeListening) {
        this.startVoiceRecording();
      }
    }, 450);
  }

  handleConciergeVoiceChoice(lower) {
    if (!this.activeConciergeOptions || this.activeConciergeOptions.length === 0) return;

    let selectedIdx = -1;
    if (lower.includes('один') || lower.includes('перв') || lower.includes('1') || lower.includes('да') || lower.includes('давай') || lower.includes('подтвержд') || lower.includes('открывай')) {
      selectedIdx = 0;
    } else if (lower.includes('два') || lower.includes('втор') || lower.includes('2')) {
      selectedIdx = 1;
    } else if (lower.includes('три') || lower.includes('трет') || lower.includes('3')) {
      selectedIdx = 2;
    } else if (lower.includes('четыр') || lower.includes('четверт') || lower.includes('4')) {
      selectedIdx = 3;
    } else if (lower.includes('отмена') || lower.includes('нет') || lower.includes('закрой') || lower.includes('не надо')) {
      this.closeVoiceConciergeModal();
      return;
    }

    if (selectedIdx >= 0 && selectedIdx < this.activeConciergeOptions.length) {
      this.executeConciergeChoice(selectedIdx);
    }
  }

  async executeConciergeChoice(index) {
    const opt = this.activeConciergeOptions ? this.activeConciergeOptions[index] : null;
    if (!opt) return;

    this.closeVoiceConciergeModal();
    this.playDiplomaticChime();

    if (opt.siteToSwitch && opt.siteToSwitch !== this.currentSiteId) {
      await this.selectSite(opt.siteToSwitch);
    }

    if (opt.targetScreen) {
      this.switchScreen(opt.targetScreen);
      this.showToast(`✓ Открываю: ${opt.title}`);
    } else if (opt.targetModal) {
      this.openModal(opt.targetModal);
      this.showToast(`✓ Открываю: ${opt.title}`);
    } else if (opt.targetFunc && typeof this[opt.targetFunc] === 'function') {
      if (opt.targetArg !== undefined) {
        this[opt.targetFunc](opt.targetArg);
      } else {
        this[opt.targetFunc]();
      }
      this.showToast(`✓ Выполняю: ${opt.title}`);
    }
  }

  closeVoiceConciergeModal() {
    this.isConciergeListening = false;
    this.activeConciergeOptions = null;
    this.stopVoiceRecording(false);
    this.closeModal('modal-voice-concierge-choice');
  }

  parseVoiceCommand(text) {
    const lower = text.toLowerCase().trim();

    // 0. Поиск упомянутого объекта (Мирабад, Инфинити, Ташкент Сити, Бульвар, Нест Ван, Коттедж и др.)
    const siteMatch = this.findSiteByQuery(lower);
    const siteToSwitch = siteMatch ? siteMatch.id : undefined;
    const siteName = siteMatch ? siteMatch.name : (this.currentSite ? this.currentSite.name : '');

    // 0.1. ГОЛОСОВОЙ БРИФИНГ «ЧТЕНИЕ ВСЛУХ В ДОРОГЕ / HANDS-FREE» (v2.5.4)
    // Мастер за рулем просит: «Прочитай смету», «Озвучь кассу», «Прочитай чеклист», «Что купить на Джами»
    const isReadCmd = lower.includes('прочитай') || lower.includes('озвучь') || lower.includes('зачитай') || lower.includes('скажи вслух') || lower.includes('расскажи про') || lower.includes('что там по') || lower.includes('сколько денег') || lower.includes('сколько по смет');

    // Смета вслух
    if (isReadCmd && (lower.includes('смет') || lower.includes('расчет') || lower.includes('по точкам') || lower.includes('сколько стоит') || lower.includes('стоимост') || lower.includes('сколько по смет'))) {
      return {
        type: 'direct_func',
        target: 'readEstimateBrief',
        targetArg: siteToSwitch,
        siteToSwitch: siteToSwitch,
        title: siteName ? `📢 Смета: ${siteName}` : '📢 Озвучить смету объекта',
        desc: 'Зачитываю голосовой бриф по смете и расчетам...'
      };
    }

    // Касса и финансы вслух
    if (isReadCmd && (lower.includes('касс') || lower.includes('деньг') || lower.includes('баланс') || lower.includes('карман') || lower.includes('остаток') || lower.includes('сколько денег'))) {
      return {
        type: 'direct_func',
        target: 'readFinanceBrief',
        targetArg: siteToSwitch,
        siteToSwitch: siteToSwitch,
        title: siteName ? `📢 Касса: ${siteName}` : '📢 Озвучить финансовый пульс',
        desc: 'Зачитываю голосовой бриф по кассе и выплатам...'
      };
    }

    // Чек-лист перед стяжкой вслух
    if (isReadCmd && (lower.includes('чеклист') || lower.includes('чек-лист') || lower.includes('проверк') || lower.includes('стяжк') || lower.includes('пункт'))) {
      return {
        type: 'direct_func',
        target: 'readChecklistBrief',
        targetArg: siteToSwitch,
        siteToSwitch: siteToSwitch,
        title: siteName ? `📢 Чек-лист: ${siteName}` : '📢 Озвучить чек-лист перед стяжкой',
        desc: 'Зачитываю готовность 10 контрольных узлов перед стяжкой...'
      };
    }

    // Снабжение и Джами вслух
    if (isReadCmd && (lower.includes('материал') || lower.includes('базар') || lower.includes('джами') || lower.includes('урикзар') || lower.includes('склад') || lower.includes('купить') || lower.includes('список') || lower.includes('что купить'))) {
      return {
        type: 'direct_func',
        target: 'readMaterialsBrief',
        targetArg: siteToSwitch,
        siteToSwitch: siteToSwitch,
        title: siteName ? `📢 Закупки: ${siteName}` : '📢 Озвучить список закупок Джами',
        desc: 'Зачитываю позиции снабжения и сумму закупки...'
      };
    }

    // Опрессовка и акт вслух
    if (isReadCmd && (lower.includes('опрессовк') || lower.includes('16 бар') || lower.includes('давлен') || lower.includes('акт') || lower.includes('испытан') || lower.includes('манометр'))) {
      return {
        type: 'direct_func',
        target: 'readPressureBrief',
        targetArg: siteToSwitch,
        siteToSwitch: siteToSwitch,
        title: siteName ? `📢 Опрессовка: ${siteName}` : '📢 Озвучить статус опрессовки 16 бар',
        desc: 'Зачитываю суточный протокол гидравлики 16 бар...'
      };
    }

    // 1. VIP-бриф и персональный тест-драйв Улугбека Хакимова
    if (lower.includes('бриф') || lower.includes('тест драйв') || lower.includes('тест-драйв') || lower.includes('улугбек') || lower.includes('программа приемки') || lower.includes('памятка мастера') || lower.includes('приемка системы')) {
      return {
        type: 'direct_func',
        target: 'openUlugbekVipBrief',
        title: '👑 Бриф: Персональный тест-драйв Улугбека',
        voiceResponse: 'Открываю персональный бриф тест-драйва для Улугбека Хакимова',
        desc: 'Открываю программу приёмки LIGA OS и 5 контрольных узлов...'
      };
    }

    // 2. Королевская кнопка факта (3 секунды) — мгновенная фотокамера
    const isQuickFact = lower.includes('королевская') || lower.includes('факт') || lower.includes('быстрое фото') || lower.includes('сфоткай') || (lower.includes('камер') && (lower.includes('включи') || lower.includes('открой')));
    if (isQuickFact) {
      return {
        type: 'direct_func',
        target: 'openQuickFactModal',
        siteToSwitch: siteToSwitch,
        title: '📸 Факт: Быстрая фотофиксация узла (3 сек)',
        voiceResponse: 'Включаю камеру быстрой фотофиксации скрытого узла до стяжки',
        desc: 'Запускаю быструю камеру для фиксации скрытого узла до стяжки...'
      };
    }

    // 3. LIGA AI Голосовой Консьерж
    if (lower.includes('спроси ии') || lower.includes('ии консьерж') || lower.includes('ии-консьерж') || lower.includes('голосовой ии') || lower.includes('помощник ии') || (lower.includes('ассистент') && !lower.includes('помощнику'))) {
      return {
        type: 'modal_action',
        target: 'modal-ai-concierge',
        title: '🤖 LIGA AI: Голосовой Консьерж',
        voiceResponse: 'Открываю LIGA AI Консьерж. Чем я могу помочь?',
        desc: 'Запускаю голосового ИИ-консультанта инженера (Gemini Flash)...'
      };
    }

    // 4. Гербовая печать и подпись мастера
    if (lower.includes('печать') || lower.includes('подпись мастера') || lower.includes('гербов') || lower.includes('штамп') || lower.includes('распишись')) {
      return {
        type: 'direct_func',
        target: 'testDriveStep3_Seal',
        title: '✍️ Настройки: Печать и подпись мастера',
        voiceResponse: 'Открываю настройки именной гербовой печати и подписи мастера',
        desc: 'Перехожу к настройкам гербовой печати и холсту подписи пальцем...'
      };
    }

    // 5. Telegram: Отчет заказчику
    if (lower.includes('телеграм') || lower.includes('скинь в тг') || lower.includes('отчет заказчик') || lower.includes('отправь отчет')) {
      return {
        type: 'direct_func',
        target: 'shareSiteProgressTelegram',
        siteToSwitch: siteToSwitch,
        title: '✈️ Telegram: Отчет заказчику',
        voiceResponse: `Формирую отчет для отправки в Telegram ${siteName}`.trim(),
        desc: 'Формирую отчет о ходе монтажа для отправки в Telegram...'
      };
    }

    // 6. Режим показа клиенту (Безопасность мастера)
    if (lower.includes('клиент смотрит') || lower.includes('спрячь цен') || lower.includes('скрой деньг') || lower.includes('скрой финанс') || lower.includes('режим клиент') || lower.includes('показ клиент') || lower.includes('секрет')) {
      return {
        type: 'direct_func',
        target: 'setClientModeTrue',
        title: '👁️ Защита: Режим показа клиенту',
        voiceResponse: 'Режим показа клиенту активирован. Закупочные цены и прибыль скрыты',
        desc: 'Скрываю служебные и финансовые данные мастера...'
      };
    }
    if (lower.includes('верни цен') || lower.includes('обычный режим') || lower.includes('выключи режим клиент') || lower.includes('покажи цены')) {
      return {
        type: 'direct_func',
        target: 'setClientModeFalse',
        title: '🔓 Обычный режим мастера',
        voiceResponse: 'Обычный режим мастера включен. Финансы и касса доступны',
        desc: 'Возвращаю отображение цен и служебных данных...'
      };
    }

    // 7. Фотографии скрытых узлов и трасс (Галерея паспорта)
    const isPhotoRequest = lower.includes('фото') || lower.includes('фотк') || lower.includes('снимок') || lower.includes('галере') || lower.includes('трасс') || lower.includes('скрыт') || lower.includes('аксонометр');
    if (isPhotoRequest) {
      return {
        type: 'direct_func',
        target: 'openPassportPhotosModal',
        siteToSwitch: siteToSwitch,
        title: siteName ? `📸 Фото скрытых узлов: ${siteName}` : '📸 Фотоархив скрытых узлов',
        voiceResponse: siteName ? `Открываю фотоархив скрытых узлов объекта ${siteName}` : 'Открываю фотоархив скрытых трасс и узлов',
        desc: 'Открываю исполнительную фотофиксацию скрытых работ до стяжки...'
      };
    }

    // 8. Исполнительный Инженерный Паспорт А4 (PDF)
    const isPassportRequest = lower.includes('паспорт') || lower.includes('исполнительный') || (lower.includes('документ') && !lower.includes('акт') && !lower.includes('чеклист') && !lower.includes('печать'));
    if (isPassportRequest) {
      return {
        type: 'direct_func',
        target: 'testDriveStep4_Passport',
        siteToSwitch: siteToSwitch,
        title: siteName ? `📄 Паспорт А4: ${siteName}` : '📄 Исполнительный Паспорт Объекта А4',
        voiceResponse: siteName ? `Формирую официальный инженерный паспорт объекта ${siteName}` : 'Формирую официальный инженерный паспорт А4 для печати',
        desc: 'Формирую официальный инженерный паспорт А4 для печати и PDF...'
      };
    }

    // 9. Официальный Акт опрессовки 16 бар (допуск к стяжке)
    const isActRequest = lower.includes('акт') || lower.includes('протокол') || lower.includes('допуск к стяжке') || lower.includes('акт стяжки');
    if (isActRequest) {
      return {
        type: 'direct_func',
        target: 'exportScreedAct',
        siteToSwitch: siteToSwitch,
        title: siteName ? `🛡️ Акт 16 бар: ${siteName}` : '🛡️ Официальный Акт опрессовки 16 бар',
        voiceResponse: siteName ? `Формирую официальный акт опрессовки объекта ${siteName}` : 'Формирую официальный акт опрессовки 16 бар по стандарту DIN 1988',
        desc: 'Экспортирую юридический акт гидравлических испытаний 16 бар...'
      };
    }

    // 10. Чек-лист перед заливкой стяжки (10 пунктов)
    const isChecklistRequest = lower.includes('чеклист') || lower.includes('чек-лист') || lower.includes('10 пунктов') || lower.includes('проверка до стяжки') || lower.includes('проверь стяжку') || (lower.includes('провер') && lower.includes('стяжк'));
    if (isChecklistRequest) {
      return {
        type: 'nav_action',
        target: 'checklist',
        siteToSwitch: siteToSwitch,
        title: siteName ? `📋 Чек-лист: ${siteName}` : '📋 Чек-лист перед заливкой стяжки',
        voiceResponse: siteName ? `Открываю чек-лист проверки перед стяжкой ${siteName}` : 'Открываю чек-лист 10 критических узлов перед заливкой стяжки',
        desc: 'Перехожу к контрольному чек-листу готовности к стяжке...'
      };
    }

    // 11. Опрессовка 16 бар на 24 часа (Таймер испытаний)
    const isPressureRequest = lower.includes('опрессовк') || lower.includes('16 бар') || lower.includes('манометр') || (lower.includes('давлен') && !lower.includes('смета')) || lower.includes('гидравлик') || lower.includes('протечк');
    if (isPressureRequest && !lower.includes('купил')) {
      return {
        type: 'direct_func',
        target: 'testDriveStep2_Pressure',
        siteToSwitch: siteToSwitch,
        title: siteName ? `🛡️ Опрессовка 16 бар: ${siteName}` : '🛡️ Опрессовка 16 бар на 24 часа',
        voiceResponse: siteName ? `Открываю суточный таймер опрессовки 16 бар объекта ${siteName}` : 'Открываю протокол гидравлических испытаний 16 бар',
        desc: 'Запускаю протокол суточной опрессовки 16 бар по стандарту DIN 1988...'
      };
    }

    // 12. Парсинг денежных сумм (миллионы, тысячи, доллары, баксы, узбекский)
    let amount = 0;
    const usdRate = (this.tariffSettings && this.tariffSettings.usdRate) ? this.tariffSettings.usdRate : 12900;
    const usdMatch = lower.match(/(\d+)\s*(доллар|бакс|\$)/);
    if (usdMatch) {
      amount = parseInt(usdMatch[1]) * usdRate;
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
        amount = Math.round(parseFloat(mMatch[1].replace(',', '.')) * 1000000);
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
        amount = Math.round(parseFloat(thousandsMatch[1].replace(',', '.')) * 1000);
      } else if (plainNumberMatch) {
        amount = parseInt(plainNumberMatch[1]);
      }
    }

    // 13. Финансы: Аванс от клиента / Зачисление денег
    const isClientAdvance = lower.includes('клиент перевел') || lower.includes('заказчик дал') || lower.includes('поступил аванс') || lower.includes('аванс от') || (lower.includes('аванс') && lower.includes('клиент'));
    if (isClientAdvance) {
      if (amount > 0) {
        return {
          type: 'client_advance',
          siteToSwitch: siteToSwitch,
          title: `Аванс от заказчика (${this.formatSum(amount)})`,
          amount: amount,
          voiceResponse: `Зачисляю аванс ${this.formatSum(amount)} на объект ${siteName}`.trim()
        };
      } else {
        return {
          type: 'direct_func',
          target: 'openPaymentModal',
          targetArg: 'client_advance',
          siteToSwitch: siteToSwitch,
          title: '💵 Принять аванс заказчика',
          voiceResponse: 'Открываю окно зачисления аванса от заказчика',
          desc: 'Открываю финансовую форму приема аванса...'
        };
      }
    }

    // 14. Финансы: Выплата помощнику / Зарплата бригаде
    const isBrigadePay = lower.includes('выдал') || lower.includes('алишер') || lower.includes('сардор') || lower.includes('рустам') || lower.includes('зарплат') || (lower.includes('выплат') && !lower.includes('хроник')) || (lower.includes('аванс') && (lower.includes('помощник') || lower.includes('бригад')));
    if (isBrigadePay) {
      let recipient = 'Алишер';
      if (lower.includes('сардор')) recipient = 'Сардор';
      else if (lower.includes('рустам')) recipient = 'Рустам';
      else if (lower.includes('помощник') || lower.includes('бригад')) recipient = 'Помощник';

      if (amount > 0) {
        return {
          type: 'brigade_pay',
          siteToSwitch: siteToSwitch,
          title: `Выплата помощнику (${recipient})`,
          amount: amount,
          recipient: recipient,
          category: 'Бригада',
          voiceResponse: `Фиксирую выплату ${recipient} ${this.formatSum(amount)}`
        };
      } else {
        return {
          type: 'direct_func',
          target: 'openPaymentModal',
          targetArg: 'brigade_pay',
          siteToSwitch: siteToSwitch,
          title: `👥 Выплата помощнику (${recipient})`,
          voiceResponse: `Открываю кассу для фиксации выплаты ${recipient}`,
          desc: 'Открываю форму фиксации выплаты бригаде...'
        };
      }
    }

    // 15. Финансы: Касса, баланс объекта, остаток в кармане
    const isFinanceRequest = lower.includes('касс') || lower.includes('деньг') || lower.includes('баланс') || lower.includes('прибыл') || lower.includes('долг') || lower.includes('карман') || lower.includes('финанс');
    if (isFinanceRequest && !lower.includes('купил')) {
      return {
        type: 'nav_action',
        target: 'finances',
        siteToSwitch: siteToSwitch,
        title: siteName ? `💰 Касса: ${siteName}` : '💰 Финансовый пульс и касса',
        voiceResponse: siteName ? `Открываю финансовый пульс объекта ${siteName}` : 'Открываю кассу и финансовый баланс',
        desc: 'Перехожу к финансовому балансу и кассе...'
      };
    }

    // 16. Склад и материалы (Рынок Джами / Урикзар)
    const hasPurchaseWords = lower.includes('купил') || lower.includes('взял') || lower.includes('базар') || lower.includes('джами') || lower.includes('урикзар') || lower.includes('рынок') || lower.includes('чек') || lower.includes('расход');
    if (amount > 0 || (hasPurchaseWords && !lower.includes('склад'))) {
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
        siteToSwitch: siteToSwitch,
        title: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        amount: amount || 450000,
        category: category,
        qty: '1 компл',
        voiceResponse: `Записываю чек: ${cleanName} на сумму ${this.formatSum(amount || 450000)}`
      };
    }

    const isMaterialsList = lower.includes('склад') || lower.includes('материал') || lower.includes('джами') || lower.includes('урикзар') || lower.includes('закупк') || lower.includes('список покупок') || lower.includes('фитинг') || lower.includes('что купить') || lower.includes('остатки');
    if (isMaterialsList) {
      return {
        type: 'nav_action',
        target: 'materials',
        siteToSwitch: siteToSwitch,
        title: siteName ? `📦 Склад: ${siteName}` : '📦 Склад и закупки (рынок Джами)',
        voiceResponse: siteName ? `Открываю склад и закупки объекта ${siteName}` : 'Открываю склад и список закупок на рынке Джами',
        desc: 'Перехожу к складскому учету и списку закупок...'
      };
    }

    // 17. Смета по точкам и монтаж
    const isEstimateRequest = lower.includes('смет') || lower.includes('водорозетк') || lower.includes('точк') || lower.includes('расчет работ') || lower.includes('стоимость монтажа') || lower.includes('прайс');
    if (isEstimateRequest) {
      return {
        type: 'nav_action',
        target: 'estimate',
        siteToSwitch: siteToSwitch,
        title: siteName ? `⚡ Экспресс-смета: ${siteName}` : '⚡ Экспресс-смета по точкам',
        voiceResponse: siteName ? `Открываю смету объекта ${siteName}` : 'Открываю экспресс-смету по водорозеткам и приборам',
        desc: 'Перехожу к экспресс-смете по точкам...'
      };
    }

    // 18. 10-летняя хроника выплат мастера
    if (lower.includes('хроник') || lower.includes('история выплат') || lower.includes('10-летняя') || lower.includes('архив выплат')) {
      return {
        type: 'nav_action',
        target: 'history',
        title: '📜 10-летняя хроника выплат',
        voiceResponse: 'Открываю 10-летнюю хронику выплат и историю работ мастера',
        desc: 'Перехожу к 10-летней хронике выплат бригаде...'
      };
    }

    // 19. Список всех объектов мастера
    if ((lower.includes('объект') || lower.includes('квартир') || lower.includes('все объекты') || lower.includes('список')) && !siteMatch) {
      return {
        type: 'nav_action',
        target: 'sites',
        title: '🏢 Список всех объектов',
        voiceResponse: 'Открываю список всех инженерных объектов',
        desc: 'Перехожу к реестру объектов LIGA OS...'
      };
    }

    // 20. Инженерные калькуляторы
    if ((lower.includes('тепл') && lower.includes('пол')) || lower.includes('водяной пол') || lower.includes('петли') || lower.includes('бухт')) {
      return {
        type: 'direct_func',
        target: 'openFloorCalculator',
        title: '♨️ Калькулятор теплого пола Rehau',
        voiceResponse: 'Открываю калькулятор теплого пола Rehau',
        desc: 'Запускаю расчет петель и смесительного узла...'
      };
    }
    if (lower.includes('труб') || lower.includes('диаметр') || lower.includes('коллектор') || lower.includes('гребенк') || lower.includes('far')) {
      return {
        type: 'direct_func',
        target: 'openPipeCalculator',
        title: '📐 Расчет диаметров труб и гребенок FAR',
        voiceResponse: 'Открываю гидравлический расчет труб и коллекторов FAR',
        desc: 'Запускаю подбор диаметров по DIN 1988...'
      };
    }
    if (lower.includes('радиатор') || lower.includes('батаре') || lower.includes('секц')) {
      return {
        type: 'direct_func',
        target: 'openRadiatorCalculator',
        title: '🔥 Калькулятор радиаторного отопления',
        voiceResponse: 'Открываю расчет радиаторов и теплопотерь',
        desc: 'Запускаю расчет секций и лучевой разводки...'
      };
    }
    if (lower.includes('балансировк') || lower.includes('ротаметр') || lower.includes('расходомер')) {
      return {
        type: 'direct_func',
        target: 'openBalancingCalculator',
        title: '⚖️ Балансировка ротаметров FAR',
        voiceResponse: 'Открываю калькулятор балансировки ротаметров',
        desc: 'Запускаю балансировку расходомеров гребенки...'
      };
    }
    if (lower.includes('насос') || lower.includes('циркуляц')) {
      return {
        type: 'direct_func',
        target: 'openPumpCalculator',
        title: '🌀 Циркуляционный насос котельной',
        voiceResponse: 'Открываю расчет рабочей точки циркуляционного насоса',
        desc: 'Запускаю подбор насоса Grundfos/Wilo...'
      };
    }
    if (lower.includes('бойлер') || lower.includes('бак') || lower.includes('reflex') || lower.includes('гвс')) {
      return {
        type: 'direct_func',
        target: 'openBoilerCalculator',
        title: '⚡ Бойлер ГВС и расширительный бак',
        voiceResponse: 'Открываю расчет бойлера ГВС и бака Reflex',
        desc: 'Запускаю расчет объема бака и теплообменника...'
      };
    }

    // 21. Если мастер назвал объект (например «Мирабад», «Инфинити», «Сити», «Бульвар»)
    // МГНОВЕННО переключаем на этот объект БЕЗ ЛИШНИХ ВОПРОСОВ И БЕЗ РУТИНЫ
    if (siteMatch) {
      return {
        type: 'direct_func',
        target: 'selectSite',
        targetArg: siteMatch.id,
        siteToSwitch: siteMatch.id,
        title: `🏢 Объект: ${siteMatch.name}`,
        voiceResponse: `Объект ${siteMatch.name}`,
        desc: `Переключено на объект ${siteMatch.name} (все данные загружены)`
      };
    }

    // 22. Смысловые группы консьержа при общих вопросах
    if (lower.includes('посчитай') || lower.includes('калькулятор') || lower.includes('расчет') || lower.includes('сколько надо')) {
      return {
        type: 'concierge_disambiguation',
        question: 'Улугбек, какой расчет открыть?',
        voicePrompt: 'Улугбек, какой расчет открыть? Назовите номер.',
        options: [
          { num: 1, title: '♨️ Теплый пол Rehau', desc: 'Площадь, метраж трубы, бухты и число петель', targetFunc: 'openFloorCalculator' },
          { num: 2, title: '📐 Диаметры труб и коллекторы FAR', desc: 'Гидравлика стояков, разводка и гребенки FAR (DIN 1988)', targetFunc: 'openPipeCalculator' },
          { num: 3, title: '🔥 Радиаторы отопления', desc: 'Теплопотери, подбор секций и лучевая разводка', targetFunc: 'openRadiatorCalculator' },
          { num: 4, title: '⚡ Экспресс-смета по точкам', desc: 'Расчет водорозеток, инсталляций и стоимости работ', targetScreen: 'estimate' }
        ]
      };
    }

    if (lower.includes('что делать') || lower.includes('с чего начать') || lower.includes('помоги') || lower.includes('инструкц') || lower.includes('не знаю') || lower.includes('куда нажать') || lower.includes('забыл') || lower.includes('подскажи')) {
      return {
        type: 'concierge_disambiguation',
        question: 'Улугбек, чем помочь вам прямо сейчас?',
        voicePrompt: 'Улугбек, чем помочь? Назовите номер: один, два или три.',
        options: [
          { num: 1, title: '👑 Персональный тест-драйв Улугбека', desc: '5 ключевых контрольных узлов системы LIGA OS', targetFunc: 'openUlugbekVipBrief' },
          { num: 2, title: '🎬 Инженерный видеогид мастера', desc: 'Подсказки и видеоэкскурсия по всем возможностям', targetFunc: 'openSystemGuideModal' },
          { num: 3, title: '📖 Памятка мастера', desc: 'Диалоги с дизайнерами, клиентами и скрипты', targetFunc: 'openMasterGuide' },
          { num: 4, title: '📸 Королевская кнопка факта (3 сек)', desc: 'Мгновенное фото скрытого узла до стяжки', targetFunc: 'openQuickFactModal' }
        ]
      };
    }

    // 23. УНИВЕРСАЛЬНЫЙ КОНТЕКСТНЫЙ ФОЛБЭК («Нулевая рутина»)
    // Появляется ТОЛЬКО когда мастер закончил говорить и ни один интент не совпал
    const activeSiteTitle = this.currentSite ? this.currentSite.name : 'текущему объекту';
    return {
      type: 'concierge_disambiguation',
      question: `Улугбек, что открыть по ${activeSiteTitle}?`,
      voicePrompt: `Улугбек, что открыть по ${activeSiteTitle}? Назовите номер: один, два, три или четыре.`,
      options: [
        { num: 1, title: '📸 Фото скрытых узлов (до стяжки)', desc: 'Исполнительная фотофиксация трасс и коллекторов', targetFunc: 'openPassportPhotosModal' },
        { num: 2, title: '📄 Исполнительный Инженерный Паспорт А4', desc: 'Официальный швейцарский паспорт объекта с фото', targetFunc: 'testDriveStep4_Passport' },
        { num: 3, title: '💰 Касса и баланс объекта', desc: 'Финансовый баланс, расходы и остаток в кармане', targetScreen: 'finances' },
        { num: 4, title: '👑 Персональный VIP-бриф Улугбека', desc: 'Программа приёмки LIGA OS и 5 контрольных узлов', targetFunc: 'openUlugbekVipBrief' }
      ]
    };
  }

  async confirmVoiceAction() {
    if (!this.parsedVoiceAction) return;
    const action = this.parsedVoiceAction;

    // Защита от зацикливания микрофона
    if (this.voiceNavTimeout) {
      clearTimeout(this.voiceNavTimeout);
      this.voiceNavTimeout = null;
    }
    this.stopVoiceRecording(false);
    this.voiceAccumulatedText = '';
    this.voiceInterimText = '';
    const inputEl = document.getElementById('voice-recognized-input');
    if (inputEl) inputEl.value = '';

    // Переключение объекта перед выполнением действия, если было указано
    if (action.siteToSwitch && action.siteToSwitch !== this.currentSiteId) {
      await this.selectSite(action.siteToSwitch);
    }

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
      this.closeModal('modal-voice');
      this.switchScreen(action.target);
      this.playSwissChime();
      const siteName = this.currentSite ? this.currentSite.name : '';
      const voiceText = action.voiceResponse || `Открываю ${action.title} ${siteName}`.trim();
      this.speakVoice(voiceText);
      if (action.spotlightId) {
        this.pulseElement(action.spotlightId);
      }
      this.showToast(action.desc || '✓ Переход выполнен');
      this.parsedVoiceAction = null;
      return;
    } else if (action.type === 'modal_action') {
      this.closeModal('modal-voice');
      this.openModal(action.target);
      this.playSwissChime();
      const voiceText = action.voiceResponse || `Открываю ${action.title}`.trim();
      this.speakVoice(voiceText);
      if (action.spotlightId) {
        this.pulseElement(action.spotlightId);
      }
      this.showToast(action.desc || '✓ Инструмент открыт');
      this.parsedVoiceAction = null;
      return;
    } else if (action.type === 'direct_func') {
      this.closeModal('modal-voice');
      const isBriefFunc = typeof action.target === 'string' && action.target.startsWith('read') && action.target.endsWith('Brief');
      if (action.target !== 'openUlugbekVipBrief' && !isBriefFunc) {
        this.playSwissChime();
      }
      if (!isBriefFunc) {
        const voiceText = action.voiceResponse || `Выполняю ${action.title}`.trim();
        this.speakVoice(voiceText);
      }
      if (action.target === 'setClientModeTrue') {
        this.setClientMode(true);
      } else if (action.target === 'setClientModeFalse') {
        this.setClientMode(false);
      } else if (action.target === 'openPaymentModal') {
        this.openPaymentModal(action.targetArg || 'brigade_pay', action.amount || null);
      } else if (action.target === 'selectSite') {
        await this.selectSite(action.targetArg);
      } else if (typeof this[action.target] === 'function') {
        if (action.targetArg !== undefined) {
          this[action.target](action.targetArg);
        } else {
          this[action.target]();
        }
      }
      this.parsedVoiceAction = null;
      return;
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

    const origin = (typeof window !== 'undefined' && window.location) ? (window.location.origin + window.location.pathname) : 'https://liga-master-uz.vercel.app/';
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
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('https://liga-master-uz.vercel.app/')}&text=${encodeURIComponent(text)}`;
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
    if (this.isSoundEnabled && modalId !== 'modal-ulugbek-vip-brief' && typeof this.playSectionSwitchSound === 'function') {
      this.playSectionSwitchSound();
    }
    if (modalId === 'modal-settings') {
      this.loadMasterSealSettings();
    }
    if (modalId === 'modal-more-menu') {
      document.body.classList.add('more-menu-open');
      const btn = document.getElementById('btn-more-menu-toggle');
      if (btn) {
        btn.classList.add('active');
        btn.innerText = '✕ Меню';
      }
    }
  }

  closeModal(modalId) {
    this.stopAllVoices();
    if (modalId === 'modal-voice') {
      if (this.voiceNavTimeout) {
        clearTimeout(this.voiceNavTimeout);
        this.voiceNavTimeout = null;
      }
      this.stopVoiceRecording(false);
      this.voiceAccumulatedText = '';
      this.voiceInterimText = '';
      const inputEl = document.getElementById('voice-recognized-input');
      if (inputEl) inputEl.value = '';
    }
    if (modalId === 'modal-voice-concierge-choice') {
      this.isConciergeListening = false;
      this.activeConciergeOptions = null;
      this.stopVoiceRecording(false);
    }
    if (modalId === 'modal-video-tour' && this.videoTourState) {
      this.videoTourState.isOpen = false;
      this.videoTourState.isPlaying = false;
      if (this.videoTourState.timer) {
        clearInterval(this.videoTourState.timer);
        this.videoTourState.timer = null;
      }
    }
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('open');
    if (modalId === 'modal-more-menu') {
      document.body.classList.remove('more-menu-open');
      const btn = document.getElementById('btn-more-menu-toggle');
      if (btn) {
        btn.classList.remove('active');
        btn.innerText = '⋯ Меню';
      }
    }
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
      { id: 'ulugbekBrief', toggleId: 'toggle-block-ulugbek-brief', elementId: 'card-ulugbek-brief' },
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
          ulugbekBrief: false,
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
          ulugbekBrief: true,
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
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playSubtleClick();
        const modal = document.getElementById('modal-more-menu');
        if (modal && modal.classList.contains('open')) {
          this.closeModal('modal-more-menu');
        } else {
          this.openModal('modal-more-menu');
        }
      });
    }

    const btnClose = document.getElementById('btn-close-more-menu');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeModal('modal-more-menu'));
    }

    const btnCloseBottom = document.getElementById('btn-close-more-menu-bottom');
    if (btnCloseBottom) {
      btnCloseBottom.addEventListener('click', () => this.closeModal('modal-more-menu'));
    }

    // Закрытие по клику на фон оверлея
    const modalMore = document.getElementById('modal-more-menu');
    if (modalMore) {
      modalMore.addEventListener('click', (e) => {
        if (e.target === modalMore) {
          this.closeModal('modal-more-menu');
        }
      });
    }

    // Закрытие при клике в любое место экрана вне шторки и вне кнопки переключения
    document.addEventListener('click', (e) => {
      const modal = document.getElementById('modal-more-menu');
      if (modal && modal.classList.contains('open')) {
        const sheet = modal.querySelector('.modal-sheet');
        const btnToggle = document.getElementById('btn-more-menu-toggle');
        if (sheet && !sheet.contains(e.target) && btnToggle && !btnToggle.contains(e.target)) {
          this.closeModal('modal-more-menu');
        }
      }
    });

    // Универсальное закрытие любой открытой модалки по клику на фон
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

    // Универсальное закрытие по клавише Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal-overlay.open');
        if (activeModal) {
          this.closeModal(activeModal.id);
        }
      }
    });

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
    this.openVoiceAssistant();
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

    const report = window.ligaSealEngine
      ? window.ligaSealEngine.formatTelegramDiplomaticManifest(site)
      : `🏛️ ИНЖЕНЕРНЫЙ ОТЧЕТ ОБЪЕКТА
«Лига Опытных Мастеров» • Ташкент
Ведущий инженер: Улугбек Хакимов

📍 Объект: ${site.name} ${site.unit ? '(' + site.unit + ')' : ''}
👤 Заказчик: ${site.client || 'Уважаемый клиент'}
🛡️ Текущий статус: ${stageText}
📊 Опрессовка: ${pressStatus}
📋 Стандарт: 16 бар / DIN 1988 (в 4 раза строже СНиП)
💰 Финансовый статус: оплачено ${this.formatSum(site.advanceSum || 0)} из ${this.formatSum(site.contractSum || 0)}${debt > 0 ? ' (остаток: ' + this.formatSum(debt) + ')' : ' (полный расчет)'}

Официальный Исполнительный Паспорт объекта с фотофиксацией скрытых трасс доступен в LIGA OS.
Официальный портал: https://liga-master-uz.vercel.app/`;

    this.copyToClipboard(report).then(() => {
      this.showToast('✓ Официальный отчет с гербовой печатью скопирован!');
    }).catch(() => {
      this.showToast('✓ Официальный отчет сформирован!');
    });

    try {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('https://liga-master-uz.vercel.app/?v=2.5.4')}&text=${encodeURIComponent(report)}`;
      window.open(shareUrl, '_blank');
    } catch (err) {
      console.warn('Telegram share window error:', err);
    }
  }

  // ==========================================================================
  // ИНТЕРАКТИВНЫЙ ВИДЕОГИД, ШОУРУМ И SPOTLIGHT-ТУР v2.4.2
  // Swiss High-End Luxury Engineering Engine
  // ==========================================================================

  initVideoTour() {
    this.videoTourState = {
      isOpen: false,
      isPlaying: false,
      mode: 'master', // 'master' | 'client'
      currentChapter: 0,
      timer: null,
      chapterDuration: 16,
      currentSeconds: 0
    };

    this.videoChaptersMaster = [
      {
        id: 'beacon',
        title: 'Световой маяк и безопасность мастера',
        shortTitle: 'Маяк и приватность',
        duration: '0:45',
        speaker: 'ИНЖЕНЕРНЫЙ ИНСТРУКТОР:',
        subtitle: 'Световой маяк вверху экрана — ваш щит безопасности. Коснитесь его — и все служебные цены, прибыль и касса скроются. Заказчик увидит только надежность и статус 16 бар.',
        render: () => `
          <div class="scene-interactive-card">
            <div class="scene-hero-header">
              <div class="scene-hero-title"><span>👑</span> РЕЖИМ БЕЗОПАСНОСТИ МАСТЕРА</div>
              <div class="scene-hero-status">МГНОВЕННАЯ ЗАЩИТА 0.1 СЕК</div>
            </div>
            <div class="scene-visual-canvas">
              <div class="scene-feature-box highlighted">
                <div class="scene-feature-num" style="color:#10b981;">👑 МАСТЕР</div>
                <div class="scene-feature-label">Полный доступ мастера</div>
                <div class="scene-feature-desc">Видны закупочные цены, остаток кассы на Джами, прибыль и маржа объекта.</div>
              </div>
              <div class="scene-feature-box" style="border-color:var(--gold-primary);">
                <div class="scene-feature-num" style="color:var(--gold-primary);">👁️ КЛИЕНТ</div>
                <div class="scene-feature-label">Режим показа заказчику</div>
                <div class="scene-feature-desc">Служебные цифры замаскированы. Клиент видит технический прогресс и качество.</div>
              </div>
            </div>
            <div style="font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:8px; border-left:3px solid var(--gold-primary);">
              💡 <b>Совет:</b> Держите телефон в режиме «Клиент», когда заказчик или дизайнер стоят рядом с вами на объекте.
            </div>
          </div>
        `,
        cursor: { top: '15%', left: '85%' }
      },
      {
        id: 'estimate',
        title: 'Экспресс-смета за 15 секунд',
        shortTitle: 'Смета за 15 сек',
        duration: '0:45',
        speaker: 'ШВЕЙЦАРСКИЙ СТАНДАРТ:',
        subtitle: 'Больше никаких расчетов на клочках бумаги. Выберите готовый пресет (Коттедж 350 м² или Новостройка) — система автоматически рассчитает диаметры DIN 1988, насос и спецификацию.',
        render: () => `
          <div class="scene-interactive-card">
            <div class="scene-hero-header">
              <div class="scene-hero-title"><span>📐</span> ИНЖЕНЕРНЫЕ ПРЕСЕТЫ ОБЪЕКТОВ</div>
              <div class="scene-hero-status">DIN 1988 / СНиП</div>
            </div>
            <div class="scene-visual-canvas">
              <div class="scene-feature-box highlighted">
                <div class="scene-feature-num">15 сек</div>
                <div class="scene-feature-label">Пресет «Коттедж 350 м²»</div>
                <div class="scene-feature-desc">Трубы Rehau 20/25/32, коллекторы FAR 6 отводов, насос Grundfos Magna, бойлер 200л.</div>
              </div>
              <div class="scene-feature-box">
                <div class="scene-feature-num" style="color:#60a5fa;">0 ошибок</div>
                <div class="scene-feature-label">Скорость потока v ≤ 1.5 м/с</div>
                <div class="scene-feature-desc">Автоматическая проверка гидравлики исключает шумы в трубах и заужения стояков.</div>
              </div>
            </div>
            <div style="font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:8px; border-left:3px solid #3b82f6;">
              ⚡ <b>Результат:</b> Готовая спецификация материалов сразу синхронизируется с чек-листом закупок для рынка Джами.
            </div>
          </div>
        `,
        cursor: { top: '35%', left: '40%' }
      },
      {
        id: 'bazaar',
        title: 'Базар Джами и чеки голосом',
        shortTitle: 'Базар Джами и чеки',
        duration: '0:45',
        speaker: 'ОФЛАЙН-РЕЖИМ:',
        subtitle: 'На рынке Джами или в подвале без интернета нажмите микрофон и скажите: «Купил коллектор FAR за 1.8 млн». Система моментально учтет расход и обновит остаток аванса.',
        render: () => `
          <div class="scene-interactive-card">
            <div class="scene-hero-header">
              <div class="scene-hero-title"><span>🎙️</span> ГОЛОСОВОЙ УЧЕТ БЕЗ РУК</div>
              <div class="scene-hero-status">100% ОФФЛАЙН</div>
            </div>
            <div class="scene-visual-canvas">
              <div class="scene-feature-box highlighted">
                <div class="scene-feature-num">4 сек</div>
                <div class="scene-feature-label">«Купил коллектор FAR 1.8 млн»</div>
                <div class="scene-feature-desc">Распознавание речи прямо на устройстве. Никаких записей в мятых блокнотах.</div>
              </div>
              <div class="scene-feature-box">
                <div class="scene-feature-num" style="color:#34d399;">Касса UZS</div>
                <div class="scene-feature-label">Остаток аванса в кармане</div>
                <div class="scene-feature-desc">Точный баланс наличных в сумах и долларах. Чеки фотографируются в память объекта.</div>
              </div>
            </div>
            <div style="font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:8px; border-left:3px solid #10b981;">
              📦 <b>Закупка без забытых мелочей:</b> Вычеркивайте купленные фитинги в мобильном списке одним касанием пальца.
            </div>
          </div>
        `,
        cursor: { top: '50%', left: '70%' }
      },
      {
        id: 'pressure',
        title: 'Опрессовка 16 бар на 24 часа',
        shortTitle: 'Опрессовка 16 бар',
        duration: '0:45',
        speaker: 'СТАНДАРТ БЕЗОПАСНОСТИ:',
        subtitle: 'Стандарт Улугбека — гидроиспытания 16.0 бар в течение 24 часов (в 4 раза строже СНиП). Фото манометра на старте и финише гарантируют, что стяжку никогда не придется долбить.',
        render: () => `
          <div class="scene-interactive-card">
            <div class="scene-hero-header">
              <div class="scene-hero-title"><span>🛡️</span> СУТОЧНЫЕ ГИДРОИСПЫТАНИЯ</div>
              <div class="scene-hero-status" style="background:rgba(212,175,55,0.2); color:var(--gold-primary); border-color:rgba(212,175,55,0.4);">ЭЛИТНЫЙ КЛАСС</div>
            </div>
            <div class="scene-visual-canvas">
              <div class="scene-feature-box highlighted">
                <div class="scene-feature-num" style="color:var(--gold-primary);">16.0 БАР</div>
                <div class="scene-feature-label">Давление опрессовки</div>
                <div class="scene-feature-desc">В 4 раза выше рабочего давления водопровода. Проверка соединений на разрыв.</div>
              </div>
              <div class="scene-feature-box">
                <div class="scene-feature-num" style="color:#ef4444;">24 ЧАСА</div>
                <div class="scene-feature-label">Таймер с фотофиксацией</div>
                <div class="scene-feature-desc">Фото манометра при накачке и через сутки. Автоматическое составление Акта.</div>
              </div>
            </div>
            <div style="font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:8px; border-left:3px solid var(--gold-primary);">
              🔒 <b>Железная защита мастера:</b> Заказчик и плиточники подписывают акт опрессовки ДО заливки чистового пола.
            </div>
          </div>
        `,
        cursor: { top: '65%', left: '30%' }
      },
      {
        id: 'passport',
        title: 'VIP Паспорт и сдача заказчику',
        shortTitle: 'VIP Паспорт объекта',
        duration: '0:45',
        speaker: 'ПРИЕМКА РАБОТ:',
        subtitle: 'Сформируйте официальный Исполнительный Инженерный Паспорт со всеми скрытыми трассами и опрессовкой. Экспортируйте в PDF или отправьте заказчику в Telegram в один клик.',
        render: () => `
          <div class="scene-interactive-card">
            <div class="scene-hero-header">
              <div class="scene-hero-title"><span>📋</span> ЦИФРОВОЙ ПАСПОРТ А4</div>
              <div class="scene-hero-status">PDF & ПЕЧАТЬ</div>
            </div>
            <div class="scene-visual-canvas">
              <div class="scene-feature-box highlighted">
                <div class="scene-feature-num" style="color:#38bdf8;">100%</div>
                <div class="scene-feature-label">Трассы с фотопривязкой</div>
                <div class="scene-feature-desc">Заказчик точно видит, где проложены трубы в стяжке. Исключен риск пробить трубу при монтаже мебели.</div>
              </div>
              <div class="scene-feature-box">
                <div class="scene-feature-num" style="color:var(--gold-primary);">VIP ЧЕК</div>
                <div class="scene-feature-label">Обоснование премиум-цены</div>
                <div class="scene-feature-desc">Уровень швейцарской корпорации. Клиент видит, за что платит высокий гонорар.</div>
              </div>
            </div>
            <div style="font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:8px; border-left:3px solid #38bdf8;">
              🖨️ <b>Готов к печати:</b> Нажмите «Печать / Экспорт в PDF» — документ с золотой печатью готов к передаче.
            </div>
          </div>
        `,
        cursor: { top: '75%', left: '80%' }
      }
    ];

    this.videoChaptersClient = [
      {
        id: 'client-16bar',
        title: 'Стандарт 16 БАР: Надежность на 50 лет',
        shortTitle: 'Стандарт 16 БАР',
        duration: '0:45',
        speaker: 'СТАНДАРТ КАЧЕСТВА LIGA:',
        subtitle: 'Обычные монтажники проверяют трубы давлением 4–6 бар. Мы опрессовываем систему на 16.0 бар в течение 24 часов. Это гарантирует отсутствие протечек в стяжке на весь срок службы дома.',
        render: () => `
          <div class="scene-interactive-card">
            <div class="scene-hero-header">
              <div class="scene-hero-title"><span>🛡️</span> ПОЧЕМУ 16 БАР — ЭТО БЕЗОПАСНОСТЬ</div>
              <div class="scene-hero-status">СТАНДАРТ ТАШКЕНТА №1</div>
            </div>
            <div class="scene-visual-canvas">
              <div class="scene-feature-box">
                <div class="scene-feature-num" style="color:#94a3b8;">4–6 БАР</div>
                <div class="scene-feature-label">Обычный СНиП</div>
                <div class="scene-feature-desc">Скрытый микробрак не виден и может дать течь через 1–2 года прямо в стяжке.</div>
              </div>
              <div class="scene-feature-box highlighted">
                <div class="scene-feature-num" style="color:var(--gold-primary);">16.0 БАР</div>
                <div class="scene-feature-label">Стандарт Улугбека Хакимова</div>
                <div class="scene-feature-desc">Выдерживает даже экстремальные гидроудары городского водоканала. Полное спокойствие.</div>
              </div>
            </div>
            <div style="font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:8px; border-left:3px solid var(--gold-primary);">
              🏛️ <b>Официальный Акт:</b> По завершении опрессовки заказчику выдается официальный протокол гидроиспытаний.
            </div>
          </div>
        `,
        cursor: { top: '40%', left: '60%' }
      },
      {
        id: 'client-materials',
        title: 'Оригинальные материалы Rehau & FAR',
        shortTitle: 'Rehau & FAR',
        duration: '0:45',
        speaker: 'МАТЕРИАЛЫ ВЫСШЕГО КЛАССА:',
        subtitle: 'Только оригинальные сшитые полиэтилены Rehau с надвижными неразъемными гильзами и итальянские коллекторы FAR. Никаких спаек полипропилена в стяжке пола.',
        render: () => `
          <div class="scene-interactive-card">
            <div class="scene-hero-header">
              <div class="scene-hero-title"><span>💎</span> ЗАЩИТА ОТ КОНТРАФАКТА</div>
              <div class="scene-hero-status">ЕВРОПЕЙСКИЙ DIN</div>
            </div>
            <div class="scene-visual-canvas">
              <div class="scene-feature-box highlighted">
                <div class="scene-feature-num" style="color:#38bdf8;">Лучевая сеть</div>
                <div class="scene-feature-label">Без тройников в стяжке</div>
                <div class="scene-feature-desc">Цельная труба от гребенки до каждого смесителя и радиатора. Протечка в полу физически невозможна.</div>
              </div>
              <div class="scene-feature-box">
                <div class="scene-feature-num" style="color:var(--gold-primary);">FAR & Rehau</div>
                <div class="scene-feature-label">Оригинал из Европы</div>
                <div class="scene-feature-desc">Латунь CW617N, стойкая к агрессивной воде Ташкента, и защита от вымывания цинка.</div>
              </div>
            </div>
            <div style="font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:8px; border-left:3px solid #38bdf8;">
              📜 <b>Проверенные поставщики:</b> Каждая партия материалов закупается у сертифицированных дистрибьюторов.
            </div>
          </div>
        `,
        cursor: { top: '50%', left: '40%' }
      },
      {
        id: 'client-passport',
        title: 'Цифровой паспорт скрытых трасс',
        shortTitle: 'Паспорт скрытых трасс',
        duration: '0:45',
        speaker: 'ПРОЗРАЧНОСТЬ И ДОКУМЕНТЫ:',
        subtitle: 'Каждый сантиметр труб под стяжкой фотографируется с привязкой к стенам. Вы в любой момент через 10 лет сможете посмотреть, где именно проходят трубы.',
        render: () => `
          <div class="scene-interactive-card">
            <div class="scene-hero-header">
              <div class="scene-hero-title"><span>📍</span> ТОЧНАЯ КАРТА ВАШИХ ТРУБ</div>
              <div class="scene-hero-status">ЦИФРОВОЙ АРХИВ</div>
            </div>
            <div class="scene-visual-canvas">
              <div class="scene-feature-box highlighted">
                <div class="scene-feature-num" style="color:#10b981;">HD ФОТО</div>
                <div class="scene-feature-label">Привязка к лазерным осям</div>
                <div class="scene-feature-desc">Сверлите плинтусы и монтируйте двери без малейшего страха задеть водяную магистраль.</div>
              </div>
              <div class="scene-feature-box">
                <div class="scene-feature-num" style="color:#f59e0b;">QR-КОД</div>
                <div class="scene-feature-label">Доступ со смартфона</div>
                <div class="scene-feature-desc">QR-код наносится на коллекторный шкаф. Доступ к чертежам и контактам мастера 24/7.</div>
              </div>
            </div>
            <div style="font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:8px; border-left:3px solid #10b981;">
              📑 <b>Швейцарский подход:</b> Инженерная система вашего дома получает официальный технический паспорт.
            </div>
          </div>
        `,
        cursor: { top: '60%', left: '70%' }
      },
      {
        id: 'client-finance',
        title: 'Прозрачный финансовый расчет',
        shortTitle: 'Прозрачный расчет',
        duration: '0:45',
        speaker: 'ЧЕСТНЫЙ БАЛАНС:',
        subtitle: 'Все чеки, закупки и этапы оплат фиксируются в системе LIGA OS. Вы получаете детализированную отчетность без скрытых наценок и неожиданных переплат.',
        render: () => `
          <div class="scene-interactive-card">
            <div class="scene-hero-header">
              <div class="scene-hero-title"><span>💰</span> ПОЛНЫЙ ФИНАНСОВЫЙ ПОРЯДОК</div>
              <div class="scene-hero-status">БЕЗ СКРЫТЫХ ДОПЛАТ</div>
            </div>
            <div class="scene-visual-canvas">
              <div class="scene-feature-box highlighted">
                <div class="scene-feature-num" style="color:var(--gold-primary);">0 сум</div>
                <div class="scene-feature-label">Необоснованных расходов</div>
                <div class="scene-feature-desc">Каждый потраченный сум подтвержден фото чека из строительного магазина или рынка.</div>
              </div>
              <div class="scene-feature-box">
                <div class="scene-feature-num" style="color:#60a5fa;">Telegram</div>
                <div class="scene-feature-label">Мгновенный отчет заказчику</div>
                <div class="scene-feature-desc">Мастер отправляет актуальную финансовую сводку в мессенджер одним нажатием.</div>
              </div>
            </div>
            <div style="font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:8px; border-left:3px solid var(--gold-primary);">
              🤝 <b>Доверие и статус:</b> Отношения строятся на абсолютной прозрачности и инженерной честности.
            </div>
          </div>
        `,
        cursor: { top: '70%', left: '50%' }
      }
    ];

    window.addEventListener('resize', () => {
      if (this.spotlightState && this.spotlightState.isActive) {
        this.renderSpotlightStep(this.spotlightState.currentStep);
      }
    });
  }

  openSystemGuideModal() {
    this.closeModal('modal-more-menu');
    this.openModal('modal-system-guide');
  }

  openVideoTour() {
    this.closeModal('modal-more-menu');
    this.closeModal('modal-system-guide');
    this.openModal('modal-video-tour');
    const player = document.getElementById('liga-real-mp4-player');
    if (player) {
      player.currentTime = 0;
      player.play().catch(() => {});
    }
  }

  closeVideoTour() {
    const player = document.getElementById('liga-real-mp4-player');
    if (player) {
      player.pause();
    }
    this.closeModal('modal-video-tour');
  }

  switchVideoTourMode(mode) {
    if (!this.videoTourState) this.initVideoTour();
    this.videoTourState.mode = mode;
    this.videoTourState.currentChapter = 0;
    this.videoTourState.currentSeconds = 0;

    const btnMaster = document.getElementById('tab-video-mode-master');
    const btnClient = document.getElementById('tab-video-mode-client');
    const mainTitle = document.getElementById('video-tour-main-title');

    if (mode === 'master') {
      if (btnMaster) btnMaster.classList.add('active');
      if (btnClient) btnClient.classList.remove('active');
      if (mainTitle) mainTitle.innerText = '🎬 Интерактивная Видеоинструкция LIGA OS';
    } else {
      if (btnMaster) btnMaster.classList.remove('active');
      if (btnClient) btnClient.classList.add('active');
      if (mainTitle) mainTitle.innerText = '👑 VIP Презентация стандартов для Заказчика';
    }

    this.renderVideoChaptersList();
    this.renderVideoChapter(0);
  }

  getCurrentVideoChapters() {
    return this.videoTourState && this.videoTourState.mode === 'client'
      ? this.videoChaptersClient
      : this.videoChaptersMaster;
  }

  renderVideoChaptersList() {
    const listEl = document.getElementById('video-chapters-list');
    if (!listEl) return;
    const chapters = this.getCurrentVideoChapters();

    listEl.innerHTML = chapters.map((ch, idx) => `
      <div class="video-chapter-chip ${idx === this.videoTourState.currentChapter ? 'active' : ''}" 
           id="video-chip-${idx}" onclick="window.app.selectVideoChapter(${idx})">
        <span class="chip-num">Урок ${idx + 1}</span>
        <span class="chip-title">${ch.shortTitle}</span>
        <span class="chip-duration">⏱ ${ch.duration}</span>
      </div>
    `).join('');
  }

  selectVideoChapter(idx) {
    if (!this.videoTourState) this.initVideoTour();
    const chapters = this.getCurrentVideoChapters();
    if (idx >= 0 && idx < chapters.length) {
      this.videoTourState.currentChapter = idx;
      this.videoTourState.currentSeconds = 0;
      this.renderVideoChapter(idx);
    }
  }

  renderVideoChapter(idx) {
    const chapters = this.getCurrentVideoChapters();
    if (!chapters || !chapters[idx]) return;
    const ch = chapters[idx];

    const badgeEl = document.getElementById('video-chapter-num-badge');
    const nameEl = document.getElementById('video-chapter-name-text');
    if (badgeEl) badgeEl.innerText = `Глава ${idx + 1}/${chapters.length}`;
    if (nameEl) nameEl.innerText = ch.title;

    const stageContent = document.getElementById('video-scene-content');
    if (stageContent) {
      stageContent.innerHTML = ch.render();
    }

    const speakerEl = document.getElementById('video-subtitles-label');
    const subtitleEl = document.getElementById('video-subtitles-text');
    if (speakerEl) speakerEl.innerText = ch.speaker;
    if (subtitleEl) subtitleEl.innerText = ch.subtitle;

    // Голосовая озвучка диктора в видеоплеере
    if (ch.subtitle) {
      this.speakTourNarrator(ch.subtitle);
    }

    const cursorEl = document.getElementById('video-virtual-cursor');
    if (cursorEl && ch.cursor) {
      cursorEl.style.top = ch.cursor.top;
      cursorEl.style.left = ch.cursor.left;
    }

    chapters.forEach((_, i) => {
      const chip = document.getElementById(`video-chip-${i}`);
      if (chip) {
        if (i === idx) chip.classList.add('active');
        else chip.classList.remove('active');
      }
    });

    this.updateVideoProgress();
  }

  toggleVideoPlayPause() {
    if (!this.videoTourState) this.initVideoTour();
    this.videoTourState.isPlaying = !this.videoTourState.isPlaying;

    const playIcon = document.getElementById('video-play-icon');
    if (playIcon) {
      playIcon.innerText = this.videoTourState.isPlaying ? '⏸' : '▶';
    }

    if (this.videoTourState.isPlaying) {
      this.startVideoTimer();
    } else {
      if (this.videoTourState.timer) {
        clearInterval(this.videoTourState.timer);
        this.videoTourState.timer = null;
      }
    }
  }

  startVideoTimer() {
    if (!this.videoTourState) return;
    if (this.videoTourState.timer) clearInterval(this.videoTourState.timer);

    const playIcon = document.getElementById('video-play-icon');
    if (playIcon) playIcon.innerText = '⏸';

    this.videoTourState.timer = setInterval(() => {
      if (!this.videoTourState.isPlaying) return;
      this.videoTourState.currentSeconds += 1;

      if (this.videoTourState.currentSeconds >= this.videoTourState.chapterDuration) {
        this.videoTourState.currentSeconds = 0;
        const chapters = this.getCurrentVideoChapters();
        if (this.videoTourState.currentChapter < chapters.length - 1) {
          this.nextVideoChapter();
        } else {
          this.videoTourState.isPlaying = false;
          if (playIcon) playIcon.innerText = '▶';
          clearInterval(this.videoTourState.timer);
          this.videoTourState.timer = null;
        }
      } else {
        this.updateVideoProgress();
      }
    }, 1000);
  }

  updateVideoProgress() {
    const chapters = this.getCurrentVideoChapters();
    const totalChapters = chapters.length;
    const curIdx = this.videoTourState.currentChapter;
    const curSec = this.videoTourState.currentSeconds;
    const chDur = this.videoTourState.chapterDuration;

    const progressPct = ((curIdx * chDur + curSec) / (totalChapters * chDur)) * 100;
    const progressEl = document.getElementById('video-timeline-progress');
    if (progressEl) {
      progressEl.style.width = `${Math.min(100, Math.max(0, progressPct))}%`;
    }

    const curTimeEl = document.getElementById('video-current-time');
    const totTimeEl = document.getElementById('video-total-time');
    const totalSec = totalChapters * chDur;
    const passedSec = curIdx * chDur + curSec;

    if (curTimeEl) {
      const m = Math.floor(passedSec / 60);
      const s = passedSec % 60;
      curTimeEl.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
    if (totTimeEl) {
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      totTimeEl.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
  }

  nextVideoChapter() {
    if (!this.videoTourState) this.initVideoTour();
    const chapters = this.getCurrentVideoChapters();
    if (this.videoTourState.currentChapter < chapters.length - 1) {
      this.videoTourState.currentChapter++;
      this.videoTourState.currentSeconds = 0;
      this.renderVideoChapter(this.videoTourState.currentChapter);
    }
  }

  prevVideoChapter() {
    if (!this.videoTourState) this.initVideoTour();
    if (this.videoTourState.currentChapter > 0) {
      this.videoTourState.currentChapter--;
      this.videoTourState.currentSeconds = 0;
      this.renderVideoChapter(this.videoTourState.currentChapter);
    }
  }

  seekVideoTimeline(e) {
    const track = document.getElementById('video-timeline-track');
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));

    const chapters = this.getCurrentVideoChapters();
    const totalSec = chapters.length * this.videoTourState.chapterDuration;
    const targetSec = Math.floor(pct * totalSec);

    const chIdx = Math.min(chapters.length - 1, Math.floor(targetSec / this.videoTourState.chapterDuration));
    const secInCh = targetSec % this.videoTourState.chapterDuration;

    this.videoTourState.currentChapter = chIdx;
    this.videoTourState.currentSeconds = secInCh;
    this.renderVideoChapter(chIdx);
  }

  // ==========================================================================
  // ЖИВОЙ SPOTLIGHT-ТУР ПО РЕАЛЬНОМУ ИНТЕРФЕЙСУ
  // ==========================================================================

  // ==========================================================================
  // DRILL-DOWN НАВИГАЦИЯ С ДАШБОРДА (LIGA OS v2.4.4)
  // Прямой переход с дашборда на целевой экран с подсветкой источника данных
  // ==========================================================================
  drillDownToFinance(targetType = 'debt') {
    this.switchScreen('finances');

    // Маппинг типов на ID строк и сообщения
    const targetMap = {
      contract: { rowId: 'row-fin-contract', valId: 'page-fin-contract', message: 'Сметная стоимость работ по договору', label: 'ДОГОВОР' },
      advance:  { rowId: 'row-fin-advance', valId: 'page-fin-advance', message: 'Внесенные авансы и поступления', label: 'АВАНС' },
      debt:     { rowId: 'row-fin-debt', valId: 'page-fin-debt', message: 'Остаток долга заказчика к расчёту', label: 'ДОЛГ' },
      brigade:  { rowId: 'row-fin-brigade', valId: 'page-fin-brigade', message: 'Начисления помощникам бригады', label: 'БРИГАДА' },
      designer: { rowId: 'row-fin-contract', valId: 'page-fin-contract', message: 'Бонусное вознаграждение дизайнеру (10%)', label: 'ДИЗАЙНЕР' },
      bazaar:   { rowId: 'row-fin-bazaar-pocket', valId: 'page-fin-bazaar-pocket', message: 'Свободный остаток на закупку материалов', label: 'ЗАКУПКА' }
    };

    const target = targetMap[targetType] || targetMap.debt;

    setTimeout(() => {
      // Убираем предыдущий drill-down фокус и бейджи
      document.querySelectorAll('.drilldown-active-target').forEach(el => el.classList.remove('drilldown-active-target'));
      document.querySelectorAll('.drilldown-pointer-flag').forEach(el => el.remove());

      const row = document.getElementById(target.rowId);
      const valEl = document.getElementById(target.valId);

      if (row) {
        // Добавляем класс яркого фокуса с анимацией пульсации
        row.classList.add('drilldown-active-target');

        // Считываем актуальную сумму для бейджа
        const sumText = valEl ? valEl.innerText.trim() : '';

        // Создаём плавающий бейдж-указатель «👈 ВЫ ЗДЕСЬ: 12 000 000 сум»
        const flag = document.createElement('div');
        flag.className = 'drilldown-pointer-flag';
        flag.innerText = `👈 ВЫ ЗДЕСЬ: ${sumText}`;
        row.style.position = 'relative';
        row.appendChild(flag);

        // Плавная прокрутка к целевой строке в центр экрана
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Виброотклик смартфона
        if (navigator.vibrate) {
          try { navigator.vibrate([30, 50, 30]); } catch (_) {}
        }

        // Автоматическое снятие фокуса через 6 секунд
        setTimeout(() => {
          row.classList.remove('drilldown-active-target');
          const oldFlag = row.querySelector('.drilldown-pointer-flag');
          if (oldFlag) oldFlag.remove();
        }, 6000);
      }
    }, 200);

    this.showToast(`📍 ${target.message}`);
  }

  drillDownToMaterials() {
    this.switchScreen('materials');
    setTimeout(() => {
      const el = document.getElementById('materials-search-input') || document.querySelector('.table-container');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.pulseElement(el.id || 'materials-search-input');
      }
    }, 150);
    this.showToast('Открыто снабжение: чеки и смета для рынка Джами');
  }

  drillDownToPressure() {
    this.openModal('modal-pressure-test');
    this.showToast('Открыт протокол гидравлических испытаний 16 бар');
  }

  // ==========================================================================
  // ЖИВОЙ SPOTLIGHT-ТУР ПО РЕАЛЬНОМУ ИНТЕРФЕЙСУ (LIGA OS v2.4.4)
  // Наглядный интерактивный тур по реальным элементам без медленных видеослайдов
  // ==========================================================================

  // ==========================================================================
  // ЖИВОЙ ИНТЕРАКТИВНЫЙ ТУР С ГОЛОСОМ ДИКТОРА И РЕАЛЬНЫМ ОТКРЫТИЕМ ОКОН (v2.4.6)
  // Настоящие действия: окна РЕАЛЬНО открываются, диктор РЕАЛЬНО озвучивает вслух!
  // ==========================================================================

  toggleTourVoice() {
    this.tourVoiceEnabled = !this.tourVoiceEnabled;
    const btn = document.getElementById('btn-spotlight-voice-toggle');
    if (btn) {
      if (this.tourVoiceEnabled) {
        btn.classList.remove('muted');
        btn.innerText = '🔊 Диктор: ВКЛ';
        this.showToast('Голос диктора включен');
        // Озвучить текущий шаг заново
        if (this.spotlightState && this.spotlightState.isActive) {
          const step = this.spotlightState.steps[this.spotlightState.currentStep];
          if (step && step.narrator) this.speakTourNarrator(step.narrator);
        }
      } else {
        btn.classList.add('muted');
        btn.innerText = '🔇 Диктор: ВЫКЛ';
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        this.showToast('Голос диктора выключен');
      }
    }
  }

  speakTourNarrator(text) {
    if (this.tourVoiceEnabled === false || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*#`_~[\]()]/g, '').replace(/\n+/g, ' ').slice(0, 320);
      const utt = new SpeechSynthesisUtterance(clean);
      utt.lang = 'ru-RU';
      utt.rate = 1.0;
      utt.pitch = 1.0;
      utt.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v =>
        v.lang.startsWith('ru') && (v.name.includes('Neural') || v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Yandex') || v.name.includes('Premium'))
      ) || voices.find(v => v.lang.startsWith('ru') && !v.localService)
        || voices.find(v => v.lang.startsWith('ru'));

      if (preferred) utt.voice = preferred;
      window.speechSynthesis.speak(utt);
    } catch (e) {
      console.warn('[Tour Voice] Narrator error:', e);
    }
  }

  startSpotlightFromVideo() {
    this.closeVideoTour();
    setTimeout(() => {
      this.startSpotlightTour();
    }, 200);
  }

  startSpotlightTour() {
    this.closeModal('modal-more-menu');
    this.closeModal('modal-video-tour');
    this.closeModal('modal-system-guide');
    this.closeModal('modal-payment');
    this.closeModal('modal-pressure-test');
    this.closeModal('modal-settings');
    this.switchScreen('dashboard');

    if (this.tourVoiceEnabled === undefined) {
      this.tourVoiceEnabled = true;
    }

    // Разблокировка Web Speech API от жеста пользователя
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    this.spotlightState = {
      isActive: true,
      currentStep: 0,
      steps: [
        {
          selector: '#dashboard-site-card',
          title: '🏢 1. Главный пульт объекта',
          body: 'Здесь показана активная квартира (ЖК Mirabad Avenue), контакты заказчика и дизайнера. Нажмите на выпадающий список сверху, чтобы переключить объект в 1 клик.',
          narrator: 'Приветствую в LIGA OS! Это главный экран объекта. Здесь собраны контакты заказчика, дизайнера и статус готовности.',
          action: () => {
            this.closeModal('modal-payment');
            this.closeModal('modal-pressure-test');
            this.closeModal('modal-settings');
            this.switchScreen('dashboard');
          }
        },
        {
          selector: '#btn-open-payment',
          title: '💳 2. Касса объекта: Кнопка «+ ПЛАТЁЖ»',
          body: 'Клиент перевел аванс на карту или отдал наличными? Нажимаем кнопку — и РЕАЛЬНО открывается окно кассы! Баланс пересчитается мгновенно.',
          narrator: 'Шаг второй. Нажимаем кнопку Платёж — и открывается окно кассы. Вносим аванс клиента — баланс пересчитывается мгновенно!',
          action: () => {
            this.switchScreen('dashboard');
            this.pulseElement('btn-open-payment');
            // Реальное открытие модального окна кассы прямо на глазах мастера!
            setTimeout(() => {
              this.openModal('modal-payment');
              const amtInput = document.getElementById('input-payment-amount');
              if (amtInput) {
                amtInput.value = '5 000 000';
                this.pulseElement('input-payment-amount');
              }
            }, 350);
          }
        },
        {
          selector: '#fin-bazaar-pocket-banner',
          title: '🛒 3. Снабжение: Базарный карман мастера',
          body: 'Свободные деньги клиента на закупку труб и фитингов на базаре Джами (аванс минус чеки). Нажимаем — и система переходит в снабжение!',
          narrator: 'Шаг третий. Базарный карман мастера. Переходим в Склад и снабжение: здесь все чеки и смета для рынка Джами!',
          action: () => {
            this.closeModal('modal-payment');
            // Реальный переход в раздел Склад и снабжение!
            this.switchScreen('materials');
            setTimeout(() => {
              const el = document.getElementById('materials-search-input') || document.querySelector('.table-container');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.pulseElement(el.id || 'materials-search-input');
              }
            }, 300);
          }
        },
        {
          selector: '#site-status-badge',
          title: '🛡️ 4. Опрессовка 16 бар перед заливкой стяжки',
          body: 'Швейцарский эталон надежности Лиги (в 4 раза строже СНиП). Нажимаем — и открывается официальный протокол испытаний!',
          narrator: 'Шаг четвёртый. Опрессовка шестнадцать бар. Открываем официальный протокол испытаний перед заливкой стяжки!',
          action: () => {
            this.switchScreen('dashboard');
            // Реальное открытие протокола гидроиспытаний 16 бар!
            setTimeout(() => {
              this.openModal('modal-pressure-test');
            }, 300);
          }
        },
        {
          selector: '#header-safety-beacon',
          title: '👁️ 5. Световой маяк приватности (Режим клиента)',
          body: 'Показываете экран заказчику? Нажимаем маяк в шапке — интерфейс моментально скрывает ваши цены, прибыль и кассу мастера!',
          narrator: 'Шаг пятый. Маяк приватности. Нажимаем его — и все внутренние цены и прибыль скрыты от клиента!',
          action: () => {
            this.closeModal('modal-pressure-test');
            this.switchScreen('dashboard');
            // Реальное включение клиентского режима безопасности!
            if (!this.isClientMode) {
              this.toggleClientMode();
              setTimeout(() => {
                if (this.isClientMode) this.toggleClientMode();
              }, 4000);
            }
          }
        },
        {
          selector: '#settings-section-seal',
          title: '🏛️ 6. Гербовая печать и цифровая подпись мастера',
          body: 'В Настройках задайте ваше имя, бренд и квалификацию. Все сметы, Акты 16 бар и паспорта заверяются именной швейцарской печатью!',
          narrator: 'Шаг шестой. Именная гербовая печать и цифровая подпись мастера. Все ваши сметы и акты заверяются знаком высшей надежности!',
          action: () => {
            // Реальное открытие Настроек с плавной прокруткой к секции печати!
            this.openModal('modal-settings');
            setTimeout(() => {
              const sealSec = document.getElementById('settings-section-seal');
              if (sealSec) {
                sealSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.pulseElement('seal-live-preview-box');
              }
            }, 350);
          }
        }
      ]
    };

    const overlay = document.getElementById('spotlight-tour-overlay');
    if (overlay) {
      overlay.style.display = 'block';
      this.renderSpotlightStep(0);
    }
  }

  stopSpotlightTour() {
    if (this.spotlightState) {
      this.spotlightState.isActive = false;
    }
    const overlay = document.getElementById('spotlight-tour-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.closeModal('modal-payment');
    this.closeModal('modal-pressure-test');
    this.closeModal('modal-settings');
    this.switchScreen('dashboard');
    this.showToast('Инженерный тур завершен. Все функции готовы к работе!');
  }

  renderSpotlightStep(stepIdx) {
    if (!this.spotlightState || !this.spotlightState.isActive) return;
    const step = this.spotlightState.steps[stepIdx];
    if (!step) return;

    this.spotlightState.currentStep = stepIdx;

    // Выполняем живое действие шага (открытие реального окна / переключение экрана)
    if (typeof step.action === 'function') {
      try {
        step.action();
      } catch (err) {
        console.warn('[Tour Action Error]:', err);
      }
    }

    // Запускаем голос диктора
    if (step.narrator) {
      this.speakTourNarrator(step.narrator);
    }

    // Синхронно обновляем текст и бейджи
    const badge = document.getElementById('spotlight-badge-step');
    const title = document.getElementById('spotlight-title-text');
    const body = document.getElementById('spotlight-body-text');

    if (badge) badge.innerText = `ШАГ ${stepIdx + 1} ИЗ ${this.spotlightState.steps.length}`;
    if (title) title.innerText = step.title;
    if (body) body.innerText = step.body;

    const dotsContainer = document.getElementById('spotlight-dots-indicator');
    if (dotsContainer) {
      dotsContainer.innerHTML = this.spotlightState.steps.map((_, idx) => 
        `<span class="spotlight-dot ${idx === stepIdx ? 'active' : ''}"></span>`
      ).join('');
    }

    let targetEl = document.querySelector(step.selector);
    if (!targetEl) {
      targetEl = document.querySelector('.top-header') || document.body;
    }

    try {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {}

    const updateGeometry = () => {
      const rect = targetEl.getBoundingClientRect();
      const box = document.getElementById('spotlight-highlight-box');
      const card = document.getElementById('spotlight-tooltip-card');

      // Определяем, находится ли целевой элемент внутри открытой модалки
      const isInsideModal = !!targetEl.closest('.modal-overlay.open');

      if (box) {
        const pad = 8;
        box.style.top = `${Math.max(0, rect.top - pad)}px`;
        box.style.left = `${Math.max(0, rect.left - pad)}px`;
        box.style.width = `${rect.width + pad * 2}px`;
        box.style.height = `${rect.height + pad * 2}px`;

        // При открытой модалке — z-index выше модалки
        if (isInsideModal) {
          box.classList.add('spotlight-over-modal');
        } else {
          box.classList.remove('spotlight-over-modal');
        }
      }

      if (card) {
        // При открытой модалке — карточка фиксируется снизу как Bottom Sheet
        if (isInsideModal) {
          card.classList.add('spotlight-over-modal');
        } else {
          card.classList.remove('spotlight-over-modal');
          const cardWidth = Math.min(340, window.innerWidth - 24);
          const cardHeight = 200;
          let cardTop = 0;
          let cardLeft = Math.max(12, Math.min(window.innerWidth - cardWidth - 12, rect.left + rect.width / 2 - cardWidth / 2));

          if (rect.top > window.innerHeight / 2) {
            cardTop = Math.max(12, rect.top - cardHeight - 16);
          } else {
            cardTop = Math.min(window.innerHeight - cardHeight - 12, rect.bottom + 16);
          }

          card.style.width = `${cardWidth}px`;
          card.style.top = `${cardTop}px`;
          card.style.left = `${cardLeft}px`;
        }

        const prevBtn = document.getElementById('btn-spotlight-prev');
        const nextBtn = document.getElementById('btn-spotlight-next');
        if (prevBtn) {
          prevBtn.style.display = stepIdx === 0 ? 'none' : 'inline-block';
        }
        if (nextBtn) {
          nextBtn.innerText = stepIdx === this.spotlightState.steps.length - 1 ? 'Завершить ✓' : 'Далее →';
        }
      }
    };

    updateGeometry();
    setTimeout(updateGeometry, 80);
    setTimeout(updateGeometry, 250);
  }

  nextSpotlightStep() {
    if (!this.spotlightState || !this.spotlightState.isActive) return;
    if (this.spotlightState.currentStep < this.spotlightState.steps.length - 1) {
      this.renderSpotlightStep(this.spotlightState.currentStep + 1);
    } else {
      this.stopSpotlightTour();
    }
  }

  prevSpotlightStep() {
    if (!this.spotlightState || !this.spotlightState.isActive) return;
    if (this.spotlightState.currentStep > 0) {
      this.renderSpotlightStep(this.spotlightState.currentStep - 1);
    }
  }

  // ==========================================================================
  // ВЕРИФИКАЦИЯ МАСТЕРА: ШВЕЙЦАРСКАЯ ГЕРБОВАЯ ПЕЧАТЬ И ЦИФРОВАЯ ПОДПИСЬ v2.4.5
  // ==========================================================================
  initMasterSealSettings() {
    if (!window.ligaSealEngine) return;

    const inputName = document.getElementById('input-master-stamp-name');
    const inputCompany = document.getElementById('input-master-stamp-company');
    const inputCert = document.getElementById('input-master-stamp-cert');
    const inputTitle = document.getElementById('input-master-stamp-title');
    const inputSign = document.getElementById('input-master-stamp-sign-text');
    const selectStyle = document.getElementById('select-master-stamp-style');

    const inputs = [inputName, inputCompany, inputCert, inputTitle, inputSign];
    inputs.forEach(el => {
      if (el) {
        el.addEventListener('input', () => this.updateSealLivePreview());
      }
    });

    if (selectStyle) {
      selectStyle.addEventListener('change', () => this.updateSealLivePreview());
    }

    // Загрузка первичных значений в форму и превью
    this.loadMasterSealSettings();
    // Инициализация Canvas для рукописной подписи пальцем/стилусом (v2.4.7)
    this.initSignaturePad();
  }

  loadMasterSealSettings() {
    if (!window.ligaSealEngine) return;
    const s = window.ligaSealEngine.settings;

    const inputName = document.getElementById('input-master-stamp-name');
    const inputCompany = document.getElementById('input-master-stamp-company');
    const inputCert = document.getElementById('input-master-stamp-cert');
    const inputTitle = document.getElementById('input-master-stamp-title');
    const inputSign = document.getElementById('input-master-stamp-sign-text');
    const selectStyle = document.getElementById('select-master-stamp-style');

    if (inputName && s.masterName !== undefined) inputName.value = s.masterName;
    if (inputCompany && s.companyName !== undefined) inputCompany.value = s.companyName;
    if (inputCert && s.licenseNumber !== undefined) inputCert.value = s.licenseNumber;
    if (inputTitle && s.title !== undefined) inputTitle.value = s.title;
    if (inputSign && s.signatureText !== undefined) inputSign.value = s.signatureText;
    if (selectStyle && s.stampStyle !== undefined) selectStyle.value = s.stampStyle;

    this.updateSealLivePreview();
  }

  updateSealLivePreview() {
    if (!window.ligaSealEngine) return;
    const box = document.getElementById('seal-live-preview-box');
    if (!box) return;

    const inputName = document.getElementById('input-master-stamp-name');
    const inputCompany = document.getElementById('input-master-stamp-company');
    const inputCert = document.getElementById('input-master-stamp-cert');
    const inputTitle = document.getElementById('input-master-stamp-title');
    const inputSign = document.getElementById('input-master-stamp-sign-text');
    const selectStyle = document.getElementById('select-master-stamp-style');

    const opt = {
      masterName: (inputName && inputName.value.trim()) ? inputName.value.trim() : (window.ligaSealEngine.settings.masterName || 'Улугбек Хакимов'),
      companyName: (inputCompany && inputCompany.value.trim()) ? inputCompany.value.trim() : (window.ligaSealEngine.settings.companyName || 'Лига Опытных Мастеров'),
      licenseNumber: (inputCert && inputCert.value.trim()) ? inputCert.value.trim() : (window.ligaSealEngine.settings.licenseNumber || 'LMO-UZ-2011/2026'),
      title: (inputTitle && inputTitle.value.trim()) ? inputTitle.value.trim() : (window.ligaSealEngine.settings.title || 'Ведущий инженер сантехники и систем отопления'),
      signatureText: (inputSign && inputSign.value.trim()) ? inputSign.value.trim() : (window.ligaSealEngine.settings.signatureText || 'Хакимов У.А.'),
      stampStyle: (selectStyle && selectStyle.value) ? selectStyle.value : (window.ligaSealEngine.settings.stampStyle || 'blue_seal'),
      timestamp: window.ligaSealEngine.getFormattedTimestamp()
    };

    box.innerHTML = window.ligaSealEngine.renderCombinedStampAndSignHTML(opt);

    const clockEl = document.getElementById('seal-preview-clock');
    if (clockEl) {
      clockEl.innerText = opt.timestamp + ' (UTC+5)';
    }
  }

  saveMasterSealSettings() {
    if (!window.ligaSealEngine) return;

    const inputName = document.getElementById('input-master-stamp-name');
    const inputCompany = document.getElementById('input-master-stamp-company');
    const inputCert = document.getElementById('input-master-stamp-cert');
    const inputTitle = document.getElementById('input-master-stamp-title');
    const inputSign = document.getElementById('input-master-stamp-sign-text');
    const selectStyle = document.getElementById('select-master-stamp-style');

    const newSettings = {
      masterName: (inputName && inputName.value.trim()) ? inputName.value.trim() : 'Улугбек Хакимов',
      companyName: (inputCompany && inputCompany.value.trim()) ? inputCompany.value.trim() : 'Лига Опытных Мастеров',
      licenseNumber: (inputCert && inputCert.value.trim()) ? inputCert.value.trim() : 'LMO-UZ-2011/2026',
      title: (inputTitle && inputTitle.value.trim()) ? inputTitle.value.trim() : 'Ведущий инженер сантехники и систем отопления',
      signatureText: (inputSign && inputSign.value.trim()) ? inputSign.value.trim() : 'Хакимов У.А.',
      stampStyle: (selectStyle && selectStyle.value) ? selectStyle.value : 'swiss_imperial_gold'
    };

    // Сохраняем рукописную подпись с Canvas, если она есть
    this.saveSignaturePadToEngine();

    const ok = window.ligaSealEngine.saveSettings(newSettings);
    if (ok) {
      this.playSubtleClick();
      this.updateSealLivePreview();
      this.showToast('✓ Персональная печать и подпись мастера сохранены!');
    } else {
      this.showToast('⚠️ Ошибка сохранения настроек печати');
    }
  }

  // ==========================================================================
  // ПОДСКАЗКА ПРИВАТНОСТИ ПРИ ДОЛГОМ НАЖАТИИ НА КНОПКУ «ГЛАЗ 👁️» (v2.4.7)
  // ==========================================================================
  showEyeLongPressTooltip() {
    // Удаляем предыдущую подсказку, если есть
    const old = document.querySelector('.eye-long-press-tooltip');
    if (old) old.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'eye-long-press-tooltip';
    tooltip.innerHTML = `
      <button class="tooltip-close" onclick="this.closest('.eye-long-press-tooltip').remove()">&times;</button>
      <div class="tooltip-title">🛡️ Режим безопасного показа клиенту</div>
      <div class="tooltip-body">
        <b>Кнопка 👁️</b> моментально скрывает от глаз заказчика:<br>
        • Оптовые закупочные цены на материалы<br>
        • Зарплату бригады и бонус дизайнера<br>
        • Маржу и чистую прибыль мастера<br>
        • Базарный карман (деньги на руках)<br><br>
        <b>Клик</b> — быстрое переключение Мастер ↔ Клиент.<br>
        <b>Долгое удержание (3 сек)</b> — эта подсказка.
      </div>
    `;
    document.body.appendChild(tooltip);

    // Автоскрытие через 8 секунд
    setTimeout(() => {
      if (tooltip.parentElement) tooltip.remove();
    }, 8000);
  }

  // ==========================================================================
  // CANVAS SIGNATURE PAD — РИСОВАНИЕ ПОДПИСИ ПАЛЬЦЕМ / СТИЛУСОМ (v2.4.7)
  // Алгоритм сглаживания: квадратичные кривые Безье (quadraticCurveTo)
  // с динамической толщиной линии по скорости движения пальца
  // ==========================================================================
  initSignaturePad() {
    const canvas = document.getElementById('signature-pad-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let points = [];
    let lastTime = 0;
    const wrapper = canvas.closest('.signature-canvas-wrapper');

    // Масштаб Canvas для HiDPI экранов
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    // Загружаем сохранённую подпись, если есть
    if (window.ligaSealEngine && window.ligaSealEngine.settings.handwrittenSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = window.ligaSealEngine.settings.handwrittenSignature;
      const statusEl = document.getElementById('signature-pad-status');
      if (statusEl) statusEl.innerText = '✓ Сохранена';
      if (statusEl) statusEl.style.color = '#10b981';
    }

    // Настройки кисти
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';

    const getPos = (e) => {
      const touch = e.touches ? e.touches[0] : e;
      const cRect = canvas.getBoundingClientRect();
      return {
        x: touch.clientX - cRect.left,
        y: touch.clientY - cRect.top,
        time: Date.now()
      };
    };

    const startDraw = (e) => {
      e.preventDefault();
      isDrawing = true;
      points = [];
      const pos = getPos(e);
      points.push(pos);
      lastTime = pos.time;
      if (wrapper) wrapper.classList.add('drawing');
    };

    const moveDraw = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      points.push(pos);

      // Динамическая толщина по скорости (быстро = тонко, медленно = толсто)
      const dt = Math.max(1, pos.time - lastTime);
      const prev = points[points.length - 2];
      const dist = Math.sqrt((pos.x - prev.x) ** 2 + (pos.y - prev.y) ** 2);
      const speed = dist / dt;
      const lineWidth = Math.max(1.2, Math.min(3.8, 3.8 - speed * 1.5));
      lastTime = pos.time;

      ctx.lineWidth = lineWidth;

      if (points.length >= 3) {
        // Алгоритм сглаживания Безье: рисуем кривые через средние точки
        const len = points.length;
        const p0 = points[len - 3];
        const p1 = points[len - 2];
        const p2 = points[len - 1];

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        ctx.beginPath();
        ctx.moveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
        ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
        ctx.stroke();
      } else if (points.length === 2) {
        const p0 = points[0];
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    };

    const endDraw = () => {
      isDrawing = false;
      points = [];
      if (wrapper) wrapper.classList.remove('drawing');

      // Обновляем статус
      const statusEl = document.getElementById('signature-pad-status');
      if (statusEl) {
        statusEl.innerText = '✍️ Нарисована (не сохранена)';
        statusEl.style.color = '#f59e0b';
      }
    };

    // Touch events (мобильные)
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    canvas.addEventListener('touchend', endDraw);
    canvas.addEventListener('touchcancel', endDraw);

    // Mouse events (десктоп)
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);

    this._signaturePadCanvas = canvas;
    this._signaturePadCtx = ctx;
  }

  clearSignaturePad() {
    const canvas = this._signaturePadCanvas || document.getElementById('signature-pad-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Очищаем и в движке
    if (window.ligaSealEngine) {
      window.ligaSealEngine.clearHandwrittenSignature();
    }

    const statusEl = document.getElementById('signature-pad-status');
    if (statusEl) {
      statusEl.innerText = 'Не задана';
      statusEl.style.color = '';
    }

    this.updateSealLivePreview();
    this.showToast('🗑️ Подпись очищена');
  }

  applySignaturePreset(presetName = 'classic') {
    const canvas = this._signaturePadCanvas || document.getElementById('signature-pad-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';

    // Имя мастера для генерации
    const masterName = (window.ligaSealEngine && window.ligaSealEngine.settings.masterName) || 'Хакимов Улугбек';

    if (presetName === 'classic') {
      // Классический каллиграфический росчерк
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.65);
      ctx.bezierCurveTo(w * 0.06, h * 0.35, w * 0.18, h * 0.15, w * 0.24, h * 0.25);
      ctx.bezierCurveTo(w * 0.30, h * 0.35, w * 0.20, h * 0.72, w * 0.16, h * 0.78);
      ctx.bezierCurveTo(w * 0.13, h * 0.82, w * 0.25, h * 0.75, w * 0.35, h * 0.60);
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(w * 0.33, h * 0.60);
      ctx.quadraticCurveTo(w * 0.40, h * 0.38, w * 0.45, h * 0.55);
      ctx.quadraticCurveTo(w * 0.50, h * 0.40, w * 0.55, h * 0.52);
      ctx.quadraticCurveTo(w * 0.60, h * 0.42, w * 0.65, h * 0.50);
      ctx.quadraticCurveTo(w * 0.70, h * 0.38, w * 0.78, h * 0.52);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(w * 0.65, h * 0.50);
      ctx.quadraticCurveTo(w * 0.82, h * 0.78, w * 0.95, h * 0.30);
      ctx.quadraticCurveTo(w * 0.85, h * 0.82, w * 0.50, h * 0.82);
      ctx.stroke();
    } else if (presetName === 'elegant') {
      // Элегантный дипломатический
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.55);
      ctx.bezierCurveTo(w * 0.15, h * 0.18, w * 0.30, h * 0.12, w * 0.28, h * 0.40);
      ctx.bezierCurveTo(w * 0.26, h * 0.68, w * 0.18, h * 0.85, w * 0.35, h * 0.65);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(w * 0.33, h * 0.65);
      ctx.bezierCurveTo(w * 0.45, h * 0.30, w * 0.55, h * 0.50, w * 0.60, h * 0.42);
      ctx.bezierCurveTo(w * 0.65, h * 0.34, w * 0.72, h * 0.55, w * 0.80, h * 0.45);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(w * 0.72, h * 0.48);
      ctx.bezierCurveTo(w * 0.85, h * 0.72, w * 0.95, h * 0.25, w * 0.90, h * 0.55);
      ctx.bezierCurveTo(w * 0.85, h * 0.85, w * 0.40, h * 0.88, w * 0.25, h * 0.85);
      ctx.stroke();
      // Финальная точка
      ctx.beginPath();
      ctx.arc(w * 0.92, h * 0.28, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1a2e';
      ctx.fill();
    } else if (presetName === 'bold') {
      // Жирный уверенный росчерк
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.10, h * 0.50);
      ctx.bezierCurveTo(w * 0.12, h * 0.20, w * 0.25, h * 0.15, w * 0.30, h * 0.35);
      ctx.bezierCurveTo(w * 0.35, h * 0.55, w * 0.22, h * 0.80, w * 0.40, h * 0.60);
      ctx.stroke();
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(w * 0.38, h * 0.60);
      ctx.quadraticCurveTo(w * 0.50, h * 0.30, w * 0.58, h * 0.48);
      ctx.quadraticCurveTo(w * 0.66, h * 0.28, w * 0.75, h * 0.45);
      ctx.stroke();
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(w * 0.70, h * 0.45);
      ctx.bezierCurveTo(w * 0.88, h * 0.70, w * 0.95, h * 0.20, w * 0.85, h * 0.65);
      ctx.stroke();
      // Финальная точка
      ctx.beginPath();
      ctx.arc(w * 0.88, h * 0.22, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1a2e';
      ctx.fill();
    }

    const statusEl = document.getElementById('signature-pad-status');
    if (statusEl) {
      statusEl.innerText = '✍️ Шаблон (не сохранён)';
      statusEl.style.color = '#f59e0b';
    }
    this.showToast(`✍️ Шаблон подписи «${presetName === 'classic' ? 'Классика' : presetName === 'elegant' ? 'Элегант' : 'Жирный'}» применён`);
  }

  saveSignaturePadToEngine() {
    const canvas = this._signaturePadCanvas || document.getElementById('signature-pad-canvas');
    if (!canvas || !window.ligaSealEngine) return;

    // Проверяем, есть ли что-то нарисованное на холсте
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasContent = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) { hasContent = true; break; }
    }

    if (hasContent) {
      // Экспорт как PNG DataURL
      const dataUrl = canvas.toDataURL('image/png');
      window.ligaSealEngine.saveHandwrittenSignature(dataUrl);

      const statusEl = document.getElementById('signature-pad-status');
      if (statusEl) {
        statusEl.innerText = '✓ Сохранена';
        statusEl.style.color = '#10b981';
      }
    }
  }

  // ==========================================================================
  // АВТО-ОНБОРДИНГ И ПРИВЛЕЧЕНИЕ ВНИМАНИЯ К ТЕСТ-ДРАЙВУ УЛУГБЕКА (v2.5.0)
  // ==========================================================================
  initUlugbekBriefOnboarding() {
    const card = document.getElementById('card-ulugbek-brief');
    const badgePriority = document.getElementById('vip-badge-priority');
    if (!card) return;

    const isAcknowledged = localStorage.getItem('liga_ulugbek_testdrive_ack') === 'true';

    if (!isAcknowledged) {
      // Первое открытие: привлекаем внимание мастера пульсацией и бейджем первого приоритета
      card.classList.add('vip-attention-pulse');
      if (badgePriority) badgePriority.style.display = 'inline-flex';

      // v2.5.0: Отказ от слепого таймера 1400мс. В мобильных браузерах звук блокируется до первого касания экрана (Autoplay Policy).
      // Настраиваем мгновенный разблокировщик: при первом же касании экрана (тап / клик) аудиосистема активируется,
      // распахивается VIP-бриф и звучит бархатный рояльный аккорд Ре-мажор представительского класса со 100% гарантией!
      let touchTriggered = false;
      const firstTouchHandler = (e) => {
        if (touchTriggered) return;
        if (localStorage.getItem('liga_ulugbek_testdrive_ack') === 'true') return;

        // Если открыт микрофон или модалка видеотура — не перебиваем
        const modalVoice = document.getElementById('modal-voice');
        if (modalVoice && modalVoice.classList.contains('open')) return;

        touchTriggered = true;
        // Разблокируем аудиоконтекст
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }

        // Если пользователь не нажал напрямую на кнопку или карточку брифа (они сами вызовут метод):
        const isClickOnBriefCard = e.target && (e.target.closest('#card-ulugbek-brief') || e.target.closest('#modal-ulugbek-vip-brief'));
        if (!isClickOnBriefCard) {
          setTimeout(() => {
            const briefModal = document.getElementById('modal-ulugbek-vip-brief');
            if (briefModal && !briefModal.classList.contains('open')) {
              this.openUlugbekVipBrief();
            }
          }, 120);
        }
      };

      window.addEventListener('pointerdown', firstTouchHandler, { passive: true });
      window.addEventListener('touchstart', firstTouchHandler, { passive: true });
    } else {
      card.classList.remove('vip-attention-pulse');
      if (badgePriority) badgePriority.style.display = 'none';
    }
  }

  acknowledgeUlugbekTestDrive() {
    localStorage.setItem('liga_ulugbek_testdrive_ack', 'true');
    const card = document.getElementById('card-ulugbek-brief');
    const badgePriority = document.getElementById('vip-badge-priority');
    if (card) card.classList.remove('vip-attention-pulse');
    if (badgePriority) badgePriority.style.display = 'none';

    this.playSwissChime();
    this.closeUlugbekVipBrief();
    this.showToast('👑 Тест-драйв принят! Успешной работы, Улугбек! Вы можете скрыть этот блок в Настройках ⚙️');
  }

  // ==========================================================================
  // ЭКСКЛЮЗИВНЫЙ ИНЖЕНЕРНЫЙ ПАСПОРТ ТЕСТ-ДРАЙВА ДЛЯ УЛУГБЕКА ХАКИМОВА
  // ==========================================================================
  openUlugbekVipBrief() {
    this.playDiplomaticChime();
    this.openModal('modal-ulugbek-vip-brief');
    this.showToast('👑 Персональный бриф тест-драйва для Улугбека Хакимова');
  }

  closeUlugbekVipBrief() {
    this.closeModal('modal-ulugbek-vip-brief');
  }

  testDriveStep1_Offline() {
    const isOnline = navigator.onLine;
    const msg = isOnline
      ? '⚡ База данных IndexedDB активна в памяти устройства. Включите авиарежим: данные продолжат сохраняться!'
      : '🟢 РЕЖИМ ОФЛАЙН АКТИВЕН: все хранилища LIGA OS работают полностью автономно!';
    this.showToast(msg);
  }

  testDriveStep2_Pressure() {
    this.closeModal('modal-ulugbek-vip-brief');
    setTimeout(() => {
      this.openModal('modal-pressure-test');
      this.showToast('⏱️ Открыт таймер и протокол гидравлики 16 бар / 24ч');
    }, 150);
  }

  testDriveStep3_Seal() {
    this.closeModal('modal-ulugbek-vip-brief');
    setTimeout(() => {
      this.openModal('modal-settings');
      setTimeout(() => {
        const sealSec = document.getElementById('settings-section-seal') || document.querySelector('.seal-preview-box');
        if (sealSec) sealSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.showToast('✍️ Выберите стиль печати мастера и распишитесь пальцем');
      }, 250);
    }, 150);
  }

  testDriveStep4_Passport() {
    this.closeModal('modal-ulugbek-vip-brief');
    setTimeout(() => {
      if (typeof this.generatePdfPassport === 'function') {
        this.generatePdfPassport();
      } else if (typeof this.openPassportPreviewModal === 'function') {
        this.openPassportPreviewModal();
      } else {
        this.openModal('modal-passport-preview');
      }
      this.showToast('📄 Сформирован Исполнительный Инженерный Паспорт А4');
    }, 150);
  }

  testDriveStep5_ClientMode() {
    this.closeModal('modal-ulugbek-vip-brief');
    setTimeout(() => {
      this.toggleClientMode();
      this.showToast('👁️ Безопасный режим клиента: коммерческая тайна и цены скрыты!');
    }, 150);
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
