import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { apiFetch, withAuth } from '../api';
import { getAccessToken } from '../auth';
import { patchStoredDraftStageLayout } from '../builder/storage';
import { toast } from '../toast';
import type { QuestionView } from './types';
import type { SoloState } from './solo';
import { remainingMs } from '../format';
import { soloAllQuestions, soloCurrentQuestion, soloQuestionLayoutIds, soloResumeAfterPause } from './solo';
import {
  applyStageLayout,
  boxForKey,
  copyStageLayoutToTarget,
  displayBoxForInspector,
  isQuestionUuid,
  readComputedBoxStyle,
  materializeStageLayout,
  parseStageBox,
  parseStageLayout,
  pctBoxFromRects,
  nudgeBoxesBelowChanged,
  fitTextBoxAfterFontChange,
  setBoxForKey,
  type StageBox,
  type StageLayout,
} from './stage-layout';
import { moveBox, pxDeltaToPct, resizeBox, RESIZE_DIRS, collectSnapTargets, snapBoxToTargets, snapThresholdPct, copyBoxSizeToKeys, imageSlotKeysFromStage, type ResizeDir, type SnapGuide } from './stage-layout-edit';

export type LayoutApplyScope = 'this' | 'all';

let lastApplyScope: LayoutApplyScope = 'this';

export function hostStageCenter(): HTMLElement | null {
  return document.querySelector('#stageCard .stage-center');
}

export async function patchQuestionLayout(
  questionId: string,
  layout: StageLayout | null,
): Promise<StageLayout | null> {
  const res = await apiFetch<{ ok: boolean; stageLayout: StageLayout | null }>(
    `/api/quizzes/questions/${questionId}/stage-layout`,
    {
      method: 'PATCH',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ stageLayout: layout }),
    },
  );
  return res.stageLayout;
}

export async function patchQuizLayout(
  quizId: string,
  layout: StageLayout | null,
): Promise<StageLayout | null> {
  const res = await apiFetch<{ ok: boolean; stageLayout: StageLayout | null }>(
    `/api/quizzes/${quizId}/stage-layout`,
    {
      method: 'PATCH',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ stageLayout: layout }),
    },
  );
  return res.stageLayout;
}

export async function patchRoundLayout(
  roundId: string,
  layout: StageLayout | null,
): Promise<StageLayout | null> {
  const res = await apiFetch<{ ok: boolean; stageLayout: StageLayout | null }>(
    `/api/quizzes/rounds/${roundId}/stage-layout`,
    {
      method: 'PATCH',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ stageLayout: layout }),
    },
  );
  return res.stageLayout;
}

export function paintHostStageLayout(layout: StageLayout | null | undefined, lockKey?: string) {
  const el = hostStageCenter();
  if (!el) return;
  applyStageLayout(el, layout ?? null, lockKey);
}

function questionPhase(phase: string | null | undefined): boolean {
  return (
    phase === 'question_read' ||
    phase === 'question' ||
    phase === 'answer_reveal' ||
    phase === 'round_summary'
  );
}

function editableStagePhase(phase: string | null | undefined): boolean {
  return phase === 'quiz_intro' || phase === 'round_intro' || questionPhase(phase);
}

export type LayoutScreen = 'question' | 'quiz_intro' | 'round_intro';

export function layoutScreenForPhase(phase: string | null | undefined): LayoutScreen {
  if (phase === 'quiz_intro') return 'quiz_intro';
  if (phase === 'round_intro') return 'round_intro';
  return 'question';
}

function layoutFromView(phase: string | null | undefined, q: QuestionView | null): StageLayout | null {
  if (phase === 'quiz_intro') return parseStageLayout(q?.quizStageLayout ?? null);
  if (phase === 'round_intro') return parseStageLayout(q?.roundStageLayout ?? null);
  return parseStageLayout(q?.stageLayout ?? null);
}

function writeLayoutToSolo(solo: SoloState, phase: string | null | undefined, layout: StageLayout | null) {
  if (phase === 'quiz_intro') {
    if (solo.payload) solo.payload.stageLayout = layout;
    return;
  }
  if (phase === 'round_intro') {
    const r = solo.payload?.rounds?.[solo.roundIdx];
    if (r) r.stageLayout = layout;
    return;
  }
  const rq = solo.payload?.rounds?.[solo.roundIdx]?.questions?.[solo.questionIdx];
  if (rq) rq.stageLayout = layout;
}

