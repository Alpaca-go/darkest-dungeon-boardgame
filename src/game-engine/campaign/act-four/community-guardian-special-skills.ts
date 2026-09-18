import type { BattleState, BattleUnit, Stance } from '../../../types';
import type { ShufflingHorrorEncounterState } from '../../../types/shuffling-horror';
import { d10, random } from '../../random';
import { applyBattleUnitDamage } from '../../damage';
import { applyStatusEffectEvent } from '../../status-effects';
import { findUnit } from '../../initiative';
import { resolveUndulationsHeroStanceShuffle } from '../../bosses/shuffling-horror/undulations-permutation';
import { COMMUNITY_TEMPLARS_ROOM } from '../../../data/darkest-dungeon/community-reference/production-adapters';

/** Source-backed Guardian special-skill leaves from the accepted Community resolution dossier. */
export const COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES = {
  torment: { attack: true },
  'body-slam': { attack: true, stunTurns: 2, pitToss: true },
  revelation: { attack: true, stress: 2 },
  'stinger-shot': { attack: true, blight: { amount: 3, durationTurns: 3 }, debuffTurns: 2 },
  'bulging-gaze': { attack: true, debuffTurns: 1, stress: 1 },
  digestion: { attack: true, blight: { amount: 3, durationTurns: 2 } },
  revivify: { attack: false, selfHeal: 15, buffTurns: 2 },
  reconstitute: { attack: false, allyHeal: 14, buffTurns: 2, allySourceId: 'community-dd-mammoth-cyst' },
  displace: { attack: true, debuffTurns: 2, pushDistance: 2 },
  teleport: { attack: true, stress: 2, teleport: true },
  lacerate: { attack: true, bleed: { amount: 3, durationTurns: 3 } },
  undulations: { attack: false, undulations: true },
  'echoing-disassembly': { attack: true, stress: 2, lightDelta: -1, echoing: true },
  'death-lash': { attack: true, debuffTurns: 1, stress: 1 },
  'the-finger': { attack: true, bleed: { amount: 3, durationTurns: 3 }, stress: 2, markedBonusDamage: 5 },
  'maul-the-flesh': { attack: true, bleed: { amount: 2, durationTurns: 3 } },
  'daze-the-mind': { attack: true, stunTurns: 2 },
} as const;

export type CommunityGuardianSpecialSkillId = keyof typeof COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES;

export function communitySpecialSkillLeaf(localSkillId: string) {
  return COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES[localSkillId as CommunityGuardianSpecialSkillId] ?? { attack: true };
}

export function markedBonusDamage(localSkillId: string, target: BattleUnit): number {
  const leaf = communitySpecialSkillLeaf(localSkillId);
  if (!('markedBonusDamage' in leaf) || !leaf.markedBonusDamage || !target.marked) return 0;
  return leaf.markedBonusDamage;
}

function setUnit(state: BattleState, unit: BattleUnit): BattleState {
  return {
    ...state,
    heroes: state.heroes.map((candidate) => candidate.id === unit.id ? unit : candidate),
    monsters: state.monsters.map((candidate) => candidate.id === unit.id ? unit : candidate),
  };
}

function withDuration(unit: BattleUnit, kind: 'buff' | 'debuff', turns: number): BattleUnit {
  const effect = { type: kind, amount: 0, durationTurns: turns };
  if (kind === 'buff') return { ...unit, buffs: [...unit.buffs, effect] };
  return { ...unit, debuffs: [...unit.debuffs, effect] };
}

export interface CommunitySpecialSkillResult {
  state: BattleState;
  pitTossRoll: number | null;
  pitTossAreaId: string | null;
  healAmount: number;
  markedBonus: number;
  undulationsBefore: Record<string, Stance> | null;
  undulationsAfter: Record<string, Stance> | null;
}

