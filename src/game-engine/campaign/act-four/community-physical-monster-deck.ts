import type { CampaignState } from '../../../types';
import type {
  CommunityPhysicalMonsterDeckState,
  CommunityPhysicalMonsterFillRecord,
  CommunityPhysicalMonsterPlacement,
  LocationContentRuntime,
} from '../../../types/act-four';
import { COMMUNITY_RUNTIME_MONSTER_COMPOSITION } from '../../../data/darkest-dungeon/community-reference/runtime-profile';
import { COMMUNITY_MONSTER_DRAW_SEMANTIC } from '../../../data/darkest-dungeon/community-reference/source-supplement-runtime';
import {
  COMMUNITY_PHYSICAL_MONSTER_CARD_ATTRIBUTES,
  communityMonsterCardAttribute,
  firstEmptyStanceForPlacement,
} from '../../../data/darkest-dungeon/community-reference/community-source-geometry';
import { shuffleWithRng } from './rng';

export const COMMUNITY_PHYSICAL_MONSTER_DECK_SIZE = 26 as const;
export const COMMUNITY_ORDINARY_ENCOUNTER_STANCE_SLOTS = 4 as const;

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
// WP-8：所有当前卡 non-Large 必须由 source attribute 表证明，禁止代码默认 false。
if (
  COMMUNITY_PHYSICAL_MONSTER_CARD_ATTRIBUTES.length !== 9
  || COMMUNITY_PHYSICAL_MONSTER_CARD_ATTRIBUTES.some((card) => card.large !== false || card.slotCount !== 1 || !card.sourceReference.startsWith('asset:'))
) {
  throw new Error('Community physical Monster Front/Back/Large attributes missing source proof');
}
for (const monster of COMMUNITY_RUNTIME_MONSTER_COMPOSITION) {
  if (!communityMonsterCardAttribute(monster.id)) {
    throw new Error(`Missing Front/Back attribute for ${monster.id}`);
  }
}

const byId = Object.fromEntries(INSTANCES.map((item) => [item.instanceId, item]));

function normalizePhysicalDeck(deck: CommunityPhysicalMonsterDeckState): CommunityPhysicalMonsterDeckState {
  return {
    ...deck,
    activePlacements: deck.activePlacements ?? [],
    fillHistory: deck.fillHistory ?? [],
  };
}

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
    activePlacements: [],
    fillHistory: [],
  };
}

export function communityPhysicalDefinitionId(instanceId: string): string | null {
  return byId[instanceId]?.definitionId ?? null;
}

/**
 * WP-8 生产填充：顶牌连抽直到 4 个 Monster Stance Slot 填满。
 * Front → Aggressive→Support；Back → Support→Aggressive；Large 占 2 槽（当前 source 全非 Large）。
 * 不发明尺寸：每张卡的 placementSide/large/slotCount 只读自 COMMUNITY_PHYSICAL_MONSTER_CARD_ATTRIBUTES。
 */
