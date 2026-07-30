// Phase 8B：Disease 获取状态机（唯一写入 hero.disease 的入口）。
//
// 规则（开发文档 §10—§13）：
// - 每名英雄同时最多携带 1 个 Disease；
// - 英雄没有 Disease            → 直接感染（added）；
// - 英雄已有「同一个」Disease    → 丢弃新 Disease，无任何副作用（duplicate-discarded）；
// - 英雄已有「不同的」Disease    → 新 Disease 替换旧 Disease，
//                                 并且该英雄额外获得 1 个随机 Negative Quirk（replaced）。
//                                 该 Negative Quirk 必须走 Phase 8A 的 acquireQuirk，
//                                 因此可能产生 PendingQuirkDecision，甚至 Madness Death。
// - dead 英雄 / 未知 diseaseId  → 丢弃（discarded-dead-hero / discarded-invalid）。
//
// 事务性（核心约束 10）：
// 「写入 Disease」与「抽取并授予 Negative Quirk」是两个步骤，中间可能出现玩家决策浮层。
// 为避免刷新后重复抽 Quirk，替换流程会写入 PendingDiseaseTransaction，
// 并在每个阶段推进 status；completed / hero-died 后清空。
//
// 幂等：同一 sourceEventId 只处理一次（processedDiseaseEventIds）。

import type {
  CampaignState,
  DiseaseAcquisitionOutcome,
  DiseaseAcquisitionRecord,
  DiseaseSourceKind,
  HeroDiseaseState,
  PendingDiseaseTransaction,
} from '../../types';
import { getDiseaseById, isRealDiseaseId } from '../../data/diseases';
import { NEGATIVE_QUIRKS, getQuirkById } from '../../data/quirks';
import { acquireQuirk } from '../quirks';
import { pushMentalEvent } from '../mental-log';
import { pushLog } from '../log';
import { createId, nowIso, pick } from '../random';

/** 已处理感染事件 id 上限（防存档膨胀）。 */
const PROCESSED_EVENT_LIMIT = 200;

/** 获取记录上限（防存档膨胀）。 */
const RECORD_LIMIT = 100;

export interface AcquireDiseaseInput {
  heroId: string;
  diseaseId: string;
  source: DiseaseSourceKind;
  /** 幂等键：同一 sourceEventId 只结算一次。 */
  sourceEventId: string;
  questId?: string | null;
  /** Madness Death 时传给 killCampaignHero 的恢复参数。 */
  deathSource?: 'battle' | 'exploration' | 'quest-result';
  deathResumePhase?: 'dungeon-explore' | 'quest-result' | 'hamlet';
}

export interface AcquireDiseaseResult {
  campaign: CampaignState;
  outcome: DiseaseAcquisitionOutcome;
  record?: DiseaseAcquisitionRecord;
}

/** 随机抽 1 个该英雄尚未拥有的 Negative Quirk；全部拥有时退化为任意 Negative Quirk。 */
export function drawNegativeQuirkId(campaign: CampaignState, heroId: string): string {
  const hero = campaign.heroes.find((h) => h.instanceId === heroId);
  const owned = new Set([...(hero?.positiveQuirkIds ?? []), ...(hero?.negativeQuirkIds ?? [])]);
  const pool = NEGATIVE_QUIRKS.filter((q) => !owned.has(q.id));
  // 池空（35 Quirk 中的负面全被持有，实际不可达）→ 回退到全量负面池，
  // 由 acquireQuirk 的 duplicate 分支安全处理。
  return pool.length > 0 ? pick(pool).id : NEGATIVE_QUIRKS[0].id;
}

function markProcessed(campaign: CampaignState, eventId: string): CampaignState {
  const ids = [...campaign.processedDiseaseEventIds, eventId];
  return {
    ...campaign,
    processedDiseaseEventIds:
      ids.length > PROCESSED_EVENT_LIMIT ? ids.slice(ids.length - PROCESSED_EVENT_LIMIT) : ids,
  };
}

function pushRecord(
  campaign: CampaignState,
  record: DiseaseAcquisitionRecord
): CampaignState {
  const list = [...campaign.diseaseAcquisitionRecords, record];
  return {
    ...campaign,
    diseaseAcquisitionRecords: list.length > RECORD_LIMIT ? list.slice(list.length - RECORD_LIMIT) : list,
    lastDiseaseAcquisition: record,
  };
}

function setTransaction(
  campaign: CampaignState,
  tx: PendingDiseaseTransaction | null
): CampaignState {
  return { ...campaign, pendingDiseaseTransaction: tx };
}

/** 直接写入 hero.disease（内部使用；外部一律通过 acquireDisease）。 */
function writeHeroDisease(
  campaign: CampaignState,
  heroId: string,
  disease: HeroDiseaseState | null
): CampaignState {
  return {
    ...campaign,
    heroes: campaign.heroes.map((h) => (h.instanceId === heroId ? { ...h, disease } : h)),
  };
}

/**
 * Disease 获取统一入口。
 * 组件 / store 不得直接修改 hero.disease。
 */
