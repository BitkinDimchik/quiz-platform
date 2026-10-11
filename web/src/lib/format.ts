export function formatMs(ms: number): string {
  if (ms <= 0) return '0.0s';
  return `${(ms / 1000).toFixed(1)}s`;
}

export function remainingMs(deadlineAt: string | null | undefined): number | null {
  if (!deadlineAt) return null;
  const t = new Date(deadlineAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, t - Date.now());
}

export function optionLetterForIndex(idx: number): string {
  const n = Number(idx);
  if (!Number.isFinite(n) || n < 0) return 'A';
  if (n < 26) return String.fromCharCode(65 + n);
  return String(n + 1);
}

export function stripOptionLetterPrefix(label: string): string {
  const s = String(label || '').trim();
  if (!s) return '';
  // Only "A)", "B.", "В:" style markers — not real words like "В честь" / "A cat".
  return s.replace(/^([A-DА-Г])\s*[).:]\s+/iu, '').trim();
}

export function formatOptionDisplayLabel(label: string, idx: number): string {
  const text = stripOptionLetterPrefix(label);
  if (!text) return '';
  return `${optionLetterForIndex(idx)}) ${text}`;
}
