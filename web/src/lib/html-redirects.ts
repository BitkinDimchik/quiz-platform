export const HTML_REDIRECTS: Record<string, string> = {
  '/login.html': '/login',
  '/connect.html': '/connect',
  '/quizzes.html': '/quizzes',
  '/builder.html': '/builder',
  '/host.html': '/host',
  '/player.html': '/player',
  '/preview-host.html': '/preview-host',
  '/index.html': '/',
};

export function htmlPathToCanonical(pathname: string, search = ''): string | null {
  const dest = HTML_REDIRECTS[pathname];
  if (dest == null) return null;
  return dest + search;
}
