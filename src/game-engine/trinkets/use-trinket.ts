// Phase 8C：Trinket 使用结算（declare → effects → flip → record）。
//
// 设计约束（开发文档 §8-§11）：
// - Trinket 是「主动来源」：只有玩家对一个 open Opportunity 显式声明才会走到这里；
// - Active Effect 一律回落官方统一管线（resolveDamage / resolveHealing /
//   applyStress / recoverStress / applyConditionToHero），绝不自建结算路径；
// - Active Modifier 本模块不结算数值，只把修正器返回给调用方
//   （before-attack-roll 由战斗集成注入 PendingBattleAction）；
// - 使用后翻到另一面（关键规则 4）；同一英雄回合每张只可用一次（关键规则 5）；
// - 幂等键 = eventId + trinketInstanceId + currentSide，防刷新 / 重复点击双重结算。

import type {
  ActiveEffectDefinition,
  ActiveModifierDefinition,
  CampaignState,
  PendingTrinketUseTransaction,
  RuleEventContext,
  TrinketSide,
  TrinketUseOpportunity,
} from '../../types';
import { createId } from '../random';
import { pushLog } from '../log';
import { resolveDamage } from '../damage';
import { resolveHealing } from '../healing';
import { applyStress, recoverStress } from '../stress';
import { applyConditionToHero, createRuleEventContext } from '../quirks';
import { getTrinketById, getTrinketSide, trinketDisplayName } from '../../data/trinkets/trinket-registry';
import {
  currentTrinketTurnId,
  findHero,
  isTrinketEventProcessed,
  markTrinketEventProcessed,
  otherSide,
  patchTrinketInstance,
  pushUseRecord,
} from './trinket-state';
import { findOpportunity } from './trinket-opportunities';

/** 光照钳制范围（棋盘火把轨 0-6；仅原型 change-light 效果使用）。 */
const LIGHT_MIN = 0;
const LIGHT_MAX = 6;

// ---------------------------------------------------------------------------
// 幂等键
// ---------------------------------------------------------------------------

export function trinketUseIdempotencyKey(
  eventId: string,
  trinketInstanceId: string,
  side: TrinketSide
): string {
  return `${eventId}:${trinketInstanceId}:${side}`;
}

// ---------------------------------------------------------------------------
// 校验（UI 与引擎同源；返回 null 表示可用）
// ---------------------------------------------------------------------------

export function trinketUseError(campaign: CampaignState, opportunityId: string): string | null {
  const opp = findOpportunity(campaign, opportunityId);
  if (!opp) return '使用机会不存在。';
  if (opp.status !== 'open') return '该使用机会已关闭。';

  const hero = findHero(campaign, opp.heroId);
  if (!hero || !hero.isAlive || hero.dead) return '英雄已无法使用 Trinket。';

  const inst = (hero.equippedTrinkets ?? []).find((t) => t.instanceId === opp.trinketInstanceId);
  if (!inst) return '该 Trinket 已不在英雄身上。';
  if (inst.currentSide !== opp.side) return 'Trinket 已翻面，本次机会失效。';

  const side = getTrinketSide(inst.trinketId, inst.currentSide);
  if (!side) return 'Trinket 定义缺失，无法使用。';

  // 关键规则 5：同一英雄回合每张 Trinket 只能使用一次
  const turnId = currentTrinketTurnId(campaign);
  if (turnId !== null && inst.usedTurnId === turnId) return '本回合已使用过这张 Trinket。';

  const key = trinketUseIdempotencyKey(opp.eventId, inst.instanceId, inst.currentSide);
  if (isTrinketEventProcessed(campaign, key)) return '这次使用已经结算过了。';

  return null;
}

// ---------------------------------------------------------------------------
// Active Effect → 官方统一管线
// ---------------------------------------------------------------------------

/** 战斗中把英雄的 HP / Death's Door 同步回 BattleUnit（战役侧为唯一事实源）。 */
function syncHeroVitalsToBattle(campaign: CampaignState, heroId: string): CampaignState {
  const b = campaign.battle;
  if (!b) return campaign;
  const hero = campaign.heroes.find((h) => h.instanceId === heroId);
  if (!hero) return campaign;
  const hp = Math.max(0, hero.maxLife - hero.wounds);
  let changed = false;
  const heroes = b.heroes.map((u) => {
    if (u.sourceId !== heroId) return u;
    if (u.hp === hp && u.atDeathsDoor === hero.atDeathsDoor && u.isAlive === hero.isAlive) return u;
    changed = true;
    return { ...u, hp, atDeathsDoor: hero.atDeathsDoor, isAlive: hero.isAlive && !hero.dead };
  });
  if (!changed) return campaign;
  return { ...campaign, battle: { ...b, heroes } };
}

