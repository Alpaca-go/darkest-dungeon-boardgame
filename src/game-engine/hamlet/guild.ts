import type {
  CampaignState,
  GuildVisitSession,
  ProgressionTransactionRecord,
  ProgressionUpgradeChoice,
  ProgressionUpgradeType,
  ProgressionUpgradeValidation,
} from '../../types';
import { MAX_UPGRADES_PER_GUILD_VISIT } from '../../data/progression/guild-costs';
import { getSkillById } from '../../data/skills';
import { getHamletBuildingById } from '../../data/hamlet-buildings';
import { createId, nowIso } from '../random';
import { pushLog } from '../log';
import { buildingVisitError } from '../hamlet';
import {
  applyUpgradeChoicesToHero,
  buildUpgradeChoice,
  describeUpgradeChoice,
  pendingCostTotals,
  validateProgressionUpgrade,
} from '../progression/upgrade-core';

// ---------------------------------------------------------------------------
// Phase 8D：Guild 访问会话与原子升级事务
//
// 规则 6：Guild 本身不可升级（没有等级概念）。
// 规则 7：每次 Guild Visit 最多执行 2 次升级。
// 规则 8/9：Hero Level +1 = 4 XP + 2 Gold；Skill Level +1 = 2 XP + 1 Gold。
//
// 事务模型：
//   startGuildVisit → addGuildUpgrade × N（N ≤ 2）→ commitGuildVisit
// Commit 之前不修改任何英雄数据、不扣 Gold、不扣 XP。
// Commit 时整批重新校验并重算成本；任意一步失败即整体回滚（返回原 campaign）。
// guildVisitSession 存于 CampaignState，因此刷新页面后未提交的事务可继续。
// ---------------------------------------------------------------------------

const GUILD_ID = 'guild';

/** 当前 Guild 会话（未开始或已提交返回 null）。 */
export function getGuildSession(campaign: CampaignState): GuildVisitSession | null {
  const s = campaign.guildVisitSession;
  return s && !s.committed ? s : null;
}

/** 校验能否为该英雄开启 Guild 会话（null 表示可以）。 */
export function guildVisitError(campaign: CampaignState, heroInstanceId: string): string | null {
  const base = buildingVisitError(campaign, heroInstanceId, GUILD_ID);
  if (base) return base;
  const existing = getGuildSession(campaign);
  if (existing && existing.heroInstanceId !== heroInstanceId) {
    return '已有其他英雄的 Guild 会话未结束';
  }
  return null;
}

/** 开启 Guild 会话（不产生任何消费；已有同英雄会话时原样返回，刷新可续做）。 */
export function startGuildVisit(campaign: CampaignState, heroInstanceId: string): CampaignState {
  const existing = getGuildSession(campaign);
  if (existing?.heroInstanceId === heroInstanceId) return campaign;
  if (guildVisitError(campaign, heroInstanceId) !== null) return campaign;
  const session: GuildVisitSession = {
    id: createId('guild'),
    visitId: campaign.hamlet.visitId,
    day: campaign.hamlet.currentDay,
    heroInstanceId,
    choices: [],
    maxUpgrades: MAX_UPGRADES_PER_GUILD_VISIT,
    committed: false,
    createdAt: nowIso(),
  };
  return { ...campaign, guildVisitSession: session };
}

/** 取消 Guild 会话（未提交的选择全部丢弃，无任何副作用）。 */
export function cancelGuildVisit(campaign: CampaignState): CampaignState {
  if (!campaign.guildVisitSession) return campaign;
  return { ...campaign, guildVisitSession: null };
}

/** 校验一次 Guild 升级请求（供 UI 展示可用性与原因）。 */
export function validateGuildUpgrade(
  campaign: CampaignState,
  request: { type: ProgressionUpgradeType; skillId?: string | null }
): ProgressionUpgradeValidation | null {
  const session = getGuildSession(campaign);
  if (!session) return null;
  const hero = campaign.heroes.find((h) => h.instanceId === session.heroInstanceId);
  if (!hero) return null;
  return validateProgressionUpgrade(
    {
      hero,
      choices: session.choices,
      maxUpgrades: session.maxUpgrades,
      paymentMode: 'xp-and-gold',
      availableGold: campaign.gold,
    },
    request
  );
}

/** 向会话中添加一次升级选择（非法请求原样返回，不产生消费）。 */
export function addGuildUpgrade(
  campaign: CampaignState,
  request: { type: ProgressionUpgradeType; skillId?: string | null }
): CampaignState {
  const session = getGuildSession(campaign);
  if (!session) return campaign;
  const validation = validateGuildUpgrade(campaign, request);
  if (!validation?.ok) return campaign;
  const choice = buildUpgradeChoice(session.heroInstanceId, validation);
  if (!choice) return campaign;
  return {
    ...campaign,
    guildVisitSession: { ...session, choices: [...session.choices, choice] },
  };
}

/** 从会话中移除一次升级选择（XP / Gold 为派生计算，无需手动回滚）。 */
export function removeGuildUpgrade(campaign: CampaignState, choiceId: string): CampaignState {
  const session = getGuildSession(campaign);
  if (!session) return campaign;
  if (!session.choices.some((c) => c.id === choiceId)) return campaign;
  return {
    ...campaign,
    guildVisitSession: {
      ...session,
      choices: session.choices.filter((c) => c.id !== choiceId),
    },
  };
}

/** Commit 结果。ok=false 时 campaign 为完全未修改的原状态。 */
export interface GuildCommitResult {
  campaign: CampaignState;
  ok: boolean;
  error: string | null;
  applied: ProgressionUpgradeChoice[];
}

