/** Encode emoji as avatarUrl value stored on the player. */
export function emojiAvatarUrl(emoji: string): string {
  return `emoji:${emoji}`;
}

export function isEmojiAvatarUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith('emoji:');
}

export function emojiFromAvatarUrl(url: string | null | undefined): string | null {
  if (!isEmojiAvatarUrl(url)) return null;
  const e = String(url).slice('emoji:'.length).trim();
  return e || null;
}

export function isImageAvatarUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (isEmojiAvatarUrl(url)) return false;
  return (
    url.startsWith('/uploads/avatar/') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:image/')
  );
}
