import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_1_TRINKET_CENSUS, LEVEL_1_TRINKET_DECK_COVERAGE, LEVEL_1_BASELINE_DECK_COVERAGE } from '../../src/audit/level1-trinket-deck';
import { LEVEL_3_TRINKET_DECK_COVERAGE } from '../../src/audit/level3-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { LEVEL1_STANCE_ACCURACY_SPECS } from '../../src/audit/production-proof-registry';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';
import { canonicalSourceCondition } from '../../src/audit/trinket-semantic-coverage';
import { TRINKET_CONDITION_CONSUMER_COVERAGE } from '../../src/audit/trinket-condition-consumer-coverage';
import { TRINKET_MODIFIER_CONSUMER_COVERAGE } from '../../src/audit/trinket-modifier-consumer-coverage';

const root = process.cwd();
const baselineHead = '24dc66cbd27b3a28abf76babd6d8fd6e3865507f';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const meta = { schemaVersion: 1, phase: '11A.4-C1C-16', baselineHead,
  verifiedImplementationHead: git('rev-parse', 'HEAD'), verifiedImplementationTree: git('rev-parse', 'HEAD^{tree}'),
  verifiedImplementationCommittedAt: git('show', '-s', '--format=%cI', 'HEAD') };
const write = (name: string, value: unknown) => writeFileSync(resolve(root, 'docs/data/complete-edition', name), `${JSON.stringify({ ...meta, ...value as object }, null, 2)}\n`);
const level1 = COMMUNITY_SOURCE_TRINKETS.filter((source) => source.level === 1 && source.contentSet === 'core');
const cards = LEVEL_1_TRINKET_CENSUS;
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11|12|13|14|15)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [path,
  sha(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 }))]));
write('c1c16-level1-source-census.json', { exactCount: level1.length,
  cards: level1.map((source) => ({ definitionId: source.id, printedName: source.printedName,
    level: source.level, contentSet: source.contentSet, sourceStatus: source.sourceStatus,
    unresolvedFields: source.unresolvedFields, sourceReferences: source.sourceReferences })) });
write('c1c16-level1-stance-accuracy-contract.json', {
  sourceTrigger: 'hero-skill-resolution', runtimeWindow: 'after-attack-roll-before-hit-resolution',
  timingEvidence: ['C1BR-HERO-SKILL-WINDOW-DERIVATION', 'C1C7-FORTUNATE-POSITIVE-RUNTIME'], newTimingPrimitiveRequired: false,
  runtimeStance: 'ACTIVE_BATTLE_UNIT_ELSE_CAMPAIGN_HERO', declarationPolicy: 'PLAYER_USE_OR_SKIP',
  attackRollPolicy: 'FROZEN_NO_REROLL', modifierLifetime: 'CURRENT_SKILL_RESOLUTION',
  cards: LEVEL1_STANCE_ACCURACY_SPECS.map((ring) => {
    const source = level1.find((entry) => entry.id === ring.definitionId)!;
    return { definitionId: source.id, sourceReferences: source.sourceReferences,
      positive: { conditions: source.positiveSide.conditions.map(canonicalSourceCondition), modifiers: source.positiveSide.modifiers },
      negative: { conditions: source.negativeSide.conditions.map(canonicalSourceCondition), modifiers: source.negativeSide.modifiers },
      adapterId: COMMUNITY_TRINKET_RUNTIME_ADAPTERS[ring.definitionId].adapterId };
  }) });
