/**
 * LIGA AI — Инженерный Консьерж (v2.2.0)
 * Gemini 2.5 Flash + Web Speech API (естественный голос)
 * 
 * Архитектура:
 *  - Всё хранится локально (API ключ в localStorage, история в памяти)
 *  - Автоопределение сети → индикатор 🟢/⚪ в шапке
 *  - Системный промпт LIGA OS: контекст сантехники, стандарты 16 бар
 *  - Голос: Web Speech Recognition + SpeechSynthesis с фильтром лучших голосов
 */

'use strict';

class LigaAIConcierge {
  constructor() {
    // ── Состояние ────────────────────────────────────────────────────────────
    this.apiKey = localStorage.getItem('liga_ai_key') || '';
    this.isOnline = navigator.onLine;
    this.isEnabled = localStorage.getItem('liga_ai_enabled') !== 'false';
    this.voiceEnabled = localStorage.getItem('liga_ai_voice') !== 'false';
    this.isRecording = false;
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.preferredVoice = null;
    this.chatHistory = []; // {role: 'user'|'model', parts: [{text}]}
    this.isThinking = false;

    // ── DOM ─────────────────────────────────────────────────────────────────
    this.aiIndicator = null;
    this.chatMessages = null;
    this.chatInput = null;

    // ── Системный промпт LIGA OS ─────────────────────────────────────────────
    this.SYSTEM_PROMPT = `Ты — LIGA AI, персональный инженерный консьерж премиальной системы LIGA OS (Операционная Система Инженерного Мастера).
Ты ассистируешь ведущему инженеру элитной сантехники и отопления в Ташкенте — Улугбеку Хакимову («Лига Опытных Мастеров»).

ТВОЙ СТАТУС И СТИЛЬ:
- Ты говоришь уверенно, профессионально, уважительно и предельно лаконично (мастер в работе на объекте, цени его секунды).
- Используй терминологию швейцарского инженерного стандарта: лучевая разводка, коллекторные группы FAR, трубы Rehau Rautitan Pink/Platinum (PEX-a с кислородным барьером EVOH), фитинги под натяжную гильзу, компенсаторы гидроударов, редукторы давления Caleffi.

ИНЖЕНЕРНАЯ БАЗА ЗНАНИЙ (ТАШКЕНТ И СТРОИТЕЛЬНЫЕ НОРМЫ):
1. ОПРЕССОВКА 16 БАР / 24 ЧАСА:
   - Стандарт LIGA OS в 4 раза жестче СНиП (СНиП требует 4–6 бар на 1–2 часа).
   - Зачем 16 бар: выявление микротрещин фитингов и заводского брака ДО заливки полусухой стяжки. Залитая стяжка с протечкой стоит заказчику от 150 до 300 млн сум переделки.
   - Допустимое падение давления: не более 0.2–0.3 бар за 24ч (обусловлено температурным расширением воды).
2. РАСЧЕТ ВОДЯНОГО ТЕПЛОГО ПОЛА:
   - Шаг укладки: основной — 150 мм (расход трубы ~6.5–6.7 м на 1 м²); рантовые зоны у панорамных окон — 100 мм (расход ~10 м на 1 м²).
   - Максимальная длина одного контура 16×2.0 мм: не более 80–90 метров (гидравлическое сопротивление до 20 кПа).
   - Число выходов коллектора: 1 контур на каждые 10–12 м² площади пола.
3. ВОДОСНАБЖЕНИЕ В НОВОСТРОЙКАХ ТАШКЕНТА (Mirabad Avenue, Infinity, Nest One, Tashkent City):
   - Высокое давление от насосных станций (скачки до 7–9 бар). Обязательна установка редуктора давления Caleffi (настройка на 3.0–3.5 бар), фильтров тонкой очистки 100 мкм с манометрами и гасителей гидроударов.
   - Только коллекторная лучевая схема: ни одного тройника в стяжке или под плиткой.
4. ПЕРЕГОВОРЫ С ЗАКАЗЧИКАМИ И ДИЗАЙНЕРАМИ:
   - На вопрос «Почему у вас дороже, чем у бригад с базара?»: «Мы продаем не трубы, а 10 лет спокойного сна без риска затопить соседей на $50 000. В стоимость входит опрессовка 16 бар на 24 часа с составлением юридического паспорта объекта и гарантией».
   - При споре с дизайнером по выводам: «Инженерные законы гидравлики и уклонов канализации (3 см на метр для 50 трубы, 2 см для 110) первичны перед визуалом мебели, иначе будет застой и запах».

ГОЛОСОВЫЕ КОМАНДЫ LIGA OS:
Мастер может сказать вслух: «Покажи деньги» (переход в финансы), «Где базар» (склад чеков), «Перед стяжкой» (чек-лист 10 пунктов), «Сделай паспорт» (PDF генератор), «Скинь в тг» (Telegram отчет). Объясняй это мастеру при вопросах о программе.`;

    this._init();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Инициализация
  // ════════════════════════════════════════════════════════════════════════════
  _init() {
    // Ждём DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._setup());
    } else {
      this._setup();
    }
  }

