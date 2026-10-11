import { clearViewportRoundBg } from '../stage/round-bg';

/** Классы, которые конструктор вешает на body на время полноэкранного предпросмотра. */
export const BUILDER_PREVIEW_BODY_CLASSES = ['preview-fullscreen', 'host', 'host-quiz-viewing'] as const;

export function enterBuilderPreviewBody(): void {
  document.body.classList.add(...BUILDER_PREVIEW_BODY_CLASSES);
}

/**
 * Снять классы предпросмотра и полноэкранный фон раунда.
 * Иначе `body.viewport-round-active { overflow: hidden }` остаётся и вкладки
 * без внутренней прокрутки (Шрифты, Квиз) перестают листаться.
 */
export function exitBuilderPreviewBody(): void {
  document.body.classList.remove(...BUILDER_PREVIEW_BODY_CLASSES);
  clearViewportRoundBg();
}
