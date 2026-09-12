import type {
  BattleState,
  BattleUnit,
  CampaignState,
  HeroInstance,
  MonsterDefinition,
  RuleEventType,
  SkillDefinition,
} from '../types';
import { createId, d10, nowIso } from './random';
import { getSkillById } from '../data/skills';
import { getMonsterSkillById } from '../data/monster-skills';
import { buildEncounter } from '../data/battle-encounters';
import { createInitiativeOrder, findUnit } from './initiative';
import {
  allUnits,
  computeLegalTargetIds,
  isLegalTarget,
  isSkillUsableFrom,
} from './targeting';
import { resolveAttack } from './combat-resolution';
import { applyBattleUnitDamage } from './damage';
import { applyBattleUnitHealing } from './healing';
import {
  applyEffects,
  applyEffectsWithResistance,
  describeBlockedEffects,
  resolveStartOfTurnConditions,
  tickStun,
} from './status-effects';
import { SKILL_LEVEL_BONUS } from '../data/hero-level-profiles';
import {
  getEffectiveHeroLevel,
  getEffectiveSkillLevel,
  getHeroImmunities,
  getHeroResistances,
} from './progression/upgrade-core';
import { chooseMonsterAction } from './monster-ai';
import { pushLog } from './log';
import {
  applyQuirkModifiersRaw,
  describeModifierApplications,
  getQuirkSpeedBonus,
  heroQuirkIds,
} from './quirk-passives';
import { createRuleEventContext, emitPartyRuleEvent } from './quirks';
import type { GameLogEntry } from '../types';

export const MAX_ROUNDS = 4;
const BATTLE_REWARD_GOLD = 25;
const VICTORY_LOG = '所有敌人被击败，战斗胜利！';
const DEFEAT_LOG = '全员阵亡，战斗失败……';

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function setUnit(state: BattleState, unit: BattleUnit): BattleState {
  if (unit.side === 'hero') {
    return { ...state, heroes: state.heroes.map((h) => (h.id === unit.id ? unit : h)) };
  }
  return { ...state, monsters: state.monsters.map((m) => (m.id === unit.id ? unit : m)) };
}

function pushBattleLog(state: BattleState, message: string, kind: GameLogEntry['kind'] = 'info'): BattleState {
  const entry: GameLogEntry = { id: createId('blog'), at: nowIso(), message, kind };
  return { ...state, battleLog: [...state.battleLog, entry].slice(-100) };
}

// ---------------------------------------------------------------------------
// Phase 7：回合键 / 压力事件队列 / 精神效果辅助
// ---------------------------------------------------------------------------

/** 稳定回合键（幂等标记用：battleId:round:initiativeIndex:actorId）。 */
export function battleTurnKey(
  battleId: string,
  round: number,
  initiativeIndex: number,
  actorId: string
): string {
  return `${battleId}:${round}:${initiativeIndex}:${actorId}`;
}

/** 当前激活单位的回合键。 */
export function currentTurnKey(state: BattleState): string | null {
  if (!state.activeActorId) return null;
  return battleTurnKey(state.battleId, state.round, state.initiativeIndex, state.activeActorId);
}

/**
 * 追加一条战斗内压力事件（由 store 层 processBattleStressEvents 路由到统一
 * stress 管线）。战斗引擎内不直接结算阈值 —— Resolve Test / Heart Attack
 * 需要 Campaign 级数据（卡牌、死亡记录、替补），统一在 campaign 层处理。
 */
function queueStressEvent(
  state: BattleState,
  heroInstanceId: string,
  amount: number,
  sourceType: 'battle-skill' | 'critical' | 'resolve-effect',
  sourceId?: string
): BattleState {
  const ev = { id: createId('bse'), heroInstanceId, amount, sourceType, sourceId };
  return { ...state, pendingStressEvents: [...(state.pendingStressEvents ?? []), ev] };
}

/**
 * Phase 8B：追加一条战斗内规则事件（由 store 层 processBattleRuleEvents 路由到
 * 统一被动引擎）。同 queueStressEvent，战斗引擎内不直接结算 —— Disease 反应可能
 * 造成伤害 / 死亡 / Resolve Test，需要 Campaign 级数据。
 */
function queueBattleRuleEvent(
  state: BattleState,
  type: RuleEventType,
  heroInstanceId: string
): BattleState {
  if (!heroInstanceId) return state;
  const ev = { id: createId('bre'), type, heroInstanceId };
  return { ...state, pendingRuleEvents: [...(state.pendingRuleEvents ?? []), ev] };
}

/** 单位回合结束时清理精神效果给予的临时加成。 */
function clearTurnBonuses(state: BattleState): BattleState {
  if (!state.activeActorId) return state;
  const u = findUnit(state, state.activeActorId);
  if (!u || (!u.turnDamageBonus && !u.turnAccuracyBonus)) return state;
  return setUnit(state, { ...u, turnDamageBonus: 0, turnAccuracyBonus: 0 });
}

