import { apiFetch, withAuth } from '../api';
import { getAccessToken } from '../auth';
import { imageFileFromDataUrl } from './clipboard-image';

/** Текст в буфер ОС на машине с сервером — когда браузер режет clipboard по HTTP. */
export async function writeTextToServerClipboard(text: string): Promise<boolean> {
  if (!getAccessToken()) return false;
  try {
    const data = await apiFetch<{ ok?: boolean }>('/api/quizzes/clipboard-text', {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text }),
    });
    return !!data?.ok;
  } catch {
    return false;
  }
}

/** Картинка из буфера ОС на машине с сервером — работает и по http://192.168.x.x. */
export async function readImageFileFromServerClipboard(): Promise<File | null> {
  if (!getAccessToken()) return null;
  try {
    const data = await apiFetch<{ dataUrl?: string | null }>('/api/quizzes/clipboard-image', {
      method: 'POST',
      headers: withAuth({}),
    });
    if (!data?.dataUrl) return null;
    return imageFileFromDataUrl(data.dataUrl);
  } catch {
    return null;
  }
}