function toTransactionRecords(
  session: GuildVisitSession,
  heroName: string,
  choices: ProgressionUpgradeChoice[]
): ProgressionTransactionRecord[] {
  const at = nowIso();
  return choices.map((c) => ({
    id: createId('ptx'),
    at,
    sessionId: session.id,
    source: 'guild' as const,
    heroInstanceId: c.heroInstanceId,
    heroName,
    type: c.type,
    skillId: c.skillId,
    fromLevel: c.fromLevel,
    toLevel: c.toLevel,
    xpSpent: c.xpCost,
    goldSpent: c.goldCost,
  }));
}

/**
 * 原子提交 Guild 会话：
 * 1. 重新校验整批升级（防止刷新期间 XP/Gold 被其它流程改变）；
 * 2. 逐条应用到英雄副本，任意一条失败 → 整体回滚，不扣 Gold、不扣 XP；
 * 3. 全部成功 → 扣 Gold、写事务记录、标记已行动并占用建筑、关闭会话。
 * 幂等：会话已提交或不存在时返回 ok=false 且不产生副作用。
 */
export function commitGuildVisit(campaign: CampaignState): GuildCommitResult {
  const session = getGuildSession(campaign);
  if (!session) return { campaign, ok: false, error: '没有进行中的 Guild 会话', applied: [] };
  if (session.choices.length === 0) {
    return { campaign, ok: false, error: '尚未选择任何升级', applied: [] };
  }
  const hero = campaign.heroes.find((h) => h.instanceId === session.heroInstanceId);
  if (!hero) return { campaign, ok: false, error: '英雄不存在', applied: [] };

  const blocked = buildingVisitError(campaign, session.heroInstanceId, GUILD_ID);
  if (blocked) return { campaign, ok: false, error: blocked, applied: [] };

  // 1. 整批重新校验（逐条按已确认的前序选择推进，等同于真实执行顺序）
  const revalidated: ProgressionUpgradeChoice[] = [];
  for (const c of session.choices) {
    const v = validateProgressionUpgrade(
      {
        hero,
        choices: revalidated,
        maxUpgrades: session.maxUpgrades,
        paymentMode: 'xp-and-gold',
        availableGold: campaign.gold,
      },
      { type: c.type, skillId: c.skillId }
    );
    if (!v.ok) {
      return {
        campaign,
        ok: false,
        error: `第 ${revalidated.length + 1} 项升级失败：${v.reason ?? '校验未通过'}（本次全部回滚）`,
        applied: [],
      };
    }
    revalidated.push({ ...c, fromLevel: v.fromLevel as 1 | 2, toLevel: v.toLevel as 2 | 3, xpCost: v.xpCost, goldCost: v.goldCost });
  }

  // 2. 应用到英雄副本（失败即整体回滚）
  const upgraded = applyUpgradeChoicesToHero(hero, revalidated);
  if (!upgraded) {
    return {
      campaign,
      ok: false,
      error: '升级应用失败（缺少等级数据或 XP 不足），本次全部回滚',
      applied: [],
    };
  }

  const totals = pendingCostTotals(revalidated);
  if (campaign.gold < totals.gold) {
    return {
      campaign,
      ok: false,
      error: `Gold 不足（需要 ${totals.gold}，当前 ${campaign.gold}），本次全部回滚`,
      applied: [],
    };
  }

  // 3. 落地
  const building = getHamletBuildingById(GUILD_ID);
  const heroes = campaign.heroes.map((h) =>
    h.instanceId === upgraded.instanceId ? { ...upgraded, hasActedToday: true } : h
  );
  let next: CampaignState = {
    ...campaign,
    heroes,
    gold: campaign.gold - totals.gold,
    progressionTransactions: [
      ...campaign.progressionTransactions,
      ...toTransactionRecords(session, hero.name, revalidated),
    ].slice(-200),
    guildVisitSession: { ...session, committed: true },
    hamlet: {
      ...campaign.hamlet,
      occupiedBuildingIds: campaign.hamlet.occupiedBuildingIds.includes(GUILD_ID)
        ? campaign.hamlet.occupiedBuildingIds
        : [...campaign.hamlet.occupiedBuildingIds, GUILD_ID],
      log: [
        ...(campaign.hamlet.log ?? []),
        {
          id: createId('hlog'),
          at: nowIso(),
          message: `${hero.name} 在 ${building?.name ?? 'Guild'} 完成 ${revalidated.length} 次升级：${revalidated
            .map((c) => describeUpgradeChoice(c, c.skillId ? getSkillById(c.skillId)?.name : undefined))
            .join('，')}（-${totals.xp} XP，-${totals.gold} Gold）。`,
          kind: 'success' as const,
        },
      ].slice(-50),
    },
  };
  next = pushLog(
    next,
    `Guild：${hero.name} 完成 ${revalidated.length} 次升级（-${totals.xp} XP，-${totals.gold} Gold）。`,
    'success'
  );
  // 会话已完成，立即释放（committed 会话不会被 getGuildSession 返回，这里直接清空）。
  next = { ...next, guildVisitSession: null };
  return { campaign: next, ok: true, error: null, applied: revalidated };
}

/** 查询某英雄的成长履历（按时间倒序）。 */
export function getHeroProgressionHistory(
  campaign: CampaignState,
  heroInstanceId: string
): ProgressionTransactionRecord[] {
  return campaign.progressionTransactions
    .filter((t) => t.heroInstanceId === heroInstanceId)
    .slice()
    .reverse();
}
