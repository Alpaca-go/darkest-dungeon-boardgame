import type { CampaignState, GamePhase } from '../types';

/**
 * Phase 5 统一路由守卫（纯函数，便于单测）。
 * 每个 gamePhase 只允许访问其对应页面 + 少量向后兼容页面；
 * 数据完整性再做二次校验（不依赖 UI 按钮禁用）。
 */

/** gamePhase → 主路由。 */
export function routeForPhase(phase: GamePhase): string {
  switch (phase) {
    case 'campaign-setup':
      return '/setup';
    case 'skill-loadout':
      return '/loadout';
    case 'quest-select':
      return '/quests';
    case 'dungeon-explore':
      return '/dungeon';
    case 'battle':
      return '/battle';
    case 'quest-result':
      return '/result';
    case 'hamlet':
      return '/hamlet';
    case 'replacement':
      return '/replacement';
    case 'campaign-over':
      return '/campaign-over';
    case 'home':
    default:
      return '/';
  }
}

/** 各 gamePhase 允许停留的路由集合（'/' 永远合法）。 */
const ALLOWED_PATHS: Record<GamePhase, string[]> = {
  home: ['/'],
  'campaign-setup': ['/', '/setup'],
  // 技能配置阶段允许回到英雄选择调整阵容。
  'skill-loadout': ['/', '/setup', '/loadout'],
  'quest-select': ['/', '/quests'],
  'dungeon-explore': ['/', '/dungeon'],
  battle: ['/', '/battle'],
  'quest-result': ['/', '/result'],
  hamlet: ['/', '/hamlet'],
  replacement: ['/', '/replacement'],
  'campaign-over': ['/', '/campaign-over'],
};

export interface GuardResult {
  ok: boolean;
  /** 非法进入时的跳转目标（最近的合法页面）。 */
  redirect: string;
  /** 拒绝原因（写入开发日志）。 */
  reason: string;
}

const OK: GuardResult = { ok: true, redirect: '', reason: '' };

/** 页面数据前置条件（阶段允许之外的完整性双保险）。 */
function dataError(campaign: CampaignState, path: string): string | null {
  switch (path) {
    case '/loadout':
      return campaign.heroes.length === 4 ? null : '未选满 4 名英雄';
    case '/quests':
      return campaign.heroes.length === 4 &&
        campaign.heroes.every((h) => (h.equippedSkillIds?.length ?? 0) === 3)
        ? null
        : '技能配置未完成';
    case '/dungeon':
      return campaign.currentQuestId && campaign.dungeon ? null : '没有进行中的任务/地牢';
    case '/battle':
      return campaign.battle ? null : '没有进行中的战斗';
    case '/result':
      return campaign.questResultResolved && campaign.lastQuestResult ? null : '没有任务结算数据';
    case '/hamlet':
      return campaign.hamlet?.currentEventId ? null : '没有进行中的 Hamlet 阶段';
    case '/replacement': {
      const pending = campaign.stagecoach?.pendingReplacement;
      return pending && pending.slots.length > 0 ? null : '没有待处理的替补流程';
    }
    default:
      return null;
  }
}

/** 计算 campaign 当前最合适的合法路由。 */
export function nearestLegalPath(campaign: CampaignState | null): string {
  if (!campaign) return '/';
  const main = routeForPhase(campaign.gamePhase);
  if (main === '/') return '/';
  return dataError(campaign, main) === null ? main : '/';
}

/**
 * 判断某路径当前是否可进入。
 * 非法进入返回最近合法页面作为 redirect。
 */
export function checkRouteAccess(campaign: CampaignState | null, path: string): GuardResult {
  if (path === '/') return OK;

  if (!campaign) {
    return { ok: false, redirect: '/', reason: '没有进行中的战役' };
  }

  const allowed = ALLOWED_PATHS[campaign.gamePhase] ?? ['/'];
  if (!allowed.includes(path)) {
    return {
      ok: false,
      redirect: nearestLegalPath(campaign),
      reason: `当前阶段 ${campaign.gamePhase} 不允许访问 ${path}`,
    };
  }

  const err = dataError(campaign, path);
  if (err) {
    return { ok: false, redirect: nearestLegalPath(campaign), reason: `${path} 前置条件不满足：${err}` };
  }
  return OK;
}
