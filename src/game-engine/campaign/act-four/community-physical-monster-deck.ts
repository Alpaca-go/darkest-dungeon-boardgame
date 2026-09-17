import type { CampaignState } from '../../../types';
import type { CommunityPhysicalMonsterDeckState, LocationContentRuntime } from '../../../types/act-four';
import { COMMUNITY_RUNTIME_MONSTER_COMPOSITION } from '../../../data/darkest-dungeon/community-reference/runtime-profile';
import { COMMUNITY_MONSTER_DRAW_SEMANTIC } from '../../../data/darkest-dungeon/community-reference/source-supplement-runtime';
import { shuffleWithRng } from './rng';

export const COMMUNITY_PHYSICAL_MONSTER_DECK_SIZE = 26 as const;

export interface CommunityPhysicalInstance {
  instanceId: string;
  definitionId: string;
  guid: string;
  cardId: number;
}

export function listCommunityPhysicalMonsterInstances(): CommunityPhysicalInstance[] {
  return COMMUNITY_RUNTIME_MONSTER_COMPOSITION.flatMap((monster) =>
    monster.physicalInstances.map((member) => ({
      instanceId: `dd-physical-${member.guid}`,
      definitionId: monster.id,
      guid: member.guid,
      cardId: member.cardId,
    })),
  );
}

const INSTANCES = listCommunityPhysicalMonsterInstances();
if (INSTANCES.length !== COMMUNITY_PHYSICAL_MONSTER_DECK_SIZE || new Set(INSTANCES.map((item) => item.instanceId)).size !== 26) {
  throw new Error('Community physical Monster deck must expose 26 distinct identities');
}
if (COMMUNITY_MONSTER_DRAW_SEMANTIC.uniformLogicalIdentity !== false || COMMUNITY_MONSTER_DRAW_SEMANTIC.savedDeckIdsArePolicy !== false) {
  throw new Error('Physical deck must not use logical-uniform or saved DeckIDs policy');
}

const byId = Object.fromEntries(INSTANCES.map((item) => [item.instanceId, item]));

export function createShuffledCommunityPhysicalMonsterDeck(
  rng: () => number,
  transactionId: string,
  now: string,
): CommunityPhysicalMonsterDeckState {
  const instanceIds = INSTANCES.map((item) => item.instanceId);
  const drawPile = shuffleWithRng(rng, instanceIds);
  return {
    instanceIds,
    drawPile,
    usedPile: [],
    inBattle: [],
    instanceToDefinitionId: Object.fromEntries(INSTANCES.map((item) => [item.instanceId, item.definitionId])),
    shuffleTransactionId: transactionId,
    shuffleReceipt: { order: [...drawPile], at: now },
    drawHistory: [],
    returnHistory: [],
  };
}

export function communityPhysicalDefinitionId(instanceId: string): string | null {
  return byId[instanceId]?.definitionId ?? null;
}

export function drawCommunityPhysicalMonster(
  campaign: CampaignState,
  transactionId: string,
): { ok: true; campaign: CampaignState; instanceId: string; monsterDefinitionId: string } | { ok: false; campaign: CampaignState; reason: string } {
  const runtime = campaign.actFourState.contentRuntime;
  const deck = runtime?.physicalMonsterDeck;
  if (!runtime || runtime.runtimeProfileId !== 'community-reference' || !deck) {
    return { ok: false, campaign, reason: 'Community physical Monster deck is not active' };
  }
  const existing = deck.drawHistory.find((entry) => entry.transactionId === transactionId);
  if (existing) {
    return { ok: true, campaign, instanceId: existing.instanceId, monsterDefinitionId: existing.definitionId };
  }
  if (deck.drawPile.length === 0) return { ok: false, campaign, reason: 'Community physical Monster deck is empty' };
  const instanceId = deck.drawPile[0];
  const monsterDefinitionId = deck.instanceToDefinitionId[instanceId];
  if (!monsterDefinitionId || COMMUNITY_MONSTER_DRAW_SEMANTIC.uniformLogicalIdentity) {
    return { ok: false, campaign, reason: 'Physical Monster identity mapping missing' };
  }
  const nextDeck: CommunityPhysicalMonsterDeckState = {
    ...deck,
    drawPile: deck.drawPile.slice(1),
    inBattle: [...deck.inBattle, instanceId],
    drawHistory: [...deck.drawHistory, { instanceId, definitionId: monsterDefinitionId, transactionId }],
  };
  return {
    ok: true,
    campaign: withPhysicalDeck(campaign, runtime, nextDeck),
    instanceId,
    monsterDefinitionId,
  };
}

export function returnCommunityPhysicalMonstersFromBattle(
  campaign: CampaignState,
  rng: () => number,
  transactionId: string,
): CampaignState {
  const runtime = campaign.actFourState.contentRuntime;
  const deck = runtime?.physicalMonsterDeck;
  if (!runtime || !deck || (deck.inBattle.length === 0 && deck.usedPile.length === 0)) return campaign;
  if (deck.returnHistory.some((entry) => entry.transactionId === transactionId)) return campaign;
  const returning = [...deck.usedPile, ...deck.inBattle];
  const drawPile = shuffleWithRng(rng, [...deck.drawPile, ...returning]);
  const nextDeck: CommunityPhysicalMonsterDeckState = {
    ...deck,
    drawPile,
    usedPile: [],
    inBattle: [],
    returnHistory: [...deck.returnHistory, { transactionId, returnedInstanceIds: returning, drawPileAfter: [...drawPile] }],
  };
  return withPhysicalDeck(campaign, runtime, nextDeck);
}

function withPhysicalDeck(
  campaign: CampaignState,
  runtime: LocationContentRuntime,
  physicalMonsterDeck: CommunityPhysicalMonsterDeckState,
): CampaignState {
  return {
    ...campaign,
    actFourState: {
      ...campaign.actFourState,
      contentRuntime: { ...runtime, physicalMonsterDeck },
    },
  };
}
