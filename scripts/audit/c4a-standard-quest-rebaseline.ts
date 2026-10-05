import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import runtimeQuestData from '../../src/data/community-reference/quests/data.json';
import historical from '../../docs/data/complete-edition/c1c21-standard-quest-live-capability-matrix.json';
import sourceEvidence from '../../docs/data/complete-edition/quests/community-quest-source-evidence.json';
import normalized from '../../docs/data/complete-edition/quests/community-quest-normalized.json';
import freeze from '../../docs/data/complete-edition/c3e-monster-production-freeze.json';
import heroAcceptance from '../../docs/data/complete-edition/c2e-production-player-path-acceptance.json';
import encounterReadiness from '../../docs/data/complete-edition/c3d-monster-encounter-readiness.json';
import trinketBlockers from '../../docs/data/complete-edition/c1c20-core-trinket-terminal-blocker-register.json';
import policy from '../../docs/data/complete-edition/rule-source-policy.json';
import { COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_QUEST_RUNTIME_ADAPTERS, COMMUNITY_RUNTIME_QUESTS,
  COMMUNITY_QUEST_PRODUCTION_PROOFS } from '../../src/data/community-reference/production-runtime';
import { semanticObligationsForQuest } from '../../src/audit/quest-semantic-coverage';
import { REST_SEMANTIC_CONTRACT, deriveUnresolvedRestSemantics } from '../../src/audit/rest-semantic-contract';
import { measureTrinketDeckCoverage } from '../../src/audit/level2-trinket-deck';
import { sourceTrinketDeck } from '../../src/game-engine/trinkets/source-deck';
import { listProductionMonsterDefinitions, listProductionMonsterIdentities } from '../../src/data/monsters/production-monster-definition-registry';
import { getProductionMonsterActionRuntimeStatus } from '../../src/game-engine/monsters/production-runtime-primitives';

export const C4A_BASE = 'ed84d1359907268736b7d163b68c5b359c4d71fd';
const root = 'docs/data/complete-edition/';
const phase = '11A.7-C4A';
const unique = (xs: readonly string[]) => [...new Set(xs)].sort();
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const questData = normalized.definitions;
type Quest = typeof questData[number];
type Rule = Quest['specialRules'][number];
type Parameters = Record<string, unknown>;
export const CLASSIFICATIONS = ['SUPPORTED_EXISTING_PRIMITIVE', 'SUPPORTED_EXISTING_COMPOSITION', 'NEEDS_QUEST_ADAPTER',
  'NEEDS_NEW_RUNTIME_PRIMITIVE', 'SOURCE_BLOCKED', 'DEFERRED_SEMANTIC', 'NO_RUNTIME_EFFECT'] as const;
export type Classification = typeof CLASSIFICATIONS[number];
export const READINESS = ['PRODUCTION_READY_EXISTING', 'ADAPTER_READY', 'RUNTIME_PRIMITIVE_BLOCKED',
  'SOURCE_BLOCKED', 'DEFERRED_SEMANTIC', 'MULTI_BLOCKED'] as const;
export type Readiness = typeof READINESS[number];
interface Evidence { path: string; symbol?: string; pointer?: string }
export interface Obligation {
  obligationId: string; definitionId: string; sourceField: string; description: string;
  trigger: string | null; scope: string | null; parameters: unknown;
  classification: Classification; capabilityId: string; reason: string;
  sourceEvidence: Evidence[]; runtimeEvidence: Evidence[]; historicalBlockers: string[];
  dependencies: string[]; sourceStatus: 'SOURCE_CLEAR' | 'SOURCE_UNRESOLVED' | 'DEFERRED_SEMANTIC';
}
const evidence = (path: string, symbol?: string): Evidence => ({ path, ...(symbol ? { symbol } : {}) });
const E = {
  quest: evidence('src/game-engine/quests/quest-runtime.ts', 'createQuestRuntimeState; evaluateQuestXpUnits; recordQuestQualificationEvent'),
  questRules: evidence('src/game-engine/quests/quest-special-rule-runtime.ts', 'applyQuestRoomSetup; evaluateQuestRules; questRuleTransactionId'),
  dungeon: evidence('src/game-engine/dungeon.ts', 'generateCommunityDungeon; QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX'),
  conditions: evidence('src/game-engine/status-effects.ts', 'applyEffectsWithResistance; synchronizePrintedConditionTokens'),
  stress: evidence('src/game-engine/stress.ts', 'applyStressBatch'),
  hero: evidence('src/game-engine/heroes/production-runtime.ts', 'applyProductionHeroInput'),
  heroProof: evidence(root + 'c2e-production-player-path-acceptance.json'),
  encounter: evidence('src/game-engine/monsters/production-encounter.ts', 'createProductionMonsterUnit; initializeProductionMonsterBattle'),
  monster: evidence('src/game-engine/monsters/production-battle-runtime.ts', 'beginProductionMonsterTurn; recordProductionMonsterEvent'),
  monsterProof: evidence(root + 'c3e-monster-production-freeze.json'),
  eligibility: evidence(root + 'c3d-monster-encounter-readiness.json'),
  deck: evidence('src/game-engine/trinkets/source-deck.ts', 'sourceTrinketDeck; drawSourceBoundTrinketCard'),
  deckProof: evidence(root + 'c1c32r2c-r-room6-trinket-draw-proof.json'),
  acquire: evidence('src/game-engine/trinkets/acquire-trinket.ts', 'acquireTrinket'),
  inventory: evidence('src/game-engine/trinkets/trinket-state.ts', 'createTrinketInstance; removeTrinketFromHero; pushAcquisitionRecord'),
  rest: evidence(root + 'rest-semantic-contract.json'),
  restRuntime: evidence('src/game-engine/quests/quest-runtime.ts', 'validateRestAllocation; commitRestAtCamp'),
  random: evidence('src/game-engine/runtime-sources.ts', 'SeededRandom; withRuntimeSources'),
  battle: evidence('src/game-engine/battle.ts', 'advanceTurn'),
  save: evidence('src/game-engine/save.ts'),
  room: evidence('src/game-engine/ruins/source-registry.ts', 'ruinsTile; ruinsRoom'),
};
const HISTORICAL_RULE_PRIMITIVES: Record<string, string> = {
  'room-setup': 'QUEST_RULE_ROOM_SETUP', 'dungeon-setup': 'QUEST_RULE_ROOM_SETUP', 'room-selection': 'QUEST_RULE_ROOM_SETUP',
  'room-clear-rule': 'QUEST_RULE_ROOM_CLEAR', exploration: 'QUEST_RULE_EXPLORATION', scouting: 'QUEST_RULE_EXPLORATION',
  'battle-start': 'QUEST_RULE_BATTLE_SETUP', 'battle-end': 'QUEST_RULE_BATTLE_RESULT', initiative: 'QUEST_RULE_BATTLE_SETUP',
  'monster-pool': 'QUEST_RULE_MONSTER_STATE', 'monster-spawn': 'QUEST_RULE_MONSTER_STATE', 'monster-stat-modifier': 'QUEST_RULE_MONSTER_STATE',
  curio: 'QUEST_RULE_TOKEN_INTERACTION', loot: 'QUEST_RULE_TOKEN_INTERACTION', provision: 'QUEST_RULE_PROVISION_INTERACTION',
  'reward-modifier': 'QUEST_RULE_REWARD_OVERRIDE', 'objective-qualification': 'QUEST_RULE_QUEST_COMPLETION',
  'objective-completion': 'QUEST_RULE_QUEST_COMPLETION', 'quest-setup': 'QUEST_RULE_ROOM_SETUP', 'campaign-rule': 'QUEST_RULE_QUEST_COMPLETION',
  'hero-stress': 'QUEST_RULE_HERO_STATE', 'hero-condition': 'QUEST_RULE_HERO_STATE',
};

