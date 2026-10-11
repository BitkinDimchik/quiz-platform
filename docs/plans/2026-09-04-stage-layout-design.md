# Stage Layout Editor Design Spec

## Summary

Создатель квиза в соло-просмотре включает режим «Редактировать сцену»: пауза таймера, drag/resize и стили (шрифт, жирность, цвет, прозрачность фона) всех объектов текущего кадра — текст вопроса, медиа, таймер, пояснение, meta, каждый вариант, плитки matching, подсказка/правильные тексты. Раскладка хранится в `questions.meta.stageLayout` и применяется на экране хоста в соло и live. Телефоны игроков не меняются.

## Context

Продукт: NestJS + PostgreSQL + TypeORM + Socket.IO, React SPA в `web/`.

Сцена хоста — фиксированный flex-шаблон в `#stageCard` → `.stage-center` (`web/src/pages/HostPage.tsx`). Картинку вопроса режет CSS `max-height: min(260px, 30vh)` (`web/src/styles/host.css`); визуальные ответы — CSS grid. Полей позиции/шрифта на вопросе нет.

Соло: `/host?solo=1&quizId=` загружает `GET /api/quizzes/:quizId`, фазовая машина `web/src/lib/host/solo.ts`. `soloBuildQuestionView` ставит синтетический id `solo_r{i}_q{j}` — для PATCH его мало. `getQuizBuilderPayload` не отдаёт `question.id`.

Live: хост рисует из WS `question_view` (`src/quiz/question-view.service.ts`). `includeCorrect` у хоста всегда true.

Сохранение билдера (`web/src/lib/builder/save-quiz.ts`) создаёт новую draft-ревизию и POST вопросов заново — `stageLayout` должен ехать в `meta`, иначе пропадает.

**Type:** feature. **Complexity:** Complex.

## Design

### Architecture

```
Solo edit mode (pause + handles + inspector)
  → PATCH /api/quizzes/questions/:questionId/stage-layout
  → questions.meta.stageLayout   (jsonb merge, no migration)
        ├── GET /api/quizzes/:id          (builder + solo: id + stageLayout)
        ├── POST /api/quizzes/questions   (save-quiz copies meta.stageLayout)
        ├── question_view includeStageLayout (host role only; never player)
        └── PreviewHostPage               (apply prompt/media/timer/meta/answers/textHint)
```

Нет layout / пустой объект → сцена 1:1 как сегодня. Редактор только в соло на фазах вопроса. Live и preview-host только применяют.

### Components

| Component | Responsibility | File Path |
|---|---|---|
| Parse/validate (server) | Clamp/strip `StageLayout` | `src/quiz/stage-layout.ts` |
| PATCH DTO | `{ stageLayout: object \| null }` | `src/admin/dto/update-stage-layout.dto.ts` |
| Admin merge | Own check + merge `meta.stageLayout` | `src/admin/services/admin.service.ts` |
| Editor route | `PATCH questions/:questionId/stage-layout` **before** `:quizId` | `src/quiz-editor/quiz-editor.controller.ts` |
| Builder GET | `id` + `stageLayout` на вопросе | `src/admin/services/admin.service.ts` `getQuizBuilderPayload` |
| QuestionView | `stageLayout?: StageLayout` если `includeStageLayout` (default false) | `src/quiz/question-view.service.ts`, `web/src/lib/host/types.ts` |
| Client types | Shared TS shapes | `web/src/lib/host/stage-layout.ts` |
| Apply | `%` → CSS; class `--custom-layout` | `web/src/lib/host/stage-layout.ts` `applyStageLayout` |
| Keys | `data-stage-key` on slots | `web/src/lib/host/stage-render.ts` |
| Solo ids | Real question `id` + layout | `web/src/lib/host/solo.ts`, `types.ts` |
| Edit gestures | Drag/resize snap 8px, select | `web/src/lib/host/stage-layout-edit.ts` |
| Host chrome | Edit/Save/Cancel/Reset + inspector | `web/src/pages/HostPage.tsx` |
| CSS | Absolute boxes, handles, inspector | `web/src/styles/host.css` |
| Preview | Apply only | `web/src/pages/PreviewHostPage.tsx` |
| Builder draft | `id?`, `stageLayout?` round-trip | `web/src/lib/builder/types.ts`, `server-payload.ts`, `save-quiz.ts`, `defaults.ts` |
| API docs | PATCH + `question_view` field | `docs/API.md` |
| Vitest | parse/apply/solo/builder | `web/src/lib/host/stage-layout.test.ts` и существующие `*.test.ts` |
| E2E | PATCH 403/merge; host vs player view | `test/quiz-game.e2e-spec.ts` |

