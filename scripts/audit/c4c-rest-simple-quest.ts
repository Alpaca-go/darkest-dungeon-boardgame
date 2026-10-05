import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import census from '../../docs/data/complete-edition/c4a-standard-quest-census.json';
import matrix from '../../docs/data/complete-edition/c4a-standard-quest-capability-matrix.json';
import predecessor from '../../docs/data/complete-edition/c4b-rest-quest-impact.json';
import roi from '../../docs/data/complete-edition/c4a-standard-quest-roi-matrix.json';
import { C4C_SIMPLE_QUEST_IDS } from '../../src/audit/c4c-quest-batch';
import { C4C_REST_RULING_ID, effectiveRestContract, effectiveRestSemanticsAuthorized } from '../../src/audit/c4c-rest-effective-contract';
import { COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_RUNTIME_QUESTS } from '../../src/data/community-reference/production-runtime';

export const C4C_BASE = '56dd2dc1d863fc02f781aeaa57441351c3921225';
const root = 'docs/data/complete-edition/';
const blocked = (o: { classification: string }) => ['SOURCE_BLOCKED', 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'DEFERRED_SEMANTIC', 'NEEDS_QUEST_ADAPTER'].includes(o.classification);
const isRest = (o: { dependencies: string[] }) => o.dependencies.includes('REST');
export function currentObligations(id: string) {
  return matrix.quests.find(q => q.definitionId === id)!.obligations.filter(o => !isRest(o)
    && !(C4C_SIMPLE_QUEST_IDS.includes(id) && o.capabilityId === 'QUEST_SAVE_CHOICE_TRANSACTION_BINDING'));
}
export function currentReadiness(id: string) {
  const capability = COMMUNITY_QUEST_CAPABILITIES.find(c => c.definitionId === id);
  if (capability?.productionRuntimeReady) return 'PRODUCTION_RUNTIME_READY';
  const q = census.quests.find(q => q.definitionId === id)!;
  if (q.currentBinding.boundProductionProof) return 'PRODUCTION_READY_EXISTING';
  const remaining = currentObligations(id);
  const hard = new Set(remaining.filter(o => ['SOURCE_BLOCKED', 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'DEFERRED_SEMANTIC'].includes(o.classification)).map(o => o.classification));
  if (hard.size > 1) return 'MULTI_BLOCKED';
  if (hard.has('SOURCE_BLOCKED')) return 'SOURCE_BLOCKED';
  if (hard.has('NEEDS_NEW_RUNTIME_PRIMITIVE')) return 'RUNTIME_PRIMITIVE_BLOCKED';
  if (hard.has('DEFERRED_SEMANTIC')) return 'DEFERRED_SEMANTIC';
  return 'ADAPTER_READY';
}
export function nextDecision() {
  const remaining = census.quests.filter(q => !['PRODUCTION_RUNTIME_READY', 'PRODUCTION_READY_EXISTING'].includes(currentReadiness(q.definitionId)));
  const items = roi.items.filter(i => i.workType === 'ADAPTER').map(i => {
    const family = i.backlogId.split(':')[1];
    const affected = remaining.filter(q => currentObligations(q.definitionId).some(o => blocked(o) && o.capabilityId === family));
    const authorized = affected.filter(q => !currentObligations(q.definitionId).some(o => ['SOURCE_BLOCKED', 'DEFERRED_SEMANTIC'].includes(o.classification)));
    const unlocked = authorized.filter(q => currentObligations(q.definitionId).filter(blocked).every(o => o.capabilityId === family));
    return { family, affectedQuestCount: affected.length, effectivelyAuthorizedQuestCount: authorized.length,
      expectedWholeQuestCoverageGain: unlocked.length, unlockedQuestIds: unlocked.map(q => q.definitionId),
      authorizedQuestIds: authorized.map(q => q.definitionId), existingPrimitiveReuse: true,
      architectureCost: i.implementationComplexity, semanticAmbiguity: 'LOW_FOR_SOURCE_CLEAR_BINDING_ONLY' };
  }).sort((a, b) => b.expectedWholeQuestCoverageGain - a.expectedWholeQuestCoverageGain
    || b.effectivelyAuthorizedQuestCount - a.effectivelyAuthorizedQuestCount || b.affectedQuestCount - a.affectedQuestCount
    || a.family.localeCompare(b.family));
  return { phase: '11A.7-C4C', decisionCount: 1, selectedWorkstream: items[0].family,
    expectedNextCoverageGain: items[0].expectedWholeQuestCoverageGain,
    expectedAuthorizedBindingCoverage: items[0].effectivelyAuthorizedQuestCount,
    priority: ['authorized whole-Quest gain', 'authorized affected Quests', 'reuse', 'existing primitives', 'architecture cost', 'ambiguity'],
    candidates: items, automaticImplementation: false,
    reason: 'Recomputed from post-C4C non-Rest obligations. Partial binding coverage is not whole-Quest readiness; official-source and deferred gates remain.' };
}