write('c1c16-level1-trinket-capability-matrix.json', { cards });
write('c1c16-level1-trinket-deck-coverage.json', { coverage: LEVEL_1_TRINKET_DECK_COVERAGE });
const evidence = {
  historicalEvidenceHashes, sourceNormalizedSha256: sha(readFileSync(resolve(root, 'src/data/community-reference/trinkets/data.json'))),
  level1BaselineCoverage: LEVEL_1_BASELINE_DECK_COVERAGE,
  level2Coverage: LEVEL_2_TRINKET_DECK_COVERAGE, level1Coverage: LEVEL_1_TRINKET_DECK_COVERAGE, level3Coverage: LEVEL_3_TRINKET_DECK_COVERAGE,
  stanceConsumer: TRINKET_CONDITION_CONSUMER_COVERAGE.stance,
  modifierConsumers: { accuracy: TRINKET_MODIFIER_CONSUMER_COVERAGE.accuracy, crit: TRINKET_MODIFIER_CONSUMER_COVERAGE.crit },
  readyIds: LEVEL_1_TRINKET_DECK_COVERAGE.productionReadyIds,
  readinessInvariantErrors: trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES),
  remainingBlockerCensus: cards.filter((card) => !card.productionReady).map((card) => ({
    definitionId: card.definitionId, blockerCodes: card.blockerCodes,
    sourceContracts: level1.find((source) => source.id === card.definitionId)!,
    nextStageCandidate: /-(bleed|blight|debuff|stun)-charm$/.test(card.definitionId),
    readyGainOfSingleSide: 0,
  })),
  verificationCommand: 'npm run verify:complete-edition-c1c16', verificationRequired: true,
  terminalVerdict: `C1C16-LEVEL1-STANCE-ACCURACY-RUNTIME-ACCEPTED-READY-${LEVEL_1_TRINKET_DECK_COVERAGE.productionReadyCount}-OF-${level1.length}`,
};
write('c1c16-level1-runtime-evidence.json', evidence);
writeFileSync(resolve(root, 'docs/reports/complete-edition/c1c16-level1-stance-accuracy-runtime-report.md'),
  `# C1C16 Level 1 stance accuracy runtime

Verdict: **${evidence.terminalVerdict}**

Level 1 Core has ${level1.length} source definitions. Current runtime, semantic comparison and definition-bound proofs recognize 6 Ready cards: Accuracy Stone, Critical Stone, Archer's Ring, Sage's Book, Warrior's Bracer, and Warrior's Cap. Existing C1BR stone adapters and proofs are reused.

The four new cards use the existing post-roll window: positive Accuracy +2 with matching BattleUnit stance, negative Accuracy -1 without any stance predicate. Warrior's Bracer has one +2 modifier; duplicate printed Acc is retained only in source evidence. The frozen attack die is never rerolled; ordinary hit damage uses the existing separate damage RNG. Use/Decline, physical instances, one use per turn, and save/replay remain unchanged. No gameplay primitive was introduced.

## Remaining Level 1 blocker ROI

All eight remaining cards are listed with their exact source contracts in runtime evidence. Bleed Charm, Blight Charm, Debuff Charm and Stun Charm form the strongest next family candidate (potential whole-card gain 4 after both sides close). C1C8 pre-damage hit staging and C1C9 condition magnitude/duration can be reused, but the positive skill-target must bind to the enemy rather than self. Their negative hero-causes-condition / condition-being-caused window and modify-condition-duration -1 consumer need an exact contract before implementation. Debuff/Stun source amounts are null: preserve their source semantics and resolve how the existing status representation handles categorical conditions. Do not copy the self-condition consumer onto an enemy target.

Caution Cloak's scout positive may reuse C1C10 staging, but its voluntary light -1 negative remains source-gated; positive-only gain 0. Speed Stone is voluntary-gated on both choose-one sides. Damage Stone's +3 slice can reuse existing damage accumulation, but hero-takes-damage / suffer-wounds needs a separate contract; positive-only gain 0. Survival Guide requires exploration-die ignore/replace result contracts. These are deferred; no remaining card is promoted by this phase.

Level 1 stays 6/14; Level 2 stays 4/11 source-gated; Level 3 stays 4/12 with the C1C15 Ring IDs unchanged. Random draw is locked at all three levels. C1C5 through C1C15 evidence/report hashes and normalized source are frozen.

Implementation anchor: \`${meta.verifiedImplementationHead}\`, tree \`${meta.verifiedImplementationTree}\`. Run \`npm run verify:complete-edition-c1c16\` for all eleven E2E suites, full tests, typecheck and build.
`);
console.log(JSON.stringify({ verdict: evidence.terminalVerdict, readyIds: evidence.readyIds, readinessInvariantErrors: evidence.readinessInvariantErrors }, null, 2));
