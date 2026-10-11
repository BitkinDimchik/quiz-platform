'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const pkg = path.join(web, 'package.json');
const viteJs = path.join(web, 'node_modules', 'vite', 'bin', 'vite.js');

if (!fs.existsSync(pkg)) {
  console.error('Missing web/package.json. Copy the web folder, but not web/node_modules.');
  process.exit(1);
}

if (!fs.existsSync(viteJs)) {
  console.error('Missing web/node_modules/vite. Run: npm install --prefix web');
  process.exit(1);
}

const cmd = process.argv[2] === 'dev' ? 'dev' : 'build';
const r = spawnSync(process.execPath, [viteJs, cmd], {
  cwd: web,
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