/** 按 id 查找战斗单位（英雄或怪物）。 */
export function getUnit(state: BattleState, id: string | null): BattleUnit | undefined {
  return findUnit(state, id);
}

/** 当前行动单位。 */
export function getActiveUnit(state: BattleState): BattleUnit | undefined {
  return findUnit(state, state.activeActorId);
}

/**
 * Phase 8D：进入战斗时把英雄的「有效」等级快照进 BattleUnit。
 * - skillLevels 取 max(永久等级, Blacksmith 临时 Form)，因此战斗内一律读快照；
 * - heroLevel / resistances / immunities 由 Hero Level Registry 派生，不落盘。
 *
 * Phase 10A：Final Encounter 不经过 Dungeon Room（硬约束 14），无法调用 initBattle，
 * 但必须复用同一套英雄单位构建逻辑，故导出。
 */
export function makeHeroUnit(hero: HeroInstance, index: number, campaign: CampaignState): BattleUnit {
  const hp = Math.max(0, hero.maxLife - hero.wounds);
  const effectiveSkillLevels: Record<string, 1 | 2 | 3> = {};
  for (const skillId of hero.equippedSkillIds) {
    effectiveSkillLevels[skillId] = getEffectiveSkillLevel(campaign, hero, skillId);
  }
  // 未装备但已有永久等级的技能也保留快照（换装/调试时不丢数据）
  for (const [skillId, lv] of Object.entries(hero.skillLevels ?? {})) {
    if (effectiveSkillLevels[skillId] === undefined) {
      effectiveSkillLevels[skillId] = getEffectiveSkillLevel(campaign, hero, skillId);
      void lv;
    }
  }
  return {
    id: `u_${hero.instanceId}`,
    name: hero.name,
    side: 'hero',
    sourceId: hero.instanceId,
    maxHp: hero.maxLife,
    hp,
    stress: hero.stress,
    position: index + 1,
    // Phase 8A：Quick Reflexes / Slow Reflexes 静态速度修正
    speed: Math.max(1, hero.speed + getQuirkSpeedBonus(hero)),
    stance: hero.stance,
    isAlive: !hero.dead,
    atDeathsDoor: hero.atDeathsDoor || (!hero.dead && hp === 0),
    deathblowRollCount: hero.deathblowRollCount ?? 0,
    stunned: 0,
    // Phase 8B：注入战斗外累积的 Bleed / Blight（Disease 在探索阶段施加的层数）
    bleed: hero.pendingBleed ?? 0,
    blight: hero.pendingBlight ?? 0,
    marked: false,
    buffs: [],
    debuffs: [],
    actionPoints: 0,
    damageBonus: hero.temporaryDamageBonus ?? 0,
    equippedSkillIds: [...hero.equippedSkillIds],
    // Phase 8D：有效技能等级（永久 ∪ Blacksmith 临时 Form）
    skillLevels: effectiveSkillLevels,
    // ---- Phase 8A：Quirk 快照（战斗内修正器用；获取/移除只发生在战役层） ----
    quirkIds: heroQuirkIds(hero),
    // ---- Phase 8B：Disease 快照 + 等级（damage-self-scaled 与战斗内修正器用） ----
    diseaseId: hero.disease?.diseaseId ?? null,
    diseaseInstanceId: hero.disease?.instanceId ?? null,
    heroLevel: getEffectiveHeroLevel(hero),
    // ---- Phase 8D：Hero Level 派生的抗性 / 免疫（不落盘，战斗内即时生效） ----
    resistances: getHeroResistances(hero),
    immunities: getHeroImmunities(hero),
    // ---- Phase 7：精神状态快照（从战役英雄同步） ----
    resolveTestedThisQuest: hero.resolveTestedThisQuest ?? false,
    resolveState: hero.resolveState ?? 'normal',
    virtueId: hero.virtueId ?? null,
    afflictionId: hero.afflictionId ?? null,
    mentalEffectResolvedTurnId: null,
  };
}

function makeMonsterUnit(monster: MonsterDefinition, index: number): BattleUnit {
  return {
    id: `u_${monster.id}_${index}`,
    name: monster.name,
    side: 'monster',
    sourceId: monster.id,
    maxHp: monster.maxHp,
    hp: monster.maxHp,
    stress: 0,
    position: index + 1,
    speed: monster.speed,
    stance: 'aggressive',
    isAlive: true,
    atDeathsDoor: false,
    deathblowRollCount: 0,
    stunned: 0,
    bleed: 0,
    blight: 0,
    marked: false,
    buffs: [],
    debuffs: [],
    actionPoints: 0,
    monsterSkillIds: [...monster.skillIds],
    targetRule: monster.targetRule,
    // ---- Phase 7：怪物不参与精神系统，全部默认值 ----
    resolveTestedThisQuest: false,
    resolveState: 'normal',
    virtueId: null,
    afflictionId: null,
    mentalEffectResolvedTurnId: null,
  };
}

