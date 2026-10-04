import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import { PRODUCTION_MONSTER_DEFINITIONS, PRODUCTION_MONSTER_IDENTITIES, PRODUCTION_MONSTER_DEFINITION_VERSION } from '../../src/data/monsters/production-monster-definitions';
import { getProductionMonsterActionRuntimeStatus, NEW_MONSTER_RUNTIME_PRIMITIVES, REUSED_MONSTER_RUNTIME_PRIMITIVES } from '../../src/game-engine/monsters/production-runtime-primitives';
import { resolveProductionMonsterAction } from '../../src/game-engine/monsters/production-action-selection';
import { planProductionMonsterAction } from '../../src/game-engine/monsters/production-runtime';
import { dispatchProductionMonsterOperations } from '../../src/game-engine/monsters/production-effect-executor';
import { SyntheticMonsterAdapter } from '../../src/audit/c3c-synthetic-runtime';

export const C3C_BASELINE = '02c9d8b658ef1f3743e03394cf63c8babf6a3ac3';
const root = 'docs/data/complete-edition/';
function check(value: unknown, message: string): asserts value { if (!value) throw new Error('C3C: ' + message); }
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

export function sweepProductionRuntime() {
  let ready = 0, deferred = 0, selections = 0;
  const dispatched = new Set<string>();
  for (const definition of PRODUCTION_MONSTER_DEFINITIONS) {
    for (const [stance] of Object.entries(definition.selection)) for (let roll = 1; roll <= 10; roll++) {
      const selected = resolveProductionMonsterAction(definition, stance, roll);
      check(JSON.stringify(selected) === JSON.stringify(resolveProductionMonsterAction(definition, stance, roll)), 'deterministic selection');
      check(selected.status !== 'UNKNOWN', 'known stance disposition ' + definition.definitionId + ':' + stance);
      if (selected.status === 'SELECTED') check(definition.actions.includes(selected.action), 'action belongs to definition');
      selections++;
    }
    for (const action of definition.actions) {
      const adapter = new SyntheticMonsterAdapter(definition, action);
      const before = adapter.snapshot();
      const disposition = getProductionMonsterActionRuntimeStatus(action);
      const plan = planProductionMonsterAction(adapter, 'actor', definition, action.actionId, 1);
      check(adapter.snapshot() === before, 'planning never mutates state or RNG');
      if (disposition.status === 'DEFERRED_SEMANTIC') {
        check(plan.status === 'DEFERRED_SEMANTIC', 'atomic deferred result');
        check(plan.deferredIds.length > 0, 'deferred identifiers retained');
        // This is the same guard used by executeProductionMonsterAction, before adapter preflight/attack/effect.
        check(!('operations' in plan) && adapter.snapshot() === before, 'zero deferred operations/mutations');
        deferred++;
      } else {
        check(disposition.status === 'RUNTIME_READY' && plan.status === 'READY', 'executable plan ' + action.actionId);
        dispatchProductionMonsterOperations(adapter, plan.operations);
        const replay = new SyntheticMonsterAdapter(definition, action);
        dispatchProductionMonsterOperations(replay, plan.operations);
        check(adapter.snapshot() === replay.snapshot(), 'deterministic execution ' + action.actionId);
        adapter.dispatched.forEach(p => dispatched.add(p));
        const exercised = new Set(adapter.dispatched);
        // Target selection and distance are read-only environment operations, not mutation callbacks.
        exercised.add('targeting'); exercised.add('area-distance');
        if (action.targets === 'ALL_HEROES') {
          check(plan.targetIds.length === adapter.heroes.length, 'global all-Hero targeting exercised');
          exercised.add('all-heroes-targeting');
        }
        if (plan.operations.some(op => op.kind === 'ATTACK' && op.markedDamageBonus > 0)) exercised.add('marked-damage-bonus');
        for (const requirement of action.requirements) for (const id of requirement.primitiveIds)
          check(exercised.has(id), 'required primitive exercised ' + action.actionId + ':' + id);
        exercised.forEach(p => dispatched.add(p));
        const effectIndices = plan.operations.filter(op => op.kind === 'EFFECT').map(op => op.effectIndex);
        action.effects.forEach((effect, index) => {
          check(effect.kind !== 'DEFERRED', 'no deferred effect enters a plan');
          check(effectIndices.includes(index), 'every effect represented ' + action.actionId);
          check(adapter.events.some(e => e.kind === effect.primitiveId), 'effect dispatched ' + action.actionId + ':' + index);
        });
        ready++;
      }
    }
  }
  return { ready, deferred, selections, dispatched: [...dispatched].sort() };
}

