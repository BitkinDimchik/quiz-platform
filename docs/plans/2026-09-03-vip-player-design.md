# VIP Player Design Spec

## Summary

В сессии ровно один VIP-игрок: первый успешный `POST /api/session/join`, либо переназначение хостом в lobby. VIP с телефона может стартовать квиз, play/pause видео вопроса на экране хоста и ставить квиз на паузу. Хост сохраняет те же действия. Пауза морозит таймер, auto-advance, `finishQuestionEarly` и команды смены фазы; ответы в `question` принимаются. Бонусов очков нет.

## Context

Продукт: NestJS + PostgreSQL + TypeORM + Socket.IO, React SPA в `web/`. Legacy `public/*.html` не в scope.

Сегодня:

- `SessionPlayer` (`src/entities/session-player.entity.ts`) — нет роли. Join только в `lobby` (`SessionService.joinPlayer`).
- `listLobbyPlayers` **не** фильтрует фазу: это connected (`isConnected=true`, `disconnectedAt IS NULL`, `joinedAt ASC`). Имя врёт; для auto-next VIP в любой фазе используем этот же запрос.
- Публичный игрок: `toPublicPlayerState` → `players_update`, `GET /api/session/:sessionId/players`, `session_ready.player`. Сейчас без второго аргумента VIP.
- Хост-команды — `WsHostGuard` + `runHostCommand` (`src/websocket/game.gateway.ts`). Паттерн кика: `host_kick_player` + `KickPlayerWsDto`.
- Старт: `host_start_game` → `GameFlowService.startGame`. Игроки не обязательны.
- `saveSessionWithRetry` — **private** у `GameFlowService` (`src/game-flow/game-flow.service.ts`). `SessionService` пишет через обычный `save`.
- Live-паузы нет. Solo (`web/src/lib/host/solo.ts` + `#btnSoloPause` в `host-game-menu`) паузит локально.
- Default `advanceMode` — `Manual`; `phaseDeadlineAt` часто `null`. Automatic тикает в `AutomaticAdvanceService`.
- Все ответили в `question` → `AnswerService.checkAllAnsweredAndFinish` → `GameFlowService.finishQuestionEarly` (меняет фазу **без** host-команды).
- Видео: `appendQuestionStageVideo` / `prepareMutedAutoplayVideo` в `web/src/lib/stage/media.ts` — **общее** solo+live. Host live ещё `pointerdown` autoplay в `HostPage.tsx`. `maybeStartHostQuestionMediaGate` play-poll. Игрок видео не рендерит. `PlayerQuestion` **без** `videoUrl`, хотя `question_view` поле отдаёт.
- Игрок **не** слушает `players_update`. Есть `session_ready.session` + `session_update`.
- Возврат в лобби игроков не удаляет. Kick/disconnect строку не удаляет.
- Хост-таймер в `HostPage` при `ms<=0` сам шлёт `host_proceed_after_reveal` / `host_continue_round_summary` / `host_continue_leaderboard`.

**Type:** feature. **Complexity:** Complex.

## Design

### Architecture

```
join / reconnect / kick / disconnect
  → SessionService.claimVipIfEmpty | promoteVipIfNeeded
  → game_sessions.vip_player_id
  → reload GameSession
  → emitSessionUpdate(reloaded)
  → emitPlayersUpdate(sessionId, players)  // внутри findSession → vipPlayerId

Host lobby crown → host_set_vip
VIP/Host start   → vip_start_game | host_start_game → flow.startGame (чистит pause)
VIP/Host pause   → *toggle_pause → GameFlowService.togglePause (saveSessionWithRetry)
VIP video        → vip_toggle_question_video → stage_video_control { action: 'toggle' }
                   live host: <video>.play()/pause()
Host video       → native <video controls> local, no WS
```

Игрок считает `isVip` так: `session.vipPlayerId === myPlayerId` (`session_ready` / `session_update`). Хост-список берёт `players[].isVip`.

