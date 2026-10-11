'use strict';

/**
 * Ensure better-sqlite3 / bcrypt match the current Node ABI.
 * Safe to run before every start (exe / npm start / start:dev).
 * On mismatch: npm rebuild, then re-check.
 *
 * npm 11+ rejects project-scoped rebuilds when `npm_config_allow_scripts`
 * is present in the environment (inherited from `npm run` + .npmrc).
 * Policy lives in package.json#allowScripts; we strip the env override here.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgs = ['better-sqlite3', 'bcrypt'];

function probe() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.close();
    require('bcrypt');
    return null;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

/** Env for child npm: drop allow-scripts so rebuild is not treated as CLI policy. */
function rebuildEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^npm_config_allow_scripts$/i.test(key)) {
      delete env[key];
    }
  }
  return env;
}

function npmRebuild() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  console.log(
    `  Native modules need rebuild for Node ${process.version} (ABI ${process.versions.modules})...`,
  );
  const r = spawnSync(npmCmd, ['rebuild', ...pkgs, '--foreground-scripts'], {
    cwd: root,
    stdio: 'inherit',
    env: rebuildEnv(),
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

/** Last resort: build each package with its own install script / node-gyp. */
function rebuildViaPackageScripts() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let ok = true;
  for (const pkg of pkgs) {
    const pkgDir = path.join(root, 'node_modules', pkg);
    if (!fs.existsSync(pkgDir)) {
      ok = false;
      continue;
    }
    console.log(`  Rebuilding ${pkg} in place...`);
    const r = spawnSync(npmCmd, ['run', 'install', '--if-present'], {
      cwd: pkgDir,
      stdio: 'inherit',
      env: rebuildEnv(),
      shell: process.platform === 'win32',
    });
    if (r.status !== 0) {
      const gyp = spawnSync(npmCmd, ['exec', '--', 'node-gyp', 'rebuild'], {
        cwd: pkgDir,
        stdio: 'inherit',
        env: rebuildEnv(),
        shell: process.platform === 'win32',
      });
      if (gyp.status !== 0) ok = false;
    }
  }
  return ok;
}

function main() {
  if (!fs.existsSync(path.join(root, 'node_modules', 'better-sqlite3'))) {
    console.error('  Missing node_modules. Run: npm install');
    process.exit(1);
  }

  let err = probe();
  if (!err) {
    process.exit(0);
  }

  console.error('  ' + (err.message || String(err)).split('\n')[0]);
  if (!npmRebuild() && !rebuildViaPackageScripts()) {
    console.error('  npm rebuild failed.');
    console.error('  Try: npm install');
    console.error('  Or install Visual Studio Build Tools (Windows) / build-essential (Linux).');
    process.exit(1);
  }

  // Clear require cache so the freshly built .node is loaded.
  for (const key of Object.keys(require.cache)) {
    if (/better-sqlite3|bcrypt[/\\]/.test(key) || /[/\\]bcrypt[/\\]/.test(key)) {
      delete require.cache[key];
    }
  }

  err = probe();
  if (err) {
    console.error('  Still failing after rebuild:');
    console.error('  ' + (err.message || String(err)).split('\n')[0]);
    console.error('  Delete node_modules and run: npm install');
    process.exit(1);
  }

  console.log('  Native modules rebuilt OK.');
  process.exit(0);
}

main();
