import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { level2TerminalAudit, BLOCKER_TAXONOMY } from '../../src/audit/level2-terminal-blockers';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const baselineHead = 'd4c00cbccd5f4c495a6df208b59e23cdd9540433';
const names = ['c1c14-source-delta.json', 'c1c14-level2-terminal-blocker-register.json',
  'c1c14-level2-source-gap-register.json', 'c1c14-level2-runtime-opportunity-matrix.json',
  'c1c14-level2-trinket-capability-matrix.json', 'c1c14-healing-runtime-surface.json', 'c1c14-source-gap-freeze.json'];
const read = (name: string): any => JSON.parse(readFileSync(resolve(dataDir, name), 'utf8'));
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
function run(program: string, args: string[], timeout = 900_000) {
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8', timeout, shell: false,
    maxBuffer: 100 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed:\n${(result.stderr || result.stdout || result.error?.message || '').slice(-12000)}`);
  return result.stdout.trim();
}
const git = (...args: string[]) => run('git', args);
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const equal = (a: unknown, b: unknown, message: string) => check(JSON.stringify(a) === JSON.stringify(b), message);

check(!spawnSync('git', ['diff', '--quiet'], { cwd: root }).status && !spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root }).status,
  'C1C14 verifier requires a clean tracked tree');
const matrix = read('c1c14-level2-trinket-capability-matrix.json');
const anchor = matrix.verifiedImplementationHead;
check(matrix.baselineHead === baselineHead && anchor !== baselineHead, 'stale implementation anchor');
git('cat-file', '-e', `${anchor}^{commit}`);
check(git('rev-parse', `${anchor}^{tree}`) === matrix.verifiedImplementationTree, 'implementation tree mismatch');
git('merge-base', '--is-ancestor', anchor, 'HEAD');
const allowed = new Set([...names.map((name) => `docs/data/complete-edition/${name}`),
  'docs/reports/complete-edition/c1c14-level2-blocker-consolidation-report.md']);
const postAnchor = git('diff', '--name-only', `${anchor}..HEAD`).split(/\r?\n/).filter(Boolean);
check(postAnchor.every((path) => allowed.has(path.replace(/\\/g, '/'))), `implementation changed after anchor: ${postAnchor.join(', ')}`);
for (const path of git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11|12|13)-/.test(path))) {
  check(!spawnSync('git', ['diff', '--quiet', baselineHead, '--', path], { cwd: root }).status, `historical evidence changed: ${path}`);
}
for (const name of names) {
  const artifact = read(name);
  check(artifact.verifiedImplementationHead === anchor && artifact.verifiedImplementationTree === matrix.verifiedImplementationTree,
    `anchor mismatch: ${name}`);
}
const source = read('c1c14-source-delta.json');
check(source.decision === 'PRESERVE_FAIL_CLOSED' && source.voluntary.sourceDelta === 'NONE' && source.healing.sourceDelta === 'NONE', 'source delta drift');
check(source.newlyAvailableRelevantAuthoritativeEvidence.length === 0, 'unreviewed source evidence');
for (const group of [source.voluntary, source.healing]) for (const entry of group.sourceSnapshot) {
  const current = resolve(root, entry.path);
  check(entry.currentHash === sha(readFileSync(current)), `source hash drift: ${entry.path}`);
  if (entry.trackedPrior) {
    const original = execFileSync('git', ['show', `${group.priorCommit}:${entry.path}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    check(entry.priorHash === sha(original) && entry.change === 'UNCHANGED', `source delta drift: ${entry.path}`);
  }
}
const audit = level2TerminalAudit();
check(audit.cards.length === 11 && audit.readyCount === 4 && audit.notReadyCount === 7 && !audit.completeForRandomDraw
  && audit.readinessInvariantErrors.length === 0, 'Level 2 readiness drift');
equal(matrix.cards, audit.cards, 'capability matrix not bound to live evaluator');
equal([matrix.readyCount, matrix.notReadyCount, matrix.completeForRandomDraw, matrix.readinessInvariantErrors],
  [audit.readyCount, audit.notReadyCount, audit.completeForRandomDraw, audit.readinessInvariantErrors], 'matrix summary drift');
equal(read('c1c14-level2-terminal-blocker-register.json').blockers, audit.blockerRegister, 'blocker register drift');
const opportunities = read('c1c14-level2-runtime-opportunity-matrix.json');
equal(opportunities.opportunities, audit.cards.flatMap((card) => card.sides.map((side) => ({ card: card.printedName, definitionId: card.definitionId, ...side }))), 'opportunity matrix drift');
check(opportunities.proposedTasks.find((task: any) => task.task === 'movement-modifier-and-consumer')?.readyGainIfImplementedAlone === 0, 'movement ROI drift');
check(opportunities.proposedTasks.find((task: any) => task.task === 'movement-modifier-and-consumer')?.priority === 'P3', 'movement priority drift');
check(opportunities.opportunities.find((entry: any) => entry.card === 'Book of Relaxation' && entry.side === 'negative')?.implementationPossibleNow === false, 'Relaxation incorrectly implementable');
const gaps = read('c1c14-level2-source-gap-register.json').gaps;
equal(gaps.map((gap: any) => gap.blockerCode), ['TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED', 'TRINKET_TRIGGER_SCOPE_UNRESOLVED'], 'source gap taxonomy drift');
const freeze = read('c1c14-source-gap-freeze.json');
check(freeze.voluntaryDeclaration.status === 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' && freeze.chirurgeonHealingScope.status === 'SOURCE_UNRESOLVED', 'source freeze drift');
const surfaces = read('c1c14-healing-runtime-surface.json').surfaces;
check(surfaces.find((entry: any) => entry.surfaceId === 'battle-healing-skill')?.passesTrinketWindow === true
  && surfaces.filter((entry: any) => entry.passesTrinketWindow === true).length === 1, 'healing window census drift');
check(Object.keys(BLOCKER_TAXONOMY).length === audit.blockerRegister.length, 'blocker taxonomy drift');
const report = readFileSync(resolve(root, 'docs/reports/complete-edition/c1c14-level2-blocker-consolidation-report.md'), 'utf8');
check(report.includes(`C1C14-LEVEL2-BLOCKER-CONSOLIDATION-ACCEPTED-READY-${audit.readyCount}-OF-${audit.cards.length}-SOURCE-GATED`), 'report verdict drift');

const commands: string[] = [];
const npm = process.env.ComSpec ?? 'cmd.exe';
for (const phase of ['c1c13', 'c1c12', 'c1c11', 'c1c10', 'c1c9', 'c1c8', 'c1c7', 'c1c6', 'c1c5']) {
  const command = `test:e2e:community-content-${phase}`;
  run(npm, ['/d', '/s', '/c', `npm run ${command}`]); commands.push(command);
}
const volatile = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'];
const snapshots = new Map(volatile.map((path) => [path, readFileSync(resolve(root, path))]));
try { run(npm, ['/d', '/s', '/c', 'npm test']); } finally {
  for (const [path, bytes] of snapshots) writeFileSync(resolve(root, path), bytes);
}
commands.push('test');
for (const command of ['typecheck', 'build']) { run(npm, ['/d', '/s', '/c', `npm run ${command}`]); commands.push(command); }
check(!spawnSync('git', ['diff', '--quiet'], { cwd: root }).status && !spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root }).status,
  'verifier left tracked changes');
console.log(JSON.stringify({ verdict: `C1C14-LEVEL2-BLOCKER-CONSOLIDATION-ACCEPTED-READY-${audit.readyCount}-OF-${audit.cards.length}-SOURCE-GATED`,
  anchor, commands }, null, 2));
