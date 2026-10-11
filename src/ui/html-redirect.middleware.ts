import type { Request, Response, NextFunction } from 'express';

const HTML_REDIRECTS: Record<string, string> = {
  '/login.html': '/login',
  '/quizzes.html': '/quizzes',
  '/builder.html': '/builder',
  '/host.html': '/host',
  '/player.html': '/player',
  '/preview-host.html': '/preview-host',
  '/index.html': '/',
};

export function htmlRedirect(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  const dest = HTML_REDIRECTS[req.path];
  if (dest == null) {
    next();
    return;
  }
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(302, dest + q);
}