/** 为技能补齐默认战斗字段（占位英雄技能缺字段时兜底）。 */
export function normalizeHeroSkill(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    usableFromPositions:
      skill.usableFromPositions ?? (skill.kind === 'attack' ? [1, 2] : [1, 2, 3, 4]),
    validTargetPositions:
      skill.validTargetPositions ?? [1, 2, 3, 4],
    targetSide:
      skill.targetSide ??
      (skill.kind === 'attack' ? 'enemy' : skill.kind === 'heal' ? 'ally' : 'self'),
    accuracy: skill.accuracy ?? 7,
    minDamage: skill.minDamage ?? skill.damage ?? 4,
    maxDamage: skill.maxDamage ?? (skill.damage ?? 4) + 3,
  };
}

// ---------------------------------------------------------------------------
// 战斗初始化
// ---------------------------------------------------------------------------

/** 进入战斗房间时建立完整 BattleState。 */
export function initBattle(campaign: CampaignState, roomId: string): CampaignState {
  const room = campaign.dungeon?.rooms.find((r) => r.id === roomId);
  if (!room || !campaign.dungeon) return campaign;

  const heroUnits = campaign.heroes
    .filter((h) => !h.dead)
    .map((h, i) => makeHeroUnit(h, i, campaign));
  const encounter = buildEncounter(room.type);
  const monsterUnits = encounter.map((m, i) => makeMonsterUnit(m, i));

  const battle: BattleState = {
    battleId: createId('btl'),
    status: 'active',
    round: 1,
    maxRounds: MAX_ROUNDS,
    heroes: heroUnits,
    monsters: monsterUnits,
    initiativeOrder: createInitiativeOrder([...heroUnits, ...monsterUnits]),
    initiativeIndex: -1,
    activeActorId: null,
    currentActionPoints: 0,
    selectedSkillId: null,
    selectedTargetId: null,
    battleLog: [
      { id: createId('blog'), at: nowIso(), message: '战斗开始！', kind: 'info' },
    ],
    sourceRoomId: roomId,
    rewards: { gold: BATTLE_REWARD_GOLD },
    // Phase 8A：战斗开始时的光照快照（战斗内 Quirk 条件判定用）
    light: campaign.light,
  };

  const started = advanceTurn(battle);

  const dungeon = {
    ...campaign.dungeon,
    rooms: campaign.dungeon.rooms.map((r) => (r.id === roomId ? { ...r, status: 'current' as const } : r)),
  };

  // Phase 8B：pendingBleed / pendingBlight 已注入战斗单位，清零避免下场战斗重复生效
  campaign = {
    ...campaign,
    heroes: campaign.heroes.map((h) =>
      h.pendingBleed || h.pendingBlight ? { ...h, pendingBleed: 0, pendingBlight: 0 } : h
    ),
  };

  let next: CampaignState = {
    ...campaign,
    gamePhase: 'battle',
    battle: started,
    dungeon,
  };
  // Phase 8A：battle-started 时机事件（Off Guard / Shocker 等）。
  // 派生 Stress 走统一管线，applyStress 内部会同步回战斗单位。
  next = emitPartyRuleEvent(next, 'battle-started', createRuleEventContext());
  return next;
}

// ---------------------------------------------------------------------------
// 先攻推进（核心循环）
// ---------------------------------------------------------------------------

/** 推进到下一个行动者；自动跳过死亡/Stun 单位，并在怪物回合自动执行其动作。 */
export function advanceTurn(state: BattleState): BattleState {
  if (state.status !== 'active') return state;
  // Phase 7：上一个行动单位的临时加成在回合结束时清零
  let s: BattleState = clearTurnBonuses({ ...state });
  let idx = s.initiativeIndex;
  let guard = 0;

  while (guard++ < 200) {
    idx += 1;
    if (idx >= s.initiativeOrder.length) {
      // 本轮行动列表耗尽 → 进入下一轮
      s = { ...s, round: s.round + 1 };
      if (s.round > s.maxRounds) {
        s = pushBattleLog(s, `第 ${s.maxRounds} 轮结束，怪物仍未清除，小队被迫撤退。`, 'danger');
        return { ...s, status: 'defeat' };
      }
      s = pushBattleLog(s, `—— 第 ${s.round} 轮开始 ——`, 'info');
      s = { ...s, initiativeOrder: createInitiativeOrder(allUnits(s)), initiativeIndex: -1 };
      idx = -1;
      continue;
    }

    const id = s.initiativeOrder[idx];
    const unit = findUnit(s, id);
    if (!unit || !unit.isAlive) continue;

    // Phase 7：英雄携带精神状态时，先暂停交给 campaign 层做回合开始检定
    // （顺序遵循文档 5.8：精神效果先于 Bleed/Blight/Death's Door/Stun）。
    if (
      unit.side === 'hero' &&
      unit.resolveState !== 'normal' &&
      unit.mentalEffectResolvedTurnId !== battleTurnKey(s.battleId, s.round, idx, id)
    ) {
      return {
        ...s,
        initiativeIndex: idx,
        activeActorId: id,
        currentActionPoints: 0,
        selectedSkillId: null,
        selectedTargetId: null,
        pendingMentalCheck: true,
      };
    }

    if (unit.stunned > 0) {
      s = applyStunSkip(s, id);
      continue;
    }

    // 激活该单位：Bleed/Blight 合并为同一批次，只经过一次统一伤害入口
    s = { ...s, initiativeIndex: idx, activeActorId: id };
    s = activateUnitAfterMental(s, id);
    if (s.status !== 'active') return s;
    const activated = findUnit(s, id);
    if (!activated || !activated.isAlive) continue; // 持续伤害致死，跳过

    if (activated.side === 'monster') {
      s = runMonsterTurn(s, id);
      s = checkEnd(s);
      if (s.status !== 'active') return s;
      continue; // 继续推进，越过怪物
    }
    return s; // 轮到英雄，交还玩家控制
  }
  return checkEnd(s);
}

