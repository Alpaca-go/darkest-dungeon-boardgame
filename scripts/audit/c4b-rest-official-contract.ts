import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import census from '../../docs/data/complete-edition/c4a-standard-quest-census.json';
import matrix from '../../docs/data/complete-edition/c4a-standard-quest-capability-matrix.json';
import c4aStatus from '../../docs/data/complete-edition/c4a-standard-quest-status.json';
import nextC4A from '../../docs/data/complete-edition/c4a-next-workstream-decision.json';
import historical from '../../docs/data/complete-edition/rest-semantic-contract.json';
import normalized from '../../docs/data/complete-edition/quests/community-quest-normalized.json';
import bindings from '../../docs/data/complete-edition/quests/community-quest-source-evidence.json';
import coreExtract from '../../docs/data/complete-edition/c1c18-rulebook-extracted-evidence.json';
import discovery from '../../docs/data/complete-edition/source-assets/c1c38/locked-corpus-discovery.json';
import archiveLock from '../../docs/data/complete-edition/c1c32r2b-local-official-source-manifest.json';
import policy from '../../docs/data/complete-edition/rule-source-policy.json';

export const C4B_BASE = '8ac3de01c53dc23b47a9549cb8e219d4c93ff968';
const root = 'docs/data/complete-edition/';
export const SOURCE_MAP_PATH = root + 'c4b-rest-official-source-map.json';
// Review receipt: exact source hashes, page locators and manually assessed support.
// A text search cannot supply an absent completion rule. No PDF acquisition at runtime.
const REVIEW_SHA256 = '3967060e8b26b10b275aa07e5b37ab2c2a5b42041ca6972c4cfb80438f2e732a';
export const REQUIRED_FIELDS = ['firewoodUse', 'sessionBudget', 'restingPointAllocation', 'pointConversion',
  'multiplePointsPerHero', 'onePurposePerPoint', 'budgetConsumption', 'partialSpend', 'zeroPointRest',
  'insufficientRecoveryCapacity', 'roomGate', 'recoveryCap'] as const;
type Field = typeof REQUIRED_FIELDS[number];
export type OfficialStatus = 'OFFICIAL_EXPLICIT' | 'OFFICIAL_DERIVED' | 'OFFICIAL_INSUFFICIENT' | 'SOURCE_UNRESOLVED';
type Support = 'EXPLICIT' | 'DERIVED' | 'INSUFFICIENT' | 'NOT_APPLICABLE';
export interface SourceMap {
  schemaVersion: string; phase: string; baseC4AHead: string; sourcePolicy: string;
  inventoryCompletedBeforeSemanticDecision: boolean; externalAcquisition: boolean; transportIsAuthority: boolean;
  archiveRootLocator: string;
  sourceInventory: Array<{ sourceId: string; sourceClass: string; sourceFile: string; sourceSha256: string;
    lockFile: string; lockSha256: string; existingExtract: string | null; existingExtractSha256: string | null;
    pageCount: number; reviewedPages: number[]; pageTextSha256: string[]; termPages: number[]; scope: string }>;
  passages: Array<{ evidenceId: string; sourceId: string; sourceFile: string; page: number; region: string;
    pageTextSha256: string; literalWordingSummary: string; fieldSupport: Array<{ field: string; support: Support }> }>;
  historicalInventory: Array<{ path: string; sha256: string; role: string }>;
  printedQuestCards: Array<{ definitionId: string; sourceClass: string; frontAssetPath: string; frontSha256: string;
    observation: { file: string; jsonPointer: string; sha256: string }; printedRestingPoints: number | string | null;
    firewoodTokens: number; restInstructionTexts: string[]; completionSemanticsSupported: boolean }>;
  rejectedHistoricalAuthorities: Array<{ evidenceId: string; sourceClass: string; admissible: boolean; fields: string[] }>;
  corpusConclusion: string;
}
export const loadSourceMap = (): SourceMap => JSON.parse(readFileSync(SOURCE_MAP_PATH, 'utf8'));
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fileHash = (path: string) => sha256(readFileSync(path));
const unique = (values: readonly string[]) => [...new Set(values)].sort();
const admissibleClasses = ['OFFICIAL_LOCKED_RULEBOOK', 'OFFICIAL_PRINTED_COMPONENT', 'EXISTING_HASH_BOUND_OFFICIAL_EXTRACT'];
const blocked = (o: { classification: string }) => ['SOURCE_BLOCKED', 'NEEDS_NEW_RUNTIME_PRIMITIVE',
  'DEFERRED_SEMANTIC', 'NEEDS_QUEST_ADAPTER'].includes(o.classification);
