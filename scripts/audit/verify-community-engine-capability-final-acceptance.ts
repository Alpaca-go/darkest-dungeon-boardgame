import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { BASE_HEAD, capabilityAssessments, EXPECTED_TEST_IDS, officialTruth, readStructuredReport, resolveTestReference, SUITE_DIR, SUITES, testCounts, validateEvidenceBinding, validateTestGroup, type TestRow } from './community-engine-final-acceptance-contract';
import { COMMUNITY_RUNTIME_BLOCKERS, COMMUNITY_REFERENCE_RUNTIME_PROFILE } from '../../src/data/darkest-dungeon/community-reference/runtime-profile';
import { COMMUNITY_RUNTIME_FIELD_COVERAGE, runtimeFieldCoverageTotals, validateCommunityRuntimeFieldCoverage } from '../../src/data/darkest-dungeon/community-reference/runtime-field-coverage';
import { computeVerificationInputHash } from '../../src/audit/core-campaign/verification-input';

const ROOT = process.cwd();
const DATA = 'docs/data/darkest-dungeon/community-reference/';
const EVIDENCE = `${DATA}community-engine-capability-final-acceptance-evidence.json`;
const REPORT = 'docs/reports/phase-11a3/phase-11a3-community-engine-capability-final-acceptance-report.md';
const OUTPUT = 'docs/reports/phase-11a3/engine-final-acceptance/';
const OFFICIAL = 'docs/data/core-campaign/verification-results.json';
const RUNTIME = `${DATA}community-reference-runtime-evidence.json`;
const BINDING = `${DATA}antha-complete-edition/community-reference-binding-evidence.json`;
const VISUAL = `${DATA}community-visual-assets-fresh-evidence.json`;
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const json = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const sha = (path: string) => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const artifact = (path: string) => {
  if (!existsSync(path)) return { path, sha256: null, runId: null, measuredAt: null, verifiedImplementationHead: null, result: 'NOT-MEASURED' };
  const value = json(path); return { path, sha256: sha(path), runId: value.runId, measuredAt: value.measuredAt, verifiedImplementationHead: value.verifiedImplementationHead, result: value.terminalVerdict ?? value.phase11A3Status };
};

