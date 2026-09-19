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

    // Переменные экспресс-сметы
    this.estimate = {
      bathrooms: 2,
      waterPoints: 12,
      geberit: 2,
      ibox: 2,
      drains: 2,
      floorHeatingSqM: 40
    };
  }

  async init() {
    console.log('Запуск LIGA OS v1.2...');
    
    // 1. Инициализация светлой/тёмной темы
    this.initTheme();

    // 2. Инициализация локальной базы данных IndexedDB
    await window.ligaDB.init();
    
    // 3. Загрузка объектов
    await this.loadSites();

    // 4. Навешиваем слушатели событий
    this.initEvents();

    // 5. Регистрация Service Worker для оффлайн-работы
    this.registerServiceWorker();

    // 6. Первичный рендеринг
    this.render();
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

    // 3. Кнопка быстрого бэкапа базы в шапке
    const btnBackup = document.getElementById('btn-backup-top');
    if (btnBackup) {
      btnBackup.addEventListener('click', async () => {
        await window.ligaDB.exportFullBackup();
        this.showToast('✓ Резервная копия базы сохранена!');
      });
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
      tilePress.addEventListener('click', () => this.togglePressureTest());
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
                await window.ligaDB.put('sites', this.currentSite);
              }

              this.updatePhotoBadges();
              this.showToast('✓ Фото узла сохранено в паспорт!');
            } catch (err) {
              console.error('Ошибка сжатия фото:', err);
              alert('Не удалось обработать фото: ' + err.message);
            }
          }
        });
      }
    });
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
    document.getElementById('fin-debt-val').innerText = this.formatSum(debt);
    document.getElementById('fin-brigade-val').innerText = this.formatSum(s.brigadeOwed || 0);
    document.getElementById('fin-designer-val').innerText = this.formatSum(s.designerBonus || 0);

    this.calculateEstimate();
  }

  // Обновление статуса объекта
  async updateSiteStatus(status) {
    if (!this.currentSite) return;
    this.currentSite.status = status;
    await window.ligaDB.put('sites', this.currentSite);
    this.showToast(`Этап объекта переключен на: ${status}`);
    this.render();
  }

  // Опрессовка 16 бар в 1 клик
  async togglePressureTest() {
    if (!this.currentSite) return;
    this.currentSite.pressTestPassed = !this.currentSite.pressTestPassed;
    if (this.currentSite.pressTestPassed && this.currentSite.status < 3) {
      this.currentSite.status = 3;
    }
    await window.ligaDB.put('sites', this.currentSite);
    this.showToast(this.currentSite.pressTestPassed ? '✓ Акт опрессовки 16 бар: УСПЕШНО ЗАФИКСИРОВАН!' : 'Тест 16 бар сброшен');
    this.render();
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
      await navigator.clipboard.writeText(message);
      this.showToast('✓ Акт стяжки скопирован! Переход в Telegram...');
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
    const tgUrl = `https://t.me/share/url?text=${encodeURIComponent(message)}`;
    window.open(tgUrl, '_blank');
  }

  // Рендеринг материалов и снабжения
  async renderMaterials() {
    const list = await window.ligaDB.getBySiteId('materials', this.currentSiteId);
    const container = document.getElementById('materials-list-container');
    if (!container) return;

    // Подсчет сумм
    const purchasedSum = list.filter(m => m.isPurchased).reduce((acc, m) => acc + (m.price || 0), 0);
    const neededSum = list.filter(m => !m.isPurchased).reduce((acc, m) => acc + (m.price || 0), 0);

    const purchasedEl = document.getElementById('mat-purchased-sum');
    if (purchasedEl) purchasedEl.innerText = this.formatSum(purchasedSum);

    const neededEl = document.getElementById('mat-needed-sum');
    if (neededEl) neededEl.innerText = this.formatSum(neededSum);

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
                ${m.isPurchased ? '• Куплено' : '• Требуется закупка'}
              </span>
            </div>
          </div>
        </div>
        <div class="mat-item-right">
          <div class="mat-price">${this.formatSum(m.price)}</div>
          ${m.receiptPhoto ? `
            <button class="btn-receipt-view" onclick="window.app.viewReceiptById(${m.id})">
              <span>🧾 Чек (фото)</span>
            </button>
          ` : ''}
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
      await navigator.clipboard.writeText(message);
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
      document.getElementById('page-fin-brigade').innerText = this.formatSum(s.brigadeOwed || 0);
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

  // Экспресс-калькулятор сметы
  updateEstimate(field, delta) {
    if (this.estimate[field] !== undefined) {
      this.estimate[field] = Math.max(0, this.estimate[field] + delta);
      document.getElementById(`val-${field}`).innerText = this.estimate[field];
      this.calculateEstimate();
    }
  }

  calculateEstimate() {
    const e = this.estimate;
    const costPerPoint = 450000;
    const costPerGeberit = 650000;
    const costPerIbox = 550000;
    const costPerDrain = 400000;
    const costPerSqMFloor = 90000;
    const baseAuditWork = 2500000;

    const totalMin = (e.waterPoints * costPerPoint) +
                     (e.geberit * costPerGeberit) +
                     (e.ibox * costPerIbox) +
                     (e.drains * costPerDrain) +
                     (e.floorHeatingSqM * costPerSqMFloor) +
                     baseAuditWork;

    const totalMax = Math.round(totalMin * 1.25);
    const usdRate = 12900;

    const totalMinUsd = Math.round(totalMin / usdRate);
    const totalMaxUsd = Math.round(totalMax / usdRate);

    document.getElementById('est-range-sum').innerText = `${this.formatSum(totalMin)} – ${this.formatSum(totalMax)}`;
    document.getElementById('est-range-usd').innerText = `$${totalMinUsd} – $${totalMaxUsd}`;
  }

  copyEstimateToTelegram() {
    const e = this.estimate;
    const textSum = document.getElementById('est-range-sum').innerText;
    const textUsd = document.getElementById('est-range-usd').innerText;

    const message = `🏛️ ПРЕДВАРИТЕЛЬНЫЙ РАСЧЕТ ИНЖЕНЕРНОГО МОНТАЖА
«Лига Опытных Мастеров» • Инженер Улугбек Хакимов

Параметры объекта:
• Санузлов: ${e.bathrooms}
• Водорозетки и точки слива: ${e.waterPoints} шт.
• Инсталляции Geberit/TECE: ${e.geberit} шт.
• Скрытые смесители iBox: ${e.ibox} шт.
• Душевые трапы в пол: ${e.drains} шт.
• Водяной теплый пол: ${e.floorHeatingSqM} кв.м

Ориентировочная вилка стоимости работ:
💰 ${textSum} (${textUsd})

В стоимость включено:
✓ Коллекторная лучевая разводка FAR
✓ Трубы Rehau Rautitan / Stout
✓ Опрессовка 16 бар (тест х4, 24 часа) с официальным Актом
✓ Исполнительный паспорт объекта с фотопривязками
✓ Официальный договор и гарантия

Сайт-портфолио: https://liga-masterov.vercel.app/`;

    navigator.clipboard.writeText(message).then(() => {
      this.showToast('✓ Смета скопирована! Вставьте её в чат Telegram.');
    });
  }

  // Генерация PDF с живыми фото
  generatePassport() {
    if (!this.currentSite) return;
    window.ligaPdfEngine.generatePassport(this.currentSite, this.currentPhotos);
  }

  // Добавление чека
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

  openModal(modalId) {
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
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new LigaApp();
  window.app.init();
});
