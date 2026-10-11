const ACCESS_TOKEN_KEY = 'QUIZ_ACCESS_TOKEN';
const CURRENT_USER_ID_KEY = 'QUIZ_USER_ID';
const USER_EMAIL_KEY = 'QUIZ_USER_EMAIL';
const USER_DISPLAY_KEY = 'QUIZ_USER_DISPLAY';

let sessionReadyPromise: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyAuth() {
  listeners.forEach((fn) => fn());
}

export function getAccessToken(): string {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

export function setAccessToken(token: string) {
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    sessionReadyPromise = null;
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
  notifyAuth();
}

export function setCurrentUserId(id: string) {
  if (id) localStorage.setItem(CURRENT_USER_ID_KEY, id);
  else localStorage.removeItem(CURRENT_USER_ID_KEY);
}

export function getCurrentUserId(): string {
  return localStorage.getItem(CURRENT_USER_ID_KEY) || '';
}

export function setUserProfile(email: string, displayName: string) {
  if (email) localStorage.setItem(USER_EMAIL_KEY, email);
  else localStorage.removeItem(USER_EMAIL_KEY);
  if (displayName) localStorage.setItem(USER_DISPLAY_KEY, displayName);
  else localStorage.removeItem(USER_DISPLAY_KEY);
  notifyAuth();
}

export function getUserEmail(): string {
  return localStorage.getItem(USER_EMAIL_KEY) || '';
}

export function getUserDisplayName(): string {
  return localStorage.getItem(USER_DISPLAY_KEY) || '';
}

export function getUserInitialLetter(): string {
  const s = getUserDisplayName().trim() || getUserEmail().trim();
  if (!s) return '?';
  const ch = Array.from(s)[0];
  return ch ? ch.toUpperCase() : '?';
}

export function clearSession() {
  setAccessToken('');
  setCurrentUserId('');
  localStorage.removeItem(USER_EMAIL_KEY);
  localStorage.removeItem(USER_DISPLAY_KEY);
  sessionReadyPromise = null;
  notifyAuth();
}

export function withAuth(headers: Record<string, string> = {}): Record<string, string> {
  const t = getAccessToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  return headers;
}

export async function ensureSession(): Promise<boolean> {
  const t = getAccessToken();
  if (!t) {
    sessionReadyPromise = null;
    return false;
  }
  if (!sessionReadyPromise) {
    sessionReadyPromise = (async () => {
      try {
        const res = await fetch('/api/auth/me', { headers: withAuth({}) });
        if (!res.ok) {
          if (res.status === 401) clearSession();
          return false;
        }
        const data = await res.json().catch(() => null);
        if (!data || !data.userId) {
          clearSession();
          return false;
        }
        setCurrentUserId(data.userId);
        setUserProfile(data.email || '', (data.displayName && String(data.displayName).trim()) || '');
        return true;
      } catch {
        return Boolean(getAccessToken());
      }
    })();
  }
  return sessionReadyPromise;
}

export function whenSessionReady(): Promise<boolean> {
  return ensureSession().then((ok) => ok && Boolean(getAccessToken()));
}
