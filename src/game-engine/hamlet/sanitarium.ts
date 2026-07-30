// Phase 8B：Sanitarium 的「移除 Disease」服务。
//
// 规则（开发文档 §20—§22）：
// - 花费 2 Gold 移除该英雄当前的 Disease（Sanitarium 原有的「3 Gold 恢复 3 HP」保持不变）；
// - 与其它 Hamlet 行动一致：占用 Sanitarium 当日名额、消耗英雄当日行动、受 Caretaker 阻塞影响；
// - 核心约束 10：扣费与移除必须是单一事务 —— 任一前置校验失败则完全不产生消费。
//
// 幂等（开发文档 §22）：
// idempotencyKey = `${hamletVisitId}:${day}:${heroId}:sanitarium-remove-disease`
// 同一键已存在治疗记录时直接 no-op（防刷新 / 双击重复扣费）。

import type { CampaignState, DiseaseTreatmentRecord, SanitariumService } from '../../types';
import { getDiseaseById } from '../../data/diseases';
import { pushMentalEvent } from '../mental-log';
import { createId, nowIso } from '../random';

/** 移除 Disease 的固定费用。 */
export const REMOVE_DISEASE_COST = 2 as const;

/** Sanitarium 服务清单（UI 数据源）。 */
export const SANITARIUM_SERVICES: SanitariumService[] = [
  {
    id: 'heal-small',
    name: '治疗伤势',
    goldCost: 3,
    effect: { type: 'heal', amount: 3 },
  },
  {
    id: 'remove-disease',
    name: '治疗疾病',
    goldCost: REMOVE_DISEASE_COST,
    effect: { type: 'remove-disease' },
  },
];

/** 治疗记录上限（防存档膨胀）。 */
const TREATMENT_LIMIT = 100;

/** 构造幂等键。 */
export function sanitariumIdempotencyKey(
  hamletVisitId: string,
  day: number,
  heroId: string
): string {
  return `${hamletVisitId}:${day}:${heroId}:sanitarium-remove-disease`;
}

/**
 * 移除 Disease 的合法性校验（null = 可执行）。
 * 不复用 buildingVisitError：后者对 sanitarium 有「HP 已满」限制且按建筑 cost=3 校验 Gold，
 * 与本服务的 2 Gold / 疾病条件不同。
 */
export function sanitariumRemoveDiseaseError(
  campaign: CampaignState,
  heroInstanceId: string
): string | null {
  if (campaign.gamePhase !== 'hamlet') return '当前不在 Hamlet 阶段';
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  if (!hero) return '英雄不存在';
  if (!hero.isAlive || hero.dead) return '阵亡英雄无法行动';
  if (hero.hasActedToday) return '该英雄今天已经行动过';
  if (campaign.hamlet.caretakerBlockedBuildingId === 'sanitarium')
    return 'Caretaker 阻塞了 Sanitarium';
  if (campaign.hamlet.occupiedBuildingIds.includes('sanitarium'))
    return 'Sanitarium 今天已被其他英雄占用';
  if (campaign.gold < REMOVE_DISEASE_COST) return 'Gold 不足（需要 2 Gold）';
  if (!hero.disease) return '该英雄没有疾病';
  const key = sanitariumIdempotencyKey(
    campaign.hamlet.visitId,
    campaign.hamlet.currentDay,
    heroInstanceId
  );
  if (campaign.diseaseTreatmentRecords.some((r) => r.idempotencyKey === key)) {
    return '本次访问已为该英雄治疗过疾病';
  }
  return null;
}

export interface RemoveDiseaseResult {
  campaign: CampaignState;
  /** null 表示校验未通过，campaign 原样返回（无任何消费）。 */
  record: DiseaseTreatmentRecord | null;
  error: string | null;
}

/**
 * Sanitarium：花费 2 Gold 移除英雄的 Disease（单事务）。
 * 执行顺序：校验 → 扣 Gold + 清空 disease + 标记行动 + 占用建筑 + 写治疗记录 → 日志。
 * 任一步骤的前置条件不满足时整体回退（直接返回原 campaign）。
 */
export function useSanitariumRemoveDisease(
  campaign: CampaignState,
  heroInstanceId: string
): RemoveDiseaseResult {
  const error = sanitariumRemoveDiseaseError(campaign, heroInstanceId);
  if (error) return { campaign, record: null, error };

  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId)!;
  const disease = hero.disease!;
  const def = getDiseaseById(disease.diseaseId);
  const diseaseName = def?.name ?? disease.diseaseId;

  const record: DiseaseTreatmentRecord = {
    id: createId('dtreat'),
    heroId: hero.instanceId,
    heroName: hero.name,
    diseaseInstanceId: disease.instanceId,
    diseaseId: disease.diseaseId,
    hamletVisitId: campaign.hamlet.visitId,
    hamletDay: campaign.hamlet.currentDay,
    goldCost: REMOVE_DISEASE_COST,
    treatedAt: nowIso(),
    idempotencyKey: sanitariumIdempotencyKey(
      campaign.hamlet.visitId,
      campaign.hamlet.currentDay,
      hero.instanceId
    ),
  };

  const records = [...campaign.diseaseTreatmentRecords, record];

  // 单事务：以下 5 项一次性写入，不存在中间态
  let next: CampaignState = {
    ...campaign,
    gold: campaign.gold - REMOVE_DISEASE_COST,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === hero.instanceId ? { ...h, disease: null, hasActedToday: true } : h
    ),
    hamlet: {
      ...campaign.hamlet,
      occupiedBuildingIds: [...campaign.hamlet.occupiedBuildingIds, 'sanitarium'],
      log: [
        ...campaign.hamlet.log,
        {
          id: createId('hlog'),
          at: nowIso(),
          message: `${hero.name} 在 Sanitarium 治愈了疾病「${diseaseName}」（-${REMOVE_DISEASE_COST} Gold）。`,
          kind: 'success' as const,
        },
      ].slice(-200),
    },
    diseaseTreatmentRecords:
      records.length > TREATMENT_LIMIT ? records.slice(records.length - TREATMENT_LIMIT) : records,
  };

  const ev = pushMentalEvent(next, {
    questId: next.currentQuestId ?? '',
    heroId: hero.instanceId,
    type: 'quirk-removed',
    sourceType: 'quirk',
    sourceId: disease.diseaseId,
  });
  next = ev.campaign;

  return { campaign: next, record, error: null };
}
