import type { ActiveEffect, BattleState, BattleUnit, HeroResistanceProfile } from '../types';
import { applyBattleUnitDamage, type BattleDamageOutcome } from './damage';
import { applyQuirkModifiersRaw, describeModifierApplications } from './quirk-passives';
import { rollDie } from './random';

/** 给单位施加一个状态效果（返回新单位，不修改原对象）。 */
export function applyEffectToUnit(unit: BattleUnit, effect: ActiveEffect): BattleUnit {
  const withDuration = (next: BattleUnit): BattleUnit => effect.durationTurns === undefined
    ? next
    : { ...next, conditionDurations: { ...next.conditionDurations, [effect.type]: Math.max(next.conditionDurations?.[effect.type] ?? 0, effect.durationTurns) } };
  switch (effect.type) {
    case 'stun':
      return withDuration({ ...unit, stunned: unit.stunned + effect.amount });
    case 'bleed':
      return withDuration({ ...unit, bleed: unit.bleed + effect.amount });
    case 'blight':
      return withDuration({ ...unit, blight: unit.blight + effect.amount });
    case 'mark':
      return withDuration({ ...unit, marked: true });
    default:
      return unit;
  }
}

/** 施加一组状态效果（不含抗性判定，保留给怪物与旧调用方）。 */
export function applyEffects(unit: BattleUnit, effects?: ActiveEffect[]): BattleUnit {
  if (!effects || effects.length === 0) return unit;
  return effects.reduce((u, e) => applyEffectToUnit(u, e), unit);
}

// ---------------------------------------------------------------------------
// Phase 8D：Hero Level 派生抗性 / 免疫在战斗内即时生效
//
// 规则 12：Hero Level 影响的抗性与免疫不落盘，进入战斗时由 Registry 派生成
// BattleUnit 快照，效果施加时统一在此判定：
//   1. 免疫列表命中 → 直接免疫（不掷骰）；
//   2. 否则掷 d100，roll ≤ 抗性百分比 → 抵抗成功；
//   3. 缺少抗性数据（怪物 / 老存档）→ 不判定，按原规则施加。
// mark 不受抗性影响（对应桌游中的标记不是 debuff 判定）。
// ---------------------------------------------------------------------------

/** 抗性判定涉及的效果类型 → 抗性字段。 */
const RESIST_KEY_BY_EFFECT: Partial<Record<ActiveEffect['type'], keyof HeroResistanceProfile>> = {
  stun: 'stun',
  bleed: 'bleed',
  blight: 'blight',
};

/** 单条效果被抗性/免疫拦截的记录（供战斗日志展示）。 */
export interface BlockedEffectRecord {
  type: ActiveEffect['type'];
  reason: 'immune' | 'resisted';
  /** 抵抗判定时的 d100 结果（immune 时为 undefined）。 */
  roll?: number;
  /** 该项抗性百分比（immune 时为 undefined）。 */
  resistance?: number;
  /** Categorical resistance has no d100 roll; it shortens duration by one turn. */
  durationReducedFrom?: number;
  durationReducedTo?: number;
}

export interface ApplyEffectsWithResistanceResult {
  unit: BattleUnit;
  blocked: BlockedEffectRecord[];
}

/**
 * 带抗性 / 免疫判定的效果施加（英雄目标使用；怪物无抗性数据时等价于 applyEffects）。
 * 掷骰统一走 rollDie，测试可通过 setRandomSource 固定。
 */
export function applyEffectsWithResistance(
  unit: BattleUnit,
  effects?: ActiveEffect[]
): ApplyEffectsWithResistanceResult {
  if (!effects || effects.length === 0) return { unit, blocked: [] };
  const immunities = unit.immunities ?? [];
  const categoricalResistances = unit.categoricalResistances ?? [];
  const resistances = unit.resistances;
  const blocked: BlockedEffectRecord[] = [];
  let next = unit;

  for (const effect of effects) {
    if (immunities.includes(effect.type)) {
      blocked.push({ type: effect.type, reason: 'immune' });
      continue;
    }
    if (categoricalResistances.includes(effect.type)) {
      const from = effect.durationTurns ?? effect.amount;
      const to = Math.max(0, from - 1);
      blocked.push({ type: effect.type, reason: 'resisted', durationReducedFrom: from, durationReducedTo: to });
      if (to > 0) next = applyEffectToUnit(next, { ...effect, durationTurns: to });
      continue;
    }
    const key = RESIST_KEY_BY_EFFECT[effect.type];
    const pct = key && resistances ? resistances[key] : 0;
    if (pct > 0) {
      const roll = rollDie(100);
      if (roll <= pct) {
        blocked.push({ type: effect.type, reason: 'resisted', roll, resistance: pct });
        continue;
      }
    }
    next = applyEffectToUnit(next, effect);
  }
  return { unit: next, blocked };
}

