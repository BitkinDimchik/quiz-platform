# React UI Migration Design Spec

## Summary

Replace the vanilla multi-page UI under `public/` with a TypeScript React SPA in `web/` (Vite), served by Nest in production and proxied in development. All current screens ship in v1 with visual and behavioral parity. REST, WebSocket, and upload contracts stay unchanged (copy `host.js` / `player.js` / `builder.js` event names and payloads). Clean routes become canonical; `*.html` URLs **302** redirect and preserve query strings.

## Context

Today the product is NestJS + PostgreSQL + Socket.IO (`quiz-platform`). The browser UI is not a bundled app: HTML pages and IIFEs in `public/` are served by `ServeStaticModule` from `src/app.module.ts` (`rootPath: join(__dirname, '..', 'public')`, `exclude: ['/api*', '/metrics*', '/socket.io*']`). Tailwind source lives in `src/ui/tailwind.css` with `tailwind.config.cjs` / `postcss.config.cjs` (`plugins: [require('flowbite/plugin')]` but **flowbite is not in `package.json`** — do not copy that plugin into `web/` unless the package is added). Compiled CSS is `/assets/app.css` plus `host.css`, `builder.css`, `quizzes.css`, `stage-theme.css`. Shared helpers (`QuizUI`) live in `public/assets/app.js`. Host/player use `io('/game', { transports: ['websocket'], auth })`. Uploads write to `public/uploads/{audio,video}` (`src/quiz-editor/quiz-editor.controller.ts`). Host QR on localhost calls **`GET /ip`** (`src/quiz/quiz.controller.ts`), which is **not** under `/api`. `GET /health` is the same controller. E2E (`npm run test:e2e`) covers HTTP/WS APIs, not the HTML UI. Source of truth for game UI: `public/assets/host.js` (~2.6k lines), `public/assets/player.js` (~1.7k), `public/assets/builder.js` (~2.1k). No overlapping design in `docs/plans/`.

**Type:** migration (frontend only). **Complexity:** Complex.

## Design

### Architecture

```
Browser (dev :5173 Vite, host: true for LAN QR)
  ├── /api /metrics /uploads /socket.io /ip /health  --proxy--> Nest :3000
  └── React Router SPA

Browser (prod :PORT Nest)
  ├── GET /api* /metrics /socket.io /uploads /health /ip  → Nest handlers
  ├── GET *.html                                         → 302 clean route
  ├── GET hashed assets                                  → web/dist
  └── other GET text/html                                → web/dist/index.html

Disk: public/uploads (never Vite outDir)
```

**Dev:** `npm run start:dev` = `concurrently` Nest (`nest start --watch`) + `npm --prefix web run dev`. Vite `server.port: 5173`, `server.host: true` (QR phones must reach Vite). `start-dev.bat` opens `http://localhost:5173`. First clone / CI: `npm install` then `npm --prefix web install`.

**Prod:** `npm run build` = `npm --prefix web run build && nest build`. Nest serves `web/dist`. Same origin for UI + API.

**Vite `web/vite.config.ts`:** `react-router` **`BrowserRouter`**. Same 7-row 302 map as Nest via `configureServer` plugin: `GET` `*.html` → canonical path + search (so `:5173/player.html?code=` works).

```ts
server: {
  port: 5173,
  host: true,
  proxy: {
    '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    '/metrics': { target: 'http://127.0.0.1:3000' },
    '/uploads': { target: 'http://127.0.0.1:3000' },
    '/ip': { target: 'http://127.0.0.1:3000' },
    '/health': { target: 'http://127.0.0.1:3000' },
    '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
  },
},
build: { outDir: 'dist', emptyOutDir: true },
```

**Nest static (two `ServeStaticModule.forRoot` entries), replace today’s single `public/` root.** Paths use `join(process.cwd(), …)` so they work for both `nest start` and `node dist/main` (cwd = repo root).

```ts
{
  rootPath: join(process.cwd(), 'public', 'uploads'),
  serveRoot: '/uploads',
  serveStaticOptions: { index: false, fallthrough: true },
},
{
  rootPath: join(process.cwd(), 'web', 'dist'),
  exclude: ['/api*', '/metrics*', '/socket.io*', '/uploads*', '/health', '/ip'],
  serveStaticOptions: { index: false, fallthrough: true },
}
```

`index: false` so ServeStatic does not steal `GET /` from SPA fallback.

**HTTP middleware — one recipe only.** Do **not** use `NestMiddleware.forRoutes('*')` (runs before ServeStatic and would steal files). In `src/main.ts` after `NestFactory.create`, **before** `configureApp(app)`:

`app.use(htmlRedirect)` — 302 `*.html`, else `next()`.

After `configureApp(app)`, **before** `app.listen`:

`app.use(spaFallback)` — last. Prefix-exclude `/api`, `/metrics`, `/socket.io`, `/uploads`, `/health`, `/ip`. Last path segment has no `.` (so `/uploads/audio/x.mp3` never becomes SPA; missing upload → 404). `GET` + `Accept` HTML → `web/dist/index.html`. Missing file → 503 JSON `{ error: { code: 'INTERNAL', message: 'web/dist missing — run npm run build' } }`.

Verify with e2e, not by reading Nest internals.

**`start:prod`** stays `node dist/main` (does **not** build). `start-prod.bat` already runs `npm run build` first; CI must too. `npm run build` = Vite then Nest.

**Not in v1:** Next.js, npm workspaces, API/WS protocol changes, visual redesign, `place_stake` UI (gateway has it; **player.js does not emit it** — do not add a new stake screen). `host_reveal_answer` / `host_start_next_quiz` exist on `GameGateway` but **current host.js does not emit them**; do not add host buttons for unused events.

CI / first clone: `npm install` at root **and** `npm --prefix web install`. No `postinstall` hook (avoid surprise nested installs).

**Deps (`web/package.json`):** `react@18`, `react-dom@18`, `react-router-dom@6`, `vite@6`, `typescript` (align with root 5.7), `tailwindcss@3` + `postcss` + `autoprefixer`, `socket.io-client@4`, `qrcode`. Root: add `concurrently`. Drop `flowbite/plugin` from the copied Tailwind config.

### Components

| Component | Responsibility | File Path | Depends on |
|---|---|---|---|
| Vite shell | Entry, router, CSS import | `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx` | routes |
| Routes | Canonical paths | `web/src/routes.tsx` | pages |
| `apiFetch` / `withAuth` | HTTP; **JWT only if caller passes `withAuth()`** | `web/src/lib/api.ts` | — |
| Auth keys + `ensureSession` | JWT profile | `web/src/lib/auth.ts` | api |
| `connectGameSocket` | `io('/game')` | `web/src/lib/game-socket.ts` | socket.io-client |
| `sanitizeNext` | login redirect | `web/src/lib/next-url.ts` | — |
| `htmlPathToCanonical` | redirect map (shared Nest + tests) | `web/src/lib/html-redirects.ts` **and** duplicate table in Nest middleware (or a tiny JSON both import — Nest cannot import `web/` TS easily: **duplicate the 7-row map** in `src/ui/html-redirect.middleware.ts`) | — |
| Toast | `#toast` 3500ms | `web/src/components/Toast.tsx` | — |
| Topbar | nav + login/menu; `#topbarAuthMount` | `web/src/components/Topbar.tsx` | auth |
| Round background | `applyViewportRoundBg` / `clearViewportRoundBg` | `web/src/lib/stage/round-bg.ts` | `#viewportRoundBg` |
| Stage media | video/audio/img + Google Drive `uc?export=download` + iframe fallback | `web/src/lib/stage/media.ts` | host.js helpers |
| Answer grids | single/multi/true_false | `web/src/lib/stage/answers.tsx` | — |
| Matching + text | `#matchBlock`, `#textAnswer` | `web/src/lib/stage/matching.tsx`, `text-answer.tsx` | — |
| Timer circle | SVG progress | `web/src/lib/stage/timer.tsx` | `formatMs` / `remainingMs` |
| Landing | `/` | `web/src/pages/LandingPage.tsx` | Topbar |
| Login | `/login` | `web/src/pages/LoginPage.tsx` | auth, sanitizeNext |
| Quizzes | `/quizzes` | `web/src/pages/QuizzesPage.tsx` | session HTTP |
| Builder | `/builder` | `web/src/pages/BuilderPage.tsx` | editor HTTP, preview |
| Preview host | `/preview-host` | `web/src/pages/PreviewHostPage.tsx` | postMessage, stage |
| Host | `/host` | `web/src/pages/HostPage.tsx` | WS host auth, QR, `/ip` |
| Player | `/player` | `web/src/pages/PlayerPage.tsx` | rewrite of `player.js` into TSX (**never** load `/assets/player.js` at runtime) |
| Redirects | `*.html` → clean | `src/ui/html-redirect.middleware.ts` | — |
| Dual static + fallback | SPA + uploads | `src/app.module.ts`, `src/ui/spa-fallback.middleware.ts` | — |

**Port map (JS is the logic source; HTML is markup/ids):**

| Legacy | React |
|---|---|
| `public/index.html` | `LandingPage` |
| `public/login.html` + `login.js` | `LoginPage` |
| `public/quizzes.html` + `quizzes.js` | `QuizzesPage` |
| `public/builder.html` + `builder.js` | `BuilderPage` |
| `public/host.html` + `host.js` | `HostPage` |
| `public/player.html` + **`public/assets/player.js`** | `PlayerPage` |
| `public/preview-host.html` + `preview-host.js` | `PreviewHostPage` |
| `public/assets/app.js` | `api.ts`, `auth.ts`, Toast, Topbar, `formatMs` |
| `public/vendor/qrcode.js` | npm `qrcode` |
| `public/vendor/socket.io.min.js` | `socket.io-client` |
| `src/ui/tailwind.css` + `public/assets/*.css` | `web/src/styles/` — **keep class names and the DOM ids listed below** |