### Components

| Component | Responsibility | File Path |
|---|---|---|
| Migration | columns + FK + index | `src/migrations/1746300000000-SessionVipAndPause.ts`, `src/migrations/all-migrations.ts` |
| GameSession | columns only, **no** `@ManyToOne` to SessionPlayer | `src/entities/game-session.entity.ts` |
| Public mappers | `isVip`; session vip/pause fields | `src/session/session-state.util.ts` |
| SessionService | claim VIP, promote on leave, `setVip`, `assertCurrentVip`; hook join/kick/disconnect/reconnect; lobby/reopen clear pause keep VIP | `src/session/session.service.ts` |
| SessionEventsService | `emitPlayersUpdate(sessionId, players)` only: `findSession` then map with `vipPlayerId`; `emitStageVideoControl` | `src/realtime/session-events.service.ts` |
| GameFlowService | `togglePause`; `startGame` clears pause; `finishQuestionEarly` no-op if paused; `revealAnswer` / `proceedAfterReveal` / `continueFromLeaderboard` / `continueAfterRoundSummary` throw if paused | `src/game-flow/game-flow.service.ts` |
| DisputeService | if `isPaused`, do not write `phaseDeadlineAt`; `dispute_start` rejected while paused | `src/dispute/dispute.service.ts` |
| AutomaticAdvanceService | `isPaused: false` in `where` | `src/game-flow/automatic-advance.service.ts` |
| Gateway | new events; pause-reject **only** `host_start_next_quiz` (SessionService, not flow); `session_ready` new mappers | `src/websocket/game.gateway.ts` + `src/websocket/dto/set-vip.ws.dto.ts` |
| WS VIP check | `@UseGuards(WsPlayerGuard)` then `sessions.assertCurrentVip(sid, playerId)` — **не** Nest-guard | `src/session/session.service.ts` + gateway |
| docs | WS + session fields | `docs/API.md` |
| Host types/socket | session/player fields; `stage_video_control` | `web/src/lib/host/types.ts`, `useHostSocket.ts` |
| Host UI | VIP badge + crown; `#btnHostPause` in game menu | `web/src/pages/HostPage.tsx`, `web/src/styles/host.css` |
| Live video | `renderStageQuestion(..., mediaMode: 'live' \| 'solo')`; live no autoplay/iframe-autoplay-fallback | `web/src/lib/stage/media.ts`, `web/src/lib/host/stage-render.ts`, `HostPage.tsx` call sites |
| Player | `PlayerQuestion.videoUrl`; `PlayerSession.vipPlayerId`, `isPaused`, `pausedRemainingMs`; contextual buttons | `web/src/lib/player/types.ts`, `usePlayerGame.ts`, `PlayerPage.tsx`, `player.css` |
| Player chrome helper | visibility of start/pause/video buttons | `web/src/lib/player/vip-chrome.ts` + `vip-chrome.test.ts` |
| E2E | cases below | `test/quiz-game.e2e-spec.ts` |
| Vitest media | live vs solo video flags | `web/src/lib/stage/media.test.ts` |

### Data Model

```sql
ALTER TABLE "game_sessions"
  ADD COLUMN IF NOT EXISTS "vip_player_id" uuid NULL,
  ADD COLUMN IF NOT EXISTS "is_paused" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "paused_remaining_ms" integer NULL;

CREATE INDEX IF NOT EXISTS "IDX_game_sessions_vip_player"
  ON "game_sessions" ("vip_player_id");

ALTER TABLE "game_sessions"
  ADD CONSTRAINT "FK_game_sessions_vip_player"
  FOREIGN KEY ("vip_player_id") REFERENCES "session_players"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
```

Entity: **только** `@Column` uuid + boolean + int. **Без** `@ManyToOne` на `SessionPlayer` (цикл с `session_players.session_id` → `game_sessions` CASCADE). Postgres FK допустим.

