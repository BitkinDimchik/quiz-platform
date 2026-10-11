# Answer Explanation Design Spec

## Summary

Добавить у вопроса опциональное пояснение к правильному ответу: текст и/или картинка. На экране ведущего блок появляется одновременно с верным ответом, сразу под круговым таймером (сначала текст, затем фото). Игрок пояснение не видит. Видео в пояснении — вне v1.

## Context

Продукт: NestJS + PostgreSQL + TypeORM + Socket.IO, React SPA в `web/`.

У `questions` уже есть `image_url` / `audio_url` / `video_url` — это медиа **самого вопроса**, на хосте над таймером (`#stageMedia`). У вариантов есть свои `image_url`. Поля «почему это верно» нет.

Показ верного ответа: `renderStageQuestion(..., showCorrect=true)` в `web/src/lib/host/stage-render.ts`. Хост вызывает это в фазах `answer_reveal`, `round_replay`, `round_summary` (`web/src/pages/HostPage.tsx`). Секреты (`correctOptionIds`, `correctTexts`) в `QuestionView` только при `includeCorrect` (`src/quiz/question-view.service.ts`). Хост получает `includeCorrect` всегда; игрок — только в reveal/replay/summary (`src/websocket/game.gateway.ts`).

Картинки в конструкторе — data URL через `fileToDataUrl` (`web/src/lib/builder/defaults.ts`). Отдельного `POST upload/image` нет. Видео/аудио вопроса грузятся на диск (`src/quiz-editor/quiz-editor.controller.ts`).

**Type:** feature. **Complexity:** Medium.

## Design

### Architecture

```
Builder (текст + файл→data URL)
  → POST /api/quizzes/questions { explanationText, explanationImageUrl }
  → questions.explanation_text / explanation_image_url
  → WS question_view (поля только при includeCorrect)
  → Host: #stageExplanation под .timer-circle, только если showCorrect
  → Player UI: не рендерит
```

Пояснение не смешивается с медиа вопроса. `#stageMedia` не трогаем.

### Components

| Component | Responsibility | File Path |
|---|---|---|
| Migration | Nullable columns on `questions` | `src/migrations/1746200000000-QuestionAnswerExplanation.ts` + register in `src/migrations/all-migrations.ts` |
| Entity | Map new columns | `src/entities/question.entity.ts` |
| Create DTO | Optional validated fields | `src/admin/dto/create-question.dto.ts` |
| Admin create/load | Persist and round-trip into builder payload | `src/admin/services/admin.service.ts` |
| QuestionView | Expose fields when `includeCorrect` | `src/quiz/question-view.service.ts` |
| Builder types/defaults/save | Draft field + POST body + load | `web/src/lib/builder/types.ts`, `defaults.ts`, `save-quiz.ts`, `server-payload.ts` |
| Builder UI | Card «Пояснение к ответу» | `web/src/pages/BuilderPage.tsx` |
| Host types + DOM | `QuestionView` fields + `#stageExplanation` | `web/src/lib/host/types.ts`, `web/src/pages/HostPage.tsx` |
| Stage render | Fill/clear explanation on `showCorrect` | `web/src/lib/host/stage-render.ts` |
| Host CSS | Layout under timer | `web/src/styles/host.css` |
| Seed / e2e | Optional explanation on seed; WS/HTTP cases | `test/helpers/seed-published-quiz.ts`, `test/quiz-game.e2e-spec.ts` |
| Vitest | Default empty explanation; save payload | `web/src/lib/builder/defaults.test.ts` (+ payload test if a dedicated file is added) |

`quiz.service.saveQuestion` already accepts `Partial<Question>` — no new method.

### Data Model

Table `questions`, two nullable columns (same `text` type as existing media URLs):

```sql
ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "explanation_text" text,
  ADD COLUMN IF NOT EXISTS "explanation_image_url" text;
```

Entity (`src/entities/question.entity.ts`):

```ts
@Column({ name: 'explanation_text', type: 'text', nullable: true })
explanationText!: string | null;

@Column({ name: 'explanation_image_url', type: 'text', nullable: true })
explanationImageUrl!: string | null;
```

Empty string after trim → stored as `null`. Both null = no explanation.

Builder draft (`web/src/lib/builder/types.ts`):

```ts
explanation: { text: string; image: string | null };
```

`defaultQuestion()` / `defaultMatchingQuestion()`: `{ text: '', image: null }`. TXT import does not set it → stays empty.

Not in `question.meta`. First-class columns, same pattern as `image_url` / `video_url`.

### Interfaces / API Surface

**HTTP `POST /api/quizzes/questions`** — extend `CreateQuestionDto`:

```ts
@IsOptional()
@IsString()
@MaxLength(10_000)
explanationText?: string | null;

@IsOptional()
@IsString()
@MaxLength(2_000_000)
explanationImageUrl?: string | null;
```

