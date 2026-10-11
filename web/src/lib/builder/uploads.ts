import { apiFetch, withAuth } from '../api';
import { getAccessToken } from '../auth';

export async function uploadAudioFileToServer(
  file: File,
  onNeedLogin: () => void,
): Promise<string> {
  if (!file) throw new Error('Нет файла');
  if (!getAccessToken()) {
    onNeedLogin();
    throw new Error('unauthorized');
  }
  const fd = new FormData();
  fd.append('file', file, file.name || 'track.mp3');
  const data = await apiFetch<{ url?: string }>('/api/quizzes/upload/audio', {
    method: 'POST',
    headers: withAuth({}),
    body: fd,
  });
  const url = data && data.url ? String(data.url) : '';
  if (!url) throw new Error('Сервер не вернул url');
  return url;
}

export async function uploadVideoFileToServer(
  file: File,
  onNeedLogin: () => void,
): Promise<string> {
  if (!file) throw new Error('Нет файла');
  if (!getAccessToken()) {
    onNeedLogin();
    throw new Error('unauthorized');
  }
  const fd = new FormData();
  fd.append('file', file, file.name || 'clip.mp4');
  const data = await apiFetch<{ url?: string }>('/api/quizzes/upload/video', {
    method: 'POST',
    headers: withAuth({}),
    body: fd,
  });
  const url = data && data.url ? String(data.url) : '';
  if (!url) throw new Error('Сервер не вернул url');
  return url;
}
