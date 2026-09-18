import type { ActiveEffect, BattleState, BattleUnit, CampaignState, Stance } from '../../../types';
import type { ReflectionKind } from '../../../types/final-forms';
import { applyBattleUnitDamage } from '../../damage';
import { applyStatusEffectEvent } from '../../status-effects';
import { findUnit } from '../../initiative';
import { d10 } from '../../random';
import { heroUseSkill } from '../../battle';
import { COMMUNITY_RUNTIME_MONSTER_COMPOSITION } from '../../../data/darkest-dungeon/community-reference/runtime-profile';
import {
  COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY,
  type CommunityFinalSkillSourceLeaf,
  type CommunityFinalTargetPolicy,
} from '../../../data/darkest-dungeon/community-reference/community-final-skill-source-inventory';
import { blockCommunityOperation } from '../../../data/darkest-dungeon/community-reference/runtime-profile';
import { getVacantReflectionStances } from './final-forms/ancestor-first-form';
import {
  applyFinalFormReflectionDeath,
  consumeFinalFormImpendingDoom,
  generateFinalFormImpendingDoom,
  performFinalFormSispersion,
  resolveFinalFormAncestorStance,
  rollFinalFormAncestorTeleport,
  applyFinalFormWoundedReaction,
} from './final-forms/final-form-actions';
import { defeatFinalForm } from './final-form-sequence';
import { getAreaFreeSpace } from './final-forms/ancestor-second-form';
import { getAncestorRoomAreaDefinition } from '../../../data/darkest-dungeon/final-encounter';
import {
  COMMUNITY_FINAL_FORM_SOURCE,
  communityFinalFormUnit,
  isCommunityFinalBattle,
  makeCommunityFinalActor,
  materializeCommunityFinalBattle,
} from './community-final-actors';

export { COMMUNITY_FINAL_FORM_SOURCE, communityFinalFormUnit, isCommunityFinalBattle, materializeCommunityFinalBattle };

function asRng() {
  return () => (d10() - 0.5) / 10;
}

function setUnit(state: BattleState, unit: BattleUnit): BattleState {
  return {
    ...state,
    heroes: state.heroes.map((candidate) => (candidate.id === unit.id ? unit : candidate)),
    monsters: state.monsters.map((candidate) => (candidate.id === unit.id ? unit : candidate)),
  };
}

function withDuration(unit: BattleUnit, kind: 'buff' | 'debuff' | 'mark', turns: number): BattleUnit {
  if (kind === 'mark') return { ...unit, marked: true };
  const effect = { type: kind, amount: 0, durationTurns: turns };
  if (kind === 'buff') return { ...unit, buffs: [...unit.buffs, effect] };
  return { ...unit, debuffs: [...unit.debuffs, effect] };
}

function makeActor(id: string, name: string, sourceId: string, hp: number, stance: Stance, position: number, skills: string[]): BattleUnit {
  return makeCommunityFinalActor(id, name, sourceId, hp, stance, position, skills);
}

function leafFor(actorId: string, localSkillId: string): CommunityFinalSkillSourceLeaf {
  const found = COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.find((leaf) => leaf.actorId === actorId && leaf.localSkillId === localSkillId);
  if (!found) throw new Error(`Missing Final source leaf ${actorId}:${localSkillId}`);
  return found;
}

function resolveFinalCritical(leaf: CommunityFinalSkillSourceLeaf, roll: number) {
  if (!leaf.attack || leaf.accuracy === null || leaf.damage === null) return { hit: true, critical: false, damage: 0, roll };
  const hit = roll <= leaf.accuracy;
  const critical = hit && !!leaf.crit && leaf.crit.threshold > 0 && roll <= leaf.crit.threshold;
  const damage = !hit ? 0 : critical && leaf.crit ? leaf.crit.damage : leaf.damage;
  return { hit, critical, damage, roll };
}

function compareId(a: BattleUnit, b: BattleUnit): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function livingHeroes(state: BattleState): BattleUnit[] {
  return state.heroes.filter((hero) => hero.isAlive);
}

