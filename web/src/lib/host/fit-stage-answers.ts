const IMG_MIN = 72;
const IMG_START = 250;
const IMG_MAX = 380;
const IMG_STEP = 8;
/** Legacy max when quiz has no --stage-answers-font-size from the builder. */
const FONT_MAX_DEFAULT = 22;
const FONT_MIN = 14;
const MEDIA_MIN = 140;
const MEDIA_START = 280;
const MEDIA_MAX = 360;
const MEDIA_STEP = 10;
const EXPL_MIN = 180;
const EXPL_START = 360;
const EXPL_MAX = 560;
const EXPL_STEP = 16;
const PAD_BOTTOM = 16;

export function answerColOptions(count: number): number[] {
  if (count <= 1) return [1];
  if (count === 2) return [2];
  if (count === 3) return [3, 2];
  if (count === 4) return [2, 4];
  if (count === 5) return [3, 5];
  if (count === 6) return [3, 2, 6];
  return [3, 2, Math.min(count, 4)];
}

/** Visible bottom of the stage — ignores a parent that only wraps overflowing tiles. */
export function stageClipBottom(stageCenter: HTMLElement, answers?: HTMLElement, pad = PAD_BOTTOM): number {
  const centerRect = stageCenter.getBoundingClientRect();
  const card = stageCenter.closest('#stageCard');
  const cardRect = card instanceof HTMLElement ? card.getBoundingClientRect() : null;
  let clip = Math.min(centerRect.bottom, cardRect?.bottom ?? Number.POSITIVE_INFINITY, window.innerHeight);
  if (!answers) return clip;
  const box = answers.getBoundingClientRect();
  const wrapsContent =
    Math.abs(centerRect.bottom - box.bottom) <= pad + 1 &&
    (cardRect == null || Math.abs(cardRect.bottom - box.bottom) <= pad + 1);
  return wrapsContent ? window.innerHeight : clip;
}

export function answersOverflowPx(answers: HTMLElement, stageCenter: HTMLElement, pad = PAD_BOTTOM): number {
  const box = answers.getBoundingClientRect();
  const clipBottom = stageClipBottom(stageCenter, answers, pad);
  const available = clipBottom - box.top - pad;
  if (!(available > 0)) return answers.scrollHeight + pad;
  const byScroll = answers.scrollHeight - available;
  const byBox = box.bottom - (clipBottom - pad);
  return Math.max(byScroll, byBox);
}

function clearFit(stageCenter: HTMLElement, answers: HTMLElement) {
  delete answers.dataset.cols;
  answers.style.removeProperty('--stage-answer-img-max-h');
  answers.style.removeProperty('--stage-answer-font');
  stageCenter.style.removeProperty('--stage-media-max-h');
  stageCenter.style.removeProperty('--stage-expl-img-max-h');
}

/** Prefer builder `--stage-answers-font-size`; fall back to legacy auto-fit max. */
export function preferredAnswerFontMaxPx(el: HTMLElement = document.documentElement): number {
  const raw =
    el.style.getPropertyValue('--stage-answers-font-size').trim() ||
    getComputedStyle(el).getPropertyValue('--stage-answers-font-size').trim();
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return Math.min(96, Math.max(FONT_MIN, n));
  return FONT_MAX_DEFAULT;
}

function hasExplanationImage(stageCenter: HTMLElement): boolean {
  return (
    stageCenter.getAttribute('data-stage-swap') === 'explanation' &&
    !!stageCenter.querySelector('#stageExplanationImage img.host-stage__explanation-img')
  );
}

function hasVisibleQuestionMedia(stageCenter: HTMLElement): boolean {
  if (stageCenter.getAttribute('data-stage-swap') === 'explanation') return false;
  const media = stageCenter.querySelector<HTMLElement>('#stageMedia');
  if (!media || media.style.display === 'none') return false;
  return !!media.querySelector('img, video, iframe');
}

function overflows(answers: HTMLElement, stageCenter: HTMLElement): boolean {
  return answersOverflowPx(answers, stageCenter) > 1;
}