### Data Model

No new columns. `questions.meta` jsonb already exists.

```ts
export type StageBox = {
  x: number; // % of .stage-center content box, 0–100
  y: number;
  w: number; // min 4 after clamp
  h: number; // min 4 after clamp
  fontSize?: number; // px, 10–96
  fontWeight?: 400 | 700;
  color?: string; // #rrggbb lowercase
  bg?: string; // #rrggbb lowercase
  bgOpacity?: number; // 0–1
};

export type StageLayout = {
  v: 1;
  prompt?: StageBox;
  media?: StageBox;
  timer?: StageBox;
  meta?: StageBox;
  explanation?: StageBox;
  textHint?: StageBox;
  answers?: Record<string, StageBox>; // optionId
  matchLeft?: Record<string, StageBox>; // match item id
  matchRight?: Record<string, StageBox>;
  correctTexts?: Record<string, StageBox>; // "0", "1", …
};
```

Parse lives in **two identical copies** (no shared package): `src/quiz/stage-layout.ts` and `web/src/lib/host/stage-layout.ts`. Same function names and clamp math. Vitest and a Nest unit/e2e cover the same fixtures.

Parse rules (`parseStageLayout(raw)`):

- `null` / `undefined` / non-object / `v !== 1` → `null`.
- Unknown top-level keys dropped.
- Box missing `x,y,w,h` as finite numbers → drop that box.
- Clamp: `x = clamp(x, 0, 96)`, `y = clamp(y, 0, 96)`, then `w = clamp(w, 4, 100-x)`, `h = clamp(h, 4, 100-y)`.
- `fontSize` finite → clamp 10–96, else omit.
- `fontWeight` only 400 or 700, else omit.
- `color`/`bg` must match `/^#[0-9a-fA-F]{6}$/` → store lowercase; else omit.
- `bgOpacity` finite → clamp 0–1, else omit.
- Record maps (`answers`, `matchLeft`, `matchRight`, `correctTexts`): keys matching `/^[A-Za-z0-9_-]{1,80}$/` (UUIDs and `"0"` ok; **no colon** in JSON keys). Invalid inner boxes omitted.
- Empty maps omitted.
- If after stripping there is no box and no non-empty map → return **`null`** (bare `{ v: 1 }` is not a layout). `hasStageBoxes(layout)` is true iff parse is non-null.

JSON ↔ DOM (colon **only** in `data-stage-key`, never in jsonb keys):

| `data-stage-key` | `StageLayout` path |
|---|---|
| `prompt` | `layout.prompt` |
| `media` | `layout.media` |
| `timer` | `.timer-circle` inside the same `.stage-center` → `layout.timer` |
| `explanation` | `layout.explanation` |
| `meta` | `layout.meta` |
| `textHint` | `layout.textHint` |
| `answer:{optionId}` | `layout.answers[optionId]` |
| `matchL:{id}` | `layout.matchLeft[id]` |
| `matchR:{id}` | `layout.matchRight[id]` |
| `correct:{index}` | `layout.correctTexts[String(index)]` |

Lookup helpers `stageKeyToPath` / `boxForKey(layout, key)` in the client module.

Identity: choice answers keyed by **option UUID**; matching by ids stored in `meta.match` (those ids survive save-quiz). Missing JSON key → that DOM node keeps template CSS. Deleted ids ignored.