export function buildC3CArtifacts() {
  const actions = PRODUCTION_MONSTER_DEFINITIONS.flatMap(d => d.actions);
  const statuses = actions.map(getProductionMonsterActionRuntimeStatus);
  const runtimeReadyActions = statuses.filter(s => s.status === 'RUNTIME_READY').length;
  const deferredSemanticActions = statuses.filter(s => s.status === 'DEFERRED_SEMANTIC').length;
  const common = { phase: '11A.6-C3C', definitionVersion: PRODUCTION_MONSTER_DEFINITION_VERSION,
    identityCount: PRODUCTION_MONSTER_IDENTITIES.length, definitionCount: PRODUCTION_MONSTER_DEFINITIONS.length, actionCount: actions.length };
  const backlog = read(root + 'c3b-monster-runtime-backlog.json');
  return {
    'docs/data/complete-edition/c3c-monster-runtime-coverage.json': { ...common, runtimeReadyActions, deferredSemanticActions,
      unknownActions: statuses.filter(s => s.status === 'UNKNOWN').length,
      unclassifiedActions: actions.filter(a => !['SUPPORTED_EXISTING_PRIMITIVE', 'SUPPORTED_EXISTING_COMPOSITION',
        'NEEDS_NEW_RUNTIME_PRIMITIVE', 'DEFERRED_SEMANTIC', 'NO_RUNTIME_EFFECT'].includes(a.capability)).length,
      newRuntimePrimitives: NEW_MONSTER_RUNTIME_PRIMITIVES, reusedPrimitiveCount: REUSED_MONSTER_RUNTIME_PRIMITIVES.length },
    'docs/data/complete-edition/c3c-runtime-primitive-status.json': { phase: common.phase,
      primitives: NEW_MONSTER_RUNTIME_PRIMITIVES.map(primitiveId => ({ primitiveId, status: 'IMPLEMENTED',
        affectedActions: [...new Set(backlog.primitives.find((p: any) => p.primitiveId === primitiveId).requirements.map((r: any) => r.actionId))],
        implementationPath: primitiveId === 'self-wound-sequencing' ? 'src/game-engine/monsters/production-effect-executor.ts' : 'src/game-engine/monsters/production-runtime-primitives.ts',
        implementationSymbol: primitiveId === 'self-wound-sequencing' ? 'buildProductionMonsterOperations' : primitiveId === 'all-heroes-targeting' ? 'selectAllLivingHeroes' : 'grantTimedProtection / expireTimedProtection / hasRuntimeProtection',
        targetedTests: 'src/audit/c3c-monster-production-runtime.test.ts',
      })),
      reusedPrimitives: REUSED_MONSTER_RUNTIME_PRIMITIVES,
      bindings: {
        targeting: 'compareMonsterTargetPriority (behavior-preserving extraction) + production-targeting area priorities',
        attackAndDamage: 'Adapter.attack: resolvePrintedAttackFromRoll + applyBattleUnitDamage; C3D can stage READY operations into PendingMonsterAttack',
        conditions: 'Adapter.effect: applyEffectsWithResistance / applyStatusEffectEvent + existing condition tokens',
        heal: 'Adapter.effect: applyBattleUnitHealing',
        shuffle: 'Adapter.effect: shuffleAtomicStanceBlocks / shuffleStance + ruinsDisplacementCandidates / moveRuinsUnit',
        disease: 'Adapter.effect: drawDisease + existing pendingDiseaseInfections',
        stressLightGuardRiposteRemoval: 'Adapter.effect: existing printed-effect transaction/token contracts; synthetic adapter records isolated equivalents',
      } },
    'docs/data/complete-edition/c3c-runtime-deferred-actions.json': { phase: common.phase, actions: statuses.filter(s => s.status === 'DEFERRED_SEMANTIC') },
    'docs/data/complete-edition/c3c-monster-runtime-status.json': { ...common, status: 'COMPLETE', runtimeReadyActions,
      deferredActions: deferredSemanticActions, newPrimitiveCount: NEW_MONSTER_RUNTIME_PRIMITIVES.length,
      newPrimitivesImplemented: NEW_MONSTER_RUNTIME_PRIMITIVES.length, runtimeRequiresBossEncounter: false,
      dungeonIntegrated: false, campaignSpawningIntegrated: false, browserAccepted: false, saveReplayAccepted: false,
      runtimeVersion: 'C3C-GENERIC-MONSTER-RUNTIME-v1', executionBoundary: 'READY ordered operations or synchronous isolated adapter; live staged reactions/choices owned by C3D',
      next: '11A.6-C3D' },
  };
}

