import { emojiFromAvatarUrl, isImageAvatarUrl } from '../lib/player/avatar';

function safeUpperFirstLetter(s: string): string {
  const t = String(s || '').trim();
  if (!t) return '?';
  return t.slice(0, 1).toUpperCase();
}

export function PlayerAvatarFace({
  avatarUrl,
  displayName,
  className = 'avatar',
}: {
  avatarUrl?: string | null;
  displayName?: string | null;
  className?: string;
}) {
  const emoji = emojiFromAvatarUrl(avatarUrl);
  if (emoji) {
    return (
      <div className={className} title={displayName || undefined}>
        <span className="avatar__emoji" aria-hidden>
          {emoji}
        </span>
      </div>
    );
  }
  if (isImageAvatarUrl(avatarUrl)) {
    return (
      <div className={className} title={displayName || undefined}>
        <img src={avatarUrl!} alt="" />
      </div>
    );
  }
  return (
    <div className={className} title={displayName || undefined}>
      <span className="avatar__letter">{safeUpperFirstLetter(displayName || '?')}</span>
    </div>
  );
}
