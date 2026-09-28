import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { git, load, root, sha256, unresolvedLeaves } from './c1c25-contract';

export const baselineHead = '2ba8942bbd080b49260f9cba117729a000ebcddf';
const assert = (value: unknown, message: string) => { if (!value) throw new Error('C1C26: ' + message); };
const rb = (page: number, region: string) => ({ kind: 'LOCKED_CORE_RULEBOOK', path: root + 'c1c19-rulebook-extracted-evidence.json', page, region });
const bound = (value: any, ...sourceReferences: any[]) => ({ status: 'BOUND', value, sourceReferences });
const unknown = (category: string, reason: string, ...sourceReferences: any[]) => ({ status: 'SOURCE_UNRESOLVED', value: null, category, reason, sourceReferences });
const prefix = 'c1c26-necromancer-';
const old = (name: string) => load('c1c25-necromancer-' + name + '.json');
const hash = (path: string) => sha256(readFileSync(path));
export const categories = [
  'BONE_IDENTITY_UNRESOLVED', 'CLEANUP_DESTINATION_UNRESOLVED', 'EFFECT_ORDER_UNRESOLVED',
  'LOWEST_ROLL_HERO_TIE_UNRESOLVED', 'ROOM_CAPACITY_INTERACTION_UNRESOLVED', 'SOURCE_PRECEDENCE_UNRESOLVED',
  'SUMMON_COPY_POLICY_UNRESOLVED', 'SUMMON_COUNT_UNRESOLVED', 'TARGET_TIE_UNRESOLVED',
];
const reviewPages: Record<string, number[]> = {
  BONE_IDENTITY_UNRESOLVED: [6, 17, 38], CLEANUP_DESTINATION_UNRESOLVED: [25, 30, 32, 35, 38],
  EFFECT_ORDER_UNRESOLVED: [17, 20, 24, 25], LOWEST_ROLL_HERO_TIE_UNRESOLVED: [11, 24, 30, 32],
  ROOM_CAPACITY_INTERACTION_UNRESOLVED: [17, 24, 31, 38], SOURCE_PRECEDENCE_UNRESOLVED: [7, 30, 31, 35, 38],
  SUMMON_COPY_POLICY_UNRESOLVED: [6, 7, 10, 17, 25, 31, 38], SUMMON_COUNT_UNRESOLVED: [19, 20, 24, 31, 38],
  TARGET_TIE_UNRESOLVED: [19, 24, 38],
};
const questions: Record<string, string> = {
  BONE_IDENTITY_UNRESOLVED: 'Authenticate the narrow artwork / full Large Captain association and copy instruction; keep the two components distinct.',
  CLEANUP_DESTINATION_UNRESOLVED: 'Identify the post-defeat storage destinations and side/reset policy of the Boss trio.',
  EFFECT_ORDER_UNRESOLVED: 'Specify Reanimation relative to casualty removal, initiative, other death effects and simultaneous first deaths.',
  LOWEST_ROLL_HERO_TIE_UNRESOLVED: 'Specify the Hamlet lowest-D10 tie rule for Haunted Graveyard and The Restless Dead.',
  ROOM_CAPACITY_INTERACTION_UNRESOLVED: 'Specify equal-nearest destination choice and no-available-Area behavior under p31 displacement.',
  SOURCE_PRECEDENCE_UNRESOLVED: 'Acquire an explicit correction or equivalence for printed Bone Rabble versus p38 Bone Rubble.',
  SUMMON_COPY_POLICY_UNRESOLVED: 'Specify reserved/shared pool, dead copy reuse, permanent removal and supply exhaustion behavior.',
  SUMMON_COUNT_UNRESOLVED: 'Specify one summon per Skill/Area versus per successful Hero when one roll has mixed hit results.',
  TARGET_TIE_UNRESOLVED: 'Specify which equally crowded eligible Area is selected; character Stance priority is insufficient.',
};