```ts
@Column({ name: 'vip_player_id', type: 'uuid', nullable: true })
vipPlayerId!: string | null;

@Column({ name: 'is_paused', type: 'boolean', default: false })
isPaused!: boolean;

@Column({ name: 'paused_remaining_ms', type: 'int', nullable: true })
pausedRemainingMs!: number | null;
```

Mappers:

```ts
function toPublicPlayerState(player: SessionPlayer, vipPlayerId: string | null) {
  return { /* existing */, isVip: vipPlayerId != null && player.id === vipPlayerId };
}

function toPublicSessionState(session: GameSession) {
  return {
    /* existing */,
    vipPlayerId: session.vipPlayerId,
    isPaused: session.isPaused,
    pausedRemainingMs: session.pausedRemainingMs,
  };
}
```

Все call sites `toPublicPlayerState` передают `vipPlayerId` (`session-events`, `game.gateway` `session_ready`, `session.controller` GET players).

**Единственная** сигнатура: `emitPlayersUpdate(sessionId: string, players: SessionPlayer[]): void`. Внутри `findSession`; `vipPlayerId` null если сессии нет. Никакого overload.

`returnSessionToLobby` / `startNextQuiz` / `reopenSession`: `isPaused=false`, `pausedRemainingMs=null`; **keep** `vipPlayerId`. `markSessionEnded`: не трогать VIP/pause (комната мертва; `emitPlayersUpdate(id, [])`).

### Interfaces / API Surface

#### HTTP

`GET /api/session/:sessionId/players` — `isVip` на каждом элементе.

Join/reconnect HTTP **без** `isVip`. Игрок: `session_ready.session.vipPlayerId`.

#### WS — новые

| Event | Guard | Body | Ack | When |
|---|---|---|---|---|
| `host_set_vip` | `WsHostGuard` | `{ playerId: uuid }` | `{ ok: true }` | `phase === lobby`; target `sessionId` match + `isConnected` |
| `vip_start_game` | `WsPlayerGuard` + `assertCurrentVip` | `{}` | `{ ok: true }` | same as `host_start_game` |
| `host_toggle_pause` | `WsHostGuard` | `{}` | `{ ok: true }` | `togglePause` |
| `vip_toggle_pause` | player + VIP | `{}` | `{ ok: true }` | same |
| `vip_toggle_question_video` | player + VIP | `{}` | `{ ok: true }` | current question `videoUrl` nonempty |

Room event: `stage_video_control` `{ action: 'toggle' }`. Playing-state **не** в БД.

`assertCurrentVip(sessionId, playerId)`: load session; if `vipPlayerId !== playerId` → `DomainError.forbidden('not vip')`.

#### Phase-change — one reject layer

`GameFlowService` methods throw `ILLEGAL_STATE` `session is paused` if `s.isPaused` **before** any phase write:

- `revealAnswer`
- `proceedAfterReveal`
- `continueFromLeaderboard`
- `continueAfterRoundSummary`

Gateway `host_start_next_quiz` (SessionService, not flow): same throw/wrap if `isPaused`.

`finishQuestionEarly`: **return unchanged** if paused (no throw — caller is answer path).

`AutomaticAdvanceService`: `where isPaused: false`; `advanceAfterDeadline` return if paused.

`startGame`: always `isPaused = false` and `pausedRemainingMs = null` before changing phase. Never reject start because of pause.

Allowed while paused: `submit_answer`, `place_stake`, `question_view`, `leaderboard`, `leaderboard_view`, `round_summary_view`, `host_kick_player`, `host_return_to_lobby`, `host_close_room`, `host_set_vip`, video toggle, pause toggle, `dispute_vote`, `dispute_state`.

**Forbidden while paused:** `dispute_start` → `ILLEGAL_STATE` `session is paused`. `DisputeService` must **not** write `phaseDeadlineAt` when `isPaused` (even vote/expire paths).

