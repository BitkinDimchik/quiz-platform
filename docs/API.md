# API: HTTP, WebSocket и контракты

## Формат ошибок

### HTTP

Тело ответа:

```json
{
  "error": {
    "code": "NOT_FOUND | CONFLICT | VALIDATION | UNAUTHORIZED | FORBIDDEN | ILLEGAL_STATE | INTERNAL | HTTP",
    "message": "человекочитаемое описание",
    "details": "опционально (например массив сообщений валидации)"
  }
}
```

Коды HTTP: `NOT_FOUND` → 404, `CONFLICT` / `ILLEGAL_STATE` → 409, `VALIDATION` → 400, `UNAUTHORIZED` → 401, `FORBIDDEN` → 403.

### WebSocket (`/game`)

Успешный ack — обычно объект с полем `ok` или данными ответа.

Ошибки приходят в **ack-колбэке** первым аргументом (`Error`) или как объект от Nest (в зависимости от клиента). Структурированные ошибки домена: `{ code, message }` (как `WsException`).

Валидация тела событий `submit_answer` и `place_stake`:

```json
{
  "code": "VALIDATION",
  "message": "…",
  "details": [{ "property": "questionId", "constraints": { … } }]
}
```

## Режим **automatic** и таймер вопроса

1. При переходе к вопросу с `advanceMode === automatic` сервер выставляет **`phaseDeadlineAt`** (конец окна ответа).
2. После наступления **`phaseDeadlineAt`**:
   - **Отправка ответа (`submit_answer`) запрещена** (ошибка: истёк таймер вопроса).
   - **Фаза сессии остаётся `question`** — сервер **не** выполняет автоматический переход в `answer_reveal` или другую фазу.
3. Дальнейший ход игры — только действия хоста (**`host_reveal_answer`** и последующие события), как в ручном режиме после «таймаута у игроков».

Таким образом, после истечения таймера клиент однозначно видит по флагу фазы и `phaseDeadlineAt` в `session_update` / `session_ready`, что окно ответа закрыто, но хост должен явно открыть показ ответа.

## HTTP

См. `openapi.yaml`: `/health`, `/internal/quiz`, `/api/session/start`, `/api/session/join`. Аутентификация: заголовки **`X-Api-Key`** (см. `.env.example`).

## Наблюдаемость

### Логирование (Pino)

- HTTP: JSON-логи через **nestjs-pino** / **pino-http**; в каждой записи при активном CLS есть **`requestId`** (или из заголовка **`X-Request-Id`**, иначе генерируется).
- В ключевых местах дополнительно логируются **`sessionId`**, **`playerId`**, **`role`**, **`socketId`**, **`event`** — по ним можно отфильтровать одну игровую сессию (например `sessionId="<uuid>"` в Loki/ELK).
- Уровень: переменная **`LOG_LEVEL`** (по умолчанию `info`). В non-production подключается **pino-pretty**.

### Метрики (Prometheus)

- **`GET /metrics`** — текст в формате Prometheus (без API-key; ограничьте доступ на уровне сети / ServiceMonitor только для мониторинга).
- Счётчики (префикс `quiz_`):
  - **`quiz_ws_connect_total{role}`** / **`quiz_ws_disconnect_total{role}`**
  - **`quiz_ws_handshake_fail_total{reason}`**
  - **`quiz_submit_answer_total{result}`** — `ok` | `error`
  - **`quiz_host_command_total{event,result}`** — события `host_*`, результат `ok` | `error`
- Плюс стандартные **`quiz_node_*`** (process) от `collectDefaultMetrics`.

## WebSocket

- Подключение: `io('/game', { auth: { sessionId, hostSecret | reconnectToken } })`.
- После connect: событие **`session_ready`**.
- Хост: `host_start_game`, `host_reveal_answer`, `host_proceed_after_reveal`, `host_continue_leaderboard` (без секретов в теле).
- Игрок: `submit_answer`, `place_stake` — тела валидируются (UUID, типы полей).
- Общие: `leaderboard`.

### Раскладка сцены хоста

`PATCH /api/quizzes/questions/:questionId/stage-layout` (JWT владельца квиза). Тело `{ "stageLayout": object | null }`. `null` сбрасывает `questions.meta.stageLayout`. Объект парсится как `{ v: 1, prompt?, media?, timer?, meta?, explanationLabel?, explanation?, explanationImage?, textHint?, answers?, matchLeft?, matchRight?, correctTexts? }` с боксами `{ x, y, w, h, fontSize?, fontWeight?, color?, bg?, bgOpacity?, strokeColor?, strokeWidth?, align?, valign? }` в % от `.stage-center`. `explanationLabel` — надпись «Пояснение», `explanation` — текст, `explanationImage` — картинка. `align` — `left|center|right`, `valign` — `top|middle|bottom`; без полей текст в окне по центру. Битая раскладка → 400 `invalid stageLayout`. Чужой вопрос → 403.

`GET /api/quizzes/:quizId` отдаёт у вопроса `id` и `stageLayout` (если есть).

### Пакет квиза (экспорт / импорт)

`GET /api/quizzes/:quizId/export` (JWT владельца) — ZIP `*.quizpack.zip` с `quiz.json` (`format: quizzes-pack`, `version: 1`) и файлами в `media/`. Data URL и `/uploads/audio|video|image/...` упаковываются; внешние `https://` остаются как есть.

`POST /api/quizzes/import` (JWT, multipart `file` = ZIP) — создаёт **новый** квиз у текущего пользователя. Медиа копируются в `/uploads/{audio,video,image}/` с новыми UUID. Path traversal в ZIP → 400.

WS `question_view`: поле `stageLayout` только если `role === 'host'` (`includeStageLayout`). Игрок ключ не получает, в том числе после reveal.

### Ставки (betting)

Два режима (взаимоисключающие на вопросе):

| Режим | Где включается | Когда ставит игрок | `place_stake` |
|-------|----------------|-------------------|---------------|
| **Раунд** | `round.bettingEnabled` | фаза `round_intro` | `{ roundId, stake }` |
| **Вопрос** | `question.meta.bettingEnabled` (если у раунда betting выкл.) | фаза `question_read` | `{ questionId, stake }` |

- В `question_view`: `bettingScope` (`round` \| `question` \| null), `bettingMaxFraction`, `playerScore`, `playerStake` (null = ещё не поставил).
- Ставка влияет на очки за ответ: +stake при правильном, −stake при полностью неверном (matching: 0 совпадений).

### Гонки хост-команд

Мутации `GameSession` сохраняются с **retry** при коллизии оптимистичной блокировки (`VersionColumn`). После исчерпания попыток возвращается **`CONFLICT`** / `conflict: concurrent session update`.
