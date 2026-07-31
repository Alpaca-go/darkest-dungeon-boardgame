// Phase 9A §6.3 / §6.4：Imminent Threat 接入通用被动引擎。
//
// 设计原则（§6.4 硬性要求）：
// - Threat 的每一条效果都被包装成一个标准 PassiveSource（sourceType = 'boss-threat'），
//   与 Quirk / Disease 走同一条排序、条件判定、循环保护链路；
// - 引擎与组件里不得出现任何 `if (threatId === 'xxx')` 的分支；
// - 效果作用域（Hamlet / Dungeon）与作用对象（全队 / 领队）来自**数据声明**，
//   本模块只负责按声明过滤，不认识任何具体 Threat。
//
// 依赖方向：stress / quirks / dungeon → 本模块 → data/bosses + rule-events（无环）。

import type {
  CampaignState,
  GamePhase,
  HeroInstance,
  PassiveSource,
  ThreatModifierDefinition,
  ThreatReactionDefinition,
} from '../../types';
import { getThreatById, THREAT_DEFAULT_PRIORITY } from '../../data/bosses/threat-registry';
import { collectHeroPassiveSources } from '../rule-events/passive-collector';

/** Threat 效果作用域。 */
export type ThreatScope = 'hamlet' | 'dungeon';

/**
 * 由当前游戏阶段推导 Threat 作用域（通用规则，不涉及任何 Threat id）。
 * - hamlet 阶段 → Hamlet Threat；
 * - 地牢探索 / 战斗 / 任务结算 → Dungeon Threat；
 * - 其余阶段（主页、选人、选任务、替补、战役结束）不生效。
 */
export function threatScopeForPhase(phase: GamePhase): ThreatScope | null {
  if (phase === 'hamlet') return 'hamlet';
  if (phase === 'dungeon-explore' || phase === 'battle' || phase === 'quest-result') {
    return 'dungeon';
  }
  return null;
}

/** Threat 是否仍在生效（§6.3：已抽取 + 未因进入 Boss Room 停止 + 战役未结束）。 */
export function isThreatActive(campaign: CampaignState): boolean {
  const rt = campaign.activeThreatRuntime;
  if (!rt || !rt.active) return false;
  if (campaign.campaignProgress.activeThreatId !== rt.threatId) return false;
  if (campaign.gamePhase === 'campaign-over') return false;
  return true;
}

/** Hamlet Threat 是否生效（§6.3）。 */
export function isHamletThreatActive(campaign: CampaignState): boolean {
  return isThreatActive(campaign) && threatScopeForPhase(campaign.gamePhase) === 'hamlet';
}

/** Dungeon Threat 是否生效（§6.3）。 */
export function isDungeonThreatActive(campaign: CampaignState): boolean {
  return isThreatActive(campaign) && threatScopeForPhase(campaign.gamePhase) === 'dungeon';
}

/** 当前领队英雄（存活英雄中 partySlot 最小者）。 */
export function getLeadHero(campaign: CampaignState): HeroInstance | undefined {
  const alive = campaign.heroes.filter((h) => !h.dead);
  if (alive.length === 0) return undefined;
  return alive.reduce((best, h) => (h.partySlot < best.partySlot ? h : best), alive[0]);
}

/** 一次性效果的消耗键：`${visitId}:${effectKey}`，换一次 Hamlet 访问天然重置。 */
export function threatOnceKey(campaign: CampaignState, effectKey: string): string {
  return `${campaign.hamlet.visitId}:${effectKey}`;
}

/** Threat 效果实例 id：`${threatId}:${effectKey}`（排序稳定 + 可定位到具体效果）。 */
export function threatSourceInstanceId(threatId: string, effectKey: string): string {
  return `${threatId}:${effectKey}`;
}

/** 从实例 id 还原 effectKey（用于消耗记录）。 */
export function effectKeyFromInstanceId(instanceId: string): string | null {
  const idx = instanceId.indexOf(':');
  return idx < 0 ? null : instanceId.slice(idx + 1);
}

function effectAppliesToHero(
  effect: { appliesTo?: 'all-heroes' | 'lead-hero' },
  campaign: CampaignState,
  hero: HeroInstance
): boolean {
  if ((effect.appliesTo ?? 'all-heroes') === 'all-heroes') return true;
  return getLeadHero(campaign)?.instanceId === hero.instanceId;
}

