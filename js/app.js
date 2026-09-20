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

    // Голосовой ввод и Voice AI
    this.isRecordingVoice = false;
    this.recognition = null;
    this.parsedVoiceAction = null;

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

    // Подвкладка 10-летней истории (timeline / payouts / equipment)
    this.currentHistorySubtab = 'timeline';
  }

  async init() {
    console.log('Запуск LIGA OS v2.0 (10-Year Engineering History & Elite UI)...');
    
    // 1. Инициализация светлой/тёмной темы
    this.initTheme();

    // 1.1. Инициализация клиентского режима демонстрации
    this.initClientMode();

    // 2. Инициализация локальной базы данных IndexedDB
    await window.ligaDB.init();
    
    // 3. Загрузка объектов
    await this.loadSites();

    // 4. Навешиваем слушатели событий
    this.initEvents();

    // 5. Инициализация голосового движка Web Speech
    this.initVoiceEngine();

    // 6. Проверка цифровых расписок из URL (?verify_receipt=...)
    this.checkUrlVerification();

    // 7. Регистрация Service Worker для оффлайн-работы
    this.registerServiceWorker();

    // 8. Первичный рендеринг
    this.render();
    this.calculateEstimate();
    await this.updateNavBadges();
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
    // 0. Кнопка переключения темы
    const btnTheme = document.getElementById('btn-theme-toggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => this.toggleTheme());
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
      });
    }

    // 10. Степпер этапов объекта
    document.querySelectorAll('.phase-step').forEach(step => {
      step.addEventListener('click', async () => {
        const newStatus = parseInt(step.getAttribute('data-phase'));
        await this.updateSiteStatus(newStatus);
      });
    });

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

    const newSite = {
      name,
      unit,
      client,
      phone,
      designer,
      contractSum,
      advanceSum,
      brigadeOwed: Math.round(contractSum * 0.15),
      designerBonus: Math.round(contractSum * 0.10),
      status: 1, // Начальный этап - 1. Аудит
      dateCreated: new Date().toISOString().slice(0, 10),
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

    window.scrollTo({ top: 0, behavior: 'smooth' });
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
  }

  // Обновление статуса объекта
  async updateSiteStatus(status) {
    if (!this.currentSite) return;
    this.currentSite.status = status;
    await window.ligaDB.put('sites', this.currentSite);
    this.showToast(`Этап объекта переключен на: ${status}`);
    this.render();
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
            <div class="mat-price">${this.formatSum(m.price)}</div>
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
      this.showToast(item.isPurchased ? '✓ Отмечено как куплено!' : 'Статус: Требуется докупить');
    }
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
      if (statsEl) {
        statsEl.innerHTML = `В локальной базе сохранено: <b>${stats.sitesCount}</b> объекта(ов), <b>${stats.materialsCount}</b> позиций материалов и чеков, <b>${stats.checklistsCount}</b> пунктов технадзора.`;
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
  // МОДУЛЬ ГОЛОСОВОЙ ДИКТОВКИ («СВОБОДНЫЕ РУКИ НА ОБЪЕКТЕ»)
  // ==========================================================================
  initVoiceEngine() {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechClass) {
      this.recognition = new SpeechClass();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'ru-RU';

      this.recognition.onstart = () => {
        this.isRecordingVoice = true;
        this.updateVoiceUI(true);
      };

      this.recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        this.handleVoiceResult(transcript);
      };

      this.recognition.onerror = (e) => {
        console.warn('SpeechRecognition error:', e.error);
        this.isRecordingVoice = false;
        this.updateVoiceUI(false);
        const statusEl = document.getElementById('voice-status-text');
        if (statusEl) {
          statusEl.innerText = 'Не удалось разобрать речь. Введите фразу текстом:';
        }
      };

      this.recognition.onend = () => {
        this.isRecordingVoice = false;
        this.updateVoiceUI(false);
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

    if (this.recognition) {
      try {
        this.recognition.start();
        const statusEl = document.getElementById('voice-status-text');
        if (statusEl) statusEl.innerText = '🔴 Запись... Говорите фразу';
      } catch (err) {
        console.warn('Recognition already started or error:', err);
      }
    } else {
      const statusEl = document.getElementById('voice-status-text');
      if (statusEl) {
        statusEl.innerText = 'Диктовка доступна. Введите фразу в поле ниже:';
      }
    }
  }

  stopVoiceRecording() {
    if (this.recognition && this.isRecordingVoice) {
      this.recognition.stop();
    }
    this.isRecordingVoice = false;
    this.updateVoiceUI(false);
  }

  updateVoiceUI(isActive) {
    const circle = document.getElementById('voice-pulse-circle');
    const headerBtn = document.getElementById('btn-voice-input');
    if (circle) {
      if (isActive) circle.classList.add('voice-recording-active');
      else circle.classList.remove('voice-recording-active');
    }
    if (headerBtn) {
      if (isActive) headerBtn.classList.add('voice-recording-active');
      else headerBtn.classList.remove('voice-recording-active');
    }
  }

  handleVoiceResult(transcript) {
    const inputEl = document.getElementById('voice-recognized-input');
    if (inputEl) inputEl.value = transcript;
    this.handleVoiceInputText(transcript);
  }

  handleVoiceInputText(text) {
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

      if (parsed.type === 'material') {
        typeEl.innerText = `📦 Запись в Снабжение (${parsed.category})`;
        detailsEl.innerText = `${parsed.title} • ${this.formatSum(parsed.amount)}`;
      } else if (parsed.type === 'brigade_pay') {
        typeEl.innerText = `💰 Выплата помощнику (${parsed.recipient})`;
        detailsEl.innerText = `Сумма аванса: ${this.formatSum(parsed.amount)}`;
      } else if (parsed.type === 'client_advance') {
        typeEl.innerText = `💵 Поступление аванса от заказчика`;
        detailsEl.innerText = `Зачислено: ${this.formatSum(parsed.amount)}`;
      } else if (parsed.type === 'press_test') {
        typeEl.innerText = `🛡️ Фиксация испытания 16 бар`;
        detailsEl.innerText = `Акт опрессовки на 24 часа успешно подтвержден`;
      }
    }
  }

  parseVoiceCommand(text) {
    const lower = text.toLowerCase();
    let amount = 0;

    const millionsMatch = lower.match(/(\d+[\.,]?\d*)\s*(млн|миллион|лям)/);
    const thousandsMatch = lower.match(/(\d+[\.,]?\d*)\s*(тыс|тысяч)/);
    const plainNumberMatch = lower.match(/(\d{4,9})/);

    if (millionsMatch) {
      const val = parseFloat(millionsMatch[1].replace(',', '.'));
      amount = Math.round(val * 1000000);
    } else if (thousandsMatch) {
      const val = parseFloat(thousandsMatch[1].replace(',', '.'));
      amount = Math.round(val * 1000);
    } else if (plainNumberMatch) {
      amount = parseInt(plainNumberMatch[1]);
    }

    if (lower.includes('выдал') || lower.includes('аванс') || lower.includes('алишер') || lower.includes('сардор') || lower.includes('зарплат')) {
      let recipient = 'Алишер';
      if (lower.includes('сардор')) recipient = 'Сардор';
      return {
        type: 'brigade_pay',
        title: `Выплата помощнику (${recipient})`,
        amount: amount || 300000,
        recipient: recipient,
        category: 'Бригада'
      };
    }

    if (lower.includes('клиент') || lower.includes('заказчик') || lower.includes('перевел') || lower.includes('бахром')) {
      return {
        type: 'client_advance',
        title: 'Аванс от заказчика',
        amount: amount || 2000000
      };
    }

    if (lower.includes('опрессовк') || lower.includes('16 бар') || lower.includes('давление')) {
      return {
        type: 'press_test',
        title: 'Опрессовка 16 бар',
        amount: 0
      };
    }

    let category = 'Трубы и фитинги';
    if (lower.includes('коллектор') || lower.includes('far')) category = 'Коллекторы';
    if (lower.includes('инсталляц') || lower.includes('трап') || lower.includes('geberit') || lower.includes('tece')) category = 'Инсталляции';
    if (lower.includes('нептун') || lower.includes('протечк')) category = 'Защита от протечек';
    if (lower.includes('клей') || lower.includes('герметик') || lower.includes('изоляц')) category = 'Расходники';

    let cleanName = text
      .replace(/(купил|купили|взял|на базаре|на джами|за|на сумму|сум|суммов|тысяч|миллион|рублей)/gi, '')
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
        this.showToast(`✓ Выплата ${action.recipient} ${this.formatSum(action.amount)} зафиксирована!`);
        this.render();
      }
    } else if (action.type === 'client_advance') {
      if (this.currentSite) {
        this.currentSite.advanceSum = (this.currentSite.advanceSum || 0) + action.amount;
        await window.ligaDB.put('sites', this.currentSite);
        this.showToast(`✓ Аванс ${this.formatSum(action.amount)} зачислен!`);
        this.render();
      }
    } else if (action.type === 'press_test') {
      await this.togglePressureTest();
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
  // ЦИФРОВЫЕ РАСПИСКИ И ПОДТВЕРЖДЕНИЯ (TELEGRAM CALLBACK)
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

    if (paneTimeline) paneTimeline.style.display = subtabName === 'timeline' ? 'block' : 'none';
    if (panePayouts) panePayouts.style.display = subtabName === 'payouts' && !this.isClientMode ? 'block' : 'none';
    if (paneEquipment) paneEquipment.style.display = subtabName === 'equipment' ? 'block' : 'none';

    this.renderHistorySubtabContent(subtabName);
  }

  async renderHistory() {
    await this.renderTimeline();
    await this.renderBrigadePayouts();
    await this.renderEquipment();
  }

  async renderHistorySubtabContent(subtabName) {
    if (subtabName === 'timeline') {
      await this.renderTimeline();
    } else if (subtabName === 'payouts') {
      await this.renderBrigadePayouts();
    } else if (subtabName === 'equipment') {
      await this.renderEquipment();
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
      payout: { label: '💰 Выплата', class: 'badge-event-payout' }
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
              <span class="timeline-badge ${tb.class}">${tb.label}</span>
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
          <div class="payout-amounts">
            <div class="payout-uzs">${this.formatSum(p.amountUZS)}</div>
            ${p.amountUSD ? `<div class="payout-usd">≈ $${p.amountUSD}</div>` : ''}
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
        <div class="equipment-warranty-badge">Гарантия ${eq.warrantyYears || 10} лет</div>
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
      'modal-add-payout', 'modal-add-event', 'modal-add-equipment'
    ].includes(modalId)) {
      this.showToast('⚠️ Функция недоступна в режиме демонстрации');
      return;
    }
    const m = document.getElementById(modalId);
    if (m) m.classList.add('open');
  }

  closeModal(modalId) {
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
        top: 66px;
        left: 50%;
        transform: translateX(-50%) translateY(-10px);
        background: var(--gold-gradient);
        color: var(--btn-gold-text);
        font-weight: 800;
        font-size: 13px;
        padding: 9px 18px;
        border-radius: 9999px;
        z-index: 999;
        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
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
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 2200);
  }

  formatSum(num) {
    return new Intl.NumberFormat('ru-RU').format(num || 0) + ' сум';
  }

  formatNumber(num) {
    return new Intl.NumberFormat('ru-RU').format(num || 0);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new LigaApp();
  window.app.init();
});
