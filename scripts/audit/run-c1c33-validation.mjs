import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync, readdirSync, createWriteStream } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const baseline = 'b01a3380aa1f9c24d7c6bafb32be99220ac10421';
const origin = process.cwd(), npmCli = process.env.npm_execpath;
const sourceHash = path => createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
if (!npmCli) throw new Error('Run through npm run validate:complete-edition-c1c33');
const scratch = mkdtempSync(join(tmpdir(), 'dd-c1c33-clean-')), checkout = join(scratch, 'repo');
const git = args => execFileSync('git', args, {encoding: 'utf8'}).trim();
execFileSync('git', ['-c', `safe.directory=${resolve(origin, '.git').replaceAll('\\', '/')}`, 'clone', '--config', 'core.autocrlf=false', '--local', '--no-hardlinks', origin, checkout], {stdio: 'pipe'});
execFileSync('git', ['checkout', '--detach', baseline], {cwd: checkout, stdio: 'pipe'});
const changes = [...new Set([...git(['diff', '--name-only', baseline]).split(/\r?\n/), ...git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/)])]
  .filter(p => p && p !== '.gitignore' && (/^(src|scripts|e2e)\//.test(p) || p === 'package.json' || p === 'docs/DD_EN_COREBOX_RULES.pdf' || p.includes('/c1c33-')));
for (const p of changes) { mkdirSync(dirname(join(checkout, p)), {recursive: true}); copyFileSync(p, join(checkout, p)); }
execFileSync('git', ['add', '--force', '--', ...changes], {cwd: checkout, stdio: 'pipe'});
execFileSync('git', ['-c', 'user.name=C1C33 Acceptance', '-c', 'user.email=acceptance@local.invalid', 'commit', '-m', 'C1C33 disposable acceptance snapshot'], {cwd: checkout, stdio: 'pipe'});
const clean = execFileSync('git', ['status', '--porcelain'], {cwd: checkout, encoding: 'utf8'}).trim() === '';
mkdirSync(join(checkout, 'pw-out'), {recursive: true});
const observation = {schemaVersion: 1, phase: '11A.4-C1C33', baseline, freshCheckout: {cleanBeforeInstall: clean, path: checkout,
  snapshotCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: checkout, encoding: 'utf8'}).trim(), npmCiExitCode: null}, commands: []};
