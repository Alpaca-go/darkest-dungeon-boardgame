import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { SKILLS, getSkillById } from '../../src/data/skills';
import { normalizeHeroSkill } from '../../src/game-engine/battle';
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_1_TRINKET_CENSUS, LEVEL_1_TRINKET_DECK_COVERAGE } from '../../src/audit/level1-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { LEVEL_3_TRINKET_DECK_COVERAGE } from '../../src/audit/level3-trinket-deck';
import { RUNTIME_WINDOW_BINDINGS } from '../../src/audit/trinket-semantic-coverage';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';
import { getTrinketPoolByLevel, runtimeContentContext } from '../../src/data/content-selector';
import { createNewCampaign } from '../../src/game-engine/campaign';
import { ALL_TRINKETS } from '../../src/data/trinkets/trinket-registry';
import { ALL_DISEASES } from '../../src/data/diseases';
import { NEGATIVE_QUIRKS, POSITIVE_QUIRKS } from '../../src/data/quirks';

export const baselineHead = '73da3ae9d0fae07b35fcde23daa6856acdbc514a';
export const baselineTree = '57525fad7e2897cfcb321c013112fdc6d99a6251';
export const c1c17Implementation = 'e7f4b4a94940ebc714301912a93f7fc9a173fd93';
export const official = 'docs/DD_EN_COREBOX_RULES.pdf';
export const officialHash = '9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae';
export const verdict = 'C1C19-HERO-CAUSED-CONDITION-SOURCE-EXHAUSTED-STILL-UNRESOLVED';
export const ids = ['bleed', 'blight', 'debuff', 'stun'].map(c => `community-trinket-core-${c}-charm`);
export const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
// Git may store LF while an existing Windows checkout contains CRLF. Historical
// JSON/card/PDF evidence stays byte-exact; TypeScript comparisons follow Git's LF form.
export const frozenHash = (path: string, bytes: Buffer) => sha(path.startsWith('src/') && path.endsWith('.ts') ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes);
export const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const read = (path: string) => readFileSync(path, 'utf8');
const json = (path: string) => JSON.parse(read(path));
export const tracked = (...prefixes: string[]) => git('ls-tree', '-r', '--name-only', baselineHead, '--', ...prefixes).split(/\r?\n/).filter(Boolean);
const baselineHashes = (paths: string[]) => Object.fromEntries([...new Set(paths)].sort().map(path => [path, frozenHash(path, execFileSync('git', ['show', `${baselineHead}:${path}`], { maxBuffer: 64 * 1024 * 1024 }))]));
const meta = { schemaVersion: 1, phase: '11A.4-C1C-19', baselineHead, baselineTree, c1c17Implementation };
const scopeTypes = ['bleed', 'blight', 'stun', 'debuff', 'mark', 'buff'];
const conditionAPIs = ['applyStatusEffectEvent', 'applyEffectsWithResistance', 'applyEffects', 'applyEffectToUnit', 'applyConditionToHero', 'writeConditionLayers', 'withDuration', 'withCommunityBattleUnitEffect'];

export function productionConditionCalls() {
  return tracked('src/game-engine').filter(p => /\.ts$/.test(p) && !/\.(test|spec)\.ts$/.test(p)).flatMap(path => {
    const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
    const rows: Array<Record<string, unknown>> = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && conditionAPIs.includes(node.expression.text)) {
        let parent: ts.Node | undefined = node.parent;
        while (parent && !ts.isFunctionDeclaration(parent)) parent = parent.parent;
        const fn = parent && ts.isFunctionDeclaration(parent) ? parent.name?.text ?? 'anonymous' : 'module';
        const caller = `${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`;
        const classification = path.endsWith('/status-effects.ts') ? 'SHARED_CONSUMER_INTERNAL'
          : fn === 'heroUseSkill' ? 'HERO_SKILL'
          : path.includes('/trinkets/') ? 'ACTIVE_HERO_TRINKET; self-target only today'
          : path.endsWith('/quirks.ts') ? 'PASSIVE_DERIVED; attribution to a causing Hero not established'
          : fn === 'applyCommunityFinalHeroSkill' ? 'ENCOUNTER_REACTION_TO_HERO_ATTACK; actor causing condition is not automatically the Hero'
          : 'ENEMY_OR_ENCOUNTER_CONDITION; not an ordinary Hero skill';
        rows.push({ caller, containingFunction: fn, primitive: node.expression.text,
          arguments: node.arguments.map(a => a.getText(file)), classification, fileSha256: sha(readFileSync(path)),
          activeHeroCausesConditionWindow: false, pendingConditionTransaction: false });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return rows;
  });
}