function applyOneEffect(
  campaign: CampaignState,
  heroId: string,
  trinketName: string,
  effect: ActiveEffectDefinition,
  idemKey: string,
  index: number,
  ctx: RuleEventContext
): CampaignState {
  const questId = campaign.currentQuestId ?? '';
  const effectEventId = `${idemKey}:fx${index}`;
  switch (effect.type) {
    case 'damage-self': {
      const out = resolveDamage(
        campaign,
        {
          targetId: heroId,
          amount: effect.amount,
          sourceType: 'trinket',
          sourceSkillId: trinketName,
          eventId: effectEventId,
        },
        ctx
      );
      return syncHeroVitalsToBattle(out.campaign, heroId);
    }
    case 'heal-self': {
      const out = resolveHealing(campaign, heroId, effect.amount);
      return syncHeroVitalsToBattle(out.campaign, heroId);
    }
    case 'stress-self': {
      const out = applyStress(campaign, {
        heroId,
        amount: effect.amount,
        sourceType: 'trinket',
        sourceId: trinketName,
        questId,
        batchId: effectEventId,
        ctx,
      });
      return out.campaign;
    }
    case 'recover-stress-self': {
      const out = recoverStress(campaign, {
        heroId,
        amount: effect.amount,
        sourceType: 'trinket',
        sourceId: trinketName,
        questId,
      });
      return out.campaign;
    }
    case 'apply-condition-self': {
      // 官方状态管线只覆盖 Bleed / Blight；其余状态本轮不由 Trinket 施加
      if (effect.condition === 'bleed' || effect.condition === 'blight') {
        return applyConditionToHero(
          campaign,
          heroId,
          effect.condition,
          effect.amount,
          1,
          trinketName,
          ctx
        );
      }
      return pushLog(campaign, `${trinketName}：状态 ${effect.condition} 本阶段未接入，已跳过。`, 'info');
    }
    case 'change-light': {
      const next = Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, campaign.light + effect.amount));
      if (next === campaign.light) return campaign;
      let c: CampaignState = { ...campaign, light: next };
      if (c.battle) c = { ...c, battle: { ...c.battle, light: next } };
      return pushLog(c, `${trinketName}：光照 ${campaign.light} → ${next}。`, 'info');
    }
    case 'consume-provision': {
      const pool = campaign.provisions;
      const have = pool[effect.provision] ?? 0;
      const used = Math.min(have, Math.max(0, effect.amount));
      if (used <= 0) {
        return pushLog(campaign, `${trinketName}：补给 ${effect.provision} 不足，未消耗。`, 'info');
      }
      const c: CampaignState = {
        ...campaign,
        provisions: { ...pool, [effect.provision]: have - used },
      };
      return pushLog(c, `${trinketName}：消耗补给 ${effect.provision} ×${used}。`, 'info');
    }
    case 'log-only':
      return pushLog(campaign, `${trinketName}：${effect.note}`, 'info');
    default:
      return campaign;
  }
}

// ---------------------------------------------------------------------------
// 使用（declare + resolve 一体，事务状态机跨每一步落库）
// ---------------------------------------------------------------------------

export interface UseTrinketResult {
  campaign: CampaignState;
  /** 非 null 表示使用被拒绝（状态未变化）。 */
  error: string | null;
  /** 本次使用面上的主动修正器（before-attack-roll 由战斗集成注入冻结动作）。 */
  appliedModifiers: ActiveModifierDefinition[];
  usedOpportunity: TrinketUseOpportunity | null;
}

function writeTransaction(
  campaign: CampaignState,
  tx: PendingTrinketUseTransaction | null
): CampaignState {
  return { ...campaign, pendingTrinketUseTransaction: tx };
}

/**
 * 对一个 open Opportunity 声明并结算使用。
 * 顺序：校验 → 事务 declared → Active Effect（官方管线）→ effects-applied →
 * 翻面 + usedTurnId → flipped → 使用记录 + 幂等标记 → completed（清事务）。
 * 修正器不在此结算，原样返回给调用方。
 */
