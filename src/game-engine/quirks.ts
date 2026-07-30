// Phase 8A：Quirk 后置反应（post-reaction）引擎与 Quirk 获取状态机。
//
// 反应器规则：
// - emitRuleEvent 在「时机型事件」（battle-started / scout-attempted / room-entered /
//   hamlet-arrived / quest-completed）发生后触发英雄 Quirk 的 reactions；
// - 所有派生效果一律路由统一管线（applyStress / recoverStress / resolveDamage /
//   resolveHealing），禁止直接改业务字段；
// - 循环保护：同一 Quirk 在同一根事件内最多触发一次（triggeredQuirkIds）；
//   派生深度超过 MAX_RULE_EVENT_DEPTH 时静默丢弃并写开发日志。
//
// Quirk 获取状态机（上限 3 = positive + negative 合计）：
// - 已拥有同名 Quirk → duplicate（no-op）；
// - 未达上限 → 直接加入；
// - 已达上限，新 Positive → PendingQuirkDecision（可放弃新 Quirk 或替换既有 Positive；
//   若没有 Positive 可替换则自动放弃）；
// - 已达上限，新 Negative → 必须替换一个既有 Positive（PendingQuirkDecision，不可放弃）；
//   若 3 个全是 Negative（即第 4 个 Negative）→ Madness Death；
// - Madness Death 绕过 Death's Door / Deathblow，直接调用 Phase 6 killCampaignHero。

import type {
  AcquireQuirkOutcome,
  CampaignState,
  HeroInstance,
  PassiveSource,
  PendingQuirkDecision,
  QuirkReactionEffect,
  RuleEventContext,
  RuleEventType,
} from '../types';
import { getQuirkById } from '../data/quirks';
import { collectHeroPassiveSources, passiveConditionMet } from './rule-events/passive-collector';
import { passiveTriggerKey } from './rule-events/passive-ordering';
import { applyStress, recoverStress } from './stress';
import { resolveDamage } from './damage';
import { resolveHealing } from './healing';
import { killCampaignHero } from './hero-death';
import { pushMentalEvent } from './mental-log';
import { createId, d10, nowIso } from './random';
import { pushLog } from './log';

/** 每名英雄 Quirk 总数上限（positive + negative 合计）。 */
export const QUIRK_CAP = 3;

/** 派生事件最大深度（正常玩法 reactions 深度为 1；上限用于极端防护）。 */
export const MAX_RULE_EVENT_DEPTH = 4;

/** 待决策队列上限（防存档膨胀；正常玩法一次结算最多 4 条）。 */
const DECISION_LIMIT = 20;

/** 创建根事件上下文。 */
export function createRuleEventContext(): RuleEventContext {
  return { rootEventId: createId('rev'), depth: 0, triggeredPassiveKeys: [] };
}

/** 派生子上下文（深度 +1，共享同一份已触发键数组）。 */
export function childRuleEventContext(ctx: RuleEventContext): RuleEventContext {
  return { ...ctx, depth: ctx.depth + 1 };
}

function heroTotalQuirks(hero: HeroInstance): number {
  return hero.positiveQuirkIds.length + hero.negativeQuirkIds.length;
}

// ---------------------------------------------------------------------------
// 反应效果执行（全部路由统一管线）
// ---------------------------------------------------------------------------

/** 被动来源在日志中的称谓（Quirk =「怪癖」，Disease =「疾病」）。 */
function sourceLabel(src: PassiveSource): string {
  return src.sourceType === 'disease' ? '疾病' : '怪癖';
}

/**
 * Phase 8B：把 Bleed / Blight 写入英雄。
 * - 战斗中：直接写入对应 BattleUnit（层数递减模型）；
 * - 战斗外：累积到 HeroInstance.pendingBleed / pendingBlight，进入下一场战斗时注入。
 */
function writeConditionLayers(
  campaign: CampaignState,
  heroId: string,
  condition: 'bleed' | 'blight',
  layers: number
): CampaignState {
  if (layers <= 0) return campaign;
  const battle = campaign.battle;
  const unit = battle?.heroes.find((u) => u.sourceId === heroId && u.isAlive);
  if (battle && unit) {
    return {
      ...campaign,
      battle: {
        ...battle,
        heroes: battle.heroes.map((u) =>
          u.id === unit.id ? { ...u, [condition]: u[condition] + layers } : u
        ),
      },
    };
  }
  const field = condition === 'bleed' ? 'pendingBleed' : 'pendingBlight';
  return {
    ...campaign,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === heroId ? { ...h, [field]: (h[field] ?? 0) + layers } : h
    ),
  };
}

