import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import {
  COMMUNITY_REFERENCE_RUNTIME_PROFILE,
  COMMUNITY_RUNTIME_BLOCKERS,
} from '../../src/data/darkest-dungeon/community-reference/runtime-profile';
import {
  COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT_SHA256,
} from '../../src/data/darkest-dungeon/community-reference/source-supplement-runtime';
import {
  COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT,
  validateCommunitySourceResolution,
} from '../../src/data/darkest-dungeon/community-reference/source-resolution';
import { listCommunityPhysicalMonsterInstances, COMMUNITY_PHYSICAL_MONSTER_DECK_SIZE } from '../../src/game-engine/campaign/act-four/community-physical-monster-deck';
import { runtimeFieldCoverageTotals, validateCommunityRuntimeFieldCoverage } from '../../src/data/darkest-dungeon/community-reference/runtime-field-coverage';

const ROOT = process.cwd();
const BASE_HEAD = '902df2021d0626fa7762cf00cca2527e4f525516';
const DATA = 'docs/data/darkest-dungeon/community-reference';
const OUTPUT = 'docs/reports/phase-11a3/act4-playable-closure';
const EVIDENCE = `${DATA}/community-act4-playable-closure-evidence.json`;
const REPORT = 'docs/reports/phase-11a3/phase-11a3-community-act4-playable-closure-report.md';
const SUPPLEMENT = `${DATA}/community-source-resolution-supplement.json`;
const RELEVANCE = `${DATA}/community-act4-runtime-relevance.json`;
const SOURCE_EVIDENCE = `${DATA}/community-source-blocker-resolution-evidence.json`;
const ENGINE_EVIDENCE = `${DATA}/community-engine-capability-final-acceptance-evidence.json`;
const RUNTIME_EVIDENCE = `${DATA}/community-reference-runtime-evidence.json`;
const BINDING_EVIDENCE = `${DATA}/antha-complete-edition/community-reference-binding-evidence.json`;
const VISUAL_EVIDENCE = `${DATA}/community-visual-assets-fresh-evidence.json`;
const OFFICIAL_EVIDENCE = 'docs/data/core-campaign/verification-results.json';

const CLOSED = [
  'FINAL_PROVISION_POLICY_UNRESOLVED',
  'MONSTER_DECK_DRAW_POLICY_UNRESOLVED',
  'SHUFFLING_INITIAL_AREA_UNRESOLVED',
  'EXCAVATION_PROVISION_DIE_MAP_UNRESOLVED',
  'ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED',
];
const SPLIT = [
  'MONSTER_CARD_FRONT_BACK_SIZE_UNRESOLVED',
  'SHUFFLING_ROOM10_NON_AGGRESSIVE_STANCE_AREA_UNRESOLVED',
];
const SUITES = {
  production: { file: 'src/data/darkest-dungeon/community-reference/community-act4-playable-closure.test.ts', expected: 11 },
  routeMatrix: { file: 'src/data/darkest-dungeon/community-reference/community-act4-route-matrix.test.ts', expected: 5 },
  adversarial: { file: 'src/data/darkest-dungeon/community-reference/community-act4-playable-closure-adversarial.test.ts', expected: 20 },
  saveReplay: { file: 'src/data/darkest-dungeon/community-reference/community-act4-playable-closure-save-replay.test.ts', expected: 7 },
  frozenExcavation: { file: 'src/data/darkest-dungeon/community-reference/community-runtime-excavation.test.ts', expected: 6 },
  frozenFinal: { file: 'src/data/darkest-dungeon/community-reference/community-runtime-final.test.ts', expected: 12 },
  frozenMonster: { file: 'src/data/darkest-dungeon/community-reference/community-runtime-monster.test.ts', expected: 7 },
  frozenSaveReplay: { file: 'src/data/darkest-dungeon/community-reference/community-runtime-save-replay.test.ts', expected: 12 },
} as const;

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
const json = (path: string): Record<string, any> => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as Record<string, any>;
const artifact = (path: string) => {
  if (!existsSync(path)) return { path, sha256: null, runId: null, measuredAt: null, verifiedImplementationHead: null, result: 'NOT-MEASURED' };
  const value = json(path);
  return { path, sha256: sha256(path), runId: value.runId, measuredAt: value.measuredAt, verifiedImplementationHead: value.verifiedImplementationHead, result: value.terminalVerdict ?? value.phase11A3Status };
};