/**
 * 精神检定之后（或无需检定时）激活单位：
 * Bleed/Blight → Death's Door/Deathblow → 行动点授予。
 */
function activateUnitAfterMental(state: BattleState, id: string): BattleState {
  let s = state;
  const unit = findUnit(s, id);
  if (!unit || !unit.isAlive) return s;

  const sof = resolveStartOfTurnConditions(unit, state.light ?? 0);
  s = setUnit(s, sof.unit);
  for (const m of sof.messages) s = pushBattleLog(s, m, sof.heroDied ? 'danger' : 'warning');
  if (sof.heroDied || (sof.unit.side === 'monster' && !sof.unit.isAlive)) {
    s = checkEnd(s);
    if (s.status !== 'active') return s;
  }
  const after = findUnit(s, id);
  if (!after || !after.isAlive) return s;

  // Phase 7：精神效果的行动点惩罚在授予时消耗
  const penalty = s.pendingActionPointPenalty ?? 0;
  const baseAp = after.side === 'hero' ? 2 : 0;
  const ap = Math.max(0, baseAp - penalty);
  if (after.side === 'hero' && penalty > 0) {
    s = pushBattleLog(s, `${after.name} 因精神效果失去 ${Math.min(penalty, baseAp)} 个行动点。`, 'warning');
  }
  s = {
    ...s,
    currentActionPoints: ap,
    pendingActionPointPenalty: 0,
    selectedSkillId: null,
    selectedTargetId: null,
  };
  return s;
}

/**
 * Phase 7：campaign 层完成精神效果检定后恢复回合。
 * 处理顺序（文档 5.8）：英雄可能已死（Heart Attack/自伤 Deathblow）→ 推进；
 * Stun → 跳过；否则 Bleed/Blight → Death's Door → 授予行动点。
 * 英雄行动点为 0（精神效果扣光）时自动结束其回合。
 */
export function resumeTurnAfterMentalCheck(state: BattleState): BattleState {
  if (state.status !== 'active' || !state.pendingMentalCheck) return state;
  let s: BattleState = { ...state, pendingMentalCheck: false };
  const id = s.activeActorId;
  if (!id) return advanceTurn(s);

  const unit = findUnit(s, id);
  if (!unit || !unit.isAlive) {
    s = checkEnd(s);
    if (s.status !== 'active') return s;
    return advanceTurn(s);
  }
  if (unit.stunned > 0) {
    s = applyStunSkip(s, id);
    return advanceTurn(s);
  }
  s = activateUnitAfterMental(s, id);
  if (s.status !== 'active') return s;
  const after = findUnit(s, id);
  if (!after || !after.isAlive) return advanceTurn(s);
  if (after.side === 'hero' && s.currentActionPoints <= 0) return advanceTurn(s);
  return s;
}

function applyStunSkip(state: BattleState, id: string): BattleState {
  const u = findUnit(state, id);
  if (!u || !u.isAlive) return state;
  const ticked = tickStun(u);
  let s = setUnit(state, ticked);
  s = pushBattleLog(s, `${ticked.name} 处于 Stun，跳过本次行动。`, 'warning');
  return s;
}

// ---------------------------------------------------------------------------
// 英雄行动
// ---------------------------------------------------------------------------

/** 英雄是否可朝某方向移动（用于 UI 禁用判定）。 */
export function canHeroMove(state: BattleState, unitId: string, dir: -1 | 1): boolean {
  const actor = findUnit(state, unitId);
  if (!actor || actor.side !== 'hero' || actor.id !== state.activeActorId) return false;
  if (state.currentActionPoints <= 0) return false;
  const np = actor.position + dir;
  if (np < 1 || np > 4) return false;
  return !state.heroes.some((h) => h.id !== actor.id && h.position === np);
}

