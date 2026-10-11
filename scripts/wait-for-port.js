'use strict';

/**
 * Wait until TCP host:port accepts connections (Nest ready), then exit 0.
 * Usage: node scripts/wait-for-port.js [port] [host] [timeoutMs]
 */
const net = require('net');

const port = Number(process.argv[2] || 3000);
const host = process.argv[3] || '127.0.0.1';
const timeoutMs = Number(process.argv[4] || 120000);

function canConnect() {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

(async () => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canConnect()) {
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error(`Timeout waiting for ${host}:${port}`);
  process.exit(1);
})();