const isRest = (o: { dependencies: string[] }) => o.dependencies.includes('REST');
const common = { schemaVersion: 'C4B-REST-OFFICIAL-REVIEW-v1', phase: '11A.7-C4B', baseC4AHead: C4B_BASE,
  sourcePolicy: policy.policyId };

export function assertSourceMap(map = loadSourceMap(), requireReceipt = true) {
  if (requireReceipt) {
    assert.equal(fileHash(SOURCE_MAP_PATH), REVIEW_SHA256, 'Reviewed source map changed');
    assert.equal(sha256(JSON.stringify(map, null, 2) + '\n'), REVIEW_SHA256, 'Unreviewed source map supplied');
  }
  assert.equal(map.sourcePolicy, 'RULEBOOK_ONLY_SOURCE_POLICY_V1');
  assert.equal(map.baseC4AHead, C4B_BASE);
  assert.ok(map.inventoryCompletedBeforeSemanticDecision && !map.externalAcquisition && !map.transportIsAuthority);
  assert.equal(map.sourceInventory.length, 10);
  assert.equal(new Set(map.sourceInventory.map(s => s.sourceId)).size, map.sourceInventory.length);
  for (const source of map.sourceInventory) {
    assert.ok(admissibleClasses.includes(source.sourceClass), 'Disallowed authority: ' + source.sourceClass);
    assert.equal(fileHash(source.lockFile), source.lockSha256);
    assert.deepEqual(source.reviewedPages, Array.from({ length: source.pageCount }, (_, i) => i + 1));
    assert.equal(source.pageTextSha256.length, source.pageCount);
    if (source.existingExtract) assert.equal(fileHash(source.existingExtract), source.existingExtractSha256);
    if (source.sourceId === 'CORE') {
      assert.equal(source.sourceSha256, coreExtract.sourceSha256);
      assert.deepEqual(source.pageTextSha256, coreExtract.pages.map(p => sha256(p.text)));
      if (existsSync(source.sourceFile)) assert.equal(fileHash(source.sourceFile), source.sourceSha256);
    } else {
      assert.ok(archiveLock.files.some(f => f.relativePath === source.sourceFile && f.sha256 === source.sourceSha256),
        'PDF is not in the frozen official archive lock');
      // Optional local corroboration; CI consumes the hash-pinned review, not unavailable archive paths.
      const path = join(map.archiveRootLocator, source.sourceFile);
      if (existsSync(path)) assert.equal(fileHash(path), source.sourceSha256);
      const prior = discovery.files.find(f => f.relativePath === source.sourceFile);
      if (source.existingExtract && prior) assert.equal(prior.sha256, source.sourceSha256);
    }
  }
  assert.equal(new Set(map.passages.map(p => p.evidenceId)).size, map.passages.length);
  for (const passage of map.passages) {
    const source = map.sourceInventory.find(s => s.sourceId === passage.sourceId)!;
    assert.ok(source && passage.sourceFile === source.sourceFile && source.reviewedPages.includes(passage.page));
    assert.equal(passage.pageTextSha256, source.pageTextSha256[passage.page - 1]);
    assert.ok(passage.region && passage.literalWordingSummary);
    for (const support of passage.fieldSupport) {
      assert.ok(REQUIRED_FIELDS.includes(support.field as Field));
      assert.ok(['EXPLICIT', 'DERIVED', 'INSUFFICIENT', 'NOT_APPLICABLE'].includes(support.support));
      if (['EXPLICIT', 'DERIVED'].includes(support.support)) {
        assert.ok(['CORE', 'CORE-PRINT'].includes(source.sourceId), 'Scoped tutorial/Farmstead evidence cannot close standard Rest');
        assert.equal(source.sourceClass, 'OFFICIAL_LOCKED_RULEBOOK');
      }
    }
  }
  for (const sourceId of ['CORE', 'CORE-PRINT']) for (const page of [11, 15, 19, 21, 25, 27, 28, 30, 32, 36, 40])
    assert.ok(map.passages.some(p => p.sourceId === sourceId && p.page === page), `Missing Rest/recovery context: ${sourceId} p${page}`);
  for (const sourceId of ['OLD-ROAD', 'OLD-ROAD-V2']) assert.ok(map.passages.some(p => p.sourceId === sourceId && p.page === 4));
  for (const page of [4, 7]) assert.ok(map.passages.some(p => p.sourceId === 'COM' && p.page === page));
  assert.ok(map.passages.some(p => p.sourceId === 'WEALD' && p.page === 3), 'Missing scoped healing restriction');
  for (const item of map.historicalInventory) assert.equal(fileHash(item.path), item.sha256);
  assert.equal(map.printedQuestCards.length, census.definitionCount);
  assert.deepEqual(unique(map.printedQuestCards.map(c => c.definitionId)), census.identitySet);
  for (const card of map.printedQuestCards) {
    assert.equal(card.sourceClass, 'OFFICIAL_PRINTED_COMPONENT');
    assert.equal(card.completionSemanticsSupported, false);
    const source = bindings.records.find(s => s.definitionId === card.definitionId)!;
    const q = census.quests.find(q => q.definitionId === card.definitionId)!;
    const normalizedRow = normalized.definitions.find(q => q.id === card.definitionId)!;
    const literal = JSON.parse(readFileSync(card.observation.file, 'utf8')).cards[Number(card.observation.jsonPointer.split('/').pop())];
    assert.equal(fileHash(card.frontAssetPath), card.frontSha256);
    assert.equal(fileHash(card.observation.file), card.observation.sha256);
    assert.equal(card.frontSha256, source.frontSha256);
    assert.deepEqual(card.observation, source.observation);
    assert.equal(card.printedRestingPoints, source.printedRestingPoints);
    assert.equal(card.printedRestingPoints, literal[3]);
    assert.equal(card.printedRestingPoints === '-' ? 0 : card.printedRestingPoints ?? 0, q.rest.firewood.restingPoints);
    assert.equal(card.firewoodTokens, q.rest.firewood.tokens);
    assert.deepEqual(normalizedRow.firewood, q.rest.firewood);
    assert.deepEqual(card.restInstructionTexts, unique(source.printedSpecialRules.filter(t => /\bRest(?:ing)?\b|\bFirewood\b|resting points/.test(t))));
  }
  assert.ok(map.rejectedHistoricalAuthorities.every(a => !a.admissible && !admissibleClasses.includes(a.sourceClass)));
}