const save = () => writeFileSync(join(checkout, 'docs/data/complete-edition/c1c33-validation-observation.json'), JSON.stringify(observation, null, 2) + '\n');
async function run(args, kind) {
  const label = args.join(' '), log = `pw-out/c1c33-${kind}-${observation.commands.length}.log`;
  console.log(`START npm ${label}`);
  const stream = createWriteStream(join(checkout, log));
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [npmCli, ...args], {cwd: checkout, env: {...process.env, VITE_E2E_MODE: '', NODE_OPTIONS: ''}});
    child.stdout.pipe(stream, {end: false}); child.stderr.pipe(stream, {end: false});
    child.on('error', reject); child.on('close', async code => { stream.end(() => done(code ?? 1)); });
  });
  const result = {command: `npm ${label}`, kind, exitCode: code, log};
  if (!['audit', 'verify'].includes(kind)) { observation.commands.push(result); save(); }
  console.log(`END ${kind}: ${code}`);
  return result;
}
function requirePass(result) {
  if (result.exitCode !== 0) throw new Error(`${result.command} failed; see ${join(checkout, result.log)}`);
}
try {
  const install = await run(['ci'], 'install'); observation.freshCheckout.npmCiExitCode = install.exitCode; requirePass(install);
  requirePass(await run(['run', 'typecheck'], 'typecheck'));
  requirePass(await run(['run', 'test:necromancer-production-acceptance'], 'acceptance'));
  requirePass(await run(['run', 'test:necromancer-production-threat-full-path'], 'production-threat'));
  requirePass(await run(['run', 'test:e2e:necromancer-production-threat-full-path'], 'browser'));
  requirePass(await run(['run', 'verify:complete-edition-c1c32r3r'], 'r3r-verifier'));
  const full = await run(['exec', '--', 'vitest', 'run', '--maxWorkers=4', '--minWorkers=4', '--reporter=default', '--reporter=json', '--outputFile=pw-out/c1c33-vitest.json'], 'full-regression');
  const report = JSON.parse(readFileSync(join(checkout, 'pw-out/c1c33-vitest.json'), 'utf8'));
  observation.fullTests = {total: report.numTotalTests, passed: report.numPassedTests, pending: report.numPendingTests,
    expectedTotal: 2633 + 24,
    collectionErrors: report.testResults.filter(s => s.status === 'failed' && s.assertionResults.length === 0).map(s => ({name: s.name, message: s.message})),
    failedTests: report.testResults.flatMap(s => s.assertionResults.filter(t => t.status === 'failed').map(t => ({name: t.fullName, messages: t.failureMessages})))};
  if (observation.fullTests.total !== observation.fullTests.expectedTotal || observation.fullTests.collectionErrors.length !== 0
    || observation.fullTests.failedTests.length !== 2 || observation.fullTests.pending !== 0
    || !observation.fullTests.failedTests.every(t => t.messages.some(m => /C1C2[78]: scope violation/.test(m)))) throw new Error('Unexpected regression failure');
  full.classification = 'ACCEPTED_HISTORICAL_SCOPE_GUARDS'; save();
  // The historical CLI test regenerates three reports with wall-clock timestamps.
  // Compare every semantic field before restoring their exact immutable baseline bytes.
  const withoutTimestamp = value => Array.isArray(value) ? value.map(withoutTimestamp)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'generatedAt').map(([key, item]) => [key, withoutTimestamp(item)])) : value;
  observation.transientHistoricalRegeneration = [];
  for (const name of ['official-source-manifest', 'official-source-summary', 'source-readiness']) {
    const path = `docs/data/core-campaign/${name}.json`;
    const original = execFileSync('git', ['show', `${baseline}:${path}`], {cwd: checkout});
    const generated = readFileSync(join(checkout, path));
    if (JSON.stringify(withoutTimestamp(JSON.parse(original))) !== JSON.stringify(withoutTimestamp(JSON.parse(generated))))
      throw new Error(`Historical CLI regenerated a semantic difference: ${path}`);
    observation.transientHistoricalRegeneration.push({path, baselineHash: createHash('sha256').update(original).digest('hex'),
      generatedHash: createHash('sha256').update(generated).digest('hex'), normalizedPayloadUnchanged: true, baselineBytesRestored: true});
    writeFileSync(join(checkout, path), original);
  }
  save();
  requirePass(await run(['run', 'build'], 'build'));
  const historicalNames = ['c1c29','c1c30','c1c31','c1c31r','c1c32','c1c32r','c1c32r2','c1c32r2a','c1c32r2b','c1c32r2c','c1c32r2c-r'];
  const expected = {'c1c32r2a': /Historical file changed: src\/game-engine\/bosses\/room-storage.ts/,
    'c1c32r2c': /C1C32R2C runtime and evidence blockers differ/,
    'c1c32r2c-r': /Stale closure evidence/};
  for (const phase of historicalNames) {
    const r = await run(['run', `verify:complete-edition-${phase}`], 'historical-verifier');
    if (r.exitCode !== 0) {
      const log = readFileSync(join(checkout, r.log), 'utf8');
      if (!expected[phase]?.test(log)) requirePass(r);
      r.classification = 'EXPECTED_SUCCESSOR_RUNTIME_DIVERGENCE'; r.errorExcerpt = log.match(expected[phase])[0]; save();
    }
  }
  const js = readdirSync(join(checkout, 'dist/assets')).filter(p => p.endsWith('.js')).map(p => readFileSync(join(checkout, 'dist/assets', p), 'utf8')).join('\n');
  const provenanceFile = 'docs/data/darkest-dungeon/community-reference/antha-complete-edition/normalized-requirements.json';
  const provenanceBytes = readFileSync(join(checkout, provenanceFile));
  const baselineProvenance = execFileSync('git', ['show', `${baseline}:${provenanceFile}`], {cwd: checkout, maxBuffer: 64 * 1024 * 1024});
  if (!provenanceBytes.equals(baselineProvenance)) throw new Error('Frozen render provenance changed');
  const provenancePaths = [];
  function renderPaths(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.renders)) for (const render of value.renders)
      if (typeof render.path === 'string' && /^C:[\\/]+Users[\\/]+kyrie/.test(render.path)) provenancePaths.push(render.path);
    Object.values(value).forEach(renderPaths);
  }
  renderPaths(JSON.parse(provenanceBytes));
  const localPaths = [...js.matchAll(/C:[\\/]+Users[\\/]+kyrie/g)];
  const executablePaths = localPaths.filter(match => !provenancePaths.some(path => js.slice(match.index).startsWith(JSON.stringify(path).slice(1, -1))));
  observation.bundleAudit = {debugHooks: [...js.matchAll(/dd-fixed-rng|golden-normal-success-01|debug-panel|debug-act-four|debug-harness|Scenario C|DARKEST DUNGEON EN_FILES/g)].length,
    localSourcePaths: executablePaths.length, provenanceOnlyLocalPathMatches: localPaths.length - executablePaths.length,
    provenanceRef: provenanceFile, provenanceSha256: createHash('sha256').update(provenanceBytes).digest('hex'),
    classification: 'Frozen renders[].path metadata only; committed visual resolver requires src/assets/ localPath; all external network blocked in browser proof',
    e2eSeedRemoved: !js.includes('golden-normal-success-01')};
  observation.codeHashProtocol = 'UTF8_LF_SHA256_V1';
  observation.codeHashes = Object.fromEntries(execFileSync('git', ['ls-files', 'src', 'scripts', 'e2e', 'package.json', 'package-lock.json', 'vite.config.ts', 'playwright.config.ts'], {cwd: checkout, encoding: 'utf8'}).trim().split(/\r?\n/)
    .filter(p => !p.startsWith('src/assets/')).map(p => [p, sourceHash(join(checkout, p))]));
  if (Object.entries(observation.codeHashes).some(([p, expected]) => sourceHash(join(origin, p)) !== expected))
    throw new Error('Source changed during validation; rerun against final code before acceptance');
  save();
  requirePass(await run(['run', 'audit:complete-edition-c1c33'], 'audit'));
  requirePass(await run(['run', 'verify:complete-edition-c1c33'], 'verify'));
  for (const p of readdirSync(join(checkout, 'docs/data/complete-edition')).filter(p => p.startsWith('c1c33-')))
    copyFileSync(join(checkout, 'docs/data/complete-edition', p), join(origin, 'docs/data/complete-edition', p));
  mkdirSync(join(origin, 'pw-out'), {recursive: true});
  for (const p of readdirSync(join(checkout, 'pw-out')).filter(p => p.startsWith('c1c33-')))
    copyFileSync(join(checkout, 'pw-out', p), join(origin, 'pw-out', p));
  console.log(`C1C33 fresh-checkout acceptance PASS. Reproducible checkout retained: ${checkout}`);
} catch (error) {
  save();
  copyFileSync(join(checkout, 'docs/data/complete-edition/c1c33-validation-observation.json'), join(origin, 'docs/data/complete-edition/c1c33-validation-observation.json'));
  console.error(`Acceptance incomplete; checkout retained: ${checkout}`); throw error;
}
