import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { necromancerDefinition, NECROMANCER_RULE_SET_VERSION } from '../../src/game-engine/necromancer/contract-adapter';
import { applyBossRuntimeInput, replayBossRuntime, restoreBossRuntime } from '../../src/game-engine/bosses/foundation';
import { activeFixture, foundationFixture, fixtureUnit } from '../../src/game-engine/bosses/foundation-test-fixture';
import type { BattleState } from '../../src/types';

export const root = 'docs/data/complete-edition/';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const digest = (value: unknown) => sha(JSON.stringify(value));
export function commitProofChoices(initial: BattleState): BattleState {
  let result = initial;
  for (let i = 0; result.bossEncounter!.pendingChoice && i < 20; i++) {
    const p = result.bossEncounter!.pendingChoice!;
    // This is recorded synthetic PLAYER INPUT, not a runtime default.
    result = applyBossRuntimeInput(result, { type: 'CHOICE', choiceId: p.choiceId, selectedId: p.candidateIds[p.candidateIds.length - 1] });
  }
  if (result.bossEncounter!.pendingChoice) throw new Error('Unresolved proof choice');
  return result;
}
function choiceProof(kind: 'hero' | 'area' | 'death' | 'placement') {
  let initial: BattleState;
  let pending: BattleState;
  if (kind === 'hero') {
    initial = foundationFixture(3, 2929);
    pending = applyBossRuntimeInput(initial, { type: 'PREPARATION_DAY', rolls: Object.fromEntries(initial.heroes.map(h => [h.id, 1])) });
  } else if (kind === 'death') {
    initial = foundationFixture(3, 2929, [fixtureUnit('a', 'monster', 1, 'bone-rabble'), fixtureUnit('z', 'monster', 2, 'bone-rabble')]);
    pending = applyBossRuntimeInput(initial, { type: 'MONSTER_DAMAGE', amounts: { a: 40, z: 40 } });
  } else {
    initial = activeFixture(1, 2929);
    if (kind === 'placement') {
      initial.bossEncounter!.placements['hero-1'] = 'centre'; initial.bossEncounter!.placements['hero-2'] = 'centre';
      initial.bossEncounter!.placements['hero-3'] = 'left'; initial.bossEncounter!.placements['hero-4'] = 'right';
    }
    pending = applyBossRuntimeInput(initial, { type: 'SKILL', skillRoll: kind === 'placement' ? 5 : 1, attackRoll: 2 });
  }
  const final = commitProofChoices(pending);
  const loaded = commitProofChoices(restoreBossRuntime(JSON.stringify(pending), NECROMANCER_RULE_SET_VERSION));
  const inputs = final.bossEncounter!.inputs.slice(initial.bossEncounter!.inputs.length);
  const replayed = replayBossRuntime(initial, inputs);
  if (digest(final) !== digest(loaded) || digest(final) !== digest(replayed)) throw new Error(`Replay failed: ${kind}`);
  return { kind, fixtureAuthority: 'SYNTHETIC_EXTERNAL_COMBAT_DEPENDENCIES', ruleSetVersion: NECROMANCER_RULE_SET_VERSION,
    initialStateSha256: digest(initial), pendingStateSha256: digest(pending), finalStateSha256: digest(final),
    reloadStateSha256: digest(loaded), replayStateSha256: digest(replayed), inputs,
    choices: final.bossEncounter!.events.filter(event => event.eventType === 'CHOICE_COMMITTED'), saveReload: 'PASS', replay: 'PASS' };
}
export function buildArtifacts(): Record<string, unknown> {
  const baselineHead = execFileSync('git', ['rev-parse', 'codex/phase-11a4-c1c28-necromancer-digital-rulings'], { encoding: 'utf8' }).trim();
  const frozen = readdirSync(root).filter(name => /^c1c2[0-8]-.*\.json$/.test(name));
  execFileSync('git', ['diff', '--exit-code', baselineHead, '--', ...frozen.map(name => root + name)], { stdio: 'pipe' });
  const frozenInputSha256 = Object.fromEntries(frozen.map(name => [root + name, sha(readFileSync(root + name))]));
  const definitions = ([1, 2, 3] as const).map(necromancerDefinition);
  const bindings = definitions.flatMap(d => [
    { cardId: d.bossIdentityCardId, level: d.level, role: 'IDENTITY', executor: 'bindBossEncounter' },
    { cardId: d.threatAbilityCardId, level: d.level, role: 'THREAT_ABILITY', executor: 'applyBossRuntimeInput' },
    { cardId: d.battleCardId, level: d.level, role: 'BATTLE', executor: 'runMonsterTurn -> applyBossRuntimeInput' },
  ]);
  const proof = definitions.map(d => {
    const initial = activeFixture(d.level, 29);
    const final = commitProofChoices(applyBossRuntimeInput(initial, { type: 'SKILL', skillRoll: 1, attackRoll: 2 }));
    return { level: d.level, cardSet: [d.bossIdentityCardId, d.threatAbilityCardId, d.battleCardId],
      life: d.stats.HP, sourceDefinitionSha256: digest(d), initialStateSha256: digest(initial), finalStateSha256: digest(final),
      events: final.bossEncounter!.events, summonLedger: final.bossEncounter!.summonSupply,
      initiative: final.initiativeOrder, syntheticDependencyFixture: true };
  });
  const common = { phase: '11A.4-C1C29', ruleSetVersion: NECROMANCER_RULE_SET_VERSION, ruleSourcePolicyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1' };
  return {
    'rule-source-policy.json': { policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1', effectiveFrom: 'C1C29',
      allowed: ['official locked rulebook', 'printed official cards/components', 'existing hash-bound source extracts'],
      disallowed: ['Designer FAQ', 'BGG', 'forums', 'Reddit', 'Wiki', 'YouTube', 'gameplay videos', 'Steam Workshop scripts', 'TTS Lua', 'third-party summaries', 'player interpretations', 'videogame rules'],
      missingRulePolicy: { authority: 'PROJECT_RULING', canonical: false, canonicalStatus: 'SOURCE_UNRESOLVED', explicitVersionRequired: true },
      externalAuthorityAcquisition: false, sourceClosureContinuation: 'ONLY_FOR_OMITTED_LOCKED_OFFICIAL_RULEBOOK_PAGES',
      printImageTransportIsNotRuleAuthority: true },
    'c1c29-necromancer-runtime-binding.json': { ...common, baselineHead, frozenInputSha256,
      executableContract: root + 'c1c28-necromancer-runtime-semantic-contract.json',
      executableContractSha256: frozenInputSha256[root + 'c1c28-necromancer-runtime-semantic-contract.json'],
      runtimeAdapter: 'src/game-engine/necromancer/contract-adapter.ts', runtimeEngine: 'src/game-engine/bosses/foundation.ts',
      existingBattleEngine: 'src/game-engine/battle.ts', bindings, coreDefinitionsBound: bindings.length,
      canonicalSemanticComplete: 0, productionReady: 0, historicalArtifactsChanged: false },
    'c1c29-necromancer-runtime-capability-matrix.json': { ...common,
      implemented: ['contract setup I/II/III', 'exclusive Threat/Ability flip', 'generic immutable PendingChoice', 'Crowded target and independent Stance ordering',
        'Skill selection and shared D10', 'range/movement and Self Push windows', 'once-per-successful-activation summon', 'finite token ledger',
        'transactional occupant displacement and spawn', 'fresh Reanimation identity', 'simultaneous death choice', 'mandatory dying-instance effects',
        'nested death window lock', 'seeded remaining-initiative shuffle', 'existing campaign victory transactions', 'idempotent cleanup', 'versioned save/replay', 'production choice panel'],
      incompletePromotion: ['official numeric Bone combat definitions are absent from C1C28 fields', 'official Hero Dodge binding is not present in existing Hero registry',
        'source-bound ordinary summoned-monster Skill activation adapter', 'normal Room/Threat selector entry integration and saved Threat checkpoint resumption',
        'Hamlet/Graveyard production effect application from stored Preparation Day choice', 'complete incoming Boss attack Trinket reaction windows',
        'physical Room card/tile deck storage integration', 'Boss Debuff/Shuffle resistance integration'],
      sourceAcquisitionNeeded: false, normalSelectorEnabled: false, prototypePromoted: false, productionReady: 0 },
    'c1c29-necromancer-runtime-proof.json': { ...common, proofScope: 'REAL_PRODUCTION_EXECUTOR_WITH_EXPLICIT_SYNTHETIC_DEPENDENCY_FIXTURES',
      proof, normalProductionGameplayAccepted: false, syntheticMonsterLifeIsOfficial: false },
    'c1c29-necromancer-save-replay-proof.json': { ...common, cases: (['hero', 'area', 'death', 'placement'] as const).map(choiceProof), seed: 2929,
      playerInputPolicy: 'Explicit scripted choices persisted in event/input log; no runtime fallback', fixtureAuthority: 'SYNTHETIC_EXTERNAL_COMBAT_DEPENDENCIES' },
    'c1c29-necromancer-contract-review.json': { ...common, status: 'REVIEW_REQUIRED_BEFORE_COMPONENT_PROMOTION',
      issue: 'C1C28 covers the nine core Boss cards and project decisions, but reachable Bone bindings contain component identities/copy policy rather than numeric Life/Skill definitions.',
      runtimeBehavior: 'SPAWN_DEFINITION_UNBOUND, no token or initiative consumption; no guessed stats and no prototype registry fallback',
      requiredWork: ['Resolve and bind existing locked component combat definitions through an explicit reviewed semantic dependency adapter.',
        'Bind official Hero Dodge through its source-backed definition snapshot.', 'Preserve C1C28 v1 rulings; review any semantic/version extension explicitly.'],
      c1c28RulingChanged: false, externalAuthorityAcquisitionAllowed: false },
    'c1c29-next-workstream-decision.json': { ...common, decision: 'NECROMANCER_RUNTIME_FOUNDATION_CONTINUATION',
      verdict: 'C1C29-NECROMANCER-RUNTIME-FOUNDATION-PARTIAL-NOT-ACCEPTED', coreDefinitionsBound: 9, productionReady: 0,
      saveReplayFoundation: 'PASS_WITH_EXPLICIT_DEPENDENCY_FIXTURES', pendingChoices: 'PASS', summonLedger: 'PASS', reanimationEventModel: 'PASS',
      reason: 'Do not equate dependency-fixture coverage with a fully source-bound production encounter. Complete dependency executors/bridges before integration promotion.',
      nextWorkstream: 'C1C30 Necromancer Runtime Foundation Continuation', returnToSourceAcquisition: false },
  };
}
export function verifyArtifacts(): void {
  const expected = buildArtifacts();
  for (const [name, data] of Object.entries(expected)) if (digest(JSON.parse(readFileSync(root + name, 'utf8'))) !== digest(data)) throw new Error(`Stale C1C29 evidence: ${name}`);
}