const derivations: Partial<Record<Field, string>> = {
  multiplePointsPerHero: 'The party chooses how much each Hero receives; the equal-split fallback and discussion of amounts support more than one point per Hero. No new per-Hero limit is introduced.',
  onePurposePerPoint: 'One Life or one Stress per point is an alternative conversion; the same point is not two recoveries.'
};
const productionRequirements: Record<Field, string> = {
  firewoodUse: 'Determine Firewood eligibility and the resource debit after completing a standard Rest.',
  sessionBudget: 'Bind the correct current Quest budget to each Rest session.',
  restingPointAllocation: 'Keep allocation under player control with party agreement and the printed equal-split fallback.',
  pointConversion: 'Convert each spent point into the specified base Life or Stress recovery.',
  multiplePointsPerHero: 'Determine whether more than one point can be allocated to the same Hero.',
  onePurposePerPoint: 'Prevent the same point from being counted as both Life and Stress recovery.',
  budgetConsumption: 'Determine the budget condition required to commit a completed Rest.',
  partialSpend: 'Determine whether a partly spent positive budget may complete Rest.',
  zeroPointRest: 'Determine whether Rest with a positive printed budget can complete with no points spent.',
  insufficientRecoveryCapacity: 'Determine completion legality when the printed budget exceeds total recoverable Life/Stress.',
  roomGate: 'Restrict standard Rest initiation to a cleared Room.',
  recoveryCap: 'Determine legal allocations above current recovery need, not merely clamp actual recovery results.'
};
const insufficientReasons: Partial<Record<Field, string>> = {
  budgetConsumption: 'Distributing the printed amount and recovering per point spent does not explicitly require spending every point. The historical all-points forum authority is inadmissible.',
  partialSpend: 'Official text supplies neither permission nor prohibition to finish after a partial spend. The historical prohibition relies on the disallowed all-points clarification.',
  zeroPointRest: 'The historical derivation depends on a full-budget requirement that official evidence does not establish. Firewood discard after Rest does not establish zero-point completion legality.',
  insufficientRecoveryCapacity: 'No standard Rest passage selects waste-without-effect, discard, partial completion, inability to Rest, or another completion rule when recovery need is lower than the printed amount.',
  recoveryCap: 'Official Wound removal and the Stress track bound actual recovery, but do not establish the historical rule rejecting allocations above missing Life/current Stress. C4B does not infer allocation legality from a model invariant.'
};
export function deriveContract(map = loadSourceMap()) {
  for (const source of map.sourceInventory) assert.ok(admissibleClasses.includes(source.sourceClass), 'Disallowed authority');
  for (const passage of map.passages) {
    const source = map.sourceInventory.find(s => s.sourceId === passage.sourceId);
    assert.ok(source, 'Unbound official evidence');
    if (passage.fieldSupport.some(s => ['EXPLICIT', 'DERIVED'].includes(s.support)))
      assert.ok(['CORE', 'CORE-PRINT'].includes(source.sourceId) && source.sourceClass === 'OFFICIAL_LOCKED_RULEBOOK',
        'Scoped or disallowed authority cannot close standard Rest');
  }
  const fields = REQUIRED_FIELDS.map(field => {
    const evidence = map.passages.filter(p => p.fieldSupport.some(s => s.field === field && s.support !== 'NOT_APPLICABLE'));
    const supports = evidence.flatMap(p => p.fieldSupport.filter(s => s.field === field).map(s => s.support));
    const status: OfficialStatus = supports.includes('EXPLICIT') ? 'OFFICIAL_EXPLICIT' : supports.includes('DERIVED')
      ? 'OFFICIAL_DERIVED' : field === 'insufficientRecoveryCapacity' ? 'SOURCE_UNRESOLVED' : 'OFFICIAL_INSUFFICIENT';
    const productionUsable = ['OFFICIAL_EXPLICIT', 'OFFICIAL_DERIVED'].includes(status);
    const old = historical[field];
    return { field, historicalStatus: old.status, historicalEvidenceIds: old.sourceEvidenceIds,
      currentOfficialStatus: status, officialEvidence: evidence.map(p => p.evidenceId),
      derivation: derivations[field] ?? null, productionRequired: true,
      productionRequirement: productionRequirements[field],
      productionUsable, blockingReason: productionUsable ? null : insufficientReasons[field],
      rule: productionUsable ? (field === 'restingPointAllocation'
        ? 'Whole party agrees to Rest, then collectively allocates points; an equal split is available if distribution cannot be agreed.' : old.rule) : null };
  });
  const closedFields = fields.filter(f => f.productionUsable).map(f => f.field);
  const unresolvedFields = fields.filter(f => !f.productionUsable).map(f => f.field);
  const criticalAuthorityRepairs = ['budgetConsumption', 'partialSpend', 'zeroPointRest', 'insufficientRecoveryCapacity']
    .filter(f => fields.some(row => row.field === f && row.productionUsable));
  const outcome = unresolvedFields.length === 0 ? 'REST_OFFICIAL_CONTRACT_CLOSED' : criticalAuthorityRepairs.length
    ? 'REST_OFFICIAL_CONTRACT_PARTIAL' : 'REST_OFFICIAL_CONTRACT_UNRESOLVED';
  return { ...common, contractVersion: 'C4B-REST-OFFICIAL-CONTRACT-v1', canonicalClosure: unresolvedFields.length === 0,
    scope: 'Source review only; no successor execution, runtime binding or permission to use unresolved fields.',
    productionRequiredFields: [...REQUIRED_FIELDS], closedFields, unresolvedFields, criticalAuthorityRepairs,
    outcome, fields, projectRulingIntroduced: false };
}