Rewrite every IIFE into React/TSX. **Do not** `<script src>` or `eval` any `public/assets/*.js`. `player.js` / `host.js` / `builder.js` are the **behavior spec** to transcribe, not runtime dependencies. Shared stage modules are mandatory so Host, Player, and Preview do not triplicate Google Drive / media / timer logic.

**CSS pipeline (one):** Tailwind `web/src/styles/tailwind.css` copied from `src/ui/tailwind.css` (`content: ['./index.html','./src/**/*.{ts,tsx}']`, **no** flowbite plugin). Plus verbatim: `host.css`, `builder.css`, `quizzes.css`, `stage-theme.css`. **Player appendix:** copy `public/assets/app.css` from the comment `Player-specific styling` (~line 1153) to EOF into `web/src/styles/player.css` (includes `html.player-game-viewing`, `#gameCard.player-round-summary`, …). Do **not** copy the whole compiled `app.css` (would duplicate Tailwind). Preview: copy the `<style>` block from `public/preview-host.html` into `web/src/styles/preview-host.css`. Import in `main.tsx`: `tailwind.css`, `stage-theme.css`, `player.css`, `preview-host.css`; Host/Builder/Quizzes pages also import their sheet.

**`document.body.className` by route** (replace wholesale on navigation; then pages add viewing classes):

| Route | `document.body` classes |
|---|---|
| `/` | `landing` |
| `/login`, `/quizzes`, `/builder`, `/player` | `brand` |
| `/host` | `host brand` |
| `/preview-host` | `host brand host-quiz-viewing` |

Player adds `player-game-viewing` on `html`+`body` when `#gameCard` is in game view. Host adds `host-quiz-viewing` / `viewport-round-active` as today. Builder modal adds `preview-fullscreen`.

**Frozen ids — keep every `id` from current HTML** (React `id=`). Host (`host.html`): `viewportRoundBg`, `btnEndQuiz`, `btnHome`, `topbarAuthMount`, `timerCorner`, `quizCard`, `quizBg`, `quizMeta`, `wsStatus`, `quizTitle`, `quizSub`, `hostRoomClosedHint`, `btnRoomToggle`, `btnChooseQuiz`, `btnSoloPreview`, `sessionId`, `hostSecret`, `playersCount`, `qr`, `roomCode`, `playerUrl`, `btnStartGame`, `startHint`, `playersSub`, `players`, `stageCard`, `soloControls`, `btnSoloPause`, `btnSoloSkip`, `btnSoloExit`, `stageQuestion`, `stageMedia`, `btnHostVideoSound`, `timerCircleProgress`, `timerCircleText`, `stageMeta`, `stageAnswers`, `leaderboardCard`, `lbTitle`, `lbSub`, `lbTop3`, `lbList`, `btnStartNextQuiz`, `toast`. Player/login/quizzes/builder/preview: all existing ids in those HTML files (including `joinCard`, `gameCard`, `disputeOverlay`, `previewFrame`, `modal`, `grid`, `loginErr`, …). If an id exists in `public/*.html` today, it stays.

### Data Model

No DB/REST schema changes.

**`localStorage` (keep exact key strings):**

| Key | Writer | Meaning |
|---|---|---|
| `QUIZ_ACCESS_TOKEN` | login | JWT |
| `QUIZ_USER_ID` | login / `/api/auth/me` | user id |
| `QUIZ_USER_EMAIL` / `QUIZ_USER_DISPLAY` | login / me | profile |
| `QUIZ_INTERNAL_API_KEY` / `QUIZ_SESSION_API_KEY` | debug getters in `app.js` | optional `X-Api-Key`; **not** required for join |
| `PLAYER_SESSION_ID` | player join | session UUID |
| `PLAYER_RECONNECT_TOKEN` | player join | WS auth |
| `PLAYER_DISPLAY_NAME` | player join | name + avatar emoji |
| `PLAYER_ROOM_CODE` | player join | normalized room code |
| `LAST_QUIZ_ID` | quizzes / builder / host | last quiz |
| `LAST_SESSION_ID` / `LAST_HOST_SECRET` / `LAST_ROOM_CODE` | quizzes / host | resume host |
| `QUIZ_BUILDER_DRAFT_V1` | builder | `{ quizDraft, ui }` JSON |

**`apiFetch`:** same as `app.js`: does **not** attach JWT by default. Callers that need auth pass `headers: withAuth({ 'Content-Type': 'application/json' })`. Player `join` / `active` / `/ip` use `headers: {}` (no Bearer). 401 **only if** the request had `Authorization` → `clearSession` (host JWT), not player reconnect keys.