Нет host-skip WS для `round_intro` / `question_read`. Pause nulls deadline → they stay.

**Resume after all-answered:** do **not** call `finishQuestionEarly` on unpause. Phase stays `question`. Remaining `phaseDeadlineAt` (if restored) or host `host_reveal_answer` after unpause. Manual (null remaining): stays `question` until host reveal.

#### `GameFlowService.togglePause`

Allowed phases: `round_intro`, `question_read`, `question`, `answer_reveal`, `round_replay`, `round_summary`, `leaderboard`. Else `ILLEGAL_STATE` `cannot pause in this phase`.

Pause: `pausedRemainingMs = phaseDeadlineAt ? Math.max(0, t-now) : null`; `phaseDeadlineAt = null`; `isPaused = true`.

Resume: `isPaused = false`; if remaining != null then `phaseDeadlineAt = now + remaining`; `pausedRemainingMs = null`.

`saveSessionWithRetry` + `emitSessionUpdate`.

#### Client timer

If `isPaused`: show frozen `pausedRemainingMs` (or `—`) + label «Пауза» on **host stage timer and every player timer**. `isPaused` wins over host dispute label «Ведётся оспаривание». Do not copy remaining into `phaseDeadlineAt`. Host interval skips proceed/continue when `isPaused`.

### Data Flow

**Claim VIP (join / reconnect if `vip_player_id` null)**

1. Insert/save player (join) or mark connected (reconnect).
2. `UPDATE game_sessions SET vip_player_id = :id WHERE id = :sid AND vip_player_id IS NULL`.
3. `findSession` reload (required — in-memory session from step 1 has stale VIP).
4. `emitSessionUpdate(reloaded)` + `emitPlayersUpdate(sid, listLobbyPlayers)`.

**setVip (`host_set_vip`)**

1. Load session; if not lobby → `ILLEGAL_STATE` `vip reassign only in lobby`.
2. Load player by `playerId`; missing → `NOT_FOUND` `player`.
3. `player.sessionId !== session.id` → `FORBIDDEN` `player not in this session`.
4. `!player.isConnected` → `FORBIDDEN` `player not connected`.
5. `session.vipPlayerId = player.id`; save; emit session + players.

**VIP leave (kick or disconnect, any phase)**

1. Mark player offline (`isConnected=false`, `disconnectedAt=now`) and save player.
2. If `vipPlayerId === leavingId`: `nextId` = first of `listLobbyPlayers` (`joinedAt ASC`) or `null`. `UPDATE game_sessions SET vip_player_id = :nextId WHERE id = :sid` (or TypeORM assign + save). If not current VIP, skip this UPDATE.
3. `findSession` reload.
4. `emitSessionUpdate(reloaded)` + `emitPlayersUpdate(sid, listLobbyPlayers)`.

**VIP start** — `flow.startGame` (clears pause).

**Live vs solo video**

`renderStageQuestion(dom, ctrl, q, showCorrect, hostStagePhase, mediaMode: 'live' | 'solo')`.

Every `HostPage` call site: `mediaMode: soloRef.current.on ? 'solo' : 'live'` (same expression, including solo boot). Never hardcode `'live'` on shared calls.

- `'solo'`: current autoplay + `prepareMutedAutoplayVideo` + Drive iframe fallback + `maybeStartHostQuestionMediaGate`.
- `'live'`: `appendQuestionStageVideo(..., { autoplay: false, controls: true })`; skip play-poll, skip `maybeStartHostQuestionMediaGate`, skip Drive-error iframe autoplay fallback (keep `<video controls>` or show error). Tests that omit `mediaMode` default `'solo'`. `PreviewHostPage` does not call `renderStageQuestion` — out of scope.

Live `HostPage` `pointerdown` autoplay: skip when `!solo.on`.

VIP video button: `isVip && (question_read|question) && videoUrl.trim()`. `PlayerQuestion.videoUrl` from `question_view`.