/** 英雄移动一个位置（消耗 1 行动点）。 */
export function heroMove(state: BattleState, unitId: string, dir: -1 | 1): BattleState {
  const actor = findUnit(state, unitId);
  if (!actor || !canHeroMove(state, unitId, dir)) return state;
  const np = actor.position + dir;
  let s = setUnit(state, { ...actor, position: np });
  s = { ...s, currentActionPoints: s.currentActionPoints - 1 };
  s = pushBattleLog(s, `${actor.name} 移动到位置 ${np}。`, 'info');
  // Phase 8B：Lethargy —— 英雄「使用 Move Action」时触发（怪物移动、技能位移不算）
  s = queueBattleRuleEvent(s, 'hero-move-action-resolved', actor.sourceId);
  s = checkEnd(s);
  if (s.status === 'active' && s.currentActionPoints <= 0) s = advanceTurn(s);
  return s;
}

/** 当前行动英雄对某技能可合法选中的目标 id。 */
export function legalTargetsForActor(state: BattleState, skillId: string): string[] {
  const actor = getActiveUnit(state);
  if (!actor) return [];
  const raw = getSkillById(skillId);
  if (!raw) return [];
  const skill = normalizeHeroSkill(raw);
  return computeLegalTargetIds(state, actor, skill);
}

/** Phase 8C：Trinket 对冻结动作累计的加成（无 Trinket 时全 0）。 */
export interface TrinketActionBonuses {
  accuracy: number;
  crit: number;
  damage: number;
}

const NO_TRINKET_BONUSES: TrinketActionBonuses = { accuracy: 0, crit: 0, damage: 0 };

/**
 * 校验英雄技能是否可以合法释放（不结算）。
 * Phase 8C：store 层在开 before-attack-roll 窗口前先调用，
 * 避免为一个非法动作冻结 PendingBattleAction。
 */
export function heroSkillActionError(
  state: BattleState,
  unitId: string,
  skillId: string,
  targetId: string
): string | null {
  const actor = findUnit(state, unitId);
  if (!actor || actor.side !== 'hero' || actor.id !== state.activeActorId) return '当前不是该英雄的回合。';
  if (state.currentActionPoints <= 0) return '行动点不足。';
  const raw = getSkillById(skillId);
  if (!raw) return '技能不存在。';
  const skill = normalizeHeroSkill(raw);
  if (!isSkillUsableFrom(actor, skill)) return `无法从当前站位释放 ${skill.name}。`;
  const target = findUnit(state, targetId);
  if (!target || !isLegalTarget(actor, target, skill)) return '目标不合法。';
  return null;
}

/** 英雄使用技能（消耗 1 行动点）。
 * Phase 8C：trinketBonuses 为 before-attack-roll 窗口期间使用 Trinket 累计的修正，
 * 由 store 层从 PendingBattleAction 传入；不传等价于全 0。
 */
