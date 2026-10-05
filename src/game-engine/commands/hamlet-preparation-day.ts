import type { CampaignState } from '../../types';
import { preparationDayActionBlocked } from '../campaign/necromancer-preparation-day';
import * as legacy from '../hamlet';

/** Add the Preparation Day guard at command boundaries; preserve the frozen Hamlet Event consumer. */
export function buildingVisitError(campaign: CampaignState, heroInstanceId: string, buildingId: string): string | null {
  if (preparationDayActionBlocked(campaign, heroInstanceId)) return '请先完成 Graveyard 守卫任务';
  if (buildingId === 'graveyard' && preparationDayActionBlocked(campaign)) return 'Graveyard 已为守卫任务保留';
  return legacy.buildingVisitError(campaign, heroInstanceId, buildingId);
}
export function visitHamletBuilding(campaign: CampaignState, heroInstanceId: string, buildingId: string): CampaignState {
  return buildingVisitError(campaign, heroInstanceId, buildingId) ? campaign : legacy.visitHamletBuilding(campaign, heroInstanceId, buildingId);
}
export function visitAbbey(campaign: CampaignState, heroInstanceId: string, quirkId: string): CampaignState {
  return buildingVisitError(campaign, heroInstanceId, 'abbey') ? campaign : legacy.visitAbbey(campaign, heroInstanceId, quirkId);
}
export function skipHeroAction(campaign: CampaignState, heroInstanceId: string): CampaignState {
  return preparationDayActionBlocked(campaign, heroInstanceId) ? campaign : legacy.skipHeroAction(campaign, heroInstanceId);
}
export function canEndHamletDay(campaign: CampaignState): boolean {
  return !preparationDayActionBlocked(campaign) && legacy.canEndHamletDay(campaign);
}
export function endHamletDay(campaign: CampaignState): CampaignState {
  return canEndHamletDay(campaign) ? legacy.endHamletDay(campaign) : campaign;
}
