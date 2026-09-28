import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load, root, unresolvedLeaves } from '../../scripts/audit/c1c25-contract';
import { buildArtifacts, buildRulings, buildBindings, validateArtifacts, categories, deriveMatrix, deriveDecision,
  bindingIsExecutable, nullPaths, choiceOracle, countOracle, supplyOracle, nearestAreaOracle, verifyScope,
  verifyBaselineAndScope } from '../../scripts/audit/c1c28-contract';

const a = buildArtifacts();
const get = (name: string) => a['c1c28-necromancer-' + name + '.json'];
const terminal = get('terminal-source-blockers');
const rules = get('project-rulings').rules;
const contract = get('runtime-semantic-contract');
const fields = contract.fields;
const graph = contract.reachableExecutionGraph;
const rule = (id: string) => rules.find((r: any) => r.ruleId === id);
const decision = a['c1c28-next-workstream-decision.json'];
const mutate = (name: string, edit: (v: any) => void) => { const v = structuredClone(a); edit(v[name]); return v; };
const pointer = (v: any, p: string) => p.split('/').slice(1).reduce((x, k) => x[k.replace(/~1/g, '/').replace(/~0/g, '~')], v);

describe('C1C28 canonical source and digital ruling separation', () => {
  it('retains all nine historical categories and all 75 exact source usages', () => {
    expect(terminal.categories.map((t: any) => t.category)).toEqual(categories);
    expect(terminal.baselineUsages.map((g: any) => [g.gapId, g.category])).toEqual(load('c1c27-necromancer-source-exhaustion-register.json').leafUsages.map((g: any) => [g.gapId, g.category]));
    expect(terminal.totals).toMatchObject({ inheritedLeafUsages: 75, sourceResolvedUsages: 0, projectScopedTerminalUsages: 75, runtimeRulingCoveredUsages: 75, refinedUsages: 45 });
  });
  it('makes project availability freeze explicit without claiming worldwide exhaustion or nonexistent FAQ', () => {
    expect(terminal.freezePolicy).toMatchObject({ authority: 'PROJECT_DECISION', exhaustionScope: 'PROJECT_CURRENTLY_AVAILABLE_AUTHORITATIVE_CORPUS',
      globalExhaustionClaim: false, faqDoesNotExistClaim: false, authenticatedPermanentUnavailabilityClaim: false,
      oldC1C27GateChanged: false, projectDevelopmentGateSuperseded: true, furtherAcquisitionRequired: false, futureSourceReauditAllowed: true });
    expect(load('c1c27-necromancer-source-exhaustion-register.json').topics.every((t: any) => t.status === 'BLOCKED_ON_UNRETRIEVED_AUTHORITY' && !t.terminal)).toBe(true);
    expect(terminal.categories.every((t: any) => t.canonicalStatus === 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' && !t.canonicalOfficialResolved)).toBe(true);
  });
  it('maps every reachable canonical unresolved field to an exact explicit ruling', () => {
    for (const path of contract.canonicalSources) {
      const name = path.slice(root.length);
      for (const leaf of unresolvedLeaves(load(name))) {
        const binding = fields.find((f: any) => f.fieldId === name + ':' + leaf.field);
        expect(binding).toMatchObject({ authority: 'PROJECT_RULING', canonical: false, category: leaf.category });
        expect(rule(binding.rulingId)).toBeDefined();
      }
    }
    for (const usage of [...terminal.baselineUsages, ...terminal.refinedUsages]) expect(fields.some((f: any) => f.fieldId === usage.runtimeFieldId && f.rulingId === usage.rulingId)).toBe(true);
  });
  it('requires canonical=false and PROJECT_RULING on every project rule', () => {
    expect(rules).toHaveLength(12);
    expect(new Set(rules.map((r: any) => r.ruleId)).size).toBe(rules.length);
    expect(rules.every((r: any) => r.authority === 'PROJECT_RULING' && r.canonical === false && r.futureOverrideAllowed)).toBe(true);
    expect(() => validateArtifacts(mutate('c1c28-necromancer-project-rulings.json', v => { v.rules[0].canonical = true; }))).toThrow();
    expect(() => validateArtifacts(mutate('c1c28-necromancer-project-rulings.json', v => { v.rules[0].authority = 'OFFICIAL_SOURCE'; }))).toThrow();
  });
  it('preserves official leaf values and references without unresolved composites hiding inside them', () => {
    const official = fields.filter((f: any) => f.authority === 'OFFICIAL_SOURCE');
    expect(official.length).toBeGreaterThan(100);
    for (const f of official) {
      const v = pointer(load(f.sourceReference.path.slice(root.length)), f.sourceReference.pointer);
      if (v === null) expect(f.value).toMatchObject({ state: 'PRINTED_ABSENT' }); else expect(f.value).toEqual(v);
      expect(f.officialEvidence.length).toBeGreaterThan(0);
      expect(unresolvedLeaves(f.value)).toEqual([]);
    }
  });
  it('requires every project field to point at canonical unresolved rather than rewriting source truth', () => {
    for (const f of fields.filter((f: any) => f.authority === 'PROJECT_RULING')) {
      const node = pointer(load(f.sourceReference.path.slice(root.length)), f.sourceReference.pointer);
      expect(node).toMatchObject({ status: 'SOURCE_UNRESOLVED', value: null, category: f.category });
      expect(bindingIsExecutable(f, rules)).toBe(true);
    }
  });
  it('hero-tie-choice: explicitly waits for tied Hero choice and preserves official Level benefits', () => {
    const r = rule('NECRO_LOWEST_ROLL_TIE_PLAYER_CHOICE');
    expect(r.projectDecision).toMatchObject({ tieBreakAuthority: 'PLAYER_CHOICE', defaultSelection: 'NONE', extraTieRngDraws: 0 });
    expect(r.projectDecision.prompt).toBe('Multiple Heroes tied for lowest roll. Choose one of the tied Heroes.');
    expect(choiceOracle(['hero-b','hero-a'])).toEqual({ state: 'CHOICE_REQUIRED', candidateIds: ['hero-a','hero-b'] });
    expect(choiceOracle(['hero-b','hero-a'], 'hero-b').chosenId).toBe('hero-b');
    expect(load('c1c26-necromancer-lowest-roll-tie-contract.json').effects.map((e: any) => [e.level, e.mayUseGraveyardEffect])).toEqual([[2,true],[3,false]]);
  });
  it('area-tie-choice: exposes crowded Area choice without character or in-range priority substitution', () => {
    const d = rule('NECRO_CROWDED_AREA_TIE_PLAYER_CHOICE').projectDecision;
    expect(d.multipleCandidates).toBe('AWAIT_EXPLICIT_PLAYER_CHOICE'); expect(d.candidateScope).toContain('Check Range step afterward');
    expect(choiceOracle(['area-3','area-2'])).toMatchObject({ state: 'CHOICE_REQUIRED' });
    expect(load('c1c27-necromancer-area-tie-closure.json').characterPriorityAppliesToAreaTie).toBe(false);
  });
  it('choice-order-invariance: input permutations cannot silently change selection', () => {
    for (const ids of [['b','a','c'], ['c','b','a'], ['a','c','b']]) {
      expect(choiceOracle(ids)).toEqual({ state: 'CHOICE_REQUIRED', candidateIds: ['a','b','c'] });
      expect(choiceOracle(ids, 'c')).toEqual({ state: 'SELECTED', chosenId: 'c', candidateIds: ['a','b','c'] });
    }
    expect(() => choiceOracle(['a','b'], 'invalid')).toThrow();
    expect(choiceOracle(['a'])).toMatchObject({ state: 'SELECTED', chosenId: 'a' });
    expect(choiceOracle([])).toMatchObject({ state: 'NO_EFFECT' });
  });
  for (const level of [1,2,3]) it(`count-level-${level}: one instruction per activation with independent Level ruling`, () => {
    const r = rule(`NECRO_SUMMON_COUNT_LEVEL_${level}_ONCE_PER_ACTIVATION`);
    expect(r.affectedLevels).toEqual([level]); expect(r.projectDecision.countBySkill).toEqual([1,1,1]);
    expect(countOracle(level, 1)).toBe(1); expect(countOracle(level, 4)).toBe(1);
    expect(r.canonical).toBe(false); expect(r.riskLevel).toBe('HIGH_GAMEPLAY_IMPACT');
  });
  it('mixed-hits-single-instruction / all-miss-no-summon: hit count is gating, not multiplication', () => {
    for (const level of [1,2,3]) {
      expect(countOracle(level, 0)).toBe(0);
      for (const hits of [1,2,3,4]) expect(countOracle(level, hits)).toBe(1);
    }
    expect(() => countOracle(4,1)).toThrow(); expect(() => countOracle(1,-1)).toThrow();
  });
  it('finite-supply-exhaustion: physical counts and digital gameplay limits stay distinct', () => {
    const d = rule('NECRO_FINITE_BATTLE_SUPPLY_NO_DEATH_REFUND').projectDecision;
    expect(d.finite).toBe(true); expect(d.physicalMiniatureCountIsCanonicalGameplayLimit).toBe(false);
    expect(d.pools.map((p: any) => [p.name,p.observedPhysicalCopies,p.digitalBattleSupplyLimit])).toEqual([
      ['Bone Rabble',3,3], ['Bone Soldier',3,3], ['Bone Spearman',3,3], ['Bone Captain',1,1]]);
    let tokens = ['AVAILABLE','AVAILABLE','AVAILABLE'];
    for (const i of [0,1,2]) tokens = supplyOracle(tokens,'SPAWN',i);
    expect(tokens).toEqual(['ACTIVE','ACTIVE','ACTIVE']); expect(() => supplyOracle(tokens,'SPAWN',0)).toThrow();
    expect(d.supplyExhaustion).toBe('SUPPRESS_SUMMON_NO_REPLACEMENT');
  });
  it('death-no-refund: killed summons remain spent within the current Battle', () => {
    const spent = supplyOracle(['ACTIVE','AVAILABLE','AVAILABLE'],'DEATH',0);
    expect(spent).toEqual(['SPENT','AVAILABLE','AVAILABLE']); expect(() => supplyOracle(spent,'SPAWN',0)).toThrow();
    expect(rule('NECRO_FINITE_BATTLE_SUPPLY_NO_DEATH_REFUND').projectDecision.deathReturnsImmediately).toBe(false);
  });
  it('battle-reset / permanent-removal-preserved: reset releases spent tokens without reviving permanent removals', () => {
    expect(supplyOracle(['SPENT','ACTIVE','PERMANENTLY_REMOVED'],'RESET',0)).toEqual(['AVAILABLE','AVAILABLE','PERMANENTLY_REMOVED']);
    expect(supplyOracle(supplyOracle(['ACTIVE'],'REMOVE',0),'RESET',0)).toEqual(['PERMANENTLY_REMOVED']);
    expect(rule('NECRO_FINITE_BATTLE_SUPPLY_NO_DEATH_REFUND').projectDecision.resetAtBattleEnd).toBe(true);
  });
  it('failed-placement-no-token-spend: rejected or impossible placement changes no supply', () => {
    const before = ['AVAILABLE','SPENT']; expect(supplyOracle(before,'SPAWN',0,false)).toEqual(before);
    expect(before).toEqual(['AVAILABLE','SPENT']);
    expect(rule('NECRO_FINITE_BATTLE_SUPPLY_NO_DEATH_REFUND').projectDecision.placementFailureSpendsSupply).toBe(false);
  });
  it('rabble-conflict-preserved / identity-overlay-only: aliases never erase canonical Rubble', () => {
    const r = rule('NECRO_RUBBLE_REFERS_TO_PRINTED_RABBLE');
    expect(r.projectDecision).toMatchObject({ printedLiteral:'Bone Rabble', rulebookP38Literal:'Bone Rubble', runtimeIdentity:'Bone Rabble',
      canonicalAlias:false, eraseOriginalLiteral:false, officialPrecedenceChanged:false });
    expect(load('c1c27-necromancer-bone-identity-closure.json').nameConflict.authoritativeName.value).toBeNull();
    expect(fields.filter((f: any) => f.category === 'SOURCE_PRECEDENCE_UNRESOLVED').every((f: any) => f.rulingId === r.ruleId && f.authority === 'PROJECT_RULING')).toBe(true);
  });
  it('captain-single-unit / captain-not-skill-summon: narrow/full binding stays project-only', () => {
    const r = rule('NECRO_CAPTAIN_PROJECT_COMPONENT_BINDING');
    expect(r.projectDecision).toMatchObject({ bindingKind:'PROJECT_COMPONENT_BINDING', artworkCardId:46111, combatCardId:46600,
      runtimeUnitCount:1, componentIdentityMerge:false, size:'LARGE', occupiedSlots:2, ordinarySkillSummonEligible:false });
    expect(r.affectedLevels).toEqual([2]); expect(r.affectedCards).toEqual([42004]);
    expect(new Set(r.projectDecision.bindings.map((b: any) => b.physicalIdentity)).size).toBe(2);
  });
  it('reanimation-event-order: casualties are finalized before explicit fresh respawn', () => {
    const d = rule('NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER').projectDecision;
    expect(d.sequence).toHaveLength(8);
    expect(d.sequence.indexOf('REMOVE_DYING_MINIATURES_STANCE_CARDS_AND_INSTANCE_INITIATIVE')).toBeLessThan(d.sequence.indexOf('RESPAWN_IMMEDIATELY_AS_NEW_RUNTIME_INSTANCE'));
    expect(d.sequence.indexOf('CHOOSE_AND_CONSUME_FIRST_ELIGIBLE_NON_LARGE_DEATH')).toBeLessThan(d.sequence.indexOf('CHECK_SOURCE_SPECIFIC_CORRESPONDING_AREA_SPACE'));
    expect(d.deathFinalBeforeTrigger && d.removeMiniatureBeforeRespawn && d.removeCardBeforeRespawn).toBe(true);
  });
  it('fresh-instance / initiative-not-inherited: same physical token does not preserve old activation', () => {
    const d = rule('NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER').projectDecision;
    expect(d).toMatchObject({ samePhysicalIdentity:true, sameRuntimeInstance:false, treatedAsNewSpawn:true, initiativeRetained:false });
    expect(d.newInstanceState).toContain('Full printed Life'); expect(d.initiativePolicy).toContain('one newly shuffled initiative');
    const f = fields.find((f: any) => f.fieldId.endsWith('reanimation-order-contract.json:/order/initiativeRetained'));
    expect(f.value).toBe(false); expect(f.authority).toBe('PROJECT_RULING');
  });
  it('reanimation-token-transfer: resurrects selected spent token without ordinary refund or extra copy', () => {
    expect(supplyOracle(['SPENT','AVAILABLE'],'REANIMATE',0)).toEqual(['ACTIVE','AVAILABLE']);
    expect(() => supplyOracle(['PERMANENTLY_REMOVED'],'REANIMATE',0)).toThrow();
    expect(supplyOracle(['SPENT'],'REANIMATE',0,false)).toEqual(['SPENT']);
  });
  it('simultaneous-death-choice: chooses captured non-large candidate explicitly', () => {
    const r = rule('NECRO_SIMULTANEOUS_FIRST_DEATH_PLAYER_CHOICE');
    expect(r.projectDecision.candidateScope).toContain('same atomic death window'); expect(r.playerVisible).toBe(true);
    expect(choiceOracle(['instance-4','instance-2'])).toMatchObject({ state:'CHOICE_REQUIRED' });
    expect(choiceOracle(['instance-2','instance-4'],'instance-4').chosenId).toBe('instance-4');
    expect(fields.find((f: any) => f.fieldId.endsWith('/order/simultaneousFirstDeath')).rulingId).toBe(r.ruleId);
  });
  it('nested-death-window: reentrant callbacks cannot steal first window and unordered dying effects require choice', () => {
    const d = rule('NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER').projectDecision;
    expect(d.reentrantDeaths).toContain('lock the earliest eligible death window'); expect(d.onDeathOrder).toContain('player chooses');
    expect(d.firstDeathPolicy).toContain('consume even'); expect(d.battleTerminationPriority).toContain('cancel pending Reanimation');
  });
  it('nearest-area-choice: nearest legal ties remain player-controlled under topology permutations', () => {
    const room = { a:['b','c'], b:['a','d'], c:['a','d'], d:['b','c'] };
    const free = { a:0,b:1,c:1,d:2 };
    expect(nearestAreaOracle(room,'a',free,1)).toEqual({ state:'CHOICE_REQUIRED', candidateIds:['b','c'] });
    expect(nearestAreaOracle({ a:['c','b'],c:['d','a'],d:['c','b'],b:['d','a'] },'a',free,1)).toEqual(nearestAreaOracle(room,'a',free,1));
    expect(nearestAreaOracle(room,'a',free,1,'c').chosenId).toBe('c');
  });
  it('large-displacement-size: nearest Area with insufficient capacity is ineligible', () => {
    const room = { a:['b'], b:['a','c'], c:['b'] };
    expect(nearestAreaOracle(room,'a',{a:0,b:1,c:2},2)).toMatchObject({ state:'SELECTED',chosenId:'c' });
    expect(rule('NECRO_ROOM_CAPACITY_DISPLACEMENT_OR_SUPPRESS').projectDecision.legalDestination).toContain('Large size');
  });
  it('room-no-space-suppress / full-stance-suppress: no unit replacement or resource commit', () => {
    expect(nearestAreaOracle({a:['b'],b:['a']},'a',{a:0,b:0},1)).toEqual({state:'SUPPRESS_SUMMON',candidateIds:[]});
    expect(countOracle(1,3,true)).toBe(0);
    expect(rule('NECRO_ROOM_CAPACITY_DISPLACEMENT_OR_SUPPRESS').projectDecision).toMatchObject({ noLegalPlacement:'SUPPRESS_SUMMON',
      replaceExistingUnit:false, stanceReplacement:false, noFeasibleDisplacement:'SUPPRESS_SUMMON' });
  });
  it('reanimation-no-space: specific corresponding-Area ignore never becomes generic displacement', () => {
    const d = rule('NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER').projectDecision;
    expect(d.noSpace).toBe('IGNORE_REANIMATION_WITHOUT_DISPLACEMENT'); expect(d.genericSummonAreaFallbackApplies).toBe(false);
    expect(rule('NECRO_ROOM_CAPACITY_DISPLACEMENT_OR_SUPPRESS').projectDecision.reanimationOverride).toContain('Do not apply displacement');
    expect(load('c1c26-necromancer-reanimation-order-contract.json').trigger.value).toContain('ignore if no space');
  });
  it('boss-cleanup-reset: trio returns to encounter storage while source-bound Room cleanup remains', () => {
    const d = rule('NECRO_BOSS_TRIO_ENCOUNTER_STORAGE_RESET').projectDecision;
    expect(d.destinations).toEqual({bossIdentity:'BOSS_ENCOUNTER_STORAGE',threatAbility:'BOSS_ENCOUNTER_STORAGE',bossBattle:'BOSS_ENCOUNTER_STORAGE'});
    expect(d).toMatchObject({threatAbilitySide:'THREAT',temporaryMarkers:'CLEAR',runtimeState:'DISCARD',pendingChoice:'CANCEL',campaignPersistentBossCardState:false});
    expect(d.roomCard).toBe('USE_OFFICIAL_DUNGEON_DISCARD_THEN_HAMLET_DECK_RETURN');
    expect(load('c1c27-necromancer-cleanup-destination-closure.json').destinations.roomCard.status).toBe('BOUND');
  });
  it('separates canonical 0/9 from executable 9/9 and leaves runtime/Ready unimplemented', () => {
    const matrix = get('executable-completeness-matrix');
    expect(matrix.totals).toEqual({physical:9,literalComplete:9,canonicalSemanticComplete:0,executableSemanticComplete:9,runtimeEligibleForFoundation:9,productionReady:0});
    expect(matrix.cards.every((c: any) => !c.canonicalSemanticComplete && c.executableSemanticComplete && !c.runtimeImplemented && !c.productionReady)).toBe(true);
    expect(decision).toMatchObject({runtimeFoundationAllowed:true,canonicalPromotion:false,productionReadyGain:0,gameplayImplementationAllowedThisPhase:false});
  });
  it('recomputes matrix and decision from field reachability and rejects null/missing execution paths', () => {
    const matrix = deriveMatrix(fields,rules,graph); expect(get('executable-completeness-matrix')).toMatchObject(matrix);
    expect(decision).toMatchObject(deriveDecision(matrix,fields,rules,graph));
    const missing = fields.slice(1); expect(deriveDecision(deriveMatrix(missing,rules,graph),missing,rules,graph).runtimeFoundationAllowed).toBe(false);
    const broken = structuredClone(fields); broken[0].value = null;
    expect(deriveDecision(deriveMatrix(broken,rules,graph),broken,rules,graph).outcome).toBe('NECROMANCER_RULING_REVIEW_REQUIRED');
    expect(fields.every((f: any) => nullPaths(f.value).length === 0)).toBe(true);
  });
  it('requires public player-choice contract before foundation selection', () => {
    const broken = structuredClone(rules); broken[0].playerVisible = false;
    expect(deriveDecision(deriveMatrix(fields,broken,graph),fields,broken,graph).runtimeFoundationAllowed).toBe(false);
    expect(get('runtime-readiness-matrix').runtimeAndUiImplementationPending).toBe(true);
  });
  it('keeps HIGH risk rulings in risk matrix with dedicated test obligations', () => {
    const risk = get('ruling-risk-matrix'); expect(risk.balanceValidated).toBe(false);
    const testSource = readFileSync('src/audit/c1c28-necromancer-project-rulings.test.ts','utf8');
    for (const r of rules) {
      const row = risk.rulings.find((v: any) => v.ruleId === r.ruleId); expect(row.riskLevel).toBe(r.riskLevel);
      expect(row.testObligations).toEqual(r.testObligations);
      for (const id of row.testObligations) expect(testSource).toContain(/^count-level-[123]$/.test(id) ? 'count-level-${level}' : id);
    }
    expect(rule('NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER').riskLevel).toBe('HIGH_GAMEPLAY_IMPACT');
    expect(rule('NECRO_ROOM_CAPACITY_DISPLACEMENT_OR_SUPPRESS').riskLevel).toBe('MEDIUM_RULE_INTERPRETATION');
  });
  it('preserves historical ruling/version and explicit migration metadata for future official overrides', () => {
    expect(get('project-rulings').overridePolicy.ifNewAuthoritativeSource).toEqual({preserveHistoricalRuling:true,createMigrationReview:true,doNotSilentlyChangeCampaignState:true});
    expect(get('project-rulings').overridePolicy.pinCampaignToRulingSetVersion).toBe(true);
    expect(rules.every((r: any) => r.rulingSetVersion === 'C1C28-DIGITAL-DEFAULT-v1' && r.futureOverrideAllowed)).toBe(true);
  });
  it('defines House/Strict/Custom schemas without enabling new gameplay/settings modes', () => {
    expect(get('project-rulings').authorityLayers).toEqual(['OFFICIAL_SOURCE','SOURCE_UNRESOLVED','PROJECT_RULING','HOUSE_RULE_OPTIONAL']);
    expect(get('project-rulings').optionalHouseRuleSchema).toMatchObject({authority:'HOUSE_RULE_OPTIONAL',canonical:false,enabledByDefault:false,implemented:false});
    expect(get('project-rulings').defaultMode).toBe('DIGITAL_DEFAULT'); expect(Object.keys(get('project-rulings').futureModes)).toEqual(['STRICT_SOURCE','DIGITAL_DEFAULT','CUSTOM']);
  });
  it('C1C28 scope guard freezes gameplay, canonical history, other families and tooling', () => {
    for (const p of ['src/game-engine/necromancer/necromancer.ts','src/data/bosses/necromancer-family.ts','src/components/Boss.tsx',
      'src/data/bosses/prophet-family.ts','vite.config.ts','docs/data/complete-edition/c1c27-necromancer-source-exhaustion-register.json']) expect(() => verifyScope([p])).toThrow();
    expect(() => verifyScope(['scripts/audit/c1c28-contract.ts','src/audit/c1c28-necromancer-project-rulings.test.ts'])).not.toThrow();
    expect(() => verifyBaselineAndScope()).not.toThrow();
  });
  it('detects source promotion, coverage/risk drift and counterfeit foundation decisions', () => {
    for (const [name,fn] of [
      ['c1c28-necromancer-terminal-source-blockers.json',(v: any) => { v.categories[0].canonicalOfficialResolved = true; }],
      ['c1c28-necromancer-runtime-semantic-contract.json',(v: any) => { v.fields[0].value = null; }],
      ['c1c28-necromancer-ruling-risk-matrix.json',(v: any) => { v.rulings[2].riskLevel = 'LOW_RISK_DETERMINISM'; }],
      ['c1c28-necromancer-executable-completeness-matrix.json',(v: any) => { v.totals.canonicalSemanticComplete = 9; }],
      ['c1c28-next-workstream-decision.json',(v: any) => { v.canonicalPromotion = true; }],
    ] as [string,(v: any)=>void][]) expect(() => validateArtifacts(mutate(name,fn))).toThrow();
  });
  it('is deterministic, offline and scoped to audit rather than production runtime', () => {
    expect(buildRulings()).toEqual(rules); expect(buildBindings(rules)).toEqual(fields); expect(buildArtifacts()).toEqual(a);
    expect(() => validateArtifacts(Object.fromEntries(Object.keys(a).map(n => [n,JSON.parse(readFileSync(root+n,'utf8'))])))).not.toThrow();
    const code = readFileSync('scripts/audit/c1c28-contract.ts','utf8');
    expect(code).not.toMatch(/\bfetch\s*\(|new Date\(|from\s+['"][^'"]*game-engine|https\.request/);
  });
  it('preserves upstream acceptance counts and historical validation limits', () => {
    expect(load('c1c26-necromancer-frozen-baseline-contracts.json').upstreamCounts).toEqual({trinket:'15/37',quest:'3/75',census:278,
      hamletEvent:'16 literal / 5 local semantic / 0 Ready',boss:'231 / 20 families',Battle:114,Threat:51,AbilityExclusive:12,Identity:54});
    expect(load('c1c27-necromancer-semantic-completeness-matrix.json').totals).toMatchObject({literalComplete:9,familySemanticComplete:0,productionReady:0});
    expect(load('c1c25-necromancer-source-manifest.json').historicalE2EFailures).toBeDefined();
  });
});