**Session phases** (`src/common/enums.ts` `SessionPhase`): `lobby`, `round_intro`, `question_read`, `question`, `answer_reveal`, `round_replay` (legacy), `round_summary`, `leaderboard`, `finished`.

**Question types** (`QuestionType`): `single_choice`, `multiple_choice`, `true_false`, `text_input`, `matching`. Player also treats `'multiple'` as multi-select (legacy alias in `player.js`) — keep that branch.

### Interfaces / API Surface

Full HTTP field lists for editor DTOs live in `src/quiz-editor/dto/` and `src/admin/dto/`. The SPA must call **exactly** these routes. JWT **only** where Notes say JWT. Public/player/session-active/`/ip`/`/health`/`GET .../players` = no Bearer.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok: true }` — no JWT |
| GET | `/ip` | `{ ips: string[] }` — no JWT |
| GET | `/metrics` | Prometheus |
| POST | `/api/auth/register` | email, password, displayName |
| POST | `/api/auth/login` | → `{ accessToken, user: { id, email, displayName } }` |
| GET | `/api/auth/me` | JWT; `{ userId, email, displayName }` |
| GET | `/api/quizzes` | JWT. `{ quizzes: Array<{ id, title, description, background, roundsCount, publishedRevisionId: string \| null }> }` |
| GET | `/api/quizzes/browse` | JWT. same item shape |
| GET | `/api/quizzes/:quizId` | JWT. Builder payload: `title`, `description`, `background` (not `coverImage`), `finalMusic`, `rounds[]` as `applyServerPayload` in `builder.js` |
| GET | `/api/quizzes/public/:quizId` | **no JWT**. `{ quizId, background, finalMusic }` |
| POST | `/api/quizzes` | JWT. body title/description/coverImage/finalMusic → `{ quizId }` |
| PATCH | `/api/quizzes/:quizId` | JWT. same fields → `{ ok: true }` |
| DELETE | `/api/quizzes/:quizId` | JWT. `{ ok: true }` |
| POST | `/api/quizzes/:quizId/clone` | JWT. `{ quizId }` |
| POST | `/api/quizzes/revisions/draft` | JWT. `{ quizId }` → `{ quizRevisionId, revisionNo }` |
| POST | `/api/quizzes/revisions/publish` | JWT. `{ quizRevisionId }` → `{ ok: true }` |
| POST | `/api/quizzes/rounds` | JWT. `{ quizRevisionId, position, title, answerRevealMode?, meta?: { description, introSec, summarySec, leaderboardSec, background, musicUrl, leaderboardMusicUrl } }` → `{ roundId }`. `title` required (`CreateRoundDto`). |
| POST | `/api/quizzes/questions` | JWT. `{ roundId, position, type, prompt, timeLimitSec, basePoints, imageUrl?, audioUrl?, videoUrl?, meta? }` → `{ questionId }`. Builder `mapBuilderTypeToApi`: `multiple`→`multiple_choice`, `text`→`text_input`, `matching`→`matching`, else `single_choice`. Draft field `text` → API `prompt`; draft `timer` → `timeLimitSec`. |
| POST | `/api/quizzes/options` | JWT. `{ questionId, ... }` → `{ optionId }` |
| POST | `/api/quizzes/correct-option` | JWT. → `{ answerId }` |
| POST | `/api/quizzes/correct-text` | JWT. → `{ answerId }` |
| POST | `/api/quizzes/upload/audio` | JWT. multipart `file` → `{ url: "/uploads/audio/..." }` |
| POST | `/api/quizzes/upload/video` | JWT. `{ url: "/uploads/video/..." }` |
| GET | `/api/session/active/:roomCode` | **no JWT**. `{ active: boolean, sessionId: string \| null, roomCode: string }` |
| POST | `/api/session/start` | `SessionStartAuthGuard`. Body `{ quizId: uuid, advanceMode?: 'automatic'\|'manual', answerRevealMode?: 'per_question'\|'end_of_round' }`. **Gallery always sends** `{ quizId, advanceMode: 'automatic', answerRevealMode: 'per_question' }` plus `withAuth()` when JWT present. Response **exactly** `{ sessionId, roomCode, hostSecret }`. Defaults if omitted: `manual`, `per_question`. |
| POST | `/api/session/join` | **no JWT**. `{ roomCode, displayName, avatarUrl: null }` → `{ sessionId, playerId, reconnectToken, roomCode }` |
| POST | `/api/session/:sessionId/run` | header **`X-Host-Secret` required** (401 without). Body `{ quizRevisionId: uuid }` → `{ ok: true, runNo, runId }` |
| GET | `/api/session/:sessionId/players` | **no JWT**. `{ players }` (`headers: {}` as host.js) |
| GET | `/api/session/:sessionId/host-summary` | header **`X-Host-Secret` required**. → `{ session }` public session |
| POST | `/api/session/:sessionId/reopen` | header **`X-Host-Secret` required**. → `{ session }` |

Error body: `{ error: { code, message, details? } }` as `docs/API.md`.

**WebSocket namespace `/game`** (`src/websocket/game.gateway.ts`):

Handshake `auth`:

```ts
// host (host.js)
{ sessionId: string, hostSecret: string }
// player (player.js)
{ sessionId: string, reconnectToken: string }
```

`transports: ['websocket']` only.

**Server → client events (must subscribe):**

| Event | Used by | Payload (as UI uses it) |
|---|---|---|
| `session_ready` | both | `{ session, role?, playerId? }` |
| `session_update` | both | public session object (`phase`, `roomCode`, `phaseDeadlineAt`, …) |
| `players_update` | host | `{ players }` |
| `dispute_update` | both | `{ kind?, dispute?: { status: 'open' \| … } }` |
| `session_abandoned` | both | `{ reason?: 'host_closed' \| 'host_left' \| string }` |
| `connect` / `disconnect` / `connect_error` | both | socket.io |

**Client → server (ack via `socket.timeout(ms).emit(event, body, cb)`):**

| Event | Timeout (current) | Body | Who |
|---|---|---|---|
| `host_start_game` | 8000 | `{}` | host |
| `host_kick_player` | 8000 | `{ playerId }` | host |
| `host_close_room` | 1500 | `{}` | host |
| `host_proceed_after_reveal` | 1500 | `{}` | host |
| `host_continue_round_summary` | 1500 | `{}` | host |
| `host_continue_leaderboard` | 1500 | `{}` | host |
| `question_view` | 8000 | `{}` | both |
| `leaderboard_view` | 8000 | `{ kind }` | both |
| `dispute_state` | host 5000, player 8000 | `{}` | both |
| `submit_answer` | 8000 | see DTO | player |
| `dispute_start` | 12000 | `{ questionId }` | player |
| `dispute_vote` | 10000 | `{ disputeId, approve }` | player |

`submit_answer` body (`SubmitAnswerWsDto`):

```ts
{
  questionId: string; // uuid
  selectedOptionIds?: string[];
  textAnswer?: string | null;
  matchOrder?: number[]; // matching: right-side 1..n for left rows
}
```

Ack success: `{ ok: true }` (and extra fields if server sends them). Fail: timeout Error or `{ code, message }`. Automatic mode: after `phaseDeadlineAt`, `submit_answer` is rejected; phase stays `question` until host proceeds — see `docs/API.md`.

**WS ack shapes (from `game.gateway.ts`):**

- `question_view` → `{ ok: true, question: QuestionView }` where `QuestionView` is `src/quiz/question-view.service.ts` (`id`, `type`, `prompt`, media URLs, `timeLimitSec`, `basePoints`, round fields, `options`, `match?`, `correctOptionIds?`, `correctTexts?`, `playerAnswer?` for players).
- `leaderboard_view` → `{ ok: true, kind, roundId, top3, rows }`.
- `session_update` payload = `toPublicSessionState(session)` (same as HTTP host-summary `session`).
- `players_update.players` = `toPublicPlayerState[]`.

**QR:** wrap npm `qrcode` in `web/src/lib/qr.ts`: `toDataURL(joinUrl)` → set `#qr` innerHTML to `<img alt="" src={dataUrl}>`. Do **not** call vendor `qrcode(0,'M').createImgTag`. Join URL `{publicOrigin}/player?code=`.

