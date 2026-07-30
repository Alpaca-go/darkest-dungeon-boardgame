import type {
  BattleUnit,
  CampaignState,
  DamageCommand,
  DamageResolution,
  HeroDeathCause,
  RuleEventContext,
} from '../types';
import { randInt } from './random';
import { killCampaignHero } from './hero-death';
import { pushLog } from './log';
import { applyQuirkModifiers, describeModifierApplications } from './quirk-passives';
// 循环依赖说明同 stress.ts：仅运行时调用被提升的函数声明，循环安全。
import { childRuleEventContext, createRuleEventContext, emitRuleEvent } from './quirks';

// ---------------------------------------------------------------------------
// Phase 6 统一伤害管线。
// 所有伤害来源（攻击 / Bleed / Blight / Trap / 探索事件）必须经过本模块，
// 不得在组件或其他引擎模块中直接修改 hp / wounds / atDeathsDoor / dead。
// ---------------------------------------------------------------------------

/** Deathblow Die：d10，1..3 = 骷髅（死亡），4..10 = 空白（安全）。 */
export function rollDeathblow(): { roll: number; isDeathblow: boolean } {
  const roll = randInt(1, 10);
  return { roll, isDeathblow: roll <= 3 };
}

/** 战斗单位伤害结算结果。 */
export interface BattleDamageOutcome {
  unit: BattleUnit;
  enteredDeathsDoor: boolean;
  deathblowRolled: boolean;
  deathblowRoll?: number;
  deathblowResult?: 'safe' | 'dead';
  /** 英雄本次永久死亡（怪物死亡不计入此字段，用 unit.isAlive 判断）。 */
  heroDied: boolean;
  logs: string[];
}

/**
 * 对单个战斗单位结算一次伤害事件（纯函数）。
 * - 怪物：直接扣 HP，0 即死（Phase 3 规则，不掷 Deathblow）；
 * - 英雄，未处于 Death's Door：扣 HP（最低 0）；首次归零 → 进入 Death's Door，本次不掷骰；
 * - 英雄，已处于 Death's Door：不扣 HP，掷 Deathblow → 安全保持 / 骷髅永久死亡；
 * - 已永久死亡的单位拒绝再次结算。
 */
export function applyBattleUnitDamage(unit: BattleUnit, amount: number): BattleDamageOutcome {
  const none: BattleDamageOutcome = {
    unit,
    enteredDeathsDoor: false,
    deathblowRolled: false,
    heroDied: false,
    logs: [],
  };
  if (amount <= 0) return none;
  if (!unit.isAlive) return none; // 已死亡：拒绝重复处理

  // 怪物：保持 Phase 3 即时死亡
  if (unit.side === 'monster') {
    const hp = Math.max(0, unit.hp - amount);
    return { ...none, unit: { ...unit, hp, isAlive: hp > 0 } };
  }

  // 英雄：Death's Door 流程
  if (unit.atDeathsDoor) {
    const { roll, isDeathblow } = rollDeathblow();
    const rollCount = unit.deathblowRollCount + 1;
    if (isDeathblow) {
      return {
        unit: {
          ...unit,
          hp: 0,
          atDeathsDoor: false,
          isAlive: false,
          deathblowRollCount: rollCount,
          deathResolved: false,
        },
        enteredDeathsDoor: false,
        deathblowRolled: true,
        deathblowRoll: roll,
        deathblowResult: 'dead',
        heroDied: true,
        logs: [`${unit.name} 再次受伤，Deathblow Die = ${roll}，受到 Deathblow 并永久阵亡！`],
      };
    }
    return {
      unit: { ...unit, hp: 0, deathblowRollCount: rollCount },
      enteredDeathsDoor: false,
      deathblowRolled: true,
      deathblowRoll: roll,
      deathblowResult: 'safe',
      heroDied: false,
      logs: [`${unit.name} 再次受伤，Deathblow Die = ${roll}，暂时逃过死亡。`],
    };
  }

  // 未处于 Death's Door：正常扣血
  const hp = Math.max(0, unit.hp - amount);
  if (hp > 0) {
    return { ...none, unit: { ...unit, hp } };
  }
  // 首次归零 → 进入 Death's Door（本次不掷骰）
  return {
    unit: { ...unit, hp: 0, atDeathsDoor: true },
    enteredDeathsDoor: true,
    deathblowRolled: false,
    heroDied: false,
    logs: [`${unit.name} 的生命降至 0，进入 Death's Door！`],
  };
}

// ---------------------------------------------------------------------------
// Campaign 层伤害入口（Trap / 探索事件等非战斗伤害）
// ---------------------------------------------------------------------------

const MAX_EVENT_IDS = 200;

function sourceTypeToCause(sourceType: DamageCommand['sourceType']): HeroDeathCause {
  switch (sourceType) {
    case 'attack':
      return 'deathblow-attack';
    case 'bleed':
      return 'deathblow-bleed';
    case 'blight':
      return 'deathblow-blight';
    case 'periodic-batch':
      return 'deathblow-periodic';
    case 'trap':
      return 'deathblow-trap';
    case 'exploration':
      return 'deathblow-exploration';
    default:
      return 'unknown';
  }
}

/**
 * 统一伤害入口（Campaign 英雄，非战斗场景）。
 * - 同一 eventId 只处理一次（幂等）；
 * - HP（maxLife - wounds）首次归零进入 Death's Door；
 * - Death's Door 再受伤掷 Deathblow；骷髅 → killCampaignHero（含 DeathRecord 与替补排队）。
 */
