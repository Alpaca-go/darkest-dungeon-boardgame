import type { CampaignState, TemporarySkillFormOverride } from '../../types';
import { getHamletBuildingById } from '../../data/hamlet-buildings';
import { getSkillById } from '../../data/skills';
import { createId, nowIso } from '../random';
import { pushLog } from '../log';
import { buildingVisitError } from '../hamlet';
import { getPermanentSkillLevel } from '../progression/upgrade-core';
import { maxAvailableSkillLevel } from '../../data/progression/skill-level-registry';
import { getActiveSkillFormOverrides } from '../progression/skill-forms';

// 生命周期函数集中在 progression/skill-forms.ts（quest-result 与 hamlet 都要用，
// 放在此处会造成循环依赖）；此处仅做转发以便调用方统一从 blacksmith 引入。
export {
  getActiveSkillFormOverrides,
  consumeTemporarySkillForms,
  clearConsumedSkillForms,
} from '../progression/skill-forms';

// ---------------------------------------------------------------------------
// Phase 8D：Blacksmith 临时 Skill Form
//
// 规则 15：Blacksmith 给予的是「临时 Form」，只影响下一次任务的战斗表现，
// 不改变永久 Skill Level，也不写入 hero.skillLevels、不产生升级事务记录。
// 有效等级 = max(永久等级, 临时 Form 等级)，由 getEffectiveSkillLevel 统一计算。
// 生命周期：Hamlet 授予 → 任务结束时标记 consumed → 下次进入 Hamlet 时清理。
// ---------------------------------------------------------------------------

const BLACKSMITH_ID = 'blacksmith';

/** 校验能否为某技能购买临时 Form（null 表示可以）。 */
export function blacksmithVisitError(
  campaign: CampaignState,
  heroInstanceId: string,
  skillId: string
): string | null {
  const base = buildingVisitError(campaign, heroInstanceId, BLACKSMITH_ID);
  if (base) return base;
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId)!;
  if (!hero.equippedSkillIds.includes(skillId)) return '该技能未装备';
  const permanent = getPermanentSkillLevel(hero, skillId);
  if (permanent >= 3) return '该技能永久等级已达上限 III，无需临时提升';
  const target = permanent + 1;
  if (target > maxAvailableSkillLevel(skillId)) {
    return `缺少该技能 Level ${target} 的卡面数据，无法提供临时 Form`;
  }
  if (getActiveSkillFormOverrides(campaign, heroInstanceId).some((o) => o.skillId === skillId)) {
    return '该技能已有生效中的临时 Form';
  }
  return null;
}

/**
 * 访问 Blacksmith：扣 Gold → 授予临时 Skill Form → 标记已行动并占用建筑。
 * 不修改 hero.skillLevels（永久等级保持不变）。
 */
export function visitBlacksmith(
  campaign: CampaignState,
  heroInstanceId: string,
  skillId: string
): CampaignState {
  if (blacksmithVisitError(campaign, heroInstanceId, skillId) !== null) return campaign;
  const building = getHamletBuildingById(BLACKSMITH_ID)!;
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId)!;
  const permanent = getPermanentSkillLevel(hero, skillId);
  const formLevel = (permanent + 1) as 2 | 3;
  const skillName = getSkillById(skillId)?.name ?? skillId;

  const override: TemporarySkillFormOverride = {
    id: createId('form'),
    heroInstanceId,
    skillId,
    formLevel,
    grantedVisitId: campaign.hamlet.visitId,
    grantedAt: nowIso(),
    consumed: false,
  };

  let next: CampaignState = {
    ...campaign,
    gold: campaign.gold - building.cost,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === heroInstanceId ? { ...h, hasActedToday: true } : h
    ),
    temporarySkillFormOverrides: [...(campaign.temporarySkillFormOverrides ?? []), override],
    hamlet: {
      ...campaign.hamlet,
      occupiedBuildingIds: [...campaign.hamlet.occupiedBuildingIds, BLACKSMITH_ID],
      log: [
        ...(campaign.hamlet.log ?? []),
        {
          id: createId('hlog'),
          at: nowIso(),
          message: `${hero.name} 访问 ${building.name}（-${building.cost} Gold）：技能「${skillName}」获得临时 Form ${formLevel} 级（仅下次任务，永久等级仍为 ${permanent} 级）。`,
          kind: 'success' as const,
        },
      ].slice(-50),
    },
  };
  next = pushLog(
    next,
    `Blacksmith：${hero.name} 的「${skillName}」获得临时 Form（永久等级不变）。`,
    'info'
  );
  return next;
}
