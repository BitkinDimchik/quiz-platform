export function isStageIntroPhase(phase: string | null | undefined): boolean {
  return phase === 'quiz_intro' || phase === 'round_intro';
}