**Preview `postMessage` (required, not optional):**

```ts
{
  type: 'quiz_preview_host',
  quiz: quizDraft, // builder in-memory draft
  activeRoundIdx: number,
  activeQuestionIdx: number,
}
```

Builder sets `window.__lastPreviewPayload` and `iframe.contentWindow.postMessage(payload, '*')`. Preview listens: ignore if `data.type !== 'quiz_preview_host'`. Iframe `src` canonical: `/preview-host?v={Date.now()}` (replace `/preview-host.html`).

**Canonical UI routes + query (unchanged semantics):**

| Path | Query |
|---|---|
| `/` | — |
| `/login` | `next` |
| `/quizzes` | `continueSession=1`, `sessionId`, `soloHost=1` |
| `/builder` | `new=1`, `quizId` |
| `/host` | `solo=1`, `quizId`, `sessionId`, `hostSecret`, `roomCode` |
| `/player` | `code` |
| `/preview-host` | `v` |

**302 map (preserve search):** `/login.html`→`/login`, `/quizzes.html`→`/quizzes`, `/builder.html`→`/builder`, `/host.html`→`/host`, `/player.html`→`/player`, `/preview-host.html`→`/preview-host`, `/index.html`→`/`.

QR join URL: `{publicOrigin}/player?code={roomCode}`. `publicOrigin`: if hostname is `localhost`/`127.0.0.1`/`::1`, `GET /ip` → `protocol + '//' + ips[0] + (port?':'+port:'')` using **`location.port`** (dev 5173, prod Nest port); else `location.origin`.

