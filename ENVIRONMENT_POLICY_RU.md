# Политика окружения и среды выполнения (ENVIRONMENT_POLICY_RU.md)

## 1. Операционная среда
- **ОС:** Windows (PowerShell 5.1 / 7).
- **Среда выполнения клиента:** Любой современный мобильный и десктопный браузер (Chrome, Safari iOS, Edge) с поддержкой HTML5, ES6+, IndexedDB, Service Worker и Canvas API.
- **Инструменты тестирования:** Python 3.13+, Pytest 9+, Playwright (Chromium Headless).

---

## 2. Локальное окружение тестов
- Для сквозного тестирования каждый тест поднимает изолированный встроенный сервер `http.server.HTTPServer` на выделенном локальном порту:
  - Порт 8091: `test_receipt_and_both_themes.py`
  - Порт 8092: `test_voice_guide_duplicate_e2e.py`
  - Порт 8093: `test_passport_honesty.py`
  - Порт 8094: `test_client_mode.py`
  - Порт 8095: `test_backup_restore.py`
  - Порт 8096: `test_honesty_network_and_audit.py`
  - Порт 8097: `test_offline_pwa.py`
  - Порт 8098: `verify_light_theme.py`
- Серверы работают в фоновых потоках-демонах и гарантированно останавливаются в фикстурах pytest (`server.shutdown()`).

---

## 3. Требования к кодировкам в Windows
- Все исходные файлы проекта (`.html`, `.css`, `.js`, `.json`, `.md`, `.py`) сохраняются **строго в UTF-8 без BOM**.
- В скриптах Python при выводе кириллицы в консоль Windows обязательно используется:
  ```python
  import sys
  if hasattr(sys.stdout, 'reconfigure'):
      sys.stdout.reconfigure(encoding='utf-8')
  ```
  во избежание ошибок `UnicodeEncodeError (cp1251)`.

---

## 4. Ограничения безопасности среды
- Запрещено устанавливать глобальные пакеты или менять переменные окружения ОС без явного согласия.
- Запрещено запускать фоновые серверы с постоянным прослушиванием внешних сетевых интерфейсов `0.0.0.0` (только `127.0.0.1`).