Text cap 10_000 (пояснение, не промпт). Image cap same as `imageUrl` (data URL).

`AdminService.createQuestion` trims; blank → `null`. Load-for-builder maps:

```ts
explanation: {
  text: question.explanationText ?? '',
  image: question.explanationImageUrl,
}
```

`saveQuizToServer` **always** sends both keys (`string | null`), never omits them:

```ts
explanationText: (q.explanation?.text || '').trim() || null,
explanationImageUrl: (q.explanation?.image || '').trim() || null,
```

`applyServerPayload` in `web/src/lib/builder/server-payload.ts` reads `q.explanation` (or top-level `explanationText`/`explanationImageUrl` if the GET shape is flat) into `BuilderQuestion.explanation`. Default `{ text: '', image: null }` if missing (old quizzes).

No new REST/WS events. Existing `question_view` payload grows.

**`QuestionView`** (`src/quiz/question-view.service.ts` + `web/src/lib/host/types.ts`):

```ts
explanationText?: string | null;
explanationImageUrl?: string | null;
```

Contract (no “omit or null” fork):

| Caller | Keys |
|---|---|
| `includeCorrect === true` | Always both keys. Each is `string` if non-empty after trim, else `null`. |
| `includeCorrect === false` | Both keys **absent** (same as `correctOptionIds`). |

Host always has `includeCorrect` so host `question_view` always includes the two keys. Host **must not paint** them until `showCorrect`. Player during `question` / `question_read` must not receive the keys.

Player types may ignore the fields. Do not add player DOM.

**`StageDom`** (`web/src/lib/host/stage-render.ts`):

```ts
stageExplanation: HTMLElement | null;
```

HostPage: `getStageDom()` supplies `#stageExplanation`.

### Data Flow

1. Author opens question in builder. Card «Пояснение к ответу (экран ведущего)» under existing «Медиа»: textarea + `input type=file accept=image/*` → `fileToDataUrl` → `q.explanation.image`. Clear button. Hint: «Покажется под таймером, когда выйдет правильный ответ».
2. `saveQuizToServer` posts `explanationText` / `explanationImageUrl` next to `imageUrl`/`videoUrl`.
3. Host (live or solo) enters `answer_reveal` | `round_replay` | `round_summary` → `renderStageQuestion(dom, ctrl, q, true)`.
4. If `showCorrect` and (trimmed text or image URL): show `#stageExplanation` (display block). Order inside: text (`div.host-stage__explanation-text`), then `img.host-stage__explanation-img`. Escape text via existing `escapeHtml`.
5. If `!showCorrect` or both empty or `q === null`: clear innerHTML, `display: none`.
6. Player screens unchanged.

Layout on host `stage-center` (existing order, new node marked):

```
#stageQuestion
#stageMedia          ← медиа вопроса (не трогать)
.timer-circle
#stageExplanation    ← NEW, immediately under timer
#stageMeta
#stageAnswers
```

## Error Handling

| Failure | Behavior |
|---|---|
| Both fields empty / whitespace | No block. Valid question. |
| DTO over max length | Existing class-validator → 400. |
| Broken image data URL / 404 | `<img>` still inserted (same as question/option images). No extra onerror flow in v1. |
| `stageExplanation` ref missing | `renderStageQuestion` no-ops explanation (do not throw). Still render answers. |
| Player payload contains fields on reveal | Ignore. No player UI. |
| Dispute overlay during `answer_reveal` | Explanation stays. Phase still `showCorrect`. |
| `end_of_round` (no per-question reveal) | Explanation first appears in `round_replay` / `round_summary` when `showCorrect` is true. |

No new upload endpoint. No retry. Validation errors use existing `DomainHttpExceptionFilter`.

## Testing Strategy

Project scripts: `npm run test:e2e` (Nest), `npm --prefix web test` (vitest). TDD: tests first. `web/` already has `jsdom` + vitest.

**Vitest — defaults / payload**

| Case | Input | Expected |
|---|---|---|
| default question | `defaultQuestion()` | `explanation: { text: '', image: null }` |
| matching default | `defaultMatchingQuestion()` | same empty explanation |
| applyServerPayload | GET-shaped question `{ explanation: { text: 'why', image: 'data:image/png;base64,xx' } }` | `q.explanation.text === 'why'`, image set |
| applyServerPayload missing | old question without explanation | `{ text: '', image: null }` |

Extract a testable mapper from `save-quiz.ts` if the POST body is hard to intercept (e.g. `questionCreateBody(q)`). Then:

| Case | Input | Expected |
|---|---|---|
| save body filled | text `"  why  "`, image data URL | `{ explanationText: 'why', explanationImageUrl: '<url>' }` |
| save body empty | `text: '  '`, `image: null` | `{ explanationText: null, explanationImageUrl: null }` — keys always present |

