// Phase 10C §12 / §16 / §17 / §24：一次 Initiative Card 行动的统一执行入口。
//
// 这是「Cyst 普通 Skill」与「Stalk 独立回合」的唯一出口，保证：
// - 硬约束 5：召唤触发时**完全替代**普通 Skill —— 该分支不掷 Skill 骰、不结算伤害；
// - 硬约束 12：召唤行动**不得**同时攻击 —— 两个分支互斥（if / else），结构上不可能同时发生；
// - 硬约束 13：Teleportation **只能**由 `triggersTeleportation` 的正式 Skill 触发；
// - 硬约束 14：Skill 骰点先落盘再展示（由 rollMammothCystSkill 保证）；
// - 伤害 / 压力一律走**正式管线**（resolveDamage / applyStress），不直接改 HP / Stress。

import type { CampaignState } from '../../../types';
import type { DataMode } from '../../../types/progression';
import type {
  MammothCystEncounterState,
  D10Roll,
  MammothCystSkillDefinition,
  MammothCystSkillRollRecord,
  TeleportationRecord,
  WhiteCellStalkSummonRecord,
} from '../../../types/mammoth-cyst';
import { resolveDamage } from '../../damage';
import { applyActorHealing } from '../../healing';
import { applyStress } from '../../stress';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import { rollD10 } from '../../campaign/act-four/rng';
import {
  getMammothCystActorState,
  rollMammothCystSkill,
} from './mammoth-cyst-runtime';
import { decideMammothCystAction } from './mammoth-cyst-action-override';
import { summonWhiteCellStalk } from './summon-white-cell-stalk';
import { resolveWhiteCellStalkTeleportation } from './resolve-teleportation';
import { resolveCommunityGuardianCritical } from '../../campaign/act-four/community-engine-capabilities';
import { communitySpecialSkillLeaf } from '../../campaign/act-four/community-guardian-special-skills';
import { applyConditionToHero, createRuleEventContext } from '../../quirks';
import { startDisplacePush } from './room-11-displacement';
import type { MammothCystDisplacementChoice } from '../../../types/mammoth-cyst';
import type { BattleUnit } from '../../../types';

export interface ExecuteMammothCystActionOptions {
  mode?: DataMode | 'community-reference';
  rng: () => number;
  /** Teleportation / 普通攻击的目标 Hero（由调用方按 Boss AI 或调试面板指定）。 */
  targetHeroId?: string;
  /** Required for a source-confirmed allied Monster heal such as Reconstitute. */
  targetMonsterActorId?: string;
  now?: string;
}

export interface ExecuteMammothCystActionResult {
  ok: boolean;
  campaign: CampaignState;
  state: MammothCystEncounterState | null;
  actionType: 'summon-linked-actor' | 'normal-skill' | 'none';
  /** 召唤分支产物。 */
  summonRecord: WhiteCellStalkSummonRecord | null;
  /** 普通 Skill 分支产物。 */
  skillRoll: MammothCystSkillRollRecord | null;
  skill: MammothCystSkillDefinition | null;
  teleportation: TeleportationRecord | null;
  damageDealt: number;
  stressDealt: number;
  /** 硬约束 5 的可观测断言：本次是否跳过了普通 Skill 掷骰。 */
  skippedNormalSkillRoll: boolean;
  /**
   * WP-2/WP-7：Displace Push / 召唤 no-space 出现等距多目的地（来源无 tie-break）时
   * 挂起的显式玩家选择；非 null 表示对应位移尚未完成，等待
   * resolveMammothCystDisplacementChoice / resolveSummonDisplacementChoice 结算。
   */
  pendingChoice: MammothCystDisplacementChoice | null;
  reason: string | null;
}

/**
 * 执行一张 Mammoth Cyst 域 Initiative Card 对应的行动。
 *
 * 分派：
 *   Cyst 且场上无 Stalk → **召唤**（替代普通 Skill，不掷骰、不攻击）
 *   否则                → 掷 d10 → 取 Skill →
 *                          · triggersTeleportation → Teleportation 链路
 *                          · 其他                  → 普通伤害 / 压力（正式管线）
 */