export function applyCommunityGuardianSpecialSkill(
  state: BattleState,
  monster: BattleUnit,
  target: BattleUnit,
  localSkillId: string,
  eventId: string,
  hit: boolean,
): CommunitySpecialSkillResult {
  const leaf = communitySpecialSkillLeaf(localSkillId);
  let next = state;
  let tgt = findUnit(next, target.id) ?? target;
  let pitTossRoll: number | null = null;
  let pitTossAreaId: string | null = null;
  let healAmount = 0;
  const markedBonus = markedBonusDamage(localSkillId, target);
  let undulationsBefore: Record<string, Stance> | null = null;
  let undulationsAfter: Record<string, Stance> | null = null;

  if ('selfHeal' in leaf && leaf.selfHeal) {
    const healed = Math.min(monster.maxHp - monster.hp, leaf.selfHeal);
    healAmount = Math.max(0, healed);
    let actor = findUnit(next, monster.id) ?? monster;
    actor = { ...actor, hp: Math.min(actor.maxHp, actor.hp + leaf.selfHeal) };
    if ('buffTurns' in leaf && leaf.buffTurns) actor = withDuration(actor, 'buff', leaf.buffTurns);
    next = setUnit(next, actor);
  }

  if ('allyHeal' in leaf && leaf.allyHeal) {
    const ally = next.monsters.find((candidate) => candidate.sourceId === leaf.allySourceId && candidate.isAlive);
    if (ally) {
      healAmount = Math.max(0, Math.min(ally.maxHp - ally.hp, leaf.allyHeal));
      let healed = { ...ally, hp: Math.min(ally.maxHp, ally.hp + leaf.allyHeal) };
      if ('buffTurns' in leaf && leaf.buffTurns) healed = withDuration(healed, 'buff', leaf.buffTurns);
      next = setUnit(next, healed);
    }
  }

  if ('undulations' in leaf && leaf.undulations) {
    const assignments = next.heroes.filter((hero) => hero.isAlive).map((hero) => ({
      heroId: hero.id,
      stance: hero.stance,
      areaId: hero.id,
      hasActedThisRound: false,
    }));
    const shuffled = resolveUndulationsHeroStanceShuffle(
      { heroStanceAssignments: assignments, lastActionLog: [] } as unknown as ShufflingHorrorEncounterState,
      random,
    );
    undulationsBefore = shuffled.before as Record<string, Stance>;
    undulationsAfter = shuffled.after as Record<string, Stance>;
    for (const hero of next.heroes) {
      const stance = shuffled.after[hero.id] as Stance | undefined;
      if (stance) next = setUnit(next, { ...findUnit(next, hero.id)!, stance });
    }
  }

  if (!hit && leaf.attack !== false) {
    return { state: next, pitTossRoll, pitTossAreaId, healAmount, markedBonus, undulationsBefore, undulationsAfter };
  }

  tgt = findUnit(next, target.id) ?? tgt;
  if ('debuffTurns' in leaf && leaf.debuffTurns && tgt.isAlive) {
    tgt = withDuration(tgt, 'debuff', leaf.debuffTurns);
    next = setUnit(next, tgt);
  }

  if ('pitToss' in leaf && leaf.pitToss && tgt.isAlive) {
    pitTossRoll = d10() as number;
    pitTossAreaId = COMMUNITY_TEMPLARS_ROOM.pitTossD10Map[String(pitTossRoll) as unknown as keyof typeof COMMUNITY_TEMPLARS_ROOM.pitTossD10Map] ?? null;
    const applied = applyBattleUnitDamage(tgt, 5);
    tgt = applied.unit;
    next = setUnit(next, tgt);
    if (tgt.isAlive) {
      next = applyStatusEffectEvent(next, tgt.id, [{ type: 'bleed', amount: 3, durationTurns: 3 }], `${eventId}:pit`);
      tgt = findUnit(next, tgt.id) ?? tgt;
    }
  }

  if ('pushDistance' in leaf && leaf.pushDistance && tgt.isAlive) {
    tgt = { ...tgt, position: Math.min(4, Math.max(1, tgt.position + leaf.pushDistance)) };
    next = setUnit(next, tgt);
  }

  if ('lightDelta' in leaf && leaf.lightDelta) {
    next = { ...next, light: Math.max(0, (next.light ?? 0) + leaf.lightDelta) };
  }

  return { state: next, pitTossRoll, pitTossAreaId, healAmount, markedBonus, undulationsBefore, undulationsAfter };
}