const input = arg('--input') ?? process.env.PHASE_11A3_INTAKE_PATH;
const tts = arg('--tts') ?? process.env.PHASE_11A3_TTS_PATH;
if (!input || !tts || !existsSync(input) || !existsSync(tts)) {
  throw new Error('Usage: npm run verify:community-act4-playable-closure -- --input <source intake JSON> --tts <TTS JSON>');
}
if (git('status', '--porcelain')) throw new Error('Commit A must be committed and the working tree clean before measured verification');
git('merge-base', '--is-ancestor', BASE_HEAD, 'HEAD');

mkdirSync(resolve(ROOT, OUTPUT), { recursive: true });
const failures = [
  ...validateCommunitySourceResolution(),
  ...validateCommunityRuntimeFieldCoverage(),
];
if (sha256(SUPPLEMENT) !== COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT_SHA256) failures.push('Accepted source supplement SHA mismatch');
if (COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT.runtimeConsumptionAuthorized !== false) failures.push('Historical supplement runtimeConsumptionAuthorized mutated');
if (COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT.historicalEvidenceMutation) failures.push('Historical source-research artifacts were mutated');
if (COMMUNITY_REFERENCE_RUNTIME_PROFILE.capabilities.fullActFourPlayable) failures.push('fullActFourPlayable forced true');
if (listCommunityPhysicalMonsterInstances().length !== COMMUNITY_PHYSICAL_MONSTER_DECK_SIZE) failures.push('Physical Monster deck identity count is not 26');
for (const code of CLOSED) if (COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === code)) failures.push(`Closed blocker still active: ${code}`);
for (const code of SPLIT) if (!COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === code)) failures.push(`Split blocker missing: ${code}`);

const scanFiles = [
  SUITES.production.file,
  SUITES.routeMatrix.file,
  SUITES.adversarial.file,
  SUITES.saveReplay.file,
  'src/data/darkest-dungeon/community-reference/capability-test-support.ts',
];
for (const file of scanFiles) {
  const source = readFileSync(resolve(ROOT, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      if (/^(it|test|describe)\.(skip|todo|only)/.test(name)) failures.push(`${file}: forbidden test modifier ${name}`);
      if (name === 'expect' && node.arguments[0]?.kind === ts.SyntaxKind.TrueKeyword) failures.push(`${file}: vacuous expectation`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (file !== 'src/data/darkest-dungeon/community-reference/capability-test-support.ts' && /createCommunityFinalScenario/.test(source)) {
    failures.push(`${file}: injected Final checkpoint is not admissible`);
  }
}

const commands: Array<{ name: string; exitCode: number; durationMs: number; log: string; logSha256: string }> = [];
const run = (name: string, args: string[], timeout: number, env?: NodeJS.ProcessEnv): void => {
  const started = Date.now();
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, env: env ?? process.env });
  const log = `${OUTPUT}/${name}.log`;
  writeFileSync(resolve(ROOT, log), `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.stack ?? ''}`);
  const command = { name, exitCode: result.status ?? -1, durationMs: Date.now() - started, log, logSha256: sha256(log) };
  commands.push(command);
  if (command.exitCode !== 0) failures.push(`${name}: command failed; see ${log}`);
};

rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
run('engine-capability-final-acceptance', [
  'node_modules/vite-node/vite-node.mjs',
  'scripts/audit/verify-community-engine-capability-final-acceptance.ts',
  '--input', resolve(input),
  '--tts', resolve(tts),
], 1_200_000);

const structuredTestGroups: Record<string, any> = {};
for (const [name, suite] of Object.entries(SUITES)) {
  const output = `${OUTPUT}/${name}.vitest.json`;
  if (existsSync(output)) rmSync(output);
  run(name, ['node_modules/vitest/vitest.mjs', 'run', suite.file, '--reporter=json', `--outputFile=${output}`], 300_000);
  let assertions: Record<string, any>[] = [];
  try {
    assertions = (json(output).testResults ?? []).flatMap((entry: Record<string, any>) => entry.assertionResults ?? []);
  } catch (error) {
    failures.push(`${name}: unreadable structured report (${String(error)})`);
  }
  const count = (statuses: string[]) => assertions.filter((test) => statuses.includes(test.status)).length;
  const group = {
    expected: suite.expected,
    discovered: assertions.length,
    run: count(['passed', 'failed']),
    passed: count(['passed']),
    failed: count(['failed']),
    skipped: count(['pending', 'skipped', 'disabled']),
    todo: count(['todo']),
    reporter: output,
    sha256: existsSync(output) ? sha256(output) : null,
  };
  structuredTestGroups[name] = group;
  if (group.discovered !== group.expected || group.passed !== group.expected || group.failed || group.skipped || group.todo) {
    failures.push(`${name}: structured count mismatch ${JSON.stringify(group)}`);
  }
}

run('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit'], 300_000);
rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
run('build', ['node_modules/vite/bin/vite.js', 'build'], 300_000);

