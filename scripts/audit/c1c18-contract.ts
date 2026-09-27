import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_1_TRINKET_CENSUS, LEVEL_1_TRINKET_DECK_COVERAGE } from '../../src/audit/level1-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { LEVEL_3_TRINKET_DECK_COVERAGE } from '../../src/audit/level3-trinket-deck';
import { RUNTIME_WINDOW_BINDINGS } from '../../src/audit/trinket-semantic-coverage';
import { getTrinketPoolByLevel, runtimeContentContext } from '../../src/data/content-selector';
import { createNewCampaign } from '../../src/game-engine/campaign';

export const baselineHead = 'd7bd56c65db32ef0cb8aa2a2c365c27f1df95b18';
export const implementationAnchor = 'e7f4b4a94940ebc714301912a93f7fc9a173fd93';
export const implementationTree = '041f20ad33911f73e68eee6d5799a9d0ac733ff9';
export const verdict = 'C1C18-DAMAGE-STONE-WOUND-CONTRACT-SOURCE-EXHAUSTED-STILL-UNRESOLVED';
export const id = 'community-trinket-core-damage-stone';
export const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const read = (path: string) => readFileSync(path, 'utf8');
const tracked = (prefix: string) => git('ls-tree', '-r', '--name-only', baselineHead, '--', prefix).split(/\r?\n/).filter(Boolean);
const hashes = (paths: string[]) => Object.fromEntries(paths.map(path => [path, path === 'docs/DD_EN_COREBOX_RULES.pdf'
  ? JSON.parse(git('show', baselineHead + ':docs/data/complete-edition/c1a-rulebook-evidence.json')).sha256
  : sha(execFileSync('git', ['show', `${baselineHead}:${path}`], { maxBuffer: 64 * 1024 * 1024 }))]));
const meta = { schemaVersion: 1, phase: '11A.4-C1C-18', baselineHead, implementationAnchor, implementationTree };
const official = 'docs/DD_EN_COREBOX_RULES.pdf';