type Readiness = keyof typeof c4aStatus.counts;
export function readinessAfter(obligations: Array<{ classification: string }>, boundProof: boolean): Readiness {
  const hard = unique(obligations.filter(o => ['SOURCE_BLOCKED', 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'DEFERRED_SEMANTIC']
    .includes(o.classification)).map(o => o.classification));
  if (hard.length > 1) return 'MULTI_BLOCKED';
  if (hard[0] === 'SOURCE_BLOCKED') return 'SOURCE_BLOCKED';
  if (hard[0] === 'NEEDS_NEW_RUNTIME_PRIMITIVE') return 'RUNTIME_PRIMITIVE_BLOCKED';
  if (hard[0] === 'DEFERRED_SEMANTIC') return 'DEFERRED_SEMANTIC';
  if (obligations.some(o => o.classification === 'NEEDS_QUEST_ADAPTER') || !boundProof) return 'ADAPTER_READY';
  return 'PRODUCTION_READY_EXISTING';
}
export function questImpact(contract = deriveContract()) {
  const isUsable = (field: string) => contract.fields.some(f => f.field === field && f.productionUsable);
  const canRemove = (cap: string) => cap === 'REST_OFFICIAL_SOURCE_SCOPE'
    ? ['budgetConsumption', 'partialSpend', 'zeroPointRest'].every(isUsable)
    : cap === 'REST_INSUFFICIENT_RECOVERY_CAPACITY' ? ['insufficientRecoveryCapacity', 'recoveryCap'].every(isUsable) : false;
  const affected = census.quests.filter(q => q.rest.firewood.tokens > 0).map(q => {
    const row = matrix.quests.find(r => r.definitionId === q.definitionId)!;
    const restBlockers = row.obligations.filter(o => isRest(o) && o.classification === 'SOURCE_BLOCKED');
    const removed = restBlockers.filter(o => canRemove(o.capabilityId));
    const remainingRest = restBlockers.filter(o => !canRemove(o.capabilityId));
    const nonRest = row.obligations.filter(o => !isRest(o));
    const current = row.obligations.filter(o => !removed.includes(o));
    const binding = q.currentBinding;
    return { definitionId: q.definitionId, restingPoints: q.rest.firewood.restingPoints,
      firewoodCount: q.rest.firewood.tokens, previousReadiness: q.readiness,
      previousRestBlockers: restBlockers.map(o => o.obligationId), currentRestBlockers: remainingRest.map(o => o.obligationId),
      removedRestSourceGates: removed.map(o => o.obligationId), sourceGateRemoved: removed.length > 0,
      restSourceClearAfterC4B: remainingRest.length === 0 && contract.canonicalClosure,
      unresolvedRestFields: contract.unresolvedFields,
      remainingNonRestBlockers: nonRest.filter(blocked).map(o => o.obligationId),
      currentReadiness: readinessAfter(current, binding.boundProductionProof),
      potentialReadinessAfterRestClosure: readinessAfter(nonRest, binding.boundProductionProof),
      hypotheticalOnly: true };
  });
  const candidates = nextC4A.conditionalExistingAdapterCandidates.map(id => {
    const impact = affected.find(q => q.definitionId === id)!;
    const censusRow = census.quests.find(q => q.definitionId === id)!;
    const row = matrix.quests.find(q => q.definitionId === id)!;
    const nonRest = row.obligations.filter(o => !isRest(o));
    const persistence = row.obligations.find(o => o.capabilityId === 'QUEST_SAVE_CHOICE_TRANSACTION_BINDING');
    return { definitionId: id, restSourceClearAfterC4B: impact.restSourceClearAfterC4B,
      remainingSourceBlockers: row.obligations.filter(o => o.classification === 'SOURCE_BLOCKED'
        && !impact.removedRestSourceGates.includes(o.obligationId)).map(o => o.obligationId),
      remainingNonRestSourceBlockers: nonRest.filter(o => o.classification === 'SOURCE_BLOCKED').map(o => o.obligationId),
      remainingAdapterWork: nonRest.filter(o => o.classification === 'NEEDS_QUEST_ADAPTER').map(o => o.capabilityId),
      existingRuntimeAdapter: { adapterId: censusRow.currentBinding.adapterId,
        availability: censusRow.currentBinding.adapterId ? 'EXISTING_HISTORICAL_ADAPTER' : 'ABSENT',
        productionProofBound: censusRow.currentBinding.boundProductionProof,
        officialRestCompatibility: 'UNPROVEN; historical Rest validator cannot supply canonical completion semantics' },
      saveReplayProofStatus: censusRow.currentBinding.boundProductionProof ? 'BOUND_EXISTING' : 'NO_CURRENT_PRODUCTION_BOUND_PROOF',
      frozenPersistenceEvidence: persistence?.parameters ?? null,
      selectorProofStatus: censusRow.currentBinding.selectorReachable ? 'SELECTOR_REACHABLE' : 'NOT_SELECTOR_REACHABLE',
      implementationEligible: impact.restSourceClearAfterC4B && !nonRest.some(o =>
        ['SOURCE_BLOCKED', 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'DEFERRED_SEMANTIC'].includes(o.classification)) };
  });
  const counts = { ...c4aStatus.counts };
  for (const q of affected) { counts[q.previousReadiness as keyof typeof counts]--; counts[q.currentReadiness]++; }
  return { ...common, sourceCensus: root + 'c4a-standard-quest-census.json', sourceObligations: root + 'c4a-standard-quest-capability-matrix.json',
    independentBlockerDetails: 'Obligation IDs refer to frozen C4A matrix; no non-Rest obligations reclassified.',
    currentQuestDefinitionCount: census.definitionCount, restGatedQuestCount: affected.length,
    previousRestSourceGateCount: affected.reduce((n, q) => n + q.previousRestBlockers.length, 0),
    restSourceGatesRemoved: affected.reduce((n, q) => n + q.removedRestSourceGates.length, 0),
    questsWithRestSourceGateRemoved: affected.filter(q => q.sourceGateRemoved).length,
    newProductionReadyExisting: affected.filter(q => q.previousReadiness !== 'PRODUCTION_READY_EXISTING' && q.currentReadiness === 'PRODUCTION_READY_EXISTING').map(q => q.definitionId),
    newAdapterReady: affected.filter(q => q.previousReadiness !== 'ADAPTER_READY' && q.currentReadiness === 'ADAPTER_READY').map(q => q.definitionId),
    counts, affectedQuests: affected, conditionalCandidates: candidates,
    implementationEligibleCandidateIds: candidates.filter(q => q.implementationEligible).map(q => q.definitionId) };
}

