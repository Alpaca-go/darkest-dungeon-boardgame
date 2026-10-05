import type { BattleState, BattleUnit, Stance } from '../../types';
import { getProductionMonsterDefinition, listProductionMonsterDefinitions } from '../../data/monsters/production-monster-definition-registry';
import { PRODUCTION_MONSTER_RUNTIME_VERSION } from './production-runtime-types';
import { PRODUCTION_MONSTER_INTEGRATION_VERSION, type ProductionMonsterEncounterManifest } from './production-battle-types';
import { bindLargeMovementContract } from '../rules/large-movement-contract';
import { THREAT_DEPENDENCY_V3 } from '../../types/necromancer-dependencies';
import { RUINS_STANCES, RUINS_V6 } from '../../types/ruins-executable';
import { ruinsMonsterDefinitions, ruinsTile } from '../ruins/source-registry';
import { initializeOrdinaryRuinsBattle } from '../ruins/battle-runtime';
import type { RuinsDrawState } from '../ruins/encounter-draw';
import type { CampaignState } from '../../types';
import { SeededRandom } from '../runtime-sources';

export function createProductionMonsterUnit(definitionId: string, instanceId: string, stance: Stance): BattleUnit {
  const d = getProductionMonsterDefinition(definitionId);
  if (!d || d.profile.life === null || !RUINS_STANCES.includes(stance))
    throw new Error('Production Monster profile unavailable');
  return { id: instanceId, sourceId: definitionId, name: d.printedName, side: 'monster',
    // BattleUnit requires a number; preserve printed absence separately and prohibit movement from it.
    maxHp: d.profile.life, hp: d.profile.life, speed: d.profile.speed ?? 0, stance,
    position: RUINS_STANCES.indexOf(stance) + 1, stress: 0, isAlive: true,
    stunned: 0, bleed: 0, blight: 0, marked: false, buffs: [], debuffs: [], actionPoints: 0,
    atDeathsDoor: false, deathblowRollCount: 0, resolveTestedThisQuest: false, resolveState: 'normal',
    virtueId: null, afflictionId: null, mentalEffectResolvedTurnId: null,
    immunities: [...(d.profile.immunities ?? [])],
    categoricalResistances: [...(d.profile.resistances ?? [])] as BattleUnit['categoricalResistances'],
    printedConditionTokens: [], conditionDurations: {}, bossCombatDodge: d.profile.dodge ?? 0,
    productionMonsterProfile: { definitionId, tags: [...(d.profile.tags ?? [])],
      baseProtection: d.profile.protection, printedSpeed: d.profile.speed, dodge: d.profile.dodge ?? 0, stanceSlots: d.profile.stanceSlots ?? 1 },
  };
}

