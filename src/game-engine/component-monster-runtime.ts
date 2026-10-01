import type { BattleState, MonsterSkillDefinition, ActiveEffect } from '../types';
import type { PrintedMonsterSkill, ProductionMonsterDefinition, SourceMonsterAttack } from '../types/component-combat';
import { areaDistance, recordBossRuntimeEvent, createBossRuntimeChoice, withBossEncounterSources } from './bosses/foundation';
import { resolveProductionMonsterDefinition } from './bosses/component-adapters/bone-combat-adapter';
import { resolveHeroDodge } from './rules/hero-dodge';
import {encounterRuleDependencies} from './bosses/definitions';
import { compareCommunityTargetPriority } from './campaign/act-four/community-monster-targeting';
import { resolveShuffleCount } from './status-effects';
import { rollD10 } from './campaign/act-four/rng';

export function sourceAttackSkill(state: BattleState): MonsterSkillDefinition | undefined {
  return state.pendingMonsterAttack?.sourceAttack?.skill;
}
export function startSourceMonsterAttack(state: BattleState, monsterId: string, targetIds: string[], roll: number,
  source: SourceMonsterAttack): BattleState {
  const targetId = targetIds[0];
  if (!targetId) return state;
  return { ...state, pendingMonsterAttack: {
    kind: 'monster-attack', rootEventId: `${source.parentEventId}:${targetId}`, stage: 'incoming-attack-window',
    monsterUnitId: monsterId, targetHeroUnitId: targetId, skillId: source.skill.id,
    attackRoll: roll, dodgeModifier: 0, hit: null, crit: null, baseDamage: null, criticalOverride: null,
    diseaseRoll: null, incomingDamageNumerator: 1, incomingDamageDenominator: 1, incomingDamageRounding: 'ceil',
    processedTrinketInstanceIds: [], sourceAttack: { ...source, remainingHeroes: targetIds.slice(1) },
  } };
}
export function resolveSourceAttackDodge(state: BattleState): number {
  const pending = state.pendingMonsterAttack!;
  const hero = state.heroes.find(h => h.id === pending.targetHeroUnitId);
  const binding = hero?.heroDodgeBinding;
  if (!hero || !binding || !state.bossEncounter) throw new Error('Source attack Hero Dodge binding absent');
  const resolved = resolveHeroDodge({ heroId: binding.heroId, level: binding.level, ruleSetVersion: encounterRuleDependencies(state.bossEncounter).heroDodgeRuleSetVersion });
  if (JSON.stringify(resolved) !== JSON.stringify(binding)) throw new Error('Source attack Hero Dodge provenance mismatch');
  return resolved.value;
}
export function printedSkillSnapshot(definition: ProductionMonsterDefinition, skill: PrintedMonsterSkill): MonsterSkillDefinition {
  const effects: ActiveEffect[] = [];
  if (skill.targetDebuffTurns) effects.push({ type: 'debuff', amount: 1, durationTurns: skill.targetDebuffTurns });
  if (skill.targetStunTurns) effects.push({ type: 'stun', amount: 1, durationTurns: skill.targetStunTurns });
  return { id: `official:${definition.sourceCardId}:skill:${skill.number}`, monsterId: definition.definitionId,
    name: skill.name, usableFromPositions: [1, 2, 3, 4], validTargetPositions: [1, 2, 3, 4], targetSide: 'enemy',
    accuracy: skill.accuracy, minDamage: skill.damage, maxDamage: skill.critDamage, applyEffects: effects,
    description: `Locked printed component ${definition.sourceCardId}` };
}
/** p24 Area priorities followed by Aggressive-to-Support precedence, independent of array order. */
export function selectPrintedMonsterTargets(state: BattleState, monsterId: string, skill: PrintedMonsterSkill): string[] {
  const e = state.bossEncounter!;
  const heroes = state.heroes.filter(h => h.isAlive).sort(compareCommunityTargetPriority);
  const from = e.placements[monsterId];
  const score = (id: string) => {
    const hero = heroes.find(h => h.id === id)!;
    const distance = areaDistance(e.definition, from, e.placements[id]);
    if (skill.targeting === 'Closest') return -distance;
    if (skill.targeting === 'Furthest') return distance;
    if (skill.targeting === 'Most Wounded') return hero.maxHp - hero.hp;
    return heroes.filter(h => e.placements[h.id] === e.placements[id]).length;
  };
  const maximum = Math.max(...heroes.map(h => score(h.id)));
  const priority = heroes.find(h => score(h.id) === maximum);
  if (!priority) return [];
  return [priority, ...heroes.filter(h => h.id !== priority.id && e.placements[h.id] === e.placements[priority.id])].slice(0, skill.targets).map(h => h.id);
}
/** Reuses BattleState, seeded initiative and the existing staged Monster attack executor. */
export function preparePrintedMonsterTurn(state: BattleState, monsterId: string): BattleState {
  if (state.pendingMonsterAttack || state.bossEncounter?.pendingChoice) return state;
  return withBossEncounterSources(structuredClone(state), (b, rng) => {
    const e = b.bossEncounter!;
    const monster = b.monsters.find(m => m.id === monsterId && m.isAlive);
    const definition = monster ? e.spawnDefinitions[monster.sourceId] as ProductionMonsterDefinition : undefined;
    if (!monster || !definition?.skills || definition.dataAuthority === 'TEST_FIXTURE') throw new Error('Production Monster definition unavailable');
    const table = definition.stanceSelections[monster.stance];
    if (!table?.length) throw new Error('Production Monster stance unbound');
    const skillRoll = table.length === 1 ? null : rollD10(rng);
    const selection = table.find(row => skillRoll === null || skillRoll >= row.min && skillRoll <= row.max);
    const skill = definition.skills.find(s => s.number === selection?.skill);
    if (!skill) throw new Error('Production Monster skill unbound');
    const parentEventId = recordBossRuntimeEvent(b, 'MONSTER_SKILL_SELECTED', { monsterId, stance: monster.stance, skillRoll, skillNumber: skill.number, sourceCardId: definition.sourceCardId }, [monsterId]);
    const targetIds = selectPrintedMonsterTargets(b, monsterId, skill);
    if (!targetIds.length) return b;
    return continuePrintedMonsterTurn(b, monsterId, skill.number, targetIds, e.placements[targetIds[0]], parentEventId, rng);
  });
}
export function continuePrintedMonsterTurn(b: BattleState, monsterId: string, skillNumber: number, targetIds: string[], targetAreaId: string,
  parentEventId: string, rng: () => number, moved = false): BattleState {
  const e = b.bossEncounter!;
  const monster = b.monsters.find(m => m.id === monsterId)!;
  const definition = e.spawnDefinitions[monster.sourceId] as ProductionMonsterDefinition;
  const skill = definition.skills.find(s => s.number === skillNumber)!;
  const from = e.placements[monsterId];
  const distance = areaDistance(e.definition, from, targetAreaId);
  if (distance !== skill.range && !moved) {
    const occupancy = (area: string) => [...b.heroes, ...b.monsters].filter(u => u.isAlive && e.placements[u.id] === area)
      .reduce((n,u)=>n+(e.spawnDefinitions[u.sourceId]?.occupiedSlots ?? 1),0);
    const destinations = e.definition.areas.filter(a => areaDistance(e.definition, from, a.id) <= monster.speed
      && a.capacity - occupancy(a.id) >= definition.occupiedSlots);
    const best = Math.min(...destinations.map(a=>Math.abs(areaDistance(e.definition,a.id,targetAreaId)-skill.range)), Math.abs(distance-skill.range));
    const candidates = destinations.filter(a=>a.id !== from && Math.abs(areaDistance(e.definition,a.id,targetAreaId)-skill.range) === best);
    if (candidates.length > 1) {
      createBossRuntimeChoice(b, 'CHOICE_PLACEMENT_DESTINATION', candidates.map(a=>a.id), { kind: 'monster-move', monsterId, skillNumber, targetIds, targetAreaId, parentEventId }, undefined, parentEventId);
      return b;
    }
    if (candidates.length === 1) e.placements[monsterId] = candidates[0].id;
  }
  if (areaDistance(e.definition,e.placements[monsterId],targetAreaId) !== skill.range) {
    recordBossRuntimeEvent(b, 'MONSTER_OUT_OF_RANGE', { monsterId, skillNumber }, targetIds, undefined, parentEventId); return b;
  }
  if (skill.selfPull) {
    const old = monster.position;
    monster.position = Math.max(1, old - skill.selfPull);
    for (const other of b.monsters.filter(m=>m.isAlive && m.id!==monsterId && m.position>=monster.position && m.position<old)) {
      other.position += definition.occupiedSlots;
      other.stance = ['aggressive','defensive','ranged','support'][other.position-1] as typeof other.stance;
    }
    monster.stance = ['aggressive','defensive','ranged','support'][monster.position-1] as typeof monster.stance;
    recordBossRuntimeEvent(b, 'MONSTER_SELF_PULL', { count: skill.selfPull, stance: monster.stance }, [monsterId], undefined, parentEventId);
  }
  const attackRoll = rollD10(rng);
  recordBossRuntimeEvent(b, 'MONSTER_ATTACK_ROLLED', { attackRoll }, targetIds, undefined, parentEventId);
  const source: SourceMonsterAttack = {
    skill: printedSkillSnapshot(definition,skill), criticalEnabled: true, criticalThreshold: skill.crit, criticalDamage: skill.critDamage,
    targetPush: skill.targetPush, remainingHeroes: [], alreadyResolvedHeroes: [], successfulHits: [],
    parentEventId, targetAreaId, summonDefinitionId: null, skillNumber,
  };
  if (skill.selfPull) {
    const current = e.placements[monsterId];
    const candidates = legalSpatialShuffleDestinations(b, monsterId, targetIds[0], -skill.selfPull);
    if (candidates.length > 1) {
      createBossRuntimeChoice(b, 'CHOICE_PLACEMENT_DESTINATION', candidates, { kind: 'source-self-move', monsterId, targetIds, attackRoll, source, parentEventId }, undefined, parentEventId);
      return b;
    }
    if (candidates.length === 1) e.placements[monsterId] = candidates[0];
    recordBossRuntimeEvent(b, 'MONSTER_SELF_PULL_AREA', { from: current, to: e.placements[monsterId] }, [monsterId], undefined, parentEventId);
  }
  return startSourceMonsterAttack(b, monsterId, targetIds, attackRoll, source);
}

