import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

const root = process.cwd();
process.env.PLAYWRIGHT_CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const port = 5199;
const portOpen = () => new Promise((done) => { const socket = createConnection({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); done(true); }); socket.once('error', () => done(false)); });
const waitForPort = async (want, timeout) => { const until = Date.now() + timeout; while (Date.now() < until) { if (await portOpen() === want) return true; await delay(100); } return false; };
const run = (command, args) => new Promise((done, fail) => { const child = spawn(command, args, { cwd: root, env: process.env, stdio: 'inherit', shell: false }); child.once('error', fail); child.once('exit', (code, signal) => done({ code, signal })); });
if (await portOpen()) throw new Error(`port ${port} is already listening`);
const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, VITE_E2E_MODE: '1', PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }, stdio: 'inherit', shell: false });
let result;
try {
  if (!await waitForPort(true, 30_000)) throw new Error('Vite did not start');
  const args = [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.critical.config.ts', 'e2e/phase11a3-community-act4-playable-closure.spec.ts'];
  if (process.env.COMMUNITY_E2E_JSON_PATH) args.push('--reporter=json');
  result = await run(process.execPath, args);
} finally {
  if (vite.exitCode === null) vite.kill('SIGTERM');
  if (!await waitForPort(false, 15_000) && vite.exitCode === null) vite.kill('SIGKILL');
}
if (result?.code !== 0 || result?.signal) process.exitCode = 1;
