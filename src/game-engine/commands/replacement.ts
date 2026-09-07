// Phase 11A.2.1 — Replacement Production Commands（Finding B + E 修复）。
//
// 职责：
//   - retargetPendingReplacement（§18 正式导出；唯一权威实现，quest commands 复用）
//   - resolveReplacementsFlow（§21：用 Golden 确定性策略驱动 replacement 循环）
//
// 修复点：
//   - 之前 resolveReplacementsFlow 使用 `before.id` 作为 slotId，但官方 API 是
//     `findSlot(campaign, slotId)` 通过 `s.deadCampaignHeroId === slotId` 查找，
//     必须逐个 slot 处理，使用 `slot.deadCampaignHeroId`。
//   - retargetPendingReplacement 唯一权威实现（在 commands/）；
//     commands/quest.ts 内部不再有 retargetPendingReplacementInternal。
import type { CampaignState, HeroInstance, ReplacementSlot } from '../../types';
import {
  selectReplacementHero as engineSelectReplacementHero,
  confirmReplacement as engineConfirmReplacement,
  completeReplacementFlow as engineCompleteReplacementFlow,
} from '../replacement';
import { evaluateReplacementFlow } from '../stagecoach';
import { HEROES } from '../../data/heroes';

export type ReplacementResumePhase = 'dungeon-explore' | 'quest-result' | 'hamlet';

// ---------------------------------------------------------------------------
// 1. retargetPendingReplacement（§18 唯一权威实现）
// ---------------------------------------------------------------------------

/**
 * 把 pendingReplacement 的 resumePhase 改写为新阶段。
 * 若不存在 / 已 resolved / 同 phase 则原状态返回。
 */
export function retargetPendingReplacement(
  campaign: CampaignState,
  resumePhase: ReplacementResumePhase,
): CampaignState {
  const pending = campaign.stagecoach.pendingReplacement;
  if (!pending || pending.resolved || pending.resumePhase === resumePhase) {
    return campaign;
  }
  return {
    ...campaign,
    stagecoach: {
      ...campaign.stagecoach,
      pendingReplacement: { ...pending, resumePhase },
    },
  };
}

// ---------------------------------------------------------------------------
// 2. resolveReplacementsFlow（§21 + Finding B 修复）
//
// 修复前：用 `before.id`（PendingReplacementState.id）当 slotId。
//          官方 `findSlot()` 用 `s.deadCampaignHeroId === slotId`，所以调用必然找不到 slot。
// 修复后：逐个 slot 处理，对每个未确认的 slot 用 `slot.deadCampaignHeroId` 调用原子 API。
// ---------------------------------------------------------------------------

export interface DeterministicReplacementPolicy {
  /** 选择下一个候选 Hero（不传则用数据中第一个未在役 Hero）。 */
  pickHero?: (campaign: CampaignState) => string | null;
  /** 最大循环次数（防止异常无限循环）。 */
  maxRounds?: number;
}

const defaultPolicy: DeterministicReplacementPolicy = {
  maxRounds: 8,
};

function defaultPickHero(campaign: CampaignState): string | null {
  const inUseIds = new Set(campaign.heroes.map((h: HeroInstance) => h.heroId));
  for (const def of HEROES) {
    if (!inUseIds.has(def.id)) return def.id;
  }
  return null;
}

/** 找到第一个未确认的 slot。 */
function findUnconfirmedSlot(
  slots: ReplacementSlot[] | undefined,
): ReplacementSlot | null {
  if (!slots) return null;
  for (const s of slots) {
    if (!s.confirmed) return s;
  }
  return null;
}

export function resolveReplacementsFlow(
  campaign: CampaignState,
  policy: DeterministicReplacementPolicy = defaultPolicy,
): CampaignState {
  let next: CampaignState = campaign;
  const maxRounds = policy.maxRounds ?? 8;
  let round = 0;
  while (round++ < maxRounds) {
    const before = next.stagecoach.pendingReplacement;
    if (!before || before.resolved) break;
    // 找到第一个未确认的 slot（按 dev doc §5 B 修复点）
    const slot = findUnconfirmedSlot(before.slots);
    if (!slot) break;
    const slotId = slot.deadCampaignHeroId; // 官方 API 用 deadCampaignHeroId
    const heroId = (policy.pickHero ?? defaultPickHero)(next);
    if (!heroId) break;
    let step = engineSelectReplacementHero(next, slotId, heroId);
    if (step === next) break;
    let prev = step;
    step = engineConfirmReplacement(step, slotId);
    if (step === prev) break;
    prev = step;
    step = engineCompleteReplacementFlow(step);
    if (step === prev) break;
    next = evaluateReplacementFlow(step);
  }
  return next;
}