/** The same effect transaction is used by skill execution and saved-event replay. */
export function applyStatusEffectEvent(state: BattleState, targetId: string, effects: ActiveEffect[], eventId: string): BattleState {
  const prior = state.statusEffectEvents?.find(event => event.eventId === eventId);
  if (prior) {
    if (prior.targetId !== targetId || JSON.stringify(prior.effects) !== JSON.stringify(effects)) throw new Error('Status effect event payload mismatch');
    return state;
  }
  const target = [...state.heroes, ...state.monsters].find(unit => unit.id === targetId);
  if (!target || !target.isAlive) throw new Error('Status effect target is unavailable');
  const result = applyEffectsWithResistance(target, effects);
  return {
    ...state,
    heroes: state.heroes.map(unit => unit.id === targetId ? result.unit : unit),
    monsters: state.monsters.map(unit => unit.id === targetId ? result.unit : unit),
    statusEffectEvents: [...(state.statusEffectEvents ?? []), { eventId, targetId, effects: structuredClone(effects), blocked: result.blocked }],
  };
}

/** 把拦截记录格式化为战斗日志片段（无拦截时返回空串）。 */
export function describeBlockedEffects(blocked: BlockedEffectRecord[]): string {
  if (blocked.length === 0) return '';
  const parts = blocked.map((b) =>
    b.reason === 'immune'
      ? `${b.type} 被免疫`
      : b.durationReducedFrom !== undefined
        ? `${b.type} 持续时间 ${b.durationReducedFrom}→${b.durationReducedTo}`
        : `${b.type} 被抵抗（d100=${b.roll} ≤ ${b.resistance}）`
  );
  return `（${parts.join('，')}）`;
}

/** 回合开始持续伤害批量结算的结果。 */
export interface StartOfTurnResult {
  unit: BattleUnit;
  messages: string[];
  /** 本批次是否掷了 Deathblow（Death's Door + Bleed/Blight = 只掷一次）。 */
  deathblowRolled: boolean;
  deathblowRoll?: number;
  deathblowResult?: 'safe' | 'dead';
  enteredDeathsDoor: boolean;
  /** 英雄因本批次持续伤害永久死亡。 */
  heroDied: boolean;
}

/**
 * Phase 6：回合开始时的持续伤害批量结算（5.4 / 第 9 节）。
 * Bleed 与 Blight 合并为同一批次，只调用一次统一伤害入口：
 * - Death's Door 英雄同时有 Bleed+Blight → 只掷一次 Deathblow；
 * - 非 Death's Door 英雄合并扣血，首次归零只进入 Death's Door（本批次不掷骰）；
 * - 每种状态仍分别减少自己的层数；
 * - 怪物保持即时死亡规则。
 */