**Vitest — `renderStageQuestion` (jsdom, required)**

File: `web/src/lib/host/stage-render.explanation.test.ts`. Fixture: `document` nodes for `StageDom` including `#stageExplanation`; stub `StageMediaController` (no-op bgm, lastQuestion getters/setters).

| Case | Input | Expected |
|---|---|---|
| hidden before reveal | `showCorrect=false`, text+image set | `#stageExplanation` empty, `display` none / not visible |
| show both | `showCorrect=true`, text `"Потому что"`, image `"data:image/gif;base64,R0lGODlhAQABAAAAACw="` | first child text node/div contains `Потому что`; following `img[src=...]`; display not none |
| order | both present | `explanation-text` then `img` (text element `previousElementSibling` of img is null or is the text node; img is after text) |
| text only | image null | text present, no `img` |
| image only | text `''` | one `img`, no text div (or empty text omitted) |
| escape | text `'<img onerror=alert(1)>'` | `innerHTML` has no raw `<img`; contains `&lt;img` (or textContent equals the raw string and childElementCount for html tags is 0) |
| clear | then `q=null` or empty explanation | innerHTML empty, hidden |
| missing ref | `stageExplanation: null` | does not throw; answers still render |

**E2E (`test/quiz-game.e2e-spec.ts`)**

Extend `seedPublishedQuiz(ds, { explanationText?, explanationImageUrl? })` to set the new columns on question 0.

Reuse existing flow from `submit_answer` / `host_reveal_answer` tests: `POST /api/session/start` → host WS `session_ready` → `host_start_game` → player join → `emitAck(socket, 'question_view', {})`.

| Case | Steps | Expected |
|---|---|---|
| player leak | seed with `explanationText: 'secret proof'`, start, `host_start_game` (phase `question` or `question_read`), player `question_view` | `question.explanationText` and `question.explanationImageUrl` are `undefined` |
| host has fields | same session, host `question_view` before reveal | both keys present; `explanationText === 'secret proof'` |
| player after reveal | `host_reveal_answer`, player `question_view` | both keys present (`includeCorrect` true); no player UI assertion |
| editor persist | `POST /api/auth/register` → `POST /api/quizzes` → `POST /api/quizzes/revisions/draft` → `POST /api/quizzes/rounds` → `POST /api/quizzes/questions` with both fields → `GET /api/quizzes/:id` | returned question explanation matches trimmed input |
| editor empty | same chain, omit or send null | stored/returned nulls |
| validation | same auth, `explanationText` of length 10_001 | HTTP 400 |

## Migration Path

1. Add migration `1746200000000-QuestionAnswerExplanation` (`IF NOT EXISTS`, down drops both columns).
2. Append class to `ALL_MIGRATIONS` in `src/migrations/all-migrations.ts` so `getExpectedLastMigrationName()` updates.
3. Existing rows: both columns null → no UI change.
4. Rollback: revert migration; old clients ignore unknown JSON keys.

Run `npm run migration:run` on e2e DB before `npm run test:e2e` as today.

## Out of scope (v1)

- Video (or audio) in the explanation block.
- Player / phone UI.
- Per-option explanations.
- Dedicated image upload endpoint (keep data URL).
- TXT import of explanations.
- Extra timer time when explanation is present.

## Decision Log

| Decision | Options Considered | Chosen | Rationale |
|---|---|---|---|
| Attachment | Per question, per option, both | Per question | User: one block when the correct answer appears, not per variant. |
| Screens | Host+player, host only, player only | Host only | User choice. Player already hides question media; explanation is for the stage/audience. |
| Media types | Text+image+video vs text+image | Text and/or image | User deferred video. Question already has `videoUrl` above the timer. |
| Placement | Under timer vs in `#stageMedia` vs in answers | New `#stageExplanation` under `.timer-circle` | User: under the timer. Must not mix with question media. |
| Text/image order | Text then image vs image then text | Text then image | User. Empty part omitted. |
| When to show | `answer_reveal` only vs any `showCorrect` | Any `showCorrect` (`answer_reveal`, `round_replay`, `round_summary`) | User: when the correct answer appears. Matches existing `renderStageQuestion(..., true)` call sites. |
| Storage | `question.meta` vs columns | Columns `explanation_text`, `explanation_image_url` | Same pattern as question media URLs; not a one-off meta flag. |
| Secret gate | Always in view vs `includeCorrect` | `includeCorrect` | Avoid leaking the proof photo to players before reveal. Host still only paints on `showCorrect`. |
| Image ingest | New upload vs data URL | Data URL via `fileToDataUrl` | Matches question and option images in the builder. |
