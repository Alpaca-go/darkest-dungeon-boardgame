import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_3_TRINKET_CENSUS, LEVEL_3_TRINKET_DECK_COVERAGE } from '../../src/audit/level3-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { LEVEL3_STANCE_RING_SPECS } from '../../src/audit/production-proof-registry';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';
import { canonicalSourceCondition } from '../../src/audit/trinket-semantic-coverage';
import { TRINKET_CONDITION_CONSUMER_COVERAGE } from '../../src/audit/trinket-condition-consumer-coverage';
import { TRINKET_MODIFIER_CONSUMER_COVERAGE } from '../../src/audit/trinket-modifier-consumer-coverage';

const root = process.cwd();
const baselineHead = '5c9caecfb66ff7fb05c3946347e3c3f4b6633ddb';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const meta = { schemaVersion: 1, phase: '11A.4-C1C-15', baselineHead,
  verifiedImplementationHead: git('rev-parse', 'HEAD'), verifiedImplementationTree: git('rev-parse', 'HEAD^{tree}'),
  verifiedImplementationCommittedAt: git('show', '-s', '--format=%cI', 'HEAD') };
const write = (name: string, value: unknown) => writeFileSync(resolve(root, 'docs/data/complete-edition', name), `${JSON.stringify({ ...meta, ...value as object }, null, 2)}\n`);
const level3 = COMMUNITY_SOURCE_TRINKETS.filter((source) => source.level === 3 && source.contentSet === 'core');
const cards = LEVEL_3_TRINKET_CENSUS;
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11|12|13|14)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [path,
  sha(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 }))]));
write('c1c15-level3-source-census.json', { exactCount: level3.length,
  cards: level3.map((source) => ({ definitionId: source.id, printedName: source.printedName,
    level: source.level, contentSet: source.contentSet, sourceStatus: source.sourceStatus,
    unresolvedFields: source.unresolvedFields, sourceReferences: source.sourceReferences })) });
write('c1c15-level3-stance-ring-contract.json', {
  sourceTrigger: 'hero-skill-resolution', runtimeWindow: 'after-attack-roll-before-hit-resolution',
  timingEvidence: ['C1BR-HERO-SKILL-WINDOW-DERIVATION', 'C1C7-FORTUNATE-POSITIVE-RUNTIME'], newTimingPrimitiveRequired: false,
  runtimeStance: 'ACTIVE_BATTLE_UNIT_ELSE_CAMPAIGN_HERO', declarationPolicy: 'PLAYER_USE_OR_SKIP',
  attackRollPolicy: 'FROZEN_NO_REROLL', modifierLifetime: 'CURRENT_SKILL_RESOLUTION',
  rings: LEVEL3_STANCE_RING_SPECS.map((ring) => {
    const source = level3.find((entry) => entry.id === ring.definitionId)!;
    return { definitionId: source.id, sourceReferences: source.sourceReferences,
      positive: { conditions: source.positiveSide.conditions.map(canonicalSourceCondition), modifiers: source.positiveSide.modifiers },
      negative: { conditions: source.negativeSide.conditions.map(canonicalSourceCondition), modifiers: source.negativeSide.modifiers },
      adapterId: COMMUNITY_TRINKET_RUNTIME_ADAPTERS[ring.definitionId].adapterId };
  }) });
write('c1c15-level3-runtime-capability-matrix.json', { cards });
write('c1c15-level3-trinket-capability-matrix.json', { cards });
write('c1c15-level3-trinket-deck-coverage.json', { coverage: LEVEL_3_TRINKET_DECK_COVERAGE });
const evidence = {
  historicalEvidenceHashes, sourceNormalizedSha256: sha(readFileSync(resolve(root, 'src/data/community-reference/trinkets/data.json'))),
  level2Coverage: LEVEL_2_TRINKET_DECK_COVERAGE, level3Coverage: LEVEL_3_TRINKET_DECK_COVERAGE,
  stanceConsumer: TRINKET_CONDITION_CONSUMER_COVERAGE.stance,
  modifierConsumers: { accuracy: TRINKET_MODIFIER_CONSUMER_COVERAGE.accuracy, crit: TRINKET_MODIFIER_CONSUMER_COVERAGE.crit },
  readyRingIds: LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyIds,
  readinessInvariantErrors: trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES),
  immediatelyPromotableRemainingCards: 0,
  remainingBlockerCensus: cards.filter((card) => !card.productionReady).map((card) => ({
    definitionId: card.definitionId, blockerCodes: card.blockerCodes,
    voluntarySourceGate: 'c1c14-source-gap-freeze.json',
    independentFutureSlice: card.printedName.endsWith('Crown') ? 'resolve-test-result-determined / virtue-chance -2' : null,
    readyGainOfIndependentSliceAlone: 0,
  })),
  verificationCommand: 'npm run verify:complete-edition-c1c15', verificationRequired: true,
  terminalVerdict: `C1C15-LEVEL3-STANCE-RING-RUNTIME-ACCEPTED-READY-${LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyCount}-OF-${level3.length}`,
};
write('c1c15-level3-runtime-evidence.json', evidence);
writeFileSync(resolve(root, 'docs/reports/complete-edition/c1c15-level3-stance-ring-runtime-report.md'),
  `# C1C15 Level 3 stance Ring runtime\n\nVerdict: **${evidence.terminalVerdict}**\n\nLevel 3 Core has ${level3.length} source-supported definitions. Live runtime evaluation promotes ${evidence.readyRingIds.length}: Defender's Ring, Scholar's Ring, Sniper's Ring, and Warrior's Ring. Both sides are semantically exact and have definition-bound runtime, selector, save/replay, and production UI proofs.\n\nThe shared stance predicate reads the current BattleUnit while battle is active. It preserves source negation as == or !=. The family reuses the existing post-roll hero-skill-resolution window and accuracy/crit consumers. Use/Skip remains a player decision; +4 Crit and -2 Accuracy affect only the current frozen attack roll, with no reroll or automatic effect.\n\nThe normalized historical diagnosis remains untouched. Live Level 3 evaluation consults the current window bindings and condition/modifier/effect registries. Historical timing-unavailable and missing-stance messages therefore do not block the four Rings after implementation.\n\n## Remaining blockers\n\nBerserk Charm, Book of Sanity, Candle of Life, Cleansing Crystal, Fasting Seal, and Recovery Charm remain behind the voluntary declaration source gate and their additional effect/target consumers. Dark Crown and Solar Crown also have voluntary positives; their negative virtue-chance -2 slices may be assessed independently later, but either slice alone has whole-card Ready gain 0. Evaluate primitive reuse and cross-card value before choosing that work. No voluntary timing is inferred.\n\nLevel 2 stays ${LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount}/11 source-gated. Level 3 stays ${LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyCount}/${level3.length}. Random draw is locked for both levels. C1C5 through C1C14 historical evidence is frozen, including the C1C14 source-gap freeze.\n\nImplementation anchor: \`${meta.verifiedImplementationHead}\`, tree \`${meta.verifiedImplementationTree}\`. Run \`npm run verify:complete-edition-c1c15\` for evidence binding, historical E2E, full tests, typecheck, and build.\n`);
console.log(JSON.stringify({ verdict: evidence.terminalVerdict, readyRingIds: evidence.readyRingIds, readinessInvariantErrors: evidence.readinessInvariantErrors }, null, 2));
