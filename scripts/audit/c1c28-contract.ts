import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { git, load, root, sha256, unresolvedLeaves } from './c1c25-contract';
import { categories } from './c1c26-contract';

export { categories };
export const baselineHead = 'aaedb2d30b1e5d90bf8d41e7dbced9f93288f73a';
const prefix = 'c1c28-necromancer-';
const assert = (v: unknown, message: string) => { if (!v) throw new Error('C1C28: ' + message); };
const old = (phase: number, name: string) => load(`c1c${phase}-necromancer-${name}.json`);
const digest = (p: string) => sha256(readFileSync(p));
const clone = (v: any) => JSON.parse(JSON.stringify(v));
const ref = (file: string, pointer: string) => ({ path: root + file, pointer });
const core = (page: number, region: string) => ({ path: root + 'c1c19-rulebook-extracted-evidence.json', page, region });
const escapeKey = (k: string) => k.replace(/~/g, '~0').replace(/\//g, '~1');
export const overridePolicy = { ifNewAuthoritativeSource: { preserveHistoricalRuling: true, createMigrationReview: true,
  doNotSilentlyChangeCampaignState: true }, pinCampaignToRulingSetVersion: true, replayStoresChoiceAndRulingVersion: true,
  migrationRequiresExplicitReview: true };

const canonicalInputs = [
  'c1c25-necromancer-card-semantic-contracts.json', 'c1c25-necromancer-encounter-composition.json',
  'c1c25-necromancer-setup-contract.json', 'c1c25-necromancer-room-contract.json', 'c1c25-necromancer-summon-contract.json',
  'c1c25-necromancer-cleanup-contract.json', 'c1c25-necromancer-bone-source-binding.json',
  'c1c25-necromancer-source-precedence.json', 'c1c25-necromancer-source-discrepancies.json', 'c1c25-necromancer-external-dependencies.json',
  'c1c26-necromancer-lowest-roll-tie-contract.json', 'c1c26-necromancer-area-target-tie-contract.json',
  'c1c26-necromancer-summon-count-contract.json', 'c1c26-necromancer-summon-copy-policy.json',
  'c1c26-necromancer-bone-identity-closure.json', 'c1c26-necromancer-reanimation-order-contract.json',
  'c1c26-necromancer-room-capacity-resolution.json', 'c1c26-necromancer-cleanup-destination-contract.json',
  'c1c26-necromancer-source-precedence-closure.json',
];
const topicByCategory: Record<string, string> = {
  BONE_IDENTITY_UNRESOLVED: 'bone-identity-closure', CLEANUP_DESTINATION_UNRESOLVED: 'cleanup-destination-closure',
  EFFECT_ORDER_UNRESOLVED: 'reanimation-order-closure', LOWEST_ROLL_HERO_TIE_UNRESOLVED: 'lowest-roll-tie-closure',
  ROOM_CAPACITY_INTERACTION_UNRESOLVED: 'room-capacity-closure', SOURCE_PRECEDENCE_UNRESOLVED: 'source-precedence-final',
  SUMMON_COPY_POLICY_UNRESOLVED: 'summon-supply-closure', SUMMON_COUNT_UNRESOLVED: 'summon-count-closure', TARGET_TIE_UNRESOLVED: 'area-tie-closure',
};
const knownFactSummaries: Record<string, string> = {
  BONE_IDENTITY_UNRESOLVED: 'Captain is the Level II first-Battle Dungeon Threat dependency. One named miniature is observed; narrow artwork 46111 and Large combat component 46600 retain distinct physical identities.',
  CLEANUP_DESTINATION_UNRESOLVED: 'Boss defeat ends Battle and removes other Monsters. Room Card is discarded for the Dungeon and returned to its deck at Hamlet; generic Monster-card return and permanent removal remain source-bound.',
  EFFECT_ORDER_UNRESOLVED: 'Level III immediately respawns the first non-large Monster death each Battle in its corresponding Area and ignores the effect if no space. Generic casualty threshold/removal and generic new-spawn initiative are separately known.',
  LOWEST_ROLL_HERO_TIE_UNRESOLVED: 'All Heroes roll D10 on the first preparation day; lowest Hero guards Graveyard. Level II permits its normal effect; Level III prohibits it. No acquired official tied-lowest selection rule.',
  ROOM_CAPACITY_INTERACTION_UNRESOLVED: 'First empty Stance and printed Target Area placement apply. Full Stances suppress. Core p31 displaces a miniature toward a nearest available Area; this is not Stance replacement or initial Large-draw substitution.',
  SOURCE_PRECEDENCE_UNRESOLVED: 'Printed Boss/Monster components say Bone Rabble; core p38 says Bone Rubble. No acquired scoped correction or alias supersedes this conflict. Previously bound scoped precedence decisions stay frozen.',
  SUMMON_COPY_POLICY_UNRESOLVED: 'Rabble, Soldier and Spearman each have three observed miniatures; Captain has one. Core p38 keeps named components on hand. Observed quantities do not establish an official gameplay limit or within-Battle reuse policy.',
  SUMMON_COUNT_UNRESOLVED: 'Each Skill selects one Target Area with a shared roll compared separately against Heroes. Target effects require successful hits; this does not settle whether the printed summon instruction repeats per Hero.',
  TARGET_TIE_UNRESOLVED: 'Necromancer Skills target Crowded Areas with the printed range and Hero target counts. Character Stance targeting priorities do not define tied Area occupancy selection.',
};

export function buildRulings(): any[] {
  const cards = old(25, 'card-semantic-contracts').cards;
  const allIds = cards.map((c: any) => c.cardId);
  const rules: any[] = [];
  const add = (ruleId: string, category: string, riskLevel: string, projectDecision: any, reasoningSummary: string,
    affectedLevels: number[], affectedCards: number[], runtimeRequirement: string, testObligations: string[], playerVisible = false) => {
    const path = `c1c27-necromancer-${topicByCategory[category]}.json`;
    rules.push({ ruleId, topic: category, canonicalStatus: category === 'SOURCE_PRECEDENCE_UNRESOLVED' ? 'SOURCE_CONFLICT' : 'SOURCE_UNRESOLVED',
      terminalStatus: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', officialFacts: [ref(path, '')],
      officialUnknown: old(27, 'source-exhaustion-register').topics.find((t: any) => t.category === category).nextEvidence,
      projectDecision, authority: 'PROJECT_RULING', canonical: false, riskLevel, reasoningSummary, affectedCards, affectedLevels,
      runtimeRequirement, playerVisible, futureOverrideAllowed: true, overridePolicy, testObligations,
      rulingSetVersion: 'C1C28-DIGITAL-DEFAULT-v1' });
  };
  const choice = (scope: string, prompt: string) => ({ candidateScope: scope, tieBreakAuthority: 'PLAYER_CHOICE',
    reroll: false, playerChoice: true, activePlayer: false, firstPlayer: false, random: false, simultaneous: false,
    noCandidates: 'NO_EFFECT', oneCandidate: 'AUTO_SELECT_UNIQUE', multipleCandidates: 'AWAIT_EXPLICIT_PLAYER_CHOICE',
    invalidChoice: 'REJECT_WITHOUT_STATE_CHANGE', defaultSelection: 'NONE', extraTieRngDraws: 0,
    displayOrder: 'STABLE_ID_FOR_DISPLAY_ONLY', choiceIdentity: 'STABLE_RUNTIME_OR_AREA_ID', prompt,
    replay: 'Record candidate IDs, chosen ID, event ID and ruling version; validate against original candidate set' });
  add('NECRO_LOWEST_ROLL_TIE_PLAYER_CHOICE', 'LOWEST_ROLL_HERO_TIE_UNRESOLVED', 'LOW_RISK_DETERMINISM',
    choice('Heroes sharing the minimum D10 result for this first preparation day', 'Multiple Heroes tied for lowest roll. Choose one of the tied Heroes.'),
    'Preserve the lowest-roll candidate set and add no RNG or hidden first-player priority. Selection is deterministic given recorded player input.', [2, 3], [42004, 42005],
    'Suspend forced Graveyard visit until a valid choice; retain Level II may-use and Level III cannot-use official differences.', ['hero-tie-choice', 'choice-order-invariance'], true);
  add('NECRO_CROWDED_AREA_TIE_PLAYER_CHOICE', 'TARGET_TIE_UNRESOLVED', 'LOW_RISK_DETERMINISM',
    choice('Areas tied for highest Hero occupancy after official Check Target eligibility; preserve official Check Range step afterward', 'Multiple Areas tied for most Heroes. Choose one of the tied Areas.'),
    'Preserve Crowded Area candidates without importing character Stance priority or silently preferring an in-range Area.', [1, 2, 3], [46037, 46038, 46039],
    'Keep Area selection separate from Hero selection and exact-range handling; record chosen Area before range/movement evaluation.', ['area-tie-choice', 'choice-order-invariance'], true);
  for (const level of [1, 2, 3]) {
    add(`NECRO_SUMMON_COUNT_LEVEL_${level}_ONCE_PER_ACTIVATION`, 'SUMMON_COUNT_UNRESOLVED', 'HIGH_GAMEPLAY_IMPACT',
      { level, perSkillActivation: 1, unitCountPerInstruction: 1, basis: 'PER_SKILL_ACTIVATION',
        trigger: 'AT_LEAST_ONE_SUCCESSFUL_HERO_HIT', zeroHits: 'NO_TARGET_SUMMON', fullStances: 'SUPPRESS_SUMMON',
        heroHitMultiplier: false, instructionMultiplicity: 'PRINTED_EXPLICIT_COUNT_ONLY',
        skills: ['The Flesh is Willing', 'The Crawling Dead', 'Six Feet Under'], countBySkill: [1, 1, 1],
        timing: 'Official Self -> damage -> Target effects; invoke the single summon instruction at its printed Target-effect position',
        mixedHitPolicy: 'One successful Hero is sufficient; additional successful Heroes do not repeat the instruction' },
      'One activation owns one printed summon instruction. This is an explicit balance-sensitive digital interpretation, never a grammatical proof of official multiplicity.',
      [level], [46036 + level], 'Gate on at least one successful hit, preserve misses and printed suppression, and never multiply by Hero count.',
      [`count-level-${level}`, 'mixed-hits-single-instruction', 'all-miss-no-summon'], true);
  }
  const observations = old(26, 'summon-copy-policy').observedPhysicalCopies;
  add('NECRO_FINITE_BATTLE_SUPPLY_NO_DEATH_REFUND', 'SUMMON_COPY_POLICY_UNRESOLVED', 'HIGH_GAMEPLAY_IMPACT',
    { battleLocalSupply: true, finite: true,
      pools: observations.filter((u: any) => u.ordinarySkillSummonEligible || u.name === 'Bone Captain').map((u: any) => ({
        name: u.name, observedPhysicalCopies: u.observedMiniatureManifestCount, digitalBattleSupplyLimit: u.observedMiniatureManifestCount,
        authority: 'PROJECT_RULING', sourceReference: core(u.name === 'Bone Rabble' ? 7 : 6, 'observed miniature quantity only'),
        role: u.name === 'Bone Captain' ? 'LEVEL_II_DUNGEON_THREAT_ONLY' : 'LEVEL_MATCHED_ORDINARY_SKILL_SUMMON' })),
      physicalMiniatureCountIsCanonicalGameplayLimit: false, monsterCardCopiesAreSeparate: true, logicalTokenPolicy: 'ONE_TRACKED_TOKEN_PER_AVAILABLE_PHYSICAL_UNIT',
      reservePolicy: 'Reserve named encounter summon components at setup; used ordinary Monster cards still follow official deck return. Logical availability is a separate digital ledger.',
      activeOrdinaryCopyPolicy: 'An already active matching physical copy occupies its token and reduces available supply; no duplicate physical unit is created',
      campaignAvailability: 'Exclude campaign-permanently-removed tokens; a Battle reset never restores them',
      deathReturnsImmediately: false, removalReturnsImmediately: false, permanentRemovalReturns: false,
      supplyExhaustion: 'SUPPRESS_SUMMON_NO_REPLACEMENT', placementFailureSpendsSupply: false,
      commitPolicy: 'Spend one token only after valid Stance and Area placement; a pending player choice spends nothing',
      resetAtBattleEnd: true, resetPolicy: 'Release surviving and spent non-permanently-removed tokens; retain campaign removal flags and reserve anew at next encounter',
      reanimationException: 'Transfer the selected dead instance token to its reanimated replacement; no refund to general supply and no extra token spend',
      concurrentEncounterPolicy: 'Physical-token reservations are exclusive; no global or cross-Battle cloning' },
    'Finite encounter accounting follows supported physical copies as a project limit. No automatic Battle-local casualty refund; reset preserves official permanent-removal semantics.',
    [1, 2, 3], allIds, 'Track available/active/spent/permanently removed token states and reject over-allocation.',
    ['finite-supply-exhaustion', 'death-no-refund', 'battle-reset', 'permanent-removal-preserved', 'reanimation-token-transfer'], true);
  add('NECRO_RUBBLE_REFERS_TO_PRINTED_RABBLE', 'SOURCE_PRECEDENCE_UNRESOLVED', 'HIGH_GAMEPLAY_IMPACT',
    { printedLiteral: 'Bone Rabble', rulebookP38Literal: 'Bone Rubble', runtimeIdentity: 'Bone Rabble',
      interpretation: 'Bone Rubble in core p38 is treated as referring to Bone Rabble.',
      aliasScope: 'Necromancer level I setup and summon instructions only', canonicalAlias: false, eraseOriginalLiteral: false,
      officialPrecedenceChanged: false, supersedingErratumClaimed: false },
    'Bind execution to the acquired printed Bone Rabble component; preserve the conflicting rulebook literal and its official unresolved precedence.',
    [1, 2, 3], allIds, 'Resolve this local runtime identity through ruling ID, without global normalization or canonical merge.', ['rabble-conflict-preserved', 'identity-overlay-only'], true);
  add('NECRO_CAPTAIN_PROJECT_COMPONENT_BINDING', 'BONE_IDENTITY_UNRESOLVED', 'HIGH_GAMEPLAY_IMPACT',
    { bindingKind: 'PROJECT_COMPONENT_BINDING', runtimeName: 'Bone Captain', artworkCardId: 46111, combatCardId: 46600,
      componentIdentityMerge: false, runtimeUnitCount: 1, digitalBattleSupplyLimit: 1, size: 'LARGE', occupiedSlots: 2,
      role: 'LEVEL_II_DUNGEON_THREAT_EXTERNAL_DEPENDENCY', ordinarySkillSummonEligible: false,
      initialPlacement: 'First Monster; use source-bound Large initial-draw deployment, not ordinary Skill summon placement',
      unplaceableInitialCaptain: 'SUPPRESS_CAPTAIN_WITHOUT_REPLACEMENT', threatApplicationConsumed: true,
      bindings: old(26, 'bone-identity-closure').captain.components },
    'Treat narrow artwork and full Large card as representations of one digital unit. The association and count are project decisions, not canonical identity merging.',
    [2], [42004], 'Use full combat stats from 46600 and keep both component identities and literal provenance.', ['captain-single-unit', 'captain-not-skill-summon'], true);
  add('NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER', 'EFFECT_ORDER_UNRESOLVED', 'HIGH_GAMEPLAY_IMPACT',
    { sequence: ['CAPTURE_ATOMIC_DEATH_SET_AND_PRE_REMOVAL_STANCE_AREAS', 'RESOLVE_MANDATORY_DYING_INSTANCE_ON_DEATH_EFFECTS',
      'REMOVE_DYING_MINIATURES_STANCE_CARDS_AND_INSTANCE_INITIATIVE', 'CHOOSE_AND_CONSUME_FIRST_ELIGIBLE_NON_LARGE_DEATH',
      'CHECK_SOURCE_SPECIFIC_CORRESPONDING_AREA_SPACE', 'RESPAWN_IMMEDIATELY_AS_NEW_RUNTIME_INSTANCE',
      'SHUFFLE_ONE_NEW_INSTANCE_INITIATIVE_USING_GENERIC_SPAWN_RULE', 'RESUME_SUSPENDED_EFFECTS_WITH_DEATH_WINDOW_CONSUMED'],
      deathFinalBeforeTrigger: true, removeMiniatureBeforeRespawn: true, removeCardBeforeRespawn: true,
      initiativeRetained: false, treatedAsNewSpawn: true, samePhysicalIdentity: true, sameRuntimeInstance: false,
      newInstanceState: 'Full printed Life; clear wounds, temporary conditions/markers and old activation state; fresh unique runtime instance ID',
      initiativePolicy: 'New instance has one newly shuffled initiative; may act this round under core p31, even if old instance already acted',
      onDeathOrder: 'Respect any explicit effect-local order; otherwise player chooses next pending dying instance/effect by stable ID, never iteration order',
      reentrantDeaths: 'Queue nested atomic death groups by recorded causal event order; lock the earliest eligible death window so nested callbacks cannot steal it',
      firstDeathPolicy: 'One eligible death window per Battle; consume even if source-specific no-space check skips respawn',
      correspondingArea: 'Snapshot the dying Stance corresponding Area before casualty compaction',
      noSpace: 'IGNORE_REANIMATION_WITHOUT_DISPLACEMENT', genericSummonAreaFallbackApplies: false,
      supplyPolicy: 'Transfer the dead physical token under finite supply ruling; no refund and no extra spend',
      battleTerminationPriority: 'If the official Boss-defeat/Threat-expiry boundary already ends this effect scope, cancel pending Reanimation and choices',
      subsequentEffects: 'Resume the interrupted causal resolution after respawn or skip; replacement is not retroactively targeted as the removed instance' },
    'Define a visible death window, fresh instance and explicit initiative insertion. This can change action economy and is deliberately high risk.',
    [3], [42005], 'A causal death-group API, distinct physical/runtime IDs and replayed initiative RNG are C1C29 obligations; engine array position supplies no rule.',
    ['reanimation-event-order', 'fresh-instance', 'initiative-not-inherited', 'reanimation-no-space', 'nested-death-window', 'reanimation-token-transfer'], true);
  add('NECRO_SIMULTANEOUS_FIRST_DEATH_PLAYER_CHOICE', 'EFFECT_ORDER_UNRESOLVED', 'HIGH_GAMEPLAY_IMPACT',
    choice('Eligible non-large Monster deaths captured in the same atomic death window; exclude large units and inactive Threat scope', 'Multiple Monsters died simultaneously. Choose one eligible Monster to reanimate.'),
    'Choose among the captured simultaneous group, not the first callback. Player choice is replay input and precedes a respawn attempt.',
    [3], [42005], 'Pause selection, reject invalid IDs and consume the one-per-Battle window even on failed placement.', ['simultaneous-death-choice', 'choice-order-invariance'], true);
  add('NECRO_ROOM_CAPACITY_DISPLACEMENT_OR_SUPPRESS', 'ROOM_CAPACITY_INTERACTION_UNRESOLVED', 'MEDIUM_RULE_INTERPRETATION',
    { firstEmptyStance: 'OFFICIAL_FIRST_EMPTY_STANCE', fullStances: 'OFFICIAL_SUPPRESS_SUMMON',
      targetHasCapacity: 'PLACE_IN_PRINTED_TARGET_AREA', targetFull: 'APPLY_OFFICIAL_MINIATURE_DISPLACEMENT',
      displacementCandidatePolicy: 'If Heroes are present choose one Hero; otherwise choose one Monster. Restrict candidates to units with a legal nearest destination capable of holding their size.',
      displacedUnitTie: 'AWAIT_EXPLICIT_PLAYER_CHOICE', distanceMetric: 'Shortest path through source-bound adjacent Area graph; occupancy affects destination legality, not distance traversal',
      legalDestination: 'Different Area in same Room with enough free capacity for displaced unit, honoring printed restrictions and Large size',
      nearestAreaTie: 'AWAIT_EXPLICIT_PLAYER_CHOICE', noLegalPlacement: 'SUPPRESS_SUMMON',
      noFeasibleDisplacement: 'SUPPRESS_SUMMON', replaceExistingUnit: false, stanceReplacement: false,
      transactionPolicy: 'Compute a complete legal placement plan before changing positions, supply or initiative; cancellation/invalid choice leaves state unchanged',
      reanimationOverride: 'Do not apply displacement to Reanimation; printed corresponding-Area no-space ignore has its own scope' },
    'Retain official p31 displacement, fill equal-nearest choice and impossible-placement cases, and prevent partial moves or hidden ordering.',
    [1, 2, 3], [42003, 42004, 42005, 46037, 46038, 46039], 'Require explicit legal placement plan, player input on tied legal units/destinations, and atomic commit.',
    ['nearest-area-choice', 'room-no-space-suppress', 'full-stance-suppress', 'failed-placement-no-token-spend', 'large-displacement-size'], true);
  add('NECRO_BOSS_TRIO_ENCOUNTER_STORAGE_RESET', 'CLEANUP_DESTINATION_UNRESOLVED', 'LOW_RISK_DETERMINISM',
    { destinations: { bossIdentity: 'BOSS_ENCOUNTER_STORAGE', threatAbility: 'BOSS_ENCOUNTER_STORAGE', bossBattle: 'BOSS_ENCOUNTER_STORAGE' },
      threatAbilitySide: 'THREAT', temporaryMarkers: 'CLEAR', runtimeState: 'DISCARD', pendingChoice: 'CANCEL',
      initiativeCards: 'REMOVE_ENCOUNTER_INSTANCE_CARDS', campaignPersistentBossCardState: false,
      roomCard: 'USE_OFFICIAL_DUNGEON_DISCARD_THEN_HAMLET_DECK_RETURN', roomTile: 'USE_OFFICIAL_TILE_STACK_RETURN',
      boneSupply: 'RETURN_NON_PERMANENTLY_REMOVED_TOKENS_TO_ENCOUNTER_LEDGER', monsterCards: 'USE_OFFICIAL_MONSTER_DECK_RETURN',
      permanentlyRemovedComponents: 'PRESERVE_CAMPAIGN_REMOVAL_FLAGS', rulingVersion: 'KEEP_CAMPAIGN_AND_REPLAY_VERSION_METADATA' },
    'Store/reset Boss-specific components outside the ordinary Monster deck; retain source-bound Room/Monster cleanup and campaign progression.',
    [1, 2, 3], allIds, 'Use component-specific destinations and explicit reset; do not recreate a defeated Boss or erase campaign progression.', ['boss-cleanup-reset', 'battle-reset'], true);
  return rules;
}

function rulingFor(category: string, file: string, pointer: string, rules: any[]): any {
  let matches = rules.filter(r => r.topic === category);
  if (category === 'SUMMON_COUNT_UNRESOLVED') {
    const levelIndex = pointer.match(/\/levels\/(\d+)/)?.[1];
    const skillIndex = pointer.match(/\/skills\/(\d+)/)?.[1];
    const cardIndex = pointer.match(/\/cards\/(\d+)/)?.[1];
    const level = levelIndex !== undefined ? Number(levelIndex) + 1 : skillIndex !== undefined ? Math.floor(Number(skillIndex) / 3) + 1 :
      cardIndex !== undefined ? old(25, 'card-semantic-contracts').cards[Number(cardIndex)].level : 0;
    matches = matches.filter(r => r.projectDecision.level === level);
  }
  if (category === 'EFFECT_ORDER_UNRESOLVED') matches = matches.filter(r => r.ruleId ===
    (pointer.endsWith('/simultaneousFirstDeath') ? 'NECRO_SIMULTANEOUS_FIRST_DEATH_PLAYER_CHOICE' : 'NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER'));
  assert(matches.length === 1, `unmapped/ambiguous ruling: ${file}:${pointer} (${category})`);
  return matches[0];
}
function executionValue(r: any, pointer: string): any {
  const d = r.projectDecision;
  const key = pointer.split('/').at(-1)!;
  if (r.topic === 'EFFECT_ORDER_UNRESOLVED' && Object.prototype.hasOwnProperty.call(d, key)) return clone(d[key]);
  if (r.topic === 'SUMMON_COUNT_UNRESOLVED') return /(?:count|summonCount)$/.test(key) ? 1 : /summonCountBasis$/.test(key) ? d.basis : clone(d);
  if (r.topic === 'SUMMON_COPY_POLICY_UNRESOLVED') {
    const lookup: Record<string, any> = { deadSummonReuse: false, removedMonsterReturnsToSupply: false, permanentRemovalReuse: false,
      supplyExhaustion: d.supplyExhaustion, summonCopyCounts: Object.fromEntries(d.pools.map((p: any) => [p.name, p.digitalBattleSupplyLimit])) };
    if (key in lookup) return lookup[key];
  }
  if (r.topic === 'ROOM_CAPACITY_INTERACTION_UNRESOLVED') {
    if (key === 'nearestAvailableAreaTie') return d.nearestAreaTie;
    if (key === 'noAvailableAreaFallback') return d.noLegalPlacement;
  }
  return clone(d);
}

// Build a field catalogue, not a production runtime. Bound composite values are
// decomposed so nested missing policies can never hide inside OFFICIAL_SOURCE.
export function buildBindings(rules: any[]): any[] {
  const fields: any[] = [];
  const walk = (node: any, file: string, pointer: string, inheritedReferences: any[] = []) => {
    if (!node || typeof node !== 'object') return;
    const refs = node.sourceReferences?.length ? node.sourceReferences : inheritedReferences;
    if (node.status === 'SOURCE_UNRESOLVED') {
      const rule = rulingFor(node.category, file, pointer, rules);
      fields.push({ fieldId: file + ':' + pointer, value: executionValue(rule, pointer), authority: 'PROJECT_RULING', canonical: false,
        canonicalStatus: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', category: node.category, sourceReference: ref(file, pointer),
        rulingId: rule.ruleId, rulingSetVersion: rule.rulingSetVersion, runtimeRequirement: rule.runtimeRequirement });
      return;
    }
    if (node.status === 'BOUND' && Object.prototype.hasOwnProperty.call(node, 'value')) {
      const decompose = (value: any, p: string) => {
        if (value && typeof value === 'object' && value.status) { walk(value, file, p, refs); return; }
        if (value && typeof value === 'object' && Object.keys(value).length) {
          for (const [k, v] of Object.entries(value)) decompose(v, p + '/' + escapeKey(k));
        } else {
          const printedAbsence = value === null && file === 'c1c25-necromancer-card-semantic-contracts.json' && /^\/cards\/(?:1|3|5)\/effect\/value\/2\/(?:crit|critDamage|damage)$/.test(p);
          assert(printedAbsence || value !== null && value !== undefined, 'null official execution field: ' + file + ':' + p);
          fields.push({ fieldId: file + ':' + p, value: printedAbsence ? { state: 'PRINTED_ABSENT', executionBranch: p.endsWith('/damage') ? 'NO_DIRECT_DAMAGE' : 'NO_CRITICAL_BRANCH' } : clone(value), authority: 'OFFICIAL_SOURCE', canonical: true,
            sourceReference: ref(file, p), officialEvidence: clone(refs), rulingId: 'NOT_APPLICABLE' });
        }
      };
      assert(refs.length > 0, 'official value needs source references: ' + file + ':' + pointer);
      decompose(node.value, pointer + '/value');
      return;
    }
    if (['PRINTED_ABSENT', 'NOT_APPLICABLE'].includes(node.status)) {
      // Explicit absence is metadata, not an executable null/fallback.
      return;
    }
    for (const [k, child] of Object.entries(node)) if (!['inputSha256', 'sourceReferences', 'reviewReferences', 'printedLiteral'].includes(k)) walk(child, file, pointer + '/' + escapeKey(k), refs);
  };
  for (const file of canonicalInputs) walk(load(file), file, '');
  return fields;
}

export function nullPaths(value: any, pointer = ''): string[] {
  if (value === null || value === undefined) return [pointer];
  if (typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => nullPaths(v, pointer + '/' + escapeKey(k)));
}
export function bindingIsExecutable(field: any, rules: any[]): boolean {
  if (nullPaths(field.value).length > 0) return false;
  if (field.authority === 'OFFICIAL_SOURCE') return field.canonical === true && field.sourceReference && field.officialEvidence?.length > 0;
  if (field.authority !== 'PROJECT_RULING' || field.canonical !== false || !field.sourceReference) return false;
  const r = rules.find(r => r.ruleId === field.rulingId);
  return !!r && r.authority === 'PROJECT_RULING' && r.canonical === false && r.futureOverrideAllowed === true && r.runtimeRequirement &&
    r.testObligations?.length > 0 && r.topic === field.category;
}

export function deriveMatrix(fields: any[], rules: any[], graph: any): any {
  const original = old(27, 'semantic-completeness-matrix');
  const familyIds = graph.nodes.filter((n: any) => n.scope === 'FAMILY').flatMap((n: any) => n.fieldIds);
  const index = new Map(fields.map(f => [f.fieldId, f]));
  const executable = (ids: string[]) => ids.length > 0 && ids.every(id => index.has(id) && bindingIsExecutable(index.get(id), rules));
  const cards = original.cards.map((c: any, i: number) => {
    const node = graph.nodes.find((n: any) => n.cardId === c.cardId);
    const reachableFieldIds = [...new Set([...familyIds, ...(node?.fieldIds ?? [])])];
    return { cardId: c.cardId, definitionId: c.definitionId, physicalIdentity: c.physicalIdentity, literalComplete: c.literalComplete,
      canonicalSemanticComplete: c.semanticComplete, executableSemanticComplete: !!node && executable(reachableFieldIds),
      runtimeEligibleForFoundation: !!node && executable(reachableFieldIds), runtimeImplemented: false, productionReady: false,
      reachableFieldIds, projectRulingIds: [...new Set(reachableFieldIds.map(id => index.get(id)?.rulingId).filter(id => id && id !== 'NOT_APPLICABLE'))],
      originalCardIndex: i };
  });
  return { cards, totals: { physical: cards.length, literalComplete: cards.filter((c: any) => c.literalComplete).length,
    canonicalSemanticComplete: cards.filter((c: any) => c.canonicalSemanticComplete).length,
    executableSemanticComplete: cards.filter((c: any) => c.executableSemanticComplete).length,
    runtimeEligibleForFoundation: cards.filter((c: any) => c.runtimeEligibleForFoundation).length, productionReady: 0 },
    canonicalSourceGated: 9, digitalDefaultsAreCanonical: false, proofScope: 'Necromancer family field graph including Threat passives, Skill summons, external Bone binding and Boss cleanup; independent quest/rest runtime remains outside this foundation scope' };
}
export function deriveDecision(matrix: any, fields: any[], rules: any[], graph: any): any {
  const ids = graph.nodes.flatMap((n: any) => n.fieldIds);
  const allMapped = ids.length > 0 && ids.every((id: string) => fields.some(f => f.fieldId === id && bindingIsExecutable(f, rules)));
  const choicesExposed = rules.filter(r => r.projectDecision.playerChoice || /PLAYER_CHOICE/.test(JSON.stringify(r.projectDecision))).every(r => r.playerVisible && r.runtimeRequirement && r.projectDecision.defaultSelection !== 'ARRAY_FIRST');
  const selected = matrix.totals.physical === 9 && matrix.totals.executableSemanticComplete === 9 &&
    matrix.totals.runtimeEligibleForFoundation === 9 && allMapped && choicesExposed && rules.every(r => r.canonical === false && r.authority === 'PROJECT_RULING' && r.testObligations.length > 0);
  return { selectedFamily: 'Necromancer', outcome: selected ? 'NECROMANCER_RUNTIME_FOUNDATION_SELECTED' : 'NECROMANCER_RULING_REVIEW_REQUIRED',
    nextAction: selected ? 'C1C29 Necromancer Runtime Foundation' : 'C1C29 Necromancer Digital Ruling Review',
    verdict: selected ? 'NEXT-NECROMANCER-RUNTIME-FOUNDATION-SELECTED' : 'NEXT-NECROMANCER-DIGITAL-RULING-REVIEW',
    runtimeFoundationAllowed: selected, runtimeImplemented: false, productionReadyGain: 0, canonicalPromotion: false,
    allReachableFieldsMapped: allMapped, playerChoiceContractExposed: choicesExposed,
    rulingSetVersion: 'C1C28-DIGITAL-DEFAULT-v1', gameplayImplementationAllowedThisPhase: false };
}

export function buildArtifacts(): Record<string, any> {
  const a: Record<string, any> = {};
  const inputFiles = [...canonicalInputs, 'c1c26-necromancer-source-gap-register.json', 'c1c26-necromancer-frozen-baseline-contracts.json',
    'c1c27-necromancer-source-exhaustion-register.json', 'c1c27-necromancer-semantic-completeness-matrix.json',
    'c1c27-source-retrieval-evidence.json', 'c1c27-authoritative-source-authentication.json'];
  const meta = { schemaVersion: 1, phase: '11A.4-C1C28', family: 'Necromancer', baselineHead, runtimeImplemented: false,
    inputSha256: Object.fromEntries(inputFiles.map(n => [root + n, digest(root + n)])) };
  const put = (name: string, body: any) => { a[prefix + name + '.json'] = { ...meta, ...body }; };
  const rules = buildRulings();
  const fields = buildBindings(rules);
  const originalCards = old(25, 'card-semantic-contracts').cards;
  const history = old(27, 'source-exhaustion-register');
  const gaps = old(26, 'source-gap-register');
  for (const file of canonicalInputs) for (const g of unresolvedLeaves(load(file))) assert(fields.some(f => f.fieldId === file + ':' + g.field && f.authority === 'PROJECT_RULING'), 'canonical unknown is missing overlay');
  const lineage = (usages: any[]) => usages.map(g => {
    const f = fields.find(f => f.fieldId === g.gapId);
    assert(f?.authority === 'PROJECT_RULING', 'every inherited usage must have exact field ruling: ' + g.gapId);
    return { gapId: g.gapId, category: g.category, sourceReference: ref(g.artifact, g.field),
      canonicalStatus: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', runtimeResolution: 'PROJECT_RULING', rulingId: f.rulingId,
      runtimeFieldId: f.fieldId, officialResolved: false };
  });
  const policy = { policyId: 'C1C28_USER_AVAILABLE_CORPUS_FREEZE', authority: 'PROJECT_DECISION',
    basis: 'Explicit C1C28 user instruction: proceed on the premise that no authoritative material beyond the rulebook and official physical components can be acquired.',
    exhaustionScope: 'PROJECT_CURRENTLY_AVAILABLE_AUTHORITATIVE_CORPUS', globalExhaustionClaim: false,
    faqDoesNotExistClaim: false, authenticatedPermanentUnavailabilityClaim: false, furtherAcquisitionRequired: false,
    oldC1C27GateChanged: false, projectDevelopmentGateSuperseded: true, futureSourceReauditAllowed: true,
    evidenceIds: ['C1C28_USER_AVAILABLE_CORPUS_FREEZE', ...load('c1c27-source-retrieval-evidence.json').receipts.map((r: any) => r.evidenceId)] };
  put('terminal-source-blockers', { freezePolicy: policy, categories: history.topics.map((t: any) => ({ category: t.category,
    affectedCards: [...new Set(rules.filter(r => r.topic === t.category).flatMap(r => r.affectedCards))],
    familyDependencyCards: originalCards.map((c: any) => c.cardId),
    officialKnownFacts: [{ summary: knownFactSummaries[t.category], sourceReferences: [ref(`c1c27-necromancer-${topicByCategory[t.category]}.json`, '')] }], officialUnknowns: t.nextEvidence,
    checkedSources: t.checkedSourceReferences, unavailableAuthorityHistory: { path: root + 'c1c27-source-retrieval-evidence.json', receiptIds: t.retrievalEvidenceIds,
      pendingAuthoritySourceIds: t.pendingAuthoritySourceIds, historicalC1C27Status: t.status, newlyAuthenticatedFiles: 0 },
    canonicalStatus: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', exhaustionScope: policy.exhaustionScope, canonicalOfficialResolved: false,
    runtimeImpact: rules.filter(r => r.topic === t.category).map(r => r.runtimeRequirement), projectRulingRequired: true,
    rulingIds: rules.filter(r => r.topic === t.category).map(r => r.ruleId), riskLevel: rules.find(r => r.topic === t.category).riskLevel,
    leafUsages: t.baselineGapIds.length, exhaustionEvidenceIds: policy.evidenceIds })),
    baselineUsages: lineage(gaps.baselineLeafUsages), refinedUsages: lineage(gaps.refinedContractLeafUsages),
    totals: { categories: 9, inheritedLeafUsages: 75, sourceResolvedUsages: 0, projectScopedTerminalUsages: 75,
      runtimeRulingCoveredUsages: 75, refinedUsages: gaps.refinedContractLeafUsages.length },
    historicalCanonicalFilesRewritten: false, globallyExhaustedCorpus: false });
  put('project-rulings', { rulingSetVersion: 'C1C28-DIGITAL-DEFAULT-v1', defaultMode: 'DIGITAL_DEFAULT', rules,
    authorityLayers: ['OFFICIAL_SOURCE', 'SOURCE_UNRESOLVED', 'PROJECT_RULING', 'HOUSE_RULE_OPTIONAL'], overridePolicy,
    optionalHouseRuleSchema: { authority: 'HOUSE_RULE_OPTIONAL', canonical: false, enabledByDefault: false,
      requiredFields: ['ruleId', 'baseRulingId', 'decision', 'riskLevel', 'variantVersion'], implemented: false },
    futureModes: { STRICT_SOURCE: 'Stop and explain unresolved source rather than using project ruling; not implemented',
      DIGITAL_DEFAULT: 'Compose official facts and explicit versioned project rulings', CUSTOM: 'Versioned explicit optional variants; not implemented' } });
  const nodes = [
    { nodeId: 'family-setup-and-lifecycle', scope: 'FAMILY', fieldIds: fields.filter(f => !f.fieldId.startsWith('c1c25-necromancer-card-semantic-contracts.json:')).map(f => f.fieldId) },
    ...originalCards.map((c: any, i: number) => ({ nodeId: 'card-' + c.cardId, scope: 'CARD', cardId: c.cardId,
      fieldIds: fields.filter(f => f.fieldId.startsWith(`c1c25-necromancer-card-semantic-contracts.json:/cards/${i}/`)).map(f => f.fieldId) })),
  ];
  const graph = { roots: originalCards.map((c: any) => 'card-' + c.cardId), nodes,
    edges: originalCards.map((c: any) => ({ from: 'card-' + c.cardId, to: 'family-setup-and-lifecycle' })),
    phases: ['HAMLET_THREAT', 'DUNGEON_THREAT', 'BOSS_ROOM_SETUP', 'THREAT_ABILITY_FLIP', 'BATTLE_SKILL', 'SUMMON', 'DEATH_REANIMATION', 'BOSS_DEFEAT_CLEANUP'],
    blockedUnknownFieldIds: fields.filter(f => !bindingIsExecutable(f, rules)).map(f => f.fieldId),
    independentOutOfScope: ['FACE_THE_THREAT_REWARD_AND_RETURN / REST_INSUFFICIENT_RECOVERY_CAPACITY'],
    hiddenIterationPriorityAllowed: false, playerChoiceIsRecordedInput: true };
  put('runtime-semantic-contract', { defaultMode: 'DIGITAL_DEFAULT', rulingSetVersion: 'C1C28-DIGITAL-DEFAULT-v1',
    fields, reachableExecutionGraph: graph, canonicalSources: canonicalInputs.map(n => root + n),
    noNullExecutionPath: fields.every(f => bindingIsExecutable(f, rules)),
    sourceUnresolvedIsCanonical: true, projectDecisionsAreOfficial: false, overridePolicy,
    runtimeRequirements: ['Explicit pending-choice state with no silent fallback', 'Choice/event/ruling version metadata in save and replay',
      'Causal atomic death groups and fresh runtime IDs', 'Seeded generic initiative insertion', 'Exclusive finite physical-token ledger',
      'Atomic placement/cleanup transactions', 'Source-specific Reanimation no-space exception', 'Do not import audit models into gameplay'] });
  const risk = rules.map(r => ({ ruleId: r.ruleId, riskLevel: r.riskLevel,
    balanceImpact: r.riskLevel === 'HIGH_GAMEPLAY_IMPACT' ? 'Can change summon/action economy or component interpretation; requires dedicated scenarios, no balance acceptance claimed' :
      r.riskLevel === 'MEDIUM_RULE_INTERPRETATION' ? 'Affects placement outcomes without replacing existing units' : 'Adds visible selection/reset; may favor player choice but preserves candidate set',
    determinismImpact: 'Recorded explicit input and stable identity; no hidden iteration priority',
    UIImpact: r.playerVisible ? 'Expose digital ruling and any pending choice' : 'Versioned provenance disclosure',
    saveReplayImpact: 'Pin ruling version; record choice, instance IDs, token state and causal event IDs as applicable',
    reversibility: 'Future rule-set version after explicit migration review', futureOfficialOverrideCost: 'Audit scoped correction; retain historical saves/replays; no silent campaign rewrite',
    testObligations: r.testObligations, testedBy: 'src/audit/c1c28-necromancer-project-rulings.test.ts' }));
  put('ruling-risk-matrix', { rulings: risk, balanceValidated: false, futureOverridePolicy: overridePolicy });
  const matrix = deriveMatrix(fields, rules, graph);
  put('executable-completeness-matrix', matrix);
  const decision = deriveDecision(matrix, fields, rules, graph);
  put('runtime-readiness-matrix', { canonicalSemanticComplete: matrix.totals.canonicalSemanticComplete,
    executableSemanticComplete: matrix.totals.executableSemanticComplete, runtimeEligibleForFoundation: matrix.totals.runtimeEligibleForFoundation,
    runtimeImplemented: false, productionReady: 0, sourceGateRetained: true, graphProof: graph,
    obligations: rules.map(r => ({ ruleId: r.ruleId, runtimeRequirement: r.runtimeRequirement, testObligations: r.testObligations, playerVisible: r.playerVisible })),
    runtimeAndUiImplementationPending: true, productionProofPending: true, rulingContractGatePassed: decision.runtimeFoundationAllowed });
  a['c1c28-next-workstream-decision.json'] = { ...meta, ...decision,
    acceptanceVerdict: 'C1C28-NECROMANCER-TERMINAL-BLOCKER-AND-DIGITAL-RULING-CONTRACT-ACCEPTED', freezePolicyId: policy.policyId };
  return a;
}

// Audit-only contract oracles: exercise selection/count/resource implications.
// They are deliberately outside src/game-engine and are never production APIs.
export function choiceOracle(ids: string[], selected?: string): any {
  const candidates = [...new Set(ids)].sort();
  if (!candidates.length) return { state: 'NO_EFFECT', candidateIds: candidates };
  if (selected !== undefined) { assert(candidates.includes(selected), 'invalid player choice'); return { state: 'SELECTED', chosenId: selected, candidateIds: candidates }; }
  return candidates.length === 1 ? { state: 'SELECTED', chosenId: candidates[0], candidateIds: candidates } : { state: 'CHOICE_REQUIRED', candidateIds: candidates };
}
export function countOracle(level: number, successfulHits: number, fullStances = false): number {
  assert([1, 2, 3].includes(level) && Number.isInteger(successfulHits) && successfulHits >= 0 && successfulHits <= 4, 'count oracle input');
  const rule = buildRulings().find(r => r.ruleId === `NECRO_SUMMON_COUNT_LEVEL_${level}_ONCE_PER_ACTIVATION`);
  return successfulHits > 0 && !fullStances ? rule.projectDecision.unitCountPerInstruction : 0;
}
export function supplyOracle(tokens: string[], event: 'SPAWN' | 'DEATH' | 'REMOVE' | 'RESET' | 'REANIMATE', token: number, legalPlacement = true): string[] {
  assert(Number.isInteger(token) && token >= 0 && token < tokens.length && tokens.every(t => ['AVAILABLE', 'ACTIVE', 'SPENT', 'PERMANENTLY_REMOVED'].includes(t)), 'supply oracle input');
  const out = [...tokens];
  if (event === 'RESET') return out.map(t => t === 'PERMANENTLY_REMOVED' ? t : 'AVAILABLE');
  if (!legalPlacement && ['SPAWN', 'REANIMATE'].includes(event)) return out;
  if (event === 'SPAWN') { assert(out[token] === 'AVAILABLE', 'supply exhausted or token already allocated'); out[token] = 'ACTIVE'; }
  if (event === 'DEATH') { assert(out[token] === 'ACTIVE', 'death of inactive token'); out[token] = 'SPENT'; }
  if (event === 'REMOVE') out[token] = 'PERMANENTLY_REMOVED';
  if (event === 'REANIMATE') { assert(out[token] === 'SPENT', 'must transfer the chosen dead token'); out[token] = 'ACTIVE'; }
  return out;
}
export function nearestAreaOracle(graph: Record<string, string[]>, origin: string, freeCapacity: Record<string, number>, unitSize: number, selected?: string): any {
  assert(origin in graph && unitSize > 0, 'placement oracle input');
  const distances: Record<string, number> = { [origin]: 0 }; const queue = [origin];
  for (let i = 0; i < queue.length; i++) for (const neighbor of graph[queue[i]] ?? []) if (!(neighbor in distances)) { distances[neighbor] = distances[queue[i]] + 1; queue.push(neighbor); }
  const candidates = Object.keys(distances).filter(id => id !== origin && freeCapacity[id] >= unitSize);
  if (!candidates.length) return { state: 'SUPPRESS_SUMMON', candidateIds: [] };
  const nearest = Math.min(...candidates.map(id => distances[id]));
  return choiceOracle(candidates.filter(id => distances[id] === nearest), selected);
}

export function validateArtifacts(a: Record<string, any>) {
  const rules = a[prefix + 'project-rulings.json'].rules;
  const contract = a[prefix + 'runtime-semantic-contract.json'];
  const terminal = a[prefix + 'terminal-source-blockers.json'];
  assert(new Set(rules.map((r: any) => r.ruleId)).size === rules.length, 'unique ruling IDs');
  assert(categories.every(c => terminal.categories.some((t: any) => t.category === c && t.canonicalStatus === 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' && !t.canonicalOfficialResolved)), 'retain nine unresolved source categories');
  assert(rules.every((r: any) => r.authority === 'PROJECT_RULING' && r.canonical === false && r.futureOverrideAllowed && r.overridePolicy.ifNewAuthoritativeSource.createMigrationReview), 'ruling authority/migration separation');
  assert(contract.fields.every((f: any) => bindingIsExecutable(f, rules)), 'unmapped/null execution path');
  assert(terminal.baselineUsages.length === 75 && terminal.baselineUsages.every((g: any) => contract.fields.some((f: any) => f.fieldId === g.runtimeFieldId && f.rulingId === g.rulingId)), '75 exact baseline coverage');
  const expected = buildArtifacts();
  assert(JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(expected).sort()), 'artifact set');
  for (const [n, v] of Object.entries(expected)) assert(JSON.stringify(a[n]) === JSON.stringify(v), 'deterministic artifact drift: ' + n);
}
export function verifyScope(paths: string[]) {
  for (const p of paths) assert(p === 'package.json' || /^scripts\/audit\/(?:c1c28-contract\.ts|(?:generate|verify)-complete-edition-c1c28\.ts)$/.test(p) ||
    p === 'src/audit/c1c28-necromancer-project-rulings.test.ts' || /^docs\/data\/complete-edition\/c1c28-[\w-]+\.json$/.test(p) ||
    /^docs\/reports\/complete-edition\/c1c28-[\w-]+\.md$/.test(p), 'scope violation: ' + p);
}
export function verifyBaselineAndScope() {
  git('merge-base', '--is-ancestor', baselineHead, 'HEAD');
  verifyScope(git('diff', '--name-only', baselineHead).split(/\r?\n/).filter(Boolean));
  const preexisting = (p: string) => p.startsWith('.tmp-') || p.startsWith('tmp/') || p === 'src/.tmp-geom-check.test.ts';
  verifyScope(git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(p => p && !preexisting(p)));
  const entries = git('ls-tree', '-r', baselineHead).split(/\r?\n/).map(line => { const [header, path] = line.split('\t'); return { path, oid: header.split(' ')[2] }; }).filter(e => e.path !== 'package.json');
  const hashes = execFileSync('git', ['hash-object', '--stdin-paths'], { input: entries.map(e => e.path).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim().split(/\r?\n/);
  assert(entries.length === hashes.length, 'baseline count');
  entries.forEach((e, i) => {
    if (hashes[i] === e.oid) return;
    const original = execFileSync('git', ['show', baselineHead + ':' + e.path], { maxBuffer: 128 * 1024 * 1024 }); const now = readFileSync(e.path);
    assert(!original.includes(0) && !now.includes(0) && original.toString().replace(/\r\n/g, '\n') === now.toString().replace(/\r\n/g, '\n'), 'baseline mutation: ' + e.path);
  });
  const pkg = JSON.parse(git('show', baselineHead + ':package.json'));
  pkg.scripts['audit:complete-edition-c1c28'] = 'vite-node scripts/audit/generate-complete-edition-c1c28.ts';
  pkg.scripts['verify:complete-edition-c1c28'] = 'vite-node scripts/audit/verify-complete-edition-c1c28.ts';
  assert(JSON.stringify(pkg) === JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8'))), 'only two package scripts allowed');
  // Exact source evidence hashes supplement EOL-tolerant historical text checks.
  for (const r of load('c1c27-source-retrieval-evidence.json').receipts) {
    if (r.responsePath) assert(digest(r.responsePath) === r.responseSha256, 'frozen response bytes');
    if (r.headersPath) assert(digest(r.headersPath) === r.headersSha256, 'frozen header bytes');
  }
}

export function report(a: Record<string, any>): string {
  const terminal = a[prefix + 'terminal-source-blockers.json']; const r = a[prefix + 'project-rulings.json'];
  const matrix = a[prefix + 'executable-completeness-matrix.json']; const d = a['c1c28-next-workstream-decision.json'];
  const contract = a[prefix + 'runtime-semantic-contract.json'];
  const rows = terminal.categories.map((t: any) => `| ${t.category} | ${t.leafUsages} | SOURCE_EXHAUSTED_STILL_UNRESOLVED | ${t.rulingIds.join(', ')} | ${t.riskLevel} |`).join('\n');
  return `# C1C28 Necromancer Terminal Blockers and Digital Rulings\n\nBaseline ${baselineHead}; ${d.acceptanceVerdict}. ${d.verdict}. No gameplay runtime is implemented in this phase.\n\n## Project-scoped source freeze\n\nThe explicit C1C28 user decision adopts the premise that no additional authoritative material beyond the rulebook and official physical components can be acquired. Under that development policy, all 75 usages in nine categories are frozen as SOURCE_EXHAUSTED_STILL_UNRESOLVED **within the project's currently available corpus**. This is not proof of worldwide exhaustion, FAQ nonexistence or authenticated permanent unavailability. C1C27 recorded pending acquisition leads and did not prove global exhaustion; its files, statuses and verifier remain unchanged. The user-directed C1C28 development gate supersedes waiting for those leads, without changing historical facts. Future acquired authority can reopen audit. No new network retries were performed.\n\n| Category | Inherited usages | Canonical status | Digital ruling IDs | Risk |\n| --- | ---: | --- | --- | --- |\n${rows}\n\nBefore: 75 authority-blocked usages, 0 closed, 0 terminal. After: 75 project-scoped terminal source usages, 0 officially closed, 75 covered by project ruling. All ${terminal.totals.refinedUsages} C1C26 refined fields are separately covered and are not added to the 75 baseline count.\n\n## Sixteen required answers\n\n| Question | Answer |\n| --- | --- |\n| 1. Which rules are OFFICIAL_SOURCE? | Printed stats, triggers, Self/damage/Target ordering and successful-hit gating; Threat flip/expiry; setup/Room layout; first-empty Stance and full-Stance suppression; generic displacement; death threshold/removal; generic new-spawn initiative; Boss defeat/progression and Room/Monster cleanup. The field catalogue cites exact canonical paths and evidence. |\n| 2. Which rules are source terminal? | All nine categories above, under the explicit available-corpus project freeze; no official rule becomes resolved. |\n| 3. Does every unresolved have a PROJECT_RULING? | YES. 75/75 exact baseline usages plus all refined fields map to ruling IDs; ${r.rules.length} rulings, canonical=false and futureOverrideAllowed=true. |\n| 4. Lowest-roll Hero tie? | Player chooses one tied lowest-roll Hero. Await input, validate candidates, record choice; no extra RNG or array-first selection. II may use Graveyard, III may not, unchanged. |\n| 5. Crowded Area tie? | Player chooses among equal-highest-occupancy official Target candidates, then preserve official range/movement handling. Character targeting priority remains separate. |\n| 6. Summon count each Level? | I/II/III each execute one printed instruction per Skill activation if at least one Hero hit succeeds. All miss: zero. Full Stances: suppress. Hit count never multiplies summon count. |\n| 7. Supply exhaustion/reset? | Project finite battle limits: Rabble 3, Soldier 3, Spearman 3; Captain 1 for Level II Dungeon Threat only. Active physical copies occupy tokens, casualties remain spent this Battle, exhaustion suppresses, failed placement spends nothing. Battle end resets non-permanently-removed tokens; campaign removal remains. Component quantities themselves are observations, not canonical limits. |\n| 8. Rubble maps to Rabble? | YES, solely through NECRO_RUBBLE_REFERS_TO_PRINTED_RABBLE; original Rubble/Rabble literals and SOURCE_CONFLICT persist. Captain narrow/full association is PROJECT_COMPONENT_BINDING for one Large unit, never a canonical component merge or ordinary Skill summon. |\n| 9. Reanimation complete order? | Snapshot atomic deaths and pre-compaction corresponding Areas; resolve mandatory dying-instance effects; remove old miniature/card/initiative; choose and consume first eligible non-large death; check corresponding Area; respawn immediately as fresh full-Life instance; shuffle one new initiative; resume suspended effects. Old activation/wounds/conditions do not carry. Unordered dying effects require explicit player input. Nested death groups cannot steal the locked first window. |\n| 10. Simultaneous first death? | Player chooses among captured eligible deaths. Choice is recorded and validated; one-per-Battle window is consumed even if no-space skips respawn. |\n| 11. Full Room Area fallback? | Retain p31 miniature displacement; choose an eligible Hero, or a Monster if no Hero, with a feasible destination. Nearest destination uses source-bound adjacency distance and enough capacity for unit size; ties require player choice. No replacement or Stance eviction. |\n| 12. No legal placement? | Ordinary summon suppresses atomically without spending supply or initiative. Reanimation separately follows its printed corresponding-Area no-space ignore, with no displacement. |\n| 13. Boss cards after Battle? | Identity, Threat/Ability and Battle go to Boss encounter storage. Threat/Ability resets to Threat; clear markers/instance state/pending choices/initiative. Preserve official Room/Monster return, campaign progression and permanent removal; reset digital supply ledger. |\n| 14. Canonical semantic complete? | ${matrix.totals.canonicalSemanticComplete}/9; canonical source gating persists. |\n| 15. Executable semantic complete? | ${matrix.totals.executableSemanticComplete}/9 for the explicit family contract graph; runtime/UI and production proof are still pending. |\n| 16. C1C29 Runtime Foundation allowed? | ${d.runtimeFoundationAllowed ? 'YES' : 'NO'}: ${d.nextAction}. Eligibility is for foundation implementation, not Production Ready acceptance. |\n\n## Field provenance, risk and reachability\n\nOFFICIAL_SOURCE and PROJECT_RULING bindings are separate. Bound composite values are decomposed so a missing policy cannot hide inside an official parent. Each digital field cites an immutable canonical path and ruling ID. The runtime catalogue contains ${contract.fields.length} bindings; all reachable values are non-null or explicit pending-choice branches. Graph roots cover nine physical cards and family setup/lifecycle, including Hamlet/Dungeon Threat effects and external Bone dependencies. No hidden engine iteration order is allowed. Independent quest/rest reward-return runtime is outside this Boss foundation scope and remains gated.\n\nSummon count/supply, identity interpretation/Captain binding and Reanimation/action economy are HIGH_GAMEPLAY_IMPACT; placement is MEDIUM_RULE_INTERPRETATION; selection/reset are LOW_RISK_DETERMINISM. Dedicated audit scenarios test contract obligations; no balance tuning or gameplay acceptance is claimed. Player choice makes behavior deterministic given validated recorded input, not autonomous without input. The audit-only oracles are confined to scripts/audit and are not Boss runtime.\n\nC1C29 must implement visible pending choices, atomic placement, causal death windows, fresh instance identity, generic seeded initiative insertion, finite token accounting and versioned save/replay metadata. Canonical completeness is not an entry requirement for DIGITAL_DEFAULT; source provenance and public digital decisions are. Production Ready remains 0/9. Strict Source/Custom/optional house-rule schemas are reserved, not implemented.\n\n## Future authority and frozen validation\n\nCampaign/replay must pin C1C28-DIGITAL-DEFAULT-v1 and retain choice/event provenance. Newly obtained official clarification requires scoped re-audit, historical ruling preservation and migration review; it cannot silently change live campaign state.\n\nAll C1C25–27 literals, source contracts, source gaps and precedence histories remain frozen, along with gameplay, AI, UI, selectors, save/replay, other families and bundler configuration. Upstream counts remain Trinket 15/37, Quest 3/75, census 278, Hamlet Event 16 literal / 5 local semantic / 0 Ready, Boss 231 / 20 families, Battle 114 / Threat 51 / Ability 12 / Identity 54. Build remains BUILD_ACCEPTANCE_UNVERIFIED due to the recorded Windows repeated-hash/path-length failure; no tooling repair is included. Historical C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout remain open; Complete Edition browser E2E is not fully accepted. Actual commands/results are in c1c28-validation-report.md.\n`;
}
export function writeArtifacts() {
  const a = buildArtifacts(); validateArtifacts(a);
  for (const [n, v] of Object.entries(a)) writeFileSync(root + n, JSON.stringify(v, null, 2) + '\n');
  writeFileSync('docs/reports/complete-edition/c1c28-necromancer-terminal-blocker-and-ruling-report.md', report(a));
}
