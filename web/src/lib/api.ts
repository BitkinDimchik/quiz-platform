import { clearSession, withAuth } from './auth';

export type ApiError = Error & { status?: number; code?: string };

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit & { headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.body != null && headers['Content-Type'] == null && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, { cache: 'no-store', ...opts, headers });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text();
  if (
    res.ok &&
    path.startsWith('/api/') &&
    typeof data === 'string' &&
    (ct.includes('text/html') || String(data).trimStart().startsWith('<!'))
  ) {
    const err = new Error('Сервер API недоступен — перезапустите backend') as ApiError;
    err.status = 503;
    throw err;
  }
  if (!res.ok) {
    if (res.status === 401 && headers['Authorization']) {
      clearSession();
    }
    const msg =
      (data && data.error && data.error.message) ||
      (data && data.message) ||
      (typeof data === 'string' ? data : `HTTP ${res.status}`);
    const err = new Error(msg) as ApiError;
    err.status = res.status;
    if (data && data.error && data.error.code) err.code = data.error.code;
    throw err;
  }
  return data as T;
}

export { withAuth };