export function heroSkillCensus() {
  const manifest = json('docs/data/core-campaign/manifest.json');
  const manifestRows: any[] = Array.isArray(manifest) ? manifest : manifest.heroSkills ?? manifest.entries ?? manifest.records ?? manifest.items ?? [];
  const skills = SKILLS.map(skill => {
    const normalized = normalizeHeroSkill(skill);
    const entry = manifestRows.find(e => e.category === 'heroSkills' && e.id === skill.id);
    return { skillId: skill.id, heroId: skill.heroId, kind: skill.kind, declaredTargetSide: skill.targetSide ?? null,
      effectiveTargetSide: normalized.targetSide ?? null, lookupMatchesLiveRegistry: getSkillById(skill.id) === skill,
      productionLookup: 'src/data/skills.ts::getSkillById -> SKILLS; all content profiles use battle.ts::heroUseSkill',
      sourceProvenance: { sourceFile: 'src/data/skills.ts', sourceReference: null, authoritativeCardDuration: null,
        manifestOfficialDataStatus: entry?.officialDataStatus ?? null, manifestMissingFields: entry?.missingFields ?? ['sourceReference'],
        skillLevelRegistry: 'Lv1 verified label is not a card/page binding; Lv2/3 prototype damage/heal bonuses contain no durations' },
      effects: (skill.applyEffects ?? []).map((effect, index) => ({ effectIndex: index, condition: effect.type,
        amount: effect.amount, durationTurns: effect.durationTurns ?? null, runtimeDuration: effect.durationTurns ?? null,
        sourceDuration: null, sourceReference: null, status: effect.durationTurns === undefined ? 'LEGACY_DURATION_UNRESOLVED' : 'RUNTIME_DURATION_PRESENT_SOURCE_BINDING_UNPROVEN',
        observedLegacyRuntime: effect.durationTurns === undefined
          ? 'No declared duration; bleed/blight layer amount decays each turn, stun amount is a skip counter; categorical branch may use amount as fallback. These code behaviors are not sourceDuration.' : null,
        targetSemantics: normalized.targetSide === 'enemy' ? 'frozen skill target; hit -> damage -> if alive applyStatusEffectEvent'
          : 'self/ally chosen skill target; current code applyEffects directly (no resistance event)',
        durationInferenceForbidden: 'duration must not be copied from amount' })),
    };
  });
  const conditions = skills.flatMap(skill => skill.effects.map(effect => ({ skillId: skill.skillId, heroId: skill.heroId,
    targetSide: skill.effectiveTargetSide, ...effect, sourceProvenance: skill.sourceProvenance })));
  const gaps = conditions.filter(c => c.durationTurns === null).map(c => ({ ...c, status: 'SOURCE_DURATION_UNRESOLVED',
    runtimeInputStatus: 'LEGACY_DURATION_UNRESOLVED', reconstructionAuthorized: false }));
  return { skills, conditions, gaps };
}