export function legalSpatialShuffleDestinations(b: BattleState, characterId: string, relativeToId: string, signedCount: number): string[] {
  const e = b.bossEncounter!;
  const from = e.placements[characterId];
  const relative = e.placements[relativeToId];
  const slots = e.spawnDefinitions[b.monsters.find(m=>m.id===characterId)?.sourceId ?? '']?.occupiedSlots ?? 1;
  const distance = areaDistance(e.definition, from, relative);
  return e.definition.areas.filter(a=>areaDistance(e.definition,from,a.id) === Math.abs(signedCount)
    && (signedCount > 0 ? areaDistance(e.definition,a.id,relative) > distance : areaDistance(e.definition,a.id,relative) < distance)
    && a.capacity - [...b.heroes,...b.monsters].filter(u=>u.isAlive && u.id !== characterId && e.placements[u.id]===a.id)
      .reduce((n,u)=>n+(e.spawnDefinitions[u.sourceId]?.occupiedSlots ?? 1),0) >= slots).map(a=>a.id);
}
/** Target Push runs after successful damage/effects; a saved placement choice never recommits damage. */
export function applySourceTargetPush(b: BattleState): BattleState {
  const pending = b.pendingMonsterAttack!;
  const count = pending.sourceAttack!.targetPush;
  const hero = b.heroes.find(h=>h.id===pending.targetHeroUnitId)!;
  const distance = resolveShuffleCount(hero, count);
  if (!distance || !hero.isAlive) return b;
  const old = hero.position;
  hero.position = Math.min(4, old+distance);
  const stances = ['aggressive','defensive','ranged','support'] as const;
  for (const other of b.heroes.filter(h=>h.isAlive && h.id!==hero.id && h.position>old && h.position<=hero.position)) {
    other.position--; other.stance=stances[other.position-1];
  }
  hero.stance=stances[hero.position-1];
  const candidates = legalSpatialShuffleDestinations(b, hero.id, pending.monsterUnitId, distance);
  if (candidates.length > 1) createBossRuntimeChoice(b, 'CHOICE_PLACEMENT_DESTINATION', candidates,
    { kind: 'source-target-push', characterId: hero.id, parentEventId: pending.sourceAttack!.parentEventId }, undefined, pending.sourceAttack!.parentEventId);
  else if (candidates.length===1) b.bossEncounter!.placements[hero.id]=candidates[0];
  recordBossRuntimeEvent(b, 'TARGET_PUSH', { count: distance, position: hero.position, areaId: b.bossEncounter!.placements[hero.id] }, [hero.id], undefined, pending.sourceAttack!.parentEventId);
  return b;
}