/**
 * Phase 8B：统一的「施加 Bleed / Blight」入口。
 * 施加前先发射 bleed-before-apply / blight-before-apply，
 * 使 Hemophilia / Black Plague 能够追加独立层数与派生伤害（受循环保护约束）。
 */
export function applyConditionToHero(
  campaign: CampaignState,
  heroId: string,
  condition: 'bleed' | 'blight',
  potency: number,
  duration: number,
  sourceName: string,
  ctx: RuleEventContext
): CampaignState {
  const hero = campaign.heroes.find((h) => h.instanceId === heroId);
  if (!hero || hero.dead || potency <= 0) return campaign;

  const beforeType: RuleEventType =
    condition === 'bleed' ? 'bleed-before-apply' : 'blight-before-apply';
  let next = emitRuleEvent(campaign, { type: beforeType, heroId }, childRuleEventContext(ctx));

  const fresh = next.heroes.find((h) => h.instanceId === heroId);
  if (!fresh || fresh.dead) return next;

  next = writeConditionLayers(next, heroId, condition, potency);
  return pushLog(
    next,
    `${fresh.name} 受到 ${condition === 'bleed' ? 'Bleed' : 'Blight'} ${potency} / ${duration} turns（来源：${sourceName}）。`,
    'warning'
  );
}

function execReactionEffect(
  campaign: CampaignState,
  hero: HeroInstance,
  src: PassiveSource,
  effect: QuirkReactionEffect,
  ctx: RuleEventContext
): CampaignState {
  const questId = campaign.currentQuestId ?? '';
  const label = sourceLabel(src);
  const name = src.name;
  let next = campaign;
  switch (effect.type) {
    case 'stress-self': {
      const out = applyStress(next, {
        heroId: hero.instanceId,
        amount: effect.amount,
        sourceType: 'quirk',
        sourceId: `${name}:${ctx.rootEventId}`,
        questId,
        ctx,
      });
      return out.campaign;
    }
    case 'stress-recover-self': {
      const out = recoverStress(next, {
        heroId: hero.instanceId,
        amount: effect.amount,
        sourceType: 'quirk',
        sourceId: `${name}:${ctx.rootEventId}`,
        questId,
      });
      return out.campaign;
    }
    case 'stress-allies': {
      for (const ally of next.heroes) {
        if (ally.dead || ally.instanceId === hero.instanceId) continue;
        const out = applyStress(next, {
          heroId: ally.instanceId,
          amount: effect.amount,
          sourceType: 'quirk',
          sourceId: `${name}:${ctx.rootEventId}`,
          questId,
          ctx,
        });
        next = out.campaign;
      }
      return next;
    }
    case 'damage-self': {
      const out = resolveDamage(
        next,
        {
          targetId: hero.instanceId,
          amount: effect.amount,
          sourceType: 'exploration',
          eventId: createId('qrk-dmg'),
          derived: true,
        },
        ctx
      );
      return out.campaign;
    }
    case 'damage-self-scaled': {
      const amount = Math.max(0, effect.multiplier * (hero.level ?? 1));
      if (amount <= 0) return next;
      next = pushLog(
        next,
        `${hero.name} 因${label}「${name}」受到 ${amount} 点伤害（${effect.multiplier} × 等级 ${hero.level}）。`,
        'danger'
      );
      const out = resolveDamage(
        next,
        {
          targetId: hero.instanceId,
          amount,
          sourceType: 'exploration',
          eventId: createId('dis-dmg'),
          derived: true,
        },
        ctx
      );
      return out.campaign;
    }
    case 'condition-self': {
      return applyConditionToHero(
        next,
        hero.instanceId,
        effect.condition,
        effect.potency,
        effect.duration,
        name,
        ctx
      );
    }
    case 'heal-self': {
      const out = resolveHealing(next, hero.instanceId, effect.amount);
      return out.campaign;
    }
    case 'consume-provision': {
      const current = next.provisions[effect.provision];
      const consumed = Math.min(current, effect.amount);
      if (consumed <= 0) return next;
      next = {
        ...next,
        provisions: { ...next.provisions, [effect.provision]: current - consumed },
      };
      return pushLog(next, `${hero.name} 因${label}「${name}」额外消耗 ${consumed} 份补给。`, 'warning');
    }
    case 'gain-gold': {
      next = { ...next, gold: next.gold + effect.amount };
      return pushLog(next, `${hero.name} 因${label}「${name}」获得 ${effect.amount} Gold。`, 'success');
    }
    case 'lose-gold': {
      const lost = Math.min(next.gold, effect.amount);
      next = { ...next, gold: next.gold - lost };
      return pushLog(next, `${hero.name} 因${label}「${name}」失去 ${lost} Gold。`, 'warning');
    }
    case 'log-only':
      return pushLog(next, `${hero.name}（${name}）：${effect.message}`, 'info');
    default:
      return next;
  }
}