export function executeMammothCystAction(
  campaign: CampaignState,
  initiativeCardId: string,
  options: ExecuteMammothCystActionOptions,
): ExecuteMammothCystActionResult {
  const state = campaign.actFourState.mammothCystEncounterState;
  const mode: DataMode | 'community-reference' = options.mode ?? 'prototype';
  const now = options.now ?? nowIso();

  const base: ExecuteMammothCystActionResult = {
    ok: false,
    campaign,
    state,
    actionType: 'none',
    summonRecord: null,
    skillRoll: null,
    skill: null,
    teleportation: null,
    damageDealt: 0,
    stressDealt: 0,
    skippedNormalSkillRoll: false,
    pendingChoice: null,
    reason: null,
  };

  if (!state) return { ...base, reason: 'Mammoth Cyst Encounter 尚未 Setup' };

  const card = state.initiativeCards.find((c) => c.id === initiativeCardId);
  if (!card) return { ...base, reason: `找不到 Initiative Card ${initiativeCardId}` };

  const saved = state.skillRolls.find(record => record.initiativeCardId === initiativeCardId);
  if (mode === 'community-reference' && saved?.executionCompleted) {
    if (saved.targetHeroId !== options.targetHeroId) return { ...base, reason: 'Saved Community attack target mismatch' };
    const definition = saved.owner === 'mammoth-cyst' ? state.snapshot.mammothCyst : state.snapshot.whiteCellStalk;
    return { ...base, ok: true, actionType: 'normal-skill', skillRoll: saved, skill: definition.skills.find(skill => skill.id === saved.selectedSkillId) ?? null, damageDealt: saved.damageDealt ?? 0, stressDealt: saved.stressDealt ?? 0 };
  }

  const decision = decideMammothCystAction(state, card, mode);
  if (!decision.ok) return { ...base, reason: decision.reason };

  // ------------------------------------------------------------------
  // 分支 A：Conditional Summon（硬约束 5 / 12 —— 不掷骰、不攻击）
  // ------------------------------------------------------------------
  if (decision.actionType === 'summon-linked-actor') {
    const summoned = summonWhiteCellStalk(campaign, {
      mode,
      rng: options.rng,
      now,
      sourceActionEventId: initiativeCardId,
    });
    return {
      ...base,
      ok: summoned.ok,
      campaign: summoned.campaign,
      state: summoned.state,
      actionType: 'summon-linked-actor',
      summonRecord: summoned.record,
      // 显式为空：召唤分支不产生任何 Skill 骰 / 伤害 / 压力。
      skillRoll: null,
      skill: null,
      damageDealt: 0,
      stressDealt: 0,
      skippedNormalSkillRoll: true,
      pendingChoice: summoned.pendingChoice,
      reason: summoned.reason,
    };
  }

  // ------------------------------------------------------------------
  // 分支 B：普通 Skill（含 Stalk 的 Teleportation）
  // ------------------------------------------------------------------
  const rolled = rollMammothCystSkill(state, initiativeCardId, options.rng, { now });
  if (!rolled.ok || !rolled.skill || !rolled.record) {
    return { ...base, actionType: 'normal-skill', reason: rolled.reason };
  }

  let working: CampaignState = {
    ...campaign,
    actFourState: {
      ...campaign.actFourState,
      mammothCystEncounterState: rolled.state,
    },
    updatedAt: now,
  };
  const skill = rolled.skill;
  const actor = getMammothCystActorState(rolled.state, card.actorId);

  // ---- Source-confirmed non-attack healing (shared healing primitive) ----
  if (skill.specialEffect?.type === 'heal-monster') {
    const targetId = skill.specialEffect.target === 'self' ? card.actorId : options.targetMonsterActorId;
    if (!targetId) return { ...base, campaign: working, state: rolled.state, actionType: 'normal-skill', skillRoll: rolled.record, skill, reason: `${skill.name} requires a Monster target` };
    const target = rolled.state.actorStates.find((candidate) => candidate.actorId === targetId);
    // WP-2：dead / unavailable Mammoth 不得静默成功（拒绝且不产生任何治疗效果）。
    if (!target || !target.isAlive) return { ...base, campaign: working, state: rolled.state, actionType: 'normal-skill', skillRoll: rolled.record, skill, reason: `Monster target ${targetId} is unavailable` };
    const localSkillId = skill.id.replace(/^community-dd-skill-/, '');
    const leaf = communitySpecialSkillLeaf(localSkillId);
    // WP-2：来源指定目标的 ally heal（Reconstitute → Mammoth Cyst）不得落到别人身上。
    if (mode === 'community-reference' && 'allySourceId' in leaf && leaf.allySourceId && target.actorDefinitionId !== leaf.allySourceId) {
      return { ...base, campaign: working, state: rolled.state, actionType: 'normal-skill', skillRoll: rolled.record, skill, reason: `${skill.name} 的来源指定目标是 ${leaf.allySourceId}，拒绝治疗 ${target.actorDefinitionId}` };
    }
    const healed = applyActorHealing(target, skill.specialEffect.amount);
    const nextState = { ...rolled.state, actorStates: rolled.state.actorStates.map((candidate) => candidate.actorId === targetId ? healed.actor : candidate) };
    working = pushLog({ ...working, actFourState: { ...working.actFourState, mammothCystEncounterState: nextState } }, `${actor?.name ?? 'Monster'} uses ${skill.name}: ${target.name} heals ${healed.healed} HP.`, 'success');
    // WP-2：Revivify / Reconstitute 附带 Buff 2 turns（dossier leaf）——投射到 Battle 层单位。
    if (mode === 'community-reference' && 'buffTurns' in leaf && leaf.buffTurns) {
      working = withCommunityBattleUnitEffect(working, targetId, 'buff', leaf.buffTurns);
    }
    return { ...base, ok: true, campaign: working, state: nextState, actionType: 'normal-skill', skillRoll: rolled.record, skill, reason: null };
  }

  // ---- Teleportation 分支（硬约束 13：只由正式 Skill 触发）----
  if (skill.triggersTeleportation) {
    if (!options.targetHeroId) {
      return {
        ...base,
        campaign: working,
        state: rolled.state,
        actionType: 'normal-skill',
        skillRoll: rolled.record,
        skill,
        reason: 'Teleportation 需要指定目标 Hero',
      };
    }
    let teleWorking = working;
    let teleRecord = rolled.record;
    // WP-2：community 卡面语义 = attack hit → Stress +2 → Room 11 d10 teleport。
    // 先落命中骰（持续化进 SkillRollRecord，Save/Replay 复用），miss 则传送不发生。
    if (mode === 'community-reference') {
      const hitRoll = rollD10(options.rng);
      const requirementId = card.owner === 'mammoth-cyst' ? 'tierB-mammoth-cyst' : 'tierB-white-cell-stalk';
      const localSkillId = skill.id.replace(/^community-dd-skill-/, '');
      const outcome = resolveCommunityGuardianCritical(requirementId, localSkillId, hitRoll, skill.accuracy ?? 0, 0);
      teleRecord = {
        ...rolled.record,
        attackRoll: hitRoll as D10Roll,
        hit: outcome.hit,
        critical: outcome.critical,
        resolvedDamage: 0,
        targetHeroId: options.targetHeroId,
        executionCompleted: true,
        damageDealt: 0,
        stressDealt: outcome.hit ? skill.stress : 0,
      };
      const persisted = {
        ...rolled.state,
        skillRolls: rolled.state.skillRolls.map((record) => (record.transactionId === teleRecord.transactionId ? teleRecord : record)),
      };
      teleWorking = { ...working, actFourState: { ...working.actFourState, mammothCystEncounterState: persisted } };
      if (!outcome.hit) {
        return {
          ...base,
          ok: true,
          campaign: pushLog(teleWorking, `${actor?.name ?? '怪物'} 的 ${skill.name} 未命中（命中骰 ${hitRoll}），传送未发生。`, 'info'),
          state: persisted,
          actionType: 'normal-skill',
          skillRoll: teleRecord,
          skill,
          reason: null,
        };
      }
      // 命中 → Stress +2（Skill 卡面，与传送同源事件链）。
      if (skill.stress > 0) {
        const out = applyStress(teleWorking, {
          heroId: options.targetHeroId,
          amount: skill.stress,
          sourceType: 'battle-skill',
          sourceId: skill.id,
          questId: teleWorking.currentQuestId ?? '',
          battleId: state.battleId,
          batchId: `mammoth-cyst-teleport-stress:${state.battleId}:${initiativeCardId}`,
        });
        teleWorking = out.campaign;
      }
    }
    const tele = resolveWhiteCellStalkTeleportation(teleWorking, {
      sourceActorId: card.actorId,
      targetHeroId: options.targetHeroId,
      skill,
      sourceSkillEventId: initiativeCardId,
      sourceEffectEventId: `${initiativeCardId}:${options.targetHeroId}`,
      rng: options.rng,
      now,
    });
    return {
      ...base,
      ok: tele.ok,
      campaign: tele.campaign,
      state: tele.state,
      actionType: 'normal-skill',
      skillRoll: teleRecord,
      skill,
      teleportation: tele.record,
      reason: tele.reason,
      stressDealt: tele.ok ? skill.stress : 0,
    };
  }

  // ---- 普通伤害 / 压力（Cyst Normal Skill，§24）----
  if (!options.targetHeroId) {
    return {
      ...base,
      campaign: working,
      state: rolled.state,
      actionType: 'normal-skill',
      skillRoll: rolled.record,
      skill,
      reason: `${skill.name} 需要指定目标 Hero`,
    };
  }
  if (skill.requiresHit === null) {
    return {
      ...base,
      campaign: working,
      state: rolled.state,
      actionType: 'normal-skill',
      skillRoll: rolled.record,
      skill,
      reason: `Skill ${skill.id} 的命中判定未核对（requiresHit=null），拒绝结算`,
    };
  }

  const hero = working.heroes.find((h) => h.instanceId === options.targetHeroId);
  if (!hero || hero.dead) {
    return {
      ...base,
      campaign: working,
      state: rolled.state,
      actionType: 'normal-skill',
      skillRoll: rolled.record,
      skill,
      reason: `目标 Hero ${options.targetHeroId} 不可用`,
    };
  }

  // 命中判定：requiresHit=true 时掷 d10 与 accuracy 比较（沿用既有 d10 命中语义）。
  let hit = true;
  let hitRoll: number | null = null;
  let critical = false;
  let resolvedAttackDamage: number | null = null;
  let actionRecord = rolled.record;
  if (mode === 'community-reference' && rolled.record.attackRoll !== undefined) {
    hitRoll = rolled.record.attackRoll;
    hit = rolled.record.hit ?? false;
    critical = rolled.record.critical ?? false;
    resolvedAttackDamage = rolled.record.resolvedDamage ?? 0;
  } else if (skill.requiresHit && skill.accuracy !== null) {
    hitRoll = rollD10(options.rng);
    if (mode === 'community-reference') {
      const requirementId = card.owner === 'mammoth-cyst' ? 'tierB-mammoth-cyst' : 'tierB-white-cell-stalk';
      const localSkillId = skill.id.replace(/^community-dd-skill-/, '');
      const normalDamage = skill.minDamage ?? 0;
      const outcome = resolveCommunityGuardianCritical(requirementId, localSkillId, hitRoll, skill.accuracy, normalDamage);
      hit = outcome.hit;
      critical = outcome.critical;
      resolvedAttackDamage = outcome.damage;
      actionRecord = { ...rolled.record, attackRoll: hitRoll as D10Roll, hit, critical, resolvedDamage: resolvedAttackDamage, targetHeroId: options.targetHeroId };
      const persistedState = { ...rolled.state, skillRolls: rolled.state.skillRolls.map((record) => record.transactionId === actionRecord.transactionId ? actionRecord : record) };
      working = { ...working, actFourState: { ...working.actFourState, mammothCystEncounterState: persistedState } };
    } else {
      hit = hitRoll === 10 || hitRoll <= skill.accuracy;
    }
  }

  let damageDealt = 0;
  let stressDealt = 0;

  if (hit && skill.maxDamage !== null && skill.minDamage !== null && skill.maxDamage > 0) {
    // 伤害量：min—max 间由注入 rng 决定（禁止 Math.random）。
    const span = Math.max(0, skill.maxDamage - skill.minDamage);
    const amount = resolvedAttackDamage ?? (skill.minDamage + Math.floor(options.rng() * (span + 1)));
    if (amount > 0) {
      const out = resolveDamage(working, {
        targetId: options.targetHeroId,
        amount,
        sourceType: 'attack',
        sourceSkillId: skill.id,
        eventId: `mammoth-cyst-skill-damage:${state.battleId}:${initiativeCardId}`,
      });
      working = out.campaign;
      damageDealt = Math.max(0, out.resolution.previousHp - out.resolution.nextHp);
    }
  }

  if (hit && skill.stress > 0) {
    const out = applyStress(working, {
      heroId: options.targetHeroId,
      amount: skill.stress,
      sourceType: 'battle-skill',
      sourceId: skill.id,
      questId: working.currentQuestId ?? '',
      battleId: state.battleId,
      batchId: `mammoth-cyst-skill-stress:${state.battleId}:${initiativeCardId}`,
    });
    working = out.campaign;
    stressDealt = out.result.appliedAmount;
  }

  // WP-2：Community 卡面特殊语义（dossier leaf）——Debuff / Blight / Displace Push。
  // 仅在命中后结算；Debuff 投射到 Battle 层单位，Blight 走正式 condition 管线，
  // Push 走 Room 11 派生拓扑（等距多目的地挂起显式玩家选择，绝不随机）。
  let pendingChoice: MammothCystDisplacementChoice | null = null;
  if (mode === 'community-reference' && hit) {
    const localSkillId = skill.id.replace(/^community-dd-skill-/, '');
    const leaf = communitySpecialSkillLeaf(localSkillId);
    const heroBattleId = working.battle?.heroes.find((unit) => unit.sourceId === options.targetHeroId)?.id;
    if ('debuffTurns' in leaf && leaf.debuffTurns && heroBattleId) {
      working = withCommunityBattleUnitEffect(working, heroBattleId, 'debuff', leaf.debuffTurns);
    }
    if ('blight' in leaf && leaf.blight) {
      working = applyConditionToHero(working, options.targetHeroId, 'blight', leaf.blight.amount, leaf.blight.durationTurns, skill.name, createRuleEventContext());
    }
    if ('pushDistance' in leaf && leaf.pushDistance) {
      const push = startDisplacePush(working, {
        heroId: options.targetHeroId,
        awayFromActorId: card.actorId,
        distance: leaf.pushDistance,
        sourceActionEventId: initiativeCardId,
        now,
      });
      working = push.campaign;
      pendingChoice = push.pendingChoice;
    }
  }

  if (mode === 'community-reference') {
    actionRecord = { ...actionRecord, targetHeroId: options.targetHeroId, executionCompleted: true, damageDealt, stressDealt };
    const completed = working.actFourState.mammothCystEncounterState!;
    working = { ...working, actFourState: { ...working.actFourState, mammothCystEncounterState: { ...completed, skillRolls: completed.skillRolls.map(record => record.transactionId === actionRecord.transactionId ? actionRecord : record) } } };
  }

  working = pushLog(
    working,
    hit
      ? `${actor?.name ?? '怪物'} 使用 ${skill.name}${critical ? '（暴击）' : ''}（d10=${rolled.record.roll}${
          hitRoll !== null ? `，命中骰 ${hitRoll}` : ''
        }）：对 ${hero.name} 造成 ${damageDealt} 伤害、${stressDealt} 压力。`
      : `${actor?.name ?? '怪物'} 的 ${skill.name} 未命中 ${hero.name}（命中骰 ${hitRoll}）。`,
    hit ? 'danger' : 'info',
  );

  return {
    ...base,
    ok: true,
    campaign: working,
    state: working.actFourState.mammothCystEncounterState,
    actionType: 'normal-skill',
    skillRoll: actionRecord,
    skill,
    damageDealt,
    stressDealt,
    skippedNormalSkillRoll: false,
    pendingChoice,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// WP-2 helpers
// ---------------------------------------------------------------------------

/**
 * Community 特殊语义在 Battle 层的投射：给指定 BattleUnit 附加 Buff/Debuff（持续回合）。
 * Battle 未激活或单位不存在时原样返回（不产生任何效果）。
 */
function withCommunityBattleUnitEffect(
  campaign: CampaignState,
  unitId: string,
  kind: 'buff' | 'debuff',
  durationTurns: number,
): CampaignState {
  const battle = campaign.battle;
  if (!battle) return campaign;
  const apply = (unit: BattleUnit): BattleUnit => {
    const effect = { type: kind, amount: 0, durationTurns };
    return kind === 'buff'
      ? { ...unit, buffs: [...unit.buffs, effect] }
      : { ...unit, debuffs: [...unit.debuffs, effect] };
  };
  return {
    ...campaign,
    battle: {
      ...battle,
      heroes: battle.heroes.map((unit) => (unit.id === unitId ? apply(unit) : unit)),
      monsters: battle.monsters.map((unit) => (unit.id === unitId ? apply(unit) : unit)),
    },
  };
}