// Every production call site is inventoried, including monster-only sites (explicitly excluded).
const callNotes: Record<string, [string, string, string]> = {
  'src/game-engine/battle.ts:673': ['hero skill target / enemy or ally skill damage', 'Battle', 'heroUseSkill; raw output modifiers and trinket damage bonuses precede primitive'],
  'src/game-engine/battle.ts:872': ['staged monster attack', 'Battle', 'commitPendingMonsterAttackResolution; incoming modifiers and scale precede primitive; pending attack clears before damage'],
  'src/game-engine/battle.ts:968': ['legacy monster attack', 'Battle', 'runMonsterTurn; incoming damage modifiers precede primitive'],
  'src/game-engine/status-effects.ts:239': ['bleed + blight periodic batch', 'Battle', 'battle activateUnitAfterMental -> resolveStartOfTurnConditions; independent damage-taken modifiers then one combined transaction'],
  'src/game-engine/mental-effects.ts:165': ['mental card self damage', 'Battle', 'apply mental effect damage-self; directly calls primitive'],
  'src/game-engine/dungeon.ts:306': ['trap room', 'Campaign', 'room entry trap -> random living victim; downstream stress and visited commit are synchronous'],
  'src/game-engine/exploration.ts:59': ['exploration hunger / trap / rubble', 'Campaign', 'applyExplorationResult -> dealExplorationDamage; living party hunger or random trap/rubble victim'],
  'src/game-engine/quirks.ts:191': ['quirk damage-self', 'Campaign', 'emitRuleEvent -> passive effect; derived=true suppresses damage-resolved'],
  'src/game-engine/quirks.ts:212': ['disease / quirk scaled self damage', 'Campaign', 'passive damage-self-scaled; derived=true suppresses damage-resolved'],
  'src/game-engine/trinkets/use-trinket.ts:120': ['active trinket self damage', 'Campaign + sync to Battle', 'applyOneEffect damage-self; effectEventId derives from Use idempotency key; syncHeroVitalsToBattle after commit'],
  'src/game-engine/room-hazards/room-hazard-trigger.ts:144': ['quest room hazard / pit damage', 'Campaign', 'room hazard effects -> resolveDamage with deterministic event suffix; continue other effects synchronously'],
  'src/game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action.ts:354': ['boss attack', 'Campaign', 'Mammoth Cyst action -> resolveDamage; persisted skill transaction; then stress/effects continue'],
  'src/game-engine/campaign/act-four/community-guardian-room-state.ts:162': ['guardian pit entry', 'Battle', 'pit toss -> entry damage; then entry conditions continue'],
  'src/game-engine/campaign/act-four/community-guardian-combat.ts:217': ['guardian special attack', 'Battle', 'guardian skill -> hero target damage; then conditions/stress/special leaf continue'],
  'src/game-engine/campaign/act-four/community-final-combat.ts:113': ['final encounter extra damage', 'Battle', 'applyHitEffects -> extra damage effects; synchronous multiple effects'],
  'src/game-engine/campaign/act-four/community-final-combat.ts:245': ['final encounter attack', 'Battle', 'final skill -> hero target damage; then leaf stress and other effects continue'],
  'src/game-engine/campaign/act-four/community-final-combat.ts:466': ['ancestor wounds on monster death', 'Battle monster only', 'ancestor actor is a monster; excluded from Campaign Hero trigger scope'],
};
export function damageCalls() {
  return tracked('src/game-engine').filter(p => /\.ts$/.test(p) && !/\.(test|spec)\.ts$/.test(p)).flatMap(path => {
    const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
    const calls: Array<{ primitive: string; line: number; functionName: string }> = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['resolveDamage', 'applyBattleUnitDamage'].includes(node.expression.text)) {
        let parent: ts.Node | undefined = node.parent;
        while (parent && !ts.isFunctionDeclaration(parent)) parent = parent.parent;
        const functionName = parent && ts.isFunctionDeclaration(parent) ? parent.name?.text ?? 'anonymous' : 'module';
        calls.push({ primitive: node.expression.text, line: file.getLineAndCharacterOfPosition(node.expression.getStart(file)).line + 1, functionName });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return calls.map(call => {
    const key = `${path}:${call.line}`;
    const note = callNotes[key];
    if (!note) throw new Error('Unaudited production damage caller: ' + key);
    const campaign = call.primitive === 'resolveDamage';
    return { caller: key, source: note[0], actualProductionCaller: note[2], containingFunction: call.functionName, primitive: call.primitive, scope: note[1],
      heroDamagePossible: !note[1].includes('monster only'), sourceSha256: sha(read(path)),
      actualDamageAmountObservable: campaign ? 'modifiedAmount local inside resolveDamage, absent from returned resolution; HP delta inadequate at Death\'s Door' : 'Final amount local primitive argument, not persisted as damage event; HP delta inadequate at Death\'s Door',
      stableEventId: campaign ? 'DamageCommand.eventId; not a complete frozen damage root' : 'NONE_IN_PRIMITIVE; upstream action/effect ids vary',
      canPauseResume: false, savePersistent: 'Committed vitals persist; no per-damage active continuation checkpoint', deathsDoorInvolved: !note[1].includes('monster only'),
      genericDamageResolvedCoverage: campaign ? 'ONLY_NON_DERIVED_LIVING_POST_COMMIT; no damage amount/transaction payload; DD safe branch also emits' : 'NONE',
    };
    });
  });
}
export function buildContracts() {
  const extracted = JSON.parse(read('docs/data/complete-edition/c1c18-rulebook-extracted-evidence.json'));
  const source = COMMUNITY_SOURCE_TRINKETS.find(c => c.id === id)!;
  const rawCards = JSON.parse(read('src/data/community-reference/trinkets/data.json')) as any[];
  const literals = JSON.parse(read('docs/data/complete-edition/trinkets/community-trinket-source-evidence.json')).records;
  const cardProof = (card: any) => {
    const literal = literals.find((r: any) => r.definitionId === card.id);
    const asset = card.leafProvenance['negativeSide.effects.0.kind'] ?? card.leafProvenance['negativeSide.trigger'];
    return { definitionId: card.id, sourceReferences: card.sourceReferences, positive: card.positiveSide, negative: card.negativeSide,
      literalPositive: literal.positiveSide.printedText, literalNegative: literal.negativeSide.printedText,
      assetPath: asset.assetPath, assetSha256: sha(readFileSync(asset.assetPath)), region: asset.region };
  };
  const grammar = rawCards.filter(c => [c.positiveSide, c.negativeSide].some(s => s.effects.some((e: any) => e.kind === 'suffer-wounds'))).map(cardProof);
  const contrast = cardProof(rawCards.find(c => c.id === 'community-trinket-core-book-of-sanity'));
  const fact = (factId: string, page: number, region: string, requiredText: string, semanticFact: string) => ({ factId, source: official,
    sourceSha256: sha(readFileSync(official)), page, region, requiredText, semanticFact,
    bboxPoints: extracted.pages[page - 1].regions.find((r: any) => r.region === region).bboxPoints });
  const facts = [
    fact('DAMAGE_PLACES_WOUND_TOKENS', 19, 'right-column', 'equal to the Damage', 'A successful skill applies Wound tokens equal to the Damage it dealt; healing removes tokens. This is a directional conversion, not universal pipeline equivalence.'),
    fact('BLEED_EXAMPLE_USES_BOTH_WORDS', 20, 'right-column', 'only suffer 2 Damage', 'The same Bleed example calls the current injury Wounds and the next-round injury Damage. This shows overlapping prose usage but not equivalence for all modifiers, triggers or naked card instructions.'),
    fact('LIFE_THRESHOLD', 29, 'left-column', 'Wounds equal to their Life', 'Heroes enter Death\'s Door when Wounds reach Life, instead of immediately dying; Wounds cannot exceed Life.'),
    fact('ANY_AMOUNT_ONE_DEATHBLOW', 29, 'left-column', 'any amount of Wounds', 'At Death\'s Door, any amount of Wounds replaces token application with a roll of the Deathblow die. A skull kills; otherwise survive.'),
    fact('SIMULTANEOUS_CONDITIONS_ONE_ROLL', 29, 'right-column', 'apply their Wounds simultaneously', 'Simultaneous wounding conditions (Bleed and Blight) cause only one Deathblow roll.'),
    fact('PROTECTION_ATTACK_DAMAGE', 21, 'right-column', 'from attacks', 'Protection halves Damage from attacks (rounded up). No identification of naked suffer-Wounds as attack Damage.'),
    fact('ACTIVE_TRINKET_DECLARATION', 26, 'left-column', 'they declare the use', 'Trinkets require active declaration when applicable, then resolve and flip; in battle once per turn.'),
    fact('TAKES_DAMAGE_CAN_MODIFY', 27, 'left-column', 'reduce it by 1', 'On Guard uses When the Hero takes Damage to reduce it by 1; the phrase alone is not universal proof of after-commit timing.'),
    fact('DERIVED_WOUND_GRAMMAR', 28, 'left-column', 'take 1 Wound per Hero Level', 'Syphilis distinguishes taking Damage from taking a derived Wound; does not define recursion or trinket opportunity timing.'),
  ];
  const freezePaths = [...tracked('docs/data/complete-edition'), ...tracked('docs/reports/complete-edition'),
    'src/data/community-reference/trinkets/data.json', ...grammar.map(c => c.assetPath), contrast.assetPath, official];
  const trigger = { trigger: 'hero-takes-damage', requiresPositiveAppliedAmount: null, firesAfterCommit: null, firesBeforeCommit: null,
    deadHeroEligible: false, deadHeroPolicy: 'ACTIVE_DECLARATION_LIVING_SUBJECT_FAIL_CLOSED', battleCoverage: false, explorationCoverage: false,
    sourceStatus: 'SOURCE_UNRESOLVED', runtimeScopeStatus: 'RUNTIME_SCOPE_PARTIAL', timingBlocker: 'SOURCE_TIMING_UNRESOLVED',
    ordering: 'NO_EXACT_ORDER_AUTHORIZED: incoming hit/prevention windows are not equivalent; commit vs pre-commit unresolved',
    zeroFinalDamagePolicy: 'UNRESOLVED_FAIL_CLOSED; hit is not proof of taking Damage',
    passiveEventPolicy: 'DETECTION_CANDIDATE_ONLY_NOT_ACTIVE_WINDOW',
    requiredActiveLifecycle: ['freeze original continuation', 'open active opportunity for eligible living holder', 'Use / Decline', 'resume exactly once'],
    futureFrozenFields: ['rootEventId', 'heroId', 'sourceType', 'sourceActorId', 'sourceSkillId', 'originalAmount', 'finalAppliedAmount', 'previousHp', 'nextHp', 'damageEventId'],
  };
  const wound = { ...meta, token: 'wound', sourceMeaning: 'Wound tokens record injury up to Life; skill Damage places that many tokens. At Death\'s Door replace suffering any amount with a Deathblow roll.',
    equivalentToDamage: null, protectionApplies: null, damageModifiersApply: null, damageResistanceApplies: null,
    deathDoorBehavior: 'At Life Wounds enter Death\'s Door; Wounds never exceed Life.', deathblowBehavior: 'Already at Death\'s Door: roll die instead of taking more Wounds; skull kills.',
    multiWoundDeathblowCount: 1, sourceStatus: 'PARTIALLY_SOURCE_BOUND', primitiveDecision: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', primitiveOutcome: 'C',
    exactPrimitiveProven: false, reuseDamagePipelineProven: false, facts, grammarInventory: grammar, damageContrast: contrast,
    tokenComparison: 'DISTINCT_PRINTED_TOKENS; universal runtime equivalence UNRESOLVED',
    researchScope: 'All 44 pages of bundled official core rulebook, including condition, protection, trinket, quirk/disease and PvP sections. No external rule inference.',
    searchedTerms: extracted.searchedTerms,
    questions: {
      Q1: 'Tokens are injury bookkeeping; HP=Life-Wounds is a representation inference. Not merely HP loss: at Death\'s Door Wounds become a die roll.',
      Q2: 'Normal state injury tokens capped by Life; already at Death\'s Door replace with die. No unconditional wounds += N contract.',
      Q3: 'Protection is stated for Damage; no explicit universal rule applying Protection, modifiers or resistance to naked suffer-Wounds instructions. Unresolved.',
      Q4: 'One roll for any amount of Wounds, including 2, when already at Death\'s Door (p29).',
      Q5: 'Permanently dead subject cannot actively declare: fail closed. No Damage Stone opportunity.',
      Q6: 'No explicit zero-final-Damage take-Damage definition found. Unresolved; cannot substitute hit.',
    }, unresolved: ['Protection/modifiers/resistance for suffer-wounds', 'hero-takes-damage exact commit ordering', 'zero-final-Damage trigger semantics', 'unified staged battle/campaign scope'],
  };
  return {
    'c1c18-wound-semantics-contract.json': wound,
    'c1c18-damage-stone-source-contract.json': { ...meta, definitionId: id, sourceStatus: source.sourceStatus, unresolvedFields: source.unresolvedFields,
      card: cardProof(rawCards.find(c => c.id === id)), positive: source.positiveSide, negative: source.negativeSide, trigger,
      deathsDoorContract: { id: 'damage-stone-deaths-door-contract', evidence: ['LIFE_THRESHOLD', 'ANY_AMOUNT_ONE_DEATHBLOW'], scenarios: [
        { originalOutcome: 'still HP > 0', woundRule: 'injury tokens bounded by Life', negativeApplicable: false, reason: 'unresolved active timing/modifier semantics' },
        { originalOutcome: 'enter Death\'s Door', woundRule: 'subsequent suffer 2 Wounds at Death\'s Door would roll once', negativeApplicable: false, reason: 'commit ordering unresolved; cannot authorize declaration' },
        { originalOutcome: 'already Death\'s Door; Deathblow safe', woundRule: 'another distinct suffer 2 Wounds transaction would roll once', negativeApplicable: false, reason: 'take-Damage trigger and ordering unresolved' },
        { originalOutcome: 'already Death\'s Door; permanently died', woundRule: 'dead subject', negativeApplicable: false, reason: 'dead hero cannot actively declare' },
      ] }, productionReady: false },
    'c1c18-damage-runtime-surface.json': { ...meta, callers: damageCalls(), coverage: 'RUNTIME_SCOPE_PARTIAL',
      searchedCategories: ['monster attack', 'hero / enemy skill effects', 'bleed', 'blight', 'periodic condition batch', 'trap', 'exploration damage', 'quirk / disease derived damage', 'trinket self-damage', 'quest / boss / threat damage'],
      threatFinding: 'No separate threat direct-HP damage primitive/caller found; existing quest/boss/hazard paths are inventoried.',
      vitalsWriteAudit: 'All tracked game-engine hp/wounds writes inspected: creation/load, healing, upgrade clamping, battle settlement sync and permanent-death/linked-monster removal are not additional take-Damage transactions. Heart attack is stress-induced death, not damage.',
      gaps: ['Battle primitive does not emit damage-resolved', 'Derived campaign damage deliberately suppresses passive event', 'Passive event lacks final applied amount and damage identity', 'No damage-wide saved active pause/resume', 'Campaign DD modifier-zero branch can still roll/emit; not positive applied damage proof'],
      campaignPipeline: { path: 'src/game-engine/damage.ts', passiveTiming: 'after committed vitals / safe Deathblow; dead short-circuits', amount: 'resolution has HP endpoints but not finalAppliedAmount', replay: 'processedDamageEventIds persisted, capped at 200; no active continuation' },
      battlePipeline: { path: 'src/game-engine/damage.ts', passiveEvent: false, replay: 'unit vitals persist; no primitive event id or continuation', synchronization: 'battle.ts syncBattleToHeroes / quest-result settlement; not a unified damage event' },
    },
    'c1c18-damage-stone-feasibility.json': { ...meta, definitionId: id, positiveFeasibility: 'READY_FOR_IMPLEMENTATION',
      positive: { trigger: 'hero-skill-resolution', target: 'skill', modifier: { stat: 'damage', amount: 3 },
        runtimeWindow: 'after-attack-roll-before-hit-resolution', semanticBinding: RUNTIME_WINDOW_BINDINGS['after-attack-roll-before-hit-resolution'],
        primitive: 'POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW', consumer: 'PendingBattleAction.damageBonus -> getPendingTrinketBonuses -> battle rawDamage',
        evidence: ['src/audit/trinket-semantic-coverage.ts:139', 'src/game-engine/trinkets/battle-trinket-bridge.ts:286', 'src/game-engine/trinkets/battle-trinket-bridge.ts:189', 'src/game-engine/battle.ts:655'], implementationStatus: 'NOT_IMPLEMENTED' },
      negative: { semantics: 'SOURCE_SEMANTICS_UNRESOLVED', triggerScopeStatus: 'SOURCE_UNRESOLVED', runtimeScopeStatus: 'RUNTIME_SCOPE_PARTIAL',
        retainedBlockers: ['NO_EXACT_ACTIVE_TRINKET_PRIMITIVE_SUFFER_WOUNDS', 'TRINKET_TRIGGER_WINDOW_MISSING:hero-takes-damage', 'SOURCE_TIMING_UNRESOLVED'] },
      productionReady: false, terminalVerdict: verdict, historicalEvidenceHashes: hashes(freezePaths),
      normalizedSourceSha256: sha(read('src/data/community-reference/trinkets/data.json')), rulebookSourceSha256: sha(readFileSync(official)),
      level1Coverage: LEVEL_1_TRINKET_DECK_COVERAGE, level2Coverage: LEVEL_2_TRINKET_DECK_COVERAGE, level3Coverage: LEVEL_3_TRINKET_DECK_COVERAGE,
      readySubset: getTrinketPoolByLevel(runtimeContentContext(createNewCampaign('community-complete-edition')), 1).map(c => c.id).sort(),
      damageStoneCapability: COMMUNITY_TRINKET_CAPABILITIES.find(c => c.definitionId === id),
      damageStoneAdapterExists: Boolean(COMMUNITY_TRINKET_RUNTIME_ADAPTERS[id]),
      conditionCharms: { status: 'DEFERRED', requiredContract: 'hero-caused-condition-source-contract', ids: ['bleed', 'blight', 'debuff', 'stun'].map(n => `community-trinket-core-${n}-charm`) }, nextPhase: 'C1C19: hero-caused-condition-source-contract; no Damage Stone runtime' },
    'c1c18-level1-trinket-capability-matrix.json': { ...meta, cards: LEVEL_1_TRINKET_CENSUS, damageStoneAssessment: {
      positive: ['SOURCE_SUPPORTED', 'RUNTIME_IMPLEMENTABLE', 'NOT_IMPLEMENTED'], negative: ['SOURCE_SUPPORTED', 'SOURCE_SEMANTICS_UNRESOLVED'], productionReady: false } },
  };
}
