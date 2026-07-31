// Phase 8C：Trinket 使用窗口（Use Window）与使用机会（Opportunity）。
//
// 设计约束：
// - Trinket 是「主动来源」：本模块只负责**开窗**（告诉玩家「现在可以用哪几张」），
//   绝不自动结算任何效果，也绝不并入 Quirk / Disease 的被动收集器（核心约束 6）。
// - 开窗过程是纯函数且不掷骰（核心约束 2 由 UI 侧保证，引擎侧同样不产生随机数）。
// - 同一 eventId + 同一实例只会开一次窗（核心约束 3 / 4）。
// - 「每个英雄回合每张 Trinket 只能用一次」通过 usedTurnId === 当前 turnId 判定（关键规则 5）。

import type {
  CampaignState,
  TrinketSideDefinition,
  TrinketUseCondition,
  TrinketUseOpportunity,
  TrinketUseWindow,
} from '../../types';
import { createId, nowIso } from '../random';
import { getTrinketById, getTrinketSide, trinketDisplayName } from '../../data/trinkets/trinket-registry';
import { currentTrinketTurnId, findHero } from './trinket-state';

/**
 * 本轮真正接入运行时的窗口。
 * 未列出的窗口只存在于数据模型中，引擎不会凭空开口 —— 避免「有数据没入口」的假实现。
 */
export const WIRED_WINDOWS: readonly TrinketUseWindow[] = [
  'before-attack-roll',
  'hero-turn-start',
  'room-entered',
] as const;

export function isWiredWindow(w: TrinketUseWindow): boolean {
  return WIRED_WINDOWS.includes(w);
}

// ---------------------------------------------------------------------------
// 条件判定
// ---------------------------------------------------------------------------

function inBattle(campaign: CampaignState): boolean {
  return !!campaign.battle && campaign.battle.status === 'active';
}

/** 该英雄是否是当前行动者（战斗外恒为 true —— 战斗外没有「行动者」概念）。 */
function isActingHero(campaign: CampaignState, heroId: string): boolean {
  const b = campaign.battle;
  if (!b || b.status !== 'active' || !b.activeActorId) return !inBattle(campaign);
  const unit = b.heroes.find((u) => u.id === b.activeActorId);
  return !!unit && unit.sourceId === heroId;
}

function currentLight(campaign: CampaignState): number {
  const b = campaign.battle;
  if (b && typeof b.light === 'number') return b.light;
  return campaign.light;
}

function conditionMet(campaign: CampaignState, heroId: string, cond: TrinketUseCondition): boolean {
  switch (cond.type) {
    case 'in-battle':
      return inBattle(campaign);
    case 'out-of-battle':
      return !inBattle(campaign);
    case 'is-acting-hero':
      return isActingHero(campaign, heroId);
    case 'min-light':
      return currentLight(campaign) >= cond.value;
    case 'max-light':
      return currentLight(campaign) <= cond.value;
    default:
      return false;
  }
}

function allConditionsMet(campaign: CampaignState, heroId: string, side: TrinketSideDefinition): boolean {
  return (side.canUse ?? []).every((c) => conditionMet(campaign, heroId, c));
}

// ---------------------------------------------------------------------------
// 预览文本（引擎生成，UI 不得自行计算 —— 保证展示与结算同源）
// ---------------------------------------------------------------------------

const MODIFIER_LABEL: Record<string, string> = {
  accuracy: '命中',
  crit: '暴击',
  damage: '伤害',
  healing: '治疗',
  stress: '压力',
  'stress-recovery': '压力恢复',
  dodge: '闪避',
  'condition-duration': '状态持续',
  light: '光照',
  'dungeon-roll': '地牢检定',
};

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function buildOpportunityPreview(side: TrinketSideDefinition): string {
  const parts: string[] = [];
  for (const m of side.modifiers) {
    const label = MODIFIER_LABEL[m.type] ?? m.type;
    parts.push(m.operation === 'set' ? `${label} = ${m.amount}` : `${label} ${signed(m.amount)}`);
  }
  for (const e of side.effects) {
    switch (e.type) {
      case 'damage-self':
        parts.push(`自身受到 ${e.amount} 点伤害`);
        break;
      case 'heal-self':
        parts.push(`自身回复 ${e.amount} 点生命`);
        break;
      case 'stress-self':
        parts.push(`自身 +${e.amount} 压力`);
        break;
      case 'recover-stress-self':
        parts.push(`自身回复 ${e.amount} 点压力`);
        break;
      case 'apply-condition-self':
        parts.push(`自身获得 ${e.condition} ${e.amount}`);
        break;
      case 'change-light':
        parts.push(`光照 ${signed(e.amount)}`);
        break;
      case 'consume-provision':
        parts.push(`消耗 ${e.provision} ×${e.amount}`);
        break;
      case 'log-only':
        parts.push(e.note);
        break;
      default:
        break;
    }
  }
  if (parts.length === 0) return side.label || '无数值效果';
  return parts.join('；');
}

