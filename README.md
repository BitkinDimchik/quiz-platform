# Quiz platform (NestJS + SQLite + Socket.IO)

Локальная квиз-платформа: один процесс, файл базы, без PostgreSQL и без сервера в интернете.

## Запуск на любом ПК

Двойной щелчок по **`Quiz.exe`** (Windows). Если Node.js нет или стоит 24-я версия, exe сам скачает Node 22 в `runtime\node` и запустит игру. Postgres, Docker, VPS не нужны. Папку `node_modules` лучше не копировать.

Либо **`start-prod.bat`**, если Node.js 20/22 LTS уже установлен: https://nodejs.org.

1. Скопируйте папку проекта (вместе с `Quiz.exe`).
2. Если есть квизы со **старого** запуска на PostgreSQL — заранее выгрузите их кнопкой **Экспорт** (ZIP). После перехода на SQLite старая Postgres-база не подключается.
3. Двойной щелчок по **`Quiz.exe`** или **`start-prod.bat`**. Откроется http://localhost:3000

Первый запуск сам создаёт `data/quiz.sqlite` и папки `public/uploads/...`. Квизы и медиа лежат в этой папке — копируйте её целиком, чтобы перенести игру на другой ПК. Отдельный квиз — **Экспорт / Импорт** ZIP.

Телефоны игроков: та же Wi‑Fi, что у хост-ПК. На экране ведущего QR / адрес LAN (`GET /ip`).

Разработка (Vite :5173 + API :3000): **`start-dev.bat`** или `npm run start:dev`.

Перед каждым `npm start` / `start:dev` / `start:prod` скрипт сам проверяет `better-sqlite3` и при смене версии Node пересобирает нативные модули (актуально для Node 24/26).

## UI (React)

Фронтенд — Vite + React SPA в `web/`.

- Dev: UI на **http://localhost:5173**
- Prod: Nest отдаёт `web/dist` и `/uploads` с порта **3000**

## Документация API

- **[docs/API.md](docs/API.md)** — HTTP/WS, формат ошибок, контракт **automatic mode / таймер**.
- **[docs/openapi.yaml](docs/openapi.yaml)** — OpenAPI для REST-эндпоинтов.

## Переменные

См. **`.env.example`**. Если `.env` нет, стартовые `.bat` копируют пример.

База: **`DATABASE_PATH`** (по умолчанию `data/quiz.sqlite`). Схема создаётся при старте.

Тесты: `npm test` (unit), `npm run test:e2e` (SQLite в памяти, Postgres не нужен).