export function heroUseSkill(
  state: BattleState,
  unitId: string,
  skillId: string,
  targetId: string,
  trinketBonuses: TrinketActionBonuses = NO_TRINKET_BONUSES
): BattleState {
  const actor = findUnit(state, unitId);
  if (!actor || actor.side !== 'hero' || actor.id !== state.activeActorId) return state;
  if (state.currentActionPoints <= 0) return state;
  const raw = getSkillById(skillId);
  if (!raw) return state;
  const skill = normalizeHeroSkill(raw);

  if (!isSkillUsableFrom(actor, skill)) {
    return pushBattleLog(state, `${actor.name} 无法从当前站位释放 ${skill.name}。`, 'warning');
  }
  const target = findUnit(state, targetId);
  if (!target || !isLegalTarget(actor, target, skill)) return state;

  let s = state;
  let tgt: BattleUnit = target;
  let act: BattleUnit = actor;

  const skillLevel = (actor.skillLevels?.[skill.id] ?? 1) as 1 | 2 | 3;
  const levelBonus = SKILL_LEVEL_BONUS[skillLevel];

  if (skill.targetSide === 'enemy') {
    // Phase 7：精神效果（Focused）的当前回合命中加成
    // Phase 8C：Trinket 命中 / 暴击阈值修正（来自冻结动作）
    const res = resolveAttack(
      skill,
      (actor.turnAccuracyBonus ?? 0) + trinketBonuses.accuracy,
      trinketBonuses.crit
    );
    if (trinketBonuses.accuracy !== 0 || trinketBonuses.crit !== 0 || trinketBonuses.damage !== 0) {
      s = pushBattleLog(
        s,
        `${actor.name} 的 Trinket 修正：命中 ${trinketBonuses.accuracy >= 0 ? '+' : ''}${trinketBonuses.accuracy}、暴击 +${trinketBonuses.crit}、伤害 ${trinketBonuses.damage >= 0 ? '+' : ''}${trinketBonuses.damage}。`,
        'info'
      );
    }
    if (res.hit) {
      // Blacksmith 临时加成 + 技能等级加成 + 精神效果回合加成 + Trinket 伤害修正：仅英雄命中时加算。
      const rawDamage = Math.max(
        0,
        res.damage +
          (actor.damageBonus ?? 0) +
          levelBonus.damage +
          (actor.turnDamageBonus ?? 0) +
          trinketBonuses.damage
      );
      // Phase 8A：Quirk 输出修正（Warrior of Light 等，条件用战斗光照快照）
      const outMod = applyQuirkModifiersRaw(
        actor.quirkIds ?? [],
        s.light ?? 0,
        'damage-output',
        rawDamage,
        'attack'
      );
      const totalDamage = outMod.amount;
      if (outMod.applied.length > 0) {
        s = pushBattleLog(
          s,
          `${actor.name} 输出修正 ${rawDamage} → ${totalDamage}${describeModifierApplications(outMod.applied)}。`,
          'info'
        );
      }
      const outcome = applyBattleUnitDamage(tgt, totalDamage);
      tgt = outcome.unit;
      if (outcome.heroDied) tgt = { ...tgt, deathCause: 'deathblow-attack' };
      if (tgt.isAlive && skill.applyEffects?.length) {
        const eff = applyEffectsWithResistance(tgt, skill.applyEffects);
        tgt = eff.unit;
        if (eff.blocked.length > 0) {
          s = pushBattleLog(s, `${tgt.name} 的抗性调整了部分效果${describeBlockedEffects(eff.blocked)}。`, 'success');
        }
      }
      const effNote = skill.applyEffects?.length
        ? `（施加 ${skill.applyEffects.map((e) => e.type).join('/')}）`
        : '';
      const bonusNote = actor.damageBonus ? `（含 Blacksmith +${actor.damageBonus}）` : '';
      const lvNote = levelBonus.damage > 0 ? `（技能 Lv${skillLevel} +${levelBonus.damage}）` : '';
      s = pushBattleLog(
        s,
        `${actor.name} 使用 ${skill.name}，掷 ${res.roll}${res.crit ? '（暴击）' : ''} 命中 ${tgt.name}，造成 ${totalDamage} 伤害${bonusNote}${lvNote}${effNote}。`,
        'danger'
      );
      for (const m of outcome.logs) s = pushBattleLog(s, m, outcome.heroDied ? 'danger' : 'warning');
    } else {
      s = pushBattleLog(s, `${actor.name} 使用 ${skill.name}，掷 ${res.roll} 未命中 ${target.name}。`, 'info');
    }
  } else {
    // 治疗 / 缓解压力 / buff（ally 或 self）——治疗统一走 applyBattleUnitHealing
    if (skill.heal) {
      const rawHeal = skill.heal + levelBonus.heal;
      // Phase 8A：Quirk 治疗接受修正（目标为英雄时）
      const healMod =
        tgt.side === 'hero'
          ? applyQuirkModifiersRaw(tgt.quirkIds ?? [], s.light ?? 0, 'healing-received', rawHeal)
          : { amount: rawHeal, applied: [] };
      const totalHeal = healMod.amount;
      if (healMod.applied.length > 0) {
        s = pushBattleLog(
          s,
          `${tgt.name} 治疗修正 ${rawHeal} → ${totalHeal}${describeModifierApplications(healMod.applied)}。`,
          'info'
        );
      }
      const healOutcome = applyBattleUnitHealing(tgt, totalHeal);
      tgt = healOutcome.unit;
      s = pushBattleLog(s, `${actor.name} 使用 ${skill.name} 治疗 ${target.name} ${healOutcome.healed} 点。`, 'success');
      for (const m of healOutcome.logs) s = pushBattleLog(s, m, 'success');
    }
    if (skill.stressHeal && tgt.side === 'hero') {
      // Phase 7：单位即时更新 + 排入压力事件，由 store 层统一走 recoverStress 管线
      tgt = { ...tgt, stress: Math.max(0, tgt.stress - skill.stressHeal) };
      s = queueStressEvent(s, tgt.sourceId, -skill.stressHeal, 'battle-skill', skill.id);
      s = pushBattleLog(s, `${target.name} 压力降低 ${skill.stressHeal}。`, 'success');
    }
    if (skill.applyEffects?.length) tgt = applyEffects(tgt, skill.applyEffects);
  }

  // 位移效果
  if (skill.moveSelf) {
    const np = clamp(act.position + skill.moveSelf, 1, 4);
    if (!s.heroes.some((h) => h.id !== act.id && h.position === np)) {
      act = { ...act, position: np };
    }
  }
  if (skill.moveTarget && skill.targetSide === 'enemy') {
    const np = clamp(tgt.position + skill.moveTarget, 1, 4);
    if (!s.monsters.some((m) => m.id !== tgt.id && m.position === np)) {
      tgt = { ...tgt, position: np };
    }
  }

  s = setUnit(s, tgt);
  if (act.id !== tgt.id) s = setUnit(s, act);

  s = {
    ...s,
    currentActionPoints: s.currentActionPoints - 1,
    selectedSkillId: null,
    selectedTargetId: null,
  };
  s = checkEnd(s);
  if (s.status === 'active' && s.currentActionPoints <= 0) s = advanceTurn(s);
  return s;
}

