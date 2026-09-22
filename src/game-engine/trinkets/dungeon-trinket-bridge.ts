import type {
  CampaignState,
  PendingDungeonTrinketAction,
  ProvisionFace,
  ProvisionPool,
} from '../../types';
import type { RestAllocation, RestAllocationError } from '../quests/quest-runtime';
import { commitRestAtCamp, validateRestAllocation } from '../quests/quest-runtime';
import { canScout, scoutDungeon } from '../dungeon';
import { createId, random } from '../random';
import { pushLog } from '../log';
import { openTrinketWindow, openOpportunities, findOpportunity } from './trinket-opportunities';
import { declineTrinketUse, trinketUseError, useTrinket } from './use-trinket';
import { getTrinketSide } from '../../data/trinkets/trinket-registry';

export const CAMPERS_HELMET_ID = 'community-trinket-core-campers-helmet';
export const PROVISION_POOL_MAXIMUM = 16;
export const PROVISION_DIE_FACES: readonly ProvisionFace[] = [
  'food', 'bandage', 'potion', 'torch', 'tool', 'wild',
] as const;

type ProvisionChoice = Exclude<ProvisionFace, 'wild'>;

export interface BeginDungeonActionResult {
  campaign: CampaignState;
  error: RestAllocationError | 'DUNGEON_TRINKET_ACTION_PENDING' | null;
  paused: boolean;
}

export interface ResolveDungeonOpportunityResult {
  campaign: CampaignState;
  error: string | null;
  resumed: boolean;
}

function openForParty(
  campaign: CampaignState,
  pending: PendingDungeonTrinketAction,
): CampaignState {
  let next = campaign;
  const window = pending.kind === 'scout' ? 'before-scout-resolution' : 'before-camp-resolution';
  for (const hero of campaign.heroes) {
    if (!hero.isAlive || hero.dead) continue;
    next = openTrinketWindow(next, {
      window,
      heroId: hero.instanceId,
      eventId: `${pending.rootEventId}:${hero.instanceId}`,
      rootEventId: pending.rootEventId,
    }).campaign;
  }
  return next;
}

function clearPending(campaign: CampaignState, rootEventId: string): CampaignState {
  return {
    ...campaign,
    pendingDungeonTrinketAction: null,
    pendingTrinketUseOpportunities: campaign.pendingTrinketUseOpportunities.filter(
      (entry) => entry.rootEventId !== rootEventId,
    ),
  };
}

function actionIdentityValid(campaign: CampaignState, pending: PendingDungeonTrinketAction): boolean {
  return campaign.gamePhase === 'dungeon-explore'
    && campaign.currentQuestId === pending.questId
    && campaign.dungeon?.questRunId === pending.questRunId
    && campaign.dungeon.currentRoomId === pending.roomId;
}

function completeOriginalAction(campaign: CampaignState): CampaignState {
  const pending = campaign.pendingDungeonTrinketAction;
  if (!pending) return campaign;
  if (!actionIdentityValid(campaign, pending)) return clearPending(campaign, pending.rootEventId);
  if (openOpportunities(campaign).some((entry) => entry.rootEventId === pending.rootEventId)) return campaign;
  if (pending.pendingProvisionDice?.some((die) => die.selectedFace === null)) return campaign;

  const cleared = clearPending(campaign, pending.rootEventId);
  if (pending.kind === 'scout') {
    return canScout(cleared.dungeon!) ? scoutDungeon(cleared) : cleared;
  }
  const validation = validateRestAllocation(cleared, pending.allocation);
  if (!validation.ok) return cleared;
  return commitRestAtCamp(cleared, pending.allocation).campaign;
}

export function beginScoutTrinketAction(campaign: CampaignState): BeginDungeonActionResult {
  if (campaign.pendingDungeonTrinketAction) {
    return { campaign, error: 'DUNGEON_TRINKET_ACTION_PENDING', paused: true };
  }
  if (!campaign.dungeon || !canScout(campaign.dungeon)) {
    return { campaign, error: null, paused: false };
  }
  const pending: PendingDungeonTrinketAction = {
    kind: 'scout', rootEventId: createId('scout-trinket'), stage: 'trinket-window',
    questId: campaign.currentQuestId ?? '', questRunId: campaign.dungeon.questRunId,
    roomId: campaign.dungeon.currentRoomId,
    processedTrinketInstanceIds: [], pendingProvisionDice: null,
  };
  const opened = openForParty({ ...campaign, pendingDungeonTrinketAction: pending }, pending);
  const paused = openOpportunities(opened).some((entry) => entry.rootEventId === pending.rootEventId);
  return { campaign: paused ? opened : completeOriginalAction(opened), error: null, paused };
}

export function beginCampTrinketAction(
  campaign: CampaignState,
  allocation: RestAllocation,
): BeginDungeonActionResult {
  const validation = validateRestAllocation(campaign, allocation);
  if (!validation.ok) return { campaign, error: validation.error, paused: false };
  if (campaign.pendingDungeonTrinketAction) {
    return { campaign, error: 'DUNGEON_TRINKET_ACTION_PENDING', paused: true };
  }
  const pending: PendingDungeonTrinketAction = {
    kind: 'camp', rootEventId: createId('camp-trinket'), stage: 'trinket-window',
    questId: campaign.currentQuestId ?? '', questRunId: campaign.dungeon?.questRunId ?? '',
    roomId: campaign.dungeon?.currentRoomId ?? '',
    processedTrinketInstanceIds: [], pendingProvisionDice: null,
    allocation: structuredClone(allocation),
  };
  const opened = openForParty({ ...campaign, pendingDungeonTrinketAction: pending }, pending);
  const paused = openOpportunities(opened).some((entry) => entry.rootEventId === pending.rootEventId);
  return { campaign: paused ? opened : completeOriginalAction(opened), error: null, paused };
}