export function canExhaust(evidence: any): boolean {
  return !!evidence && evidence.knownOfficialCorpusSearched === true && evidence.relevantComponentsChecked === true &&
    evidence.rulebookChecked === true && evidence.faqCheckedOrProvablyUnavailable === true &&
    evidence.noUnexaminedAuthoritativeConflict === true && Array.isArray(evidence.proofReferences) && evidence.proofReferences.length > 0;
}
export function deriveDecision(gaps: any[], readiness: any[], prerequisiteComplete = false) {
  const remaining = gaps.filter(g => g.resolutionStatus !== 'SOURCE_CLOSED');
  const terminal = remaining.length > 0 && remaining.every(g => g.resolutionStatus === 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' && canExhaust(g.exhaustionEvidence));
  const safeSlice = readiness.some(r => r.completeGameplaySlice && r.productionValidationPossible && r.nonReachableGateProven && r.sourceStatus === 'SOURCE_COMPLETE_RUNTIME_MISSING');
  const full = remaining.length === 0 && prerequisiteComplete;
  const outcome = full ? 'NECROMANCER_RUNTIME_FOUNDATION_SELECTED' : safeSlice ? 'NECROMANCER_PARTIAL_RUNTIME_FOUNDATION_SELECTED' : terminal ? 'NECROMANCER_TERMINAL_BLOCKER_CONSOLIDATION' : 'NECROMANCER_SOURCE_CLOSURE_CONTINUATION';
  return { selectedFamily: 'Necromancer', outcome, runtimeFoundationAllowed: full || safeSlice,
    partialScopeAllowed: safeSlice && !full, expectedProductionReadyGain: 0,
    nextAction: full ? 'C1C27 Necromancer Runtime Foundation' : safeSlice ? 'C1C27 Necromancer Partial Runtime Foundation' : terminal ? 'C1C27 Terminal Blocker Consolidation; reassess frozen C1C24 family ROI' : 'C1C27 Necromancer Source Closure Continuation',
    verdict: 'NEXT-' + outcome.replace(/_/g, '-'), remainingLeafUsages: remaining.length, terminalLeafUsages: remaining.filter(g => g.resolutionStatus === 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' && canExhaust(g.exhaustionEvidence)).length };
}

export function buildArtifacts(): Record<string, any> {
  const a: Record<string, any> = {};
  const inputNames = ['c1c25-necromancer-source-gap-register.json', 'c1c25-necromancer-card-semantic-contracts.json',
    'c1c25-necromancer-encounter-composition.json', 'c1c25-necromancer-room-contract.json', 'c1c25-necromancer-source-precedence.json',
    'c1c25-necromancer-bone-source-binding.json', 'c1c25-necromancer-cleanup-contract.json', 'c1c25-necromancer-setup-contract.json',
    'c1c25-necromancer-runtime-capability-matrix.json', 'c1c25-necromancer-source-manifest.json', 'c1c19-rulebook-extracted-evidence.json',
    'c1c26-source-retrieval-evidence.json'];
  const meta = { schemaVersion: 1, phase: '11A.4-C1C26', baselineHead, family: 'Necromancer', runtimeImplemented: false,
    inputSha256: Object.fromEntries(inputNames.map(n => [root + n, hash(root + n)])) };
  const put = (name: string, body: any) => { a[prefix + name + '.json'] = { ...meta, ...body }; };
  const cards = old('card-semantic-contracts').cards;
  const printed = (id: number, side: string) => cards.find((c: any) => c.cardId === id)?.sourceReferences?.filter((r: any) => r.side === side) ?? [];
  const originalGaps = old('source-gap-register').sourceGaps;
  assert(originalGaps.length === 75, 'baseline must have 75 unresolved leaf usages');
  const inherited = originalGaps.map((g: any) => ({ ...g, baselineGapId: g.gapId, resolutionStatus: 'BOUNDED_STILL_UNRESOLVED',
    resolutionValue: null, terminal: false, sourceStatus: 'SOURCE_BLOCKED', reviewReferences: reviewPages[g.category].map(page => rb(page, 'C1C26 scoped second review')),
    nextEvidence: questions[g.category], exhaustionRegisterId: g.category }));

  put('lowest-roll-tie-contract', { effects: [
    { level: 2, name: 'Haunted Graveyard', mayUseGraveyardEffect: true },
    { level: 3, name: 'The Restless Dead', mayUseGraveyardEffect: false },
  ].map(e => ({ ...e, trigger: 'first preparation day', target: 'Hero with lowest D10 result',
    tieRule: unknown('LOWEST_ROLL_HERO_TIE_UNRESOLVED', questions.LOWEST_ROLL_HERO_TIE_UNRESOLVED, rb(24, 'character Stance priority is Monster targeting scope'), ...printed(42002 + e.level, 'back')),
    runtimeBindingStatus: 'BLOCKED', isolatesTo: 'Hamlet effects at Levels II and III; does not invalidate static Room/setup data' })),
    prohibitedFallbacks: ['player chooses', 'first player', 'active Hero', 'random', 'reroll', 'simultaneous Heroes'] });
  put('area-target-tie-contract', { sourceStatus: 'SOURCE_BLOCKED', runtimeBindingStatus: 'BLOCKED',
    crowdedAreaTieRule: unknown('TARGET_TIE_UNRESOLVED', questions.TARGET_TIE_UNRESOLVED, rb(24, 'Crowded Area versus character Stance priority')),
    sourceReferences: [rb(19, 'single Target Area; targets within Area'), rb(24, 'Check Target then Check Range')],
    appliesToLevels: [1, 2, 3], heroTargetCounts: [2, 2, 4], skillRanges: [1, 2, 2],
    distinction: 'p24 player choice selects eligible movement destinations after targeting; it does not specify tied target Area selection.' });
  put('summon-count-contract', { skills: [1, 2, 3].flatMap(level => ['The Flesh is Willing', 'The Crawling Dead', 'Six Feet Under'].map((skill, i) => ({
    level, skill, trigger: 'printed summon Target effect after Self effect and damage', targetAreaCount: bound(1, rb(19, 'Skill targets an Area'), rb(24, 'Heroes within Target Area')),
    maxHeroTargets: [2, 2, 4][i], summonCount: unknown('SUMMON_COUNT_UNRESOLVED', questions.SUMMON_COUNT_UNRESOLVED, rb(20, 'Target effects on successful targets'), rb(38, 'summons one of them describes placement')),
    summonCountBasis: unknown('SUMMON_COUNT_UNRESOLVED', 'Neither singular placement prose nor helmet target count explicitly settles replication with mixed hits.', rb(19, 'one roll compared individually'), rb(38, 'placement')),
    successDependency: bound('Target effects apply only to successful hits; shared roll compared per Hero', rb(19, 'Accuracy'), rb(20, 'Target Effects')),
    spaceDependency: old('summon-contract').levels[level - 1].fullStanceBehavior,
    sourceReferences: [rb(19, 'Anatomy of a Skill'), rb(20, 'effects'), rb(38, 'Necromancer')], status: 'SOURCE_BLOCKED' }))) });
  const units = old('bone-source-binding').units;
  put('summon-copy-policy', { observedPhysicalCopies: units.map((u: any) => ({ name: u.name, printedFacts: u.printedFacts,
    observedComponents: u.bindings.map((b: any) => ({ physicalIdentity: b.physicalIdentity, cardId: b.cardId, front: b.front })),
    distinctComponentCount: u.bindings.length, observedMiniatureManifestCount: ['Bone Rabble', 'Bone Soldier', 'Bone Spearman'].includes(u.name) ? 3 : u.name === 'Bone Defender' ? 2 : u.name === 'Bone Courtier' ? 3 : 1,
    miniatureManifestReferences: [rb(u.name === 'Bone Rabble' ? 7 : 6, 'Miniatures manifest; quantity is not a reuse instruction')],
    ordinarySkillSummonEligible: ['Bone Rabble', 'Bone Soldier', 'Bone Spearman'].includes(u.name),
    countMeaning: 'Observed source components; Captain narrow/full components are not two monsters. No runtime supply count inferred.' })),
    reservedComponents: bound('Keep the level-specific named Bone cards and miniatures on hand to the side', rb(38, 'Necromancer setup step 3')),
    campaignCopyPolicy: unknown('SUMMON_COPY_POLICY_UNRESOLVED', 'No instruction resolves encounter pool shared with campaign deck or per-level availability.', rb(10, 'Monster deck construction'), rb(38, 'keep on hand')),
    encounterSummonAvailability: unknown('SUMMON_COPY_POLICY_UNRESOLVED', 'Physical count does not establish selectable summon pool when copies already drawn/used.', rb(17, 'duplicate colour identifiers'), rb(38, 'on hand')),
    runtimeSupplyLifecycle: Object.fromEntries(['deadSummonReuse', 'removedMonsterReturnsToSupply', 'permanentRemovalReuse', 'supplyExhaustion'].map(key => [key, unknown('SUMMON_COPY_POLICY_UNRESOLVED', questions.SUMMON_COPY_POLICY_UNRESOLVED, rb(25, 'Battle-end deck return does not specify within-Battle reuse'), rb(38, 'summon'))])),
    status: 'SOURCE_BLOCKED', infiniteCloneAllowed: false, defaultDeadReuseAllowed: false, defaultExhaustedSkipAllowed: false });
  const captain = units.find((u: any) => u.name === 'Bone Captain');
  put('bone-identity-closure', { nameConflict: { printedName: 'Bone Rabble', rulebookLiteral: 'Bone Rubble',
    authoritativeName: unknown('SOURCE_PRECEDENCE_UNRESOLVED', questions.SOURCE_PRECEDENCE_UNRESOLVED, rb(7, 'Bone Rabble miniature label'), rb(38, 'Bone Rubble'), ...printed(46037, 'front')),
    supersessionStatus: 'NO_AUTHENTICATED_CORRECTION_ACQUIRED', automaticAliasAllowed: false },
    captain: { role: 'LEVEL_II_DUNGEON_THREAT_ONLY', ordinarySkillSummon: false, printedFacts: captain.printedFacts,
      components: captain.bindings.map((b: any) => ({ physicalIdentity: b.physicalIdentity, cardId: b.cardId, front: b.front })),
      componentAssociation: unknown('BONE_IDENTITY_UNRESOLVED', questions.BONE_IDENTITY_UNRESOLVED, rb(6, 'one named Captain miniature'), rb(17, 'Large combat card spanning two slots')),
      narrowedFacts: '46600 visibly supplies Large Level II combat stats; 46111 is separate narrow artwork. p6 quantity corroborates a named miniature but does not explicitly link these two digital components or supply reuse.',
      mergeAsTwoSpawnCopiesAllowed: false } });
  put('reanimation-order-contract', { level: 3, trigger: bound('First non-large Monster death in each Battle; respawn immediately in corresponding Area; ignore if no space', ...printed(42005, 'back')),
    genericDeathThreshold: bound('Wounds greater than or equal to Life', rb(24, 'Casualties')),
    genericCasualtyRemoval: bound('Remove miniature and Stance card; compact remaining cards', rb(24, 'Casualties')),
    genericInitiativeRemoval: bound('Remove excess Initiative when drawn if character died before turn', rb(17, 'Initiative')),
    genericSummonInitiative: bound('Shuffle new Monster Initiative; may act during current round', rb(31, 'Monster Summoning')),
    boundary: 'Generic facts do not determine which initiative/casualty branch immediate Reanimation uses.',
    order: Object.fromEntries(['deathFinalBeforeTrigger', 'removeMiniatureBeforeRespawn', 'removeCardBeforeRespawn', 'initiativeRetained', 'treatedAsNewSpawn', 'otherOnDeathEffects', 'simultaneousFirstDeath', 'subsequentEffects'].map(key => [key, unknown('EFFECT_ORDER_UNRESOLVED', questions.EFFECT_ORDER_UNRESOLVED, rb(17, 'generic initiative'), rb(24, 'generic casualties'), ...printed(42005, 'back'))])),
    runtimeSafe: false, engineEventOrderAsEvidenceAllowed: false });
  put('room-capacity-resolution', { frozenRoom: old('room-contract'),
    fullStancePrecedence: old('source-precedence').rulings.fullStance,
    firstEmptyStance: bound('Place summoned card in first empty Stance', rb(38, 'Necromancer')),
    summonMiniatureArea: bound('Target Area overrides generic corresponding-Stance Area', rb(31, 'unless Boss specifies otherwise'), rb(38, 'Target Area')),
    miniatureDisplacement: bound('Full spawn Area: move a Hero; all-Monster Area: players choose Monster to move to nearest available Area', rb(31, 'Monster Summoning')),
    nearestAvailableAreaTie: unknown('ROOM_CAPACITY_INTERACTION_UNRESOLVED', questions.ROOM_CAPACITY_INTERACTION_UNRESOLVED, rb(31, 'nearest available Area')),
    noAvailableAreaFallback: unknown('ROOM_CAPACITY_INTERACTION_UNRESOLVED', questions.ROOM_CAPACITY_INTERACTION_UNRESOLVED, rb(31, 'nearest available Area')),
    fullStanceSuppressionIsAreaFallback: false, initialLargeDrawReplacementIsSummonFallback: false, summonPlacementRuntimeSafe: false });
  put('cleanup-destination-contract', { frozenSkeleton: old('cleanup-contract'), destinations: {
    bossIdentity: unknown('CLEANUP_DESTINATION_UNRESOLVED', questions.CLEANUP_DESTINATION_UNRESOLVED, rb(35, 'set aside initially; remaining Bosses at next Level')),
    threatAbility: unknown('CLEANUP_DESTINATION_UNRESOLVED', questions.CLEANUP_DESTINATION_UNRESOLVED, rb(30, 'physical flip; defeat')),
    bossBattle: unknown('CLEANUP_DESTINATION_UNRESOLVED', questions.CLEANUP_DESTINATION_UNRESOLVED, rb(25, 'ordinary Monster deck return'), rb(30, 'Boss defeat')),
    roomCard: bound('Discard for Dungeon run; shuffle discarded Room Cards into respective deck when returning to Hamlet', rb(25, 'Battle End'), rb(32, 'Returning to Hamlet step a')),
    roomTile: bound('Return to tile stack at Battle end', rb(25, 'Battle End')),
    boneMiniatures: bound('Remove other Monsters from play at Boss defeat; take miniatures back at Battle end', rb(38, 'Necromancer defeated'), rb(25, 'Battle End')),
    ordinaryMonsterCards: bound('Shuffle used Monster Cards back to Monster deck subject to permanent removal', rb(25, 'Battle End')),
    permanentlyRemovedMonsters: bound('Remain removed; Threat expiry does not undo permanent removal', ...printed(42003, 'back')),
    summonedCardReservationAfterReturn: unknown('SUMMON_COPY_POLICY_UNRESOLVED', 'Generic Monster deck return is known, but no separate reserved-summon supply reset instruction is acquired.', rb(25, 'Monster Cards return'), rb(38, 'on hand')),
  }, fullEncounterLifecycleReady: false, prototypeCleanupAsEvidenceAllowed: false });
  const precedence = old('source-precedence');
  put('source-precedence-closure', { policy: precedence.policy, hierarchy: precedence.table, topics: [
    { topic: 'Bone Rabble / Bone Rubble', sourceA: 'Boss I and Bone printed components; p7', sourceB: 'core p38', conflict: 'different literal names', higherAuthority: 'No authenticated superseding correction', resolution: precedence.rulings.boneName, status: 'SOURCE_BLOCKED' },
    { topic: 'printed Boss text vs generic rulebook', sourceA: 'printed all-Stances-occupied suppression', sourceB: 'p17 large Monster initial draw', conflict: 'apparent replacement permission has different trigger scope', higherAuthority: 'explicit Boss summon clause for its scope', resolution: precedence.rulings.fullStance, status: 'SOURCE_COMPLETE' },
    { topic: 'Boss-specific summon clause vs generic placement', sourceA: 'p38 and printed Ability Target Area', sourceB: 'p31 corresponding-Stance Area', conflict: 'placement destination', higherAuthority: 'Boss exception explicitly allowed by p31', resolution: bound('Use Target Area; p31 handles capacity without Stance replacement', rb(31, 'unless Boss specifies otherwise'), rb(38, 'Target Area')), status: 'SOURCE_COMPLETE' },
    { topic: 'Threat text vs generic Threat lifecycle', sourceA: 'p30 Fighting a Boss explicit cease at flip', sourceB: 'p35 general campaign summary until kill', conflict: 'apparent expiry difference', higherAuthority: 'specific Objective Room physical-flip window; retains frozen C1C25 interpretation', resolution: precedence.rulings.threatAbility, status: 'SOURCE_COMPLETE', sourceReferences: [rb(30, 'specific Fighting a Boss window'), rb(35, 'general campaign summary')] },
    { topic: 'Room-specific rule vs generic room rule', sourceA: 'Room 10 tile and p38 deployment', sourceB: 'p16 generic Hero deployment / p31 capacity', conflict: 'no contrary functional Room clause acquired; area tie still absent', higherAuthority: 'specific setup within generic Room rules', resolution: bound('Use Room 10 printed layout and start positions; do not infer capacity fallback', rb(16, 'Hero positions'), rb(38, 'Necromancer Room')), status: 'SOURCE_COMPLETE_FOR_SETUP_ONLY' },
  ], sourceConflictPolicyChanged: false });

  const retrieval = load('c1c26-source-retrieval-evidence.json');
  put('source-search-evidence', { retrievalEvidencePath: root + 'c1c26-source-retrieval-evidence.json', receipts: retrieval.receipts,
    searches: [
      ['"Darkest Dungeon" "FAQ" "designers" "250715"', 'designer file listing located; direct filepage content unavailable'],
      ['"Darkest Dungeon" "Bone Rubble" FAQ', 'no authenticated correction acquired'],
      ['"Darkest Dungeon" "Crowded" "tie" board game', 'no authenticated Area tie clarification acquired'],
      ['"Darkest Dungeon" "Haunted Graveyard" tie', 'no authenticated Hamlet tie clarification acquired'],
      ['"Darkest Dungeon board game" "summon" "copies"', 'no authenticated copy lifecycle clarification acquired'],
      ['"Darkest Dungeon board game" "Reanimation" FAQ', 'secondary campaign description only; no ordering authority acquired'],
      ['"Darkest Dungeon board game" "nearest available" tie', 'no authenticated fallback clarification acquired'],
      ['site:darkestdungeon.com "Regarding Mythic"', 'later production file distribution lead; linked official page returned 404; corpus not examined'],
    ].map(([query, result]) => ({ query, result, date: '2026-09-28', searchIsExhaustionProof: false })),
    leads: [
      { url: 'https://boardgamegeek.com/boardgame/317321/darkest-dungeon-the-board-game/files', status: 'DESIGNER_FILE_LISTING_LOCATED_CONTENT_UNAVAILABLE', rulesAuthority: false, nextEvidence: 'Authenticated PDF download and version/hash provenance' },
      { url: 'https://es.scribd.com/document/686825056/DD-FAQ-EN', status: 'SECONDARY_MIRROR_SEARCH_LEAD', rulesAuthority: false, nextEvidence: 'Match designer original file identity before any rule promotion' },
      { url: 'https://boardgamegeek.com/thread/3008011/house-rules-and-clarifications-suggested-rulebook', status: 'COMMUNITY_SEARCH_LEAD', rulesAuthority: false, nextEvidence: 'Original FAQ link only; reject house-rule mechanics and hierarchy' },
      { url: 'https://www.wargamer.com/darkest-dungeon-board-game/files', status: 'LATER_PRODUCTION_CORPUS_SEARCH_LEAD', rulesAuthority: false, nextEvidence: 'Authenticated official/backer production corpus or revised rulebook; linked official page currently 404' },
    ], authoritativeFaqAcquired: false, revisedOfficialRulebookAcquired: false, laterOfficialCorpusExamined: false });
  put('source-exhaustion-register', { topics: categories.map(category => ({ id: category, category,
    resolutionStatus: 'BOUNDED_STILL_UNRESOLVED', sourceStatus: 'SOURCE_BLOCKED', nextEvidence: questions[category],
    checkedPages: reviewPages[category], sourceReferences: reviewPages[category].map(page => rb(page, 'scoped review')),
    relevantComponentReview: 'C1C24 nine locked cards; C1C25 Bone/Room original crops and manifests',
    exhaustionEvidence: { knownOfficialCorpusSearched: false, relevantComponentsChecked: true, rulebookChecked: true,
      faqCheckedOrProvablyUnavailable: false, noUnexaminedAuthoritativeConflict: false, proofReferences: [],
      pendingAuthoritativeSources: ['designer FAQ filepage 250715 content', 'authenticated later official production files / revised rulebook if available'],
      accessFailureDoesNotProvePermanentUnavailability: true }, terminal: false })), terminalCategoryCount: 0 });

  // Enumerate each newly refined unresolved field separately; do not pretend these are new baseline gaps.
  const refined = Object.entries(a).flatMap(([artifact, value]) => unresolvedLeaves(value).map(g => ({ ...g,
    gapId: artifact + ':' + g.field, artifact, resolutionStatus: 'BOUNDED_STILL_UNRESOLVED', resolutionValue: null, sourceStatus: 'SOURCE_BLOCKED', terminal: false,
    mapsToBaselineGapIds: inherited.filter((b: any) => b.category === g.category).map((b: any) => b.gapId) })));
  put('source-gap-register', { baselineLeafUsages: inherited, refinedContractLeafUsages: refined,
    countingPolicy: 'Baseline comparison counts the same 75 usages; refined fields are a separate decomposition and must not be added to baseline totals.',
    before: { leafUsages: 75, categories: 9 }, after: { leafUsages: inherited.length, categories: categories.length },
    closedLeafUsages: 0, boundedLeafUsages: inherited.length, terminalLeafUsages: 0,
    closedCategories: [], boundedCategories: categories, terminalCategories: [] });
  put('semantic-completeness-matrix', { cards: cards.map((c: any) => ({ definitionId: c.definitionId, physicalIdentity: c.physicalIdentity,
    cardId: c.cardId, literalComplete: c.literalComplete, cardLocalSemanticComplete: c.cardLocalSemanticComplete,
    semanticComplete: false, sourceGated: true, runtimeCandidate: false, productionReady: false, sourceStatus: 'SOURCE_BLOCKED' })),
    totals: { physical: 9, literalComplete: 9, cardLocalSemanticComplete: 3, familySemanticComplete: 0, sourceGated: 9, runtimeEligible: 0, productionReady: 0 },
    promotionPolicy: 'Every execution field and family dependency must close; narrative-local completion never bypasses family gates.' });
  const slices = [
    ['Boss setup metadata', 'SOURCE_COMPLETE_RUNTIME_MISSING', [], 'Composition and printed stats bind a descriptor; full setup also needs reserved summon pool.'],
    ['Threat physical flip and expiry', 'SOURCE_COMPLETE_RUNTIME_MISSING', [], 'Transition boundary is closed; Hamlet/Dungeon effects remain separately blocked.'],
    ['Room setup', 'SOURCE_COMPLETE_RUNTIME_MISSING', [], 'Static Room 10 layout and starting positions are closed; deployment does not prove encounter supply.'],
    ['Full-Stance suppression predicate', 'SOURCE_COMPLETE_RUNTIME_MISSING', [], 'Suppression branch is explicit; remaining summon branches need count/copy/space rules.'],
    ['Basic Battle Skill', 'SOURCE_BLOCKED', ['TARGET_TIE_UNRESOLVED', 'SUMMON_COUNT_UNRESOLVED', 'SUMMON_COPY_POLICY_UNRESOLVED', 'ROOM_CAPACITY_INTERACTION_UNRESOLVED'], 'Self/damage timing facts do not make a complete printed Skill safe when summon is part of that Skill.'],
    ['Targeting', 'SOURCE_BLOCKED', ['TARGET_TIE_UNRESOLVED', 'LOWEST_ROLL_HERO_TIE_UNRESOLVED'], 'Area ties block Battle skills; lowest-roll ties only affect Level II/III Hamlet effects.'],
    ['Summon', 'SOURCE_BLOCKED', ['SUMMON_COUNT_UNRESOLVED', 'SUMMON_COPY_POLICY_UNRESOLVED', 'ROOM_CAPACITY_INTERACTION_UNRESOLVED', 'SOURCE_PRECEDENCE_UNRESOLVED'], 'No complete supply/placement transition.'],
    ['Reanimation', 'SOURCE_BLOCKED', ['EFFECT_ORDER_UNRESOLVED'], 'Generic casualty facts cannot determine immediate respawn event order.'],
    ['Cleanup', 'SOURCE_BLOCKED', ['CLEANUP_DESTINATION_UNRESOLVED', 'SUMMON_COPY_POLICY_UNRESOLVED'], 'Room return refined; Boss trio and reserved pool remain unknown.'],
    ['Army of the Dead', 'SOURCE_BLOCKED', ['BONE_IDENTITY_UNRESOLVED', 'SUMMON_COPY_POLICY_UNRESOLVED'], 'Captain Threat dependency is not ordinary Skill summon.'],
  ].map(([slice, sourceStatus, blockers, rationale]) => ({ slice, sourceStatus, blockers, rationale,
    completeGameplaySlice: false, productionValidationPossible: false, nonReachableGateProven: false, runtimeImplemented: false,
    proposedHardGate: 'Any future foundation must deny effect dispatch, attack, summon, death/respawn and encounter completion until exact source gates close.',
    foundationValue: sourceStatus === 'SOURCE_COMPLETE_RUNTIME_MISSING' ? 'Reusable static descriptor/transition predicate, not a complete independently validated encounter slice' : 'Requires source closure', expectedProductionReadyGain: 0 }));
  put('runtime-readiness-matrix', { slices, requiresNineCardsClosedForAnyFuturePrimitive: false,
    completeSourceSafeGameplaySliceProven: false, partialFoundationSelected: false,
    reason: 'Closed descriptor/predicate primitives exist, but no complete gameplay slice and implemented non-reachable boundary is proven; C1C26 performs analysis only.' });
  put('runtime-roi-matrix', { family: 'Necromancer', sourceSafePrimitiveCount: slices.filter(s => s.sourceStatus === 'SOURCE_COMPLETE_RUNTIME_MISSING').length,
    sourceSafeGameplaySliceCount: 0, expectedProductionReadyGain: 0, runtimeEligibleCount: 0,
    sourceFoundationEligible: false, partialFoundationEligible: false, reassessOtherFamiliesAllowed: false,
    reason: 'Nine bounded source topics remain, and unavailable designer/later files prevent terminal consolidation. Do not broaden to other families.' });
  a['c1c26-next-workstream-decision.json'] = { ...meta, ...deriveDecision(inherited, slices),
    acceptanceVerdict: 'C1C26-NECROMANCER-SOURCE-CLOSURE-ACCEPTED', prerequisites: Object.fromEntries(['encounterComposition', 'summonPolicy', 'targeting', 'effectOrder', 'roomFallback', 'cleanup', 'sourcePrecedence'].map(k => [k, 'SOURCE_BLOCKED'])) };
  put('frozen-baseline-contracts', { composition: old('encounter-composition'), setup: old('setup-contract'), room: old('room-contract'),
    threatLifecycle: cards.filter((c: any) => [42003, 42004, 42005].includes(c.cardId)).map((c: any) => ({ physicalIdentity: c.physicalIdentity, trigger: c.trigger, expiry: c.expiry, abilitySideRelation: c.abilitySideRelation })),
    fullStance: precedence.rulings.fullStance, upstreamManifest: old('source-manifest'),
    upstreamCounts: { trinket: '15/37', quest: '3/75', census: 278, hamletEvent: '16 literal / 5 local semantic / 0 Ready', boss: '231 / 20 families', Battle: 114, Threat: 51, AbilityExclusive: 12, Identity: 54 } });
  return a;
}

export function validateArtifacts(a: Record<string, any>) {
  const expected = buildArtifacts();
  assert(JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(expected).sort()), 'artifact set');
  for (const [name, value] of Object.entries(expected)) assert(JSON.stringify(a[name]) === JSON.stringify(value), 'deterministic contract drift: ' + name);
  const gaps = a[prefix + 'source-gap-register.json'];
  assert(gaps.baselineLeafUsages.length === 75 && gaps.baselineLeafUsages.every((g: any) => g.resolutionStatus && g.resolutionValue === null && !g.terminal), 'bounded leaf accounting');
  assert(gaps.refinedContractLeafUsages.every((g: any) => categories.includes(g.category) && g.mapsToBaselineGapIds.length), 'refined null field accounting');
  assert(a[prefix + 'semantic-completeness-matrix.json'].cards.every((c: any) => !c.semanticComplete && !c.runtimeCandidate && !c.productionReady), 'no promotion through unresolved execution');
}
export function verifyScope(paths: string[]) {
  for (const path of paths) assert(path === 'package.json' || /^scripts\/audit\/(?:c1c26-contract\.ts|(?:generate|verify)-complete-edition-c1c26\.ts|acquire-c1c26-sources\.mjs)$/.test(path) ||
    path === 'src/audit/c1c26-necromancer-source-closure.test.ts' || /^docs\/data\/complete-edition\/c1c26-[\w-]+\.json$/.test(path) ||
    /^docs\/data\/complete-edition\/source-assets\/c1c26\/[\w.-]+$/.test(path) || /^docs\/reports\/complete-edition\/c1c26-[\w-]+\.md$/.test(path), 'scope violation: ' + path);
}
export function verifyBaselineAndReceipts() {
  git('merge-base', '--is-ancestor', baselineHead, 'HEAD');
  verifyScope(git('diff', '--name-only', baselineHead).split(/\r?\n/).filter(Boolean));
  const preexisting = (p: string) => p.startsWith('.tmp-') || p.startsWith('tmp/') || p === 'src/.tmp-geom-check.test.ts';
  verifyScope(git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(p => p && !preexisting(p)));
  const entries = git('ls-tree', '-r', baselineHead).split(/\r?\n/).map(line => {
    const [header, path] = line.split('\t'); return { path, oid: header.split(' ')[2] };
  }).filter(e => e.path !== 'package.json');
  // Compare clean-filtered Git object contents without buffering the 737 MB baseline.
  const objectHashes = execFileSync('git', ['hash-object', '--stdin-paths'], {
    input: entries.map(e => e.path).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1024 * 1024,
  }).trim().split(/\r?\n/);
  assert(objectHashes.length === entries.length, 'baseline object hash count');
  entries.forEach((e, i) => {
    if (e.oid === objectHashes[i]) return;
    // This checkout already contains mixed CRLF/LF files with clean Git status.
    // Tolerate only line-ending differences, never different text or binary bytes.
    const original = execFileSync('git', ['show', baselineHead + ':' + e.path], { maxBuffer: 128 * 1024 * 1024 });
    const current = readFileSync(e.path);
    assert(!original.includes(0) && !current.includes(0) &&
      original.toString('utf8').replace(/\r\n/g, '\n') === current.toString('utf8').replace(/\r\n/g, '\n'), 'frozen tracked content changed: ' + e.path);
  });
  for (const [path, expected] of Object.entries(old('source-manifest').frozenInputSha256)) assert(hash(path) === expected, 'frozen upstream source bytes: ' + path);
  const pkg = JSON.parse(git('show', baselineHead + ':package.json'));
  pkg.scripts['import:complete-edition-c1c26'] = 'node scripts/audit/acquire-c1c26-sources.mjs';
  pkg.scripts['audit:complete-edition-c1c26'] = 'vite-node scripts/audit/generate-complete-edition-c1c26.ts';
  pkg.scripts['verify:complete-edition-c1c26'] = 'vite-node scripts/audit/verify-complete-edition-c1c26.ts';
  assert(JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8'))) === JSON.stringify(pkg), 'only three package scripts allowed');
  for (const r of load('c1c26-source-retrieval-evidence.json').receipts) {
    assert(!r.authoritativeContentAcquired && !r.rulesAuthority && !r.permanentlyUnavailable, 'retrieval failure cannot become rule/exhaustion proof');
    assert(Number.isFinite(Date.parse(r.retrievalTime)) && r.url && r.searchQuery, 'retrieval provenance');
    if (r.responsePath) assert(hash(r.responsePath) === r.responseSha256, 'response hash');
    assert(r.httpStatus !== 0, '000 is transport failure, not HTTP status');
  }
}

export function report(a: Record<string, any>): string {
  const d = a['c1c26-next-workstream-decision.json'];
  const counts = a[prefix + 'source-gap-register.json'];
  const rows = categories.map(c => `| ${c} | ${counts.baselineLeafUsages.filter((g: any) => g.category === c).length} | BOUNDED_STILL_UNRESOLVED |`).join('\n');
  return `# C1C26 Necromancer Source Closure\n\nBaseline: ${baselineHead}. Verdict: C1C26-NECROMANCER-SOURCE-CLOSURE-ACCEPTED means source classification accepted, not gameplay/build/E2E acceptance.\n\n75 baseline leaf usages before and after, 9 categories before and after; closed 0, still bounded 75, terminal 0. Refined contract fields are separately enumerated (${counts.refinedContractLeafUsages.length}) and are not additional baseline blockers. Physical 9; literal 9/9; local semantic 3/9; family semantic 0/9; source-gated 9/9; runtime eligible 0/9; Ready 0/9.\n\n| Category | Remaining baseline usages | Resolution status |\n| --- | ---: | --- |\n${rows}\n\n## Ten required answers\n\n| Question | Answer | Source status / consequence |\n| --- | --- | --- |\n| Lowest-roll Hero tie resolved? | UNRESOLVED | SOURCE_BLOCKED; only Level II/III Hamlet tie effects, not static Room descriptors |\n| Crowded Area tie resolved? | UNRESOLVED | SOURCE_BLOCKED; p24 character priority and movement choice do not settle Area ties |\n| Every Skill summon count resolved? | UNRESOLVED | SOURCE_BLOCKED; nine level/Skill rows distinguish one Area from multiple Hero hits |\n| Finite Bone copy policy resolved? | UNRESOLVED | SOURCE_BLOCKED; 3 Rabble/Soldier/Spearman miniatures observed, not reuse/exhaustion rules |\n| Rabble / Rubble precedence resolved? | UNRESOLVED | SOURCE_BLOCKED; preserve both literals; no alias/erratum invented |\n| Reanimation casualty ordering resolved? | UNRESOLVED | SOURCE_BLOCKED; threshold/removal facts known, immediate respawn integration unknown |\n| Room capacity fallback resolved? | UNRESOLVED | SOURCE_BLOCKED; nearest ties and nowhere-available fallback unknown |\n| Boss trio cleanup destinations resolved? | UNRESOLVED | SOURCE_BLOCKED; Room discard then Hamlet deck return is newly explicit, not Boss trio storage |\n| Any terminal source blocker? | NO | Designer FAQ/later corpus unexamined; access failures do not prove exhaustion |\n| C1C27 Runtime Foundation allowed? | NO | ${d.outcome}; no complete source-safe gameplay slice proven |\n\n## Evidence and narrowing\n\nThe locked core rulebook pages 6/7 distinguish finite miniature component quantities from supply policy. Captain has one named miniature entry; full Large combat card 46600 and narrow artwork 46111 remain separate physical components. The p17 two-slot rule supports Large combat use but does not explicitly associate these digital representations or resolve the combined copy instruction gap. Captain is a Level II Dungeon Threat dependency, never a normal Bone Skill summon.\n\nCore p19 selects one Target Area and rolls once against each Hero; p20 gates Target effects on successful hits. Core p38 singular placement prose does not explicitly choose between one summon per Skill and per successful Hero. No engine defaults are accepted. Core p24 death threshold/removal and p17 initiative removal are documented separately from the immediate Level III Reanimation clause; initiative retention/new spawn, other on-death and simultaneous-first ordering remain null.\n\nCore p25 Room discard and p32 Hamlet return close the Room Card destination sequence. This refines a subfield, closing none of the baseline Boss-trio destination usages. Generic Monster deck return and permanent non-unholy removal remain scoped facts; no within-Battle summon reuse or reserved pool reset is inferred. Core p31 miniature displacement, p38 first empty Stance and printed all-Stances suppression remain separate rules. Room 10 layout and starts are unchanged.\n\nThe source precedence artifact retains C1C25 hierarchy and compares five topics. Core p30 explicit Fighting-a-Boss physical flip/expiry is preserved despite p35 campaign summary until-kill wording; this is the existing specific timing interpretation, not a newly reversed authority hierarchy. Rabble/Rubble remains an unresolved literal conflict.\n\nDirect retrieval receipts record exact URL, HTTP or transport failure, time, known listing identity and query. The [designer FAQ filepage](https://boardgamegeek.com/filepage/250715/darkest-dungeon-board-game-faq-by-the-designers) and file list returned 403 during the recorded curl attempts. The publisher FAQ lead had DNS failure without an HTTP response; a later official production-file lead returned 404. Earlier web-tool failures supplied no HTTP code. These do not prove permanent unavailability. The [designer file listing](https://boardgamegeek.com/boardgame/317321/darkest-dungeon-the-board-game/files) identifies a designer-uploaded candidate; its PDF filename/version/download ID/hash remain unknown. The [Scribd mirror](https://es.scribd.com/document/686825056/DD-FAQ-EN), [house-rule thread](https://boardgamegeek.com/thread/3008011/house-rules-and-clarifications-suggested-rulebook) and [later-file news lead](https://www.wargamer.com/darkest-dungeon-board-game/files) are search leads only, with no rule authority. No later production corpus or official revision has been authenticated and examined. Terminal checks therefore fail for all nine topics.\n\n## Partial readiness and next action\n\nIt is not necessary for all nine cards to close before any future static primitive can be considered. Four source-complete/runtime-missing primitive scopes are identified: setup descriptors, Threat physical flip/expiry, Room layout/starts and full-Stance suppression predicate. Full Threat lifecycle also executes blocked Hamlet/Captain/Reanimation effects; basic Skills include unresolved summons. No complete independently validated gameplay slice or implemented non-reachable dispatch gate is proven. A proposal to stop at descriptors would bring Ready gain 0 and currently lacks the required full-slice proof; partial runtime is not selected.\n\nNext action: ${d.nextAction}. Acquire authenticated FAQ/correction or later official file contents; answer the bounded per-topic questions in the exhaustion register. Other families are not selected while these remain bounded. Implementation is prohibited in C1C26.\n\n## Frozen scope and validation limitations\n\nAll baseline tracked files except the three allowed package script additions are checked against C1C25 Git objects with line-ending-only differences tolerated; frozen upstream source metadata also receives exact-byte SHA256 checks, covering upstream sources/assets, C1C20–25 contracts, gameplay, AI, UI, selector, save/replay, Act IV and other families. Upstream counts remain Trinket 15/37, Quest 3/75, census 278, Hamlet Event 16 literal/5 local semantic/0 Ready, ordinary Boss 231/20 families, Battle114/Threat51/exclusive Ability12/Identity54.\n\nC1C25 Windows CSS repeated-hash/path-length build failure remains BUILD_ACCEPTANCE_UNVERIFIED. C1C26 does not modify bundler tooling. Historical C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout remain open; browser E2E is not fully accepted. Actual validation commands and outcomes are recorded in c1c26-validation-report.md.\n`;
}
export function writeArtifacts() {
  const a = buildArtifacts();
  for (const [name, value] of Object.entries(a)) writeFileSync(root + name, JSON.stringify(value, null, 2) + '\n');
  writeFileSync('docs/reports/complete-edition/c1c26-necromancer-source-closure-report.md', report(a));
}
