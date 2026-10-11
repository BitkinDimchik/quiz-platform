import { useEffect, useRef } from 'react';
import { visibleCorrectTexts } from '../lib/correct-texts';
import { formatOptionDisplayLabel } from '../lib/format';
import { usePlayerGame } from '../lib/player/usePlayerGame';
import { stageFontVarStyle } from '../lib/host/quiz-stage-font';
import '../styles/player.css';

function isPrimaryPointer(e: { button: number }) {
  return e.button === 0;
}

export function PlayerPage() {
  const g = usePlayerGame();
  const lastPointerActionAt = useRef(0);

  const fromPointerOrFreshClick = () => {
    const now = performance.now();
    if (now - lastPointerActionAt.current < 450) return false;
    return true;
  };

  const markPointerAction = () => {
    lastPointerActionAt.current = performance.now();
  };

  useEffect(() => {
    const prog = g.timerProgressElRef.current;
    if (!prog || g.timerCircleLen != null) return;
    try {
      const len = prog.getTotalLength();
      prog.style.strokeDasharray = String(len);
      g.onTimerCircleReady(len);
    } catch {
      g.onTimerCircleReady(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.timerCircleLen, g.onTimerCircleReady]);

  const joinDisplay = g.surface === 'join' ? undefined : 'none';
  const gameDisplay = g.surface === 'game' || g.surface === 'waiting' ? 'block' : 'none';
  const lbDisplay = g.surface === 'leaderboard' ? 'block' : 'none';

  const gameCardClass = [
    'card',
    g.gameViewing || g.surface === 'game' || g.surface === 'waiting' ? 'player-game-viewing' : '',
    g.gameCardIntro ? 'player-round-intro' : '',
    g.gameCardSummary ? 'player-round-summary' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const qTitleClass =
    g.qTitleMode === 'round'
      ? 'stage-question stage-title stage-round-title'
      : 'stage-question stage-q';

  const opts = g.question?.options || [];
  const selectedSet = new Set(g.selectedOptionIds.map(String));
  const correctSet = new Set((g.question?.correctOptionIds || []).map(String));
  const reveal =
    g.phase === 'answer_reveal' || g.phase === 'round_replay' || g.phase === 'round_summary';

  const disputeOpen = g.openDispute && g.openDispute.status === 'open';
  const myVote = disputeOpen
    ? (g.openDispute!.votes || []).find((v) => String(v.playerId) === String(g.playerId))
    : null;

  const match = g.question?.match;
  const matchN = match?.left?.length || 0;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const shownCorrectTexts = visibleCorrectTexts(g.correctTexts);
  const fonts = g.question?.stageFonts;
  const promptFont = stageFontVarStyle(fonts?.prompt);
  const matchFont = (id?: string) =>
    stageFontVarStyle((id && fonts?.matchLeft?.[id]) || fonts?.prompt);

  return (
    <>
      <div id="viewportRoundBg" className="viewport-round-bg" aria-hidden="true" />
      <div className="container">
        <div className="card" id="joinCard" style={{ display: joinDisplay }}>
          <h2>Подключение</h2>
          <div className="row">
            <div className="col">
              <div className="field">
                <label>roomCode</label>
                <input
                  id="roomCode"
                  placeholder="Например ABCD5"
                  value={g.roomCode}
                  onChange={(e) => g.setRoomCode(e.target.value)}
                />
              </div>
            </div>
            <div className="col">
              <div className="field">
                <label>Имя</label>
                <input
                  id="name"
                  placeholder="Ваше имя"
                  value={g.name}
                  onChange={(e) => g.setName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button className="btn primary" id="btnJoin" type="button" onClick={() => void g.onJoin()}>
            Подключиться
          </button>
          <div id="returnBlock" style={{ display: g.showReturnBlock ? undefined : 'none', marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              Вы уже подключались ранее — можно вернуться тем же игроком.
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn good" id="btnReturn" type="button" onClick={() => void g.onReturn()}>
                Вернуться
              </button>
            </div>
          </div>
        </div>

        <div className={gameCardClass} id="gameCard" style={{ display: gameDisplay, position: 'relative' }}>
          <div className="stage-center">
            <h2 id="qTitle" className={qTitleClass} style={promptFont}>
              {g.qTitle}
            </h2>
            {g.gameCardIntro && g.introMeta ? (
              <div className="stage-meta" id="qIntroMeta">
                {g.introMeta}
              </div>
            ) : null}

            {g.showBettingPanel ? (
              <div className="player-betting" id="playerBetting">
                <p className="player-betting__hint stage-q">
                  {g.question?.bettingScope === 'question'
                    ? 'Поставьте ставку на этот вопрос — он будет стоить эту сумму: выиграете или потеряете её.'
                    : 'Поставьте ставку на этот раунд — каждый вопрос будет стоить эту сумму: выиграете или потеряете её.'}
                  {' '}
                  Без ставки вопрос идёт по стандартной цене и очки не теряются.
                </p>
                <div className="player-betting__score muted">Ваш счёт: {g.playerScore}</div>
                {g.bettingLimitLabel ? (
                  <div className="player-betting__limit muted">{g.bettingLimitLabel}</div>
                ) : null}
                {g.stakePlaced ? (
                  <div className="player-betting__done stage-q">
                    {g.stakeDraft > 0 ? (
                      <>
                        Ставка принята: <span className="pill good">{g.stakeDraft}</span>
                      </>
                    ) : (
                      'Играете без ставки — вопрос по стандартной цене.'
                    )}
                  </div>
                ) : g.bettingCanBet ? (
                  <>
                    {g.bettingMode === 'presets' ? (
                      <div className="player-betting__presets">
                        {g.bettingPresets.map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={`btn${g.stakeDraft === value ? ' primary' : ''}`}
                            disabled={g.stakeSubmitting}
                            onClick={() => g.onSelectStakePreset(value)}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="player-betting__input">
                        <input
                          id="stakeInput"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label="Размер ставки"
                          placeholder={String(g.bettingMinStake)}
                          value={g.stakeInput}
                          disabled={g.stakeSubmitting}
                          onChange={(e) => g.onStakeInputChange(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn"
                          disabled={g.stakeSubmitting}
                          onClick={() => g.onStakeInputChange(String(g.bettingMaxStake))}
                        >
                          Макс
                        </button>
                      </div>
                    )}
                    {g.stakeError ? (
                      <div className="player-betting__error">{g.stakeError}</div>
                    ) : null}
                    <button
                      type="button"
                      className="btn good player-betting__confirm"
                      disabled={g.stakeSubmitting || !g.stakeValid}
                      onClick={() => void g.onPlaceStake(g.stakeDraft)}
                    >
                      {g.stakeSubmitting ? 'Отправка…' : 'Подтвердить ставку'}
                    </button>
                    <button
                      type="button"
                      className="btn player-betting__skip"
                      disabled={g.stakeSubmitting}
                      onClick={() => void g.onSkipStake()}
                    >
                      Играть без ставки
                    </button>
                  </>
                ) : (
                  <>
                    <div className="player-betting__limit muted">
                      Очков пока не хватает для ставки — вопрос пойдёт по стандартной цене.
                    </div>
                    <button
                      type="button"
                      className="btn player-betting__skip"
                      disabled={g.stakeSubmitting}
                      onClick={() => void g.onSkipStake()}
                    >
                      Понятно, играю без ставки
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <div className="stage-media" id="stageMedia" style={{ display: 'none' }} />

            <div
              className={`timer-circle${g.isPaused ? ' host-timer-circle--paused' : ''}`}
              aria-hidden="true"
              style={{ display: g.showTimerCircle ? undefined : 'none' }}
            >
              <svg className="timer-circle__svg" viewBox="0 0 100 100">
                <circle className="timer-circle__halo timer-circle__halo--black" cx="50" cy="50" r="42" />
                <circle className="timer-circle__halo timer-circle__halo--white" cx="50" cy="50" r="42" />
                <circle className="timer-circle__track" cx="50" cy="50" r="42" />
                <circle
                  className="timer-circle__progress"
                  id="timerCircleProgress"
                  cx="50"
                  cy="50"
                  r="42"
                  ref={g.timerProgressElRef}
                />
              </svg>
              <div className="timer-circle__text" id="timerCircleText" ref={g.timerTextElRef} />
            </div>

            <div id="textBlock" style={{ display: g.textVisible ? undefined : 'none', width: '100%', maxWidth: 720 }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="stage-text-answer-label">Ваш ответ</label>
                <textarea
                  id="textAnswer"
                  rows={1}
                  placeholder={g.textDisabled ? (g.textAnswer ? '' : 'Нет ответа') : 'Введите ответ'}
                  value={g.textAnswer}
                  disabled={g.textDisabled}
                  readOnly={g.textDisabled}
                  style={stageFontVarStyle(fonts?.textHint || fonts?.prompt)}
                  className={[
                    'stage-text-answer',
                    g.textFeedback === 'correct'
                      ? 'stage-text-answer--correct'
                      : g.textFeedback === 'wrong'
                        ? 'stage-text-answer--wrong'
                        : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onChange={(e) => g.onTextChange(e.currentTarget.value)}
                />
              </div>
            </div>

            <div
              id="matchBlock"
              className={g.matchBlockClass || undefined}
              style={{ display: g.matchVisible ? undefined : 'none', width: '100%', maxWidth: 720, marginTop: 10 }}
            >
              {g.matchVisible && match && match.left && match.right && match.left.length === match.right.length ? (
                <>
                  <div className="player-match">
                    {match.left.map((L, idx) => {
                      const letter = letters[idx] || String(idx + 1);
                      const labelTrim = (L.label || '').trim();
                      const hasImg = !!(L.imageUrl || '').trim();
                      const rowExtra = g.matchRowClasses[idx] || '';
                      return (
                        <div
                          key={idx}
                          className={`player-match__row${rowExtra ? ` ${rowExtra}` : ''}`}
                          data-match-row={String(idx)}
                        >
                          <div className="player-match__prompt">
                            {hasImg && !labelTrim ? (
                              <>
                                <div
                                  className="player-match__left-txt stage-q"
                                  style={matchFont(L.id)}
                                >
                                  {letter}.
                                </div>
                                <div className="player-match__left-img">
                                  <img src={String(L.imageUrl)} alt="" />
                                </div>
                              </>
                            ) : null}
                            {hasImg && labelTrim ? (
                              <>
                                <div className="player-match__left-img">
                                  <img src={String(L.imageUrl)} alt="" />
                                </div>
                                <div
                                  className="player-match__left-txt stage-q"
                                  style={matchFont(L.id)}
                                >
                                  {letter}. {labelTrim}
                                </div>
                              </>
                            ) : null}
                            {!hasImg ? (
                              <div
                                className="player-match__left-txt stage-q"
                                style={matchFont(L.id)}
                              >
                                {letter}.{labelTrim ? ` ${labelTrim}` : ''}
                              </div>
                            ) : null}
                          </div>
                          <div className="player-match__pick">
                            <select
                              className="player-match-sel"
                              value={
                                Number.isFinite(g.matchOrder[idx]) ? String(g.matchOrder[idx]) : ''
                              }
                              disabled={g.hasSubmittedCurrent}
                              onChange={(e) => g.onMatchChange(idx, e.target.value)}
                            >
                              <option value="">—</option>
                              {Array.from({ length: matchN }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {g.matchKeyHint ? (
                    <div className="stage-q" style={{ marginTop: 12, textAlign: 'center' }}>
                      {g.matchKeyHint}
                    </div>
                  ) : null}
                </>
              ) : g.matchVisible ? (
                <div className="muted" style={{ textAlign: 'center' }}>
                  Нет данных вопроса
                </div>
              ) : null}
            </div>

            <div
              className={
                g.answersHtmlMode === 'options'
                  ? `grid-answers${g.answersVisual ? ' grid-answers--visual' : ''}`
                  : undefined
              }
              id="answers"
              style={{
                marginTop: 14,
                display: g.answersVisible || g.answersHtmlMode !== 'empty' ? undefined : 'none',
              }}
              data-count={g.answersHtmlMode === 'options' ? String(opts.length) : undefined}
            >
              {g.answersHtmlMode === 'waiting_msg' ? (
                <div className="player-waiting">
                  {g.avatarEditable ? (
                    <div className="field avatar-picker player-waiting__avatar">
                      <label>Выберите аватар</label>
                      <div className="avatar-picker__grid" role="listbox" aria-label="Выбор эмодзи">
                        {g.AVATARS.map((ava) => {
                          const selected = !g.customAvatarUrl && g.chosenAva === ava;
                          return (
                            <button
                              key={ava}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`avatar-picker__emoji${selected ? ' is-selected' : ''}`}
                              data-ava={ava}
                              onClick={() => g.selectEmojiAvatar(ava)}
                            >
                              {ava}
                            </button>
                          );
                        })}
                      </div>
                      <div className="avatar-picker__upload">
                        <label
                          htmlFor="playerAvatarFile"
                          className={`btn avatar-picker__upload-btn${g.customAvatarUrl ? ' primary' : ''}${g.avatarUploading ? ' is-disabled' : ''}`}
                        >
                          {g.avatarUploading ? 'Загрузка…' : 'Своя картинка'}
                        </label>
                        <input
                          id="playerAvatarFile"
                          className="avatar-picker__file"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          tabIndex={-1}
                          disabled={g.avatarUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            void g.onAvatarFile(f);
                          }}
                        />
                        {g.customAvatarUrl ? (
                          <div className="avatar-picker__preview">
                            <img src={g.customAvatarUrl} alt="" />
                            <button type="button" className="btn" onClick={() => g.clearCustomAvatar()}>
                              Убрать
                            </button>
                          </div>
                        ) : (
                          <span className="muted avatar-picker__hint">JPG, PNG, WebP или GIF · до 2 МБ</span>
                        )}
                      </div>
                    </div>
                  ) : null}
                  <div className="muted round-desc-text" style={{ textAlign: 'center' }}>
                    Ожидайте действий ведущего.
                  </div>
                </div>
              ) : null}

              {g.answersHtmlMode === 'correct_texts' ? (
                <>
                  {shownCorrectTexts.length ? (
                    <>
                      <div
                        className="stage-q stage-correct-texts-title"
                        style={{ marginTop: 10, textAlign: 'center', ...stageFontVarStyle(fonts?.correctTexts?.title) }}
                      >
                        Правильный ответ:
                      </div>
                      <div
                        className="stage-q stage-correct-texts-item"
                        style={{
                          marginTop: 8,
                          textAlign: 'center',
                          ...stageFontVarStyle(fonts?.correctTexts?.['0'] || fonts?.prompt),
                        }}
                      >
                        {shownCorrectTexts[0]}
                      </div>
                    </>
                  ) : null}
                  {g.showDisputeChallenge ? (
                    <div id="playerDisputeChallengeMount" className="player-dispute-challenge-mount">
                      <button type="button" className="btn" onClick={() => void g.startDispute()}>
                        Оспорить
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}

              {g.answersHtmlMode === 'options'
                ? opts.map((opt, k) => {
                    const imgUrl = (opt.imageUrl || '').trim();
                    const selected = selectedSet.has(String(opt.id));
                    const isCorrect = correctSet.has(String(opt.id));
                    const classes = ['answer', 'stage-answer'];
                    if (g.answersVisual) classes.push('answer--visual');
                    if (selected) classes.push('selected');
                    if (g.hasSubmittedCurrent || reveal) classes.push('disabled');
                    if (reveal && isCorrect) classes.push('correct');
                    if (reveal && selected && !isCorrect) classes.push('wrong');
                    if (reveal && isCorrect && !selected) {
                      classes.push('stage-answer--missed-correct');
                    }
                    const cap = formatOptionDisplayLabel(opt.label || '', k);
                    return (
                      <div
                        key={opt.id}
                        className={classes.join(' ')}
                        data-opt={opt.id}
                        style={stageFontVarStyle(fonts?.answers?.[opt.id])}
                        onPointerDown={(e) => {
                          if (!isPrimaryPointer(e)) return;
                          markPointerAction();
                          g.onSelectOption(opt.id);
                        }}
                        onClick={() => {
                          if (!fromPointerOrFreshClick()) return;
                          g.onSelectOption(opt.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') g.onSelectOption(opt.id);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        {imgUrl ? (
                          <>
                            <img src={imgUrl} alt="" />
                            {cap ? <div className="answer-caption stage-caption">{cap}</div> : null}
                          </>
                        ) : (
                          cap || '—'
                        )}
                      </div>
                    );
                  })
                : null}
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            {g.vipChrome.showStart ? (
              <button className="btn good player-vip-action" type="button" onClick={() => void g.onVipStartGame()}>
                Начать игру
              </button>
            ) : null}
            {g.vipChrome.showPause ? (
              <button className="btn player-vip-action" type="button" onClick={() => void g.onVipTogglePause()}>
                {g.vipChrome.pauseLabel}
              </button>
            ) : null}
            {g.vipChrome.showVideo ? (
              <button className="btn player-vip-action" type="button" onClick={() => void g.onVipToggleVideo()}>
                {g.vipChrome.videoLabel}
              </button>
            ) : null}
            <button
              className="btn"
              id="btnBackToJoin"
              type="button"
              style={{ display: g.showBackToJoin ? undefined : 'none' }}
              onClick={g.onBackToJoin}
            >
              К подключению
            </button>
            <button
              className={`btn primary stage-btn-submit${g.submitDisabled ? ' stage-btn-submit--disabled' : ''}`}
              id="btnSubmit"
              type="button"
              disabled={g.submitDisabled}
              style={{ display: g.showSubmit ? undefined : 'none' }}
              onPointerDown={(e) => {
                if (!isPrimaryPointer(e) || g.submitDisabled) return;
                markPointerAction();
                void g.onSubmit();
              }}
              onClick={() => {
                if (!fromPointerOrFreshClick()) return;
                void g.onSubmit();
              }}
            >
              Отправить
            </button>
            <button
              className="btn"
              id="btnLeave"
              type="button"
              style={{ display: g.showLeave ? undefined : 'none' }}
              onClick={g.onLeave}
            >
              Отключиться
            </button>
          </div>

          <div
            id="disputeOverlay"
            className="player-dispute-overlay"
            style={{ display: disputeOpen ? undefined : 'none' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="disputeOverlayTitle"
          >
            <div className="player-dispute-panel">
              <h3 id="disputeOverlayTitle" className="player-dispute-title">
                Оспаривание ответа
              </h3>
              <p className="player-dispute-lead" id="disputeProposerLine">
                {disputeOpen
                  ? `${g.openDispute!.proposerDisplayName || 'Игрок'} предлагает оспорить оценку ответа.`
                  : ''}
              </p>
              <p className="muted player-dispute-hint">
                Если все игроки проголосуют «За», ответ будет засчитан как верный.
              </p>
              <div className="player-dispute-columns">
                <div>
                  <div className="muted player-dispute-col-label">Правильный ответ</div>
                  <div id="disputeCorrectCol" className="player-dispute-text-block">
                    {disputeOpen && g.openDispute!.correctTexts && g.openDispute!.correctTexts.length ? (
                      g.openDispute!.correctTexts.map((t, i) => (
                        <div key={i} className="player-dispute-answer-line">
                          {String(t)}
                        </div>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="muted player-dispute-col-label">Ответ игрока</div>
                  <div id="disputeProposedCol" className="player-dispute-text-block">
                    {disputeOpen ? (
                      <div className="player-dispute-answer-line">{String(g.openDispute!.proposedText || '')}</div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div id="disputeVotes" className="player-dispute-votes">
                {disputeOpen
                  ? (g.openDispute!.votes || []).map((v, i) => {
                      const mark = v.approve === true ? 'За' : v.approve === false ? 'Против' : 'ожидает';
                      return (
                        <div key={i} className="player-dispute-vote-row">
                          <span className="player-dispute-vote-name">{String(v.displayName || '?')}</span>
                          <span className="player-dispute-vote-mark">{mark}</span>
                        </div>
                      );
                    })
                  : null}
              </div>
              <div id="disputeVoteActions" className="player-dispute-vote-actions">
                {disputeOpen ? (
                  myVote && myVote.approve !== null ? (
                    myVote.approve ? 'Ваш голос: За' : 'Ваш голос: Против'
                  ) : g.playerId ? (
                    <>
                      <button
                        type="button"
                        className="btn good"
                        onClick={() => void g.voteDispute(g.openDispute!.disputeId, true)}
                      >
                        За
                      </button>
                      <button
                        type="button"
                        className="btn bad"
                        onClick={() => void g.voteDispute(g.openDispute!.disputeId, false)}
                      >
                        Против
                      </button>
                    </>
                  ) : null
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ display: 'none' }}>
            <div id="meAvatar">{g.meAvatar}</div>
            <div id="meName">{g.meName}</div>
            <div id="meId">{g.meId}</div>
            <div
              id="wsStatus"
              style={{
                borderColor:
                  g.wsStatus === 'connected' ? 'rgba(34,197,94,0.45)' : 'rgba(230,238,252,0.12)',
              }}
            >
              {g.wsStatus}
            </div>
            <div id="timer" />
            <div id="phaseInfo">{g.phaseInfo}</div>
          </div>
        </div>

        <div className="card" id="leaderboardCard" style={{ display: lbDisplay }}>
          <div className="stage-center">
            <h2 className="stage-question stage-q stage-lb-title" id="lbTitle">
              {g.lbKind === 'final' ? 'Финальные итоги' : 'Итоги раунда'}
            </h2>
            <div className="muted stage-meta stage-lb-sub" id="lbSub">
              {g.lbKind === 'final' ? 'Список игроков и общий счёт' : 'Очки за раунд и общий счёт'}
            </div>
            <div style={{ width: '100%', maxWidth: 720 }}>
              <div id="lbTop3" />
              <div style={{ height: 10 }} />
              <div id="lbList">
                {(g.lbRows || []).map((r, idx) => (
                  <div key={idx} className="row lb-row stage-lb-row">
                    <div className="lb-name" style={{ fontWeight: 900 }}>
                      {idx + 1}. {r.displayName || '—'}
                    </div>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      {g.lbKind !== 'final' ? <span className="pill">+{r.roundPoints || 0}</span> : null}
                      <span className="pill good">{String(r.score || 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button
                type="button"
                className="btn primary stage-no-outline"
                id="btnLbBackToWaiting"
                style={{ display: g.lbKind === 'final' ? undefined : 'none' }}
                onClick={g.onLbBackToWaiting}
              >
                В комнату ожидания
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