// ---------------------------------------------------------------------------
// 开窗
// ---------------------------------------------------------------------------

export interface OpenTrinketWindowCommand {
  window: TrinketUseWindow;
  /** 开窗对象英雄（只检查该英雄自己身上的 Trinket）。 */
  heroId: string;
  /** 本次开窗事件 id（幂等域；同一 eventId 重复调用不会重复开窗）。 */
  eventId: string;
  /** 根事件 id（默认等于 eventId）。 */
  rootEventId?: string;
}

export interface OpenTrinketWindowResult {
  campaign: CampaignState;
  opened: TrinketUseOpportunity[];
  /** 是否有任何机会被打开（调用方据此决定是否需要暂停流程等待玩家）。 */
  hasOpportunity: boolean;
}

/**
 * 在指定窗口为某英雄开放 Trinket 使用机会。
 * 不满足条件时原样返回（campaign 引用不变），调用方可安全地无脑调用。
 */
export function openTrinketWindow(
  campaign: CampaignState,
  cmd: OpenTrinketWindowCommand
): OpenTrinketWindowResult {
  const none: OpenTrinketWindowResult = { campaign, opened: [], hasOpportunity: false };
  if (!isWiredWindow(cmd.window)) return none;

  const hero = findHero(campaign, cmd.heroId);
  if (!hero || !hero.isAlive || hero.dead) return none;

  const existing = campaign.pendingTrinketUseOpportunities ?? [];
  const turnId = currentTrinketTurnId(campaign);
  const rootEventId = cmd.rootEventId ?? cmd.eventId;
  const opened: TrinketUseOpportunity[] = [];

  for (const inst of hero.equippedTrinkets ?? []) {
    const def = getTrinketById(inst.trinketId);
    if (!def) continue; // 未知定义 → 静默跳过，绝不白屏（核心约束 10）
    const side = getTrinketSide(inst.trinketId, inst.currentSide);
    if (!side) continue; // 当前面定义缺失 → 同样安全跳过
    if (!side.useWindows.includes(cmd.window)) continue;
    if (!allConditionsMet(campaign, hero.instanceId, side)) continue;
    // 关键规则 5：同一回合内每张 Trinket 只能用一次
    if (turnId !== null && inst.usedTurnId === turnId) continue;
    // 幂等：同一事件 + 同一实例不重复开窗
    if (existing.some((o) => o.eventId === cmd.eventId && o.trinketInstanceId === inst.instanceId)) {
      continue;
    }
    opened.push({
      id: createId('topp'),
      heroId: hero.instanceId,
      trinketInstanceId: inst.instanceId,
      trinketId: inst.trinketId,
      eventId: cmd.eventId,
      rootEventId,
      turnId,
      side: inst.currentSide,
      useWindow: cmd.window,
      preview: `${trinketDisplayName(inst.trinketId)}（${inst.currentSide === 'positive' ? '正面' : '负面'}）：${buildOpportunityPreview(side)}`,
      status: 'open',
      createdAt: nowIso(),
    });
  }

  if (opened.length === 0) return none;
  return {
    campaign: {
      ...campaign,
      pendingTrinketUseOpportunities: [...existing, ...opened],
    },
    opened,
    hasOpportunity: true,
  };
}

// ---------------------------------------------------------------------------
// 查询 / 关窗
// ---------------------------------------------------------------------------

export function openOpportunities(campaign: CampaignState): TrinketUseOpportunity[] {
  return (campaign.pendingTrinketUseOpportunities ?? []).filter((o) => o.status === 'open');
}

export function openOpportunitiesForEvent(
  campaign: CampaignState,
  eventId: string
): TrinketUseOpportunity[] {
  return openOpportunities(campaign).filter((o) => o.eventId === eventId);
}

export function hasOpenTrinketOpportunity(campaign: CampaignState): boolean {
  return openOpportunities(campaign).length > 0;
}

export function findOpportunity(
  campaign: CampaignState,
  opportunityId: string
): TrinketUseOpportunity | undefined {
  return (campaign.pendingTrinketUseOpportunities ?? []).find((o) => o.id === opportunityId);
}

/**
 * 关闭某事件下所有仍开放的机会（标记 expired 并从队列移除）。
 * 用于「玩家放弃/流程继续」时清场，保证不会残留幽灵窗口。
 */
export function closeTrinketWindow(campaign: CampaignState, eventId: string): CampaignState {
  const list = campaign.pendingTrinketUseOpportunities ?? [];
  const next = list.filter((o) => o.eventId !== eventId);
  if (next.length === list.length) return campaign;
  return { ...campaign, pendingTrinketUseOpportunities: next };
}

/** 清空全部机会（阶段切换 / 战斗结束时兜底）。 */
export function clearAllTrinketOpportunities(campaign: CampaignState): CampaignState {
  if ((campaign.pendingTrinketUseOpportunities ?? []).length === 0) return campaign;
  return { ...campaign, pendingTrinketUseOpportunities: [] };
}
