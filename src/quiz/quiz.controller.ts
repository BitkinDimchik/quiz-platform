import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import os from 'os';

function parseIPv4(ip: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const o = [+m[1], +m[2], +m[3], +m[4]];
  if (o.some((x) => x > 255)) return null;
  return o as [number, number, number, number];
}

/** Prefer Wi‑Fi / Ethernet; skip Docker, WSL, Hyper‑V, VPN helpers when possible. */
function isLikelyVirtualInterface(name: string): boolean {
  const n = name.toLowerCase();
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
  for (const h of hints) {
    if (n.includes(h)) return true;
  }
  if (n === 'lo' || n.startsWith('lo:')) return true;
  return false;
}

/** Higher = better candidate for “open on phone in same LAN”. */
function scoreLanIp(ip: string): number {
  const p = parseIPv4(ip);
  if (!p) return -1;
  const [a, b, c] = p;
  if (a === 127) return -1;
  if (a === 169 && b === 254) return 100;
  // VirtualBox Host-Only / Hyper-V Default Switch — not reachable from phones
  if (a === 192 && b === 168 && (c === 56 || c === 137)) return -1;
  if (a === 192 && b === 168) return 10000;
  if (a === 10) return 8000;
  if (a === 172 && b >= 16 && b <= 31) {
    if (b === 17) return 3200;
    return 6000;
  }
  return 500;
}

function collectIps(filterVirtualIf: boolean): Map<string, number> {
  const nets = os.networkInterfaces();
  const byIp = new Map<string, number>();
  for (const name of Object.keys(nets)) {
    if (filterVirtualIf && isLikelyVirtualInterface(name)) continue;
    const list = (nets[name] || []) as any[];
    for (const it of list) {
      if (!it) continue;
      const family = typeof it.family === 'string' ? it.family : String(it.family);
      const addr = String(it.address || '');
      const internal = Boolean(it.internal);
      if (internal) continue;
      if (family !== 'IPv4') continue;
      if (!addr || addr === '127.0.0.1') continue;
      const sc = scoreLanIp(addr);
      if (sc < 0) continue;
      byIp.set(addr, Math.max(byIp.get(addr) ?? -1, sc));
    }
  }
  return byIp;
}

/**
 * Public endpoints (UI relies on them).
 * Game flow happens over WS `/game`.
 */
@Controller()
export class QuizController {
  constructor(private readonly config: ConfigService) {}

  @Get('health')
  @SkipThrottle({ default: true, join: true })
  health(): { ok: boolean } {
    return { ok: true };
  }

  /**
   * LAN IPv4 addresses of the server machine (best match first).
   * Used by Host UI to build a QR link when the page is opened via localhost.
   * Override: `HOST_PUBLIC_IP=192.168.x.x` if auto-detection still picks a wrong NIC.
   */
  @Get('ip')
  @SkipThrottle({ default: true, join: true })
  ip(): { ips: string[] } {
    const forced = (this.config.get<string>('HOST_PUBLIC_IP', '') || '').trim();
    if (forced) {
      const p = parseIPv4(forced);
      if (p) {
        return { ips: [`${p[0]}.${p[1]}.${p[2]}.${p[3]}`] };
      }
    }

    let byIp = collectIps(true);
    if (byIp.size === 0) {
      byIp = collectIps(false);
    }
    const sorted = [...byIp.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    return { ips: sorted.map(([ip]) => ip) };
  }
}