// ---------------------------------------------------------------------------
// 事件发射
// ---------------------------------------------------------------------------

/**
 * 对单个英雄发射一个时机型规则事件，触发其 Quirk 反应。
 * - dead 英雄不触发；
 * - 同一 Quirk 在同一根事件（ctx.rootEventId）内最多触发一次；
 * - chanceD10 存在时掷 d10 <= chanceD10 才触发（可注入 RNG）；
 * - 深度超限：写开发日志并丢弃。
 */
export function emitRuleEvent(
  campaign: CampaignState,
  input: { type: RuleEventType; heroId: string },
  ctx: RuleEventContext = createRuleEventContext()
): CampaignState {
  if (ctx.depth >= MAX_RULE_EVENT_DEPTH) {
    return pushLog(campaign, '[开发] Rule Event 派生深度超限，已丢弃后续反应。', 'warning');
  }
  const hero = campaign.heroes.find((h) => h.instanceId === input.heroId);
  if (!hero || hero.dead) return campaign;

  let next = campaign;
  // Phase 8B：Quirk + Disease 统一收集并稳定排序（priority → sourceType → instanceId）
  for (const src of collectHeroPassiveSources(hero)) {
    // 死亡短路：任一被动导致永久死亡后，停止该英雄剩余被动
    const alive = next.heroes.find((h) => h.instanceId === hero.instanceId);
    if (!alive || alive.dead) break;

    const reactions = src.reactions.filter((r) => r.eventType === input.type);
    if (reactions.length === 0) continue;
    // 循环保护：rootEventId + heroId + sourceType + instanceId + triggerType
    const key = passiveTriggerKey(
      ctx.rootEventId,
      hero.instanceId,
      src.sourceType,
      src.instanceId,
      input.type
    );
    if (ctx.triggeredPassiveKeys.includes(key)) continue;

    let triggered = false;
    for (const reaction of reactions) {
      if (!passiveConditionMet(reaction.condition, next.light)) continue;
      if (reaction.chanceD10 !== undefined && d10() > reaction.chanceD10) continue;
      if (!triggered) {
        triggered = true;
        ctx.triggeredPassiveKeys.push(key);
      }
      const childCtx = childRuleEventContext(ctx);
      const ev = pushMentalEvent(next, {
        questId: next.currentQuestId ?? '',
        heroId: hero.instanceId,
        type: 'quirk-reaction',
        sourceType: 'quirk',
        sourceId: src.definitionId,
        resultId: input.type,
      });
      next = ev.campaign;
      for (const effect of reaction.effects) {
        const fresh = next.heroes.find((h) => h.instanceId === hero.instanceId);
        if (!fresh || fresh.dead) break;
        next = execReactionEffect(next, fresh, src, effect, childCtx);
      }
    }
  }
  return next;
}