**Builder republish remap:** `save-quiz.ts` POSTs new options (new UUIDs). After each option POST, build `idMap[oldClientId] = newOptionId`. `remapStageLayoutOptionIds(layout, idMap)` rewrites `answers` keys; drop keys not in `idMap`. Then put remapped layout into `qmeta.stageLayout`. Matching layout keys stay as `row.id` copied into `meta.match`. `correct` array on the question is remapped the same way as today (new option ids in `correct-option` POST).

Builder draft (`BuilderQuestion`):

```ts
id?: string; // server uuid after GET; optional for unsaved local drafts
stageLayout?: StageLayout | null;
```

`SoloQuestion` same two fields. `soloBuildQuestionView`: `id` = `q.id` if it looks like UUID, else keep synthetic `solo_r{i}_q{j}`. Always copy `stageLayout`.

### Interfaces / API Surface

**`PATCH /api/quizzes/questions/:questionId/stage-layout`**

- Guard: `JwtAuthGuard`. Register this route **before** `@Patch(':quizId')`.
- `:questionId` `ParseUUIDPipe`.
- `assertQuestionOwned(questionId, userId)`.
- Body:

`stageLayout` is **required**. `null` = reset. Non-null must be a plain object; then `parseStageLayout`:

```ts
export class UpdateStageLayoutDto {
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  stageLayout!: Record<string, unknown> | null;
}
```

Missing property → 400 class-validator. `stageLayout: null` → delete key, `{ ok: true, stageLayout: null }`. Non-null object that parses to `null` (bad `v`, no boxes, empty prompt `{}`) → 400 DomainError.validation `'invalid stageLayout'`. No retry on PATCH; one request, toast, keep local working copy.

Error body: existing `{ error: { code, message } }` (`VALIDATION` 400, `FORBIDDEN` 403, `NOT_FOUND` 404, `UNAUTHORIZED` 401).

Response: `{ ok: true, stageLayout: StageLayout | null }`.

Merge: `meta = { ...q.meta }`; if parsed is `null`, `delete meta.stageLayout`; else `meta.stageLayout = parsed`; `questions.save`. Other meta keys untouched.

**`GET /api/quizzes/:quizId`** each question:

```json
{ "id": "<uuid>", "text": "...", "stageLayout": { "v": 1, "...": "..." } }
```

`stageLayout` omitted when absent (not `null`). `id` always present.

**`POST /api/quizzes/questions`**: existing `meta` object. Client puts `stageLayout` inside `meta`. No DTO change beyond current `@IsObject() meta?`.

**WS `question_view`**: `getQuestionView(..., { includeCorrect, includeStageLayout })`. `includeStageLayout === true` only when `client.data.role === 'host'` (`game.gateway.ts` `question_view` and host `round_summary_view`). Players **never** get `stageLayout`, including reveal (`includeCorrect` true is unrelated). Omit the key when false or when parse is null.

PATCH writes `meta` on that **question row**. Solo/GET use latest revision questions. Live `question_view` reads `session.quizRevisionId`. If the session was started on the published revision and that row was PATCHed, the next host `question_view` sees it. After `save-quiz` republish, question ids change — solo must use the new GET ids; an in-flight live session still reads the old revision (old layout on old rows). No live-reload of layout mid-question.

### Data Flow

**Edit + save (solo)**

1. Show `#btnSoloEditLayout` only in `{ question_read, question, answer_reveal }` (and `round_summary` when a question is on stage). Hide on `round_intro` / `leaderboard` / `finished`. `#btnSoloSkip` disabled while editing. No skip+confirm path.
2. Click «Редактировать сцену»:
   - If not paused: pause (same as `#btnSoloPause`), `pausedByLayoutEdit = true`.
   - Snapshot `savedLayout = parse(current)`.
   - `working = materializeStageLayout(.stage-center, savedLayout)`: for each **visible** `[data-stage-key]`, if that path has no box, fill `%` from `getBoundingClientRect` vs `.stage-center`. Paths not in the DOM **keep** snapshot boxes (e.g. `answers` while `question_read` has no cards). Style fields on existing boxes unchanged.
   - `applyStageLayout(stageCenter, working)` — absolute only for keys that have boxes.
   - `dirty = false` after materialize. Dirty becomes true only on pointer drag/resize or inspector input.
   - Handles + inspector. Save button enabled iff dirty (Reset always available if any saved layout exists).
