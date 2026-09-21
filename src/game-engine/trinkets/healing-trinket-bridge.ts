import type { CampaignState, PendingHealingAction } from '../../types';
import { getSkillById } from '../../data/skills';
import { heroSkillActionError, heroUseSkill, type TrinketActionBonuses } from '../battle';
import { declineTrinketUse, sumModifiers, useTrinket } from './use-trinket';
import { findOpportunity, openOpportunities, openTrinketWindow } from './trinket-opportunities';

export interface HealingBridgeResult {
  campaign: CampaignState;
  error: string | null;
  paused: boolean;
}

function stageEvent(action: PendingHealingAction): string {
  return `${action.eventId}:${action.stage === 'healer-window' ? 'delivered' : 'received'}`;
}

function openStage(campaign: CampaignState): { campaign: CampaignState; opened: boolean } {
  const action = campaign.pendingHealingAction;
  if (!action) return { campaign, opened: false };
  const healerStage = action.stage === 'healer-window';
  const opened = openTrinketWindow(campaign, {
    window: healerStage ? 'before-healing-delivered-resolution' : 'before-healing-received-resolution',
    heroId: healerStage ? action.healerHeroId : action.targetHeroId,
    eventId: stageEvent(action),
    rootEventId: action.eventId,
    excludedTrinketInstanceIds: action.processedTrinketInstanceIds,
  });
  return { campaign: opened.campaign, opened: opened.hasOpportunity };
}

function resolveHealing(campaign: CampaignState): CampaignState {
  const action = campaign.pendingHealingAction;
  const battle = campaign.battle;
  if (!action || !battle) return campaign;
  const error = heroSkillActionError(battle, action.actorUnitId, action.skillId, action.targetUnitId);
  if (error) {
    return {
      ...campaign,
      pendingHealingAction: null,
      pendingTrinketUseOpportunities: (campaign.pendingTrinketUseOpportunities ?? [])
        .filter((opportunity) => opportunity.rootEventId !== action.eventId),
    };
  }
  const bonuses: TrinketActionBonuses = {
    accuracy: 0,
    crit: 0,
    damage: 0,
    healing: action.healingModifier,
    healingBase: action.baseAmount,
  };
  return {
    ...campaign,
    pendingHealingAction: null,
    battle: heroUseSkill(battle, action.actorUnitId, action.skillId, action.targetUnitId, bonuses),
  };
}

function advance(campaign: CampaignState): { campaign: CampaignState; paused: boolean } {
  const action = campaign.pendingHealingAction;
  if (!action) return { campaign, paused: false };
  if (openOpportunities(campaign).some((opportunity) => opportunity.rootEventId === action.eventId)) {
    return { campaign, paused: true };
  }
  if (action.stage === 'healer-window') {
    const next = { ...campaign, pendingHealingAction: { ...action, stage: 'target-window' as const } };
    const opened = openStage(next);
    if (opened.opened) return { campaign: opened.campaign, paused: true };
    return { campaign: resolveHealing(opened.campaign), paused: false };
  }
  return { campaign: resolveHealing(campaign), paused: false };
}

export function beginHealingTrinketAction(
  campaign: CampaignState,
  actorUnitId: string,
  skillId: string,
  targetUnitId: string,
): HealingBridgeResult {
  const battle = campaign.battle;
  const actor = battle?.heroes.find((unit) => unit.id === actorUnitId);
  const target = battle?.heroes.find((unit) => unit.id === targetUnitId);
  const skill = getSkillById(skillId);
  if (!battle || !actor || !target || !skill?.heal) {
    return { campaign, error: '治疗动作缺少有效的英雄、目标或技能。', paused: false };
  }
  const skillLevel = (actor.skillLevels?.[skillId] ?? 1) as 1 | 2 | 3;
  const levelHealing = skillLevel === 1 ? 0 : skillLevel === 2 ? 1 : 2;
  const eventId = `heal:${battle.battleId}:r${battle.round}:i${battle.initiativeIndex}:${actorUnitId}:ap${battle.currentActionPoints}`;
  const pendingHealingAction: PendingHealingAction = {
    kind: 'hero-healing-skill', eventId, actorUnitId, targetUnitId,
    healerHeroId: actor.sourceId, targetHeroId: target.sourceId, skillId,
    baseAmount: skill.heal + levelHealing, healingModifier: 0,
    stage: 'healer-window', processedTrinketInstanceIds: [],
  };
  const staged = { ...campaign, pendingHealingAction };
  const opened = openStage(staged);
  if (opened.opened) return { campaign: opened.campaign, error: null, paused: true };
  const advanced = advance(opened.campaign);
  return { campaign: advanced.campaign, error: null, paused: advanced.paused };
}

export function resolveHealingTrinketOpportunity(
  campaign: CampaignState,
  opportunityId: string,
  decision: 'use' | 'decline',
): { campaign: CampaignState; error: string | null; resumed: boolean } {
  const action = campaign.pendingHealingAction;
  const opportunity = findOpportunity(campaign, opportunityId);
  if (!action || !opportunity || opportunity.rootEventId !== action.eventId || opportunity.eventId !== stageEvent(action)) {
    return { campaign, error: '治疗饰品机会已失效。', resumed: false };
  }
  const battle = campaign.battle;
  if (!battle || heroSkillActionError(battle, action.actorUnitId, action.skillId, action.targetUnitId)) {
    return { campaign, error: '治疗动作已失效。', resumed: false };
  }
  let next = campaign;
  let modifier = 0;
  if (decision === 'use') {
    const result = useTrinket(campaign, opportunityId);
    if (result.error) return { campaign, error: result.error, resumed: false };
    next = result.campaign;
    modifier = sumModifiers(result.appliedModifiers, 'healing');
  } else {
    next = declineTrinketUse(campaign, opportunityId);
    if (next === campaign) return { campaign, error: '该使用机会已关闭。', resumed: false };
  }
  next = {
    ...next,
    pendingHealingAction: {
      ...action,
      healingModifier: action.healingModifier + modifier,
      processedTrinketInstanceIds: [...new Set([...action.processedTrinketInstanceIds, opportunity.trinketInstanceId])],
    },
  };
  const advanced = advance(next);
  return { campaign: advanced.campaign, error: null, resumed: !advanced.paused };
}