export function useStageLayoutEditor(opts: {
  soloRef: MutableRefObject<SoloState>;
  getQuestion: () => QuestionView | null;
  rerender: () => void;
  setSoloPausedLabel: (v: string) => void;
  bgmPause: () => void;
  bgmResume: () => void;
  /** Builder preview: persist into the draft (and optionally PATCH). Solo omits this. */
  persistLayout?: (
    layout: StageLayout | null,
    scope: LayoutApplyScope,
    screen: LayoutScreen,
  ) => Promise<StageLayout | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [applyScope, setApplyScopeState] = useState<LayoutApplyScope>(lastApplyScope);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [working, setWorking] = useState<StageLayout | null>(null);
  const snapshotRef = useRef<StageLayout | null>(null);
  const pausedByEditRef = useRef(false);
  const workingRef = useRef<StageLayout | null>(null);
  const selectedRef = useRef<string | null>(null);
  const editingRef = useRef(false);

  workingRef.current = working;
  selectedRef.current = selectedKey;
  editingRef.current = editing;

  const paintWorking = useCallback(() => {
    paintHostStageLayout(workingRef.current);
  }, []);

  const setApplyScope = useCallback((scope: LayoutApplyScope) => {
    lastApplyScope = scope;
    setApplyScopeState(scope);
  }, []);

  const enter = useCallback(() => {
    const solo = opts.soloRef.current;
    if (!solo.on || !editableStagePhase(solo.phase)) return;
    if (!solo.paused) {
      solo.paused = true;
      solo.pausedRemainingMs = remainingMs(solo.phaseDeadlineAt);
      solo.phaseDeadlineAt = null;
      opts.bgmPause();
      opts.setSoloPausedLabel('Продолжить');
      pausedByEditRef.current = true;
    } else {
      pausedByEditRef.current = false;
    }
    const q = opts.getQuestion();
    const saved = layoutFromView(solo.phase, q);
    snapshotRef.current = saved;
    const center = hostStageCenter();
    const next = center ? materializeStageLayout(center, saved) : saved;
    workingRef.current = next;
    setWorking(next);
    setDirty(false);
    setSelectedKey(null);
    if (center) center.classList.add('stage-center--editing');
    setEditing(true);
    requestAnimationFrame(() => {
      paintHostStageLayout(next);
    });
  }, [opts]);

  const exitEdit = useCallback(
    (restore: StageLayout | null) => {
      setEditing(false);
      setDirty(false);
      setSelectedKey(null);
      workingRef.current = restore;
      setWorking(restore);
      const solo = opts.soloRef.current;
      if (pausedByEditRef.current && solo.paused) {
        soloResumeAfterPause(solo);
        opts.bgmResume();
        opts.setSoloPausedLabel('Пауза');
      }
      pausedByEditRef.current = false;
      opts.rerender();
      requestAnimationFrame(() => paintHostStageLayout(restore));
    },
    [opts],
  );

  const cancel = useCallback(() => {
    if (dirty && !window.confirm('Сбросить несохранённые изменения раскладки?')) return false;
    exitEdit(snapshotRef.current);
    return true;
  }, [dirty, exitEdit]);

  const save = useCallback(async () => {
    const solo = opts.soloRef.current;
    const phase = solo.phase;
    const screen = layoutScreenForPhase(phase);
    const q = opts.getQuestion();
    const id = q?.id;
    const layout = workingRef.current;
    const scope = lastApplyScope;
    if (scope === 'all') {
      const confirmMsg =
        screen === 'round_intro'
          ? 'Применить раскладку ко всем заставкам раундов?'
          : screen === 'quiz_intro'
            ? 'Применить раскладку заставки квиза?'
            : 'Применить раскладку ко всем экранам квиза?';
      if (!window.confirm(confirmMsg)) return;
    }
    if (opts.persistLayout) {
      try {
        const saved = await opts.persistLayout(layout, scope, screen);
        writeLayoutToSolo(solo, phase, saved);
        snapshotRef.current = saved;
        exitEdit(saved);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Не удалось сохранить раскладку');
      }
      return;
    }
    try {
      if (screen === 'quiz_intro') {
        const quizId = (solo.quizId || q?.quizId || '').trim();
        if (!isQuestionUuid(quizId)) {
          toast('Сначала сохраните квиз в конструкторе');
          return;
        }
        const saved = await patchQuizLayout(quizId, layout);
        writeLayoutToSolo(solo, phase, saved);
        snapshotRef.current = saved;
        exitEdit(saved);
        return;
      }
      if (screen === 'round_intro') {
        if (scope === 'all') {
          const rounds = (solo.payload?.rounds || []).filter((r) => isQuestionUuid(r.id));
          if (!rounds.length) {
            toast('Сначала сохраните квиз в конструкторе');
            return;
          }
          let applied = layout;
          for (const r of rounds) {
            const saved = await patchRoundLayout(r.id!, layout);
            r.stageLayout = saved;
            if (r === solo.payload?.rounds?.[solo.roundIdx]) applied = saved;
          }
          snapshotRef.current = applied;
          exitEdit(applied);
          return;
        }
        const roundId = (q?.roundId || solo.payload?.rounds?.[solo.roundIdx]?.id || '').trim();
        if (!isQuestionUuid(roundId)) {
          toast('Сначала сохраните квиз в конструкторе');
          return;
        }
        const saved = await patchRoundLayout(roundId, layout);
        writeLayoutToSolo(solo, phase, saved);
        snapshotRef.current = saved;
        exitEdit(saved);
        return;
      }
      if (!isQuestionUuid(id)) {
        toast('Сначала сохраните квиз в конструкторе');
        return;
      }
      if (scope === 'all') {
        const source = soloCurrentQuestion(solo);
        const from = source ? soloQuestionLayoutIds(source) : { optionIds: [], matchLeftIds: [], matchRightIds: [] };
        const targets = soloAllQuestions(solo).filter((item) => isQuestionUuid(item.id));
        if (!targets.length) {
          toast('Сначала сохраните квиз в конструкторе');
          return;
        }
        let applied = layout;
        for (const item of targets) {
          const copied =
            item.id === id ? layout : copyStageLayoutToTarget(layout, from, soloQuestionLayoutIds(item));
          const saved = await patchQuestionLayout(item.id!, copied);
          item.stageLayout = saved;
          patchStoredDraftStageLayout(item.id!, saved);
          if (item.id === id) applied = saved;
        }
        snapshotRef.current = applied;
        exitEdit(applied);
        return;
      }
      const saved = await patchQuestionLayout(id, layout);
      writeLayoutToSolo(solo, phase, saved);
      patchStoredDraftStageLayout(id, saved);
      snapshotRef.current = saved;
      exitEdit(saved);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сохранить раскладку');
    }
  }, [exitEdit, opts]);

  const reset = useCallback(async () => {
    const solo = opts.soloRef.current;
    const phase = solo.phase;
    const screen = layoutScreenForPhase(phase);
    const scope = lastApplyScope;
    const confirmMsg =
      scope === 'all'
        ? screen === 'round_intro'
          ? 'Сбросить раскладку всех заставок раундов к шаблону?'
          : 'Сбросить раскладку всех экранов к шаблону?'
        : 'Сбросить раскладку этого экрана к шаблону?';
    if (!window.confirm(confirmMsg)) return;
    if (opts.persistLayout) {
      try {
        const saved = await opts.persistLayout(null, scope, screen);
        writeLayoutToSolo(solo, phase, saved);
        snapshotRef.current = saved;
        exitEdit(saved);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Не удалось сбросить раскладку');
      }
      return;
    }
    const q = opts.getQuestion();
    const id = q?.id;
    try {
      if (screen === 'quiz_intro') {
        const quizId = (solo.quizId || q?.quizId || '').trim();
        if (!isQuestionUuid(quizId)) {
          toast('Сначала сохраните квиз в конструкторе');
          return;
        }
        await patchQuizLayout(quizId, null);
        writeLayoutToSolo(solo, phase, null);
        snapshotRef.current = null;
        exitEdit(null);
        return;
      }
      if (screen === 'round_intro') {
        if (scope === 'all') {
          const rounds = (solo.payload?.rounds || []).filter((r) => isQuestionUuid(r.id));
          if (!rounds.length) {
            toast('Сначала сохраните квиз в конструкторе');
            return;
          }
          for (const r of rounds) {
            await patchRoundLayout(r.id!, null);
            r.stageLayout = null;
          }
          snapshotRef.current = null;
          exitEdit(null);
          return;
        }
        const roundId = (q?.roundId || solo.payload?.rounds?.[solo.roundIdx]?.id || '').trim();
        if (!isQuestionUuid(roundId)) {
          toast('Сначала сохраните квиз в конструкторе');
          return;
        }
        await patchRoundLayout(roundId, null);
        writeLayoutToSolo(solo, phase, null);
        snapshotRef.current = null;
        exitEdit(null);
        return;
      }
      if (!isQuestionUuid(id)) {
        toast('Сначала сохраните квиз в конструкторе');
        return;
      }
      if (scope === 'all') {
        const targets = soloAllQuestions(solo).filter((item) => isQuestionUuid(item.id));
        if (!targets.length) {
          toast('Сначала сохраните квиз в конструкторе');
          return;
        }
        for (const item of targets) {
          await patchQuestionLayout(item.id!, null);
          item.stageLayout = null;
          patchStoredDraftStageLayout(item.id!, null);
        }
        snapshotRef.current = null;
        exitEdit(null);
        return;
      }
      await patchQuestionLayout(id, null);
      writeLayoutToSolo(solo, phase, null);
      patchStoredDraftStageLayout(id, null);
      snapshotRef.current = null;
      exitEdit(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сбросить раскладку');
    }
  }, [exitEdit, opts]);

  const patchSelected = useCallback((patch: Partial<StageBox>) => {
    const key = selectedRef.current;
    const layout = workingRef.current;
    if (!key || !layout) return;
    const cur = boxForKey(layout, key);
    if (!cur) return;
    const el = hostStageCenter()?.querySelector(`[data-stage-key="${CSS.escape(key)}"]`);
    const painted = el instanceof HTMLElement ? readComputedBoxStyle(el) : {};
    const strokeTouched = 'strokeColor' in patch || 'strokeWidth' in patch;
    const keepStroke =
      !strokeTouched && painted.strokeColor && painted.strokeWidth
        ? { strokeColor: painted.strokeColor, strokeWidth: painted.strokeWidth }
        : {};
    const merged: Record<string, unknown> = { ...cur, ...keepStroke, ...patch };
    if ('fontFamily' in patch && !patch.fontFamily) delete merged.fontFamily;
    const nextBox = parseStageBox(merged);
    if (!nextBox) return;
    let next = setBoxForKey(layout, key, nextBox);
    next = nudgeBoxesBelowChanged(next, key, cur, nextBox);
    workingRef.current = next;
    setWorking(next);
    setDirty(true);
    paintHostStageLayout(next);
    const fontTouched =
      ('fontSize' in patch && patch.fontSize !== cur.fontSize) ||
      ('fontFamily' in patch && (patch.fontFamily || undefined) !== (cur.fontFamily || undefined)) ||
      ('fontWeight' in patch && patch.fontWeight !== cur.fontWeight);
    const center = hostStageCenter();
    const paintedEl =
      center?.querySelector(`[data-stage-key="${CSS.escape(key)}"]`) ??
      (el instanceof HTMLElement ? el : null);
    if (fontTouched && center && paintedEl instanceof HTMLElement) {
      const fitted = fitTextBoxAfterFontChange(
        next,
        key,
        nextBox,
        paintedEl,
        center.getBoundingClientRect(),
      );
      if (fitted !== next) {
        next = fitted;
        workingRef.current = next;
        setWorking(next);
        paintHostStageLayout(next);
      }
    }
  }, []);

  const applySelectedSizeToImages = useCallback(() => {
    const center = hostStageCenter();
    const layout = workingRef.current;
    const key = selectedRef.current;
    if (!center || !layout || !key) return;
    const source = boxForKey(layout, key);
    if (!source) return;
    const keys = imageSlotKeysFromStage(center).filter((k) => k !== key);
    if (!keys.length) return;
    const next = copyBoxSizeToKeys(layout, source, keys);
    workingRef.current = next;
    setWorking(next);
    setDirty(true);
    paintHostStageLayout(next);
  }, []);

  useEffect(() => {
    if (!editing) return;
    const center = hostStageCenter();
    if (!center) return;
    center.classList.add('stage-center--editing');

    const onDown = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('.host-layout-inspector')) return;
      const handle = t.closest('[data-resize]') as HTMLElement | null;
      const slot = t.closest('[data-stage-key]') as HTMLElement | null;
      if (!handle && !slot) {
        setSelectedKey(null);
        return;
      }
      if (slot && !handle) {
        const key = slot.getAttribute('data-stage-key');
        setSelectedKey(key);
        selectedRef.current = key;
      }
      const key = (handle?.closest('[data-stage-key]') || slot)?.getAttribute('data-stage-key');
      if (!key) return;
      const dir = handle?.getAttribute('data-resize') as ResizeDir | null;
      const startX = ev.clientX;
      const startY = ev.clientY;
      let startLayout = workingRef.current;
      let startBox = startLayout ? boxForKey(startLayout, key) : undefined;
      if (startLayout && !startBox) {
        const measured = pctBoxFromRects(
          center.getBoundingClientRect(),
          (handle?.closest('[data-stage-key]') || slot)!.getBoundingClientRect(),
        );
        if (measured) {
          startLayout = setBoxForKey(startLayout, key, measured);
          startBox = measured;
          workingRef.current = startLayout;
          setWorking(startLayout);
        }
      }
      if (!startLayout || !startBox) return;
      ev.preventDefault();
      (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
      const onMove = (e: PointerEvent) => {
        const parent = center.getBoundingClientRect();
        const { dxPct, dyPct } = pxDeltaToPct(e.clientX - startX, e.clientY - startY, parent);
        const raw = dir ? resizeBox(startBox, dir, dxPct, dyPct) : moveBox(startBox, dxPct, dyPct);
        const snapped = dir
          ? { box: raw, guides: [] as SnapGuide[] }
          : snapBoxToTargets(raw, collectSnapTargets(startLayout, key), snapThresholdPct(parent));
        const nextBox = snapped.box;
        let next = setBoxForKey(startLayout, key, nextBox);
        next = nudgeBoxesBelowChanged(next, key, startBox, nextBox);
        workingRef.current = next;
        setWorking(next);
        setDirty(true);
        paintHostStageLayout(next);
        paintHandles(center, key);
        paintGuides(center, snapped.guides);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        clearGuides(center);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    center.addEventListener('pointerdown', onDown);
    return () => {
      center.removeEventListener('pointerdown', onDown);
      center.classList.remove('stage-center--editing');
      center.querySelectorAll('.host-layout-handle').forEach((n) => n.remove());
      clearGuides(center);
    };
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const center = hostStageCenter();
    if (center) paintHandles(center, selectedKey);
  }, [editing, selectedKey, working]);

  const canEdit =
    opts.soloRef.current.on &&
    editableStagePhase(opts.soloRef.current.phase) &&
    (!!opts.persistLayout || !!getAccessToken());

  const selectedBox = (() => {
    if (!selectedKey || !working) return null;
    const box = boxForKey(working, selectedKey);
    if (!box) return null;
    const el = hostStageCenter()?.querySelector(`[data-stage-key="${CSS.escape(selectedKey)}"]`);
    return displayBoxForInspector(box, el instanceof HTMLElement ? el : null);
  })();

  return {
    editing,
    dirty,
    applyScope,
    selectedKey,
    selectedBox,
    working,
    canEdit,
    editingRef,
    enter,
    cancel,
    save,
    reset,
    patchSelected,
    applySelectedSizeToImages,
    paintWorking,
    setApplyScope,
  };
}

function paintHandles(center: HTMLElement, selectedKey: string | null) {
  center.querySelectorAll('.host-layout-handle').forEach((n) => n.remove());
  center.querySelectorAll('.host-layout-selected').forEach((n) => n.classList.remove('host-layout-selected'));
  if (!selectedKey) return;
  const el = center.querySelector(`[data-stage-key="${CSS.escape(selectedKey)}"]`) as HTMLElement | null;
  if (!el) return;
  el.classList.add('host-layout-selected');
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  for (const dir of RESIZE_DIRS) {
    const h = document.createElement('div');
    h.className = `host-layout-handle host-layout-handle--${dir}`;
    h.setAttribute('data-resize', dir);
    el.appendChild(h);
  }
}

function clearGuides(center: HTMLElement) {
  center.querySelectorAll('.host-layout-guide').forEach((n) => n.remove());
}

function paintGuides(center: HTMLElement, guides: SnapGuide[]) {
  clearGuides(center);
  for (const g of guides) {
    const line = document.createElement('div');
    line.className = `host-layout-guide host-layout-guide--${g.axis}`;
    line.setAttribute('aria-hidden', 'true');
    if (g.axis === 'x') line.style.left = `${g.at}%`;
    else line.style.top = `${g.at}%`;
    center.appendChild(line);
  }
}