3. Drag: `x,y`. Resize handles (8): `w,h`. Snap 8px in screen space, then convert to `%`, then `parse` clamp. Inspector writes `fontSize` / `fontWeight` / `color` / `bg` / `bgOpacity` on the selected key only.
   - `prompt`, `meta`, `textHint`, `explanation` text, answer/match captions: apply font/color/bg.
   - `media`: box geometry + `bg`/`bgOpacity` on the wrapper; inner img/video `object-fit: contain; width/height 100%; max-height: none`. Font fields ignored.
   - `timer`: geometry scales the circle; `color` tints `.timer-circle__text`; fontSize ignored; `bg` on the wrapper.
4. «Сохранить» (requires dirty): if `question.id` is not UUID → toast «Сначала сохраните квиз в конструкторе», stay in edit. Else PATCH working layout. 2xx: write into `solo.payload…stageLayout`, `dirty=false`, exit edit, resume timer iff `pausedByLayoutEdit`. Error: toast `error.message`, stay in edit. No automatic retry.
5. «Отмена»: if dirty, `window.confirm('Сбросить несохранённые изменения раскладки?')`; if cancel the dialog, stay. Restore snapshot, re-run `renderStageQuestion` + apply snapshot (or clear), exit edit, resume iff `pausedByLayoutEdit`.
6. «Сбросить»: `window.confirm('Сбросить раскладку этого вопроса к шаблону?')`, PATCH `{ stageLayout: null }`, clear local, re-render template, exit edit, resume timer iff `pausedByLayoutEdit`.

**Playback apply (solo + live + preview)**

`applyStageLayout(stageCenter: HTMLElement, layout: StageLayout | null)` — timer is `.timer-circle` **inside** `#stageCard > .stage-center` (do not query leaderboard). Call from **both** HostPage paths after timer display is set: solo `soloSyncUi` and live `syncStage`. Run apply **even if** `renderStageQuestion` was skipped by a render-key cache. Layout source: live `q.stageLayout`; solo `soloBuildQuestionView().stageLayout` (working copy while editing).

Containing block: `getBoundingClientRect()` of `.stage-center` and of each child (border boxes). **Before** the first absolute apply in a paint, if `.stage-center` has no `data-stage-lock-size`, store current `width`/`height` px as `min-width`/`min-height` and set the attr so the flex column does not collapse when children leave flow. `clearAppliedLayout` removes the lock and min sizes. `%` is relative to that locked padding+border box. `overflow: hidden` on `.stage-center--custom-layout` is **not** used (objects may sit near edges). `position: relative` on `.stage-center`.

While a layout is applied, only keys with boxes are `position:absolute`; siblings without boxes stay in flex flow.

1. `renderStageQuestion` always writes `data-stage-key` on slots it creates/updates. `#stageCard .timer-circle` gets `data-stage-key="timer"` in HostPage markup.
2. If `hasStageBoxes(layout)`: lock size, add `stage-center--custom-layout`, apply boxes. Else: `clearAppliedLayout`.
3. PreviewHostPage v1 apply: prompt, media, timer, meta, textHint, choice answers only. Matching / explanation / correctTexts keys are no-op if nodes are absent. No editor.

**Builder save**

`save-quiz.ts` copies remapped `stageLayout` onto `qmeta.stageLayout` when parse is non-null. `applyServerPayload` reads `id` + `stageLayout`. `defaultQuestion()` omits or nulls it.