function rollProvisionDice(count: number, rng: () => number) {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => {
    const roll = Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
    const rolledFace = PROVISION_DIE_FACES[roll - 1];
    return {
      index, roll, rolledFace,
      selectedFace: rolledFace === 'wild' ? null : rolledFace,
    };
  });
}

function commitProvisionDice(campaign: CampaignState): CampaignState {
  const pending = campaign.pendingDungeonTrinketAction;
  const dice = pending?.pendingProvisionDice;
  if (!pending || !dice || dice.some((die) => die.selectedFace === null)) return campaign;
  const provisions = { ...campaign.provisions };
  const accepted: ProvisionChoice[] = [];
  for (const die of dice) {
    const face = die.selectedFace!;
    const poolSize = Object.values(provisions).reduce((sum, value) => sum + value, 0);
    if (poolSize >= PROVISION_POOL_MAXIMUM) continue;
    provisions[face] += 1;
    accepted.push(face);
  }
  const opportunity = openOpportunities(campaign).find((entry) =>
    entry.rootEventId === pending.rootEventId && entry.trinketId === CAMPERS_HELMET_ID);
  if (!opportunity) return clearPending(campaign, pending.rootEventId);
  const afterPool: CampaignState = {
    ...campaign,
    provisions,
  };
  const used = useTrinket(afterPool, opportunity.id);
  if (used.error) return clearPending(campaign, pending.rootEventId);
  const next = pushLog({
    ...used.campaign,
    pendingDungeonTrinketAction: { ...pending, pendingProvisionDice: null, stage: 'trinket-window' },
  }, `Camper's Helmet：补给骰加入公共补给池（${accepted.join('、') || '补给池已满'}）。`, 'success');
  return completeOriginalAction(next);
}

export function resolveDungeonTrinketOpportunity(
  campaign: CampaignState,
  opportunityId: string,
  action: 'use' | 'decline',
  rng: () => number = random,
): ResolveDungeonOpportunityResult {
  const pending = campaign.pendingDungeonTrinketAction;
  const opportunity = findOpportunity(campaign, opportunityId);
  if (!pending || !opportunity || opportunity.rootEventId !== pending.rootEventId) {
    return { campaign, error: '该地牢饰品机会已失效。', resumed: false };
  }
  if (!actionIdentityValid(campaign, pending)) {
    return { campaign: clearPending(campaign, pending.rootEventId), error: null, resumed: false };
  }
  if (pending.pendingProvisionDice) {
    return { campaign, error: '请先为 Wild 补给骰选择面。', resumed: false };
  }
  let next = campaign;
  if (action === 'decline') {
    next = declineTrinketUse(next, opportunityId);
  } else {
    const side = getTrinketSide(opportunity.trinketId, opportunity.side);
    const rollEffect = side?.effects.find((effect) => effect.type === 'roll-provision-dice');
    if (rollEffect?.type === 'roll-provision-dice') {
      const useError = trinketUseError(next, opportunityId);
      if (useError) {
        const expired = {
          ...next,
          pendingTrinketUseOpportunities: next.pendingTrinketUseOpportunities.filter((entry) => entry.id !== opportunityId),
        };
        return { campaign: completeOriginalAction(expired), error: null, resumed: true };
      }
      const dice = rollProvisionDice(rollEffect.count, rng);
      next = {
        ...next,
        pendingDungeonTrinketAction: {
          ...pending,
          stage: dice.some((die) => die.selectedFace === null) ? 'provision-choice' : 'trinket-window',
          processedTrinketInstanceIds: [...new Set([...pending.processedTrinketInstanceIds, opportunity.trinketInstanceId])],
          pendingProvisionDice: dice,
        },
      };
      if (!dice.some((die) => die.selectedFace === null)) next = commitProvisionDice(next);
      return { campaign: next, error: null, resumed: next.pendingDungeonTrinketAction === null };
    }
    const used = useTrinket(next, opportunityId);
    if (used.error) {
      const expired = {
        ...next,
        pendingTrinketUseOpportunities: next.pendingTrinketUseOpportunities.filter((entry) => entry.id !== opportunityId),
      };
      return { campaign: completeOriginalAction(expired), error: null, resumed: true };
    }
    next = used.campaign;
  }
  const completed = completeOriginalAction(next);
  return { campaign: completed, error: null, resumed: completed.pendingDungeonTrinketAction === null };
}

export function chooseDungeonProvisionWild(
  campaign: CampaignState,
  dieIndex: number,
  face: keyof ProvisionPool,
): ResolveDungeonOpportunityResult {
  const pending = campaign.pendingDungeonTrinketAction;
  const dice = pending?.pendingProvisionDice;
  if (!pending || !dice || !Object.prototype.hasOwnProperty.call(campaign.provisions, face)) {
    return { campaign, error: '没有待选择的 Wild 补给骰。', resumed: false };
  }
  const die = dice.find((entry) => entry.index === dieIndex);
  if (!die || die.rolledFace !== 'wild' || die.selectedFace !== null) {
    return { campaign, error: '该补给骰不需要选择。', resumed: false };
  }
  const next: CampaignState = {
    ...campaign,
    pendingDungeonTrinketAction: {
      ...pending,
      pendingProvisionDice: dice.map((entry) => entry.index === dieIndex ? { ...entry, selectedFace: face } : entry),
    },
  };
  const committed = commitProvisionDice(next);
  return { campaign: committed, error: null, resumed: committed.pendingDungeonTrinketAction === null };
}
