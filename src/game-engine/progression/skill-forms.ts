import type { CampaignState, TemporarySkillFormOverride } from '../../types';

// ---------------------------------------------------------------------------
// Phase 8D：Blacksmith 临时 Skill Form 的生命周期
// 独立于 hamlet / blacksmith 模块，避免循环依赖（quest-result 与 hamlet 都要用）。
// ---------------------------------------------------------------------------

/** 某英雄当前生效中的临时 Form 列表。 */
export function getActiveSkillFormOverrides(
  campaign: CampaignState,
  heroInstanceId: string
): TemporarySkillFormOverride[] {
  return (campaign.temporarySkillFormOverrides ?? []).filter(
    (o) => !o.consumed && o.heroInstanceId === heroInstanceId
  );
}

/** 任务结束：把所有生效中的临时 Form 标记为已消耗（幂等）。 */
export function consumeTemporarySkillForms(campaign: CampaignState): CampaignState {
  const list = campaign.temporarySkillFormOverrides ?? [];
  if (!list.some((o) => !o.consumed)) return campaign;
  return {
    ...campaign,
    temporarySkillFormOverrides: list.map((o) => (o.consumed ? o : { ...o, consumed: true })),
  };
}

/** 进入 Hamlet：清理已消耗的临时 Form（保持存档精简）。 */
export function clearConsumedSkillForms(campaign: CampaignState): CampaignState {
  const list = campaign.temporarySkillFormOverrides ?? [];
  const kept = list.filter((o) => !o.consumed);
  if (kept.length === list.length) return campaign;
  return { ...campaign, temporarySkillFormOverrides: kept };
}