function pickByPolicy(state: BattleState, policy: CommunityFinalTargetPolicy, count: number): BattleUnit[] {
  const heroes = livingHeroes(state);
  if (heroes.length === 0 || policy === 'none') return [];
  const closest = [...heroes].sort((a, b) => a.position - b.position || compareId(a, b));
  const furthest = [...heroes].sort((a, b) => b.position - a.position || compareId(a, b));
  const stressed = [...heroes].sort((a, b) => b.stress - a.stress || a.position - b.position || compareId(a, b));
  const wounded = [...heroes].sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp) || compareId(a, b));
  if (policy === 'closest') return closest.slice(0, count);
  if (policy === 'furthest') return furthest.slice(0, count);
  if (policy === 'most-stressed') return stressed.slice(0, count);
  if (policy === 'most-wounded-hero') return wounded.slice(0, count);
  if (policy === 'marked-then-closest') {
    const marked = closest.filter((hero) => hero.marked);
    return (marked.length > 0 ? marked : closest).slice(0, count);
  }
  if (policy === 'crowded') {
    const groups = new Map<Stance, BattleUnit[]>();
    for (const hero of heroes) {
      const list = groups.get(hero.stance) ?? [];
      list.push(hero);
      groups.set(hero.stance, list);
    }
    const ranked = [...groups.values()].sort((a, b) => b.length - a.length || a[0].position - b[0].position);
    return (ranked[0] ?? []).sort((a, b) => a.position - b.position || compareId(a, b)).slice(0, count);
  }
  return [];
}

function mostWoundedMonster(state: BattleState, selfId: string): BattleUnit | null {
  return state.monsters
    .filter((unit) => unit.isAlive && unit.id !== selfId)
    .sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp) || compareId(a, b))[0] ?? null;
}

function applyHitEffects(state: BattleState, target: BattleUnit, leaf: CommunityFinalSkillSourceLeaf, eventId: string, extraDamage = 0): BattleState {
  let next = state;
  let tgt = findUnit(next, target.id) ?? target;
  const effects: ActiveEffect[] = [];
  for (const token of leaf.statusStressEffects) {
    const bleed = token.match(/^bleed (\d+)\/(\d+)$/);
    const blight = token.match(/^blight (\d+)\/(\d+)$/);
    const stun = token.match(/^stun (\d+)t$/);
    const mark = token.match(/^mark (\d+)t$/);
    const debuff = token.match(/^debuff (\d+)t$/);
    const stress = token.match(/^stress\+(\d+)$/);
    if (bleed) effects.push({ type: 'bleed', amount: Number(bleed[1]), durationTurns: Number(bleed[2]) });
    if (blight) effects.push({ type: 'blight', amount: Number(blight[1]), durationTurns: Number(blight[2]) });
    if (stun) effects.push({ type: 'stun', amount: Number(stun[1]), durationTurns: Number(stun[1]) });
    if (mark) tgt = withDuration(tgt, 'mark', Number(mark[1]));
    if (debuff) tgt = withDuration(tgt, 'debuff', Number(debuff[1]));
    if (stress) tgt = { ...tgt, stress: Math.min(10, tgt.stress + Number(stress[1])) };
  }
  next = setUnit(next, tgt);
  if (effects.length > 0) next = applyStatusEffectEvent(next, tgt.id, effects, `${eventId}:effects`);
  if (leaf.specialEffect.includes('push 2')) {
    const moved = findUnit(next, tgt.id);
    if (moved) next = setUnit(next, { ...moved, position: Math.min(4, moved.position + 2) });
  }
  if (extraDamage > 0) {
    const current = findUnit(next, tgt.id);
    if (current) {
      const applied = applyBattleUnitDamage(current, extraDamage);
      next = setUnit(next, applied.unit);
    }
  }
  return next;
}

function recordEvent(state: BattleState, event: NonNullable<BattleState['communityAttackEvents']>[number]): BattleState {
  return { ...state, communityAttackEvents: [...(state.communityAttackEvents ?? []), event] };
}

function eventIdFor(state: BattleState, actorId: string): string {
  return `community-final:${state.battleId}:${state.round}:${state.initiativeIndex}:${actorId}`;
}