/** Blocker classes are independent. Adapter work does not itself create MULTI_BLOCKED. */
export function classifyReadiness(obligations: readonly Obligation[], bound: boolean): Readiness {
  const classes = unique(obligations.map(o => o.classification).filter(c =>
    ['SOURCE_BLOCKED', 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'DEFERRED_SEMANTIC'].includes(c)));
  if (classes.length > 1) return 'MULTI_BLOCKED';
  if (classes[0] === 'SOURCE_BLOCKED') return 'SOURCE_BLOCKED';
  if (classes[0] === 'DEFERRED_SEMANTIC') return 'DEFERRED_SEMANTIC';
  if (classes[0] === 'NEEDS_NEW_RUNTIME_PRIMITIVE') return 'RUNTIME_PRIMITIVE_BLOCKED';
  return bound && !obligations.some(o => o.classification === 'NEEDS_QUEST_ADAPTER')
    ? 'PRODUCTION_READY_EXISTING' : 'ADAPTER_READY';
}

/** Crocodilian is the Quest spelling; the accepted printed Monster identity uses Crocodillian. */
export function monsterForms(name: string, level?: number) {
  const printed = name === 'Crocodilian' ? 'Crocodillian' : name;
  return listProductionMonsterDefinitions().filter(d => d.printedName === printed && (level === undefined || d.level === level));
}
function namedMonsters(rule: Rule): Array<{ name: string; level?: number; count?: number }> {
  const p = rule.parameters as Parameters;
  const result: Array<{ name: string; level?: number; count?: number }> = [];
  for (const key of ['spawn', 'spawnFirst']) {
    const value = p[key];
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      if (item && typeof item === 'object' && 'name' in item) result.push(item as typeof result[number]);
    }
  }
  if (typeof p.name === 'string') result.push({ name: p.name, count: Number(p.count ?? 1) });
  if (Array.isArray(p.deathReplacements)) for (const item of p.deathReplacements as Array<{ from: string; to: string }>)
    result.push({ name: item.from }, { name: item.to });
  return result;
}

function sourceFor(q: Quest, field: string): Evidence[] {
  const record = sourceEvidence.records.find(r => r.definitionId === q.id);
  assert.ok(record, 'Missing printed source record: ' + q.id);
  const ruleIndex = field.startsWith('specialRules.') ? Number(field.split('.')[1]) : null;
  const literal = ruleIndex !== null ? `printedSpecialRules.${q.specialRules[ruleIndex]?.sourceRuleIndex ?? 0}`
    : field.startsWith('rest') ? 'printedRestingPoints' : field === 'objective' ? 'printedReward' : 'printedTitle';
  const key = Object.prototype.hasOwnProperty.call(record.fieldEvidence, literal) ? literal : 'printedTitle';
  return [evidence('docs/data/complete-edition/quests/community-quest-normalized.json'),
    { path: 'docs/data/complete-edition/quests/community-quest-source-evidence.json', pointer: `/records/${sourceEvidence.records.indexOf(record)}/fieldEvidence/${key}` },
    evidence(record.frontAssetPath), evidence(record.observation.file)];
}

function obligation(q: Quest, key: string, classification: Classification, capabilityId: string,
  description: string, reason: string, runtimeEvidence: Evidence[], options: Partial<Obligation> = {}): Obligation {
  const field = options.sourceField ?? key;
  return { obligationId: `${q.id}:${key}`, definitionId: q.id, sourceField: field, description,
    trigger: null, scope: 'quest', parameters: null, classification, capabilityId, reason,
    sourceEvidence: sourceFor(q, field), runtimeEvidence, historicalBlockers: [], dependencies: [],
    sourceStatus: classification === 'SOURCE_BLOCKED' ? 'SOURCE_UNRESOLVED' : classification === 'DEFERRED_SEMANTIC'
      ? 'DEFERRED_SEMANTIC' : 'SOURCE_CLEAR', ...options };
}

