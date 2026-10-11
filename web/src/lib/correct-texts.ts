/** On stage/player reveal, show only the first accepted text. Grading still uses the full list. */
export function visibleCorrectTexts(texts: Array<string | null | undefined> | null | undefined): string[] {
  for (const raw of texts || []) {
    const t = String(raw || '').trim();
    if (t) return [t];
  }
  return [];
}