function attachSpawnedReflection(campaign: CampaignState, reflectionId: string, kind: ReflectionKind, stance: Stance): CampaignState {
  const battle = campaign.battle;
  if (!battle) return campaign;
  const existingDead = battle.monsters.find((unit) => unit.sourceId === (kind === 'perfect' ? 'community-dd-perfect-reflection' : 'community-dd-imperfect-reflection') && !unit.isAlive);
  const unit = makeActor(
    reflectionId,
    kind === 'perfect' ? 'Perfect Reflection' : 'Imperfect Reflection',
    kind === 'perfect' ? 'community-dd-perfect-reflection' : 'community-dd-imperfect-reflection',
    kind === 'perfect' ? 24 : 19,
    stance,
    2,
    kind === 'perfect' ? ['reunion', 'we-are-the-same'] : ['it-chooses', 'we-are-the-same'],
  );
  if (existingDead) {
    return {
      ...campaign,
      battle: {
        ...battle,
        monsters: battle.monsters.map((candidate) => (candidate.id === existingDead.id ? { ...unit, id: existingDead.id } : candidate)),
      },
    };
  }
  return {
    ...campaign,
    battle: {
      ...battle,
      monsters: [...battle.monsters, unit],
      initiativeOrder: [...battle.initiativeOrder, unit.id],
    },
  };
}

function executeAttack(campaign: CampaignState, actor: BattleUnit, leaf: CommunityFinalSkillSourceLeaf, eventId: string, skillRoll: number): CampaignState {
  const battle = campaign.battle!;
  const saved = battle.communityAttackEvents?.find((event) => event.eventId === eventId);
  if (saved) return campaign;
  let nextBattle = battle;
  const targets = leaf.attack ? pickByPolicy(nextBattle, leaf.targetPolicy, leaf.multiTargetCount) : [];
  const attackRoll = leaf.attack ? d10() : 0;
  const outcome = resolveFinalCritical(leaf, attackRoll);
  let damage = 0;
  if (leaf.attack && outcome.hit) {
    for (const target of targets) {
      const markedBonus = leaf.specialEffect.includes('+3 damage vs Marked') && target.marked ? 3 : 0;
      damage = outcome.damage + markedBonus;
      const applied = applyBattleUnitDamage(findUnit(nextBattle, target.id) ?? target, damage);
      nextBattle = setUnit(nextBattle, applied.unit);
      nextBattle = applyHitEffects(nextBattle, applied.unit, leaf, `${eventId}:${target.id}`);
    }
    if (leaf.specialEffect.includes('light-1')) {
      nextBattle = { ...nextBattle, light: Math.max(0, (nextBattle.light ?? 0) - 1) };
    }
  }
  if (!leaf.attack && leaf.localSkillId === 'time-heals-all') {
    const patient = mostWoundedMonster(nextBattle, actor.id);
    if (patient) {
      nextBattle = setUnit(nextBattle, { ...patient, hp: Math.min(patient.maxHp, patient.hp + 10) });
    }
  }
  nextBattle = recordEvent(nextBattle, {
    eventId,
    monsterId: actor.id,
    skillId: leaf.localSkillId,
    targetId: targets[0]?.id ?? '',
    skillRoll,
    attackRoll,
    hit: outcome.hit,
    critical: outcome.critical,
    damage,
    healAmount: leaf.localSkillId === 'time-heals-all' ? 10 : 0,
  });
  return { ...campaign, battle: nextBattle };
}

function runAncestorFirstTurn(campaign: CampaignState, actor: BattleUnit, eventId: string): CampaignState {
  const runtime = campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-first-form'];
  if (!runtime || runtime.kind !== 'ancestor-first-form') return campaign;
  if (actor.sourceId === COMMUNITY_FINAL_FORM_SOURCE['ancestor-first-form']) {
    const vacant = getVacantReflectionStances(runtime);
    if (vacant.length === 0) {
      const sequence = runtime.stanceResolutionHistory.length + 1;
      const resolved = resolveFinalFormAncestorStance(campaign, sequence, { mode: 'community-reference' });
      let next = executeAttack(resolved.campaign, actor, leafFor('ancestor-first-form', 'time-heals-all'), eventId, 0);
      return materializeCommunityFinalBattle(next);
    }
    const skillRoll = d10();
    const fillKind: ReflectionKind = skillRoll <= 3 ? 'perfect' : 'imperfect';
    const sequence = runtime.stanceResolutionHistory.length + 1;
    const resolved = resolveFinalFormAncestorStance(campaign, sequence, {
      mode: 'community-reference',
      fillKind,
      d10Roll: skillRoll,
      fillOneStance: true,
    });
    const spawned = resolved.spawnedReflections[0];
    let next = spawned ? attachSpawnedReflection(resolved.campaign, spawned.id, spawned.kind, spawned.stance) : resolved.campaign;
    next = executeAttack(next, actor, leafFor('ancestor-first-form', fillKind === 'perfect' ? 'perfect-replication' : 'imperfect-reproduction'), eventId, skillRoll);
    return materializeCommunityFinalBattle(next);
  }
  const kind = actor.sourceId.includes('imperfect') ? 'imperfect-reflection' : 'perfect-reflection';
  const skillRoll = d10();
  const local = skillRoll <= 5
    ? (kind === 'perfect-reflection' ? 'reunion' : 'it-chooses')
    : 'we-are-the-same';
  return executeAttack(campaign, actor, leafFor(kind, local), eventId, skillRoll);
}