function reviewRule(q: Quest, rule: Rule, index: number): Obligation[] {
  const p = rule.parameters as Parameters;
  const c = rule.semanticCategory;
  const field = `specialRules.${index}`;
  const old = [HISTORICAL_RULE_PRIMITIVES[c] ?? 'SOURCE_SEMANTIC_UNRESOLVED'];
  const opts: Partial<Obligation> = { sourceField: field, trigger: rule.trigger, scope: rule.scope,
    parameters: rule.parameters, historicalBlockers: old };
  const make = (suffix: string, status: Classification, family: string, reason: string, paths: Evidence[], dependencies: string[] = []) =>
    obligation(q, `rule-${index}:${suffix}`, status, family, `${c}: ${JSON.stringify(rule.parameters)}`, reason, paths, { ...opts, dependencies });
  const adapter = (family: string, reason: string, paths: Evidence[]) => [make('binding', 'NEEDS_QUEST_ADAPTER', family, reason, paths)];
  const primitive = (family: string, reason: string, paths: Evidence[]) => [make('effect', 'NEEDS_NEW_RUNTIME_PRIMITIVE', family, reason, paths)];
  if (q.unresolvedFields.some(f => f.startsWith(`specialRules.${index}.`))) return [make('unresolved', 'SOURCE_BLOCKED', 'QUEST_LITERAL_SOURCE',
    'This exact normalized special-rule parameter remains unresolved in the hash-bound printed extract; do not infer the missing verb or effect.', [])];
  if (q.id.endsWith('deep-in-the-warrens') && c === 'provision') return [make('bound', 'SUPPORTED_EXISTING_PRIMITIVE',
    'QUEST_PROVISION_DISCARD', 'Existing exact leave-room rule, saved choice and transaction binding.', [E.questRules])];
  if (c === 'hero-condition' || c === 'hero-stress') {
    const disease = 'gainDisease' in p;
    return [make('effect', 'SUPPORTED_EXISTING_COMPOSITION', disease ? 'HERO_DISEASE' : c === 'hero-stress' ? 'HERO_STRESS' : 'HERO_TIMED_CONDITIONS',
      disease ? 'Disease draw/acquisition exists; Hero capability is not the missing Quest hook.'
        : 'C2E uses the shared production condition/Stress pipeline. Independent token durations express the printed amounts and turns.',
      [E.hero, E.heroProof, disease ? evidence('src/game-engine/diseases/acquire-disease.ts', 'acquireDisease') : c === 'hero-stress' ? E.stress : E.conditions], ['HERO']),
      make('hook', 'NEEDS_QUEST_ADAPTER', 'QUEST_HERO_EVENT_ROUTING', 'Bind the printed kill/spawn/hit/round/Death Door event to the specified Hero targets; generic Hero support is not a Quest route.',
        [E.hero, E.monster, E.questRules], ['HERO', 'MONSTER'])];
  }
  if (c === 'monster-spawn') {
    const named = namedMonsters(rule);
    const rows = named.map((spec, i) => {
      const forms = monsterForms(spec.name, spec.level);
      return make(`monster-${i}`, forms.length ? 'SUPPORTED_EXISTING_COMPOSITION' : 'SOURCE_BLOCKED', 'QUEST_EXPLICIT_MONSTER_MANIFEST',
        forms.length ? `Exact identity/form ${forms.map(d => d.definitionId).join(', ')} is instantiable through C3E explicit manifests. This does not certify its actions or random deck eligibility.`
          : `No accepted exact Monster form for ${spec.name}, level ${spec.level ?? 'printed identity'}; never substitute a prototype.`,
        [E.encounter, E.monsterProof], ['MONSTER', ...forms.map(d => `MONSTER_FORM:${d.definitionId}`)]);
    });
    rows.push(...adapter('QUEST_MONSTER_ENCOUNTER_ROUTING', 'Bind printed roster/order/room/roll restrictions to accepted manifest units, placements and seeded draws.', [E.encounter, E.random, E.questRules]));
    if ('deathReplacements' in p || 'onIgnitionRoundEnd' in p) rows.push(...primitive('QUEST_DYNAMIC_MONSTER_ROSTER',
      'C3E initializes a fixed roster. Quest death replacement/empty-Stance refill needs a generic saved roster lifecycle with physical-copy, placement and initiative updates. Frozen Boss summon machinery is scoped to bossEncounter and versioned family rulings; reuse its ledger pattern without borrowing its rule semantics.', [E.encounter, E.monster, E.battle, evidence('src/game-engine/bosses/foundation.ts', 'commitSpawn; spawn')]));
    return rows;
  }
  if (c === 'monster-pool') return adapter('QUEST_MONSTER_POOL_FILTER',
    'Group/level metadata and explicit manifests can express a source-authorized pool; automatic eligibility and physical draw membership are separate obligations.', [E.encounter, E.eligibility]);
  if (c === 'monster-stat-modifier') {
    if ('actionsPerRound' in p) return primitive('QUEST_ADDITIONAL_INITIATIVE',
      'Additional activation per round is not an AP increase. C3E manifest validation rejects duplicate initiative IDs and ordinary round reset creates one card per living unit.', [E.encounter, E.battle, evidence('src/game-engine/initiative.ts', 'createInitiativeOrder')]);
    if ('onGuardedMonsterDeath' in p) return adapter('QUEST_GUARD_TRANSFER',
      'Timed Guard tokens, target ordering and death events exist; Quest must transfer the remaining duration exactly once.', [E.conditions, E.monster, evidence('src/game-engine/monster-target-priority.ts')]);
    return [make('effect', 'SUPPORTED_EXISTING_COMPOSITION', 'MONSTER_PROFILE_AND_EFFECT_OVERRIDE',
      'Existing BattleUnit HP/Dodge/immunity fields and heal/Guard/attack effects express the printed modifier. Preserve immutable source definitions.',
      [E.encounter, E.monster, E.conditions]), ...adapter('QUEST_MONSTER_OVERRIDE_ROUTING',
        'Quest-scoped modifier, crit overlay, hit heal or Guard activation routing is absent; identity existence alone does not bind this rule.', [E.monster, E.questRules])];
  }
  if (c === 'initiative') {
    if ('additionalInitiativeCards' in p) return primitive('QUEST_ADDITIONAL_INITIATIVE',
      'One extra card for an existing unit cannot pass the unique-ID manifest contract or survive ordinary one-card round reconstruction.', [E.encounter, E.battle]);
    return adapter('QUEST_FIRST_ROUND_INITIATIVE', 'Reorder the existing unique initiative list, with the printed d10/Light predicate where required. No new initiative primitive needed.', [E.encounter, E.random, E.battle]);
  }
  if (c === 'battle-start') return adapter('QUEST_BATTLE_START_POLICY',
    'Battle initialization exists; force Curio battle or bind the Food bait choice/room trigger before accepted encounter initialization.', [E.encounter, E.dungeon, E.questRules]);
  if (c === 'battle-end') return adapter('QUEST_BATTLE_RESULT_POLICY',
    'Battle status, living-unit identity and result transaction exist; bind the named-kill/only-Maggots predicate and preserve reward/room-clear ordering.', [E.battle, evidence('src/game-engine/quest-result.ts'), E.questRules]);
  if (c === 'room-setup' || c === 'room-selection') return adapter('QUEST_ROOM_CARD_SELECTION',
    'Saved selected/set-aside IDs and seeded selection exist. Bind printed room identities, filters, return/discard policy; token placement alone is not exact room-card selection.', [E.quest, E.questRules, E.room, E.random]);
  if (c === 'dungeon-setup') return adapter('QUEST_DUNGEON_COMPOSITION',
    'Existing shuffled room-token composition can express fixed/random remaining slots; add the Quest-specific source composition and exclusions.', [E.dungeon, E.random]);
  if (c === 'exploration') {
    if ('replace' in p) return primitive('QUEST_REGENERATING_ROOM_LIFECYCLE',
      'Existing selected/visited rooms assume a fixed layout. Replacing a cleared token and resetting visitation needs saved generations and qualification identity to avoid recounting/redraw on reload.', [E.dungeon, E.quest, E.save]);
    return adapter('QUEST_EXPLORATION_POLICY', 'Existing movement and exploration transitions can skip the printed revealed-Lair exploration step; bind a Quest policy.', [E.dungeon, E.questRules]);
  }
  if (c === 'scouting') return adapter('QUEST_EXPLORATION_POLICY', 'Existing reveal/movement state can bind no-scout and optional adjacent reveal; preserve the chosen candidate on reload.', [E.dungeon, E.save]);
  if (c === 'curio') return adapter('QUEST_CURIO_POLICY', 'Bind negative-only and Torch prohibition at Curio resolution; existing token interaction does not implement this routing.', [E.dungeon, evidence('src/game-engine/commands/dungeon.ts')]);
  if (c === 'loot') return adapter('QUEST_LOOT_OVERRIDE', 'Existing reward inventory and seeded rolls exist; bind first-chest/once-per-room replacement and save its causal receipt.', [E.inventory, E.deck, E.questRules, E.random]);
  if (c === 'provision' || c === 'quest-setup') {
    if (q.questType === 'boss') return adapter('QUEST_BOSS_SETUP_BINDING', 'Accepted Necromancer/Prophet entry is reusable only for their exact threat contracts; generic Face the Threat routing requires an explicit source-authorized boss binding.',
      [evidence('src/game-engine/commands/boss-foundation.ts'), evidence('src/game-engine/prophet/production-entry.ts')]);
    return adapter('QUEST_PROVISION_SETUP', 'Existing provision inventory and choice transactions can bind initial grants, conversions and normal-roll suppression; runtime prose interpretation is forbidden.', [E.questRules, E.dungeon, E.random]);
  }
  if (c === 'reward-modifier') return adapter('QUEST_RESOURCE_REWARD_EXCHANGE',
    'Gold, inventory, capped XP evaluation and campaign result transactions exist. Bind printed Heir/return/exchange predicate and player choice instead of prototype objectives.', [E.quest, E.inventory, evidence('src/game-engine/quest-result.ts')]);
  if (c === 'room-clear-rule' || c === 'objective-completion') return adapter('QUEST_OBJECTIVE_QUALIFICATION',
    'Existing room status, Quest flags/counters and XP unit evaluator can bind the printed qualification/clear predicate; do not invent a mandatory XP threshold.', [E.quest, E.questRules, E.dungeon]);
  if (c === 'objective-qualification') {
    if ('burnsAt' in p) return primitive('QUEST_DELAYED_ROUND_OBJECTIVE',
      'Needs a saved ignition round and next-round completion job independent of Monster victory; existing token interaction only handles immediate cleared-room consumption.', [E.questRules, E.battle, E.save]);
    if ('objectiveRequires' in p) return [make('source', 'SOURCE_BLOCKED', 'QUEST_ROOM_FEATURE_SOURCE',
      'Quest text names an unsmashed Necrotic Fungus, but no accepted Weald room feature/health lifecycle binding is present in the Ruins source registry.', [E.room], ['ROOM_SOURCE'])];
    return adapter('QUEST_OBJECTIVE_INTERACTION',
      'AP, provision costs, Area placement, counters and XP arithmetic exist; bind the exact printed area/action/limit/qualification transaction. Current post-clear token interaction is insufficient.', [E.battle, E.quest, E.questRules, E.encounter]);
  }
  if (c === 'campaign-rule') return adapter('QUEST_HAMLET_RESOLUTION',
    'Bind boss return lock or printed Hamlet resolution with saved choices and result transaction; no generic historical category is promoted automatically.', [E.questRules, evidence('src/game-engine/quest-result.ts')]);
  return [make('unreviewed', 'SOURCE_BLOCKED', 'UNREVIEWED_QUEST_SEMANTIC', 'No reviewed exact consumer for this category; fail closed instead of inferring runtime semantics.', [])];
}

