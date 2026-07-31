import type { CampaignState, HeroInstance, HeroXpState } from '../../types';
import { pushLog } from '../log';

// ---------------------------------------------------------------------------
// Phase 8D：XP 账本（唯一 XP 写入口）
//
// 核心约束：任何组件 / 页面 / 其它引擎模块都不得直接写 hero.xp 或 hero.xpState。
// 所有 XP 变动必须经过本文件的 earn* / spend* 函数，以保证：
// 1. currentXp === lifetimeXpEarned - lifetimeXpSpent 恒成立；
// 2. XP 永不为负；
// 3. 每次变动都有日志与可追溯的 reason。
// hero.xp 自 Phase 8D 起是 xpState.currentXp 的只读镜像，由本文件同步维护。
// ---------------------------------------------------------------------------

/** 新英雄的初始 XP 账本。 */
export function createInitialXpState(initialXp = 0): HeroXpState {
  const xp = Math.max(0, Math.round(initialXp));
  return { currentXp: xp, lifetimeXpEarned: xp, lifetimeXpSpent: 0 };
}

/** 读取英雄当前可用 XP（唯一读取入口，兼容缺账本的旧数据）。 */
export function getHeroXp(hero: HeroInstance): number {
  return hero.xpState ? hero.xpState.currentXp : Math.max(0, hero.xp ?? 0);
}

/** 修复 / 归一化英雄账本（迁移与防御性修复用；同时同步 xp 镜像）。 */
export function normalizeHeroXpState(hero: HeroInstance): HeroInstance {
  const raw = hero.xpState;
  let state: HeroXpState;
  if (
    raw &&
    typeof raw.currentXp === 'number' &&
    typeof raw.lifetimeXpEarned === 'number' &&
    typeof raw.lifetimeXpSpent === 'number'
  ) {
    const spent = Math.max(0, Math.round(raw.lifetimeXpSpent));
    const earned = Math.max(spent, Math.round(raw.lifetimeXpEarned));
    state = { currentXp: earned - spent, lifetimeXpEarned: earned, lifetimeXpSpent: spent };
  } else {
    // 旧存档：只有 hero.xp，视为「全部获得、未消耗」。
    state = createInitialXpState(hero.xp ?? 0);
  }
  if (
    hero.xpState &&
    hero.xpState.currentXp === state.currentXp &&
    hero.xpState.lifetimeXpEarned === state.lifetimeXpEarned &&
    hero.xpState.lifetimeXpSpent === state.lifetimeXpSpent &&
    hero.xp === state.currentXp
  ) {
    return hero;
  }
  return { ...hero, xpState: state, xp: state.currentXp };
}

/** 纯函数：给单个英雄加 XP（用于 draft hero 等尚未进入 campaign.heroes 的对象）。 */
export function earnXpOnHero(hero: HeroInstance, amount: number): HeroInstance {
  const add = Math.max(0, Math.round(amount));
  if (add === 0) return normalizeHeroXpState(hero);
  const base = normalizeHeroXpState(hero).xpState;
  const state: HeroXpState = {
    currentXp: base.currentXp + add,
    lifetimeXpEarned: base.lifetimeXpEarned + add,
    lifetimeXpSpent: base.lifetimeXpSpent,
  };
  return { ...hero, xpState: state, xp: state.currentXp };
}

/** 纯函数：扣除单个英雄的 XP。XP 不足时返回 null（调用方必须视为失败并回滚）。 */
export function spendXpOnHero(hero: HeroInstance, amount: number): HeroInstance | null {
  const cost = Math.max(0, Math.round(amount));
  const base = normalizeHeroXpState(hero).xpState;
  if (base.currentXp < cost) return null;
  const state: HeroXpState = {
    currentXp: base.currentXp - cost,
    lifetimeXpEarned: base.lifetimeXpEarned,
    lifetimeXpSpent: base.lifetimeXpSpent + cost,
  };
  return { ...hero, xpState: state, xp: state.currentXp };
}

/** 战役级：给指定英雄发放 XP 并写日志。 */
export function earnHeroXp(
  campaign: CampaignState,
  heroInstanceId: string,
  amount: number,
  reason: string
): CampaignState {
  const add = Math.max(0, Math.round(amount));
  if (add === 0) return campaign;
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  if (!hero) return campaign;
  const heroes = campaign.heroes.map((h) =>
    h.instanceId === heroInstanceId ? earnXpOnHero(h, add) : h
  );
  const updated = heroes.find((h) => h.instanceId === heroInstanceId)!;
  return pushLog(
    { ...campaign, heroes },
    `${hero.name} 获得 ${add} XP（${reason}），当前 ${getHeroXp(updated)} XP。`,
    'success'
  );
}

/** 战役级：给一组英雄发放相同数量的 XP（全队统一，不按人数拆分）。 */
export function earnPartyXp(
  campaign: CampaignState,
  heroInstanceIds: string[],
  amount: number,
  reason: string
): CampaignState {
  const add = Math.max(0, Math.round(amount));
  if (add === 0 || heroInstanceIds.length === 0) return campaign;
  const idSet = new Set(heroInstanceIds);
  const heroes = campaign.heroes.map((h) => (idSet.has(h.instanceId) ? earnXpOnHero(h, add) : h));
  const names = heroes
    .filter((h) => idSet.has(h.instanceId))
    .map((h) => h.name)
    .join('、');
  return pushLog(
    { ...campaign, heroes },
    `${names} 各获得 ${add} XP（${reason}）。`,
    'success'
  );
}

/** XP 扣减结果（失败时 campaign 原样返回，error 说明原因）。 */
export interface SpendXpResult {
  campaign: CampaignState;
  ok: boolean;
  error: string | null;
}

/** 战役级：扣除指定英雄的 XP（唯一消耗入口）。 */
export function spendHeroXp(
  campaign: CampaignState,
  heroInstanceId: string,
  amount: number,
  reason: string
): SpendXpResult {
  const cost = Math.max(0, Math.round(amount));
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  if (!hero) return { campaign, ok: false, error: '英雄不存在' };
  const spent = spendXpOnHero(hero, cost);
  if (!spent) {
    return {
      campaign,
      ok: false,
      error: `XP 不足（需要 ${cost}，当前 ${getHeroXp(hero)}）`,
    };
  }
  const heroes = campaign.heroes.map((h) => (h.instanceId === heroInstanceId ? spent : h));
  const next = pushLog(
    { ...campaign, heroes },
    `${hero.name} 消耗 ${cost} XP（${reason}），剩余 ${getHeroXp(spent)} XP。`,
    'info'
  );
  return { campaign: next, ok: true, error: null };
}

/** 账本自检（调试面板 / 单测用）：返回不一致的英雄描述列表。 */
export function auditXpLedger(campaign: CampaignState): string[] {
  const issues: string[] = [];
  for (const h of campaign.heroes) {
    const s = h.xpState;
    if (!s) {
      issues.push(`${h.name} 缺少 xpState`);
      continue;
    }
    if (s.currentXp < 0 || s.lifetimeXpEarned < 0 || s.lifetimeXpSpent < 0) {
      issues.push(`${h.name} 账本出现负值`);
    }
    if (s.currentXp !== s.lifetimeXpEarned - s.lifetimeXpSpent) {
      issues.push(
        `${h.name} 账本不平：${s.lifetimeXpEarned} - ${s.lifetimeXpSpent} ≠ ${s.currentXp}`
      );
    }
    if (h.xp !== s.currentXp) {
      issues.push(`${h.name} 的 xp 镜像（${h.xp}）与账本（${s.currentXp}）不一致`);
    }
  }
  return issues;
}