function occupancyByArea(campaign: CampaignState): Record<string, number> {
  const battle = campaign.battle;
  if (!battle) return {};
  const room = getAncestorRoomAreaDefinition('community-reference');
  const counts: Record<string, number> = {};
  for (const unit of [...battle.heroes, ...battle.monsters].filter((item) => item.isAlive)) {
    const areaId = room.stanceAreaMap[unit.stance];
    if (!areaId) continue;
    counts[areaId] = (counts[areaId] ?? 0) + 1;
  }
  return counts;
}

function runAncestorSecondTurn(campaign: CampaignState, actor: BattleUnit, eventId: string): CampaignState {
  const skillRoll = d10();
  const local = skillRoll <= 2 ? 'refashion-them' : skillRoll <= 6 ? 'unmake-them-all' : 'embrace-futility';
  let next = executeAttack(campaign, actor, leafFor('ancestor-second-form', local), eventId, skillRoll);
  const sequence = (next.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form']?.kind === 'ancestor-second-form'
    ? next.actFourState.finalFormRuntimeState!.runtimes['ancestor-second-form']!.teleportHistory.length
    : 0) + 1;
  const teleported = rollFinalFormAncestorTeleport(next, sequence, {
    mode: 'community-reference',
    rng: asRng(),
    occupancy: { externalOccupancyByArea: occupancyByArea(next) },
  });
  next = teleported.campaign;
  const runtime = next.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form'];
  if (runtime?.kind === 'ancestor-second-form' && next.battle && teleported.record && !teleported.record.blockedReason) {
    const moved = teleported.record.teleported ? teleported.record.resultStance : runtime.currentStance;
    if (moved) {
      next = {
        ...next,
        battle: {
          ...next.battle,
          monsters: next.battle.monsters.map((unit) => unit.id === actor.id ? { ...unit, stance: moved } : unit),
        },
      };
    }
  }
  return next;
}

function runGestatingTurn(campaign: CampaignState, actor: BattleUnit, eventId: string): CampaignState {
  const runtime = campaign.actFourState.finalFormRuntimeState?.runtimes['gestating-heart'];
  const sequence = runtime?.kind === 'gestating-heart' ? runtime.sispersionHistory.length + 1 : 1;
  const occupied = new Set(campaign.battle!.monsters.filter((unit) => unit.isAlive).map((unit) => unit.stance));
  const result = performFinalFormSispersion(campaign, sequence, {
    mode: 'community-reference',
    rng: asRng(),
    input: { occupiedStances: [...occupied], occupancyByArea: occupancyByArea(campaign) },
  });
  let next = result.campaign;
  const record = result.record;
  if (result.ok && record && next.battle) {
    const printed = COMMUNITY_RUNTIME_MONSTER_COMPOSITION.find((monster) => monster.id === record.monsterDefinitionId);
    const summon = makeActor(
      `final-sispersion-${record.transactionId}`,
      printed?.printedName ?? record.monsterDefinitionId,
      record.monsterDefinitionId,
      1,
      record.stance,
      2,
      [],
    );
    const already = next.battle.monsters.some((unit) => unit.id === summon.id);
    next = {
      ...next,
      battle: {
        ...next.battle,
        monsters: already ? next.battle.monsters : [...next.battle.monsters, summon],
        initiativeOrder: already || next.battle.initiativeOrder.includes(summon.id)
          ? next.battle.initiativeOrder
          : [...next.battle.initiativeOrder, summon.id],
      },
    };
  }
  return {
    ...next,
    battle: next.battle ? recordEvent(next.battle, {
      eventId,
      monsterId: actor.id,
      skillId: 'dispersion',
      targetId: result.record?.monsterDefinitionId ?? '',
      skillRoll: 0,
      attackRoll: 0,
      hit: true,
      critical: false,
      damage: 0,
      summonedRoles: result.record ? [result.record.monsterDefinitionId] : [],
    }) : next.battle,
  };
}