/** 英雄主动结束回合。 */
export function endHeroTurn(state: BattleState, unitId: string): BattleState {
  const actor = findUnit(state, unitId);
  if (!actor || actor.side !== 'hero' || actor.id !== state.activeActorId) return state;
  return advanceTurn(state);
}

// ---------------------------------------------------------------------------
// 怪物自动回合
// ---------------------------------------------------------------------------

function tryMonsterMove(state: BattleState, monsterId: string): BattleState {
  const m = findUnit(state, monsterId);
  if (!m) return state;
  for (const p of [m.position - 1, m.position + 1]) {
    if (p >= 1 && p <= 4 && !state.monsters.some((o) => o.id !== m.id && o.position === p)) {
      return setUnit(state, { ...m, position: p });
    }
  }
  return state;
}

/** 执行单个怪物的自动回合。 */
export function runMonsterTurn(state: BattleState, monsterId: string): BattleState {
  const monster = findUnit(state, monsterId);
  if (!monster || !monster.isAlive || monster.side !== 'monster') return state;

  const action = chooseMonsterAction(state, monster);
  if (!action) {
    let s = tryMonsterMove(state, monsterId);
    s = pushBattleLog(s, `${monster.name} 无法行动，跳过回合。`, 'warning');
    return s;
  }

  const skill = getMonsterSkillById(action.skillId);
  const target = findUnit(state, action.targetId);
  if (!skill || !target) return state;

  const res = resolveAttack(skill);
  let tgt: BattleUnit = target;
  if (res.hit) {
    // Phase 8A：英雄承伤修正（Fragile / Hard Skinned / Night Blindness 等）
    const inMod =
      tgt.side === 'hero'
        ? applyQuirkModifiersRaw(tgt.quirkIds ?? [], state.light ?? 0, 'damage-taken', res.damage, 'attack')
        : { amount: res.damage, applied: [] };
    const incomingDamage = inMod.amount;
    if (inMod.applied.length > 0) {
      state = pushBattleLog(
        state,
        `${tgt.name} 承伤修正 ${res.damage} → ${incomingDamage}${describeModifierApplications(inMod.applied)}。`,
        'info'
      );
    }
    const outcome = applyBattleUnitDamage(tgt, incomingDamage);
    tgt = outcome.unit;
    if (outcome.heroDied) tgt = { ...tgt, deathCause: 'deathblow-attack' };
    let queuedStress = 0;
    if (tgt.isAlive) {
      if (skill.stress && tgt.side === 'hero') {
        // Phase 7：单位即时钳制到 0-10 + 排入压力事件，阈值处理由 campaign 层统一执行
        tgt = { ...tgt, stress: Math.min(10, tgt.stress + skill.stress) };
        queuedStress = skill.stress;
      }
      // Phase 8D：英雄承受负面状态时，先过 Hero Level 抗性 / 免疫判定
      if (skill.applyEffects?.length) {
        const eff = applyEffectsWithResistance(tgt, skill.applyEffects);
        tgt = eff.unit;
        if (eff.blocked.length > 0) {
          state = pushBattleLog(
            state,
            `${tgt.name} 凭 Level ${tgt.heroLevel ?? 1} 抗性抵挡了部分效果${describeBlockedEffects(eff.blocked)}。`,
            'success'
          );
        }
      }
    }
    // Phase 8B：Push / Pull —— 怪物技能对英雄的强制位移（实际发生位移才算 shuffle）
    let shuffled = false;
    if (skill.moveTarget && tgt.side === 'hero' && tgt.isAlive) {
      const np = clamp(tgt.position + skill.moveTarget, 1, 4);
      if (np !== tgt.position && !state.heroes.some((h) => h.id !== tgt.id && h.position === np)) {
        tgt = { ...tgt, position: np };
        shuffled = true;
      }
    }

    const effNote = skill.applyEffects?.length
      ? `（施加 ${skill.applyEffects.map((e) => e.type).join('/')}）`
      : '';
    const stressNote = skill.stress ? ` 并施加 ${skill.stress} 压力。` : '';
    let s = setUnit(state, tgt);
    if (queuedStress > 0) {
      s = queueStressEvent(s, tgt.sourceId, queuedStress, 'battle-skill', skill.id);
    }
    if (shuffled) {
      s = pushBattleLog(s, `${tgt.name} 被强制移动到位置 ${tgt.position}。`, 'warning');
      // Vertigo：被 Push / Pull 且实际发生位移
      s = queueBattleRuleEvent(s, 'hero-shuffled', tgt.sourceId);
    }
    // Phase 8B：怪物技能感染（命中且英雄存活时按 d10 判定）
    if (skill.diseaseChance && tgt.side === 'hero' && tgt.isAlive) {
      if (d10() <= skill.diseaseChance.d10AtMost) {
        s = {
          ...s,
          pendingDiseaseInfections: [
            ...(s.pendingDiseaseInfections ?? []),
            {
              id: createId('binf'),
              heroInstanceId: tgt.sourceId,
              diseaseId: skill.diseaseChance.diseaseId,
              sourceSkillId: skill.id,
            },
          ],
        };
        s = pushBattleLog(s, `${tgt.name} 被 ${skill.name} 传染了疾病！`, 'danger');
      }
    }
    s = pushBattleLog(
      s,
      `${monster.name} 使用 ${skill.name}，掷 ${res.roll}${res.crit ? '（暴击）' : ''} 命中 ${tgt.name}，造成 ${incomingDamage} 伤害${stressNote}${effNote}`,
      'danger'
    );
    for (const m of outcome.logs) s = pushBattleLog(s, m, outcome.heroDied ? 'danger' : 'warning');
    s = checkEnd(s);
    return s;
  }
  let s = state;
  s = pushBattleLog(s, `${monster.name} 使用 ${skill.name}，掷 ${res.roll} 未命中 ${target.name}。`, 'info');
  return s;
}

