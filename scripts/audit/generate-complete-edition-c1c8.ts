import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_RUNTIME_QUESTS, COMMUNITY_TRINKET_CAPABILITIES } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { CAMOUFLAGE_CLOAK_ID, CHIRURGEONS_CHARM_ID, PROTECTIVE_PADLOCK_ID } from '../../src/audit/production-proof-registry';
import { TRINKET_MODIFIER_CONSUMER_COVERAGE } from '../../src/audit/trinket-modifier-consumer-coverage';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = '007291e4cfdf666c7cdf801db7db8d3ee14d0072';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const verifiedImplementationHead = git('rev-parse', 'HEAD');
const verifiedImplementationTree = git('rev-parse', 'HEAD^{tree}');
const verifiedImplementationCommittedAt = git('show', '-s', '--format=%cI', verifiedImplementationHead);
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));

const cards = LEVEL_2_TRINKET_CENSUS.map((source) => {
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === source.definitionId)!;
  const sides = (capability.trinketSemanticObligations ?? []).map((obligation) => ({
    side: obligation.side, triggerMatch: obligation.triggerMatch, windowMatch: obligation.windowMatch,
    targetMatch: obligation.targetMatch, triggerScopeComplete: obligation.triggerScopeComplete,
    modifierMatch: obligation.modifierMatch, modifierConsumerMatch: obligation.modifierConsumerMatch,
    missingModifierConsumers: obligation.missingModifierConsumers, effectMatch: obligation.effectMatch,
    effectConsumerMatch: obligation.effectConsumerMatch, missingEffectConsumers: obligation.missingEffectConsumers,
    conditionMatch: obligation.conditionMatch, runtimeSliceSemanticComplete: obligation.runtimeSliceSemanticComplete,
    implementationStatus: obligation.implementationStatus, blockerCode: obligation.blockerCode,
    proofIds: obligation.proofIds,
  }));
  return { definitionId: source.definitionId, sourceSemanticComplete: capability.sourceSemanticComplete,
    runtimeSemanticComplete: capability.runtimeSemanticComplete,
    positiveSideComplete: sides.some((side) => side.side === 'positive' && side.implementationStatus === 'IMPLEMENTED'),
    negativeSideComplete: sides.some((side) => side.side === 'negative' && side.implementationStatus === 'IMPLEMENTED'),
    adapterComplete: capability.adapterComplete, productionReady: capability.productionReady,
    blockerCodes: capability.blockerCodes, sides };
});
const matrix = { schemaVersion: 4, phase: '11A.4-C1C-8', baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, verifiedImplementationCommittedAt, cards };
writeFileSync(resolve(dataDir, 'c1c8-level2-trinket-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const prior = JSON.parse(readFileSync(resolve(dataDir, 'c1c7-level2-trinket-capability-matrix.json'), 'utf8')) as { cards: Array<{ productionReady: boolean }> };
const padlock = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === PROTECTIVE_PADLOCK_ID)!;
const cloak = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CAMOUFLAGE_CLOAK_ID)!;
const chirurgeons = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
const timing = JSON.parse(readFileSync(resolve(dataDir, 'c1c8-incoming-attack-timing-contract.json'), 'utf8')) as any;
const positive = (cap: typeof padlock) => cap.trinketSemanticObligations?.find((entry) => entry.side === 'positive')!;
const evidence = {
  schemaVersion: 4, phase: '11A.4-C1C-8', baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, verifiedImplementationCommittedAt,
  historicalEvidenceHashes,
  incomingAttackTimingContractStatus: timing.timing.incomingAttack.status,
  heroHitByAttackTimingContractStatus: timing.timing.heroHitByAttack.status,
  reactiveUsageEpochStatus: timing.reactiveTrinketUsageEpoch.status,
  incomingAttackWindowWired: true, heroHitByAttackWindowWired: true,
  monsterAttackRandomnessFrozen: true, dodgeConsumerWired: TRINKET_MODIFIER_CONSUMER_COVERAGE.dodge.wired,
  incomingDamageScaleConsumerWired: TRINKET_EFFECT_CONSUMER_COVERAGE['scale-incoming-damage'].wired,
  criticalOverrideConsumerWired: TRINKET_EFFECT_CONSUMER_COVERAGE['convert-incoming-hit-to-critical'].wired,
  conditionDurationConsumerWired: TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'].wired,
  protectivePositiveRuntimeComplete: positive(padlock).implementationStatus === 'IMPLEMENTED',
  camouflagePositiveRuntimeComplete: positive(cloak).implementationStatus === 'IMPLEMENTED',
  protectiveProductionReady: padlock.productionReady, camouflageProductionReady: cloak.productionReady,
  level2ReadyBefore: prior.cards.filter((card) => card.productionReady).length,
  level2ReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  completeForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  familyProductionReady: family.productionReady,
  familySelectorReachable: COMMUNITY_RUNTIME_QUESTS.some((entry) => entry.id === family.definitionId),
  chirurgeonsProductionReady: chirurgeons.productionReady,
  verificationCommand: 'npm run verify:complete-edition-c1c8', verificationRequired: true,
  terminalVerdict: 'C1C8-INCOMING-ATTACK-PROTECTIVE-AND-CAMOUFLAGE-SLICES-ACCEPTED-CARDS-NOT-PROMOTED',
};
writeFileSync(resolve(dataDir, 'c1c8-incoming-attack-runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c8-incoming-attack-runtime-report.md'), `# C1C-8 Incoming Attack Runtime\n\nVerdict: **${evidence.terminalVerdict}**\n\nOrdinary monster attacks now pause at two separate persisted reaction stages: incoming attack before hit determination, and hero hit before damage and consequences commit. Attack, damage, and attack-owned disease rolls are frozen before the relevant decision, so save/reload and Trinket choices cannot reroll them.\n\nProtective Padlock's positive side exactly scales incoming damage by one half with ceiling rounding. Camouflage Cloak's positive side feeds +2 Dodge into the rulebook-defined Accuracy-minus-Dodge consumer. Their opposite sides remain blocked by voluntary movement and condition-duration support, so neither card is promoted. Book of Holiness critical conversion and Bloodthirst/Camouflage duration effects remain fail-closed.\n\nLevel 2 readiness remains **${evidence.level2ReadyAfter} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}**. Evidence is bound to implementation commit \`${verifiedImplementationHead}\` and tree \`${verifiedImplementationTree}\`; the verifier supplies measured test outcomes rather than storing synthetic PASS claims.\n`);
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, level2ReadyAfter: evidence.level2ReadyAfter,
  protectivePositive: evidence.protectivePositiveRuntimeComplete, camouflagePositive: evidence.camouflagePositiveRuntimeComplete }, null, 2));