export function useTrinket(
  campaign: CampaignState,
  opportunityId: string,
  ctx?: RuleEventContext
): UseTrinketResult {
  const error = trinketUseError(campaign, opportunityId);
  if (error) return { campaign, error, appliedModifiers: [], usedOpportunity: null };

  const opp = findOpportunity(campaign, opportunityId)!;
  const hero = findHero(campaign, opp.heroId)!;
  const inst = (hero.equippedTrinkets ?? []).find((t) => t.instanceId === opp.trinketInstanceId)!;
  const def = getTrinketById(inst.trinketId);
  const side = getTrinketSide(inst.trinketId, inst.currentSide)!;
  const name = trinketDisplayName(inst.trinketId);
  const usedSide = inst.currentSide;
  const flippedTo = otherSide(usedSide);
  const turnId = currentTrinketTurnId(campaign);
  const idemKey = trinketUseIdempotencyKey(opp.eventId, inst.instanceId, usedSide);
  const rootCtx = ctx ?? createRuleEventContext();

  // 1. 事务 declared（跨刷新时 save.ts 会清掉半途事务与机会，安全失效）
  let next = writeTransaction(campaign, {
    transactionId: createId('ttx'),
    opportunityId: opp.id,
    heroId: hero.instanceId,
    trinketInstanceId: inst.instanceId,
    usedSide,
    idempotencyKey: idemKey,
    status: 'declared',
  });

  // 2. Active Effect → 官方统一管线
  side.effects.forEach((effect, i) => {
    next = applyOneEffect(next, hero.instanceId, name, effect, idemKey, i, rootCtx);
  });
  next = writeTransaction(next, { ...next.pendingTrinketUseTransaction!, status: 'effects-applied' });

  // 3. 翻面 + 本回合已用标记（关键规则 4 / 5）
  next = patchTrinketInstance(next, inst.instanceId, {
    currentSide: flippedTo,
    usedTurnId: turnId,
    lastUsedEventId: idemKey,
  });
  next = writeTransaction(next, { ...next.pendingTrinketUseTransaction!, status: 'flipped' });

  // 4. 记录 + 幂等标记 + 机会置为 used
  next = pushUseRecord(next, {
    heroId: hero.instanceId,
    heroName: hero.name,
    trinketId: inst.trinketId,
    trinketInstanceId: inst.instanceId,
    usedSide,
    flippedTo,
    useWindow: opp.useWindow,
    turnId,
    eventId: opp.eventId,
    idempotencyKey: idemKey,
  });
  next = markTrinketEventProcessed(next, idemKey);
  next = {
    ...next,
    pendingTrinketUseOpportunities: (next.pendingTrinketUseOpportunities ?? []).map((o) =>
      o.id === opp.id ? { ...o, status: 'used' as const } : o
    ),
  };
  next = pushLog(
    next,
    `${hero.name} 使用 ${name}（${usedSide === 'positive' ? '正面' : '负面'}）→ 翻到${flippedTo === 'positive' ? '正面' : '负面'}。`,
    'info'
  );

  // 5. completed：清事务
  next = writeTransaction(next, null);

  return {
    campaign: next,
    error: null,
    appliedModifiers: def ? [...side.modifiers] : [],
    usedOpportunity: { ...opp, status: 'used' },
  };
}

/** 玩家放弃某个使用机会（不翻面、不记 usedTurnId）。 */
export function declineTrinketUse(campaign: CampaignState, opportunityId: string): CampaignState {
  const opp = findOpportunity(campaign, opportunityId);
  if (!opp || opp.status !== 'open') return campaign;
  return {
    ...campaign,
    pendingTrinketUseOpportunities: (campaign.pendingTrinketUseOpportunities ?? []).filter(
      (o) => o.id !== opportunityId
    ),
  };
}

// ---------------------------------------------------------------------------
// 修正器汇总（战斗集成用）
// ---------------------------------------------------------------------------

export function sumModifiers(
  modifiers: ActiveModifierDefinition[],
  type: ActiveModifierDefinition['type']
): number {
  return modifiers
    .filter((m) => m.type === type && (m.operation ?? 'add') === 'add')
    .reduce((acc, m) => acc + m.amount, 0);
}
