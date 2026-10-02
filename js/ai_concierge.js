/**
 * LIGA AI — Инженерный Консьерж (v2.2.0)
 * Gemini 3.8 Flash + Web Speech API (естественный голос)
 * 
 * Архитектура:
 *  - Всё хранится локально (API ключ в localStorage, история в памяти)
 *  - Автоопределение сети → индикатор 🟢/⚪ в шапке
 *  - Системный промпт LIGA OS: инженерные рекомендации с учетом данных объекта
 *  - Голос: Web Speech Recognition + SpeechSynthesis с фильтром лучших голосов
 */

'use strict';

class LigaAIConcierge {
  constructor() {
    // ── Состояние ────────────────────────────────────────────────────────────
    this.apiKey = localStorage.getItem('liga_ai_key') || '';
    this.connectionStatus = localStorage.getItem('liga_ai_connection_status') || 'unknown';
    this.backupProvider = localStorage.getItem('liga_ai_backup_provider') || 'openai';
    this.backupApiKey = localStorage.getItem('liga_ai_backup_key') || '';
    this.backupConnectionStatus = localStorage.getItem('liga_ai_backup_connection_status') || 'unknown';
    this.autoFailover = localStorage.getItem('liga_ai_autofailover') !== 'false';
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
    this.SYSTEM_PROMPT = `Ты — LIGA AI, помощник по интерфейсу и работе в LIGA OS. Отвечай по-русски, спокойно и простыми короткими шагами.
Основная задача — объяснить назначение выбранного экрана или инструмента, какие данные подготовить, что нажать, какой результат ожидать и что проверить перед сохранением.
Используй только приведённый справочник и вопрос пользователя. Если точной информации нет, скажи об этом и задай короткий уточняющий вопрос. Не выдумывай названия кнопок, формулы, нормы, гарантии и функции.
Все инженерные значения зависят от проекта, оборудования и фактических исходных данных; не подтверждай их без проверки. 16 бар — не универсальное требование.
Не проси присылать контакты, адреса, финансовые данные, API-ключи, фотографии или секреты. Не повторяй такие сведения, если пользователь их написал. Не утверждай, что видишь базу LIGA OS: она остаётся на устройстве.`;

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

    const btnExplainScreen = document.getElementById('btn-ai-explain-screen');
    if (btnExplainScreen) btnExplainScreen.addEventListener('click', () => {
      const entry = this._getActiveHelpEntry();
      const input = this.chatInput;
      if (!input) return;
      input.value = entry
        ? `Объясни раздел «${entry.title}»: для чего он нужен и как выполнить основное действие по шагам?`
        : 'Объясни, как пользоваться текущим экраном. Если ты не знаешь его точное назначение, уточни у меня название раздела.';
      this._sendMessage();
    });

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
    const btnTestKey = document.getElementById('btn-test-ai-key');
    if (btnTestKey) btnTestKey.addEventListener('click', () => this._testProvider('google'));
    const btnTestBackupKey = document.getElementById('btn-test-ai-backup-key');
    if (btnTestBackupKey) btnTestBackupKey.addEventListener('click', () => this._testProvider('backup'));
    document.querySelectorAll('[data-toggle-secret]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.toggleSecret);
        if (!input) return;
        const reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(reveal));
        button.textContent = reveal ? 'Скрыть' : 'Показать';
      });
    });

    // Сохранение резервного API ключа (Failover)
    const btnSaveBackupKey = document.getElementById('btn-save-ai-backup-key');
    if (btnSaveBackupKey) btnSaveBackupKey.addEventListener('click', () => this._saveBackupApiKey());

    const selectBackupProvider = document.getElementById('select-ai-backup-provider');
    if (selectBackupProvider) selectBackupProvider.addEventListener('change', (e) => {
      this.backupProvider = e.target.value;
      localStorage.setItem('liga_ai_backup_provider', this.backupProvider);
      this.backupConnectionStatus = 'unknown';
      localStorage.setItem('liga_ai_backup_connection_status', 'unknown');
      this._setProviderStatus('ai-backup-status', 'Провайдер изменён. Проверьте ключ и подключение.', 'pending');
      this._updateNetworkIndicator();
    });

    const toggleFailover = document.getElementById('toggle-ai-autofailover');
    if (toggleFailover) toggleFailover.addEventListener('change', (e) => {
      this.autoFailover = e.target.checked;
      localStorage.setItem('liga_ai_autofailover', this.autoFailover ? 'true' : 'false');
    });

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

    const mainIsConnected = Boolean(this.apiKey && this.connectionStatus === 'connected');
    const backupIsConnected = Boolean(this.backupApiKey && this.backupConnectionStatus === 'connected');
    const activeProvider = mainIsConnected ? 'Google Gemini' : backupIsConnected
      ? ({ openai: 'OpenAI', groq: 'Groq', google: 'Google Gemini' }[this.backupProvider] || 'резервный ИИ')
      : '';

    if (this.isOnline && this.isEnabled && activeProvider) {
      indicator.classList.remove('offline');
      if (dot) dot.style.display = '';
      if (label) label.textContent = 'AI';
      indicator.title = `LIGA AI • последняя проверка ${activeProvider}: успешно`;
    } else if (this.isOnline && this.isEnabled && (this.apiKey || this.backupApiKey)) {
      indicator.classList.add('offline');
      if (dot) dot.style.display = '';
      if (label) label.textContent = 'AI';
      const allConfiguredProvidersFailed = (!this.apiKey || this.connectionStatus === 'error')
        && (!this.backupApiKey || this.backupConnectionStatus === 'error');
      indicator.title = allConfiguredProvidersFailed
        ? 'LIGA AI • последняя проверка не прошла; откройте настройки для причины'
        : 'LIGA AI • ключ сохранён, подключение не подтверждено; проверьте связь в настройках';
    } else if (this.isOnline && this.isEnabled) {
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
      offlineWarn.style.display = (!this.isOnline || (!this.apiKey && !this.backupApiKey) || (!mainIsConnected && !backupIsConnected)) ? 'block' : 'none';
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

      // Отображение активного объекта в шапке чата LIGA AI (v2.4.1)
      const badge = document.getElementById('ai-active-site-badge');
      const nameEl = document.getElementById('ai-active-site-name');
      if (badge && nameEl) {
        if (window.app && window.app.currentSite) {
          const s = window.app.currentSite;
          nameEl.textContent = `${s.title || s.address || 'Активный объект'} (${s.clientName || 'Заказчик'})`;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }

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
    if (keyInput && !keyInput.value) keyInput.value = this.apiKey;

    // Синхронизация резервного оператора (Failover)
    const selectBackupProvider = document.getElementById('select-ai-backup-provider');
    if (selectBackupProvider) selectBackupProvider.value = this.backupProvider;

    const backupKeyInput = document.getElementById('ai-backup-key-input');
    if (backupKeyInput && !backupKeyInput.value) backupKeyInput.value = this.backupApiKey;

    const toggleFailover = document.getElementById('toggle-ai-autofailover');
    if (toggleFailover) toggleFailover.checked = this.autoFailover;

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
    this._renderProviderStatus();
  }

  _saveApiKey() {
    const keyInput = document.getElementById('ai-api-key-input');
    if (!keyInput) return;

    const key = keyInput.value.trim();
    if (key.length > 0 && key.length < 12) {
      this._setProviderStatus('ai-provider-status', 'Ключ слишком короткий. Скопируйте его целиком из кабинета провайдера.', 'error');
      return;
    }

    this.apiKey = key;
    localStorage.setItem('liga_ai_key', key);
    this.connectionStatus = 'unknown';
    localStorage.setItem('liga_ai_connection_status', 'unknown');

    if (key) {
      this._setProviderStatus('ai-provider-status', 'Ключ сохранён на этом устройстве. Связь ещё не проверена.', 'pending');
      this._updateNetworkIndicator();
      this._showToast('Ключ сохранён. Нажмите «Проверить связь».');
    } else {
      this._setProviderStatus('ai-provider-status', 'Ключ удалён. LIGA AI не подключён.', 'pending');
      this._updateNetworkIndicator();
      this._showToast('🗑️ API ключ удалён.');
    }
  }

  _saveBackupApiKey() {
    const keyInput = document.getElementById('ai-backup-key-input');
    if (!keyInput) return;

    const key = keyInput.value.trim();
    this.backupApiKey = key;
    localStorage.setItem('liga_ai_backup_key', key);
    this.backupConnectionStatus = 'unknown';
    localStorage.setItem('liga_ai_backup_connection_status', 'unknown');

    const sel = document.getElementById('select-ai-backup-provider');
    if (sel) {
      this.backupProvider = sel.value;
      localStorage.setItem('liga_ai_backup_provider', this.backupProvider);
    }

    if (key) {
      this._setProviderStatus('ai-backup-status', 'Ключ сохранён на этом устройстве. Связь ещё не проверена.', 'pending');
      this._updateNetworkIndicator();
      this._showToast('Резервный ключ сохранён. Нажмите «Проверить связь».');
    } else {
      this._setProviderStatus('ai-backup-status', 'Ключ удалён. Резервный оператор не подключён.', 'pending');
      this._updateNetworkIndicator();
      this._showToast('🗑️ Резервный ключ удалён.');
    }
  }

  _setProviderStatus(id, message, state = 'pending') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.dataset.state = state;
  }

  _renderProviderStatus() {
    const main = document.getElementById('ai-provider-status');
    if (main && !main.textContent.trim()) this._setProviderStatus('ai-provider-status', this.apiKey ? 'Ключ сохранён; связь не проверена.' : 'Ключ не сохранён.');
    const backup = document.getElementById('ai-backup-status');
    if (backup && !backup.textContent.trim()) this._setProviderStatus('ai-backup-status', this.backupApiKey ? 'Ключ сохранён; связь не проверена.' : 'Ключ не сохранён.');
  }

  async _testProvider(provider = 'google') {
    const isGoogle = provider === 'google';
    const input = document.getElementById(isGoogle ? 'ai-api-key-input' : 'ai-backup-key-input');
    const key = (input?.value || '').trim();
    const statusId = isGoogle ? 'ai-provider-status' : 'ai-backup-status';
    if (!key) {
      this._setProviderStatus(statusId, 'Сначала вставьте и сохраните ключ этого провайдера.', 'error');
      return false;
    }
    if (!navigator.onLine) {
      this._setProviderStatus(statusId, 'Нет интернета. Проверьте подключение и повторите попытку.', 'error');
      return false;
    }
    this._setProviderStatus(statusId, 'Проверяем связь…');
    try {
      const response = isGoogle
        ? await this._callGeminiAPI('Ответь одним словом: связь работает.', { key, history: false })
        : await this._callBackupProvider(this.backupProvider, 'Ответь одним словом: связь работает.', key, false);
      if (!response) throw new Error('Провайдер вернул пустой ответ');
      this._setProviderStatus(statusId, 'Связь работает. Провайдер принял ключ и ответил.', 'success');
      if (isGoogle && key === this.apiKey) {
        this.connectionStatus = 'connected';
        localStorage.setItem('liga_ai_connection_status', 'connected');
        this._updateNetworkIndicator();
      }
      if (!isGoogle && key === this.backupApiKey) {
        this.backupConnectionStatus = 'connected';
        localStorage.setItem('liga_ai_backup_connection_status', 'connected');
        this._updateNetworkIndicator();
      }
      return true;
    } catch (error) {
      const message = String(error?.message || 'неизвестная ошибка');
      let reason = message.slice(0, 180);
      if (/401|403|API key|ключ|unauthorized|permission/i.test(message)) reason = 'ключ неверный, отозван или не имеет доступа к API.';
      else if (/404|not found|model/i.test(message)) reason = 'модель или адрес API недоступны.';
      else if (/429|лимит|quota|rate/i.test(message)) reason = 'провайдер ограничил запросы или исчерпан лимит.';
      else if (/timeout|abort/i.test(message)) reason = 'провайдер не ответил за 30 секунд.';
      else if (/Failed to fetch|network|fetch/i.test(message)) reason = 'сеть или соединение с провайдером недоступны.';
      this._setProviderStatus(statusId, `Связь не установлена: ${reason}`, 'error');
      if (isGoogle && key === this.apiKey) {
        this.connectionStatus = 'error';
        localStorage.setItem('liga_ai_connection_status', 'error');
        this._updateNetworkIndicator();
      }
      if (!isGoogle && key === this.backupApiKey) {
        this.backupConnectionStatus = 'error';
        localStorage.setItem('liga_ai_backup_connection_status', 'error');
        this._updateNetworkIndicator();
      }
      return false;
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
  // Отправка сообщения → Gemini 3.8 Flash API
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
    if (!this.apiKey && !this.backupApiKey) {
      this._addSystemMessage('⚙️ Укажите API ключ в Настройках LIGA OS (Google AI Studio бесплатно или OpenAI/Groq).');
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
      const response = await this._callAIWithFailover(text);
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

  // Интеллектуальный роутер с авто-переключением (Failover) при сбоях или лимитах
  async _callAIWithFailover(userText) {
    let lastErr = null;

    // 1. Попытка основного оператора (Google Gemini — бесплатный)
    if (this.apiKey) {
      try {
        return await this._callGeminiAPI(userText);
      } catch (err) {
        console.warn('[LIGA AI] Gemini error:', err.message);
        lastErr = err;
        // Если авто-переключение не настроено — сразу пробрасываем ошибку
        if (!this.autoFailover || !this.backupApiKey) {
          throw err;
        }
        this._showToast('⚡ Лимит Gemini исчерпан. Переключаю на резервного оператора...');
      }
    }

    // 2. Резервный оператор (OpenAI, Groq или Google Gemini)
    if (this.backupApiKey) {
      try {
        if (this.backupProvider === 'google') {
          return await this._callGeminiAPI(userText, { key: this.backupApiKey });
        } else if (this.backupProvider === 'groq') {
          return await this._callGroqAPI(userText);
        } else {
          return await this._callOpenAIAPI(userText);
        }
      } catch (backupErr) {
        console.error('[LIGA AI] Backup provider error:', backupErr);
        throw new Error(`Ошибка резервного канала (${this.backupProvider}): ${backupErr.message}`);
      }
    }

    throw lastErr || new Error('API ключ не указан в настройках.');
  }

  async _callOpenAIAPI(userText, options = {}) {
    const URL = 'https://api.openai.com/v1/chat/completions';
    const activePrompt = this._buildHelpPrompt();


    const messages = [
      { role: 'system', content: activePrompt },
      ...(options.history === false ? [] : this.chatHistory.slice(0, -1).slice(-4)).map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.parts?.[0]?.text || m.content || ''
      })),
      { role: 'user', content: userText }
    ];

    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.backupApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 600
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429) throw new Error('Превышен лимит запросов OpenAI');
      throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Пустой ответ от OpenAI');
    return reply.trim();
  }

  async _callGroqAPI(userText, options = {}) {
    const URL = 'https://api.groq.com/openai/v1/chat/completions';
    const activePrompt = this._buildHelpPrompt();


    const messages = [
      { role: 'system', content: activePrompt },
      ...(options.history === false ? [] : this.chatHistory.slice(0, -1).slice(-4)).map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.parts?.[0]?.text || m.content || ''
      })),
      { role: 'user', content: userText }
    ];

    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.backupApiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: messages,
        temperature: 0.7,
        max_tokens: 600
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Пустой ответ от Groq');
    return reply.trim();
  }

  _buildHelpPrompt() {
    const active = this._getActiveHelpEntry();
    const catalog = Array.isArray(window.LIGA_HELP_CATALOG) ? window.LIGA_HELP_CATALOG : [];
    const matches = active ? [active] : [];
    const question = (this.chatInput?.value || this.chatHistory.at(-1)?.parts?.[0]?.text || '').toLocaleLowerCase('ru');
    const scored = catalog.map(entry => ({
      entry,
      score: (entry.keys || []).reduce((score, keyword) => score + (question.includes(keyword.toLocaleLowerCase('ru')) ? Math.min(keyword.length, 8) : 0), 0)
    })).filter(item => item.score > 0 && !matches.some(entry => entry.id === item.entry.id))
      .sort((left, right) => right.score - left.score);
    for (const item of scored.slice(0, 4)) matches.push(item.entry);
    const context = matches.length
      ? matches.map(entry => `• ${entry.title}: ${entry.text}`).join('\n')
      : 'Подходящая статья не найдена. Уточни название экрана или инструмента; не угадывай.';
    return `${this.SYSTEM_PROMPT}\n\nТЕКУЩИЙ РАЗДЕЛ: ${active?.title.toLocaleUpperCase('ru') || 'НЕ ОПРЕДЕЛЁН'}\nСПРАВОЧНИК ДЛЯ ЭТОГО ВОПРОСА:\n${context}\n\nПорядок ответа: назначение → короткие шаги → ожидаемый результат → что проверить. Передавай только общее название текущего раздела и выбранные справочные статьи; не включай текст DOM, название объекта или введённые значения.`;
  }

  _getActiveHelpEntry() {
    const catalog = Array.isArray(window.LIGA_HELP_CATALOG) ? window.LIGA_HELP_CATALOG : [];
    const screen = window.app?.currentScreen;
    const openModalIds = [...document.querySelectorAll('.modal-overlay.open[id]')]
      .map(modal => modal.id).filter(id => !['modal-ai-concierge', 'modal-settings'].includes(id));
    const modalMap = {
      'modal-pipe-calculator': 'pipe-calc',
      'modal-floor-calculator': 'floor-calc',
      'modal-radiator-calculator': 'radiator-calc',
      'modal-boiler-calculator': 'boiler-calc',
      'modal-leak-calculator': 'leak-calc',
      'modal-balancing-calculator': 'balancing-calc',
      'modal-pump-calculator': 'pump-calc',
      'modal-expansion-tank-calculator': 'tank-calc',
      'modal-hydraulic-separator-calculator': 'separator-calc'
    };
    const modalEntry = openModalIds.map(id => catalog.find(entry => entry.id === modalMap[id])).find(Boolean);
    if (modalEntry) return modalEntry;
    const screenEntry = catalog.find(entry => entry.id === screen);
    return screenEntry || catalog.find(entry => entry.id === 'common') || null;
  }

  async _callBackupProvider(provider, userText, key, history = true) {
    const previousKey = this.backupApiKey;
    const previousProvider = this.backupProvider;
    this.backupApiKey = key;
    this.backupProvider = provider;
    try {
      return provider === 'google'
        ? await this._callGeminiAPI(userText, { key, history })
        : provider === 'groq'
          ? await this._callGroqAPI(userText, { history })
          : await this._callOpenAIAPI(userText, { history });
    } finally {
      this.backupApiKey = previousKey;
      this.backupProvider = previousProvider;
    }
  }

  async _callGeminiAPI(userText, options = {}) {
    const MODEL = 'gemini-3.8-flash';
    const key = options.key || this.apiKey;
    const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    // Формируем системный промпт с учетом контекста активного объекта мастера (v2.4.1)
    const activePrompt = this._buildHelpPrompt();


    // Формируем контекст: системный промпт + история + новый вопрос
    const contents = [];

    // Системный промпт как первое user-сообщение (Gemini v1beta формат)
    contents.push({
      role: 'user',
      parts: [{ text: activePrompt }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Понял! Я LIGA AI — инженерный консьерж системы LIGA OS. Готов помогать.' }]
    });

    // История диалога (последние 6 обменов, чтобы не раздувать контекст)
    const recentHistory = options.history === false ? [] : this.chatHistory.slice(0, -1).slice(-4);
    contents.push(...recentHistory);

    const body = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.9,
      },
    };

    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
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
