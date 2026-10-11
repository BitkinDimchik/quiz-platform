import { apiFetch, withAuth } from '../api';
import { getAccessToken } from '../auth';

/** Шрифты, установленные на машине с сервером (включая нестандартные). */
export async function fetchSystemFontFamilies(refresh = false): Promise<string[]> {
  if (!getAccessToken()) return [];
  try {
    const res = await apiFetch<{ families?: string[] }>(
      `/api/fonts/system${refresh ? '?refresh=1' : ''}`,
      { headers: withAuth({}) },
    );
    return Array.isArray(res?.families) ? res.families.filter((f) => typeof f === 'string') : [];
  } catch {
    return [];
  }
}