function trinketObligations(q: Quest): Obligation[] {
  const requiredLevels = unique(q.specialRules.flatMap(r => {
    const p = JSON.stringify(r.parameters);
    return /trinketLevel\":2|eachHeroRandomTrinketLevel\":2/.test(p) ? ['2'] : /eachHeroRandomTrinketLevel\":3/.test(p) ? ['3'] : [];
  })).map(Number) as Array<2 | 3>;
  return requiredLevels.flatMap(level => {
    const cards = sourceTrinketDeck().filter(c => c.level === level);
    const coverage = measureTrinketDeckCoverage(level);
    const unresolved = trinketBlockers.cards.filter(c => c.level === level && !c.productionReady);
    return [obligation(q, `trinket-${level}:source`, 'SUPPORTED_EXISTING_PRIMITIVE', 'TRINKET_PHYSICAL_SOURCE_DECK',
      `Complete Level ${level} printed source deck (${cards.length} identities)`, 'Physical/literal source membership is complete, independently of equip/effect readiness. Historical SOURCE_DECK_INCOMPLETE conflated these.', [E.deck, E.deckProof],
      { dependencies: ['TRINKET'], parameters: { level, definitionIds: cards.map(c => c.id) }, historicalBlockers: [`LEVEL_${level}_TRINKET_SOURCE_DECK_COMPLETE`] }),
    obligation(q, `trinket-${level}:draw`, 'SUPPORTED_EXISTING_COMPOSITION', 'TRINKET_SOURCE_BOUND_DRAW',
      'Seeded full-deck draw and saved ownership receipt', 'Accepted Room 6 reward path draws all source cards and retains non-executable cards as pendingSourceTrinketRewards; it does not silently equip or discard them.', [E.deck, E.deckProof, E.inventory], { dependencies: ['TRINKET'] }),
    obligation(q, `trinket-${level}:effects`, unresolved.length ? 'SOURCE_BLOCKED' : coverage.completeForRandomDraw ? 'SUPPORTED_EXISTING_PRIMITIVE' : 'NEEDS_QUEST_ADAPTER',
      'TRINKET_FULL_DECK_EFFECT_SEMANTICS', `Level ${level} equip/effect production dependency`,
      'Literal deck closure does not close frozen voluntary-declaration/source timing gates or missing effect consumers. C2E Hero acceptance does not define those legal Trinket windows.',
      [evidence(root + 'c1c20-core-trinket-terminal-blocker-register.json'), evidence('src/game-engine/trinkets/draw-trinket.ts', 'drawSourceCompleteTrinket'), E.heroProof],
      { dependencies: ['TRINKET'], parameters: { level, coverage, unresolvedCards: unresolved.map(c => ({ definitionId: c.definitionId, sourceGate: c.sourceGate })) } }),
    obligation(q, `trinket-${level}:quest-route`, 'NEEDS_QUEST_ADAPTER', 'QUEST_TRINKET_ACQUISITION_RETURN',
      'Quest reward/allocation/provenance/return selection routing', 'Existing acquisition records contain instanceId, sourceEventId and acquiredQuestId; bind current dungeon-run provenance and printed return choice. A capped generic history alone is not a complete active Quest ledger.', [E.acquire, E.inventory, E.quest, E.save], { dependencies: ['TRINKET'] })];
  });
}

function explicitSeedReview(q: Quest): Obligation[] {
  if (!q.id.endsWith('family-trinkets') && !q.id.endsWith('tainted-trinkets')) return [];
  return semanticObligationsForQuest(q).map(seed => {
    const newPrimitive = seed.runtimePrimitive === 'QUEST_RULE_TRINKET_STATE' || seed.runtimePrimitive === 'QUEST_RULE_HAMLET_CHOICE';
    const paths = seed.runtimePrimitive === 'QUEST_RULE_QUIRK_GAIN'
      ? [evidence('src/game-engine/quirks.ts', 'acquireQuirk'), evidence('src/game-engine/diseases/acquire-disease.ts', 'drawNegativeQuirkId')]
      : [E.questRules, E.inventory, E.acquire, E.save];
    return obligation(q, `semantic-${seed.obligationId}`, newPrimitive ? 'NEEDS_NEW_RUNTIME_PRIMITIVE' : 'NEEDS_QUEST_ADAPTER',
      newPrimitive ? 'QUEST_TAINTED_TRINKET_LIFECYCLE' : seed.runtimePrimitive === 'QUEST_RULE_QUIRK_GAIN' ? 'QUEST_NEGATIVE_QUIRK_SEQUENCE' : 'QUEST_TRINKET_ACQUISITION_RETURN',
      `${seed.obligationId}: ${seed.semanticCategory}`, newPrimitive
        ? 'No saved taint/cleanse owner state or return-to-own-deck lifecycle exists; ordinary Positive/Negative side flip cannot stand in for taint.'
        : 'Existing inventory, capacity, acquisition provenance, choice/quirk, counters and XP machinery is reusable, but this exact Quest binding is absent.', paths,
      { trigger: seed.trigger, scope: seed.scope, parameters: seed.parameters, sourceField: `specialRules.${seed.sourceRuleIndex}`,
        historicalBlockers: seed.runtimePrimitive ? [seed.runtimePrimitive] : [], dependencies: ['TRINKET'] });
  });
}

