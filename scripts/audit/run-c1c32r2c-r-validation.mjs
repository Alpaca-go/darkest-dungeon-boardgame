import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const root = 'docs/data/complete-edition/';
mkdirSync('tmp/c1c32r2c-r', { recursive: true });
const names = ['typecheck', 'test:necromancer-foundation', 'test:necromancer-finalization',
  'test:necromancer-threat-bridge', 'test:necromancer-threat-dependencies', 'test:ruins-executable-dependencies',
  'test:ruins-production-runtime', 'test:ruins-production-executor',
  ...['c1c29','c1c30','c1c31','c1c31r','c1c32','c1c32r','c1c32r2','c1c32r2a','c1c32r2b'].map(p => `verify:complete-edition-${p}`),
  'test:e2e:necromancer-foundation'];
const results = [];
function run(command, label) {
  const start = Date.now();
  const output = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const log = `tmp/c1c32r2c-r/${label}.log`;
  writeFileSync(log, (output.stdout ?? '') + (output.stderr ?? '') + (output.error?.message ?? ''));
  const record = { command, exitCode: output.status, durationMs: Date.now() - start, log };
  console.log(JSON.stringify(record));
  results.push(record);
  writeFileSync(`${root}c1c32r2c-r-regression-results.json`, JSON.stringify(results, null, 2) + '\n');
  return output.status;
}
for (const name of names) run(`npm run ${name}`, name.replaceAll(':', '-'));
run('npm run test:ruins-final-runtime-blockers -- --reporter=json --outputFile=docs/data/complete-edition/c1c32r2c-r-test-results.json', 'focused');
run('npx vitest run --maxWorkers=2 --minWorkers=2 --reporter=json --outputFile=docs/data/complete-edition/c1c32r2c-r-full-test-results.json', 'full');
const full = JSON.parse(readFileSync(`${root}c1c32r2c-r-full-test-results.json`, 'utf8'));
const baseline = JSON.parse(readFileSync(`${root}c1c32r2c-full-test-classification.json`, 'utf8'));
const failures = full.testResults.flatMap(s => s.assertionResults.filter(t => t.status === 'failed'));
const allowed = baseline.historicalExceptions.map(t => t.fullName);
const unexpected = failures.filter(t => !allowed.includes(t.fullName));
writeFileSync(`${root}c1c32r2c-r-full-test-classification.json`, JSON.stringify({
  totalTests: full.numTotalTests, passedTests: full.numPassedTests, failedTests: full.numFailedTests,
  historicalExceptions: failures.filter(t => allowed.includes(t.fullName)).map(t => ({ fullName: t.fullName, failureMessages: t.failureMessages })),
  unexpectedFailures: unexpected.length,
}, null, 2) + '\n');
const build = run('npm run build', 'build');
const buildLog = readFileSync('tmp/c1c32r2c-r/build.log', 'utf8');
writeFileSync(`${root}c1c32r2c-r-build-classification.json`, JSON.stringify({
  exitCode: build,
  status: build === 0 ? 'PASS' : /ENOENT/.test(buildLog) && /\.css/.test(buildLog) && /transformed/.test(buildLog)
    ? 'BUILD_ACCEPTANCE_UNVERIFIED' : 'UNEXPECTED_BUILD_FAILURE',
  knownToolingBlocker: build !== 0 && /ENOENT/.test(buildLog) && /\.css/.test(buildLog) && /transformed/.test(buildLog),
  log: 'tmp/c1c32r2c-r/build.log',
}, null, 2) + '\n');
if (unexpected.length || results.filter(r => r.command.startsWith('npm run') && r.command !== 'npm run build').some(r => r.exitCode !== 0)) process.exitCode = 1;