export function resolveStartOfTurnConditions(unit: BattleUnit, light = 0): StartOfTurnResult {
  const messages: string[] = [];
  let next = unit;
  const rawBleed = next.bleed > 0 ? next.bleed : 0;
  const rawBlight = next.blight > 0 ? next.blight : 0;
  const bleedDuration = next.conditionDurations?.bleed;
  const blightDuration = next.conditionDurations?.blight;

  // Phase 8A：Clotter / Thick Blooded 等按伤害来源分别修正，再合并为同一批次
  const isHero = next.side === 'hero';
  const bleedMod = isHero
    ? applyQuirkModifiersRaw(next.quirkIds ?? [], light, 'damage-taken', rawBleed, 'bleed')
    : { amount: rawBleed, applied: [] };
  const blightMod = isHero
    ? applyQuirkModifiersRaw(next.quirkIds ?? [], light, 'damage-taken', rawBlight, 'blight')
    : { amount: rawBlight, applied: [] };
  const bleedDmg = rawBleed > 0 ? bleedMod.amount : 0;
  const blightDmg = rawBlight > 0 ? blightMod.amount : 0;
  if (bleedMod.applied.length > 0 && rawBleed > 0) {
    messages.push(
      `${next.name} 流血伤害 ${rawBleed} → ${bleedDmg}${describeModifierApplications(bleedMod.applied)}。`
    );
  }
  if (blightMod.applied.length > 0 && rawBlight > 0) {
    messages.push(
      `${next.name} 腐蚀伤害 ${rawBlight} → ${blightDmg}${describeModifierApplications(blightMod.applied)}。`
    );
  }
  const total = bleedDmg + blightDmg;

  // 分别减少层数（伤害合并结算，层数各自 -1；即使被修正到 0 也要正常衰减）
  if (rawBleed > 0) {
    const remaining = bleedDuration === undefined ? Math.max(0, next.bleed - 1) : Math.max(0, bleedDuration - 1);
    next = {
      ...next,
      bleed: bleedDuration === undefined || remaining > 0 ? (bleedDuration === undefined ? remaining : next.bleed) : 0,
      ...(bleedDuration === undefined ? {} : { conditionDurations: { ...next.conditionDurations, bleed: remaining } }),
    };
    messages.push(`${next.name} 受到 Bleed 伤害 ${bleedDmg}（剩余 ${remaining} 回合）。`);
  }
  if (rawBlight > 0) {
    const remaining = blightDuration === undefined ? Math.max(0, next.blight - 1) : Math.max(0, blightDuration - 1);
    next = {
      ...next,
      blight: blightDuration === undefined || remaining > 0 ? (blightDuration === undefined ? remaining : next.blight) : 0,
      ...(blightDuration === undefined ? {} : { conditionDurations: { ...next.conditionDurations, blight: remaining } }),
    };
    messages.push(`${next.name} 受到 Blight 伤害 ${blightDmg}（剩余 ${remaining} 回合）。`);
  }

  if (total <= 0) {
    return {
      unit: next,
      messages,
      deathblowRolled: false,
      enteredDeathsDoor: false,
      heroDied: false,
    };
  }

  // 单次批量伤害入口（batch：Bleed + Blight 只有一次死亡判定）
  const outcome: BattleDamageOutcome = applyBattleUnitDamage(next, total);
  let resolved = outcome.unit;
  if (outcome.heroDied) {
    resolved = { ...resolved, deathCause: 'deathblow-periodic' };
  }
  messages.push(...outcome.logs);
  if (resolved.side === 'monster' && !resolved.isAlive && unit.isAlive) {
    messages.push(`${resolved.name} 因持续伤害倒下！`);
  }

  return {
    unit: resolved,
    messages,
    deathblowRolled: outcome.deathblowRolled,
    deathblowRoll: outcome.deathblowRoll,
    deathblowResult: outcome.deathblowResult,
    enteredDeathsDoor: outcome.enteredDeathsDoor,
    heroDied: outcome.heroDied,
  };
}

/**
 * 兼容旧签名的包装（Phase 3 命名）。
 * 内部走 Phase 6 统一批量结算管线。
 */
export function applyStartOfTurn(unit: BattleUnit): { unit: BattleUnit; messages: string[] } {
  const r = resolveStartOfTurnConditions(unit);
  return { unit: r.unit, messages: r.messages };
}

/** Stun 跳过：行动结束后移除一层 Stun。 */
export function tickStun(unit: BattleUnit): BattleUnit {
  const duration = unit.conditionDurations?.stun;
  if (duration === undefined) return { ...unit, stunned: Math.max(0, unit.stunned - 1) };
  const remaining = Math.max(0, duration - 1);
  return {
    ...unit,
    stunned: remaining > 0 ? unit.stunned : 0,
    conditionDurations: { ...unit.conditionDurations, stun: remaining },
  };
}