export function buildContracts() {
  const extraction = json('docs/data/complete-edition/c1c19-rulebook-extracted-evidence.json');
  const rawCards: any[] = json('src/data/community-reference/trinkets/data.json');
  const literalRows: any[] = json('docs/data/complete-edition/trinkets/community-trinket-source-evidence.json').records;
  const cardProof = (card: any) => {
    const literal = literalRows.find(r => r.definitionId === card.id);
    return { definitionId: card.id, sourceReferences: card.sourceReferences, sourceStatus: card.sourceStatus,
      unresolvedFields: card.unresolvedFields, positive: card.positiveSide, negative: card.negativeSide,
      literalPositive: literal.positiveSide.printedText, literalNegative: literal.negativeSide.printedText,
      visualEvidence: ['positive', 'negative'].map(side => {
        const leaf = card.leafProvenance[`${side}Side.trigger`];
        return { side, assetPath: leaf.assetPath, recordedAssetSha256: leaf.assetSha256,
          actualAssetSha256: sha(readFileSync(leaf.assetPath)), region: leaf.region };
      }) };
  };
  const cards = ids.map(id => cardProof(rawCards.find(c => c.id === id)));
  const heroCausesGrammar = rawCards.filter(c => [c.positiveSide, c.negativeSide].some(s => s.trigger === 'hero-causes-condition')).map(cardProof);
  const allConditionTrinketSources = rawCards.flatMap(card => ['positive', 'negative'].flatMap(side => {
    const payload = card[`${side}Side`];
    return payload.effects.flatMap((effect: any, effectIndex: number) => /condition/.test(effect.kind)
      ? [{ definitionId: card.id, side, effectIndex, trigger: payload.trigger, target: payload.target, effect,
        sourceReferences: card.sourceReferences, runtimeAdapterExists: Boolean(COMMUNITY_TRINKET_RUNTIME_ADAPTERS[card.id]) }] : []);
  }));
  const fact = (factId: string, page: number, region: string, requiredText: string[], semanticFact: string) => ({
    factId, source: official, sourceSha256: officialHash, page, region, requiredText, semanticFact,
    bboxPoints: extraction.pages[page - 1].regions.find((r: any) => r.region === region).bboxPoints,
  });
  const facts = [
    fact('SKILL_TARGET_EFFECTS_ORDER', 20, 'left-column', ['take place after any other effects', 'only if the Skill hits'], 'Printed Skill Target Effects take place after the Skill\'s other effects and only if it hits. This does not explicitly locate an additional Trinket condition or its active declaration.'),
    fact('SKILL_SELF_EFFECTS_EXCEPTION', 20, 'left-column', ['take place before any other effects', 'Self Effects ignore Resistances'], 'Printed Skill Self Effects precede other Skill effects regardless of hit/miss and ignore resistance/immunity. Do not generalize this to Charm skill-target effects.'),
    fact('DURATION_COUNTS_TOKENS', 20, 'right-column', ['as many tokens as its turn duration'], 'A timed Condition creates a stack with token count given by turn duration, not magnitude.'),
    fact('INDEPENDENT_REPEATED_STACKS', 20, 'right-column', ['just make a new stack', 'multiple Buffs, Debuffs'], 'Applying an existing Condition makes another separate stack; multiple Buff and Debuff stacks coexist, rather than refreshing/merging.'),
    fact('TARGET_TURN_STACK_TICK', 20, 'right-column', ['At the start of the character', 'remove the top token of each stack'], 'At the affected character\'s turn start, remove the top token of every stack and apply its effects, if any.'),
    fact('SIMULTANEOUS_WOUND_CONDITIONS', 20, 'right-column', ['Bleed and Blight', 'do so at the same time'], 'Wounding Conditions resolve simultaneously; this does not prove all new conditions are a single creation/declaration batch.'),
    fact('BLEED_MAGNITUDE_DURATION', 21, 'left-column', ['tokens equal to the rounds', 'number indicated on the token'], 'Bleed potency determines Wounds per tick; duration determines tokens/rounds. They are independent. Blight follows the same model.'),
    fact('STUN_TURN_EFFECT', 21, 'left-column', ['Stun xt', 'Heroes lose one action'], 'Stun token duration is independent of amount; at turn start removal causes Heroes to lose an action, Monsters their turn. C1C9 skip runtime must not be generalized as a source rule for all stacks.'),
    fact('DEBUFF_STACK_RULE', 21, 'left-column', ['Debuff xt', 'stack of x Debuff tokens', 'Characters targeting a debuffed enemy gain', 'against them per stack'], 'Debuff is a timed Condition. Each independent stack lasts its token duration and grants attackers a Crit bonus per stack while present; token exhaustion leaves no active stack. The last inference follows the stack construction, not an explicit Charm-zero rule.'),
    fact('MARK_BUFF_CATALOGUE', 21, 'left-column', ['Buff xt', 'Mark xt'], 'Buff and Mark are timed Conditions; a generic a-Condition instruction has no same-named-condition restriction.'),
    fact('OTHER_TIMED_CONDITIONS', 21, 'left-column', ['Riposte xt', 'Guard xt'], 'Riposte and Guard also have timed stacks; the Negative is not source-limited to the four Charm names.'),
    fact('PROTECTION_TIMED_CONDITION', 21, 'right-column', ['Protection', 'Protection stacks'], 'Protection also uses duration stacks. The current status type catalogue does not represent it as an ActiveEffect.'),
    fact('CATEGORICAL_RESISTANCE_IMMUNITY', 21, 'right-column', ['Resistance reduces the', 'duration of the Condition by 1 turn', 'immunity negates the'], 'Official categorical Resistance reduces turn duration by one; immunity negates the effect. This gives no Charm declaration ordering or percentage roll rule.'),
    fact('ACTIVE_TRINKET_ONCE_PER_TURN', 26, 'left-column', ['they declare the use', 'only once', 'per turn'], 'Trinkets are active declarations that resolve and flip; each physical Trinket can be used once per battle turn.'),
  ];
  const census = heroSkillCensus();
  const liveTrinketConditionProducers = ALL_TRINKETS.flatMap(card => ['positive', 'negative'].flatMap(side => {
    const payload = side === 'positive' ? card.positiveSide : card.negativeSide;
    return payload.effects.flatMap((effect, effectIndex) => /condition/.test(effect.type) ? [{ definitionId: card.id, side, effectIndex,
      effect, useWindows: payload.useWindows, causingHeroAttribution: 'active declaring Hero is known; exact hero-causes-condition eligibility for a Trinket-created condition is unproven' }] : []);
  }));
  const passiveConditionProducers = [...NEGATIVE_QUIRKS, ...POSITIVE_QUIRKS, ...ALL_DISEASES].flatMap(definition => (definition.reactions ?? []).flatMap((reaction, reactionIndex) => reaction.effects.flatMap((effect, effectIndex) => effect.type === 'condition-self'
    ? [{ definitionId: definition.id, reactionIndex, effectIndex, trigger: reaction.eventType, effect,
      causingHeroAttribution: 'not established; effect recipient is not automatically the causing Hero', durationConsumer: 'logged but not persisted by applyConditionToHero' }] : [])));
  const sourceContract = { ...meta, cards, facts, heroCausesGrammar, allConditionTrinketSources,
    positive: { sourceTrigger: 'hero-skill-hits', sourceTarget: 'skill-target', targetComplete: true,
      targetIdentity: 'actual skill targetUnitId, never retargeted after declaration', requiresFrozenSuccessfulHit: true,
      existingWindow: 'before-damage-applied', existingBinding: RUNTIME_WINDOW_BINDINGS['before-damage-applied'],
      exactTargetMatch: false, exactInsertionPoint: null, timingStatus: 'SOURCE_UNRESOLVED',
      damageConditionOrdering: null, normalSkillConditionBatchMembership: null, deadTargetApplicable: null,
      deadTargetRuntimePolicy: 'FAIL_CLOSED; shared event rejects unavailable target; this is not proof of official survive-only timing',
      evaluatedAlternatives: ['hit confirmed before damage', 'damage committed before normal conditions', 'same creation batch as normal conditions', 'other source-backed timing'],
      selectedAlternative: null, normalSkillTargetEffectOrderingEvidence: 'SKILL_TARGET_EFFECTS_ORDER; not a card-specific declaration binding' },
    negative: { sourceTrigger: 'hero-causes-condition', sourceTarget: 'condition-being-caused', negativeDelta: -1,
      modifies: 'duration only', sameNamedConditionOnly: false, singularCondition: true, appliesToAllConditionsWithOneUse: false,
      scope: 'Any timed Condition actually caused by the declaring Hero; attribution and exact applicability are unproven',
      auditedConditionTypes: scopeTypes, otherOfficialTimedConditions: ['riposte', 'guard', 'protection'],
      instantConditions: { examples: ['shuffle', 'stress'], durationDeltaInterpretation: null, policy: 'UNRESOLVED_FAIL_CLOSED; no turn duration to shorten is inferred' },
      insertionPoint: null, percentageResistanceOrdering: null, categoricalResistanceOrdering: null, immunityOrdering: null,
      resistedConditionCountsAsCaused: null, sourceTimingStatus: 'SOURCE_UNRESOLVED',
      scopeRuntimeStatus: 'RUNTIME_SCOPE_PARTIAL', nonSkillHeroConditionAttribution: null,
      additionalCharmConditionCountsAsHeroCaused: null, multiConditionOpportunitySelection: null,
      applicabilityPolicy: 'No speculative window; miss, absent independent duration, dead target or unresolved resisted/immune/cancelled case fails closed' },
    physicalCards: { samePhysicalCardSameBattleTurnDoubleUse: false, sourceFact: 'ACTIVE_TRINKET_ONCE_PER_TURN',
      recursionAllowed: false, runtimeUsedTurnIdConsumer: 'src/game-engine/trinkets/use-trinket.ts:77',
      proposedProcessedInstancePolicy: 'Persist one shared root exclusion set; do not reopen a used/processed instance after flip or reload',
      processedRootPolicyIsSourceTimingProof: false, differentCopiesAllowedByTurnLimit: true,
      declineConsumesTurnUse: false, declinedInstanceLaterChildEligibility: null,
      differentCopiesOrdering: null, additionalConditionNestedRootOrdering: null,
      futureRequirement: 'Keep distinct physical instance ids, shared root and authoritative dynamic re-evaluation; exact order remains gated' },
    resolutionStatus: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', outcome: 'C', terminalVerdict: verdict,
    researchScope: 'Directly searched all 44 bundled core-rulebook pages. Reviewed generic Skill Target/Self rules, timed stacks, categorical resistance, immunity, trinkets, derived conditions and turn-start rules; no exact hero-causes-condition active ordering found.',
    searchedTerms: extraction.searchedTerms,
  };
  const durationContract = { ...meta, negativeDelta: -1, modifies: 'duration', magnitudeModified: false,
    baseMagnitude: 'independent source amount; null remains null for Debuff/Stun', baseDuration: 'independent source turns; never amount',
    effectiveMagnitude: 'unchanged from baseMagnitude', effectiveDuration: null, minimumDuration: null,
    nonNegativeRuntimeInvariant: true, sourceFloorRule: null, arithmeticOneTurnMinusOne: 0,
    zeroDurationApplication: null, zeroDurationStatus: 'SOURCE_UNRESOLVED',
    zeroTokensInference: 'Token-count rule suggests no lasting stack at zero; it does not specify cancellation vs immediate expiry or declaration/Use/block records',
    clampProposal: { expression: 'max(0, baseDuration - 1)', sourceProven: false, implemented: false },
    categoricalResistanceInteraction: { sourceDelta: -1, orderRelativeToCharm: null,
      numericOutcomeCommutative: true, conditionalArithmeticOnly: 'If both are accepted independent -1 duration operations with floor 0, both orders yield max(0, baseDuration-2). Not proof of applicability or records.',
      logOrdering: null, blockedRecordPolicy: null, useRecordPolicy: null, zeroCancellationPolicy: null },
    percentageResistanceInteraction: { existingRuntime: 'd100 for bleed/blight/stun; full block on roll <= percentage', officialSourceProven: false,
      orderRelativeToCharm: null, resistedConditionCountsAsCaused: null, rollBeforeDeclaration: null },
    immunityInteraction: { officialMeaning: 'negates effect', orderRelativeToCharm: null, immuneConditionCountsAsCaused: null },
    semanticAmountNullPolicy: 'C1C9 consumer may use auxiliary runtime amount=1; source semantic comparator must preserve null, never derive duration',
    positiveSharedPipelineInvariant: 'Any future Charm condition uses applyStatusEffectEvent/shared resistance path; no immunity/resistance bypass. Existing target/type gaps must first be closed.',
    sourceStatus: 'PARTIALLY_SOURCE_BOUND', modifierLifecycleStatus: 'SOURCE_UNRESOLVED' };
  const debuff = { ...meta, condition: 'debuff', isCondition: true, sourceDurationRepresentation: 'one independent stack of 2 Debuff tokens for 2t',
    turnTick: 'affected target unit turn start; remove top token of each independent stack', expiration: 'stack exhaustion; remove empty stack; no stack means no per-stack Crit bonus',
    expirationEvidenceKind: 'DERIVED_FROM_EXPLICIT_TOKEN_STACK_AND_PER_STACK_RULES', multipleCoexistingStacks: true, sameDebuffPolicy: 'NEW_INDEPENDENT_STACK_NOT_REFRESH',
    sourceResistance: 'categorical Condition duration -1 / immunity negates', charmResistanceOrdering: null, zeroDurationApplication: null,
    sourceDurationStatus: 'SOURCE_BOUND', durationModifierLifecycleStatus: 'SOURCE_UNRESOLVED',
    runtimeStatus: 'NOT_IMPLEMENTED', runtimeIndependentStacks: false, runtimeTurnTick: false, runtimeExpiration: false,
    runtimePercentDebuffResistanceConsumer: false, runtimeCategoricalDebuffResistanceConsumer: false,
    gaps: ['StatusEffectType/conditionDurations/categoricalResistances lack debuff', 'ActiveEffect debuff array append skips duration bookkeeping', 'RESIST_KEY_BY_EFFECT omits debuff although HeroResistanceProfile has a debuff field', 'No buff/debuff turn tick or expiry removal', 'No independent per-condition timed stack model'],
    evidence: ['DURATION_COUNTS_TOKENS', 'INDEPENDENT_REPEATED_STACKS', 'TARGET_TURN_STACK_TICK', 'DEBUFF_STACK_RULE', 'CATEGORICAL_RESISTANCE_IMMUNITY'] };
  const transaction = { ...meta, name: 'ConditionTransaction', implemented: false, designStatus: 'SOURCE_GATED_DESIGN_ONLY',
    fields: ['rootEventId', 'conditionEventId', 'sourceHeroId', 'sourceBattleUnitId', 'sourceSkillId', 'targetUnitId', 'conditionType', 'baseMagnitude', 'baseDuration', 'effectiveMagnitude', 'effectiveDuration', 'resistanceOutcome', 'sourceEventId'],
    fieldMeaning: { rootEventId: 'stable shared causing action identity; not new RNG on decision', conditionEventId: 'stable target/effect identity; avoids applying one Use to every effect',
      sourceHeroId: 'authoritative causing campaign Hero, not the recipient by default', sourceBattleUnitId: 'actual acting Hero unit',
      sourceSkillId: 'source Skill, or explicit other-source attribution if that scope is proven', targetUnitId: 'original actual target, immutable on Use/Decline/reload',
      baseMagnitude: 'source amount, may be null; separate from duration', baseDuration: 'only authoritative independently bound source turns',
      effectiveMagnitude: 'unchanged by duration modifier', effectiveDuration: 'source-bound duration changes only; unresolved ordering cannot run',
      resistanceOutcome: 'not-rolled or frozen original roll/outcome/immunity/categorical decision, including provenance', sourceEventId: 'stable original cause transaction identity' },
    proposedGranularity: 'Conditional design: one causing-action root with one child per actual target/Condition; adoption requires source-backed declaration/selection ordering',
    sourceAuthorizesChildOpportunityOrder: false, declarationStage: null, resistanceStageOrder: null,
    invariant: ['No positive on miss', 'No negative from mere applyEffects presence on a miss', 'No duration=amount', 'No negative duration enters runtime',
      'No retarget after decision', 'One Use binds one selected Condition, never all skill effects', 'Distinct physical copies share root state',
      'Persist processed physical instances and Use/Decline decisions', 'Persist already rolled resistance; never reroll on reload', 'UI reads authoritative pending transaction'],
    rngPolicy: { declarationRelativeToResistance: null, alreadyRolledValueMustPersist: true, mayRerollOnReload: false },
    currentRuntimeCandidate: 'PendingBattleAction freezes hit/crit/baseDamage/target; statusEffectEvents persists completed effects/blocked results, but neither is a pending attributed Condition declaration transaction',
    activeContinuation: 'Future only: freeze -> engine opportunity -> Use/Decline -> commit/resume exactly once; exact commit point unresolved' };
  const surface = { ...meta, skillCount: census.skills.length, skills: census.skills, conditionCount: census.conditions.length,
    heroSkillConditions: census.conditions, legacyDurationGapCount: census.gaps.length, conditionCallsites: productionConditionCalls(),
    conditionScopeCounts: Object.fromEntries(scopeTypes.map(type => [type, census.conditions.filter(c => c.condition === type).length])),
    multipleConditionsInLiveSkills: census.skills.filter(s => s.effects.length > 1).map(s => s.skillId),
    sourceGrammarInventory: heroCausesGrammar.map(c => c.definitionId), allConditionTrinketSources,
    liveTrinketConditionProducers, passiveConditionProducers,
    skillLookupAudit: 'SKILLS is the only Hero SkillDefinition lookup; skill-level registry adds damage/heal bonuses, not applyEffects or independent duration. Encounter hero-skill wrapper delegates to heroUseSkill.',
    pipelines: { enemyTargetHeroSkill: 'heroUseSkill -> hit -> applyBattleUnitDamage -> if target.isAlive applyStatusEffectEvent -> applyEffectsWithResistance',
      allySelfHeroSkill: 'heroUseSkill -> heal/stress -> applyEffects directly; currently no listed ally/self applyEffects in SKILLS',
      trinketCondition: 'use-trinket apply-condition-stack resolves equipped-hero only; target type union lacks skill-target / condition-being-caused',
      passiveConditions: 'applyConditionToHero emits before-apply passive event, writes summed layers and logs duration without persisting it; not a Hero-caused active window',
      encounterReactiveCondition: 'applyCommunityFinalHeroSkill can invoke hostile wounded reaction blight on attacking Hero; causation must not be assigned from UI or recipient',
      saveReplay: 'battle object including completed statusEffectEvents is serialized; event reuse verifies target/effects, no pending child source/causer transaction exists' },
    consumers: { conditionStack: TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'], sourceTargetConsumerComplete: false,
      conditionDurationModifierTypeExists: true, conditionDurationModifierConsumerExists: false,
      categoricalBranch: 'durationTurns ?? effect.amount; max(0, duration-1), excludes buff/debuff, precedes percentage branch',
      resistanceDataProvenance: 'hero-level-registry.ts labels percentage resistance and immunity values prototype; p21 proves categorical shortening/immunity, not the d100 rule or Charm ordering',
      runtimeZeroBehavior: 'categorical branch skips apply at 0; direct applyEffectToUnit with duration=0 can still add potency. Existing behavior is not a new Charm source rule.',
      aggregateStacks: 'bleed/blight/stun amount sums with max duration per type; mark boolean/max duration; not independent per-source stacks',
      debuffDurationComplete: false, genericHeroCausesConditionWindowExists: false },
    sourceHashes: Object.fromEntries(['src/data/skills.ts', 'src/game-engine/battle.ts', 'src/game-engine/status-effects.ts', 'src/game-engine/quirks.ts', 'src/types/index.ts', 'src/types/trinkets.ts', 'src/game-engine/trinkets/use-trinket.ts', 'src/game-engine/save.ts', 'src/data/progression/skill-level-registry.ts', 'src/data/progression/hero-level-registry.ts'].map(path => [path, sha(readFileSync(path))])),
  };
  const sideFeasibility = cards.map(card => ({ definitionId: card.definitionId, adapterExists: Boolean(COMMUNITY_TRINKET_RUNTIME_ADAPTERS[card.definitionId]),
    positive: { sourceComplete: true, timingComplete: false, targetComplete: true, runtimeTargetComplete: false,
      durationComplete: true, consumerComplete: false, resistanceOrderingComplete: false, implementationPossibleNow: false, productionReadyGain: 0,
      blockers: ['POSITIVE_EXACT_INSERTION_UNRESOLVED', 'SKILL_TARGET_NOT_SKILL_WINDOW_BINDING', 'TARGET_AWARE_CONDITION_CONSUMER_MISSING', 'DEAD_TARGET_APPLICATION_UNRESOLVED',
        ...(card.definitionId.includes('debuff') ? ['DEBUFF_DURATION_RUNTIME_MISSING', 'DEBUFF_RESISTANCE_CONSUMER_MISSING'] : ['INDEPENDENT_STACK_RUNTIME_SCOPE_PARTIAL'])] },
    negative: { sourceComplete: true, timingComplete: false, targetComplete: true, runtimeTargetComplete: false,
      durationComplete: false, consumerComplete: false, resistanceOrderingComplete: false, implementationPossibleNow: false, productionReadyGain: 0,
      blockers: ['HERO_CAUSES_CONDITION_TIMING_UNRESOLVED', 'RESISTED_CONDITION_APPLICABILITY_UNRESOLVED', 'RESISTANCE_IMMUNITY_ORDERING_UNRESOLVED',
        'ZERO_DURATION_LIFECYCLE_UNRESOLVED', 'CONDITION_DURATION_CONSUMER_MISSING', 'LEGACY_SKILL_DURATION_SOURCE_GAP', 'MULTI_CONDITION_SELECTION_ORDER_UNRESOLVED',
        'ADDITIONAL_CONDITION_CROSS_COPY_ORDER_UNRESOLVED', 'GENERIC_CONDITION_SCOPE_RUNTIME_PARTIAL'] }, productionReady: false }));
  const frozenPaths = [...tracked('docs/data/complete-edition', 'docs/reports/complete-edition'), 'src/data/community-reference/trinkets/data.json',
    ...cards.flatMap(c => c.visualEvidence.map(v => v.assetPath)), ...Object.keys(surface.sourceHashes), 'docs/data/core-campaign/manifest.json'];
  const feasibility = { ...meta, cards: sideFeasibility, outcome: 'C', terminalVerdict: verdict, sourceRuleResolved: false,
    runtimeInputDataStatus: 'RUNTIME_INPUT_DATA_INCOMPLETE', productionReadyGain: 0, productionImplementationAuthorized: false,
    c1c18AndEarlierEvidenceHashes: baselineHashes(frozenPaths), officialRulebookSha256: officialHash,
    baselineHashPolicy: 'Historical docs, normalized JSON and visual assets byte-exact; source TypeScript compared in Git LF form to accommodate unchanged Windows CRLF checkout. Live sourceHashes separately bind exact current working bytes.',
    level1Coverage: LEVEL_1_TRINKET_DECK_COVERAGE, level2Coverage: LEVEL_2_TRINKET_DECK_COVERAGE, level3Coverage: LEVEL_3_TRINKET_DECK_COVERAGE,
    readySubset: getTrinketPoolByLevel(runtimeContentContext(createNewCampaign('community-complete-edition')), 1).map(c => c.id).sort(),
    liveCapabilities: ids.map(id => COMMUNITY_TRINKET_CAPABILITIES.find(c => c.definitionId === id)),
    damageStoneFrozen: { definitionId: 'community-trinket-core-damage-stone', positive: 'READY_FOR_IMPLEMENTATION', negative: 'SOURCE_SEMANTICS_UNRESOLVED', productionReady: false,
      contract: 'docs/data/complete-edition/c1c18-damage-stone-feasibility.json', adapterExists: Boolean(COMMUNITY_TRINKET_RUNTIME_ADAPTERS['community-trinket-core-damage-stone']) },
    nextPhase: 'No speculative Condition runtime or Positive-only promotion. Resolve active condition ordering with new authoritative source; legacy duration restoration is a separate data prerequisite and does not resolve timing.',
  };
  return {
    'c1c19-hero-caused-condition-source-contract.json': sourceContract,
    'c1c19-hero-caused-condition-contract.json': transaction,
    'c1c19-condition-duration-modifier-contract.json': durationContract,
    'c1c19-debuff-duration-contract.json': debuff,
    'c1c19-hero-condition-runtime-surface.json': surface,
    'c1c19-hero-skill-condition-source-gap.json': { ...meta, sourceStatus: 'SOURCE_DURATION_UNRESOLVED', count: census.gaps.length,
      gaps: census.gaps, allLegacyEffectsInventoried: true, durationEqualsAmountAuthorized: false, sourceRestorationPerformed: false },
    'c1c19-condition-charm-feasibility.json': feasibility,
    'c1c19-level1-trinket-capability-matrix.json': { ...meta, cards: LEVEL_1_TRINKET_CENSUS, conditionCharms: sideFeasibility },
  };
}
