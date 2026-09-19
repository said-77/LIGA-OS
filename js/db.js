/* ==========================================================================
   LIGA OS — Локальное защищенное хранилище IndexedDB
   100% Offline-First • Без внешних серверов • Экспорт в Telegram
   ========================================================================== */

const DB_NAME = 'LigaOS_DB';
const DB_VERSION = 1;

class LigaDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

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
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        // Проверяем, есть ли начальные данные, если нет — заполняем элитными объектами
        await this.seedInitialDataIfEmpty();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Ошибка инициализации IndexedDB:', event.target.error);
        reject(event.target.error);
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

  // Полный экспорт базы данных в JSON (Резервная копия в Telegram)
  async exportFullBackup() {
    const backup = {
      version: DB_VERSION,
      date: new Date().toISOString(),
      appName: 'LIGA OS',
      sites: await this.getAll('sites'),
      finances: await this.getAll('finances'),
      materials: await this.getAll('materials'),
      checklists: await this.getAll('checklists'),
      passports: await this.getAll('passports')
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LIGA_OS_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  // Импорт резервной копии
  async importBackup(jsonData) {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    if (!data.sites) throw new Error('Некорректный формат файла резервной копии');

    // Очищаем и перезаписываем
    const stores = ['sites', 'finances', 'materials', 'checklists', 'passports'];
    for (let s of stores) {
      if (data[s] && Array.isArray(data[s])) {
        const tx = this.db.transaction(s, 'readwrite');
        const store = tx.objectStore(s);
        store.clear();
        for (let item of data[s]) {
          store.add(item);
        }
      }
    }
    return true;
  }
}

// Экспортируем единственный синглтон экземпляр
window.ligaDB = new LigaDatabase();