export function buildC4A() {
  assert.equal(policy.policyId, 'RULEBOOK_ONLY_SOURCE_POLICY_V1');
  assert.equal(freeze.status, 'FROZEN');
  assert.ok(heroAcceptance.heroProductionReady && heroAcceptance.productionBattleEnabled);
  assert.ok(deriveUnresolvedRestSemantics().includes('insufficientRecoveryCapacity'));
  const budgetAuthority = REST_SEMANTIC_CONTRACT.budgetConsumption as { sourceEvidenceIds: string[] };
  assert.ok(budgetAuthority.sourceEvidenceIds.includes('C1C1R3:S2:ARGYRIS-ALL-POINTS'), 'Rest authority requires fresh C4A review');
  assert.ok(runtimeQuestData.every(q => questData.some(s => s.id === q.id)), 'Runtime identity absent from normalized printed corpus');
  assert.deepEqual(sourceEvidence.records.map(q => q.definitionId).sort(), questData.map(q => q.id).sort(), 'Printed source census identity drift');
  const definitions = listProductionMonsterDefinitions();
  const actions = definitions.flatMap(d => d.actions);
  const monsterFacts = { identities: listProductionMonsterIdentities().length, definitions: definitions.length,
    actions: actions.length, runtimeReady: actions.filter(a => getProductionMonsterActionRuntimeStatus(a).status === 'RUNTIME_READY').length,
    deferredSemantic: actions.filter(a => getProductionMonsterActionRuntimeStatus(a).status === 'DEFERRED_SEMANTIC').length,
    automaticEncounter: encounterReadiness.definitions.filter(d => d.encounterStatus === 'AUTO_ENCOUNTER_READY').length,
    explicitManifest: encounterReadiness.definitions.filter(d => d.encounterStatus !== 'AUTO_ENCOUNTER_READY' && d.explicitManifestReady).length };
  assert.deepEqual(Object.values(monsterFacts), [freeze.monsterIdentities, freeze.monsterDefinitions, freeze.monsterActions,
    freeze.runtimeReadyActions, freeze.deferredSemanticActions, freeze.autoEncounterDefinitions, freeze.explicitManifestDefinitions]);
  const quests = questData.map(q => {
    const c = COMMUNITY_QUEST_CAPABILITIES.find(c => c.definitionId === q.id);
    const sourceSupported = c?.sourceSupported ?? q.sourceStatus === 'source-supported';
    const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[q.id];
    const selected = COMMUNITY_RUNTIME_QUESTS.some(d => d.id === q.id);
    const bound = Boolean(adapter && c?.productionReady && c.productionProofComplete && c.saveReplayProofComplete && selected);
    const obligations: Obligation[] = [
      obligation(q, 'metadata', 'NO_RUNTIME_EFFECT', 'QUEST_PRINTED_METADATA', 'Printed name/region/level/family identity', 'Census metadata has no gameplay effect.', [], { parameters: { printedName: q.printedName, region: q.region, level: q.level, questType: q.questType } }),
      obligation(q, 'dungeonComposition', adapter ? 'SUPPORTED_EXISTING_PRIMITIVE' : 'NEEDS_QUEST_ADAPTER', 'QUEST_DUNGEON_COMPOSITION',
        'Printed room-token composition and Firewood setup', 'Existing source-composition generator and saved Quest state are reusable; production adapter presence is checked per identity.', [E.dungeon, E.quest],
        { parameters: { composition: q.dungeonStructure, firewood: q.firewood }, historicalBlockers: ['QUEST_ROOM_TOKEN_COMPOSITION', 'QUEST_FIREWOOD_RESTING_POINT_SETUP'] }),
      obligation(q, 'objective', q.objective.targetEntity === 'room' || q.objective.targetEntity === 'lair'
        ? 'SUPPORTED_EXISTING_PRIMITIVE' : 'NEEDS_QUEST_ADAPTER', 'QUEST_OBJECTIVE_QUALIFICATION',
        'Printed objective units, qualifications and repeated XP reward', 'XP arithmetic exists; room/lair qualification is directly bound. Named kills, returned resources and objective-room predicates require exact causal bindings.', [E.quest],
        { parameters: q.objective, historicalBlockers: ['QUEST_XP_UNIT_ACCOUNTING'] }),
      obligation(q, 'persistence', bound ? 'SUPPORTED_EXISTING_COMPOSITION' : 'NEEDS_QUEST_ADAPTER', 'QUEST_SAVE_CHOICE_TRANSACTION_BINDING',
        'Persist rule version, RNG, candidates, causal receipt and active Quest progress', 'Accepted save/replay, seeded runtime and campaign transactions are reusable. New Quest adapters must persist their own candidate set, event and rule version; no automatic proof inheritance.', [E.save, E.random, E.questRules], { parameters: { existingProof: COMMUNITY_QUEST_PRODUCTION_PROOFS[q.id] ?? null } }),
    ];
    if (q.unresolvedFields.length || !sourceSupported) obligations.push(obligation(q, 'literal-source', 'SOURCE_BLOCKED', 'QUEST_LITERAL_SOURCE',
      'Missing canonical Quest fields', 'Preserve unresolved printed fields; no runtime prose guess.', [],
      { parameters: q.unresolvedFields, sourceField: q.unresolvedFields[0] ?? 'sourceStatus' }));
    if (q.firewood.tokens > 0) {
      obligations.push(obligation(q, 'rest:allocation', 'SUPPORTED_EXISTING_COMPOSITION', 'REST_ALLOCATION',
        'Printed Rest budget and player-authored Life/Stress allocation', 'Existing runtime validates and commits allocations; executable helper availability is separate from canonical authority.', [E.restRuntime], { dependencies: ['REST'], parameters: q.firewood }),
      obligation(q, 'rest:capacity', 'SOURCE_BLOCKED', 'REST_INSUFFICIENT_RECOVERY_CAPACITY',
        'Behavior when printed points exceed total legal recovery capacity', 'Current contract still records insufficientRecoveryCapacity as SOURCE_UNRESOLVED. C4A introduces no ruling.', [E.rest, E.restRuntime], { dependencies: ['REST'], historicalBlockers: ['REST_INSUFFICIENT_RECOVERY_CAPACITY', 'QUEST_REST_ALLOCATION_SEMANTICS'] }),
      obligation(q, 'rest:authority', 'SOURCE_BLOCKED', 'REST_OFFICIAL_SOURCE_SCOPE',
        'Official authority for full-budget/partial-spend restriction', 'budgetConsumption, partialSpend and derived zeroPointRest reference C1C1R3:S2:ARGYRIS-ALL-POINTS. A historical SOURCE_EXPLICIT label does not authorize forum-derived rules under the current policy. Rebind to locked official evidence or preserve unresolved; do not edit the frozen contract.', [E.rest, evidence(root + 'rule-source-policy.json')], { dependencies: ['REST'], historicalBlockers: ['REST_SOURCE_SCOPE'] }));
    }
    q.specialRules.forEach((r, i) => obligations.push(...reviewRule(q, r, i)));
    obligations.push(...trinketObligations(q), ...explicitSeedReview(q));
    // Actions are checked separately from profile construction. Do not promote a named deferred action.
    const named = q.specialRules.flatMap(namedMonsters);
    if (q.objective.objectiveType === 'kill-entity' && q.objective.targetEntity) named.push({ name: q.objective.targetEntity });
    const namedForms = [...new Map(named.flatMap(s => monsterForms(s.name, s.level)).map(d => [d.definitionId, d])).values()];
    for (const form of namedForms) for (const action of form.actions) {
      const status = getProductionMonsterActionRuntimeStatus(action);
      obligations.push(obligation(q, `monster-action:${action.actionId}`, status.status === 'DEFERRED_SEMANTIC' ? 'DEFERRED_SEMANTIC'
        : status.status === 'RUNTIME_READY' ? 'SUPPORTED_EXISTING_PRIMITIVE' : 'SOURCE_BLOCKED', 'QUEST_REQUIRED_MONSTER_ACTIONS',
        `Required named Monster action ${action.actionId}`, status.status === 'RUNTIME_READY' ? 'Current C3E production action guard accepts this exact action.'
          : 'The current production action guard stops this exact action. Explicit manifests do not resolve deferred semantics.', [E.monster, E.monsterProof],
        { dependencies: ['MONSTER'], parameters: { definitionId: form.definitionId, actionId: action.actionId, status }, historicalBlockers: ['QUEST_RULE_MONSTER_STATE'] }));
    }
    const monsterRules = q.specialRules.some(r => ['monster-pool', 'monster-spawn', 'battle-start'].includes(r.semanticCategory));
    if (!bound && q.region !== 'ruins' && (monsterRules || !adapter)) obligations.push(obligation(q, 'encounter:eligibility', 'SOURCE_BLOCKED', 'QUEST_REGIONAL_PHYSICAL_DRAW_SOURCE',
      'Physical random Monster draw eligibility for the region/room', 'C3D source eligibility outside accepted Ruins draws is deferred. Exact named explicit-manifest execution is supported, but cannot certify unspecified normal/additional random draws or their physical multiplicities.', [E.eligibility, E.encounter], { dependencies: ['MONSTER_SOURCE'] }));
    if (q.questType === 'boss') obligations.push(obligation(q, 'boss:scope', 'SOURCE_BLOCKED', 'QUEST_GENERIC_BOSS_SOURCE_SCOPE',
      'Current threat Boss family source/executable contract', 'Frozen Necromancer and Prophet contracts cover their own families, not every possible imminent threat. Generic Face the Threat requires a family-by-family dependency binding.',
      [evidence('src/game-engine/bosses/production-dependency-gate.ts'), evidence('src/data/quests/production-face-the-threat.ts')], { dependencies: ['BOSS'] }));
    const historicalRow = historical.quests.find(r => r.definitionId === q.id);
    const readiness = classifyReadiness(obligations, bound);
    const blockers = obligations.filter(o => ['SOURCE_BLOCKED', 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'DEFERRED_SEMANTIC'].includes(o.classification));
    return { definitionId: q.id, name: q.printedName, level: q.level, region: q.region, family: q.objective.objectiveType,
      questType: q.questType, presentInCurrentRuntimeCatalog: runtimeQuestData.some(s => s.id === q.id), sourceCompleteness: { literalComplete: !q.unresolvedFields.length && sourceSupported,
        executableSourceClear: !obligations.some(o => o.classification === 'SOURCE_BLOCKED'), unresolvedFields: q.unresolvedFields },
      readiness, obligations, blockerClasses: unique(blockers.map(o => o.classification)),
      rest: { status: q.firewood.tokens === 0 ? 'SOURCE_CLEAR' : 'SOURCE_BLOCKED', firewood: q.firewood,
        canonicalMissingFields: q.firewood.tokens > 0 ? deriveUnresolvedRestSemantics() : [],
        currentPolicyUnacceptedFields: q.firewood.tokens > 0 ? ['budgetConsumption', 'partialSpend', 'zeroPointRest'] : [] },
      dependencies: { hero: obligations.filter(o => o.dependencies.includes('HERO')).map(o => o.obligationId),
        monster: obligations.filter(o => o.dependencies.some(d => d.startsWith('MONSTER'))).map(o => o.obligationId),
        trinket: obligations.filter(o => o.dependencies.includes('TRINKET')).map(o => o.obligationId),
        rest: obligations.filter(o => o.dependencies.includes('REST')).map(o => o.obligationId),
        questAdapters: unique(obligations.filter(o => o.classification === 'NEEDS_QUEST_ADAPTER').map(o => o.capabilityId)) },
      currentBinding: { adapterId: adapter?.adapterId ?? null, selectorReachable: selected, boundProductionProof: bound },
      historical: { productionReady: historicalRow?.productionReady ?? false, productionStatus: historicalRow?.productionStatus ?? 'ABSENT',
        requiredPrimitives: historicalRow?.requiredPrimitives ?? [], sourceGates: historicalRow?.sourceGates ?? [] },
      historicalBlockerReview: unique(historicalRow?.requiredPrimitives ?? []).map(blocker => ({ historicalBlocker: blocker,
        currentObligationIds: obligations.filter(o => o.historicalBlockers.includes(blocker)).map(o => o.obligationId),
        currentCapabilities: unique(obligations.filter(o => o.historicalBlockers.includes(blocker)).map(o => o.capabilityId)),
        currentClassifications: unique(obligations.filter(o => o.historicalBlockers.includes(blocker)).map(o => o.classification)),
        disposition: obligations.some(o => o.historicalBlockers.includes(blocker)) ? 'REVIEWED_AT_ATOM_LEVEL' : 'SUPERSEDED_BY_EXPLICIT_CURRENT_OBLIGATIONS',
        evidence: blocker.includes('HERO') ? [E.heroProof, E.hero, E.conditions] : blocker.includes('MONSTER') || blocker.includes('BATTLE') ? [E.monsterProof, E.encounter, E.eligibility] : blocker.includes('REST') ? [E.rest, E.restRuntime] : [E.questRules, E.quest] })) };
  });
  const counts = Object.fromEntries(READINESS.map(s => [s, quests.filter(q => q.readiness === s).length])) as Record<Readiness, number>;
  const ids = (predicate: (q: typeof quests[number]) => boolean) => quests.filter(predicate).map(q => q.definitionId).sort();
  const ready = ids(q => q.readiness === 'PRODUCTION_READY_EXISTING');
  const backlog = unique(quests.flatMap(q => q.obligations.filter(o => ['NEEDS_QUEST_ADAPTER', 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'SOURCE_BLOCKED', 'DEFERRED_SEMANTIC'].includes(o.classification))
    .map(o => `${o.classification}:${o.capabilityId}`))).map(id => {
    const classification = id.slice(0, id.indexOf(':')) as Classification;
    const capability = id.slice(id.indexOf(':') + 1);
    const affected = quests.filter(q => q.obligations.some(o => o.capabilityId === capability && o.classification === classification));
    const atoms = affected.flatMap(q => q.obligations.filter(o => o.capabilityId === capability && o.classification === classification));
    const unlocked = affected.filter(q => q.readiness !== 'PRODUCTION_READY_EXISTING' && q.obligations.every(o =>
      ['SUPPORTED_EXISTING_PRIMITIVE', 'SUPPORTED_EXISTING_COMPOSITION', 'NO_RUNTIME_EFFECT'].includes(o.classification) || o.capabilityId === capability));
    return { id, capabilityId: capability, description: unique(atoms.map(o => o.reason)).join(' '),
      affectedQuestIds: affected.map(q => q.definitionId).sort(), affectedQuestCount: affected.length, classification,
      existingPrimitiveReuse: unique(atoms.flatMap(o => o.runtimeEvidence.map(e => e.path + (e.symbol ? '#' + e.symbol : '')))),
      newPrimitiveRequired: classification === 'NEEDS_NEW_RUNTIME_PRIMITIVE', sourceClear: classification !== 'SOURCE_BLOCKED' && classification !== 'DEFERRED_SEMANTIC',
      sourceClearWholeQuestCount: affected.filter(q => q.sourceCompleteness.executableSourceClear).length,
      implementationComplexity: classification === 'NEEDS_NEW_RUNTIME_PRIMITIVE' ? 'HIGH_SAVED_LIFECYCLE' : classification === 'NEEDS_QUEST_ADAPTER' ? 'MEDIUM_BINDING_AND_TRANSACTION' : 'EVIDENCE_OR_SEMANTIC_REVIEW',
      estimatedReuse: affected.length, recommendedPriority: unlocked.length ? 'P0' : classification === 'SOURCE_BLOCKED' ? 'P1_SOURCE_POLICY_GATE' : 'P2_DEPENDENCY_BLOCKED',
      expectedWholeQuestCoverageGain: unlocked.length, unlockedQuestIds: unlocked.map(q => q.definitionId).sort(),
      workType: classification === 'NEEDS_NEW_RUNTIME_PRIMITIVE' ? 'NEW_PRIMITIVE' : classification === 'NEEDS_QUEST_ADAPTER' ? 'ADAPTER' : classification === 'SOURCE_BLOCKED' ? 'SOURCE' : 'SEMANTIC_DEFER' };
  });
  const roi = [...backlog].sort((a, b) => b.expectedWholeQuestCoverageGain - a.expectedWholeQuestCoverageGain
    || b.sourceClearWholeQuestCount - a.sourceClearWholeQuestCount || b.estimatedReuse - a.estimatedReuse || a.id.localeCompare(b.id));
  const historicalComparison = { historicalSourceDefinitionCount: historical.sourceDefinitionCount, currentDefinitionCount: quests.length,
    historicalProductionReadyCount: historical.productionReadyCount, currentProductionReadyExistingCount: ready.length,
    historicalSourceGateCount: historical.sourceGateCount, currentSourceBlockedCount: counts.SOURCE_BLOCKED,
    currentSourceBlockedInclusiveCount: ids(q => q.obligations.some(o => o.classification === 'SOURCE_BLOCKED')).length,
    newlyUnblockedQuestIds: ready.filter(id => !historical.readyIds.includes(id)),
    stillSourceBlockedQuestIds: ids(q => historical.sourceGatedIds.includes(q.definitionId) && q.obligations.some(o => o.classification === 'SOURCE_BLOCKED')),
    newlyAdapterReadyQuestIds: ids(q => q.readiness === 'ADAPTER_READY' && !q.historical.productionReady),
    runtimePrimitiveBlockedQuestIds: ids(q => q.readiness === 'RUNTIME_PRIMITIVE_BLOCKED'),
    runtimePrimitiveBlockedInclusiveQuestIds: ids(q => q.obligations.some(o => o.classification === 'NEEDS_NEW_RUNTIME_PRIMITIVE')),
    deferredSemanticQuestIds: ids(q => q.readiness === 'DEFERRED_SEMANTIC'),
    deferredSemanticInclusiveQuestIds: ids(q => q.obligations.some(o => o.classification === 'DEFERRED_SEMANTIC')),
    newlyDiscoveredSourceQuestIds: ids(q => !historical.quests.some(s => s.definitionId === q.definitionId)),
    multiBlockedQuestIds: ids(q => q.readiness === 'MULTI_BLOCKED'),
    newlyUnblockedEvidence: quests.filter(q => ready.includes(q.definitionId) && !q.historical.productionReady).map(q => ({ definitionId: q.definitionId, obligations: q.obligations })),
    removedHistoricalDependencyClaims: quests.filter(q => q.dependencies.trinket.length).map(q => ({ definitionId: q.definitionId,
      obsoleteClaim: 'Literal/source Level 2/3 deck incomplete', removedBy: [E.deck, E.deckProof],
      remaining: 'Frozen effect timing/source gates and exact Quest acquisition/return/lifecycle binding; no whole-Quest promotion' })) };
  const sourceWork = backlog.find(b => b.capabilityId === 'REST_OFFICIAL_SOURCE_SCOPE')!;
  const decision = { phase, nextPhase: '11A.7-C4B', decisionCount: 1, selectedKind: 'SOURCE_EVIDENCE_SUCCESSOR',
    selectedCapabilityFamily: 'REST_OFFICIAL_CONTRACT_REVIEW', implementationBatchSelected: false,
    reason: 'No source-clear whole-Quest implementation batch exists under the frozen dependencies. Every non-ready Quest retains a canonical source gate; adapter completion alone promotes zero.',
    affectedQuestIds: sourceWork.affectedQuestIds, expectedQuestCoverageGain: 0,
    conditionalSourceGateReduction: sourceWork.affectedQuestCount,
    conditionalExistingAdapterCandidates: quests.filter(q => q.rest.status === 'SOURCE_BLOCKED' && q.currentBinding.adapterId
      && questData.find(s => s.id === q.definitionId)!.specialRules.length === 0
      && q.obligations.every(o => o.dependencies.includes('REST') || !['SOURCE_BLOCKED', 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'DEFERRED_SEMANTIC'].includes(o.classification))).map(q => q.definitionId).sort(),
    conditionalCandidateQualification: 'Existing simple adapters only; not a promotion promise. Requires official Rest closure, current production/save/player-path proof and selector recheck.',
    sourceClear: false, existingPrimitivesReused: [E.restRuntime, E.quest, E.save], newRuntimePrimitivesRequired: [],
    whyHigherROI: 'Rest is shared across all Firewood Quests and gates already-authored simple adapters. Monster/Hero routing cannot remove it; Trinket-only Quests retain independent frozen source timing gates.',
    alternatives: roi.filter(r => r.workType !== 'SOURCE').map(r => ({ id: r.id, expectedQuestCoverageGain: r.expectedWholeQuestCoverageGain, affectedQuestCount: r.affectedQuestCount })),
    authorizedNextAction: 'Review existing locked official rulebook/page bindings for Rest authority. Reopen acquisition only if an omitted locked official page is identified or the user changes policy. Otherwise retain SOURCE_UNRESOLVED and wait; no FAQ/community acquisition, no project ruling, no C4B implementation in C4A.',
    stopAfterC4A: true };
  const sourceGaps = quests.flatMap(q => q.obligations.filter(o => o.classification === 'SOURCE_BLOCKED' || o.classification === 'DEFERRED_SEMANTIC')
    .map(o => ({ definitionId: q.definitionId, obligationId: o.obligationId, evidence: [...o.sourceEvidence, ...o.runtimeEvidence],
      ambiguousField: o.capabilityId === 'QUEST_LITERAL_SOURCE' ? q.sourceCompleteness.unresolvedFields.join(', ') : o.sourceField,
      whyExactExecutionCannotBeDerived: o.reason, affectedCapability: o.capabilityId, classification: o.classification,
      canonicalStatus: o.classification === 'SOURCE_BLOCKED' ? 'SOURCE_UNRESOLVED' : 'DEFERRED_SEMANTIC' })));
  return { quests, counts, monsterFacts, backlog, roi, historicalComparison, decision, sourceGaps };
}

