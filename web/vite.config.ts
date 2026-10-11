import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const HTML_REDIRECTS: Record<string, string> = {
  '/login.html': '/login',
  '/quizzes.html': '/quizzes',
  '/builder.html': '/builder',
  '/host.html': '/host',
  '/player.html': '/player',
  '/preview-host.html': '/preview-host',
  '/index.html': '/',
};

function htmlRedirectPlugin(): Plugin {
  return {
    name: 'html-redirects',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url || '/';
        const q = raw.indexOf('?');
        const path = q >= 0 ? raw.slice(0, q) : raw;
        const search = q >= 0 ? raw.slice(q) : '';
        const dest = HTML_REDIRECTS[path];
        if (dest != null && req.method === 'GET') {
          res.statusCode = 302;
          res.setHeader('Location', dest + search);
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), htmlRedirectPlugin()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            // Nest ещё не слушает / рестарт — без stacktrace в консоль Vite
            const r = res as { headersSent?: boolean; writeHead?: Function; end?: Function };
            if (r && !r.headersSent && typeof r.writeHead === 'function') {
              r.writeHead(502, { 'Content-Type': 'application/json' });
              r.end?.(JSON.stringify({ error: 'api_unavailable' }));
            }
          });
        },
      },
      '/metrics': { target: 'http://127.0.0.1:3000' },
      '/uploads': { target: 'http://127.0.0.1:3000' },
      '/ip': { target: 'http://127.0.0.1:3000' },
      '/health': { target: 'http://127.0.0.1:3000' },
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
