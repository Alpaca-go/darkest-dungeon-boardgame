import { readFileSync } from 'node:fs';
import { buildCoreTerminalAudit, assertCoreTerminalAudit, CORE_READY_NAMES, coreId } from '../../src/audit/core-trinket-terminal-blockers';
import { baselineHead, baselineTree, buildArtifacts, git, historicalFreeze, historyHash } from './c1c20-contract';
import { buildContracts as build19 } from './c1c19-contract';
import { buildContracts as build18 } from './c1c18-contract';
import { validateArtifacts as validate19 } from './c1c19-contract-gate';
import { validateArtifacts as validate18 } from './c1c18-contract-gate';

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error('C1C20: ' + message); };
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const equal = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), msg);
export function priorContractGates() {
  for (const [phase, build, validate] of [['c1c18', build18, validate18], ['c1c19', build19, validate19]] as const) {
    const expected = build();
    const artifacts = Object.fromEntries(Object.keys(expected).map(name => [name, json(`docs/data/complete-edition/${name}`)]));
    validate(artifacts, expected, json(`docs/data/complete-edition/${phase}-rulebook-extracted-evidence.json`));
    console.log(`Passed ${phase.toUpperCase()} live source/semantic contract gate; C1C20 enforces aggregate path/package/history guards`);
  }
}
export function verifyContractGate() {
  assert(git('rev-parse', `${baselineHead}^{tree}`) === baselineTree, 'exact C1C19 tree');
  assert(git('rev-parse', `${baselineHead}^`) === '73da3ae9d0fae07b35fcde23daa6856acdbc514a', 'exact C1C19 parent');
  git('merge-base', '--is-ancestor', baselineHead, 'HEAD');
  const allowed = (p: string) => p === 'package.json' || /^src\/audit\/(?:core-trinket-terminal-blockers\.ts|c1c20-core-terminal-blockers\.test\.ts)$/.test(p)
    || /^scripts\/audit\/(?:c1c20-contract(?:-gate)?|(?:generate|verify)-complete-edition-c1c20)\.ts$/.test(p)
    || /^docs\/(?:data|reports)\/complete-edition\/c1c20-/.test(p);
  for (const args of [['diff', '--name-only', baselineHead], ['diff', '--cached', '--name-only']]) assert(git(...args).split(/\r?\n/).filter(Boolean).every(allowed), 'production/history diff forbidden');
  const pkg = JSON.parse(git('show', `${baselineHead}:package.json`));
  pkg.scripts['audit:complete-edition-c1c20'] = 'vite-node scripts/audit/generate-complete-edition-c1c20.ts';
  pkg.scripts['verify:complete-edition-c1c20'] = 'vite-node scripts/audit/verify-complete-edition-c1c20.ts';
  const stable = (v: unknown): string => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => JSON.stringify(k) + ':' + stable(x)).join(',') + '}' : JSON.stringify(v);
  assert(stable(json('package.json')) === stable(pkg), 'only C1C20 package commands allowed');
  for (const [path, hash] of Object.entries(historicalFreeze())) assert(historyHash(path, readFileSync(path)) === hash, 'historical freeze drift: ' + path);
  const expected = buildArtifacts();
  const artifacts = Object.fromEntries(Object.keys(expected).map(name => [name, json(`docs/data/complete-edition/${name}`)]));
  const coverage = artifacts['c1c20-core-trinket-coverage.json'];
  assertCoreTerminalAudit({ ...buildCoreTerminalAudit(), cards: coverage.cards, coverage,
    blocked: artifacts['c1c20-core-trinket-terminal-blocker-register.json'].cards,
    groups: artifacts['c1c20-core-source-gap-register.json'].gaps,
    runtimeRoi: artifacts['c1c20-core-runtime-roi-matrix.json'].rows });
  for (const [index, subset] of coverage.readySubsets.entries()) {
    assert(subset.enabled && subset.level === index + 1, 'Ready subset disabled');
    equal(subset.ids, CORE_READY_NAMES[index].map(coreId).sort(), 'live selector subset drift');
  }
  equal(artifacts, expected, 'live artifact/source/ROI binding drift');
  priorContractGates();
  return artifacts;
}