export function assertC4A(a: ReturnType<typeof buildC4A>) {
  assert.equal(new Set(a.quests.map(q => q.definitionId)).size, questData.length);
  assert.deepEqual(a.quests.map(q => q.definitionId).sort(), questData.map(q => q.id).sort());
  assert.equal(Object.values(a.counts).reduce((sum, n) => sum + n, 0), questData.length);
  for (const q of a.quests) {
    assert.equal(new Set(q.obligations.map(o => o.obligationId)).size, q.obligations.length);
    assert.equal(q.readiness, classifyReadiness(q.obligations, q.currentBinding.boundProductionProof));
    assert.ok(q.obligations.every(o => CLASSIFICATIONS.includes(o.classification) && o.sourceEvidence.length));
    assert.ok(q.obligations.filter(o => o.classification.startsWith('SUPPORTED')).every(o => o.runtimeEvidence.length));
  }
  assert.equal(a.decision.decisionCount, 1);
  assert.ok(!a.decision.implementationBatchSelected || a.decision.sourceClear);
  assert.deepEqual(a, buildC4A(), 'Current evidence/capability classification drift');
}

export function assertPrintedEvidence() {
  for (const record of sourceEvidence.records) {
    for (const [path, expected] of [[record.frontAssetPath, record.frontSha256], [record.backAssetPath, record.backSha256],
      [record.observation.file, record.observation.sha256]]) assert.equal(hash(readFileSync(path)), expected, 'Printed evidence bytes changed: ' + path);
  }
}