**`next` sanitizer (security exception vs today’s `startsWith('/')` which allows `//evil`):** allow iff `next.startsWith('/')`, `!next.startsWith('//')`, `!next.includes('://')`, and `next[1] !== '\\'`. Else `/quizzes`.

**Root scripts:**

| Script | Command |
|---|---|
| `build` | `npm --prefix web run build && nest build` |
| `start:dev` | `concurrently "nest start --watch" "npm --prefix web run dev"` |
| `test:e2e` | unchanged |
| `test:web` | `npm --prefix web test` (vitest) |

### Data Flow

**1. Auth + start session**

1. `/quizzes` → `ensureSession` → `GET /api/auth/me` with `withAuth()`.
2. No token → Topbar «Вход» → `/login?next=/quizzes`.
3. Login stores JWT keys → `navigate(sanitizeNext(next))`.
4. Start → `POST /api/session/start` → set `LAST_*` → `/host?sessionId&hostSecret&roomCode&quizId`.
5. Host `connectGameSocket({ sessionId, hostSecret })` → `session_ready` / `players_update`.
6. QR uses `/ip` when local. Player `/player?code=` → `POST /api/session/join` (no JWT) → store `PLAYER_*` → `io` with `reconnectToken`.

**2. Question loop (parity with host.js / player.js)**

1. Host `host_start_game` `{}`.
2. Both on `session_update` with `phase`. Host/player `question_view` `{}` to fill stage (seq guard in player.js: increment `playerViewSeq`, ignore stale acks).
3. Player in `phase === 'question'` builds `submit_answer` payload by type; ack `ok` disables inputs.
4. Host after reveal: `host_proceed_after_reveal` / `host_continue_round_summary` / `host_continue_leaderboard` as today’s `syncStage` branches (copy the phase switch from `host.js`, do not invent a new state machine).
5. Disputes only when `phase === 'answer_reveal'`: `dispute_state` / `dispute_start` / `dispute_vote` / `dispute_update`.

**3. Builder save (copy `saveQuizToServer` order)**

1. `POST /api/quizzes` or `PATCH /api/quizzes/:id` with `withAuth()`.
2. `POST /api/quizzes/revisions/draft` `{ quizId }`.
3. Per round `POST /api/quizzes/rounds`; per question `POST /api/quizzes/questions`; options + `correct-option` / `correct-text`.
4. `POST /api/quizzes/revisions/publish` `{ quizRevisionId }`.
5. `LAST_QUIZ_ID`; navigate `/quizzes`.

**4. Preview**

1. Open modal → `body.preview-fullscreen` → iframe `/preview-host?v=`.
2. `postMessage` `quiz_preview_host` on each `renderPreview` and iframe `load`.

**5. Player reconnect**

1. If `PLAYER_SESSION_ID` + `PLAYER_RECONNECT_TOKEN` exist, show `#returnBlock`.
2. `GET /api/session/active/:roomCode`; if `sessionId` mismatch, do not silently join wrong room (same as `verifySavedRoomIsStillSameSession`).
3. «Вернуться» reconnects WS; `connect_error` retries &lt; 4 with `500 * attempt` ms; invalid/closed → `leaveLobby` and clear `PLAYER_*`.

**6. Register**

`POST /api/auth/register` `{ email, password, displayName }` (`displayName` empty → `null`). Password length &lt; 8 → client error «Пароль не короче 8 символов». Success: same token storage as login, toast «Аккаунт создан», `sanitizeNext`.

**7. Continue session (`/quizzes?continueSession=1&sessionId=`)**

Need published `quizRevisionId`. `POST /api/session/:sessionId/run` with `X-Host-Secret: LAST_HOST_SECRET` and `{ quizRevisionId }`. Missing secret → toast «Не найден ключ ведущего…». Then `/host?sessionId&hostSecret&roomCode&quizId`.

**8. Solo host (no GameSession, no WS)**

`/quizzes?soloHost=1` → play navigates `/host?solo=1&quizId=`. Host `startSoloFromQuizId`: `GET /api/quizzes/:id` (JWT), `solo.on = true`, hide lobby (`#quizCard` / QR / start), show `#soloControls`. Local timer: `soloAdvance` when `remainingMs(solo.phaseDeadlineAt) <= 0` and not paused.

| Current `solo.phase` | Next | Deadline |
|---|---|---|
| `round_intro` | `question_read` | `(q.readSec \|\| 3) * 1000` |
| `question_read` | `question` | `(q.timer \|\| 15) * 1000` |
| `question` | `answer_reveal` | 2500 ms |
| `answer_reveal` | next question `question_read` or `leaderboard` | next `readSec` or `(r.leaderboardSec \|\| 6) * 1000` |
| `leaderboard` | next round `round_intro` or `finished` | next `introSec` or none |
| `finished` | stay | `phaseDeadlineAt = null` |