const e2eOutput = `${OUTPUT}/playable-closure-e2e.json`;
run('playableClosureE2E', ['scripts/e2e/run-community-act4-playable-closure-e2e.mjs'], 300_000, {
  ...process.env,
  COMMUNITY_E2E_JSON_PATH: resolve(ROOT, e2eOutput),
  PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(ROOT, e2eOutput),
});
const e2eResults: string[] = [];
try {
  const visit = (node: Record<string, any>): void => {
    for (const spec of node.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) e2eResults.push(result.status);
    for (const suite of node.suites ?? []) visit(suite);
  };
  if (existsSync(e2eOutput)) visit(json(e2eOutput));
} catch (error) {
  failures.push(`playableClosureE2E: unreadable report (${String(error)})`);
}
const e2e = {
  expected: 3,
  discovered: e2eResults.length,
  run: e2eResults.filter((status) => ['passed', 'failed', 'timedOut', 'interrupted'].includes(status)).length,
  passed: e2eResults.filter((status) => status === 'passed').length,
  failed: e2eResults.filter((status) => ['failed', 'timedOut', 'interrupted'].includes(status)).length,
  skipped: e2eResults.filter((status) => status === 'skipped').length,
  todo: 0,
  reporter: e2eOutput,
  sha256: existsSync(e2eOutput) ? sha256(e2eOutput) : null,
};
structuredTestGroups.e2e = e2e;
if (e2e.discovered !== 3 || e2e.passed !== 3 || e2e.failed || e2e.skipped) failures.push(`e2e: structured count mismatch ${JSON.stringify(e2e)}`);

