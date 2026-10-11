import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Request, Response, NextFunction } from 'express';

const EXCLUDE_PREFIXES = ['/api', '/metrics', '/socket.io', '/uploads', '/health', '/ip'];

function isExcluded(path: string): boolean {
  return EXCLUDE_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

export function spaFallback(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  const path = req.path || '/';
  if (isExcluded(path)) {
    next();
    return;
  }
  const lastSeg = path.split('/').pop() || '';
  if (lastSeg.includes('.')) {
    next();
    return;
  }
  const accept = String(req.headers.accept || '');
  if (accept && !accept.includes('text/html') && !accept.includes('*/*')) {
    next();
    return;
  }
  const indexPath = join(process.cwd(), 'web', 'dist', 'index.html');
  if (!existsSync(indexPath)) {
    res.status(503).json({
      error: {
        code: 'INTERNAL',
        message: 'web/dist missing — run npm run build',
      },
    });
    return;
  }
  // index.html must never be cached by the browser: it references content-hashed
  // JS/CSS bundles, so a stale cached copy would keep running an outdated build
  // (e.g. after `npm run build` on restart). The hashed assets stay cacheable.
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.type('html').send(readFileSync(indexPath, 'utf8'));
}