function checkPublication(): void {
  const evidence = json(EVIDENCE); const head = git('rev-parse', 'HEAD'); const parent = git('rev-parse', 'HEAD^');
  const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', head).split(/\r?\n/).filter(Boolean);
  const failures = validateEvidenceBinding({ verifiedImplementationHead: evidence.verifiedImplementationHead, expectedHead: parent, evidencePublicationParent: evidence.evidencePublicationParent, official: evidence.officialGate, freshOfficial: { ...artifact(OFFICIAL), truth: officialTruth(json(OFFICIAL)), verificationInputHash: json(OFFICIAL).verificationInputHash } });
  if (git('status', '--porcelain')) failures.push('Publication checkout is not clean');
  if (git('rev-list', '--parents', '-n', '1', head).split(' ').length !== 2) failures.push('Publication must have exactly one parent');
  if (!files.length || files.some(file => !file.startsWith('docs/data/') && !file.startsWith('docs/reports/'))) failures.push('Publication contains non-evidence files');
  if (computeVerificationInputHash() !== evidence.verificationInputHash) failures.push('Implementation input hash differs after publication');
  const expectedVerdict = evidence.failures.length ? 'COMMUNITY-SOURCE-BACKED-ENGINE-FINAL-ACCEPTANCE-BLOCKED' : 'COMMUNITY-SOURCE-BACKED-ENGINE-CAPABILITIES-ACCEPTED';
  if (evidence.terminalVerdict !== expectedVerdict) failures.push('Acceptance verdict contradicts measured failures');
  for (const identity of [evidence.runtimeGate, evidence.bindingGate, evidence.visualGate]) if ((existsSync(identity.path) ? sha(identity.path) : null) !== identity.sha256) failures.push(`Published artifact changed: ${identity.path}`);
  for (const group of Object.values(evidence.structuredTestGroups) as any[]) if ((existsSync(group.reporter) ? sha(group.reporter) : null) !== group.sha256) failures.push(`Published test report changed: ${group.reporter}`);
  for (const command of evidence.commands) if (sha(command.log) !== command.logSha256) failures.push(`Published command log changed: ${command.log}`);
  const result = { schemaVersion: 'community-engine-acceptance-publication.v1', runId: randomUUID(), measuredAt: new Date().toISOString(), publicationCommit: head, parent, verifiedImplementationHead: evidence.verifiedImplementationHead, evidenceSha256: sha(EVIDENCE), changedFiles: files, publicationValid: failures.length === 0, acceptanceFailures: evidence.failures, terminalVerdict: failures.length ? 'FAILED' : evidence.terminalVerdict, failures };
  const output = arg('--attestation');
  if (output) writeFileSync(resolve(output), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
}

function runAcceptance(): void {
  const input = arg('--input'); const tts = arg('--tts');
  if (!input || !tts || !existsSync(input) || !existsSync(tts)) throw new Error('Existing canonical --input and --tts files are required');
  if (git('status', '--porcelain')) throw new Error('Commit A must be clean before fresh acceptance verification');
  const verifiedImplementationHead = git('rev-parse', 'HEAD');
  git('merge-base', '--is-ancestor', BASE_HEAD, verifiedImplementationHead);
  const verificationInputHash = computeVerificationInputHash();
  const measuredStart = Date.now(); const runId = randomUUID();
  mkdirSync(resolve(OUTPUT), { recursive: true });
  const failures: string[] = []; const commands: any[] = [];
  const measuredJson = (path: string): any => {
    try { return json(path); }
    catch (error) { failures.push(`Unreadable measured artifact ${path}: ${String(error)}`); return {}; }
  };
  const measuredRows = (path: string): TestRow[] => {
    try { return readStructuredReport(measuredJson(path)); }
    catch (error) { failures.push(`Invalid structured test report ${path}: ${String(error)}`); return []; }
  };
  const baselineOfficial = JSON.parse(git('show', `${BASE_HEAD}:${OFFICIAL}`));
  const baselineTriage = JSON.parse(git('show', `${BASE_HEAD}:${DATA}community-engine-blocker-triage.json`));
  const baselineRuntime = JSON.parse(git('show', `${BASE_HEAD}:${RUNTIME}`));
  const previousIdentities = Object.fromEntries([OFFICIAL, RUNTIME, BINDING].map(path => [path, json(path).runId]));
  const run = (name: string, args: string[]) => {
    console.log(`START ${name}`); const started = Date.now();
    const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 64 * 1024 * 1024 });
    const log = `${OUTPUT}${name}.log`;
    writeFileSync(log, `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.stack ?? ''}`);
    const record = { name, args, exitCode: result.status ?? -1, durationMs: Date.now() - started, log, logSha256: sha(log), error: result.error?.message ?? null };
    commands.push(record); if (record.exitCode !== 0) failures.push(`${name}: command failed; ${log}`);
    console.log(`END ${name}: ${record.exitCode}`); return record;
  };
  const structuredGroups: Record<string, any> = {}; const rows: TestRow[] = [];
  for (const group of ['production', 'saveReplay', 'adversarial'] as const) {
    const path = `${OUTPUT}${group}.vitest.json`;
    if (existsSync(path)) unlinkSync(path);
    run(group, ['node_modules/vitest/vitest.mjs', 'run', SUITES[group], '--reporter=json', `--outputFile=${path}`]);
    const discovered = measuredRows(path); rows.push(...discovered);
    const counts = testCounts(discovered, EXPECTED_TEST_IDS[group].length);
    failures.push(...validateTestGroup(discovered, EXPECTED_TEST_IDS[group], counts).map(error => `${group}: ${error}`));
    structuredGroups[group] = { ...counts, reporter: path, sha256: existsSync(path) ? sha(path) : null, tests: discovered };
  }
  const triage = json(`${DATA}community-engine-blocker-triage.json`);
  const references: string[] = [...triage.entries, ...triage.splitBlockers].flatMap(entry => entry.tests);
  const otherFiles = [...new Set(references.map(reference => `${SUITE_DIR}${reference.split(':')[0]}`))].filter(file => !Object.values(SUITES).includes(file));
  for (const file of otherFiles) if (!existsSync(file)) throw new Error(`Missing triage file: ${file}`);
  const triageOutput = `${OUTPUT}triage.vitest.json`;
  if (existsSync(triageOutput)) unlinkSync(triageOutput);
  run('triageProofs', ['node_modules/vitest/vitest.mjs', 'run', ...otherFiles, '--reporter=json', `--outputFile=${triageOutput}`]);
  const triageRows = measuredRows(triageOutput); rows.push(...triageRows);
  // These source-gap suites retain their pre-existing expected inventory; no success is inferred for blocked capabilities.
  const triageCounts = testCounts(triageRows, 6 + 12 + 20 + 12 + 15);
  if (triageCounts.discovered !== triageCounts.expected || triageCounts.passed !== triageCounts.expected || triageCounts.failed || triageCounts.skipped || triageCounts.todo) failures.push('Triage supporting test inventory mismatch');
  structuredGroups.triageProofs = { ...triageCounts, reporter: triageOutput, sha256: existsSync(triageOutput) ? sha(triageOutput) : null };
  const resolvedReferences = references.map(reference => {
    try { return { reference, test: resolveTestReference(reference, rows) }; }
    catch (error) { failures.push(String(error)); return { reference, error: String(error) }; }
  });
  // Detect vacuous expectations and executable skip/todo calls, not words inside descriptions.
  for (const file of [...Object.values(SUITES), `${SUITE_DIR}capability-test-support.ts`]) {
    const source = readFileSync(file, 'utf8'); const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(ast);
        if (/^(it|test|describe)\.(skip|todo|only)/.test(name)) failures.push(`${file}: forbidden test modifier ${name}`);
        if (name === 'expect' && node.arguments[0]?.kind === ts.SyntaxKind.TrueKeyword) failures.push(`${file}: vacuous expectation`);
      }
      ts.forEachChild(node, visit);
    }; visit(ast);
    if (/createCommunityFinalScenario|activeFormId\s*:/.test(source)) failures.push(`${file}: injected Final checkpoint is not admissible`);
  }
  const assessments = capabilityAssessments(rows); failures.push(...assessments.errors, ...validateCommunityRuntimeFieldCoverage());
  const supplementConsumed = new Set(['FINAL_PROVISION_POLICY_UNRESOLVED', 'MONSTER_DECK_DRAW_POLICY_UNRESOLVED', 'SHUFFLING_INITIAL_AREA_UNRESOLVED', 'EXCAVATION_PROVISION_DIE_MAP_UNRESOLVED', 'ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED']);
  const protectedCodes = [...baselineTriage.entries.filter((entry: any) => entry.resolutionClass === 'source-gap').map((entry: any) => entry.blockerCode), ...baselineRuntime.activeBlockers.filter((blocker: any) => blocker.classification === 'source-level').map((blocker: any) => blocker.code)];
  for (const code of protectedCodes) if (!supplementConsumed.has(code) && !COMMUNITY_RUNTIME_BLOCKERS.some(blocker => blocker.code === code)) failures.push(`Source-gap removed without authority: ${code}`);
  const protectedPaths = ['src/audit/core-campaign', 'docs/data/darkest-dungeon/official', 'src/data/darkest-dungeon/community-reference/normalized.ts', `${DATA}antha-complete-edition/normalized-requirements.json`, `${DATA}antha-complete-edition/source-reference-index.json`, `${DATA}antha-complete-edition/source-binding-manifest.json`];
  if (git('diff', '--name-only', BASE_HEAD, '--', ...protectedPaths)) failures.push('Protected source / Official area changed');
  run('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']);
  run('build', ['node_modules/vite/bin/vite.js', 'build']);
  // Runtime invokes fresh Official and Binding verifiers and binds their actual identities.
  run('runtimeGate', ['node_modules/vite-node/vite-node.mjs', 'scripts/audit/verify-community-reference-runtime.ts', '--input', input]);
  run('visualGate', ['scripts/audit/verify-community-visual-assets.mjs', '--intake', input, '--tts', tts, '--evidence', VISUAL]);
  run('officialSourceGate', ['node_modules/vite-node/vite-node.mjs', 'scripts/audit/verify-phase11a3-source-gate.ts']);
  const official = measuredJson(OFFICIAL); const runtime = measuredJson(RUNTIME); const binding = measuredJson(BINDING); const visual = measuredJson(VISUAL);
  const officialGate = { ...artifact(OFFICIAL), truth: officialTruth(official), verificationInputHash: official.verificationInputHash };
  if (JSON.stringify(officialGate.truth) !== JSON.stringify(officialTruth(baselineOfficial))) failures.push('Fresh Official exact truth changed from the measured baseline');
  if (!official.verificationFresh || !official.engineeringRegressionPasses || official.verificationInputHash !== verificationInputHash) failures.push('Official evidence is stale or regressions failed');
  for (const path of [OFFICIAL, RUNTIME, BINDING, VISUAL]) {
    const value = measuredJson(path);
    if (!value.runId || value.runId === previousIdentities[path] || Date.parse(value.measuredAt) < measuredStart) failures.push(`Gate not freshly measured: ${path}`);
    if (path !== OFFICIAL && value.verifiedImplementationHead !== verifiedImplementationHead) failures.push(`Gate verified wrong implementation: ${path}`);
  }
  if (runtime.terminalVerdict !== 'COMMUNITY-REFERENCE-RUNTIME-FROZEN' || !Array.isArray(runtime.errors) || runtime.errors.length) failures.push('Runtime Gate not valid/frozen');
  if (binding.terminalVerdict !== 'COMMUNITY-REFERENCE-DATA-BOUND' || !Array.isArray(binding.errors) || binding.errors.length) failures.push('Binding Gate not PASS');
  if (runtime.bindingEvidenceRunId !== binding.runId || runtime.bindingEvidenceSha256 !== sha(BINDING)) failures.push('Runtime / Binding identity mismatch');
  if (visual.terminalVerdict !== 'COMMUNITY-VISUAL-ASSETS-ACCEPTED' || visual.failed || visual.skipped || visual.checks.length !== 19) failures.push('Visual Gate not fully measured/accepted');
  if (git('rev-parse', 'HEAD') !== verifiedImplementationHead || computeVerificationInputHash() !== verificationInputHash) failures.push('Implementation changed during verification');
  const runtimeGate = artifact(RUNTIME); const bindingGate = artifact(BINDING); const visualGate = artifact(VISUAL);
  const evidence = {
    schemaVersion: 'phase11a3-community-engine-capability-final-acceptance.v1', runId, measuredAt: new Date().toISOString(),
    verificationScope: 'LOCAL MEASURED VERIFICATION', verifiedBaseHead: BASE_HEAD, verifiedImplementationHead, evidencePublicationParent: verifiedImplementationHead,
    publicationContract: 'Acceptance is valid only at a clean evidence-only direct child; run --check-publication to attest the actual commit relationship.',
    verificationInputHash, canonicalInputSha256: sha(input), ttsSha256: sha(tts),
    capabilities: assessments.capabilities, acceptedClosures: assessments.acceptedClosures, partialClosures: assessments.partialClosures, notProvenClosures: assessments.notProvenClosures,
    acceptanceScopeNotes: [
      'Resistance acceptance covers categorical duration reduction/immunity on the five instantiated Guardian actors, persisted application receipts, and replay. Independent overlapping condition-stack timing is not certified by this gate.',
      'Critical acceptance covers the three printed Mammoth Cyst / White Cell Stalk threshold-and-damage leaves, saved rolls and target-bound replay. Area-wide critical Stress side effects and general Accuracy/Dodge rules are not certified by these tests.',
      'Final field projections outside the six claimed capabilities remain historical binding coverage; they are not evidence of a playable Final encounter.',
    ],
    reinstatedOrSplitBlockers: COMMUNITY_RUNTIME_BLOCKERS.filter(blocker => !protectedCodes.includes(blocker.code)), remainingBlockers: COMMUNITY_RUNTIME_BLOCKERS,
    fieldCoverage: runtimeFieldCoverageTotals(), fieldCoverageLeaves: COMMUNITY_RUNTIME_FIELD_COVERAGE,
    structuredTestGroups: structuredGroups, triageProofReferences: resolvedReferences, commands,
    runtimeGate, bindingGate, visualGate, officialGate,
    'COMMUNITY-FULL-ACT-IV-PLAYABLE': COMMUNITY_REFERENCE_RUNTIME_PROFILE.capabilities.fullActFourPlayable,
    terminalVerdict: failures.length ? 'COMMUNITY-SOURCE-BACKED-ENGINE-FINAL-ACCEPTANCE-BLOCKED' : 'COMMUNITY-SOURCE-BACKED-ENGINE-CAPABILITIES-ACCEPTED', failures,
  };
  writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
  const verdictTable = evidence.capabilities.map(capability => `| ${capability.id} | ${capability.verdict} | ${capability.scope.filter(leaf => leaf.classification === 'consumed').length} | ${capability.scope.filter(leaf => leaf.blocker).length} |`).join('\n');
  writeFileSync(REPORT, `# Community Engine Capability Final Acceptance\n\n${evidence.terminalVerdict}\n\nLOCAL MEASURED VERIFICATION; independent final audit remains the acceptance authority.\n\nImplementation: ${verifiedImplementationHead}\n\nPublication parent must equal implementation: ${evidence.evidencePublicationParent}. An evidence-only child and --check-publication are required.\n\n| Claimed capability | Verdict | Consumed leaves | Blocked leaves |\n| --- | --- | --- | --- |\n${verdictTable}\n\nFinal Provision is consumed from the accepted source supplement. Final skill and transition remain not-proven on the real Community prepare/start/action path. No Final runtime state was injected. Shuffling reserve cleanup is exercised, while cleanup of deployed Priest/Growth remains blocked because Echoing Disassembly is split on Room 10 non-aggressive areas.\n\nAcceptance scope: ${evidence.acceptanceScopeNotes.join(' ')}\n\nAccepted global closures: ${evidence.acceptedClosures.join(', ')}\n\nPartial global closures: ${evidence.partialClosures.join(', ')}\n\nNot proven: ${evidence.notProvenClosures.join(', ')}\n\nStructured counts (expected/discovered/run/passed/failed/skipped/todo):\n\n${Object.entries(structuredGroups).map(([name, group]) => `- ${name}: ${['expected','discovered','run','passed','failed','skipped','todo'].map(key => group[key]).join('/')}`).join('\n')}\n\nRuntime field coverage: ${JSON.stringify(evidence.fieldCoverage)}\n\nRuntime: ${JSON.stringify(runtimeGate)}\n\nBinding: ${JSON.stringify(bindingGate)}\n\nVisual: ${JSON.stringify(visualGate)}\n\nOfficial: ${JSON.stringify(officialGate)}\n\nCOMMUNITY-FULL-ACT-IV-PLAYABLE=${evidence['COMMUNITY-FULL-ACT-IV-PLAYABLE']}\n\nRemaining blockers:\n\n${COMMUNITY_RUNTIME_BLOCKERS.map(blocker => `- ${blocker.code}: ${blocker.runtimeDependency}`).join('\n')}\n\nFailures:\n\n${failures.length ? failures.map(error => `- ${error}`).join('\n') : 'None measured.'}\n\nSTOP: no Source Blocker Resolution and no Phase 11B.\n`);
  console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, capabilities: evidence.capabilities.map(({ id, verdict }) => ({ id, verdict })), failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

if (process.argv.includes('--check-publication')) checkPublication(); else runAcceptance();
