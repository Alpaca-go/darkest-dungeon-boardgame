import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const port = 5199;
const viteCli = resolve(root, 'node_modules/vite/bin/vite.js');
const playwrightCli = resolve(root, 'node_modules/@playwright/test/cli.js');
if (!existsSync(viteCli) || !existsSync(playwrightCli)) throw new Error('Local Vite or Playwright CLI is missing');

function portOpen() {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolvePort(true); });
    socket.once('error', () => resolvePort(false));
  });
}

async function waitForPort(wantOpen, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await portOpen() === wantOpen) return true;
    await delay(100);
  }
  return false;
}

function run(command, args, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', shell: false });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => resolveRun({ code, signal }));
  });
}

if (await portOpen()) throw new Error(`port ${port} is already listening; refusing to reuse an unmanaged server`);
const vite = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_E2E_MODE: '1' }, stdio: 'inherit', shell: false,
});
let viteExit = null;
vite.once('exit', (code, signal) => { viteExit = { code, signal }; });

let result;
try {
  if (!await waitForPort(true, 30_000)) throw new Error(`Vite did not listen on ${port}${viteExit ? ` (${JSON.stringify(viteExit)})` : ''}`);
  result = await run(process.execPath, [playwrightCli, 'test', '--config=playwright.critical.config.ts', 'e2e/phase11a2-critical-campaign.spec.ts'], process.env);
} finally {
  if (vite.exitCode === null) vite.kill('SIGTERM');
  if (!await waitForPort(false, 15_000)) {
    // Vite is direct Node (not npm/cmd); SIGKILL is a bounded final cleanup.
    if (vite.exitCode === null) vite.kill('SIGKILL');
    if (!await waitForPort(false, 5_000)) throw new Error(`Vite lifecycle leak: port ${port} remains listening`);
  }
}

if (result?.code !== 0 || result?.signal) process.exitCode = 1;
