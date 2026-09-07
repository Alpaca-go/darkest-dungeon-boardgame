// Phase 11A.2 §18, §21 — Replacement Production Commands。
//
// 职责：
//   - retargetPendingReplacement（§18 正式导出；从 Store 私有迁出）
//   - resolveReplacementsFlow（§21：用 Golden 确定性策略驱动 replacement 循环）
//
// Store / Simulation Driver 都引用本模块的 retargetPendingReplacement。
import type { CampaignState, HeroInstance } from '../../types';
import {
  selectReplacementHero as engineSelectReplacementHero,
  confirmReplacement as engineConfirmReplacement,
  completeReplacementFlow as engineCompleteReplacementFlow,
} from '../replacement';
import { evaluateReplacementFlow } from '../stagecoach';
import { HEROES } from '../../data/heroes';

export type ReplacementResumePhase = 'dungeon-explore' | 'quest-result' | 'hamlet';

// ---------------------------------------------------------------------------
// 1. retargetPendingReplacement（§18）
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
// 2. resolveReplacementsFlow（§21）
//
// 保留单槽位原子规则（selectReplacementHero / confirmReplacement /
// completeReplacementFlow）。Golden Driver 使用 DeterministicReplacementPolicy：
//   - 选人：取数据中第一个未在役的 Hero；
//   - confirm：不加升级；
//   - 循环直到所有槽位解决。
//
// 真实玩家流程不走本函数；本函数只用于 headless 模拟 / 集成测试。
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
    const slotId = before.id;
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