// ---------------------------------------------------------------------------
// 胜负判定与结算
// ---------------------------------------------------------------------------

/**
 * 检查战斗是否结束。
 * Phase 6：Death's Door（hp=0 但 isAlive=true）仍算存活，全队处于 Death's Door 不判负；
 * 仅当所有英雄 isAlive=false（永久死亡）才判负。
 */
export function checkEnd(state: BattleState): BattleState {
  if (state.status !== 'active') return state;
  const monstersAlive = state.monsters.some((m) => m.isAlive);
  const heroesAlive = state.heroes.some((h) => h.isAlive);
  if (!monstersAlive) return pushBattleLog({ ...state, status: 'victory' }, VICTORY_LOG, 'success');
  if (!heroesAlive) return pushBattleLog({ ...state, status: 'defeat' }, DEFEAT_LOG, 'danger');
  return state;
}

/** 胜利结算：标记来源房间 cleared、发放 Gold、同步英雄状态、清除战斗、返回地牢。 */
export function resolveVictory(campaign: CampaignState): CampaignState {
  const b = campaign.battle;
  // 仅在 victory 状态结算一次；defeat/active 或已清除的战斗不发奖励（防重复/误发）。
  if (!b || b.status !== 'victory') return campaign;

  let c: CampaignState = { ...campaign, gold: campaign.gold + b.rewards.gold };
  c = pushLog(c, `战斗胜利，获得 ${b.rewards.gold} Gold。`, 'success');

  const heroes = c.heroes.map((h) => {
    const u = b.heroes.find((x) => x.sourceId === h.instanceId);
    if (!u) return h;
    if (h.dead || !u.isAlive) return h; // 永久死亡由 processBattleDeaths 统一处理，这里不覆盖
    return {
      ...h,
      maxLife: u.maxHp,
      wounds: Math.max(0, u.maxHp - u.hp),
      stress: Math.max(0, u.stress),
      isAlive: !h.dead,
      atDeathsDoor: u.atDeathsDoor,
      deathblowRollCount: u.deathblowRollCount,
    };
  });
  c = { ...c, heroes };

  if (c.dungeon) {
    const room = c.dungeon.rooms.find((r) => r.id === b.sourceRoomId);
    const wasCleared = room?.status === 'cleared';
    const rooms = c.dungeon.rooms.map((r) =>
      r.id === b.sourceRoomId ? { ...r, status: 'cleared' as const } : r
    );
    let dungeon = {
      ...c.dungeon,
      rooms,
      roomsCleared: c.dungeon.roomsCleared + (wasCleared ? 0 : 1),
    };
    if (room?.type === 'objective') dungeon = { ...dungeon, objectiveComplete: true };
    c = { ...c, dungeon };
  }

  return { ...c, battle: null, gamePhase: 'dungeon-explore' };
}

/** 失败：保留 battle（status=defeat）以便展示，调用方负责导航。 */
export function markDefeat(campaign: CampaignState): CampaignState {
  if (!campaign.battle) return campaign;
  return { ...campaign, battle: { ...campaign.battle, status: 'defeat' } };
}