export function assertFrozenInputs() {
  execFileSync('git', ['merge-base', '--is-ancestor', C4B_BASE, 'HEAD']);
  const allowed = (p: string) => p === 'package.json' || p === '.github/workflows/development-fast-gate.yml'
    || /^(scripts\/audit\/c4b-|src\/audit\/c4b-|docs\/(data|reports)\/complete-edition\/c4b-)/.test(p);
  const list = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  const changed = list('diff', '--name-only', C4B_BASE);
  const untracked = list('ls-files', '--others', '--exclude-standard');
  assert.deepEqual([...changed, ...untracked].filter(p => !allowed(p)), [], 'C4B changed frozen or out-of-scope files');
  const before = JSON.parse(execFileSync('git', ['show', C4B_BASE + ':package.json'], { encoding: 'utf8' }));
  const after = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const key of Object.keys(after.scripts).filter(k => k.endsWith(':complete-edition-c4b'))) delete after.scripts[key];
  assert.deepEqual(after, before, 'Only C4B package scripts may change');
  return { baseC4AHead: C4B_BASE, frozenFilesReviewed: list('ls-tree', '-r', '--name-only', C4B_BASE).filter(p => !allowed(p)).length,
    gameplayRuntimeChanged: false, historicalRestContractChanged: false, c4aArtifactsChanged: false,
    c3FrozenVerifiersChanged: false, releaseGateWorkflowChanged: false };
}
export function buildC4B() {
  assertSourceMap();
  const contract = deriveContract();
  const impact = questImpact(contract);
  assert.deepEqual(impact.counts, c4aStatus.counts, 'Unresolved official Rest must not promote Quests');
  assert.equal(impact.restSourceGatesRemoved, 0);
  const sourceGaps = { ...common, corpusExhaustedUnderCurrentPolicy: true,
    exhaustedScope: 'All locked rulebooks/tutorials in the current manifests and existing printed Quest evidence; no external clarification acquired.',
    gaps: contract.fields.filter(f => !f.productionUsable).map(f => ({ field: f.field,
      currentOfficialStatus: f.currentOfficialStatus, officialEvidence: f.officialEvidence, blockingReason: f.blockingReason,
      canonicalStatus: 'SOURCE_UNRESOLVED', executableBehaviorAuthorized: false })),
    insufficientCapacityAlternatives: ['spend with no recovery effect', 'discard unused points', 'complete after partial use',
      'Rest cannot complete', 'another official rule'], selectedAlternative: null,
    furtherProgressRequires: ['Explicit user authorization for a versioned non-canonical PROJECT_RULING',
      'Identification of an omitted locked official rulebook page'], externalSourceUsed: false, projectRulingIntroduced: false };
  const decision = { ...common, decisionCount: 1, selectedWorkstream: 'REST_SOURCE_POLICY_DECISION_REQUIRED',
    status: 'AWAITING_USER_AUTHORIZATION_OR_OMITTED_LOCKED_OFFICIAL_PAGE',
    reason: 'The allowed corpus cannot establish production-safe completion. Do not repeat the exhausted review or start adapters.',
    permittedRoutes: sourceGaps.furtherProgressRequires, implementationBatchSelected: false,
    implementationEligibleQuestIds: impact.implementationEligibleCandidateIds, immediateQuestCoverageGain: 0,
    automaticProjectRulingAuthorized: false, continueSourceAcquisition: false };
  const status = { ...common, completion: 'C4B_REST_OFFICIAL_CONTRACT_REVIEW_COMPLETE', outcome: contract.outcome,
    sourceMapSha256: REVIEW_SHA256, officialSourceFilesReviewed: loadSourceMap().sourceInventory.length,
    officialStandardRestPages: [11, 15, 25, 30, 36], productionRequiredFields: contract.productionRequiredFields,
    officiallyClosedFields: contract.closedFields, unresolvedFields: contract.unresolvedFields,
    corpusExhaustedUnderCurrentPolicy: true, restGatedQuestCount: impact.restGatedQuestCount,
    restSourceGatesRemoved: impact.restSourceGatesRemoved, counts: impact.counts,
    newProductionReadyExisting: impact.newProductionReadyExisting.length, newAdapterReady: impact.newAdapterReady.length,
    implementationEligibleCandidateIds: impact.implementationEligibleCandidateIds, selectedWorkstream: decision.selectedWorkstream,
    freezeReview: assertFrozenInputs(), externalCommunitySourceUsed: false, projectRulingIntroduced: false,
    fullRegressionRun: false, browserTestsRun: false, questAdaptersImplemented: false,
    validationScope: ['npm ci', 'typecheck', 'verify:complete-edition-c4a (exact accepted base checkout)',
      'test:complete-edition-c4b', 'verify:complete-edition-c4b', 'build'] };
  return { contract, impact, sourceGaps, status, decision };
}
export function artifactsC4B() {
  const { contract, impact, sourceGaps, status, decision } = buildC4B();
  return { [root + 'c4b-rest-official-contract.json']: contract, [root + 'c4b-rest-quest-impact.json']: impact,
    [root + 'c4b-rest-source-gaps.json']: sourceGaps, [root + 'c4b-status.json']: status,
    [root + 'c4b-next-workstream-decision.json']: decision };
}
if (process.argv.includes('--write') || process.argv.includes('--verify')) {
  for (const [path, value] of Object.entries(artifactsC4B())) {
    const bytes = JSON.stringify(value, null, 2) + '\n';
    if (process.argv.includes('--write')) writeFileSync(path, bytes);
    else assert.equal(readFileSync(path, 'utf8'), bytes, 'Stale C4B artifact: ' + path);
  }
  console.log(JSON.stringify({ status: 'C4B_REST_OFFICIAL_CONTRACT_REVIEW_COMPLETE', outcome: deriveContract().outcome,
    restGatedQuests: questImpact().restGatedQuestCount, restSourceGatesRemoved: questImpact().restSourceGatesRemoved }));
}
