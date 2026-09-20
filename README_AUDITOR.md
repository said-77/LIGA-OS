# LIGA OS v2.0.8 — АУДИТОРСКИЙ ВЕРИФИКАЦИОННЫЙ ПАКЕТ

Добро пожаловать в официальный верификационный пакет операционной системы LIGA OS (версия 2.0.8).

## 📁 Структура архива

```text
.
├── MANIFEST.json                          # Манифест файлов с ролями, размерами и SHA256
├── SHA256SUMS.txt                         # Контрольные суммы всех файлов пакета
├── README_AUDITOR.md                      # Эта краткая инструкция
├── AUDITOR_LETTER_AND_VERIFICATION_RU.md  # Официальное письмо аудитору и сводная матрица тестов
├── HANDOFF_AND_SPEC_RU.md                 # Каноническая спецификация системы и этапы
├── DECISION_JOURNAL.md                    # Единый журнал архитектурных решений (001-023)
├── AGENTS.md                              # Регламент инженерных стандартов и защиты от симуляции
├── README.md                              # Базовое описание проекта
├── ENGINEERING_HISTORY_10YEARS_RU.md      # Описание 10-летней истории и узлов оборудования
├── PLAN_OFFICIAL_ACT_16BAR.md             # Спецификация акта 16 бар
├── PLAN_VOICE_ASSISTANT_WORLD_CLASS_RU.md # Спецификация потокового голосового ввода и Keep-Alive
├── app/                                   # Полное рабочее PWA веб-приложение
│   ├── index.html                         # Главная разметка и экраны приложения
│   ├── manifest.json                      # PWA манифест
│   ├── sw.js                              # Service Worker автономного офлайн-кэширования
│   ├── favicon.ico
│   ├── css/
│   │   └── style.css                      # Стили Dark Titanium и Ceramic Glassmorphism
│   ├── js/
│   │   ├── app.js                         # Бизнес-логика, навигация, UI, хроника
│   │   ├── db.js                          # Локальная база IndexedDB v3 и сидирование
│   │   └── pdf_engine.js                  # Печать А4 паспорта и акта 16 бар
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── tests/                                 # 18 файлов сквозных E2E автотестов (23 теста Playwright)
│   ├── test_dashboard_timeline_and_demo.py
│   ├── test_master_real_lifecycle_simulation.py
│   ├── test_contacts_and_navigation.py
│   ├── ...
└── evidence/                              # Неопровержимые доказательства работы
    ├── RAW_TEST_EXECUTION_LOG.txt         # Фактический сырой лог запуска pytest (23/23 PASSED)
    └── screenshots/                       # 12 реальных скриншотов верификации интерфейса
```

## 🚀 Быстрый запуск за 60 секунд

### 1. Запуск приложения в браузере
Перейдите в папку `app/` (или корень) и запустите локальный сервер:
```bash
python -m http.server 8080 --directory app
```
Откройте браузер по адресу: `http://localhost:8080`.
Вы сразу увидите объект **«ЖК Infinity, Блок C, кв. 142»** с 3D-хронометром, опрессовкой 16.0 бар, карточкой «Следующий шаг» и блоком «📜 Хроника объекта (Пройденные вехи)» на дашборде!

### 2. Запуск сквозных тестов
```bash
python -m pytest tests/ -v --durations=0
```
Результат: **23 passed** (100% прохождение всех тестов).
