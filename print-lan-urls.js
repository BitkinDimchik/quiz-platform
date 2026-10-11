'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function readEnv(file) {
  const out = {};
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  } catch {
    /* no .env yet */
  }
  return out;
}

function parseIPv4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return null;
  const o = [+m[1], +m[2], +m[3], +m[4]];
  if (o.some((x) => x > 255)) return null;
  return o;
}

function isLikelyVirtualInterface(name) {
  const n = String(name || '').toLowerCase();
  const hints = [
    'docker',
    'veth',
    'br-',
    'vmware',
    'virtualbox',
    'vboxnet',
    'vethernet',
    'hyper-v',
    'wsl',
    'pseudo-interface',
    'tailscale',
    'zerotier',
    'zt-',
    'nordlynx',
    'singbox',
  ];
  return hints.some((h) => n.includes(h));
}

function scoreLanIp(ip) {
  const p = parseIPv4(ip);
  if (!p) return -1;
  const [a, b, c] = p;
  if (a === 127) return -1;
  if (a === 169 && b === 254) return 100;
  if (a === 192 && b === 168 && (c === 56 || c === 137)) return -1;
  if (a === 192 && b === 168) return 10000;
  if (a === 10) return 8000;
  if (a === 172 && b >= 16 && b <= 31) return b === 17 ? 3200 : 6000;
  return 500;
}

function collectIps(skipVirtual) {
  const nets = os.networkInterfaces();
  const byIp = new Map();
  for (const name of Object.keys(nets)) {
    if (skipVirtual && isLikelyVirtualInterface(name)) continue;
    for (const it of nets[name] || []) {
      if (!it || it.internal) continue;
      const family = String(it.family);
      const addr = String(it.address || '');
      if (family !== 'IPv4' && family !== '4') continue;
      if (!addr || addr === '127.0.0.1') continue;
      const sc = scoreLanIp(addr);
      if (sc < 0) continue;
      byIp.set(addr, Math.max(byIp.get(addr) ?? -1, sc));
    }
  }
  return [...byIp.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([ip]) => ip);
}

const root = path.resolve(__dirname);
const env = { ...readEnv(path.join(root, '.env.example')), ...readEnv(path.join(root, '.env')) };
const port = /^\d+$/.test(env.PORT || '') ? env.PORT : '3000';
const forced = String(env.HOST_PUBLIC_IP || '').trim();
const parsedForced = parseIPv4(forced);

let lan = collectIps(true);
if (lan.length === 0) lan = collectIps(false);
if (parsedForced) {
  const ip = parsedForced.join('.');
  lan = [ip, ...lan.filter((x) => x !== ip)];
}

function url(host) {
  return 'http://' + host + ':' + port;
}

console.log('');
console.log('  Connect:');
console.log('    this PC     ' + url('localhost'));
if (lan.length === 0) {
  console.log('    phones      no LAN IPv4 found, check Wi-Fi');
} else {
  lan.forEach((ip, i) => {
    const label = i === 0 ? 'phones      ' : '            ';
    console.log('    ' + label + url(ip));
  });
}
console.log('    same Wi-Fi as this PC');
console.log('');