`#btnSoloPause` toggles `solo.paused`; `#btnSoloSkip` forces `soloAdvance`; `#btnSoloExit` clears solo and restores lobby. `#btnSoloPreview` on live host → `/quizzes?soloHost=1`.

**9. Live host `session_update` / `syncStage` (WS, not solo)** — `hostStageSeq` increment; ignore stale `question_view` acks.

| `session.phase` | UI | Emit |
|---|---|---|
| `lobby` | show `#quizCard` / players / QR; hide stage | none |
| `round_intro`, `question_read`, `question`, `answer_reveal` | show `#stageCard`; toggle `host-stage--round-intro` on intro | `question_view` `{}` timeout 8000 |
| `round_summary` / `round_replay` | treat like summary (legacy alias) | `host_continue_round_summary` `{}` when auto-advance fires |
| `leaderboard` / `finished` | show `#leaderboardCard`; `#btnStartNextQuiz` only if `finished` | `leaderboard_view` `{ kind: finished ? 'final' : 'round' }` |
| auto `remainingMs<=0` | **not** on `question` (API.md) | `answer_reveal` → `host_proceed_after_reveal`; `round_summary`\|`round_replay` → `host_continue_round_summary`; `leaderboard` → `host_continue_leaderboard` |

`#btnStartNextQuiz` on `finished`: write `LAST_*`, `navigate('/quizzes?continueSession=1&sessionId=')`. **Do not** emit `host_start_next_quiz`.

BGM / Google Drive / `hostSkipDupStageMusic` / `questionMusicCarry`: transcribe from `host.js` `syncStage` (lines ~2060–2140); do not invent a shorter music policy.

**10. Clone / delete**

`POST /api/quizzes/:id/clone` → `{ quizId }` → `/builder?quizId=`. `DELETE /api/quizzes/:id` after confirm (same as quizzes.js).

## Error Handling

| Failure | Behavior |
|---|---|
| HTTP non-OK | toast / `#loginErr` from `error.message` |
| HTTP 401 + `Authorization` header | clear JWT keys only; remount Topbar |
| `connect_error` host | toast `err.message` |
| `connect_error` player | retry then waiting room or leave (see flow 5) |
| `session_abandoned` host | toast «Комната закрыта»; stay on host UI, clear lobby |
| `session_abandoned` player | toast host_left vs generic; back to join |
| `submit_answer` timeout | toast `submit_answer error/timeout` |
| Join validation | «Введите roomCode» / «Введите имя» |
| `/ip` fail | fall back `location.origin` |
| Missing `web/dist` | 503, log; not SPA HTML from old public |
| Proxy 502 (Nest down) | toast network |

No extra REST retries. Socket.io reconnection: player custom retry above; host uses library default plus explicit `connect_error` toast.

## Testing Strategy

Keep `npm run test:e2e` green (API/WS). Add Nest e2e rows below. `web/` Vitest (jsdom).

| Layer | Case | Input | Expected |
|---|---|---|---|
| unit | redirect | `/player.html` + `?code=ABCD5` | `/player?code=ABCD5` |
| unit | redirect | `/index.html` | `/` |
| unit | `sanitizeNext` | `/builder?quizId=1` | same |
| unit | `sanitizeNext` | `//evil.test` | `/quizzes` |
| unit | `sanitizeNext` | `https://evil.test/` | `/quizzes` |
| unit | `sanitizeNext` | `/\\evil` or `/\/evil` (backslash after first slash) | `/quizzes` |
| unit | QR | origin port 5173, ip `192.168.1.10`, code `ABCD5` | `http://192.168.1.10:5173/player?code=ABCD5` |
| unit | QR non-local | hostname `quiz.example` | `location.origin` + `/player?code=` |
| unit | `apiFetch` 401 with Authorization | stored JWT | JWT keys cleared; `PLAYER_*` untouched |
| unit | login success | `{ accessToken, user }` | JWT keys set |
| unit | submit payload matching | matchOrder ints | DTO shape |
| Nest e2e | `GET /player.html?code=X` | — | 302 `Location` contains `/player?code=X` |
| Nest e2e | `GET /host` Accept HTML | dist fixture | 200 HTML of SPA index |
| Nest e2e | `GET /api/auth/me` | — | JSON, not index.html |
| Nest e2e | `GET /ip` | — | `{ ips: [...] }`, not index.html |
| Nest e2e | `GET /health` | — | `{ ok: true }` |
| Nest e2e | `GET /uploads/audio/<fixture>` | file on disk | 200 file, not HTML |
| Nest e2e | `GET /metrics` | — | Prometheus text, not index.html |
| Nest e2e | missing `web/dist/index.html` | rename/hide dist in test | 503 JSON `web/dist missing` |
| Nest e2e | `GET .../host-summary` no header | — | 401 |
| Nest e2e | `GET .../host-summary` + `X-Host-Secret` | valid secret | 200 `{ session }` |
| vitest | `submit_answer` single | selected option | `{ questionId, selectedOptionIds: [id] }` |
| vitest | `submit_answer` multiple | ids[] | `{ questionId, selectedOptionIds }` |
| vitest | `submit_answer` text | trimmed string | `{ questionId, textAnswer }` |
| vitest | `submit_answer` matching | unique 1..n | `{ questionId, matchOrder }` |
| vitest | rounds POST | saveQuiz | body includes `title` |
| vitest | public quiz | fetch `/api/quizzes/public/:id` | no `Authorization` header |
| vitest | `#btnStartNextQuiz` | finished | `/quizzes?continueSession=1&sessionId=` |
| vitest | QR | join url | `#qr img[src^=data:]` |
| unit | Vite redirect (shared map) | `/player.html?code=X` | `/player?code=X` |
| unit | `player.css` | file | contains `player-game-viewing` |
| vitest | `question_view` ack | `{ ok, question: { prompt } }` | `#stageQuestion` text |
| vitest | preview listener | `{ type: 'quiz_preview_host', quiz, ... }` | stage updates; other `type` ignored |
| vitest | player reconnect keys | set four `PLAYER_*` | return block visible |

