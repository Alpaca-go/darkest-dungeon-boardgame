import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { PRODUCTION_MONSTER_DEFINITIONS, PRODUCTION_MONSTER_IDENTITIES } from '../../src/data/monsters/production-monster-definitions';
import { getProductionMonsterActionRuntimeStatus } from '../../src/game-engine/monsters/production-runtime-primitives';
import { PRODUCTION_MONSTER_RUNTIME_VERSION } from '../../src/game-engine/monsters/production-runtime-types';
import { PRODUCTION_MONSTER_INTEGRATION_VERSION } from '../../src/game-engine/monsters/production-battle-types';
import { beginProductionMonsterTurn, validateProductionMonsterBattle } from '../../src/game-engine/monsters/production-battle-runtime';
import { productionRuinsBindings } from '../../src/game-engine/monsters/production-encounter';
import { productionBattleFixture, drainProductionBattle } from '../../src/audit/c3d-battle-fixture';

export const C3D_BASELINE = '5ddef2a7efb2e5d273b5b1c3d67150a86b5928bf';
const root = 'docs/data/complete-edition/';
function check(value: unknown, message: string): asserts value { if (!value) throw new Error('C3D: ' + message); }
export function sweepRealProductionBattle() {
  let ready = 0, deferred = 0, instantiable = 0, staged = 0;
  const bindings = new Set<string>();
  for (const d of PRODUCTION_MONSTER_DEFINITIONS) {
    let created = false;
    for (const a of d.actions) {
      const fixture = productionBattleFixture(d, a).battle!;
      validateProductionMonsterBattle(fixture); created = true;
      const before = JSON.stringify({ heroes: fixture.heroes, monsters: fixture.monsters, light: fixture.light, placements: fixture.productionMonsterContext!.placements });
      const started = beginProductionMonsterTurn(fixture, 'actor', { actionId: a.actionId, skillRoll: 1, attackRoll: 1 });
      const disposition = getProductionMonsterActionRuntimeStatus(a);
      if (disposition.status === 'DEFERRED_SEMANTIC') {
        check(started.productionMonsterContext!.blocker?.status === 'DEFERRED_SEMANTIC', 'explicit deferred blocker ' + a.actionId);
        check(!started.pendingMonsterAttack && !started.productionMonsterContext!.pendingExecution, 'zero deferred execution');
        check(before === JSON.stringify({ heroes: started.heroes, monsters: started.monsters, light: started.light, placements: started.productionMonsterContext!.placements }), 'zero partial mutation ' + a.actionId);
        deferred++; continue;
      }
      check(disposition.status === 'RUNTIME_READY', 'unknown action ' + a.actionId);
      if (a.attack.kind === 'ROLL') { check(started.pendingMonsterAttack?.productionMonsterAttack, 'real staged attack ' + a.actionId); staged++; }
      const resolved = drainProductionBattle(started);
      check(!resolved.productionMonsterContext!.pendingExecution && !resolved.productionMonsterContext!.blocker, 'completed real operations ' + a.actionId);
      const effects = resolved.productionMonsterContext!.events.filter(e => e.type === 'MONSTER_EFFECT_APPLIED');
      for (const [index, effect] of a.effects.entries()) {
        check(effect.kind !== 'DEFERRED', 'no deferred effect execution');
        check(effects.some(e => e.detail.effectIndex === index), 'live effect binding ' + a.actionId + ':' + index);
        bindings.add(effect.primitiveId);
      }
      check(resolved.productionMonsterContext!.events.some(e => e.type === 'MONSTER_ACTION_COMPLETED'), 'completion event'); ready++;
    }
    if (created) instantiable++;
  }
  return { ready, deferred, instantiable, stagedAttackActions: staged, effectBindings: [...bindings].sort() };
}
export function buildC3DArtifacts() {
  const sweep = sweepRealProductionBattle(), ruins = productionRuinsBindings();
  const auto = new Set(ruins.map(r => r.definitionId));
  const actions = PRODUCTION_MONSTER_DEFINITIONS.flatMap(d => d.actions);
  const statuses = actions.map(getProductionMonsterActionRuntimeStatus);
  const common = { phase: '11A.6-C3D', runtimeVersion: PRODUCTION_MONSTER_RUNTIME_VERSION, integrationVersion: PRODUCTION_MONSTER_INTEGRATION_VERSION,
    identityCount: PRODUCTION_MONSTER_IDENTITIES.length, definitionCount: PRODUCTION_MONSTER_DEFINITIONS.length, actionCount: actions.length,
    realBattleRuntimeReadyActions: sweep.ready, deferredSemanticActions: sweep.deferred, unknownActions: statuses.filter(s => s.status === 'UNKNOWN').length,
    definitionsInstantiable: sweep.instantiable };
  const definitions = PRODUCTION_MONSTER_DEFINITIONS.map(d => ({ definitionId: d.definitionId, contentSet: d.contentSet,
    runtimeStatus: d.actions.some(a => getProductionMonsterActionRuntimeStatus(a).status === 'DEFERRED_SEMANTIC') ? 'HAS_DEFERRED_ACTIONS' : 'RUNTIME_READY',
    explicitManifestReady: true,
    encounterStatus: auto.has(d.definitionId) ? 'AUTO_ENCOUNTER_READY' : 'EXPLICIT_MANIFEST_READY',
    sourceEligibilityStatus: auto.has(d.definitionId) ? 'ACCEPTED_RUINS_PHYSICAL_DRAW' : 'DEFERRED_SOURCE_ELIGIBILITY',
    automaticEligibility: auto.has(d.definitionId) ? 'ACCEPTED_RUINS_PHYSICAL_DRAW' : 'NOT_AUTHORIZED',
    sourceDeferredIds: [...new Set(d.definitionRequirements.flatMap(r => r.deferredIds))] }));
  const counts = { automaticSourceClear: definitions.filter(d => d.encounterStatus === 'AUTO_ENCOUNTER_READY').length,
    explicitManifestReady: definitions.filter(d => d.encounterStatus === 'EXPLICIT_MANIFEST_READY').length,
    sourceEligibilityDeferred: definitions.filter(d => d.sourceEligibilityStatus === 'DEFERRED_SOURCE_ELIGIBILITY').length };
  return {
    [root + 'c3d-monster-integration-coverage.json']: { ...common, stagedAttackIntegrated: sweep.stagedAttackActions > 0,
      movementIntegrated: true, timedProtectionIntegrated: true, ...sweep },
    [root + 'c3d-monster-encounter-readiness.json']: { phase: common.phase, ...counts, definitions },
    [root + 'c3d-runtime-deferred-actions.json']: { phase: common.phase, actions: PRODUCTION_MONSTER_DEFINITIONS.flatMap(d => d.actions.flatMap(a => {
      const s = getProductionMonsterActionRuntimeStatus(a); return s.status === 'DEFERRED_SEMANTIC' ? [{ definitionId: d.definitionId, ...s, atomic: true }] : []; })) },
    [root + 'c3d-monster-integration-status.json']: { ...common, status: 'COMPLETE', stagedAttackIntegrated: true, movementIntegrated: true,
      timedProtectionIntegrated: true, ...counts, browserAccepted: false, saveReplayAccepted: false, next: '11A.6-C3E' },
    [root + 'c3d-ruins-production-binding.json']: { phase: common.phase, definitions: ruins.length,
      physicalCopies: ruins.flatMap(r => r.physicalCopyIds).length, historicalRuntimeReplaced: false, bindings: ruins },
  };
}
export function verifyC3DBoundary() {
  const frozen = execFileSync('git', ['ls-tree', '-r', '--name-only', C3D_BASELINE, 'src/data/monsters', 'src/game-engine/monsters',
    'src/data/heroes', 'src/game-engine/heroes', 'src/data/bosses', 'src/game-engine/bosses', 'src/game-engine/necromancer', 'src/game-engine/prophet'], { encoding: 'utf8' }).trim().split(/\r?\n/);
  for (const path of frozen) {
    const baseline = execFileSync('git', ['show', `${C3D_BASELINE}:${path}`], { maxBuffer: 32 * 1024 * 1024 });
    check(baseline.equals(readFileSync(path)), 'frozen input changed ' + path);
  }
  for (const filename of ['c3b-monster-capability-matrix.json', 'c3b-monster-runtime-backlog.json', 'c3c-monster-runtime-coverage.json',
    'c3c-runtime-primitive-status.json', 'c3c-runtime-deferred-actions.json', 'c3c-monster-runtime-status.json'])
    check(execFileSync('git', ['show', `${C3D_BASELINE}:${root + filename}`]).equals(readFileSync(root + filename)), 'frozen artifact ' + filename);
  const changed = execFileSync('git', ['diff', '--name-only', C3D_BASELINE], { encoding: 'utf8' });
  check(!/src\/(pages|components|store)\//.test(changed), 'no UI dependency');
  const turn = readFileSync('src/game-engine/battle.ts', 'utf8');
  check(turn.includes('beginProductionMonsterTurn(s, id)') && turn.includes('prepareRuinsMonsterTurn(state, monsterId)'), 'explicit successor, historical route retained');
  const runtime = readFileSync('src/game-engine/monsters/production-battle-runtime.ts', 'utf8');
  check(!/Math\.random|docs\/data|SyntheticMonsterAdapter/.test(runtime), 'no random/source-rich/synthetic runtime import');
  check(runtime.includes('tickProductionMonsterProtection') && turn.includes('tickProductionMonsterProtection(s, id, unit)'), 'live protection lifecycle');
}
export function verifyC3DArtifacts() {
  verifyC3DBoundary();
  const artifacts = buildC3DArtifacts();
  for (const [path, value] of Object.entries(artifacts)) check(JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))) === JSON.stringify(value), 'derived artifact ' + path);
  return artifacts;
}
if (process.argv.includes('--write') || process.argv.includes('--verify')) {
  if (process.argv.includes('--write')) {
    verifyC3DBoundary(); for (const [path, value] of Object.entries(buildC3DArtifacts())) writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
    console.log('C3D artifacts generated from real BattleState action sweep');
  } else { verifyC3DArtifacts(); console.log('C3D Monster integration verified'); }
}