/** Save import checks executable snapshots, not only their JSON shape. */
export function validateSourceMonsterAttack(state: BattleState): void {
  const p=state.pendingMonsterAttack;
  if (!p?.sourceAttack) return;
  const e=state.bossEncounter;
  const source=p.sourceAttack;
  const actor=state.monsters.find(m=>m.id===p.monsterUnitId);
  if (!e || !actor || !e.checkpointContext?.heroDodgeBindings || !Number.isInteger(source.skillNumber)) throw new Error('Orphan source attack');
  const parent=e.events.find(event=>event.eventId===source.parentEventId);
  if (!parent || !['SKILL_ROLLED','MONSTER_SKILL_SELECTED'].includes(parent.eventType)) throw new Error('Source attack causal event absent');
  const all=[...source.alreadyResolvedHeroes,p.targetHeroUnitId,...source.remainingHeroes];
  if (!Array.isArray(source.alreadyResolvedHeroes) || !Array.isArray(source.remainingHeroes) || !Array.isArray(source.successfulHits)
    || new Set(all).size!==all.length || all.some(id=>!state.heroes.some(h=>h.id===id))
    || source.successfulHits.some(id=>!source.alreadyResolvedHeroes.includes(id))) throw new Error('Source attack Hero cursor invalid');
  let expectedSkill: MonsterSkillDefinition;
  let criticalEnabled: boolean, criticalThreshold: number, criticalDamage: number, push: number, summon: string|null;
  if (actor.id===e.bossState.actorId) {
    const skill=e.definition.skills.find(s=>s.number===source.skillNumber);
    if (!skill) throw new Error('Boss source Skill absent');
    expectedSkill={ id:'official:'+e.battleCardId+':skill:'+skill.number,monsterId:actor.sourceId,name:skill.name,
      usableFromPositions:[1,2,3,4],validTargetPositions:[1,2,3,4],targetSide:'enemy',accuracy:skill.accuracy,
      minDamage:typeof skill.damage==='number'?skill.damage:0,maxDamage:typeof skill.critDamage==='number'?skill.critDamage:0,
      stress:skill.stress,description:'Frozen C1C28 Boss semantics' };
    criticalEnabled=typeof skill.crit==='number';
    criticalThreshold=typeof skill.crit==='number'?skill.crit:0; criticalDamage=typeof skill.critDamage==='number'?skill.critDamage:0;
    push=0; summon=skill.targetEffect.monster.toLowerCase().replace(/ /g,'-');
  } else {
    const definition=resolveProductionMonsterDefinition(actor.sourceId,e.ruleSetVersion);
    const skill=definition?.skills.find(s=>s.number===source.skillNumber);
    if (!definition || !skill) throw new Error('Monster source Skill absent');
    expectedSkill=printedSkillSnapshot(definition,skill); criticalEnabled=true; criticalThreshold=skill.crit; criticalDamage=skill.critDamage;push=skill.targetPush;summon=null;
  }
  if (JSON.stringify(source.skill)!==JSON.stringify(expectedSkill) || source.criticalThreshold!==criticalThreshold
    || source.criticalEnabled!==criticalEnabled || source.criticalDamage!==criticalDamage || source.targetPush!==push || source.summonDefinitionId!==summon
    || p.skillId!==expectedSkill.id || !e.definition.areas.some(a=>a.id===source.targetAreaId)
    || p.rootEventId!==source.parentEventId+':'+p.targetHeroUnitId) throw new Error('Source attack differs from locked executable definition');
  resolveSourceAttackDodge(state);
}