function runHeartTurn(campaign: CampaignState, actor: BattleUnit, eventId: string): CampaignState {
  const consumed = consumeFinalFormImpendingDoom(campaign, { mode: 'community-reference', rng: asRng() });
  const skillId = consumed.skillIdToCast?.replace(/^community-dd-skill-/, '') ?? '';
  const leaf = COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.find((item) => item.actorId === 'heart-of-darkness' && item.localSkillId === skillId);
  let next = consumed.campaign;
  if (leaf) next = executeAttack(next, actor, leaf, eventId, consumed.forecast?.roll ?? 0);
  const generated = generateFinalFormImpendingDoom(next, { mode: 'community-reference', rng: asRng() });
  return generated.campaign;
}

export interface CommunityFinalTurnResult {
  ok: boolean;
  campaign: CampaignState;
  actorId: string;
  skillId: string | null;
  alreadyProcessed: boolean;
  reason: string | null;
}

export function runCommunityFinalFormTurn(campaign: CampaignState, actorId: string): CommunityFinalTurnResult {
  const prepared = materializeCommunityFinalBattle(campaign);
  const battle = prepared.battle;
  const actor = battle ? findUnit(battle, actorId) : null;
  const formId = prepared.actFourState.finalEncounterState?.activeFormId;
  if (!battle || !actor || !actor.isAlive || actor.side !== 'monster' || !formId) {
    return { ok: false, campaign, actorId, skillId: null, alreadyProcessed: false, reason: 'Final actor is not active' };
  }
  const eventId = eventIdFor(battle, actorId);
  if (battle.communityAttackEvents?.some((event) => event.eventId === eventId)) {
    return { ok: true, campaign: prepared, actorId, skillId: battle.communityAttackEvents.find((event) => event.eventId === eventId)?.skillId ?? null, alreadyProcessed: true, reason: null };
  }
  if (actor.stunned > 0) {
    return { ok: true, campaign: { ...prepared, battle: recordEvent(battle, { eventId, monsterId: actor.id, skillId: 'stunned', targetId: '', skillRoll: 0, attackRoll: 0, hit: false, critical: false, damage: 0 }) }, actorId, skillId: 'stunned', alreadyProcessed: false, reason: null };
  }
  let next = prepared;
  if (formId === 'ancestor-first-form') next = runAncestorFirstTurn(next, actor, eventId);
  else if (formId === 'ancestor-second-form' && actor.sourceId === COMMUNITY_FINAL_FORM_SOURCE[formId]) next = runAncestorSecondTurn(next, actor, eventId);
  else if (formId === 'gestating-heart' && actor.sourceId === COMMUNITY_FINAL_FORM_SOURCE[formId]) next = runGestatingTurn(next, actor, eventId);
  else if (formId === 'heart-of-darkness' && actor.sourceId === COMMUNITY_FINAL_FORM_SOURCE[formId]) next = runHeartTurn(next, actor, eventId);
  else {
    return { ok: true, campaign: { ...prepared, battle: recordEvent(battle, { eventId, monsterId: actor.id, skillId: 'skip', targetId: '', skillRoll: 0, attackRoll: 0, hit: false, critical: false, damage: 0 }) }, actorId, skillId: 'skip', alreadyProcessed: false, reason: null };
  }
  const last = next.battle?.communityAttackEvents?.find((event) => event.eventId === eventId);
  return { ok: true, campaign: materializeCommunityFinalBattle(next), actorId, skillId: last?.skillId ?? null, alreadyProcessed: false, reason: null };
}

export function resolveCommunityFinalDeaths(campaign: CampaignState): CampaignState {
  if (!isCommunityFinalBattle(campaign) || !campaign.battle) return campaign;
  let next = campaign;
  const formId = next.actFourState.finalEncounterState!.activeFormId!;
  const formUnit = communityFinalFormUnit(next.battle!, formId);
  for (const unit of next.battle!.monsters.filter((monster) => !monster.isAlive && monster.sourceId.includes('reflection'))) {
    const death = applyFinalFormReflectionDeath(next, unit.id, { mode: 'community-reference' });
    next = death.campaign;
    if (death.ancestorWounds > 0 && formUnit) {
      const ancestor = next.battle?.monsters.find((monster) => monster.id === formUnit.id);
      if (ancestor) {
        const applied = applyBattleUnitDamage(ancestor, death.ancestorWounds);
        next = { ...next, battle: setUnit(next.battle!, applied.unit) };
      }
    }
  }
  const after = communityFinalFormUnit(next.battle!, formId);
  if (after && !after.isAlive) {
    const defeated = defeatFinalForm(next, formId);
    if (defeated.ok) next = defeated.campaign;
  }
  return materializeCommunityFinalBattle(next);
}