export function initializeProductionMonsterBattle(manifest: ProductionMonsterEncounterManifest): BattleState {
  const monsters = manifest.monsters.map(m => createProductionMonsterUnit(m.definitionId, m.instanceId, m.stance));
  const heroes = manifest.heroes.map(h => structuredClone(h.unit));
  const units = [...heroes, ...monsters];
  if (!manifest.encounterId || !Number.isInteger(manifest.seed) || heroes.some(h => h.side !== 'hero')
    || new Set(units.map(u => u.id)).size !== units.length
    || new Set(manifest.initiative).size !== units.length || manifest.initiative.length !== units.length
    || manifest.initiative.some(id => !units.some(u => u.id === id))) throw new Error('Invalid explicit encounter roster');
  const placements: Record<string, string> = {}, occupiedSpaces: Record<string, number> = {}, definitionIds: Record<string, string> = {};
  manifest.heroes.forEach(h => { placements[h.unit.id] = h.areaId; occupiedSpaces[h.unit.id] = 1; });
  manifest.monsters.forEach(m => { placements[m.instanceId] = m.areaId;
    occupiedSpaces[m.instanceId] = getProductionMonsterDefinition(m.definitionId)!.profile.occupiedSpaces!;
    definitionIds[m.instanceId] = m.definitionId; });
  const physical = manifest.monsters.flatMap(m => m.physicalCopyId ? [m.physicalCopyId] : []);
  if (new Set(physical).size !== physical.length) throw new Error('Duplicate physical Monster copy');
  const battle: BattleState = { battleId: `production:${manifest.encounterId}`, status: 'active', round: 1, maxRounds: 4,
    heroes, monsters, initiativeOrder: [...manifest.initiative], initiativeIndex: -1, activeActorId: null,
    currentActionPoints: 0, selectedSkillId: null, selectedTargetId: null, battleLog: [],
    sourceRoomId: manifest.encounterId, rewards: { gold: 0 }, light: 5, stagedIncomingAttacks: true,
    productionMonsterContext: { schemaVersion: 1, integrationVersion: PRODUCTION_MONSTER_INTEGRATION_VERSION,
      runtimeVersion: PRODUCTION_MONSTER_RUNTIME_VERSION, encounterId: manifest.encounterId,
      definitionIds, placements, occupiedSpaces, protectionStorage: 'BATTLE_UNIT_PRINTED_CONDITION_TOKENS', rngCursor: new SeededRandom(manifest.seed).snapshot(), rngCalls: 0,
      pendingExecution: null, pendingChoice: null, blocker: null, events: [],
      physicalCopyIds: Object.fromEntries(manifest.monsters.filter(m => m.physicalCopyId).map(m => [m.instanceId, m.physicalCopyId!])),
    } };
  validateProductionStances(battle);
  return bindLargeMovementContract(battle, THREAT_DEPENDENCY_V3, { areas: structuredClone(manifest.areas), placements, occupiedSpaces });
}

export function validateProductionStances(battle: BattleState): void {
  const occupied = new Set<number>();
  for (const m of battle.monsters.filter(u => u.isAlive)) {
    const width = getProductionMonsterDefinition(battle.productionMonsterContext!.definitionIds[m.id])!.profile.stanceSlots!;
    for (let i = m.position; i < m.position + width; i++) {
      if (i < 1 || i > 4 || occupied.has(i)) throw new Error('Invalid production Monster Stance occupancy');
      occupied.add(i);
    }
  }
}

export function productionRuinsBindings() {
  return ruinsMonsterDefinitions(RUINS_V6).map(d => {
    const production = listProductionMonsterDefinitions().find(p => p.identityId === d.canonicalId && p.level === d.printedLevel);
    if (!production) throw new Error('Ruins production successor binding absent: ' + d.canonicalId);
    return { canonicalId: d.canonicalId, definitionId: production.definitionId, physicalCopyIds: d.physicalCopyIds };
  });
}

/** Explicit successor opt-in, using the accepted physical draw and initial placement without rebuilding a deck. */
export function initializeProductionRuinsBattle(campaign: CampaignState, draw: RuinsDrawState, encounterId: string): BattleState {
  const historical = initializeOrdinaryRuinsBattle(campaign, draw, encounterId);
  const old = historical.ruinsContext!;
  const bindings = productionRuinsBindings();
  const manifest: ProductionMonsterEncounterManifest = { encounterId, seed: old.rngCursor,
    areas: ruinsTile(old.tileId).areas.map(a => ({ id: a.id, adjacent: a.adjacent, capacity: a.capacity })),
    heroes: historical.heroes.map(unit => ({ unit, areaId: old.placements[unit.id] })),
    monsters: historical.monsters.map((m, i) => ({ instanceId: m.id,
      definitionId: bindings.find(b => b.canonicalId === old.definitionIds[m.id])!.definitionId,
      stance: m.stance, areaId: old.placements[m.id], physicalCopyId: old.physicalCopyIds[i] })),
    initiative: historical.initiativeOrder };
  const next = initializeProductionMonsterBattle(manifest);
  // Retain room/source/physical contracts; production context is the only Monster action route.
  next.ruinsContext = structuredClone(old);
  next.battleId = historical.battleId;
  next.productionMonsterContext!.rngCursor = old.rngCursor;
  next.productionMonsterContext!.rngCalls = old.rngCalls;
  next.sourceRoomId = historical.sourceRoomId; next.light = historical.light;
  next.necromancerFigureBinding = historical.necromancerFigureBinding;
  return next;
}