LocalStorage (`STORAGE_KEY`): field round-trips. After a successful solo PATCH, `patchStoredDraftStageLayout(questionId, layout)` updates the matching `BuilderQuestion.id` in the stored draft if present, so a later save-quiz from an open builder tab does not republish without the layout. If the client omits `stageLayout` on POST meta, the new question simply has none (no server-side merge across revisions — remap+draft patch is the contract).

`getQuestionView(revisionId, questionId, { includeCorrect, includeStageLayout?: boolean })` — `includeStageLayout` defaults **false**. Set true only in `game.gateway.ts` `question_view` and `round_summary_view` when `client.data.role === 'host'`. Other call sites stay default.

**Handles:** selected box gets 8 handles `data-resize="nw|n|ne|e|se|s|sw|w"`. Pointer on handle resizes that edge/corner (`n` changes `y`+`h`, `e` changes `w`, etc.). Pointer on the box (not handle) moves `x,y`. Click on a `[data-stage-key]` selects it (initial selection: `prompt` if present else first keyed node). Click on empty `.stage-center` deselects. Inspector hidden when none selected.

### Apply CSS contract

`applyStageLayout` for each key that has a box:

```
position: absolute
left: x%; top: y%; width: w%; height: h%
box-sizing: border-box
z-index: 2 (selected in edit: 20)
font-size / font-weight / color if set and the slot uses text
background: rgba from bg + bgOpacity (default opacity 1 if bg set). If bgOpacity set without bg, do not invent a fill — leave theme background.
data-stage-applied=1
```

Images/video inside applied `media` / answer / match tiles: `max-height: none; width: 100%; height: 100%; object-fit: contain`.

`.stage-center--custom-layout { position: relative; }` plus descendant overrides that disable `max-height: min(260px, 30vh)` **only for elements whose ancestor box is applied** (still: the class is added only when `hasStageBoxes`). Timer SVG scales with the box.

`data-stage-key` values:

| Key | Element |
|---|---|
| `prompt` | `#stageQuestion` |
| `media` | `#stageMedia` |
| `timer` | `.timer-circle` |
| `explanation` | `#stageExplanation` |
| `meta` | `#stageMeta` |
| `textHint` | `.stage-text-answer-hint` |
| `answer:{optionId}` | each `.answer.stage-answer` |
| `matchL:{id}` | matching left tiles |
| `matchR:{id}` | matching right tiles |
| `correct:{index}` | `.stage-correct-texts-item` (0-based) |

Choice cards currently have no option id on the DOM — `renderStageQuestion` must set `data-stage-key` and `data-option-id`. Matching tiles same with left/right ids.

### Edit chrome (solo)

Buttons in `#soloControls` (game menu), visible only when `soloControlsVisible` and phase is a question phase:

- `#btnSoloEditLayout` «Редактировать сцену»
- While editing: `#btnSoloLayoutSave` «Сохранить», `#btnSoloLayoutCancel` «Отмена», `#btnSoloLayoutReset` «Сбросить»

Inspector: floating panel `host-layout-inspector` (bottom of `#stageCard`, not covering the whole stage). Selected object: range font 10–96, toggle bold, `input type=color` for text and bg, range opacity 0–1. Lucide icons (`Move`, `Type`, `Bold`). All four button states (default/hover/active/disabled). Minimum 40px height on buttons.

Handles: 8 `.host-layout-handle` 8×8px on selected box; body `user-select: none` while dragging.

### Error Handling

| Case | Behavior |
|---|---|
| PATCH 401 | existing `apiFetch` clears session; toast message |
| PATCH 403/404 | toast `error.message`; stay in edit |
| Invalid body | 400 `VALIDATION` |
| Unowned question | 403 `FORBIDDEN` |
| No UUID on solo question | toast «Сначала сохраните квиз в конструкторе»; no request |
| Dirty cancel / skip while edit | confirm; skip stays disabled until exit |
| PATCH network fail | toast; keep local working layout |
| Malformed stored JSON | `parseStageLayout` → null → template CSS, no throw |

### Testing Strategy

**Vitest (`npm --prefix web test`)**

