import type { BattleState, BattleUnit, Stance } from '../../../types';
import type { ShufflingHorrorEncounterState } from '../../../types/shuffling-horror';
import { d10, random } from '../../random';
import { findUnit } from '../../initiative';
import { resolveUndulationsHeroStanceShuffle } from '../../bosses/shuffling-horror/undulations-permutation';
import { buildShufflingHorrorBattleUnit } from '../../bosses/shuffling-horror/shuffling-horror-runtime';
import { applyCommunityPitToss } from './community-guardian-room-state';

/** Echoing Disassembly 的条件召唤顺序（asset:450ace:face verified：Priest → Growth）。 */
export const COMMUNITY_ECHOING_SUMMON_ORDER = ['cultist-priest', 'malignant-growth'] as const;

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
  /** asset:f236b8:face「no space → ignore Pit Toss」：true 时 Hero 未移动、未受 Pit 效果。 */
  pitTossIgnored: boolean;
  healAmount: number;
  markedBonus: number;
  undulationsBefore: Record<string, Stance> | null;
  undulationsAfter: Record<string, Stance> | null;
  /** Echoing Disassembly 本次真实召唤进 BattleState 的角色（Priest → Growth 顺序）。 */
  summonedRoles: string[];
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
  let pitTossIgnored = false;
  let healAmount = 0;
  const markedBonus = markedBonusDamage(localSkillId, target);
  let undulationsBefore: Record<string, Stance> | null = null;
  let undulationsAfter: Record<string, Stance> | null = null;
  const summonedRoles: string[] = [];

  if ('echoing' in leaf && leaf.echoing) {
    // asset:450ace:face verified：使用时（on use，不看命中）按 Priest → Growth 顺序
    // 条件召唤「当前不在场」的角色；召唤物立即加入战斗并洗入 Initiative。
    for (const role of COMMUNITY_ECHOING_SUMMON_ORDER) {
      const alreadyInPlay = next.monsters.some((candidate) => candidate.sourceId === `community-dd-${role}` && candidate.isAlive);
      if (alreadyInPlay) continue;
      const unit = buildShufflingHorrorBattleUnit('community-reference', role);
      const insertAt = next.initiativeIndex + 1 + Math.floor(random() * Math.max(1, next.initiativeOrder.length - next.initiativeIndex));
      next = {
        ...next,
        monsters: [...next.monsters, unit],
        initiativeOrder: [...next.initiativeOrder.slice(0, insertAt), unit.id, ...next.initiativeOrder.slice(insertAt)],
      };
      summonedRoles.push(role);
    }
  }

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
    return { state: next, pitTossRoll, pitTossAreaId, pitTossIgnored, healAmount, markedBonus, undulationsBefore, undulationsAfter, summonedRoles };
  }

  tgt = findUnit(next, target.id) ?? tgt;
  if ('debuffTurns' in leaf && leaf.debuffTurns && tgt.isAlive) {
    tgt = withDuration(tgt, 'debuff', leaf.debuffTurns);
    next = setUnit(next, tgt);
  }

  if ('pitToss' in leaf && leaf.pitToss && tgt.isAlive) {
    // WP-1：掷骰 → Room Definition 映射 → 真实位移进 Pit + Definition 驱动的入口效果。
    // 禁止只记录 pit id 不移动；no-space → ignore（asset:f236b8:face），不重掷、不改投。
    pitTossRoll = d10() as number;
    const toss = applyCommunityPitToss(next, tgt, pitTossRoll, `${eventId}:pit-toss`);
    next = toss.state;
    pitTossIgnored = toss.event.ignored;
    pitTossAreaId = toss.event.ignored ? null : toss.event.pitId;
    tgt = findUnit(next, tgt.id) ?? tgt;
  }

  // WP-2：Displace 的 Push 2 只允许沿 Room 11 真实拓扑位移，由 campaign 级
  // executeMammothCystAction 结算（heroPlacements + areaGraph + 容量 + 玩家选择）。
  // Battle 层没有 monster Area 事实来源，绝不用 Battle position ± N 伪造 Push。

  if ('lightDelta' in leaf && leaf.lightDelta) {
    next = { ...next, light: Math.max(0, (next.light ?? 0) + leaf.lightDelta) };
  }

  return { state: next, pitTossRoll, pitTossAreaId, pitTossIgnored, healAmount, markedBonus, undulationsBefore, undulationsAfter, summonedRoles };
}