export function resolveDamage(
  campaign: CampaignState,
  command: DamageCommand,
  ctx?: RuleEventContext
): { campaign: CampaignState; resolution: DamageResolution } {
  /**
   * Phase 8B：伤害真正落地且英雄存活后发射 damage-resolved
   * （Spotted Fever → Blight，Syphilis → 等级伤害）。
   * command.derived === true 表示本次伤害本身就是被动派生产物，不再二次发射。
   */
  const emitDamageResolved = (c: CampaignState): CampaignState => {
    if (command.derived) return c;
    const fresh = c.heroes.find((h) => h.instanceId === command.targetId);
    if (!fresh || fresh.dead) return c;
    const baseCtx = ctx ?? createRuleEventContext();
    return emitRuleEvent(
      c,
      { type: 'damage-resolved', heroId: command.targetId },
      ctx ? childRuleEventContext(baseCtx) : baseCtx
    );
  };

  const hero = campaign.heroes.find((h) => h.instanceId === command.targetId);
  const noop = (logs: string[] = []): { campaign: CampaignState; resolution: DamageResolution } => ({
    campaign,
    resolution: {
      targetId: command.targetId,
      previousHp: hero ? Math.max(0, hero.maxLife - hero.wounds) : 0,
      nextHp: hero ? Math.max(0, hero.maxLife - hero.wounds) : 0,
      enteredDeathsDoor: false,
      deathblowRolled: false,
      heroDied: false,
      logs,
    },
  });

  if (!hero || hero.dead || command.amount <= 0) return noop();
  // 幂等：同一伤害事件只结算一次
  if (campaign.processedDamageEventIds.includes(command.eventId)) return noop();

  // Phase 8A：Quirk 前置修正器（Fragile / Hard Skinned / 来源与光照条件类）
  const mod = applyQuirkModifiers(
    campaign,
    hero.instanceId,
    'damage-taken',
    command.amount,
    command.sourceType
  );
  const modifiedAmount = mod.amount;
  if (modifiedAmount <= 0 && !hero.atDeathsDoor) {
    // 修正后归零：完全抵消（Death's Door 下仍需掷 Deathblow，不抵消）
    const c = mod.applied.length
      ? pushLog(campaign, `${hero.name} 的伤害被怪癖完全抵消${describeModifierApplications(mod.applied)}。`, 'info')
      : campaign;
    return { campaign: c, resolution: noop().resolution };
  }
  if (mod.applied.length > 0) {
    campaign = pushLog(
      campaign,
      `${hero.name} 受到伤害 ${command.amount} → ${modifiedAmount}${describeModifierApplications(mod.applied)}。`,
      'info'
    );
  }

  const markProcessed = (c: CampaignState): CampaignState => ({
    ...c,
    processedDamageEventIds: [...c.processedDamageEventIds, command.eventId].slice(-MAX_EVENT_IDS),
  });

  const previousHp = Math.max(0, hero.maxLife - hero.wounds);

  // Death's Door：掷 Deathblow
  if (hero.atDeathsDoor) {
    const { roll, isDeathblow } = rollDeathblow();
    let c: CampaignState = {
      ...campaign,
      heroes: campaign.heroes.map((h) =>
        h.instanceId === hero.instanceId
          ? { ...h, deathblowRollCount: h.deathblowRollCount + 1 }
          : h
      ),
    };
    if (isDeathblow) {
      c = killCampaignHero(c, {
        heroInstanceId: hero.instanceId,
        cause: sourceTypeToCause(command.sourceType),
        source: command.sourceType === 'trap' || command.sourceType === 'exploration' ? 'exploration' : 'battle',
        resumePhase: 'dungeon-explore',
        questId: campaign.currentQuestId ?? undefined,
        roomId: campaign.dungeon?.currentRoomId,
      });
      c = markProcessed(c);
      return {
        campaign: c,
        resolution: {
          targetId: hero.instanceId,
          previousHp,
          nextHp: 0,
          enteredDeathsDoor: false,
          deathblowRolled: true,
          deathblowRoll: roll,
          deathblowResult: 'dead',
          heroDied: true,
          logs: [`${hero.name} 再次受伤，Deathblow Die = ${roll}，受到 Deathblow 并永久阵亡！`],
        },
      };
    }
    c = markProcessed(c);
    c = pushLog(c, `${hero.name} 再次受伤，Deathblow Die = ${roll}，暂时逃过死亡。`, 'warning');
    c = emitDamageResolved(c);
    return {
      campaign: c,
      resolution: {
        targetId: hero.instanceId,
        previousHp,
        nextHp: 0,
        enteredDeathsDoor: false,
        deathblowRolled: true,
        deathblowRoll: roll,
        deathblowResult: 'safe',
        heroDied: false,
        logs: [`${hero.name} Deathblow Die = ${roll}，暂时安全。`],
      },
    };
  }

  // 普通扣血（使用怪癖修正后的伤害值）
  const nextHp = Math.max(0, previousHp - modifiedAmount);
  const entered = nextHp === 0;
  let c: CampaignState = {
    ...campaign,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === hero.instanceId
        ? {
            ...h,
            wounds: h.maxLife - nextHp,
            atDeathsDoor: entered ? true : h.atDeathsDoor,
          }
        : h
    ),
  };
  c = markProcessed(c);
  if (entered) {
    c = pushLog(c, `${hero.name} 的生命降至 0，进入 Death's Door！`, 'danger');
  }
  if (modifiedAmount > 0) c = emitDamageResolved(c);
  return {
    campaign: c,
    resolution: {
      targetId: hero.instanceId,
      previousHp,
      nextHp,
      enteredDeathsDoor: entered,
      deathblowRolled: false,
      heroDied: false,
      logs: entered ? [`${hero.name} 进入 Death's Door。`] : [],
    },
  };
}