export function applyCommunityFinalHeroSkill(
  campaign: CampaignState,
  unitId: string,
  skillId: string,
  targetId: string,
): { ok: boolean; campaign: CampaignState; reason: string | null; kind?: 'community-source-blocked' } {
  const prepared = materializeCommunityFinalBattle(campaign);
  const battle = prepared.battle;
  if (!battle) return { ok: false, campaign, reason: 'Final battle missing' };
  const overlay = battle.communityFinal;
  if (overlay?.forbiddenTargetIds.includes(targetId) || (overlay?.guarded && targetId === overlay.ancestorUnitId)) {
    return { ok: false, campaign: prepared, reason: 'illegal Final target' };
  }
  const target = findUnit(battle, targetId);
  const formId = prepared.actFourState.finalEncounterState?.activeFormId;
  const nextBattle = heroUseSkill(battle, unitId, skillId, targetId);
  const afterTarget = findUnit(nextBattle, targetId);
  if (formId === 'gestating-heart' && target?.sourceId === COMMUNITY_FINAL_FORM_SOURCE[formId] && afterTarget && !afterTarget.isAlive) {
    const blocked = blockCommunityOperation('GESTATING_HEART_LETHAL_TIMING_UNRESOLVED');
    return { ok: false, campaign: prepared, reason: blocked.blocker.code, kind: 'community-source-blocked' };
  }
  let next: CampaignState = { ...prepared, battle: nextBattle };
  if (formId === 'gestating-heart' && target?.sourceId === COMMUNITY_FINAL_FORM_SOURCE[formId] && afterTarget) {
    const wounds = Math.max(0, (target.hp ?? 0) - afterTarget.hp);
    if (wounds > 0) {
      const sequence = (next.actFourState.finalFormRuntimeState?.runtimes['gestating-heart']?.kind === 'gestating-heart'
        ? next.actFourState.finalFormRuntimeState!.runtimes['gestating-heart']!.woundedReactionHistory.length
        : 0) + 1;
      const reaction = applyFinalFormWoundedReaction(next, sequence, {
        sourceHeroId: unitId,
        woundsApplied: wounds,
        lethal: false,
      }, { mode: 'community-reference' });
      next = reaction.campaign;
      if (reaction.triggered && reaction.effect && next.battle) {
        const hero = findUnit(next.battle, unitId);
        const heart = communityFinalFormUnit(next.battle, 'gestating-heart');
        let battleState = next.battle;
        if (hero) battleState = applyStatusEffectEvent(battleState, hero.id, [{ type: 'blight', amount: reaction.effect.blightPotency, durationTurns: reaction.effect.blightDurationTurns }], `final-ichor:${sequence}`);
        if (heart) battleState = setUnit(battleState, { ...heart, hp: Math.min(heart.maxHp, heart.hp + reaction.effect.heartHeal) });
        next = { ...next, battle: battleState };
      }
    }
  }
  return { ok: true, campaign: resolveCommunityFinalDeaths(next), reason: null };
}

export function communityFinalLegalHeroTargets(state: BattleState, skillId: string, compute: (battle: BattleState, skill: string) => string[]): string[] {
  const ids = compute(state, skillId);
  const overlay = state.communityFinal;
  if (!overlay) return ids;
  return ids.filter((id) => !overlay.forbiddenTargetIds.includes(id) && !(overlay.guarded && id === overlay.ancestorUnitId));
}

export function getAreaCapacityRemaining(campaign: CampaignState, areaId: string): number {
  const runtime = campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form'];
  if (!runtime || runtime.kind !== 'ancestor-second-form') return 0;
  return getAreaFreeSpace(runtime, getAncestorRoomAreaDefinition('community-reference'), areaId, {
    externalOccupancyByArea: occupancyByArea(campaign),
  });
}