| Case | Input | Output |
|---|---|---|
| parse happy | `{ v:1, prompt:{ x:10,y:10,w:80,h:20 } }` | same, numbers clamped |
| parse overflow | `x:90,w:20` | `w` shrinks so `x+w<=100` |
| parse bad v | `{ v:2, prompt:{...} }` | `null` |
| parse junk box | `prompt: { x:'a' }` | layout without prompt |
| parse color | `color:'#FF00AA'` | `#ff00aa` |
| parse bad color | `color:'red'` | color omitted |
| apply | jsdom stage + prompt box | `style.left === '10%'` |
| apply missing key | layout without prompt | `clearAppliedLayout` on prompt (no leftover left) |
| apply `{v:1}` parse | bare object | `null`; no `--custom-layout` |
| clamp x=97 w=20 | — | `x=96, w=4` |
| materialize | mock rects | fills missing **visible** keys; hidden `answers` from snapshot kept |
| remap option ids | answers.a → uuid | `answers[uuid]`, `a` dropped |
| matching keys | matchL/matchR | apply left/right tiles |
| soloBuildQuestionView | `q.id` uuid + stageLayout | view.id uuid, view.stageLayout parsed |
| solo synthetic | no `q.id` | `solo_r0_q0` |
| applyServerPayload | GET with id+stageLayout | `BuilderQuestion.id` + `stageLayout` |
| applyServerPayload | no stageLayout | omitted/null, no throw |
| save-quiz qmeta | layout + option POST map | remapped `meta.stageLayout.answers` |
| defaultQuestion | — | no layout or null |

**E2E (`npm run test:e2e`)**

Reuse `editorAuth()` quiz create from explanation tests.

| Case | Steps | Expect |
|---|---|---|
| PATCH unauth | no JWT | 401 |
| PATCH other user | token B, question of A | 403 |
| PATCH merge | set layout, GET builder | `questions[0].id` uuid, `stageLayout.prompt.x === 10`; musicUrl in meta still there if set |
| PATCH null | after save, PATCH null, GET | `stageLayout` absent |
| invalid layout | `{ v:1, prompt:{} }` | 400 `invalid stageLayout` |
| host question_view | seed meta.stageLayout, start, host `question_view` | `question.stageLayout.v === 1` |
| player leak | same, player `question_view` before **and after** `host_reveal_answer` | no `stageLayout` key |

### Migration Path

No SQL migration. Old quizzes: missing key → unchanged UI. Rollback: stop sending/applying `stageLayout`; leftover jsonb is ignored.

Clone quiz copies `meta` as today → layout copied. TXT import does not set layout.

## Open Questions

None for v1. Deferred: second question image, quiz/round default layout, builder canvas editor, player phones, freeform extra objects, live-host edit.

## Decision Log

| Decision | Options Considered | Chosen | Rationale |
|---|---|---|---|
| Where layout shows | solo only; host solo+live; host+player | Host solo + live | TV/projector is the designed slide; player already hides question media |
| Editor surface | always-on drag; builder-only; solo edit mode | Solo «Редактировать сцену» + pause | Does not fight the timer; full stage WYSIWYG |
| Object grain | answers block; each answer; block+each | Each answer (and each matching tile) | Auto grid fails for visual answers |
| Question types | choice only; +text; all | All including matching | User requirement |
| Second image | 2 images; 1; N | 1 image in v1 | Defer schema for extra media |
| Inheritance | per-question; quiz default; round default | Per-question only | Simpler v1, no cascade conflicts |
| Storage | new columns; `meta.stageLayout` | jsonb `meta.stageLayout` | No migration; same as music/match |
| Coordinates | px; % of stage | % of `.stage-center` | Survives resize of host window |
| Player payload | always; includeCorrect; host-only flag | `includeStageLayout` only `role==='host'` | Layout is for the TV; player never receives the key, including reveal |
| Save API | full save-quiz republish; PATCH meta | PATCH in place | Fast from solo; builder still copies on full save |
