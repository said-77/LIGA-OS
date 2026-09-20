/* ==========================================================================
   LIGA OS — Локальное защищенное хранилище IndexedDB
   100% Offline-First • Без внешних серверов • Экспорт в Telegram
   ========================================================================== */

const DB_NAME = 'LigaOS_DB';
const DB_VERSION = 3;

class LigaDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve) => {
      let isSettled = false;

      // Защитный таймаут 2.5 секунды: локальная база никогда не заморозит интерфейс приложения
      const safetyTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          console.warn('[LIGA OS DB] Превышено время ожидания IndexedDB, приложение продолжает запуск');
          resolve(this.db);
        }
      }, 2500);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Защита от блокировки открытыми вкладками браузера при обновлении схемы
      request.onblocked = (event) => {
        console.warn('[LIGA OS DB] Обновление базы заблокировано другой вкладкой. Закройте дублирующие вкладки LIGA OS');
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Хранилище объектов (Sites)
        if (!db.objectStoreNames.contains('sites')) {
          const siteStore = db.createObjectStore('sites', { keyPath: 'id', autoIncrement: true });
          siteStore.createIndex('status', 'status', { unique: false });
        }

        // 2. Хранилище финансов (Finances)
        if (!db.objectStoreNames.contains('finances')) {
          const finStore = db.createObjectStore('finances', { keyPath: 'id', autoIncrement: true });
          finStore.createIndex('siteId', 'siteId', { unique: false });
        }

        // 3. Хранилище материалов и чеков (Materials & Receipts)
        if (!db.objectStoreNames.contains('materials')) {
          const matStore = db.createObjectStore('materials', { keyPath: 'id', autoIncrement: true });
          matStore.createIndex('siteId', 'siteId', { unique: false });
        }

        // 4. Хранилище чек-листов технадзора (Checklists)
        if (!db.objectStoreNames.contains('checklists')) {
          const checkStore = db.createObjectStore('checklists', { keyPath: 'id', autoIncrement: true });
          checkStore.createIndex('siteId', 'siteId', { unique: false });
        }

        // 5. Хранилище паспортов и фотопривязок (Passports)
        if (!db.objectStoreNames.contains('passports')) {
          const passStore = db.createObjectStore('passports', { keyPath: 'id', autoIncrement: true });
          passStore.createIndex('siteId', 'siteId', { unique: false });
        }

        // 6. Хранилище выплат бригаде (Brigade Payouts) — 10-летняя история мастера
        if (!db.objectStoreNames.contains('brigade_payouts')) {
          const bpStore = db.createObjectStore('brigade_payouts', { keyPath: 'id', autoIncrement: true });
          bpStore.createIndex('siteId', 'siteId', { unique: false });
          bpStore.createIndex('date', 'date', { unique: false });
        }

        // 7. Хранилище паспортов оборудования (Installed Equipment)
        if (!db.objectStoreNames.contains('installed_equipment')) {
          const eqStore = db.createObjectStore('installed_equipment', { keyPath: 'id', autoIncrement: true });
          eqStore.createIndex('siteId', 'siteId', { unique: false });
          eqStore.createIndex('brand', 'brand', { unique: false });
        }

        // 8. Хронологическая лента объекта (Site Timeline Events) — Append-Only журнал
        if (!db.objectStoreNames.contains('site_timeline_events')) {
          const timeStore = db.createObjectStore('site_timeline_events', { keyPath: 'id', autoIncrement: true });
          timeStore.createIndex('siteId', 'siteId', { unique: false });
          timeStore.createIndex('date', 'date', { unique: false });
        }

        // 9. Хранилище постоянных контактов Лиги Мастеров (Contacts Registry) — Бизнес-книга Улугбека
        if (!db.objectStoreNames.contains('contacts')) {
          const contactStore = db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
          contactStore.createIndex('contactId', 'contactId', { unique: true });
          contactStore.createIndex('role', 'role', { unique: false });
          contactStore.createIndex('name', 'name', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;

        // Автоматическое закрытие соединения при фоновом обновлении версии другой вкладкой
        this.db.onversionchange = () => {
          console.warn('[LIGA OS DB] Обнаружена новая версия базы, закрываем устаревшее соединение');
          this.db.close();
        };

        try {
          await this.seedInitialDataIfEmpty();
        } catch (seedErr) {
          console.warn('[LIGA OS DB] Ошибка автозаполнения демо-данных:', seedErr);
        }

        if (!isSettled) {
          isSettled = true;
          clearTimeout(safetyTimer);
          resolve(this.db);
        }
      };

      request.onerror = (event) => {
        console.error('Ошибка инициализации IndexedDB:', event.target.error);
        if (!isSettled) {
          isSettled = true;
          clearTimeout(safetyTimer);
          resolve(null);
        }
      };
    });
  }

  // Заполнение эталонными демо-данными при первом старте
  async seedInitialDataIfEmpty() {
    const sites = await this.getAll('sites');
    if (sites.length === 0) {
      console.log('Инициализация эталонных объектов LIGA OS...');
      
      const site1 = await this.add('sites', {
        name: 'ЖК Mirabad Avenue, Блок B',
        unit: 'кв. 142 (4-комнатная)',
        client: 'Бахром-ака',
        phone: '+998901234567',
        designer: 'Камила (Studio 7)',
        designerPhone: '+998939876543',
        status: 3, // 1-Аудит, 2-Черновой, 3-Опрессовка 16 бар, 4-Чистовая, 5-Сдан
        contractSum: 18500000,
        advanceSum: 12000000,
        brigadeOwed: 800000,
        designerBonus: 1850000,
        dateCreated: '2026-09-10',
        pressTestPassed: true
      });

      const site2 = await this.add('sites', {
        name: 'Nest One, Башня A',
        unit: 'Пентхаус 41 (двухуровневый)',
        client: 'Джамшид-ака',
        phone: '+998971112233',
        designer: 'Сарвар Архитект',
        designerPhone: '+998909998877',
        status: 2,
        contractSum: 35000000,
        advanceSum: 20000000,
        brigadeOwed: 3500000,
        designerBonus: 3500000,
        dateCreated: '2026-09-15',
        pressTestPassed: false
      });

      const site3 = await this.add('sites', {
        name: 'Коттедж Кибрай VIP',
        unit: 'Резиденция 650 кв.м',
        client: 'Шерзод-ака',
        phone: '+998998887766',
        designer: 'Прямой заказ',
        designerPhone: '',
        status: 5,
        contractSum: 48000000,
        advanceSum: 48000000,
        brigadeOwed: 0,
        designerBonus: 0,
        dateCreated: '2026-08-01',
        pressTestPassed: true
      });

      // Базовые чек-листы для объекта 1
      const defaultChecklist = [
        { title: 'Уклоны канализации выверены по лазеру (2 см на метр)', done: true },
        { title: 'Выводы заглушены металлическими опрессовочными пробками', done: true },
        { title: 'Шумоизоляция стояка выполнена (Comfort Mat / K-Fonik)', done: true },
        { title: 'Опрессовка 16 бар выдержана 24 часа без падения давления', done: true },
        { title: 'Скрытые смесители (iBox) выставлены по уровню и глубине плитки', done: false },
        { title: 'Трап с сухим затвором зафиксирован по проектной отметке пола', done: false },
        { title: 'Защита от протечек (Gidrolock/Нептун) подключена и протестирована', done: false },
        { title: 'Трубы отопления и ГВС/ХВС одеты в защитную теплоизоляцию', done: true },
        { title: 'Фотофиксация скрытых трасс с лазерной рулеткой завершена', done: true },
        { title: 'Мусор убран строительным пылесосом перед заливкой стяжки', done: false }
      ];

      for (let item of defaultChecklist) {
        await this.add('checklists', { siteId: site1, ...item });
      }

      // Базовые материалы для объекта 1 (элитная сантехника)
      const defaultMaterials = [
        { siteId: site1, category: 'Трубы и фитинги', name: 'Труба Rehau Rautitan Pink 20x2.8 (бухта 100м)', qty: '1 бухта', price: 2800000, isPurchased: true, receiptPhoto: null },
        { siteId: site1, category: 'Трубы и фитинги', name: 'Надвижные гильзы Rehau 20 и угольники', qty: '24 шт', price: 1650000, isPurchased: true, receiptPhoto: null },
        { siteId: site1, category: 'Коллекторы', name: 'Коллекторы FAR хромированные 1" на 5 выходов (ГВС/ХВС)', qty: '2 компл', price: 3400000, isPurchased: true, receiptPhoto: null },
        { siteId: site1, category: 'Инсталляции', name: 'Инсталляция Geberit Duofix Sigma 111.300.00.5', qty: '2 шт', price: 5600000, isPurchased: true, receiptPhoto: null },
        { siteId: site1, category: 'Защита от протечек', name: 'Система Нептун Smart+ (2 крана 3/4" + 4 радиодатчика)', qty: '1 компл', price: 4200000, isPurchased: false, receiptPhoto: null },
        { siteId: site1, category: 'Трапы', name: 'Душевой трап TECEdrainpoint S с сухим затвором', qty: '2 шт', price: 2100000, isPurchased: false, receiptPhoto: null },
        { siteId: site1, category: 'Расходники', name: 'Шумоизоляция стояка Comfort Mat Blockshot', qty: '3 листа', price: 850000, isPurchased: false, receiptPhoto: null }
      ];

      for (let mat of defaultMaterials) {
        await this.add('materials', mat);
      }

      // 6. Хронологическая лента объекта 1 (10-летняя история — Timeline)
      const defaultTimeline = [
        { siteId: site1, date: '2026-09-10', eventType: 'audit', title: 'Инженерный аудит и лазерные замеры', description: 'Выверены отметки чистового пола, согласованы высоты смесителей с дизайнером Камилой (Studio 7). Привязка осей строго по центру раскладки плитки.' },
        { siteId: site1, date: '2026-09-12', eventType: 'rough', title: 'Черновой монтаж трасс Rehau & FAR', description: 'Смонтирован распределительный узел FAR, проложены лучевые трассы Rehau Pink в защитной теплоизоляции к 12 водорозеткам.' },
        { siteId: site1, date: '2026-09-14', eventType: 'pressure', title: 'Гидравлическое испытание 16 бар (24 часа)', description: 'Система поставлена под опрессовочное давление 16.0 бар. 24 часа выдержано без падения стрелки манометра (0.0 бар). Сформирован Официальный Акт.' }
      ];
      for (let t of defaultTimeline) {
        await this.add('site_timeline_events', t);
      }

      // 7. Паспорта установленного оборудования для объекта 1
      const defaultEquipment = [
        { siteId: site1, brand: 'FAR Rubinetterie', model: 'FAR 1" Flat-Faced 5-way', category: 'Коллекторный узел', serialNumber: 'FAR-IT-2026-091', warrantyYears: 10, installDate: '2026-09-12', notes: 'Оригинальный итальянский коллектор с вентилями тонкой регулировки.' },
        { siteId: site1, brand: 'Rehau', model: 'Rautitan Pink / Flex 20x2.8', category: 'Трубы и надвижные гильзы', serialNumber: 'RH-DE-BATCH-884', warrantyYears: 50, installDate: '2026-09-12', notes: 'Заводская гарантия Германии 50 лет. Скрытый монолитный монтаж в полу.' },
        { siteId: site1, brand: 'Geberit', model: 'Duofix Sigma 112 см (111.300.00.5)', category: 'Инсталляция подвесного унитаза', serialNumber: 'GEB-CH-44120', warrantyYears: 10, installDate: '2026-09-13', notes: 'Швейцарская инсталляция с бесшовным бачком. Установлена строго по проектному уровню.' }
      ];
      for (let eq of defaultEquipment) {
        await this.add('installed_equipment', eq);
      }

      // 8. Выплаты бригаде по объекту 1 (учет труда помощников)
      const defaultPayouts = [
        { siteId: site1, name: 'Алишер', role: 'Монтажник / Подмастерье', amountUZS: 500000, amountUSD: 39, usdRate: 12900, date: '2026-09-12', paymentType: 'cash', workDescription: 'Штробление стен и укладка лучевых трасс Rehau' },
        { siteId: site1, name: 'Сардор', role: 'Слесарь-монтажник', amountUZS: 300000, amountUSD: 23, usdRate: 12900, date: '2026-09-14', paymentType: 'card', workDescription: 'Помощь в опрессовке 16 бар и фотофиксация узлов' }
      ];
      for (let p of defaultPayouts) {
        await this.add('brigade_payouts', p);
      }

      // 9. Начальные постоянные контакты Лиги Мастеров (Бизнес-книга Улугбека)
      if (this.db.objectStoreNames.contains('contacts')) {
        const existingContacts = await this.getAll('contacts');
        if (existingContacts.length === 0) {
          const defaultContacts = [
            {
              contactId: 'LIGA-C-001',
              name: 'Бахром-ака',
              role: 'Заказчик (VIP)',
              phone: '+998901234567',
              phoneHistory: ['+998901234567'],
              addressHistory: ['ЖК Mirabad Avenue, Блок B, кв. 142'],
              notes: 'VIP-клиент. Предпочитает Rehau Pink и коллекторы FAR. Оплата строго по графику.',
              siteIds: [site1],
              createdAt: '2026-09-10'
            },
            {
              contactId: 'LIGA-C-002',
              name: 'Камила (Studio 7)',
              role: 'Дизайнер / Архитектор',
              phone: '+998939876543',
              phoneHistory: ['+998939876543'],
              addressHistory: ['Ташкент, ул. Чехова 14 (Студия 7)'],
              notes: 'Ведущий дизайнер интерьеров. Всегда требует соосность водорозеток с раскладкой плитки.',
              siteIds: [site1],
              createdAt: '2026-09-10'
            },
            {
              contactId: 'LIGA-C-003',
              name: 'Джамшид-ака',
              role: 'Заказчик (VIP)',
              phone: '+998971112233',
              phoneHistory: ['+998971112233'],
              addressHistory: ['Nest One, Башня A, Пентхаус 41'],
              notes: 'Двухуровневый пентхаус. Шумоизоляция стояков Comfort Mat и система Нептун Smart.',
              siteIds: [site2],
              createdAt: '2026-09-15'
            },
            {
              contactId: 'LIGA-C-004',
              name: 'Сарвар Архитект',
              role: 'Дизайнер / Архитектор',
              phone: '+998909998877',
              phoneHistory: ['+998909998877'],
              addressHistory: ['Nest One'],
              notes: 'Авторский надзор отопления, согласование трасс теплых полов.',
              siteIds: [site2],
              createdAt: '2026-09-15'
            }
          ];
          for (let c of defaultContacts) {
            await this.add('contacts', c);
          }
        }
      }
    }
  }

  // Универсальные CRUD операции
  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getBySiteId(storeName, siteId) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index('siteId');
      const request = index.getAll(siteId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // Статистика базы данных для карточки резервного копирования
  async getStats() {
    const sites = await this.getAll('sites');
    const materials = await this.getAll('materials');
    const checklists = await this.getAll('checklists');
    const payouts = this.db && this.db.objectStoreNames.contains('brigade_payouts') ? await this.getAll('brigade_payouts') : [];
    const equipment = this.db && this.db.objectStoreNames.contains('installed_equipment') ? await this.getAll('installed_equipment') : [];
    const timeline = this.db && this.db.objectStoreNames.contains('site_timeline_events') ? await this.getAll('site_timeline_events') : [];
    const contacts = this.db && this.db.objectStoreNames.contains('contacts') ? await this.getAll('contacts') : [];
    return {
      sitesCount: sites.length,
      materialsCount: materials.length,
      checklistsCount: checklists.length,
      payoutsCount: payouts.length,
      equipmentCount: equipment.length,
      timelineCount: timeline.length,
      contactsCount: contacts.length
    };
  }

  // Сбор полного снимка базы данных LIGA OS в объект
  async createBackupPayload() {
    let tariffSettings = null;
    try {
      const savedTariffs = localStorage.getItem('liga_tariff_settings_v1');
      if (savedTariffs) {
        tariffSettings = JSON.parse(savedTariffs);
      }
    } catch (e) {
      console.warn('Не удалось прочитать тарифы для бэкапа:', e);
    }

    const sites = await this.getAll('sites');
    const materials = await this.getAll('materials');
    const checklists = await this.getAll('checklists');
    const finances = await this.getAll('finances');
    const passports = await this.getAll('passports');
    const brigade_payouts = this.db && this.db.objectStoreNames.contains('brigade_payouts') ? await this.getAll('brigade_payouts') : [];
    const installed_equipment = this.db && this.db.objectStoreNames.contains('installed_equipment') ? await this.getAll('installed_equipment') : [];
    const site_timeline_events = this.db && this.db.objectStoreNames.contains('site_timeline_events') ? await this.getAll('site_timeline_events') : [];
    const contacts = this.db && this.db.objectStoreNames.contains('contacts') ? await this.getAll('contacts') : [];

    return {
      appName: 'LIGA OS',
      schemaVersion: 1,
      dbVersion: DB_VERSION,
      exportDate: new Date().toISOString(),
      appVersion: '2.0.4',
      sites,
      materials,
      checklists,
      finances,
      passports,
      brigade_payouts,
      installed_equipment,
      site_timeline_events,
      contacts,
      tariffSettings
    };
  }

  // Полный экспорт базы данных в JSON (Web Share API с фолбэком на скачивание)
  async exportFullBackup() {
    const payload = await this.createBackupPayload();
    const jsonStr = JSON.stringify(payload, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `liga_backup_${dateStr}.json`;

    // Проверяем возможность поделиться файлом через Web Share API (смартфон -> Telegram/WhatsApp/Диск)
    if (typeof File !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const file = new File([jsonStr], fileName, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Резервная копия LIGA OS',
            text: `Резервная копия базы LIGA OS от ${dateStr} (${payload.sites.length} объектов)`
          });
          return { success: true, method: 'share', fileName };
        }
      } catch (err) {
        if (err && err.name === 'AbortError') {
          return { success: false, aborted: true, method: 'share' };
        }
        console.warn('Web Share API не сработал, переключаемся на прямое скачивание:', err);
      }
    }

    // Фолбэк на прямое скачивание через <a download>
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true, method: 'download', fileName };
  }

  // Строгий валидатор схемы резервной копии
  validateBackup(jsonData) {
    let data = jsonData;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        throw new Error('Файл поврежден: не является валидным JSON-документом.');
      }
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Некорректная структура файла: ожидается JSON-объект базы данных.');
    }

    // 1. Проверяем сигнатуру принадлежности к LIGA OS
    if (data.appName !== 'LIGA OS') {
      throw new Error('Несовместимый файл: данный файл не является резервной копией LIGA OS (отсутствует appName="LIGA OS").');
    }

    // 2. Проверяем версию схемы (поддерживаем v1 и v2)
    if (typeof data.schemaVersion !== 'number' || data.schemaVersion < 1) {
      throw new Error('Несовместимая версия схемы резервной копии: ожидается числовая schemaVersion >= 1.');
    }

    // 3. Проверяем обязательные секции хранилищ
    const requiredSections = ['sites', 'materials', 'checklists', 'finances', 'passports'];
    for (const section of requiredSections) {
      if (!Array.isArray(data[section])) {
        throw new Error(`Ошибка структуры: обязательный раздел "${section}" отсутствует или не является списком.`);
      }
    }

    // 4. Проверяем корректность объектов sites
    const siteIds = new Set();
    for (let i = 0; i < data.sites.length; i++) {
      const site = data.sites[i];
      if (!site || typeof site !== 'object') {
        throw new Error(`Ошибка структуры: объект #${i + 1} поврежден.`);
      }
      if (site.id === undefined || site.id === null) {
        throw new Error(`Ошибка структуры: объект #${i + 1} не содержит обязательного идентификатора (id).`);
      }
      if (!site.name || typeof site.name !== 'string' || !site.name.trim()) {
        throw new Error(`Ошибка структуры: объект #${i + 1} не содержит обязательного наименования.`);
      }
      siteIds.add(site.id);
    }

    // 5. Проверка целостности внешних ключей (Foreign Key Integrity) по siteId
    const checkForeignKeyIntegrity = (items, sectionName) => {
      if (!Array.isArray(items)) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== 'object') continue;
        if (item.siteId !== undefined && item.siteId !== null) {
          if (!siteIds.has(item.siteId)) {
            throw new Error(`Ошибка целостности связей: запись #${i + 1} в разделе "${sectionName}" ссылается на несуществующий объект (siteId: ${item.siteId}).`);
          }
        }
      }
    };

    checkForeignKeyIntegrity(data.materials, 'materials');
    checkForeignKeyIntegrity(data.checklists, 'checklists');
    checkForeignKeyIntegrity(data.finances, 'finances');
    checkForeignKeyIntegrity(data.passports, 'passports');
    if (data.brigade_payouts) checkForeignKeyIntegrity(data.brigade_payouts, 'brigade_payouts');
    if (data.installed_equipment) checkForeignKeyIntegrity(data.installed_equipment, 'installed_equipment');
    if (data.site_timeline_events) checkForeignKeyIntegrity(data.site_timeline_events, 'site_timeline_events');

    return {
      valid: true,
      appName: data.appName,
      schemaVersion: data.schemaVersion,
      exportDate: data.exportDate || data.date || null,
      sitesCount: data.sites.length,
      materialsCount: data.materials.length,
      checklistsCount: data.checklists.length,
      financesCount: data.finances.length,
      passportsCount: data.passports.length,
      payoutsCount: Array.isArray(data.brigade_payouts) ? data.brigade_payouts.length : 0,
      equipmentCount: Array.isArray(data.installed_equipment) ? data.installed_equipment.length : 0,
      timelineCount: Array.isArray(data.site_timeline_events) ? data.site_timeline_events.length : 0,
      contactsCount: Array.isArray(data.contacts) ? data.contacts.length : 0,
      hasTariffs: Boolean(data.tariffSettings && typeof data.tariffSettings === 'object'),
      raw: data
    };
  }

  // Безопасное восстановление базы из резервной копии с сохранением текущих данных при сбое
  async restoreFromBackup(jsonData) {
    const metadata = this.validateBackup(jsonData);
    const data = metadata.raw;

    // Делаем снимок текущей базы данных для гарантированного отката при сбое
    const currentSnapshot = await this.createBackupPayload();
    const stores = [
      'sites', 'materials', 'checklists', 'finances', 'passports',
      'brigade_payouts', 'installed_equipment', 'site_timeline_events', 'contacts'
    ];

    const writeStores = async (sourceData) => {
      for (const s of stores) {
        if (!this.db.objectStoreNames.contains(s)) continue;
        const items = Array.isArray(sourceData[s]) ? sourceData[s] : [];
        
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction(s, 'readwrite');
          const store = tx.objectStore(s);
          const clearReq = store.clear();
          
          clearReq.onsuccess = () => {
            for (const item of items) {
              store.add(item);
            }
          };
          clearReq.onerror = () => reject(clearReq.error);
          
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(new Error(`Транзакция ${s} прервана`));
        });
      }
    };

    try {
      // Пытаемся записать новые данные
      await writeStores(data);
    } catch (err) {
      console.error('Ошибка импорта бэкапа, выполняем откат к исходному снимку базы:', err);
      try {
        await writeStores(currentSnapshot);
      } catch (rollbackErr) {
        console.error('Критическая ошибка при откате к снимку базы:', rollbackErr);
      }
      throw new Error(`Сбой восстановления: данные откатаны к исходному состоянию. Причина: ${err.message}`);
    }

    // Восстановление настроек тарифов (если есть в бэкапе)
    if (metadata.hasTariffs) {
      try {
        localStorage.setItem('liga_tariff_settings_v1', JSON.stringify(data.tariffSettings));
      } catch (e) {
        console.warn('Не удалось восстановить тарифы в localStorage:', e);
      }
    }

    return metadata;
  }
}

// Экспортируем единственный синглтон экземпляр
window.ligaDB = new LigaDatabase();
