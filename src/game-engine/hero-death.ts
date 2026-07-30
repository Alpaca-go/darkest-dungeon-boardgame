import type {
  CampaignState,
  DeathRecord,
  HeroDeathCause,
  PendingReplacementState,
  ReplacementSlot,
} from '../types';
import { createId, nowIso } from './random';
import { pushLog } from './log';
import { transferDeadHeroTrinkets } from './trinkets/transfer-dead-hero-trinkets';

/** killCampaignHero 的输入命令。 */
export interface KillHeroCommand {
  heroInstanceId: string;
  cause: HeroDeathCause;
  source: 'battle' | 'exploration' | 'quest-result';
  resumePhase: 'dungeon-explore' | 'quest-result' | 'hamlet';
  questId?: string;
  roomId?: string;
  battleId?: string;
  round?: number;
  sourceActorId?: string;
  sourceSkillId?: string;
}

/**
 * 英雄永久死亡的单一入口（幂等：已 dead 的英雄原样返回）。
 * 一次性完成：标记 dead / 清 atDeathsDoor / 建 DeathRecord /
 * 记入 deadHeroClassIds / 排入 pendingReplacement / 写日志。
 * 调用方负责保存与后续流程判定（能否补齐 → replacement / campaign-over）。
 */
export function killCampaignHero(campaign: CampaignState, cmd: KillHeroCommand): CampaignState {
  const hero = campaign.heroes.find((h) => h.instanceId === cmd.heroInstanceId);
  if (!hero || hero.dead) return campaign; // 防重复死亡

  const record: DeathRecord = {
    id: createId('death'),
    campaignHeroId: hero.instanceId,
    heroClassId: hero.heroId,
    heroName: hero.name,
    cause: cmd.cause,
    questId: cmd.questId,
    roomId: cmd.roomId,
    battleId: cmd.battleId,
    round: cmd.round,
    sourceActorId: cmd.sourceActorId,
    sourceSkillId: cmd.sourceSkillId,
    occurredAt: nowIso(),
    sequence: campaign.deathRecords.length + 1,
  };

  const heroes = campaign.heroes.map((h) =>
    h.instanceId === hero.instanceId
      ? {
          ...h,
          dead: true,
          isAlive: false,
          atDeathsDoor: false,
          wounds: h.maxLife,
          deathRecordId: record.id,
        }
      : h
  );

  const slot: ReplacementSlot = {
    partySlot: hero.partySlot,
    deadCampaignHeroId: hero.instanceId,
    deathRecordId: record.id,
    upgradeOperations: [],
    confirmed: false,
  };

  const existing = campaign.stagecoach.pendingReplacement;
  let pending: PendingReplacementState;
  if (existing && !existing.resolved) {
    // 同一批死亡：追加槽位（避免重复）
    pending = existing.slots.some((s) => s.deadCampaignHeroId === hero.instanceId)
      ? existing
      : { ...existing, slots: [...existing.slots, slot] };
  } else {
    pending = {
      id: createId('rep'),
      source: cmd.source,
      resumePhase: cmd.resumePhase,
      slots: [slot],
      createdAt: nowIso(),
      resolved: false,
    };
  }

  let next: CampaignState = {
    ...campaign,
    heroes,
    deathRecords: [...campaign.deathRecords, record],
    stagecoach: {
      ...campaign.stagecoach,
      deadHeroClassIds: campaign.stagecoach.deadHeroClassIds.includes(hero.heroId)
        ? campaign.stagecoach.deadHeroClassIds
        : [...campaign.stagecoach.deadHeroClassIds, hero.heroId],
      pendingReplacement: pending,
    },
  };
  next = pushLog(next, `${hero.name} 永久阵亡（${cmd.cause}）。战斗/探索结束后需要补充队伍。`, 'danger');
  // Phase 8C（§13）：死亡记录完成后立即处理 Trinket 转移。
  // Death Transfer 分配必须先于 Replacement 结算（核心约束 8，由 store / UI 判定队列）。
  next = transferDeadHeroTrinkets(next, hero.instanceId);
  return next;
}

/**
 * 将战斗中已永久死亡（deathResolved=false）的英雄单位同步到 Campaign。
 * 战斗引擎只标记 BattleUnit；此函数在 store 每次战斗 commit 前调用，
 * 保证 killCampaignHero 恰好执行一次。
 */
export function processBattleDeaths(campaign: CampaignState): CampaignState {
  const b = campaign.battle;
  if (!b) return campaign;

  let c = campaign;
  let changed = false;
  const heroes = b.heroes.map((u) => {
    if (u.side !== 'hero' || u.isAlive || u.deathResolved !== false) return u;
    c = killCampaignHero(c, {
      heroInstanceId: u.sourceId,
      cause: u.deathCause ?? 'deathblow-attack',
      source: 'battle',
      resumePhase: 'dungeon-explore',
      questId: c.currentQuestId ?? undefined,
      roomId: c.dungeon?.currentRoomId,
      battleId: b.battleId,
      round: b.round,
    });
    changed = true;
    return { ...u, deathResolved: true };
  });

  if (!changed) return campaign;
  return { ...c, battle: c.battle ? { ...c.battle, heroes } : null };
}