const frozenCommunityE2e = readFileSync(resolve(ROOT, 'e2e/phase11a3-community-reference.spec.ts'), 'utf8');
if ((frozenCommunityE2e.match(/test\(/g) ?? []).length !== 1) failures.push('Frozen Community reference E2E file shape changed');

const engine = existsSync(ENGINE_EVIDENCE) ? json(ENGINE_EVIDENCE) : {};
const runtime = existsSync(RUNTIME_EVIDENCE) ? json(RUNTIME_EVIDENCE) : {};
const binding = existsSync(BINDING_EVIDENCE) ? json(BINDING_EVIDENCE) : {};
const visual = existsSync(VISUAL_EVIDENCE) ? json(VISUAL_EVIDENCE) : {};
const official = existsSync(OFFICIAL_EVIDENCE) ? json(OFFICIAL_EVIDENCE) : {};
const sourceResearch = existsSync(SOURCE_EVIDENCE) ? json(SOURCE_EVIDENCE) : {};
if (runtime.terminalVerdict !== 'COMMUNITY-REFERENCE-RUNTIME-FROZEN') failures.push('Runtime Gate not valid/frozen');
if (binding.terminalVerdict !== 'COMMUNITY-REFERENCE-DATA-BOUND') failures.push('Binding Gate not PASS');
if (visual.terminalVerdict !== 'COMMUNITY-VISUAL-ASSETS-ACCEPTED') failures.push('Visual Gate not accepted');
if (engine.terminalVerdict !== 'COMMUNITY-SOURCE-BACKED-ENGINE-CAPABILITIES-ACCEPTED') failures.push('Engine Capability Final Acceptance not accepted');
if (sourceResearch.terminalVerdict !== 'COMMUNITY-SOURCE-BLOCKERS-RESEARCHED') failures.push('Source-research identity is not the accepted researched state');
if (JSON.stringify([official.phase11A3Status, official.sourceReadinessRequiredMissingCount, official.sourceReadinessOptionalMissingCount, official.openP0, official.openP1, official.releaseGateSummary?.onlyOpenP0, official.releaseGateSummary?.officialGuardianMatrix?.combinationsRun, official.canCloseP0_002, official.canEnterPhase11B]) !== JSON.stringify(['SOURCE-BLOCKED', 26, 1, 1, 0, 'ISSUE-P0-002', 0, false, false])) {
  failures.push('Official Source Gate truth changed');
}

const relevance = json(RELEVANCE);
if (relevance.items.some((item: { blockerCode: string }) => CLOSED.includes(item.blockerCode))) failures.push('Relevance inventory still lists a closed blocker as remaining');
if (relevance.items.find((item: { blockerCode: string }) => item.blockerCode === 'COME_UNTO_YOUR_MAKER_UNRESOLVED')?.classification === 'not-runtime-relevant-for-community-profile') {
  failures.push('Come Unto Your Maker cannot be marked runtime-non-relevant while Heart of Darkness remains an accepted Community form');
}

const remainingBlockers = COMMUNITY_RUNTIME_BLOCKERS.map((blocker) => blocker.code);
const routeMatrix = {
  'We Are The Flame': { guardian: 'shuffling-horror', skip: 'ancestor-second-form', stopsAt: 'SHUFFLING_ROOM10_NON_AGGRESSIVE_STANCE_AREA_UNRESOLVED' },
  'Light the Way': { guardian: 'templars', skip: 'ancestor-first-form', stopsAt: 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED' },
  'Belly of the Beast': { guardian: 'mammoth-cyst', skip: 'gestating-heart', stopsAt: 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED|FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED|COME_UNTO_YOUR_MAKER_UNRESOLVED' },
};

const verifiedImplementationHead = git('rev-parse', 'HEAD');
const terminalVerdict = failures.length ? 'COMMUNITY-ACT-IV-PLAYABLE-CLOSURE-FAILED' : 'COMMUNITY-ACT-IV-INTEGRATION-PARTIAL';
const evidence = {
  schemaVersion: 'phase11a3-community-act4-playable-closure.v1',
  runId: randomUUID(),
  measuredAt: new Date().toISOString(),
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  verifiedBaseHead: BASE_HEAD,
  verifiedImplementationHead,
  evidencePublicationParent: verifiedImplementationHead,
  sourceSupplementSha256: sha256(SUPPLEMENT),
  sourceSupplementRuntimeConsumptionAuthorized: false,
  closedBlockers: CLOSED,
  splitBlockers: SPLIT,
  remainingBlockers,
  routeMatrix,
  browserEvidencePaths: [e2e.reporter],
  saveReplayEvidence: structuredTestGroups.saveReplay,
  physicalMonsterDeck: { expected: 26, mapped: listCommunityPhysicalMonsterInstances().length },
  structuredTestGroups,
  manualPlaytestCandidate: false,
  fullActFourPlayable: false,
  runtimeFieldCoverage: runtimeFieldCoverageTotals(),
  runtimeRelevance: { path: RELEVANCE, sha256: sha256(RELEVANCE) },
  gates: {
    binding: artifact(BINDING_EVIDENCE),
    runtime: artifact(RUNTIME_EVIDENCE),
    visual: artifact(VISUAL_EVIDENCE),
    engineCapability: artifact(ENGINE_EVIDENCE),
    sourceResearch: artifact(SOURCE_EVIDENCE),
    official: artifact(OFFICIAL_EVIDENCE),
  },
  canonicalInputs: { intakeSha256: sha256(resolve(input)), ttsSha256: sha256(resolve(tts)) },
  commands,
  communityFullActFourPlayable: false,
  phase11BEntered: false,
  terminalVerdict,
  failures,
};
mkdirSync(dirname(resolve(ROOT, EVIDENCE)), { recursive: true });
mkdirSync(dirname(resolve(ROOT, REPORT)), { recursive: true });
writeFileSync(resolve(ROOT, EVIDENCE), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(ROOT, REPORT), `# Phase 11A.3 Community Act IV Playable Closure

Terminal verdict: **${terminalVerdict}**

Implementation: \`${verifiedImplementationHead}\`

Accepted source supplement SHA256: \`${evidence.sourceSupplementSha256}\`

Historical \`runtimeConsumptionAuthorized\` remains **false**. Playable-closure consumes the supplement through the runtime adapter only.

## Closed / split / remaining

Closed:
${CLOSED.map((code) => `- ${code}`).join('\n')}

Split:
${SPLIT.map((code) => `- ${code}`).join('\n')}

Remaining:
${remainingBlockers.map((code) => `- ${code}`).join('\n')}

## Three-route matrix

| Quest | Guardian | Skipped form | Exact stop |
| --- | --- | --- | --- |
| We Are The Flame | Shuffling Horror | Ancestor second form | SHUFFLING_ROOM10_NON_AGGRESSIVE_STANCE_AREA_UNRESOLVED |
| Light the Way | Templars | Ancestor first form | TEMPLARS_PIT_EXIT_RULE_UNRESOLVED |
| Belly of the Beast | Mammoth Cyst | Gestating Heart | Final skill/transition after real Final Provision |

No complete product route reaches campaign victory. INTEGRATION-PARTIAL is the honest terminal. PLAYTEST-CANDIDATE and FULL-ACT-IV-PLAYABLE remain false.

## Physical Monster deck

Expected 26 distinct identities; mapped ${evidence.physicalMonsterDeck.mapped}.

## Structured tests

${Object.entries(structuredTestGroups).map(([name, group]) => `- ${name}: expected/discovered/run/passed/failed/skipped/todo = ${['expected', 'discovered', 'run', 'passed', 'failed', 'skipped', 'todo'].map((key) => group[key]).join('/')}`).join('\n')}

Frozen Community reference E2E count remains 3. Playable-closure browser evidence is a separate 3-test product/store path and does not use \`e2e-community-final\` injection.

## Fresh gates

- Binding: ${evidence.gates.binding.result}
- Runtime: ${evidence.gates.runtime.result}
- Visual: ${evidence.gates.visual.result}
- Engine Capability: ${evidence.gates.engineCapability.result}
- Source Research identity: ${evidence.gates.sourceResearch.result}
- Official: ${evidence.gates.official.result}; requiredMissing=26, optionalMissing=1, ISSUE-P0-002, Formal Matrix=0/9, canCloseP0_002=false, canEnterPhase11B=false

## Failures

${failures.length ? failures.map((failure) => `- ${failure}`).join('\n') : 'None measured.'}

STOP. Do not start Core Content bulk migration or Phase 11B on this branch.
`);
console.log(JSON.stringify({ terminalVerdict, physicalMonsterDeck: evidence.physicalMonsterDeck, structuredTestGroups: Object.fromEntries(Object.entries(structuredTestGroups).map(([name, group]) => [name, { expected: group.expected, discovered: group.discovered, passed: group.passed, failed: group.failed }])), failures }, null, 2));
if (failures.length) process.exit(1);
