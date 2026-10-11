import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { join } from 'path';
import { osClipboardImageToDataUrl, parseOsClipboardImageOutput } from './os-clipboard-image';
import { osClipboardWriteTextScript } from './os-clipboard-text';

const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/** PowerShell STA: PNG из буфера, CF_BITMAP и первый image-файл из Проводника. */
const READ_CLIPBOARD_PS1 = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$max = ${MAX_BYTES}

function Write-Image($mime, [byte[]]$bytes) {
  if ($null -eq $bytes -or $bytes.Length -le 0 -or $bytes.Length -gt $max) { return $false }
  [Console]::Out.Write($mime)
  [Console]::Out.Write([char]10)
  [Console]::Out.Write([Convert]::ToBase64String($bytes))
  return $true
}

function Bytes-FromStream($stream) {
  if ($null -eq $stream) { return $null }
  if ($stream -is [byte[]]) { return $stream }
  if ($stream -is [System.IO.MemoryStream]) { return $stream.ToArray() }
  if ($stream -is [System.IO.Stream]) {
    $ms = New-Object System.IO.MemoryStream
    try { $stream.Position = 0 } catch { }
    $stream.CopyTo($ms)
    return $ms.ToArray()
  }
  return $null
}

try {
  $data = [System.Windows.Forms.Clipboard]::GetDataObject()
} catch {
  $data = $null
}
if ($null -ne $data) {
  foreach ($fmt in @('PNG', 'image/png')) {
    try {
      if ($data.GetDataPresent($fmt, $false)) {
        $bytes = Bytes-FromStream ($data.GetData($fmt, $false))
        if (Write-Image 'image/png' $bytes) { exit 0 }
      }
    } catch { }
  }
}

try {
  if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
    $img = [System.Windows.Forms.Clipboard]::GetImage()
    if ($null -ne $img) {
      $ms = New-Object System.IO.MemoryStream
      $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      if (Write-Image 'image/png' $ms.ToArray()) { exit 0 }
    }
  }
} catch { }

$extMap = @{
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif' = 'image/gif'
  '.webp' = 'image/webp'
  '.bmp' = 'image/bmp'
}
try {
  if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
    foreach ($path in [System.Windows.Forms.Clipboard]::GetFileDropList()) {
      $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
      if (-not $extMap.ContainsKey($ext)) { continue }
      if (-not [System.IO.File]::Exists($path)) { continue }
      $len = (Get-Item -LiteralPath $path).Length
      if ($len -le 0 -or $len -gt $max) { continue }
      if (Write-Image $extMap[$ext] ([System.IO.File]::ReadAllBytes($path))) { exit 0 }
    }
  }
} catch { }
exit 0
`.trim();

@Injectable()
export class OsClipboardImageService {
  private readonly logger = new Logger(OsClipboardImageService.name);

  private powershellPath(): string {
    return join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
  }

  async writeText(text: string): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    const script = osClipboardWriteTextScript(text);
    if (!script) return false;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          this.powershellPath(),
          ['-STA', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
          { timeout: TIMEOUT_MS, windowsHide: true },
          (err) => {
            if (err) reject(err);
            else resolve();
          },
        );
      });
      return true;
    } catch (err) {
      this.logger.warn(`clipboard text write failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async readDataUrl(): Promise<string | null> {
    if (process.platform !== 'win32') return null;
    const encoded = Buffer.from(READ_CLIPBOARD_PS1, 'utf16le').toString('base64');
    try {
      const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile(
          this.powershellPath(),
          ['-STA', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
          { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 18 * 1024 * 1024, encoding: 'utf8' },
          (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
          },
        );
      });
      const parsed = parseOsClipboardImageOutput(stdout);
      if (!parsed) return null;
      return osClipboardImageToDataUrl(parsed.mime, parsed.base64);
    } catch (err) {
      this.logger.warn(`clipboard image read failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