export function verifyC3CFrozenInputs() {
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', C3C_BASELINE], { encoding: 'utf8' }).trim().split(/\r?\n/)
    .filter(p => p.startsWith(root + 'c3b-') || p.startsWith('src/data/monsters/production-monster-definition'));
  for (const path of paths) {
    const original = execFileSync('git', ['show', `${C3C_BASELINE}:${path}`], { maxBuffer: 16 * 1024 * 1024 }).toString('utf8').replace(/\r\n/g, '\n');
    check(original === readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), 'frozen C3B input ' + path);
  }
  return paths.length;
}

export function verifyC3CRuntimeBoundaries() {
  verifyC3CFrozenInputs();
  const legacyPath = 'src/game-engine/ruins/monster-runtime.ts';
  const originalLegacy = execFileSync('git', ['show', `${C3C_BASELINE}:${legacyPath}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
  const extractedLegacy = originalLegacy
    .replace("import { RUINS_STANCES } from '../../types/ruins-executable';\n", '')
    .replace("import { resolvePrintedAttackFromRoll } from '../combat-resolution';", "import { resolvePrintedAttackFromRoll } from '../combat-resolution';\nimport { compareMonsterTargetPriority } from '../monster-target-priority';")
    .replace('    || RUINS_STANCES.indexOf(a.stance) - RUINS_STANCES.indexOf(b.stance)\n    || a.id.localeCompare(b.id));', '    || compareMonsterTargetPriority(a, b));');
  check(readFileSync(legacyPath, 'utf8').replace(/\r\n/g, '\n') === extractedLegacy, 'only exact behavior-preserving Ruins helper extraction allowed');
  const changed = execFileSync('git', ['diff', C3C_BASELINE, '--name-only'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  // Explicit successor verification keeps the C3C planner fence on its accepted files.
  // C3D owns BattleState integration imports, scopes and gate validation independently.
  const successorIntegration = process.argv.includes('--successor-integration');
  const allowed = (p: string) => p.startsWith('src/game-engine/monsters/') || p.startsWith('src/audit/c3c-')
    || successorIntegration && (p.startsWith('src/audit/c3d-') || p.startsWith('scripts/audit/c3d-') || p.startsWith(root + 'c3d-')
      || ['src/game-engine/battle.ts', 'src/game-engine/commands/ordinary-monsters.ts', 'src/game-engine/trinkets/battle-trinket-bridge.ts', 'src/types/index.ts'].includes(p))
    || p.startsWith('scripts/audit/c3c-') || p.startsWith(root + 'c3c-') || ['package.json', '.github/workflows/development-fast-gate.yml',
      'scripts/audit/c3b-monster-definition-layer.ts', 'src/game-engine/monster-target-priority.ts',
      'src/game-engine/ruins/monster-runtime.ts'].includes(p);
  check([...changed, ...untracked].every(allowed), 'phase scope / Hero and Boss freeze');
  const visited = new Set<string>();
  function visit(path: string) {
    if (visited.has(path)) return;
    visited.add(path);
    check(!/^(docs|scripts|src\/(audit|pages|components|store))\//.test(path), 'transitive runtime fence ' + path);
    if (path.endsWith('.json')) return;
    const text = readFileSync(path, 'utf8');
    // Shared type files contain erased import(...) type references and optional Boss fields.
    // They do not make those contexts a runtime dependency; executable imports are still traversed.
    if (!path.startsWith('src/types/'))
      check(!/\b(?:Math\.random|window|document|localStorage|BossEncounter|bossEncounter)\b|\brequire\s*\(|\bimport\s*\(/.test(text), 'runtime dependency fence ' + path);
    for (const match of text.matchAll(/(?:import\s+(?!type\b)[^;]*?from\s*|export\s+[^;]*?from\s*)['"]([^'"]+)['"]/g)) {
      check(match[1].startsWith('.'), 'external runtime import ' + match[1]);
      let resolved = posix.normalize(posix.join(posix.dirname(path), match[1]));
      if (!resolved.endsWith('.json') && !resolved.endsWith('.ts')) resolved += '.ts';
      check(existsSync(resolved), 'resolved runtime import ' + resolved);
      visit(resolved);
    }
  }
  const acceptedRuntimeFiles = ['production-runtime-types.ts', 'production-action-selection.ts', 'production-targeting.ts',
    'production-runtime-primitives.ts', 'production-effect-executor.ts', 'production-runtime.ts'];
  for (const name of successorIntegration ? acceptedRuntimeFiles : readdirSync('src/game-engine/monsters')) if (name.endsWith('.ts')) visit('src/game-engine/monsters/' + name);
  const payload = readFileSync('src/data/monsters/production-monster-definitions.generated.json', 'utf8');
  check(!/"(?:printedText|sourceReferences|sha256|physicalCopyIds|visualReview|relativePath)"/.test(payload), 'compact metadata fence');
  const fast = readFileSync('.github/workflows/development-fast-gate.yml', 'utf8');
  check(!/(playwright|historical|validate:|npm test)/i.test(fast), 'small Development Fast Gate');
  for (const script of successorIntegration ? ['typecheck', 'verify:complete-edition-c3c', 'test:complete-edition-c3d', 'verify:complete-edition-c3d', 'build']
    : ['typecheck', 'verify:complete-edition-c3b', 'test:complete-edition-c3c', 'verify:complete-edition-c3c', 'build'])
    check(fast.includes('npm run ' + script), 'Fast Gate ' + script);
}

export function verifyC3C() {
  verifyC3CRuntimeBoundaries();
  const coverage = buildC3CArtifacts()['docs/data/complete-edition/c3c-monster-runtime-coverage.json'];
  const sweep = sweepProductionRuntime();
  check(coverage.definitionVersion === 'C3B-MONSTER-DEFINITIONS-v1', 'definition version');
  check(coverage.definitionCount === 77 && coverage.identityCount === 71 && coverage.actionCount === 175, 'accepted inventory');
  check(coverage.unknownActions === 0 && coverage.unclassifiedActions === 0, 'all actions accounted for');
  check(sweep.ready === coverage.runtimeReadyActions && sweep.deferred === coverage.deferredSemanticActions, 'derived sweep coverage');
  const backlog = read(root + 'c3b-monster-runtime-backlog.json');
  check(backlog.primitives.every((p: any) => (NEW_MONSTER_RUNTIME_PRIMITIVES as readonly string[]).includes(p.primitiveId)), 'all backlog primitives implemented');
  for (const id of NEW_MONSTER_RUNTIME_PRIMITIVES) check(sweep.dispatched.includes(id), 'new primitive dispatched ' + id);
  return { coverage, sweep };
}

if (process.argv.includes('--write') || process.argv.includes('--verify')) {
  const result = verifyC3C();
  for (const [path, artifact] of Object.entries(buildC3CArtifacts())) {
    if (process.argv.includes('--write')) writeFileSync(path, JSON.stringify(artifact, null, 2) + '\n');
    else check(JSON.stringify(read(path)) === JSON.stringify(artifact), 'artifact drift ' + path);
  }
  console.log(JSON.stringify(result, null, 2));
}
