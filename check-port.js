'use strict';

const net = require('net');
const port = Number(process.argv[2] || 3000);
const server = net.createServer();
server.once('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('Port ' + port + ' is already in use.');
    console.error('Close start-dev.bat / other Node windows, then retry.');
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
server.once('listening', () => {
  server.close(() => process.exit(0));
});
server.listen(port, '0.0.0.0');
