import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMMUNITY_RUNTIME_FIELD_COVERAGE } from '../../src/data/darkest-dungeon/community-reference/runtime-field-coverage';
import { COMMUNITY_RUNTIME_BLOCKERS } from '../../src/data/darkest-dungeon/community-reference/runtime-profile';

export const BASE_HEAD = '8a3f7b2dbbadfb1b921287fb6c23c36e3d4d644f';
export const SUITE_DIR = 'src/data/darkest-dungeon/community-reference/';
export const SUITES = {
  production: `${SUITE_DIR}community-engine-capability-production.test.ts`,
  saveReplay: `${SUITE_DIR}community-engine-capability-save-replay.test.ts`,
  adversarial: `${SUITE_DIR}community-engine-capability-adversarial.test.ts`,
};
const actors = ['templars-impaler', 'templars-warlord', 'mammoth-cyst', 'white-cell-stalk', 'shuffling-horror'];
const summoned = ['cultist-priest', 'malignant-growth'];
export const EXPECTED_TEST_IDS = {
  production: [
    ...[...actors, ...summoned].flatMap(actor => ['bleed', 'blight', 'stun', 'shuffle'].map(category => `P-resistance-${actor}-${category}`)),
    ...[0, 1, 2].map(index => `P-skill-resistance-${index}`),
    'P-critical-mammoth-cyst-1', 'P-critical-mammoth-cyst-6', 'P-critical-white-cell-stalk-5',
    ...['templars-impaler', 'templars-warlord', 'shuffling-horror', 'cultist-priest', 'malignant-growth'].map(actor => `P-critical-${actor}-5`),
    'P-quest-provision', 'P-quest-isolation', 'P-quest-living', 'P-final-skill', 'P-final-transition',
    'P-victory-templars', 'P-victory-mammoth', 'P-victory-shuffling',
    ...[0, 1, 2].map(index => `P-round-limit-${index}`),
  ],
  saveReplay: [
    ...[...actors, ...summoned].map(actor => `SR-resistance-${actor}`),
    'SR-critical-mammoth-cyst-1', 'SR-critical-mammoth-cyst-6', 'SR-critical-white-cell-stalk-5',
    ...['templars-impaler', 'templars-warlord', 'shuffling-horror', 'cultist-priest', 'malignant-growth'].map(actor => `SR-critical-${actor}-5`),
    'SR-quest-provision', 'SR-final-skill', 'SR-final-transition',
    'SR-victory-templars', 'SR-victory-mammoth', 'SR-victory-shuffling', 'SR-shuffling-deployed-blocker',
  ],
  adversarial: Array.from({ length: 23 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`),
};
export type TestRow = { file: string; title: string; fullName: string; status: string };
export type TestCounts = { expected: number; discovered: number; run: number; passed: number; failed: number; skipped: number; todo: number };
export function readStructuredReport(report: any): TestRow[] {
  if (!Array.isArray(report?.testResults)) throw new Error('Missing structured testResults');
  return report.testResults.flatMap((suite: any) => {
    if (!Array.isArray(suite.assertionResults)) throw new Error('Missing structured assertionResults');
    return suite.assertionResults.map((test: any) => ({ file: String(suite.name).split('\\').join('/'), title: test.title, fullName: test.fullName, status: test.status }));
  });
}
export function testCounts(rows: TestRow[], expected: number): TestCounts {
  const count = (...statuses: string[]) => rows.filter(row => statuses.includes(row.status)).length;
  return { expected, discovered: rows.length, run: count('passed', 'failed'), passed: count('passed'), failed: count('failed'), skipped: count('pending', 'skipped', 'disabled'), todo: count('todo') };
}
export function validateTestGroup(rows: TestRow[], expectedIds: readonly string[], counts = testCounts(rows, expectedIds.length)): string[] {
  const errors: string[] = [];
  for (const key of ['discovered', 'run', 'passed'] as const) if (counts[key] !== counts.expected) errors.push(`${key} != expected`);
  for (const key of ['failed', 'skipped', 'todo'] as const) if (counts[key] !== 0) errors.push(`${key} != 0`);
  const ids = rows.map(row => row.title.split(' ')[0]);
  if (new Set(ids).size !== ids.length) errors.push('duplicate test identity');
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...expectedIds].sort())) errors.push('expected named test inventory mismatch');
  if (rows.some(row => !['passed', 'failed', 'pending', 'skipped', 'disabled', 'todo'].includes(row.status))) errors.push('unknown test result status');
  return errors;
}
export function resolveTestReference(reference: string, rows: TestRow[], fileExists = (path: string) => existsSync(resolve(path))): TestRow {
  const separator = reference.indexOf(':');
  if (separator < 1) throw new Error(`Malformed test reference: ${reference}`);
  const file = reference.slice(0, separator); const name = reference.slice(separator + 1);
  const path = file.includes('/') ? file : `${SUITE_DIR}${file}`;
  if (!fileExists(path)) throw new Error(`Missing test file: ${path}`);
  const found = rows.filter(row => row.file.endsWith(`/${path}`) && (row.title === name || row.title.startsWith(`${name} `)));
  if (found.length !== 1) throw new Error(`Missing or ambiguous named test: ${reference}`);
  if (found[0].status !== 'passed') throw new Error(`Proof test did not pass: ${reference}`);
  return found[0];
}

type Verdict = 'accepted' | 'family-partial' | 'leaf-partial' | 'not-proven';
const claims = [
  ['resistance', 'GUARDIAN_RESISTANCE_ENGINE_UNSUPPORTED', 'leaf-partial'],
  ['critical', 'GUARDIAN_CRIT_ENGINE_UNSUPPORTED', 'family-partial'],
  ['quest-provision', 'QUEST_CARD_PROVISION_POLICY_ENGINE_UNSUPPORTED', 'leaf-partial'],
  ['final-skill', 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED', 'leaf-partial'],
  ['final-transition', 'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED', 'leaf-partial'],
  ['guardian-victory', 'GUARDIAN_VICTORY_POLICY_ENGINE_UNSUPPORTED', 'leaf-partial'],
] as const;
type Leaf = typeof COMMUNITY_RUNTIME_FIELD_COVERAGE[number];
function leafBelongs(id: string, leaf: Leaf): boolean {
  if (id === 'resistance') return leaf.sourcePath.startsWith('resistances.');
  if (id === 'critical') return leaf.sourcePath.startsWith('crit.');
  if (id === 'quest-provision') return leaf.sourcePath === 'provisionPolicyId.cardSpecific';
  if (id === 'final-skill') return leaf.blockerCode === 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED' || (/^tierB-(ancestor|gestating|heart-of|perfect-reflection|imperfect-reflection)/.test(leaf.requirementId) && /skillIds|d10SkillTable|impendingDoomD10SkillMap|vacantStanceFillSource/.test(leaf.sourcePath));
  if (id === 'final-transition') return leaf.requirementId === 'tierB-ancestor-room' && leaf.sourcePath === 'roomEffects';
  return leaf.sourcePath.startsWith('victoryCondition');
}
function proofIds(id: string, leaf: Leaf): { production: string[]; saveReplay: string[] } {
  const actor = leaf.requirementId.replace('tierB-', '');
  if (id === 'resistance') return { production: [`P-resistance-${actor}-${leaf.sourcePath.split('.')[1]}`, `P-skill-resistance-${actor.startsWith('templars') ? 1 : actor === 'shuffling-horror' ? 0 : 2}`], saveReplay: [`SR-resistance-${actor}`] };
  if (id === 'critical') {
    const roll = leaf.sourcePath.endsWith('digestion') ? 6 : actor === 'mammoth-cyst' ? 1 : 5;
    return { production: [`P-critical-${actor}-${roll}`], saveReplay: [`SR-critical-${actor}-${roll}`] };
  }
  if (id === 'quest-provision') return { production: ['P-quest-provision', 'P-quest-isolation', 'P-quest-living'], saveReplay: ['SR-quest-provision'] };
  if (id === 'guardian-victory') {
    const family = actor.startsWith('templars') ? 'templars' : actor.startsWith('mammoth') ? 'mammoth' : 'shuffling';
    return { production: [`P-victory-${family}`, `P-round-limit-${family === 'templars' ? 1 : family === 'mammoth' ? 2 : 0}`], saveReplay: [`SR-victory-${family}`] };
  }
  // No success contract exists for an unreachable Community Final transaction.
  return { production: [], saveReplay: [] };
}
export function capabilityAssessments(rows: TestRow[], coverage = COMMUNITY_RUNTIME_FIELD_COVERAGE, blockers: readonly { code: string }[] = COMMUNITY_RUNTIME_BLOCKERS) {
  const errors: string[] = [];
  const capabilities = claims.map(([id, claimedBlockerCode, partialKind]) => {
    const leaves = coverage.filter(leaf => leafBelongs(id, leaf));
    if (!leaves.length) errors.push(`${id}: semantic inventory is empty`);
    const scope = leaves.map(leaf => {
      const proofs = proofIds(id, leaf);
      const supported = leaf.classification === 'consumed';
      if (supported) {
        if (!leaf.runtimeSelectorId) errors.push(`${id}: consumed leaf lacks runtimeSelector`);
        if (!proofs.production.length || !proofs.saveReplay.length) errors.push(`${id}: missing production/save proof contract`);
        for (const group of ['production', 'saveReplay'] as const) for (const name of proofs[group]) {
          try { resolveTestReference(`${SUITES[group]}:${name}`, rows); } catch (error) { errors.push(String(error)); }
        }
      } else if (leaf.classification !== 'not-runtime-relevant' && (!leaf.blockerCode || !blockers.some(blocker => blocker.code === leaf.blockerCode))) errors.push(`${id}: unsupported semantic has no active blocker`);
      return { semantic: `${leaf.requirementId}.${leaf.sourcePath}`, classification: leaf.classification, sourceReference: leaf.sourceReference, runtimeSelector: leaf.runtimeSelectorId, blocker: leaf.blockerCode, proofs: supported ? proofs : { production: [], saveReplay: [] } };
    });
    const relevant = scope.filter(leaf => leaf.classification !== 'not-runtime-relevant');
    const consumed = relevant.filter(leaf => leaf.classification === 'consumed');
    const verdict: Verdict = !consumed.length ? 'not-proven' : consumed.length === relevant.length ? 'accepted' : partialKind;
    if (verdict === 'accepted' && blockers.some(blocker => blocker.code === claimedBlockerCode)) errors.push(`${id}: accepted scope still globally blocked`);
    if (verdict !== 'accepted' && !relevant.some(leaf => leaf.blocker)) errors.push(`${id}: partial closure without exact blocker`);
    return { id, claimedBlockerCode, verdict, scope };
  });
  return { capabilities, errors, acceptedClosures: capabilities.filter(capability => capability.verdict === 'accepted').map(capability => capability.claimedBlockerCode), partialClosures: capabilities.filter(capability => ['family-partial', 'leaf-partial'].includes(capability.verdict)).map(capability => capability.claimedBlockerCode), notProvenClosures: capabilities.filter(capability => capability.verdict === 'not-proven').map(capability => capability.claimedBlockerCode) };
}
export function officialTruth(official: any) {
  const truth = {
    status: official.phase11A3Status, requiredMissing: official.sourceReadinessRequiredMissingCount,
    optionalMissing: official.sourceReadinessOptionalMissingCount, openP0: official.openP0, openP1: official.openP1,
    onlyOpenP0: official.releaseGateSummary?.onlyOpenP0, formalMatrix: official.releaseGateSummary?.officialGuardianMatrix,
    canCloseP0_002: official.canCloseP0_002, canEnterPhase11B: official.canEnterPhase11B,
  };
  if (Object.values(truth).some(value => value === undefined)) throw new Error('Incomplete Official evidence');
  return truth;
}
export function validateEvidenceBinding(input: { verifiedImplementationHead: string; expectedHead: string; evidencePublicationParent: string; official: unknown; freshOfficial: unknown }): string[] {
  const errors: string[] = [];
  if (input.verifiedImplementationHead !== input.expectedHead || input.evidencePublicationParent !== input.expectedHead) errors.push('Implementation HEAD / publication parent mismatch');
  if (JSON.stringify(input.official) !== JSON.stringify(input.freshOfficial)) errors.push('Official truth differs from fresh artifact');
  return errors;
}