function readPx(el: HTMLElement, prop: string, fallback: number): number {
  const n = Number.parseInt(el.style.getPropertyValue(prop) || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function tryGrow(
  answers: HTMLElement,
  stageCenter: HTMLElement,
  target: HTMLElement,
  prop: string,
  current: number,
  max: number,
  step: number,
): number {
  if (current + step > max) return current;
  target.style.setProperty(prop, `${current + step}px`);
  if (overflows(answers, stageCenter)) {
    target.style.setProperty(prop, `${current}px`);
    return current;
  }
  return current + step;
}

function growWhileFits(
  answers: HTMLElement,
  stageCenter: HTMLElement,
  target: HTMLElement,
  prop: string,
  start: number,
  max: number,
  step: number,
): number {
  let h = start;
  target.style.setProperty(prop, `${h}px`);
  while (true) {
    const next = tryGrow(answers, stageCenter, target, prop, h, max, step);
    if (next === h) break;
    h = next;
  }
  return h;
}

/** Pack answer tiles into the visible stage: keep them large, add columns / shrink only if needed. */
export function fitStageAnswers(stageCenter: HTMLElement): void {
  const answers = stageCenter.querySelector<HTMLElement>('#stageAnswers.grid-answers');
  if (!answers) return;
  clearFit(stageCenter, answers);
  if (stageCenter.classList.contains('stage-center--editing')) return;
  if (answers.querySelector('[data-stage-applied]')) return;
  const count = answers.querySelectorAll('.answer').length;
  if (!count) return;
  answers.dataset.count = String(count);

  const visual = answers.classList.contains('grid-answers--visual');
  const hasMedia = hasVisibleQuestionMedia(stageCenter);
  const hasExpl = hasExplanationImage(stageCenter);
  if (hasMedia) {
    stageCenter.style.setProperty('--stage-media-max-h', `${MEDIA_START}px`);
  }
  if (hasExpl) {
    stageCenter.style.setProperty('--stage-expl-img-max-h', `${EXPL_START}px`);
  }
  if (visual) {
    answers.style.setProperty('--stage-answer-img-max-h', `${IMG_START}px`);
  }

  const options = answerColOptions(count);
  let bestCols = options[0];
  let bestOverflow = Number.POSITIVE_INFINITY;
  let fitted = false;
  for (const cols of options) {
    answers.dataset.cols = String(cols);
    const extra = answersOverflowPx(answers, stageCenter);
    if (extra <= 1) {
      fitted = true;
      bestCols = cols;
      break;
    }
    if (extra < bestOverflow) {
      bestOverflow = extra;
      bestCols = cols;
    }
  }
  answers.dataset.cols = String(bestCols);

  if (visual && !fitted) {
    for (let h = IMG_START; h >= IMG_MIN; h -= IMG_STEP) {
      answers.style.setProperty('--stage-answer-img-max-h', `${h}px`);
      if (!overflows(answers, stageCenter)) {
        fitted = true;
        break;
      }
    }
  }
  if (!visual && !fitted) {
    const fontMax = preferredAnswerFontMaxPx();
    for (let f = fontMax; f >= FONT_MIN; f -= 1) {
      answers.style.setProperty('--stage-answer-font', `${f}px`);
      if (!overflows(answers, stageCenter)) {
        fitted = true;
        break;
      }
    }
  }
  if (hasMedia && !fitted) {
    for (let m = MEDIA_START; m >= MEDIA_MIN; m -= MEDIA_STEP) {
      stageCenter.style.setProperty('--stage-media-max-h', `${m}px`);
      if (!overflows(answers, stageCenter)) {
        fitted = true;
        break;
      }
    }
  }
  if (hasExpl && !fitted) {
    for (let h = EXPL_START; h >= EXPL_MIN; h -= EXPL_STEP) {
      stageCenter.style.setProperty('--stage-expl-img-max-h', `${h}px`);
      if (!overflows(answers, stageCenter)) {
        fitted = true;
        break;
      }
    }
  }

  if (overflows(answers, stageCenter)) return;

  if (visual && hasMedia) {
    let imgH = readPx(answers, '--stage-answer-img-max-h', IMG_START);
    let mediaH = readPx(stageCenter, '--stage-media-max-h', MEDIA_START);
    for (;;) {
      const nextImg = tryGrow(
        answers,
        stageCenter,
        answers,
        '--stage-answer-img-max-h',
        imgH,
        IMG_MAX,
        IMG_STEP,
      );
      const nextMedia = tryGrow(
        answers,
        stageCenter,
        stageCenter,
        '--stage-media-max-h',
        mediaH,
        MEDIA_MAX,
        MEDIA_STEP,
      );
      if (nextImg === imgH && nextMedia === mediaH) break;
      imgH = nextImg;
      mediaH = nextMedia;
    }
    return;
  }
  if (visual) {
    growWhileFits(
      answers,
      stageCenter,
      answers,
      '--stage-answer-img-max-h',
      readPx(answers, '--stage-answer-img-max-h', IMG_START),
      IMG_MAX,
      IMG_STEP,
    );
  }
  if (hasMedia) {
    growWhileFits(
      answers,
      stageCenter,
      stageCenter,
      '--stage-media-max-h',
      readPx(stageCenter, '--stage-media-max-h', MEDIA_START),
      MEDIA_MAX,
      MEDIA_STEP,
    );
  }
  if (hasExpl) {
    growWhileFits(
      answers,
      stageCenter,
      stageCenter,
      '--stage-expl-img-max-h',
      readPx(stageCenter, '--stage-expl-img-max-h', EXPL_START),
      EXPL_MAX,
      EXPL_STEP,
    );
  }
}

export function scheduleFitStageAnswers(stageCenter: HTMLElement | null): void {
  if (!stageCenter) return;
  const run = () => fitStageAnswers(stageCenter);
  requestAnimationFrame(run);
  stageCenter
    .querySelectorAll<HTMLImageElement>(
      '#stageAnswers img, #stageMedia img, #stageExplanationImage img',
    )
    .forEach((img) => {
      if (!img.complete) img.addEventListener('load', run, { once: true });
    });
}