`videoPlayingGuess`: local boolean on VIP phone, default `false`, flip only after ack `ok`. Not synced to host. Labels follow guess.

`vip_toggle_question_video` → ack + `stage_video_control { action: 'toggle' }`. Live host: `video.paused ? play() : pause()`. No `<video>` (iframe only) → host no-op. Remote play may be muted by autoplay policy.

**Pause UI:** `#btnHostPause` in game-menu panel immediately after `#btnSoloPause`. Show iff `!solo.on` && phase not lobby/finished. Labels: «Пауза» when `!isPaused`, «Продолжить» when `isPaused` (same as VIP chrome).

### UI

**Host lobby only:** VIP pill «VIP»; others crown `title="Сделать VIP"` next to kick. Player grid hidden mid-game → no in-game VIP badge, no stage avatar (out of v1).

**Pause visible to all:** timer text «Пауза» + frozen remaining on host and all players. Buttons only host `#btnHostPause` and VIP contextual pause.

**Player VIP (`playerVipChrome`):**

| Condition | Buttons |
|---|---|
| `isVip && phase==='lobby'` | «Начать игру» |
| `isVip && pause-allow phase` | «Пауза» / «Продолжить» if `isPaused` |
| `isVip && (question_read\|question) && videoUrl` | «Старт видео» / «Стоп видео» |
| `!isVip` | none |

**Solo:** no VIP, no `#btnHostPause`.

## Error Handling

| Case | Result |
|---|---|
| Non-VIP `vip_*` | `FORBIDDEN` `not vip` |
| `host_set_vip` not lobby | `ILLEGAL_STATE` `vip reassign only in lobby` |
| Player missing | `NOT_FOUND` `player` |
| Player other session | `FORBIDDEN` `player not in this session` |
| Player disconnected | `FORBIDDEN` `player not connected` |
| Pause lobby/finished | `ILLEGAL_STATE` `cannot pause in this phase` |
| Flow phase-advance / `host_start_next_quiz` / `dispute_start` while paused | `ILLEGAL_STATE` `session is paused` |
| `finishQuestionEarly` while paused | silent no-op |
| `vip_toggle_question_video` no `videoUrl` | `ILLEGAL_STATE` `no question video` |
| Join VIP race | SQL `WHERE vip_player_id IS NULL` |
| Pause toggle race | `saveSessionWithRetry` |
| WS timeout | existing toast |

## Testing Strategy

### E2E (`test/quiz-game.e2e-spec.ts`)

| Case | Expect |
|---|---|
| First join VIP | GET players A `isVip`; `session_update.vipPlayerId === A` |
| Second join no steal | still A |
| `host_set_vip` lobby B | `session_update.vipPlayerId === B` |
| `host_set_vip` after start | `ILLEGAL_STATE` |
| Kick VIP A (B connected) | B VIP |
| Kick last VIP | null; next join VIP |
| Disconnect VIP in `question` | auto-next remaining |
| Reconnect VIP-null | that player VIP |
| Former VIP reconnect while B is VIP | still B (no steal) |
| `returnSessionToLobby` | VIP kept; `isPaused` false |
| Non-VIP `vip_start_game` | `FORBIDDEN` |
| VIP `vip_start_game` | leaves lobby |
| Leftover pause + `host_start_game`/`vip_start_game` | SQL-seed lobby row `is_paused=true`, `paused_remaining_ms=5000` (API cannot pause lobby). After start: `isPaused===false` and `pausedRemainingMs===null` |
| Player `host_set_vip` | `FORBIDDEN` |
| `host_toggle_pause` automatic `question` | paused, deadline null, remaining >= 0 |
| Resume | deadline within ±500ms of now+previous remaining |
| `host_reveal_answer` paused | `ILLEGAL_STATE` |
| `host_proceed_after_reveal` paused | `ILLEGAL_STATE` |
| `host_continue_round_summary` paused | `ILLEGAL_STATE` |
| `host_continue_leaderboard` paused | `ILLEGAL_STATE` |
| Manual pause + `host_reveal_answer` | `ILLEGAL_STATE` |
| Pause `round_intro`, wait auto tick | still `round_intro` |
| `submit_answer` paused `question` | ok |
| All answered while paused | stays `question` |
| Resume after all-answered | still `question` (no auto early-finish) |
| `vip_toggle_pause` | same as host |
| `vip_toggle_question_video` no video | `ILLEGAL_STATE` |
| `vip_toggle_question_video` seeded `videoUrl` | ack `ok` |
| `dispute_start` while paused | `ILLEGAL_STATE` |