/** Exact byte preservation, including historic evidence and all runtime paths. */
export function assertFrozenInputs() {
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', C4A_BASE], { encoding: 'utf8' }).trim().split(/\r?\n/);
  const allowed = (p: string) => p === 'package.json' || p === '.github/workflows/development-fast-gate.yml' || /^(scripts\/audit\/c4a-|src\/audit\/c4a-|docs\/(data|reports)\/complete-edition\/c4a-)/.test(p);
  const changed = execFileSync('git', ['diff', '--name-only', C4A_BASE], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(changed.every(allowed), 'C4A change outside allowed audit scope: ' + changed.filter(p => !allowed(p)).join(', '));
  // Batched git extraction avoids thousands of child processes. The diff checks tracked
  // byte changes; untracked gameplay files must also be rejected.
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(untracked.every(allowed), 'C4A untracked file outside allowed audit scope');
  assert.ok(paths.includes('src/game-engine/monsters/production-encounter.ts'));
  const before = JSON.parse(execFileSync('git', ['show', C4A_BASE + ':package.json'], { encoding: 'utf8' }));
  const after = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const key of Object.keys(after.scripts).filter(k => k.endsWith(':complete-edition-c4a'))) delete after.scripts[key];
  assert.deepEqual(after, before, 'Only C4A package scripts may change');
  return { baseHead: C4A_BASE, frozenFilesReviewed: paths.filter(p => !allowed(p)).length,
    gameplayRuntimeChanged: false, c2eHeroBehaviorChanged: false, c3eMonsterBehaviorChanged: false, historicArtifactsChanged: false };
}