**Manual cutover gate (named):** landing; login + register; quizzes mine/browse/clone/delete; builder all question types + save + preview iframe; host lobby QR (localhost + `/ip`); player join `?code=`; return/reconnect; solo `/host?solo=1&quizId=`; automatic timer (no auto phase change after deadline); dispute overlay on `answer_reveal`; matching + text_input submit.

## Migration Path

1. Scaffold `web/`; Tailwind **without** flowbite plugin; proxy including `/ip` `/health`; concurrently. Nest still serves old `public/*.html`.
2. Shell: api/auth/toast/topbar/router placeholders.
3. Port Landing → Login (`sanitizeNext`) → Quizzes → Builder + PreviewHost (`postMessage`) → Host (`/ip`, QR, WS) → Player (`player.js` behavior).
4. Nest: dual static, 302 redirects, SPA fallback excludes `/ip` `/health`. Point `start-dev.bat` at `:5173`.
5. Delete `public/*.html`, `public/assets/*.js`, unused vendor JS. Keep `public/uploads`. Remove `tools/copy-flowbite.js` if unused.
6. Rollback: git revert Nest static/redirects + restore `public/` HTML. No DB down.
7. Re-run `/absolute-init` so `conventions.ui.framework` is `react`.

Dev until step 4: `:3000` = old UI, `:5173` = React. After step 4: `:3000` = SPA only if `web/dist` exists (`npm run build` or `start-prod.bat`). `start:prod` never builds.

## Open Questions

None. DTOs + current JS callers are listed in Interfaces; if a DTO field is optional and JS always sends it, send it.

## Decision Log

| Decision | Options Considered | Chosen | Rationale |
|---|---|---|---|
| Tooling | Vite SPA, Vite MPA, Next | Vite React 18 + RR 6 + Vite 6 SPA in `web/` | Future DX; Nest stays API/WS; no SSR need |
| v1 scope | All screens vs strangler | All screens, one production cutover | User asked full React move |
| URLs | Keep `.html`, clean only, clean+redirect | Clean + **302** `.html` | QR/bookmarks; 302 easier to change than 301 |
| Fidelity | Redesign vs parity | Parity CSS/ids/events; TS rewrite | Maintainability without a design project |
| Layout | `web/`, `src/client/`, workspaces | `web/` + nested package.json, `npm --prefix web` | User rejected workspaces |
| Prod host | Nest vs CDN | Nest serves `web/dist` + `/uploads` | One `PORT` as today |
| Uploads | Inside Vite dist vs `public/uploads` | `public/uploads` + `serveRoot: '/uploads'` | `emptyOutDir` must not wipe media |
| Old JS | Wrap IIFEs vs rewrite | Rewrite; extract stage libs | Goal of the migration |
| `next` | Keep `startsWith('/')` vs tighten | Tighten (no `//`, no `://`) | Open-redirect fix; documented parity exception |
| JWT on fetch | Auto-attach vs `withAuth` | **`withAuth` only** | Player join must stay unauthenticated |
| Tailwind | Copy root config vs new | New config in `web/`, **no flowbite plugin** | Current `require('flowbite/plugin')` would crash install |
| Unused WS | Implement gateway extras | Only events **host.js/player.js emit/listen** | YAGNI; `place_stake` / `host_reveal_answer` omitted |
| React version | 18 vs 19 | 18 | Matches “stable Vite SPA”; avoid 19 surprises |
| Preview protocol | Discover later | Required `quiz_preview_host` postMessage | Builder already sends it |