export function fillCommunityOrdinaryMonsterEncounter(
  campaign: CampaignState,
  transactionId: string,
): {
  ok: boolean;
  campaign: CampaignState;
  placements: CommunityPhysicalMonsterPlacement[];
  reason: string | null;
} {
  const runtime = campaign.actFourState.contentRuntime;
  const deckRaw = runtime?.physicalMonsterDeck;
  if (!runtime || runtime.runtimeProfileId !== 'community-reference' || !deckRaw) {
    return { ok: false, campaign, placements: [], reason: 'Community physical Monster deck is not active' };
  }
  const deck = normalizePhysicalDeck(deckRaw);

  const existing = deck.fillHistory.find((entry) => entry.transactionId === transactionId);
  if (existing) {
    return { ok: true, campaign, placements: existing.placements, reason: null };
  }

  // 幂等：本战斗已有完整四槽占用时拒绝重复填充（避免二次抽牌）。
  if (deck.activePlacements.reduce((sum, item) => sum + item.slotCount, 0) >= COMMUNITY_ORDINARY_ENCOUNTER_STANCE_SLOTS) {
    return { ok: true, campaign, placements: deck.activePlacements, reason: null };
  }

  let working = campaign;
  let workingDeck = deck;
  const occupied = new Set(workingDeck.activePlacements.map((item) => item.stance));
  const placements: CommunityPhysicalMonsterPlacement[] = [...workingDeck.activePlacements];
  let drawIndex = workingDeck.drawHistory.length;

  while (occupied.size < COMMUNITY_ORDINARY_ENCOUNTER_STANCE_SLOTS) {
    if (workingDeck.drawPile.length === 0) {
      return { ok: false, campaign: working, placements, reason: 'Community physical Monster deck exhausted before four Stance slots filled' };
    }
    const drawTx = `${transactionId}:draw:${drawIndex}`;
    const drawn = drawCommunityPhysicalMonster(working, drawTx);
    if (!drawn.ok) return { ok: false, campaign: drawn.campaign, placements, reason: drawn.reason };
    working = drawn.campaign;
    workingDeck = working.actFourState.contentRuntime!.physicalMonsterDeck!;
    drawIndex += 1;

    const attr = communityMonsterCardAttribute(drawn.monsterDefinitionId);
    if (!attr) {
      return { ok: false, campaign: working, placements, reason: `Missing source Front/Back attribute for ${drawn.monsterDefinitionId}` };
    }
    const stance = firstEmptyStanceForPlacement(occupied, attr.placementSide);
    if (!stance) {
      return { ok: false, campaign: working, placements, reason: `No empty Stance remains for ${attr.placementSide} placement (${drawn.monsterDefinitionId})` };
    }
    // Large 占两槽：当前 source 全 large=false；若将来出现 Large，需再占相邻空槽。
    if (attr.large || attr.slotCount !== 1) {
      return { ok: false, campaign: working, placements, reason: `Large / multi-slot placement not yet proven for ${drawn.monsterDefinitionId}` };
    }
    occupied.add(stance);
    placements.push({
      instanceId: drawn.instanceId,
      definitionId: drawn.monsterDefinitionId,
      stance,
      placementSide: attr.placementSide,
      slotCount: attr.slotCount,
      large: attr.large,
    });

    // 回写 stance 到最近一条 drawHistory。
    const history = workingDeck.drawHistory.map((entry) =>
      entry.transactionId === drawTx
        ? { ...entry, stance, placementSide: attr.placementSide, slotCount: attr.slotCount, large: attr.large }
        : entry,
    );
    workingDeck = { ...workingDeck, drawHistory: history, activePlacements: placements };
    working = withPhysicalDeck(working, working.actFourState.contentRuntime!, workingDeck);
  }

  const fill: CommunityPhysicalMonsterFillRecord = {
    transactionId,
    placements,
    occupiedStances: [...occupied].sort(),
  };
  const prior = normalizePhysicalDeck(working.actFourState.contentRuntime!.physicalMonsterDeck!);
  const finalDeck: CommunityPhysicalMonsterDeckState = {
    ...prior,
    activePlacements: placements,
    fillHistory: [...prior.fillHistory, fill],
  };
  return {
    ok: true,
    campaign: withPhysicalDeck(working, working.actFourState.contentRuntime!, finalDeck),
    placements,
    reason: null,
  };
}

export function drawCommunityPhysicalMonster(
  campaign: CampaignState,
  transactionId: string,
): { ok: true; campaign: CampaignState; instanceId: string; monsterDefinitionId: string } | { ok: false; campaign: CampaignState; reason: string } {
  const runtime = campaign.actFourState.contentRuntime;
  const deckRaw = runtime?.physicalMonsterDeck;
  if (!runtime || runtime.runtimeProfileId !== 'community-reference' || !deckRaw) {
    return { ok: false, campaign, reason: 'Community physical Monster deck is not active' };
  }
  const deck = normalizePhysicalDeck(deckRaw);
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
  const deckRaw = runtime?.physicalMonsterDeck;
  if (!runtime || !deckRaw || (deckRaw.inBattle.length === 0 && deckRaw.usedPile.length === 0)) return campaign;
  const deck = normalizePhysicalDeck(deckRaw);
  if (deck.returnHistory.some((entry) => entry.transactionId === transactionId)) return campaign;
  const returning = [...deck.usedPile, ...deck.inBattle];
  const drawPile = shuffleWithRng(rng, [...deck.drawPile, ...returning]);
  const nextDeck: CommunityPhysicalMonsterDeckState = {
    ...deck,
    drawPile,
    usedPile: [],
    inBattle: [],
    activePlacements: [],
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

/** WP-8：普通遭遇四槽 Front/Back 填充入口（替代旧 fail-closed drawCommunityMonster stub）。 */
export function drawCommunityMonster(campaign: CampaignState, transactionId?: string) {
  const runtime = campaign.actFourState.contentRuntime;
  const tx = transactionId ?? `dd-monster-fill:${campaign.id}:${runtime?.physicalMonsterDeck?.fillHistory.length ?? 0}`;
  return fillCommunityOrdinaryMonsterEncounter(campaign, tx);
}

/** WP-8 coverage / evidence：导出当前卡的 Front/Back/Large source 证明表。 */
export function communityPhysicalMonsterPlacementPolicyProof() {
  return {
    draw: COMMUNITY_MONSTER_DRAW_SEMANTIC.draw,
    stanceSlots: COMMUNITY_ORDINARY_ENCOUNTER_STANCE_SLOTS,
    largeUsesTwoSlots: COMMUNITY_MONSTER_DRAW_SEMANTIC.largeUsesTwoSlots,
    cards: COMMUNITY_PHYSICAL_MONSTER_CARD_ATTRIBUTES.map((card) => ({
      sourceLocalMonsterDefinitionId: card.sourceLocalMonsterDefinitionId,
      placementSide: card.placementSide,
      large: card.large,
      slotCount: card.slotCount,
      sourceReference: card.sourceReference,
    })),
  };
}