export function assertFrozenInputs() {
  const allowed = (p: string) => /^(docs\/(data|reports)\/complete-edition\/c4c-|src\/audit\/c4c-|scripts\/audit\/c4c-)/.test(p)
    || ['package.json', '.github/workflows/development-fast-gate.yml', 'src/audit/production-proof-registry.ts',
      'src/data/community-reference/production-runtime.ts', 'src/game-engine/quests/quest-runtime.ts',
      'src/game-engine/save.ts', 'src/types/content-runtime.ts', 'src/pages/DungeonExplorePage.tsx'].includes(p);
  const changed = execFileSync('git', ['diff', '--name-only', C4C_BASE], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual([...changed, ...untracked].filter(p => !allowed(p)), [], 'Out-of-scope C4C changes');
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', C4C_BASE], { encoding: 'utf8' }).trim().split('\n')
    .filter(p => /docs\/data\/complete-edition\/(c4[ab]-|c1c21-|rest-semantic-contract|rule-source-policy)/.test(p)
      || /scripts\/audit\/c3[cde]-mon/.test(p) || p === '.github/workflows/release-gate.yml');
  for (const p of paths) assert.equal(readFileSync(p, 'utf8'), execFileSync('git', ['show', `${C4C_BASE}:${p}`], { encoding: 'utf8', maxBuffer: 20_000_000 }), `Frozen file changed: ${p}`);
  return { frozenFileCount: paths.length, officialRestContractChanged: false, predecessorEvidenceChanged: false };
}
export function buildC4C() {
  assert.ok(effectiveRestSemanticsAuthorized());
  const rows = census.quests.map(q => ({ definitionId: q.definitionId, effectiveReadiness: currentReadiness(q.definitionId) }));
  const counts: Record<string, number> = {};
  rows.forEach(r => { counts[r.effectiveReadiness] = (counts[r.effectiveReadiness] ?? 0) + 1; });
  const affectedQuests = predecessor.affectedQuests.map(q => ({ definitionId: q.definitionId,
    firewoodTokens: q.firewoodCount, restingPoints: q.restingPoints,
    officialRestStatus: 'REST_OFFICIAL_CONTRACT_UNRESOLVED', officialSourceGate: 'UNRESOLVED',
    effectiveRestAuthority: 'PROJECT_RULING', rulingId: C4C_REST_RULING_ID,
    effectiveProductionGate: 'SATISFIED_BY_PROJECT_RULING', effectiveRestExecutable: true,
    predecessorNonRestBlockers: q.remainingNonRestBlockers,
    remainingNonRestBlockers: currentObligations(q.definitionId).filter(blocked).map(o => o.obligationId),
    dischargedNonRestBlockers: C4C_SIMPLE_QUEST_IDS.includes(q.definitionId) ? [`${q.definitionId}:persistence`] : [],
    effectiveReadiness: currentReadiness(q.definitionId) }));
  const activation = C4C_SIMPLE_QUEST_IDS.map(id => {
    const c = COMMUNITY_QUEST_CAPABILITIES.find(c => c.definitionId === id)!;
    assert.ok(c.productionRuntimeReady && c.selectorReachable && c.saveReplayProofComplete);
    return { definitionId: id, readiness: 'PRODUCTION_RUNTIME_READY', adapterId: 'c1c1-simple-community-quest-v1',
      restSemanticAuthority: c.restSemanticAuthority, rulingId: c.restRuleVersion,
      runtimeProof: 'C4C-SIMPLE-RUNTIME', saveReplayProof: 'C4C-SIMPLE-SAVE-REPLAY', selectorProof: 'C4C-SIMPLE-SELECTOR',
      productionUiAcceptance: 'NOT_CLAIMED', remainingNonRestBlockers: [] };
  });
  const decision = nextDecision();
  const status = { phase: '11A.7-C4C', completion: 'C4C_REST_RULING_AND_SIMPLE_QUEST_RUNTIME_COMPLETE', baseC4BHead: C4C_BASE,
    rulingId: C4C_REST_RULING_ID, authority: 'PROJECT_RULING', canonical: false, productionAuthorized: true,
    officialRestOutcome: 'REST_OFFICIAL_CONTRACT_UNRESOLVED', restGatedQuestCount: affectedQuests.length,
    effectiveRestGatesSatisfiedByRuling: affectedQuests.length, effectiveRestObligationsSatisfied: predecessor.previousRestSourceGateCount,
    officialSourceGatesFalselyClosed: 0, counts, totalExecutableQuestDefinitions: COMMUNITY_RUNTIME_QUESTS.length,
    remainingOfficialRestSourceBlockedCount: affectedQuests.length,
    newProductionRuntimeReady: activation.length, newAdapterReady: rows.filter(r => r.effectiveReadiness === 'ADAPTER_READY').length,
    remainingOfficialNonRestSourceBlockedCount: rows.filter(r => currentObligations(r.definitionId).some(o => o.classification === 'SOURCE_BLOCKED')).length,
    remainingRuntimePrimitiveBlockedCount: rows.filter(r => currentObligations(r.definitionId).some(o => o.classification === 'NEEDS_NEW_RUNTIME_PRIMITIVE')).length,
    remainingDeferredSemanticCount: rows.filter(r => currentObligations(r.definitionId).some(o => o.classification === 'DEFERRED_SEMANTIC')).length,
    selectedNextWorkstream: decision.selectedWorkstream, expectedNextCoverageGain: decision.expectedNextCoverageGain,
    externalCommunityRuleAuthorityUsed: false, fullRegressionRun: false, fullBrowserSuiteRun: false, productionReleaseGate: 'NOT_RUN',
    freezeReview: assertFrozenInputs(), validationScope: ['npm ci', 'typecheck', 'exact-base C4B verifier', 'C4C tests', 'C4C verifier', 'build'],
    stopAfterCompletion: true };
  return {
    [root + 'c4c-rest-effective-contract.json']: effectiveRestContract(),
    [root + 'c4c-rest-quest-impact.json']: { phase: '11A.7-C4C', predecessor: root + 'c4b-rest-quest-impact.json',
      currentQuestDefinitionCount: rows.length, restGatedQuestCount: affectedQuests.length, officialRestSourceGatesRemoved: 0,
      effectiveRestGatesSatisfiedByRuling: affectedQuests.length, affectedQuests, counts },
    [root + 'c4c-simple-quest-production-status.json']: { phase: '11A.7-C4C', activation, allQuestReadiness: rows,
      executableQuestIds: COMMUNITY_RUNTIME_QUESTS.map(q => q.id), totalExecutableQuestDefinitions: COMMUNITY_RUNTIME_QUESTS.length },
    [root + 'c4c-status.json']: status,
    [root + 'c4c-next-workstream-decision.json']: decision,
  };
}
if (process.argv.includes('--write') || process.argv.includes('--verify')) {
  for (const [path, value] of Object.entries(buildC4C())) {
    const text = JSON.stringify(value, null, 2) + '\n';
    if (process.argv.includes('--write')) writeFileSync(path, text);
    else assert.equal(readFileSync(path, 'utf8'), text, `Stale artifact: ${path}`);
  }
  console.log('C4C artifacts and frozen evidence: PASS');
}