  _setup() {
    this._bindElements();
    this._bindEvents();
    this._updateNetworkIndicator();
    this._initVoice();
    this._syncSettingsUI();

    // Следим за сетью
    window.addEventListener('online', () => {
      this.isOnline = true;
      this._updateNetworkIndicator();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this._updateNetworkIndicator();
    });

    console.log('[LIGA AI] Консьерж инициализирован. Сеть:', this.isOnline ? '🟢' : '⚪');
  }

  _bindElements() {
    this.aiIndicator = document.getElementById('btn-ai-concierge-open');
    this.chatMessages = document.getElementById('ai-chat-messages');
    this.chatInput = document.getElementById('ai-chat-input');
  }

  _bindEvents() {
    // Открытие модала AI консьержа
    const btnOpen = document.getElementById('btn-ai-concierge-open');
    if (btnOpen) btnOpen.addEventListener('click', () => this.openModal());

    const menuItemAI = document.getElementById('menu-item-ai');
    if (menuItemAI) menuItemAI.addEventListener('click', () => {
      window.app && window.app.closeMoreMenu && window.app.closeMoreMenu();
      this.openModal();
    });

    // Закрытие модала AI консьержа
    const btnClose = document.getElementById('btn-close-ai-concierge');
    if (btnClose) btnClose.addEventListener('click', () => this.closeModal());

    // Закрытие по клику на overlay
    const overlay = document.getElementById('modal-ai-concierge');
    if (overlay) overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });

    // Отправка сообщения
    const btnSend = document.getElementById('btn-ai-send');
    if (btnSend) btnSend.addEventListener('click', () => this._sendMessage());

    // Enter для отправки (Shift+Enter — новая строка)
    if (this.chatInput) {
      this.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._sendMessage();
        }
        // Автовысота
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 100) + 'px';
      });
    }

    // Голосовой ввод
    const btnVoice = document.getElementById('btn-ai-voice');
    if (btnVoice) btnVoice.addEventListener('click', () => this._toggleVoiceInput());

    // ── Модал настроек ───────────────────────────────────────────────────────
    const btnSettings = document.getElementById('btn-settings-top');
    if (btnSettings) btnSettings.addEventListener('click', () => this.openSettings());

    const menuItemSettings = document.getElementById('menu-item-settings');
    if (menuItemSettings) menuItemSettings.addEventListener('click', () => {
      window.app && window.app.closeMoreMenu && window.app.closeMoreMenu();
      this.openSettings();
    });

    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', () => this.closeSettings());

    const settingsOverlay = document.getElementById('modal-settings');
    if (settingsOverlay) settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) this.closeSettings();
    });

    // Восстановление подсказки 3 шага
    const btnRestore = document.getElementById('btn-restore-onboarding');
    if (btnRestore) btnRestore.addEventListener('click', () => {
      this.restoreOnboardingHint();
      this.closeSettings();
    });

    const menuItemHint = document.getElementById('menu-item-restore-hint');
    if (menuItemHint) menuItemHint.addEventListener('click', () => {
      window.app && window.app.closeMoreMenu && window.app.closeMoreMenu();
      this.restoreOnboardingHint();
    });

    // Сохранение API ключа
    const btnSaveKey = document.getElementById('btn-save-ai-key');
    if (btnSaveKey) btnSaveKey.addEventListener('click', () => this._saveApiKey());

    // Тоггл AI enabled
    const toggleAI = document.getElementById('toggle-ai-enabled');
    if (toggleAI) toggleAI.addEventListener('change', (e) => {
      this.isEnabled = e.target.checked;
      localStorage.setItem('liga_ai_enabled', this.isEnabled ? 'true' : 'false');
      this._updateNetworkIndicator();
    });

    // Тоггл AI Voice
    const toggleVoice = document.getElementById('toggle-ai-voice');
    if (toggleVoice) toggleVoice.addEventListener('change', (e) => {
      this.voiceEnabled = e.target.checked;
      localStorage.setItem('liga_ai_voice', this.voiceEnabled ? 'true' : 'false');
    });

    // Тоггл звука (синхронизация с app.js)
    const toggleSound = document.getElementById('toggle-sound');
    if (toggleSound) toggleSound.addEventListener('change', (e) => {
      window.app && window.app.toggleSound && window.app.toggleSound(e.target.checked);
    });

    // Тоггл темы
    const toggleTheme = document.getElementById('toggle-theme-settings');
    if (toggleTheme) toggleTheme.addEventListener('change', () => {
      window.app && window.app.toggleTheme && window.app.toggleTheme();
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Индикатор сети в шапке
  // ════════════════════════════════════════════════════════════════════════════
  _updateNetworkIndicator() {
    const indicator = document.getElementById('btn-ai-concierge-open');
    if (!indicator) return;

    const dot = indicator.querySelector('.ai-dot');
    const label = indicator.querySelector('.ai-label');

    if (this.isOnline && this.isEnabled && this.apiKey) {
      indicator.classList.remove('offline');
      if (dot) dot.style.display = '';
      if (label) label.textContent = 'AI';
      indicator.title = 'LIGA AI • НА СВЯЗИ (Gemini 2.5 Flash)';
    } else if (this.isOnline && this.isEnabled && !this.apiKey) {
      indicator.classList.add('offline');
      if (label) label.textContent = 'AI';
      indicator.title = 'LIGA AI — укажите API ключ в настройках';
    } else {
      indicator.classList.add('offline');
      if (label) label.textContent = 'AI';
      indicator.title = 'LIGA AI ОФЛАЙН • Ядро LIGA OS работает автономно';
    }

    // Скрыть/показать предупреждение в чате
    const offlineWarn = document.getElementById('ai-offline-warning');
    if (offlineWarn) {
      offlineWarn.style.display = (!this.isOnline || !this.apiKey) ? 'block' : 'none';
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Открытие/закрытие модалов
  // ════════════════════════════════════════════════════════════════════════════
  openModal() {
    const modal = document.getElementById('modal-ai-concierge');
    if (modal) {
      if (window.app && window.app.openModal) {
        window.app.openModal('modal-ai-concierge');
      } else {
        modal.classList.add('open');
      }
      this._updateNetworkIndicator();
      if (!this.apiKey) {
        this._addSystemMessage('⚙️ Для работы LIGA AI укажите бесплатный Google AI API ключ в Настройках (кнопка ⚙️ вверху).');
      }
      setTimeout(() => this.chatInput && this.chatInput.focus(), 150);
    }
  }

  closeModal() {
    if (window.app && window.app.closeModal) {
      window.app.closeModal('modal-ai-concierge');
    } else {
      const modal = document.getElementById('modal-ai-concierge');
      if (modal) modal.classList.remove('open');
    }
  }

  openSettings() {
    const modal = document.getElementById('modal-settings');
    if (modal) {
      this._syncSettingsUI();
      if (window.app && window.app.openModal) {
        window.app.openModal('modal-settings');
      } else {
        modal.classList.add('open');
      }
    }
  }

  closeSettings() {
    if (window.app && window.app.closeModal) {
      window.app.closeModal('modal-settings');
    } else {
      const modal = document.getElementById('modal-settings');
      if (modal) modal.classList.remove('open');
    }
  }

  _syncSettingsUI() {
    const toggleAI = document.getElementById('toggle-ai-enabled');
    if (toggleAI) toggleAI.checked = this.isEnabled;

    const toggleVoice = document.getElementById('toggle-ai-voice');
    if (toggleVoice) toggleVoice.checked = this.voiceEnabled;

    const keyInput = document.getElementById('ai-api-key-input');
    if (keyInput && this.apiKey) keyInput.value = this.apiKey;

    // Синхронизация темы
    const toggleTheme = document.getElementById('toggle-theme-settings');
    if (toggleTheme) {
      toggleTheme.checked = document.documentElement.getAttribute('data-theme') === 'dark';
    }

    // Синхронизация звука
    const toggleSound = document.getElementById('toggle-sound');
    if (toggleSound) {
      const soundEnabled = localStorage.getItem('liga_sound') !== 'false';
      toggleSound.checked = soundEnabled;
    }
  }

  _saveApiKey() {
    const keyInput = document.getElementById('ai-api-key-input');
    if (!keyInput) return;

    const key = keyInput.value.trim();
    if (!key.startsWith('AIza') && key.length > 0) {
      this._showToast('⚠️ Ключ должен начинаться с AIza...');
      return;
    }

    this.apiKey = key;
    localStorage.setItem('liga_ai_key', key);
    this._updateNetworkIndicator();

    if (key) {
      this._showToast('✅ API ключ сохранён! LIGA AI активирован.');
    } else {
      this._showToast('🗑️ API ключ удалён.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Восстановление подсказки новичка
  // ════════════════════════════════════════════════════════════════════════════
  restoreOnboardingHint() {
    localStorage.removeItem('liga_onboarding_dismissed');
    const hint = document.getElementById('quick-onboarding-hint');
    if (hint) {
      hint.style.display = '';
      hint.style.animation = 'fadeInSituation 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      this._showToast('💡 Подсказка восстановлена!');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Отправка сообщения → Gemini 2.5 Flash API
  // ════════════════════════════════════════════════════════════════════════════
  async _sendMessage() {
    if (!this.chatInput) return;
    const text = this.chatInput.value.trim();
    if (!text || this.isThinking) return;

    this.chatInput.value = '';
    this.chatInput.style.height = 'auto';

    // Добавить сообщение пользователя
    this._addUserMessage(text);

    // Проверить доступность
    if (!this.isOnline) {
      this._addSystemMessage('⚪ Нет интернета. LIGA AI недоступен — ядро LIGA OS работает автономно.');
      return;
    }
    if (!this.apiKey) {
      this._addSystemMessage('⚙️ Укажите Google AI API ключ в Настройках LIGA OS (кнопка ⚙️).');
      return;
    }
    if (!this.isEnabled) {
      this._addSystemMessage('ИИ-консьерж отключён в настройках.');
      return;
    }

    // Показать индикатор «думает»
    this.isThinking = true;
    const typingEl = this._showTypingIndicator();

    // Добавить в историю
    this.chatHistory.push({ role: 'user', parts: [{ text }] });

    try {
      const response = await this._callGeminiAPI(text);
      this._removeTypingIndicator(typingEl);
      this.isThinking = false;

      if (response) {
        this._addAIMessage(response);
        this.chatHistory.push({ role: 'model', parts: [{ text: response }] });
        if (this.voiceEnabled) this._speak(response);
      }
    } catch (err) {
      this._removeTypingIndicator(typingEl);
      this.isThinking = false;
      console.error('[LIGA AI] Error:', err);
      this._addSystemMessage('❌ Ошибка связи с LIGA AI: ' + (err.message || 'Проверьте API ключ.'));
    }
  }

  async _callGeminiAPI(userText) {
    const MODEL = 'gemini-2.5-flash-preview-05-20';
    const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${this.apiKey}`;

    // Формируем контекст: системный промпт + история + новый вопрос
    const contents = [];

    // Системный промпт как первое user-сообщение (Gemini v1beta формат)
    contents.push({
      role: 'user',
      parts: [{ text: this.SYSTEM_PROMPT }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Понял! Я LIGA AI — инженерный консьерж системы LIGA OS. Готов помогать.' }]
    });

    // История диалога (последние 6 обменов, чтобы не раздувать контекст)
    const recentHistory = this.chatHistory.slice(-12);
    contents.push(...recentHistory);

    const body = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.9,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      ]
    };

    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000) // 30 сек таймаут
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 400) throw new Error('Неверный API ключ или формат запроса');
      if (res.status === 429) throw new Error('Превышен лимит запросов, подождите 1 минуту');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) throw new Error('Пустой ответ от API');
    return text.trim();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Голосовой ввод (Web Speech Recognition)
  // ════════════════════════════════════════════════════════════════════════════
  _initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    this.recognition = new SR();
    this.recognition.lang = 'ru-RU';
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (this.chatInput) this.chatInput.value = transcript;
      this._stopRecording();
      // Авто-отправка
      setTimeout(() => this._sendMessage(), 100);
    };

    this.recognition.onerror = () => this._stopRecording();
    this.recognition.onend = () => this._stopRecording();

    // Выбрать лучший голос для синтеза речи
    if (this.synthesis) {
      const selectVoice = () => {
        const voices = this.synthesis.getVoices();
        // Приоритет: русскоязычные нейросетевые голоса
        const preferred = voices.find(v =>
          v.lang.startsWith('ru') && (v.name.includes('Neural') || v.name.includes('Wavenet') || v.name.includes('Premium'))
        ) || voices.find(v => v.lang.startsWith('ru') && !v.localService)
          || voices.find(v => v.lang.startsWith('ru'));
        if (preferred) this.preferredVoice = preferred;
      };
      selectVoice();
      this.synthesis.onvoiceschanged = selectVoice;
    }
  }

  _toggleVoiceInput() {
    if (this.isRecording) {
      this._stopRecording();
    } else {
      this._startRecording();
    }
  }

  _startRecording() {
    if (!this.recognition) {
      this._showToast('Голосовой ввод недоступен в этом браузере');
      return;
    }
    try {
      this.recognition.start();
      this.isRecording = true;
      const btn = document.getElementById('btn-ai-voice');
      if (btn) { btn.classList.add('recording'); btn.title = 'Говорите... (нажмите для остановки)'; }
    } catch (e) {
      console.warn('[LIGA AI] Voice start error:', e);
    }
  }

  _stopRecording() {
    this.isRecording = false;
    try { this.recognition && this.recognition.stop(); } catch (_) {}
    const btn = document.getElementById('btn-ai-voice');
    if (btn) { btn.classList.remove('recording'); btn.title = 'Голосовой ввод'; }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Синтез речи — естественный голос
  // ════════════════════════════════════════════════════════════════════════════
  _speak(text) {
    if (!this.voiceEnabled || !this.synthesis) return;

    // Очистить от markdown-символов
    const cleanText = text
      .replace(/[*#`_~[\]()]/g, '')
      .replace(/\n\n+/g, '. ')
      .replace(/\n/g, ', ')
      .slice(0, 300); // Не более 300 символов для озвучки

    this.synthesis.cancel();
    const utt = new SpeechSynthesisUtterance(cleanText);
    utt.lang = 'ru-RU';
    utt.rate = 1.0;
    utt.pitch = 1.0;
    utt.volume = 0.9;
    if (this.preferredVoice) utt.voice = this.preferredVoice;
    this.synthesis.speak(utt);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UI: добавление сообщений в чат
  // ════════════════════════════════════════════════════════════════════════════
  _addUserMessage(text) {
    const el = document.createElement('div');
    el.className = 'ai-msg user-msg';
    el.innerHTML = `
      <div class="ai-msg-avatar">👤</div>
      <div class="ai-msg-bubble">${this._escapeHtml(text)}</div>
    `;
    this.chatMessages && this.chatMessages.appendChild(el);
    this._scrollChat();
  }

  _addAIMessage(text) {
    // Конвертировать простой markdown в HTML
    const html = this._simpleMarkdown(text);
    const el = document.createElement('div');
    el.className = 'ai-msg';
    el.innerHTML = `
      <div class="ai-msg-avatar">🛡️</div>
      <div class="ai-msg-bubble">${html}</div>
    `;
    this.chatMessages && this.chatMessages.appendChild(el);
    this._scrollChat();
  }

  _addSystemMessage(text) {
    const el = document.createElement('div');
    el.className = 'ai-msg';
    el.innerHTML = `
      <div class="ai-msg-avatar" style="background:rgba(148,163,184,0.2); font-size:11px;">ℹ️</div>
      <div class="ai-msg-bubble" style="color:var(--text-muted); font-size:12px;">${this._escapeHtml(text)}</div>
    `;
    this.chatMessages && this.chatMessages.appendChild(el);
    this._scrollChat();
  }

  _showTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'ai-msg';
    el.id = 'ai-typing-indicator-el';
    el.innerHTML = `
      <div class="ai-msg-avatar">🛡️</div>
      <div class="ai-typing-indicator">
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
      </div>
    `;
    this.chatMessages && this.chatMessages.appendChild(el);
    this._scrollChat();
    return el;
  }

  _removeTypingIndicator(el) {
    el && el.parentNode && el.parentNode.removeChild(el);
  }

  _scrollChat() {
    if (this.chatMessages) {
      requestAnimationFrame(() => {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Вспомогательные утилиты
  // ════════════════════════════════════════════════════════════════════════════
  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _simpleMarkdown(text) {
    return this._escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:rgba(212,175,55,0.1);padding:1px 4px;border-radius:4px;font-size:11px;">$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }

  _showToast(message) {
    // Используем toast системы app.js если доступен
    if (window.app && typeof window.app.showToast === 'function') {
      window.app.showToast(message);
      return;
    }
    // Fallback
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
      background:rgba(30,41,59,0.95); color:#fff; padding:10px 18px;
      border-radius:10px; font-size:13px; font-weight:700; z-index:9999;
      border:1px solid rgba(212,175,55,0.3); box-shadow:0 4px 16px rgba(0,0,0,0.4);
      max-width:80vw; text-align:center;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Запуск
// ════════════════════════════════════════════════════════════════════════════
window.ligaAI = new LigaAIConcierge();