/**
 * 收集当前生效的 Threat 被动来源（针对某个英雄）。
 * - 已停止 / 阶段不匹配 → 空数组；
 * - oncePerHamletVisit 且本次访问已消耗 → 该条效果不再进入来源列表；
 * - 每条效果单独成一个 PassiveSource，instanceId = `${threatId}:${effectKey}`。
 */
export function collectThreatPassiveSources(
  campaign: CampaignState,
  hero: HeroInstance
): PassiveSource[] {
  if (!isThreatActive(campaign)) return [];
  const scope = threatScopeForPhase(campaign.gamePhase);
  if (!scope) return [];
  const rt = campaign.activeThreatRuntime!;
  const threat = getThreatById(rt.threatId);
  if (!threat) return [];

  const set = scope === 'hamlet' ? threat.hamletEffects : threat.dungeonEffects;
  const priority = threat.priority ?? THREAT_DEFAULT_PRIORITY;
  const sources: PassiveSource[] = [];

  const push = (
    effect: ThreatModifierDefinition | ThreatReactionDefinition,
    isModifier: boolean
  ) => {
    if (!effectAppliesToHero(effect, campaign, hero)) return;
    if (effect.oncePerHamletVisit && rt.consumedOnceKeys.includes(threatOnceKey(campaign, effect.key))) {
      return;
    }
    sources.push({
      sourceType: 'boss-threat',
      instanceId: threatSourceInstanceId(threat.id, effect.key),
      definitionId: threat.id,
      priority,
      ownerHeroId: hero.instanceId,
      modifiers: isModifier ? [effect as ThreatModifierDefinition] : [],
      reactions: isModifier ? [] : [effect as ThreatReactionDefinition],
      name: threat.name,
    });
  };

  for (const m of set.modifiers) push(m, true);
  for (const r of set.reactions) push(r, false);
  return sources;
}

/** 战役层完整被动来源 = 英雄自身（Quirk + Disease）+ 当前 Threat。 */
export function collectCampaignPassiveSources(
  campaign: CampaignState,
  hero: HeroInstance
): PassiveSource[] {
  const threatSources = collectThreatPassiveSources(campaign, hero);
  if (threatSources.length === 0) return collectHeroPassiveSources(hero);
  // 复用同一套稳定排序（quirk → disease → … → boss-threat）。
  return collectHeroPassiveSources(hero).concat(threatSources).sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0;
  });
}

/**
 * 记录「每次 Hamlet 访问只生效一次」效果的消耗。
 * 传入本次实际命中的来源实例 id 列表（modifier 应用结果或 reaction 触发结果），
 * 只有声明了 oncePerHamletVisit 的效果会被写入 consumedOnceKeys。
 */
export function consumeThreatOnceKeys(
  campaign: CampaignState,
  firedInstanceIds: readonly string[]
): CampaignState {
  const rt = campaign.activeThreatRuntime;
  if (!rt || firedInstanceIds.length === 0) return campaign;
  const threat = getThreatById(rt.threatId);
  if (!threat) return campaign;

  const allEffects = [
    ...threat.hamletEffects.modifiers,
    ...threat.hamletEffects.reactions,
    ...threat.dungeonEffects.modifiers,
    ...threat.dungeonEffects.reactions,
  ];
  const added: string[] = [];
  for (const instanceId of firedInstanceIds) {
    const key = effectKeyFromInstanceId(instanceId);
    if (!key) continue;
    const effect = allEffects.find((e) => e.key === key);
    if (!effect?.oncePerHamletVisit) continue;
    const onceKey = threatOnceKey(campaign, key);
    if (rt.consumedOnceKeys.includes(onceKey) || added.includes(onceKey)) continue;
    added.push(onceKey);
  }
  if (added.length === 0) return campaign;
  return {
    ...campaign,
    activeThreatRuntime: { ...rt, consumedOnceKeys: [...rt.consumedOnceKeys, ...added] },
  };
}

/** 从修正命中明细中挑出 Threat 来源的实例 id（供 consumeThreatOnceKeys 使用）。 */
export function threatInstanceIdsFromApplications(
  applied: readonly { sourceType: string; instanceId: string }[]
): string[] {
  return applied.filter((a) => a.sourceType === 'boss-threat').map((a) => a.instanceId);
}