### Vitest / unit

| Case | Expect |
|---|---|
| live `appendQuestionStageVideo` | controls, no autoplay |
| solo/default | muted autoplay, no controls |
| `playerVipChrome` | lobby start; question+video pause+video; !vip none; paused resume label |
| `togglePause` math | remaining captured; resume deadline ≈ now+remaining |
| `finishQuestionEarly` paused | session phase unchanged |

Solo pause UI tests unchanged.

## Migration Path

1. Last in `ALL_MIGRATIONS`; name `SessionVipAndPause1746300000000`.
2. Existing sessions: VIP null until claim.
3. `down`: FK, index, three columns.
4. `docs/API.md`: new WS, `session_update` fields, pause + VIP.

## Open Questions

None. Locked in this revision: emit signature; reload after claim; resume-after-all-answered; dispute_start blocked + no deadline write; `mediaMode` on `renderStageQuestion`; setVip error map; pause reject in flow (+ gateway next-quiz only); pause visibility = timer label; no mid-game badge; reopen/end session fields.

## Decision Log

| Decision | Options Considered | Chosen | Rationale |
|---|---|---|---|
| VIP meaning | Visual; bonus; control | Start + video + pause | User |
| Dual control | VIP-only; host+VIP | Host + VIP | Host screen still works |
| Video | Autoplays; wait; phone-only | Wait; host native controls; VIP toggle | «Запустить» иначе no-op |
| Pause | Timer only; +block answers; +video | Timer + block phase cmds + `finishQuestionEarly`; answers on; video separate | Manual default; user «квиз стоит» |
| Storage | player boolean; session FK | `vip_player_id` column + SQL FK, no ORM relation | One VIP; avoid cyclic TypeORM |
| First VIP | WS vs HTTP join | `joinPlayer` | Row exists then |
| Leave | Keep offline; clear; auto-next | Auto-next via connected list any phase | Always a VIP if someone online |
| Reassign | Anytime; lobby; lobby+pause | Lobby only | User |
| Host UI | Card click; select; crown | Crown + badge | Kick stays |
| Phone UI | 3 always; mini-host; contextual | Contextual | Less noise |
| Pause phases | Question only; subset; all timed except lobby/finished | All except lobby/finished | One flag |
| Scope | public HTML; solo; bonuses | `web/` only | React is UI |
| Video state | Persist | Ephemeral WS | Host DOM source of truth |
| Pause writes | SessionService save; shared lock; GameFlow | `GameFlowService.togglePause` | Existing retry |
| All-answered | Let finish; freeze | `finishQuestionEarly` no-op; resume does not retrigger | Otherwise pause ends itself |
| Player isVip | `players_update`; HTTP join; session | `session.vipPlayerId === me` | Player already has session_update |
| Host pause button | By timer; game menu | `#btnHostPause` in game menu next to solo pause | Menu already exists |
| Dispute vs pause | Allow all dispute; freeze deadline writes | Block `dispute_start`; skip `phaseDeadlineAt` writes if paused | Dispute extends deadline and would unfreeze auto-advance |
| emitPlayersUpdate | Overload session vs vip arg | `(sessionId, players)` + findSession inside | One signature |
| Mid-game VIP chrome | Stage avatar; in-game cards | Lobby cards only | Grid hidden after start |