export function acquireDisease(
  campaign: CampaignState,
  input: AcquireDiseaseInput
): AcquireDiseaseResult {
  const questId = input.questId ?? campaign.currentQuestId ?? null;

  // 幂等：同一感染事件只结算一次
  if (campaign.processedDiseaseEventIds.includes(input.sourceEventId)) {
    return { campaign, outcome: 'duplicate-discarded' };
  }

  const hero = campaign.heroes.find((h) => h.instanceId === input.heroId);
  const def = getDiseaseById(input.diseaseId);

  const finish = (
    c: CampaignState,
    outcome: DiseaseAcquisitionOutcome,
    extra: Partial<DiseaseAcquisitionRecord> = {}
  ): AcquireDiseaseResult => {
    const record: DiseaseAcquisitionRecord = {
      id: createId('dacq'),
      heroId: input.heroId,
      heroName: hero?.name ?? input.heroId,
      questId,
      incomingDiseaseId: input.diseaseId,
      outcome,
      sourceEventId: input.sourceEventId,
      createdAt: nowIso(),
      ...extra,
    };
    return { campaign: pushRecord(markProcessed(c, input.sourceEventId), record), outcome, record };
  };

  // 无效目标 / 无效 Disease
  if (!def || !isRealDiseaseId(input.diseaseId)) {
    return finish(campaign, 'discarded-invalid');
  }
  if (!hero || hero.dead) {
    return finish(campaign, 'discarded-dead-hero');
  }

  const incoming: HeroDiseaseState = {
    instanceId: createId('dis'),
    diseaseId: def.id,
    acquiredQuestId: questId,
    acquiredAt: nowIso(),
    source: input.source,
    sourceEventId: input.sourceEventId,
  };

  // --- 情形 1：首次感染 ---
  if (!hero.disease) {
    let next = writeHeroDisease(campaign, hero.instanceId, incoming);
    const ev = pushMentalEvent(next, {
      questId: questId ?? '',
      heroId: hero.instanceId,
      type: 'quirk-gained',
      sourceType: 'quirk',
      sourceId: def.id,
    });
    next = ev.campaign;
    next = pushLog(next, `${hero.name} 感染了疾病「${def.name}」：${def.description}`, 'danger');
    return finish(next, 'added');
  }

  // --- 情形 2：已患同一 Disease → 丢弃 ---
  if (hero.disease.diseaseId === def.id) {
    const next = pushLog(
      campaign,
      `${hero.name} 已患有「${def.name}」，本次感染无效。`,
      'info'
    );
    return finish(next, 'duplicate-discarded');
  }

  // --- 情形 3：替换（旧 Disease 移除 + 新 Disease 写入 + 1 个随机 Negative Quirk） ---
  const previous = hero.disease;
  const previousName = getDiseaseById(previous.diseaseId)?.name ?? previous.diseaseId;

  let next = writeHeroDisease(campaign, hero.instanceId, incoming);
  next = pushLog(
    next,
    `${hero.name} 的疾病「${previousName}」被「${def.name}」取代 —— 病情恶化，将额外获得 1 个负面怪癖。`,
    'danger'
  );

  const transactionId = createId('dtx');
  next = setTransaction(next, {
    transactionId,
    heroId: hero.instanceId,
    incomingDiseaseId: def.id,
    previousDiseaseId: previous.diseaseId,
    status: 'disease-written',
  });

  // 抽取 Negative Quirk 并记入事务（刷新后不会重抽）
  const negativeQuirkId = drawNegativeQuirkId(next, hero.instanceId);
  next = setTransaction(next, {
    transactionId,
    heroId: hero.instanceId,
    incomingDiseaseId: def.id,
    previousDiseaseId: previous.diseaseId,
    negativeQuirkId,
    status: 'quirk-processing',
  });

  // 走 Phase 8A 的 Quirk 状态机（含上限 3 / 替换决策 / Madness Death）
  const quirkOut = acquireQuirk(next, hero.instanceId, negativeQuirkId, {
    source: 'disease-replacement',
    deathSource: input.deathSource,
    deathResumePhase: input.deathResumePhase,
  });
  next = quirkOut.campaign;

  const quirkName = getQuirkById(negativeQuirkId)?.name ?? negativeQuirkId;
  const base = {
    removedDiseaseId: previous.diseaseId,
    negativeQuirkId,
  };

  if (quirkOut.outcome === 'madness-death') {
    next = setTransaction(next, {
      transactionId,
      heroId: hero.instanceId,
      incomingDiseaseId: def.id,
      previousDiseaseId: previous.diseaseId,
      negativeQuirkId,
      status: 'hero-died',
    });
    next = setTransaction(next, null);
    const deathRecordId = next.deathRecords?.[next.deathRecords.length - 1]?.id;
    return finish(next, 'replaced-hero-died', { ...base, deathRecordId });
  }

  if (quirkOut.outcome === 'decision-pending') {
    next = setTransaction(next, {
      transactionId,
      heroId: hero.instanceId,
      incomingDiseaseId: def.id,
      previousDiseaseId: previous.diseaseId,
      negativeQuirkId,
      status: 'decision-pending',
    });
    return finish(next, 'replaced-quirk-decision-pending', {
      ...base,
      pendingQuirkDecisionId: quirkOut.decisionId,
    });
  }

  next = setTransaction(next, null);
  next = pushLog(next, `${hero.name} 因病情恶化获得负面怪癖「${quirkName}」。`, 'warning');
  return finish(next, 'replaced', base);
}

/**
 * 事务收尾：玩家结算完 Disease 替换引发的 PendingQuirkDecision 后调用。
 * 幂等：无对应事务或事务已完成时 no-op。
 */
export function finalizeDiseaseTransaction(campaign: CampaignState): CampaignState {
  const tx = campaign.pendingDiseaseTransaction;
  if (!tx) return campaign;
  if (tx.status !== 'decision-pending') return campaign;
  const stillPending = campaign.pendingQuirkDecisions.some(
    (d) => !d.resolved && d.heroId === tx.heroId && d.source === 'disease-replacement'
  );
  if (stillPending) return campaign;
  return setTransaction(campaign, null);
}

/** 英雄当前 Disease 的展示定义（无病或未知 id 时返回 undefined）。 */
export function heroDiseaseDefinition(campaign: CampaignState, heroId: string) {
  const hero = campaign.heroes.find((h) => h.instanceId === heroId);
  return getDiseaseById(hero?.disease?.diseaseId);
}