/** 对全体存活英雄发射同一时机事件（共享同一根事件上下文）。 */
export function emitPartyRuleEvent(
  campaign: CampaignState,
  type: RuleEventType,
  ctx: RuleEventContext = createRuleEventContext()
): CampaignState {
  let next = campaign;
  for (const hero of campaign.heroes) {
    if (hero.dead) continue;
    next = emitRuleEvent(next, { type, heroId: hero.instanceId }, ctx);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Quirk 获取状态机
// ---------------------------------------------------------------------------

export interface AcquireQuirkResult {
  campaign: CampaignState;
  outcome: AcquireQuirkOutcome;
  /** outcome === 'decision-pending' 时的决策 id。 */
  decisionId?: string;
}

export interface AcquireQuirkOptions {
  source: PendingQuirkDecision['source'];
  /** Madness Death 时传给 killCampaignHero 的恢复参数。 */
  deathSource?: 'battle' | 'exploration' | 'quest-result';
  deathResumePhase?: 'dungeon-explore' | 'quest-result' | 'hamlet';
}

function addQuirkToHero(campaign: CampaignState, heroId: string, quirkId: string): CampaignState {
  const def = getQuirkById(quirkId);
  if (!def) return campaign;
  let next: CampaignState = {
    ...campaign,
    heroes: campaign.heroes.map((h) => {
      if (h.instanceId !== heroId) return h;
      return def.polarity === 'positive'
        ? { ...h, positiveQuirkIds: [...h.positiveQuirkIds, quirkId] }
        : { ...h, negativeQuirkIds: [...h.negativeQuirkIds, quirkId] };
    }),
  };
  const hero = next.heroes.find((h) => h.instanceId === heroId);
  const ev = pushMentalEvent(next, {
    questId: next.currentQuestId ?? '',
    heroId,
    type: 'quirk-gained',
    sourceType: 'quirk',
    sourceId: quirkId,
  });
  next = ev.campaign;
  return pushLog(
    next,
    `${hero?.name ?? heroId} 获得怪癖「${def.name}」：${def.description}`,
    def.polarity === 'positive' ? 'success' : 'warning'
  );
}

/** 从英雄身上移除一个 Quirk（Abbey / 替换共用；不存在时 no-op）。 */
export function removeQuirkFromHero(
  campaign: CampaignState,
  heroId: string,
  quirkId: string
): CampaignState {
  const hero = campaign.heroes.find((h) => h.instanceId === heroId);
  if (!hero) return campaign;
  const has = hero.positiveQuirkIds.includes(quirkId) || hero.negativeQuirkIds.includes(quirkId);
  if (!has) return campaign;
  let next: CampaignState = {
    ...campaign,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === heroId
        ? {
            ...h,
            positiveQuirkIds: h.positiveQuirkIds.filter((id) => id !== quirkId),
            negativeQuirkIds: h.negativeQuirkIds.filter((id) => id !== quirkId),
          }
        : h
    ),
  };
  const ev = pushMentalEvent(next, {
    questId: next.currentQuestId ?? '',
    heroId,
    type: 'quirk-removed',
    sourceType: 'quirk',
    sourceId: quirkId,
  });
  next = ev.campaign;
  const name = getQuirkById(quirkId)?.name ?? quirkId;
  return pushLog(next, `${hero.name} 移除了怪癖「${name}」。`, 'info');
}

/** Madness Death：第 4 个 Negative Quirk。绕过 Death's Door / Deathblow。 */
export function triggerMadnessDeath(
  campaign: CampaignState,
  heroId: string,
  opts: AcquireQuirkOptions
): CampaignState {
  const hero = campaign.heroes.find((h) => h.instanceId === heroId);
  if (!hero || hero.dead) return campaign;
  let next = pushLog(
    campaign,
    `${hero.name} 无法承受第 4 个负面怪癖，精神彻底崩溃 —— 疯狂死亡！`,
    'danger'
  );
  const ev = pushMentalEvent(next, {
    questId: next.currentQuestId ?? '',
    heroId,
    type: 'madness-death',
    sourceType: 'quirk',
  });
  next = ev.campaign;
  return killCampaignHero(next, {
    heroInstanceId: heroId,
    cause: 'madness',
    source: opts.deathSource ?? 'quest-result',
    resumePhase: opts.deathResumePhase ?? 'quest-result',
    questId: next.currentQuestId ?? undefined,
  });
}

/**
 * Quirk 获取统一入口（见文件头状态机说明）。
 * 组件不得直接调用 addQuirkToHero / 修改 quirk 数组。
 */
export function acquireQuirk(
  campaign: CampaignState,
  heroId: string,
  quirkId: string,
  opts: AcquireQuirkOptions
): AcquireQuirkResult {
  const hero = campaign.heroes.find((h) => h.instanceId === heroId);
  const def = getQuirkById(quirkId);
  if (!hero || hero.dead || !def) return { campaign, outcome: 'duplicate' };

  // 已拥有：no-op
  if (hero.positiveQuirkIds.includes(quirkId) || hero.negativeQuirkIds.includes(quirkId)) {
    return {
      campaign: pushLog(campaign, `${hero.name} 已拥有怪癖「${def.name}」，本次获取无效。`, 'info'),
      outcome: 'duplicate',
    };
  }

  // 未达上限：直接加入
  if (heroTotalQuirks(hero) < QUIRK_CAP) {
    return { campaign: addQuirkToHero(campaign, heroId, quirkId), outcome: 'added' };
  }

  // 已达上限
  if (def.polarity === 'negative' && hero.positiveQuirkIds.length === 0) {
    // 3 个全是 Negative + 第 4 个 Negative → Madness Death
    return { campaign: triggerMadnessDeath(campaign, heroId, opts), outcome: 'madness-death' };
  }

  if (def.polarity === 'positive' && hero.positiveQuirkIds.length === 0) {
    // 新 Positive 但没有可替换的 Positive → 自动放弃
    return {
      campaign: pushLog(
        campaign,
        `${hero.name} 怪癖已满且没有可替换的正面怪癖，放弃获得「${def.name}」。`,
        'info'
      ),
      outcome: 'discarded',
    };
  }

  // 创建待决策（Positive：可放弃或替换既有 Positive；Negative：必须替换既有 Positive）
  const decision: PendingQuirkDecision = {
    id: createId('qdc'),
    heroId,
    heroName: hero.name,
    incomingQuirkId: quirkId,
    polarity: def.polarity,
    replaceableQuirkIds: [...hero.positiveQuirkIds],
    canDiscardIncoming: def.polarity === 'positive',
    source: opts.source,
    createdAt: nowIso(),
    resolved: false,
  };
  const queue = [...campaign.pendingQuirkDecisions, decision].slice(-DECISION_LIMIT);
  const next = pushLog(
    { ...campaign, pendingQuirkDecisions: queue },
    `${hero.name} 怪癖已满（${QUIRK_CAP}），「${def.name}」需要玩家决策。`,
    'warning'
  );
  return { campaign: next, outcome: 'decision-pending', decisionId: decision.id };
}

/** 玩家对 PendingQuirkDecision 的选择。 */
export type QuirkDecisionChoice =
  | { action: 'discard-incoming' }
  | { action: 'replace'; removeQuirkId: string };

/**
 * 结算一条待决策（幂等：不存在或已 resolved 时 no-op）。
 * - discard-incoming：仅 canDiscardIncoming 的决策允许；
 * - replace：removeQuirkId 必须在 replaceableQuirkIds 内。
 */
export function resolveQuirkDecision(
  campaign: CampaignState,
  decisionId: string,
  choice: QuirkDecisionChoice
): CampaignState {
  const decision = campaign.pendingQuirkDecisions.find((d) => d.id === decisionId);
  if (!decision || decision.resolved) return campaign;

  const markResolved = (c: CampaignState): CampaignState => ({
    ...c,
    pendingQuirkDecisions: c.pendingQuirkDecisions.map((d) =>
      d.id === decisionId ? { ...d, resolved: true } : d
    ),
  });

  if (choice.action === 'discard-incoming') {
    if (!decision.canDiscardIncoming) return campaign; // 非法选择：拒绝
    const name = getQuirkById(decision.incomingQuirkId)?.name ?? decision.incomingQuirkId;
    return markResolved(pushLog(campaign, `${decision.heroName} 放弃获得怪癖「${name}」。`, 'info'));
  }

  if (!decision.replaceableQuirkIds.includes(choice.removeQuirkId)) return campaign;
  let next = removeQuirkFromHero(campaign, decision.heroId, choice.removeQuirkId);
  next = addQuirkToHero(next, decision.heroId, decision.incomingQuirkId);
  return markResolved(next);
}

/** 第一条未处理的决策（UI 浮层数据源）。 */
export function firstPendingQuirkDecision(campaign: CampaignState): PendingQuirkDecision | null {
  return campaign.pendingQuirkDecisions.find((d) => !d.resolved) ?? null;
}