export function artifactsC4A(a = buildC4A()) {
  assertC4A(a);
  assertPrintedEvidence();
  const common = { schemaVersion: 'C4A-QUEST-REBASELINE-v1', phase, baseMainHead: C4A_BASE, sourcePolicy: policy.policyId };
  const paths = unique(a.quests.flatMap(q => q.obligations.flatMap(o => [...o.sourceEvidence, ...o.runtimeEvidence].map(e => e.path))));
  const inputHashes = paths.map(path => ({ path, sha256: hash(readFileSync(path)) }));
  // Repeated paths/rationales are references, not redundant evidence copies.
  const evidenceValues = [...new Map(a.quests.flatMap(q => q.obligations.flatMap(o => [...o.sourceEvidence, ...o.runtimeEvidence]))
    .map(e => [JSON.stringify(e), e])).values()];
  const evidenceCatalog = evidenceValues.map((e, i) => ({ evidenceId: `E${i + 1}`, ...e }));
  const evidenceId = (e: Evidence) => `E${evidenceValues.findIndex(v => JSON.stringify(v) === JSON.stringify(e)) + 1}`;
  const reasons = unique(a.quests.flatMap(q => q.obligations.map(o => o.reason)));
  const rationaleCatalog = reasons.map((reason, i) => ({ rationaleId: `R${i + 1}`, reason }));
  const matrixQuests = a.quests.map(q => ({ definitionId: q.definitionId, readiness: q.readiness,
    obligations: q.obligations.map(({ sourceEvidence, runtimeEvidence, reason, ...o }) => ({ ...o,
      rationaleId: `R${reasons.indexOf(reason) + 1}`, sourceEvidenceIds: sourceEvidence.map(evidenceId), runtimeEvidenceIds: runtimeEvidence.map(evidenceId) })),
    historicalBlockerReview: q.historicalBlockerReview }));
  return {
    [root + 'c4a-standard-quest-census.json']: { ...common, definitionCount: a.quests.length,
      corpusBoundary: 'Union of current normalized source definitions and printed evidence: 76 identities (75 standard-tagged plus Face the Threat). Frozen runtime catalog has 75; Rest in Rubble III is source-blocked and omitted there. Separate prototype, Darkest Dungeon and production Boss adapters excluded.',
      runtimeCatalogDefinitionCount: runtimeQuestData.length,
      sourceOnlyDefinitionIds: questData.filter(q => !runtimeQuestData.some(s => s.id === q.id)).map(q => q.id),
      identitySet: a.quests.map(q => q.definitionId).sort(), monsterFacts: a.monsterFacts,
      quests: a.quests.map(({ obligations, historicalBlockerReview, ...q }) => q) },
    [root + 'c4a-standard-quest-capability-matrix.json']: { ...common, readinessPrecedence: 'Multiple independent hard blocker classes -> MULTI_BLOCKED; adapter gaps alone are ADAPTER_READY; production readiness requires exact current binding/proof.',
      inputHashes, evidenceCatalog, rationaleCatalog, quests: matrixQuests },
    [root + 'c4a-standard-quest-source-gaps.json']: { ...common, externalSourceAcquisition: false, projectRulingsIntroduced: false,
      trinketDeckDistinction: '37 literal/source identities complete; 15 effect-ready. Source-blocked timing semantics remain separate from random draw/ownership support.', gaps: a.sourceGaps },
    [root + 'c4a-standard-quest-runtime-backlog.json']: { ...common, deduplication: 'classification + reusable capability family', items: a.backlog },
    [root + 'c4a-standard-quest-roi-matrix.json']: { ...common, priorityModel: ['source-clear whole-Quest gain', 'source-clear affected Quests', 'cross-Quest reuse', 'existing accepted primitive reuse', 'architectural risk', 'semantic ambiguity'],
      immediateWholeQuestGain: 0, items: a.roi.map((r, i) => ({ rank: i + 1, backlogId: r.id, workType: r.workType,
        sourceClear: r.sourceClear, sourceClearWholeQuestCount: r.sourceClearWholeQuestCount,
        expectedWholeQuestCoverageGain: r.expectedWholeQuestCoverageGain, affectedQuestCount: r.affectedQuestCount,
        estimatedReuse: r.estimatedReuse, implementationComplexity: r.implementationComplexity, recommendedPriority: r.recommendedPriority })) },
    [root + 'c4a-standard-quest-status.json']: { ...common, outcome: 'C4A_STANDARD_QUEST_REBASELINE_COMPLETE',
      currentQuestDefinitionCount: a.quests.length, counts: a.counts, comparison: a.historicalComparison, freezeReview: assertFrozenInputs(),
      validationScope: ['npm ci', 'typecheck', 'verify:complete-edition-c3e (unchanged base checkout)', 'test:complete-edition-c4a', 'verify:complete-edition-c4a', 'build'],
      c3eVerificationNote: 'C3E --development verification passes on the authoritative starting checkout. Its global source fingerprint includes package.json and successor audit files, so C4A does not rewrite it to impersonate a C3E receipt. C4A verifier independently requires exact base bytes for every frozen file.',
      fullRegressionRun: false, browserTestsRun: false, c4bImplemented: false },
    [root + 'c4a-next-workstream-decision.json']: { ...common, ...a.decision },
  };
}
if (process.argv.includes('--write') || process.argv.includes('--verify')) {
  const artifacts = artifactsC4A();
  for (const [path, value] of Object.entries(artifacts)) {
    const bytes = JSON.stringify(value, null, 2) + '\n';
    if (process.argv.includes('--write')) { mkdirSync(root, { recursive: true }); writeFileSync(path, bytes); }
    else assert.equal(hash(readFileSync(path)), hash(bytes), 'Stale C4A artifact: ' + path);
  }
  console.log(JSON.stringify({ status: 'C4A_STANDARD_QUEST_REBASELINE_COMPLETE', counts: buildC4A().counts }));
}
