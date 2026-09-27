import { afterEach, describe, expect, it } from 'vitest';
import type { CampaignState, ExplorationEventResult, TrinketSide } from '../types';
import { SURVIVAL_GUIDE_ID, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon } from './dungeon';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { setRandomSource } from './random';
import { EXPLORATION_EVENTS } from '../data/exploration-events';
import { enterDungeonRoom } from './commands/dungeon';
import { resolveOpenTrinketOpportunities } from './commands/trinket';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { COMMUNITY_TRINKET_CAPABILITIES } from '../data/community-reference/production-runtime';
import { LEVEL_1_TRINKET_DECK_COVERAGE } from '../audit/level1-trinket-deck';
import { useTrinket } from './trinkets/use-trinket';

export function guideFixture(sides: TrinketSide[]): CampaignState {
  setRandomSource(() => 0);
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  campaign = { ...campaign, gamePhase: 'dungeon-explore', currentQuestId: 'c1c17-test', questStatus: 'active',
    dungeon: generateDungeon('c1c17-test'), provisions: { ...campaign.provisions, food: 3, tool: 1 } };
  campaign = { ...campaign, dungeon: { ...campaign.dungeon!, rooms: campaign.dungeon!.rooms.map((room) => room.id === 'A'
    ? { ...room, type: 'empty', curioId: null, status: 'revealed' } : room) } };
  sides.forEach((side, index) => {
    campaign = acquireTrinket(campaign, { trinketId: SURVIVAL_GUIDE_ID, source: 'debug', sourceEventId: 'guide:' + index, heroId: campaign.heroes[index].instanceId }).campaign;
    campaign = { ...campaign, heroes: campaign.heroes.map((hero, i) => i === index ? { ...hero,
      equippedTrinkets: hero.equippedTrinkets.map((card) => ({ ...card, currentSide: side })) } : hero) };
  });
  return campaign;
}
function begin(sides: TrinketSide[], result: ExplorationEventResult) {
  const campaign = guideFixture(sides);
  setRandomSource(() => (EXPLORATION_EVENTS.findIndex((event) => event.result === result) + 0.1) / EXPLORATION_EVENTS.length);
  return enterDungeonRoom(campaign, 'A').campaign;
}
function decide(campaign: CampaignState, action: 'use' | 'decline', index = 0) {
  return resolveOpenTrinketOpportunities(campaign, [{ opportunityId: campaign.pendingTrinketUseOpportunities[index].id, decision: action }]);
}
const proof = (key: string, body: () => void) => productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C17-SURVIVAL-GUIDE-' + key], body);
afterEach(() => { setRandomSource(null); });
describe('C1C17 staged exploration', () => {
  proof('RUNTIME', () => {
    for (const result of ['hunger', 'trap'] as const) {
      const staged = begin(['positive'], result);
      expect(staged.dungeon!.currentRoomId).toBe('start');
      expect(staged.provisions).toMatchObject({ food: 3, tool: 1 });
      expect(staged.pendingDungeonTrinketAction).toMatchObject({ kind: 'exploration-move', originalResult: result, effectiveResult: result });
      expect(useTrinket(staged, staged.pendingTrinketUseOpportunities[0].id).error).toBeTruthy();
      if (result === 'hunger') staged.heroes[0].disease = { instanceId: 'tapeworm-witness', diseaseId: 'tapeworm',
        acquiredQuestId: staged.currentQuestId, acquiredAt: staged.createdAt, source: 'debug', sourceEventId: 'tapeworm-witness' };
      setRandomSource(() => { throw new Error('Ignored result must not select a random victim'); });
      const next = decide(staged, 'use');
      expect(next.heroes[0].pendingBleed).toBe(staged.heroes[0].pendingBleed);
      expect(next.pendingDungeonTrinketAction).toBeNull();
      expect(next.dungeon!.currentRoomId).toBe('A');
      expect(next.provisions).toMatchObject({ food: 3, tool: 1 });
      expect(next.heroes.map((hero) => [hero.wounds, hero.stress])).toEqual(staged.heroes.map((hero) => [hero.wounds, hero.stress]));
      expect(next.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
      expect(next.trinketUseRecords).toHaveLength(1);
      setRandomSource(() => 0);
      const declined = decide(staged, 'decline');
      expect(declined.provisions[result === 'trap' ? 'tool' : 'food']).toBe(result === 'trap' ? 0 : 2);
      if (result === 'hunger') expect(declined.heroes[0].pendingBleed).toBeGreaterThan(staged.heroes[0].pendingBleed);
    }
    const starving = begin(['positive'], 'hunger');
    starving.provisions.food = 0;
    const ignored = decide(starving, 'use');
    expect(ignored.heroes.map((hero) => hero.wounds)).toEqual(starving.heroes.map((hero) => hero.wounds));
    const declined = decide(begin(['negative'], 'none'), 'decline');
    expect(declined.dungeon!.currentRoomId).toBe('A');
    expect(declined.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
  });
  proof('SELECTOR', () => {
    for (const event of EXPLORATION_EVENTS) for (const side of ['positive', 'negative'] as const) {
      const staged = begin([side], event.result);
      const applicable = side === 'positive' ? ['trap', 'hunger'].includes(event.result) : event.result !== 'trap';
      expect(staged.pendingDungeonTrinketAction !== null).toBe(applicable);
      expect(staged.pendingTrinketUseOpportunities).toHaveLength(applicable ? 1 : 0);
    }
    expect(COMMUNITY_TRINKET_CAPABILITIES.find((card) => card.definitionId === SURVIVAL_GUIDE_ID)).toMatchObject({ productionReady: true });
    expect(LEVEL_1_TRINKET_DECK_COVERAGE).toMatchObject({ productionReadyCount: 7, completeForRandomDraw: false });
    const dead = guideFixture(['positive']);
    dead.heroes[0] = { ...dead.heroes[0], dead: true, isAlive: false };
    setRandomSource(() => 0.2);
    expect(enterDungeonRoom(dead, 'A').campaign.pendingDungeonTrinketAction).toBeNull();
  });
  proof('RESULT-TRANSFORM', () => {
    for (const event of EXPLORATION_EVENTS.filter((event) => event.result !== 'trap')) {
      const replaced = decide(begin(['negative'], event.result), 'use');
      expect(replaced.provisions).toMatchObject({ food: 3, tool: 0 });
      expect(replaced.dungeon!.currentRoomId).toBe('A');
    }
    const staged = begin(['negative'], 'none');
    const next = decide(staged, 'use');
    expect(next.provisions.tool).toBe(0);
    expect(next.dungeon!.currentRoomId).toBe('A');
    expect(next.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
    const multiple = begin(['negative', 'negative', 'positive'], 'hunger');
    const changed = decide(multiple, 'use');
    expect(changed.pendingDungeonTrinketAction).toMatchObject({ originalResult: 'hunger', effectiveResult: 'trap' });
    expect(changed.pendingTrinketUseOpportunities).toHaveLength(1);
    expect(changed.pendingTrinketUseOpportunities[0].heroId).toBe(changed.heroes[2].instanceId);
    expect(decide(changed, 'decline').provisions.tool).toBe(0);
  });
  proof('MULTI-COPY', () => {
    const staged = begin(['negative', 'positive'], 'none');
    const changed = decide(staged, 'use');
    expect(changed.pendingDungeonTrinketAction).toMatchObject({ originalResult: 'none', effectiveResult: 'trap', processedTrinketInstanceIds: [staged.heroes[0].equippedTrinkets[0].instanceId] });
    expect(changed.pendingTrinketUseOpportunities).toHaveLength(1);
    expect(changed.pendingTrinketUseOpportunities[0].heroId).toBe(staged.heroes[1].instanceId);
    const ignored = decide(changed, 'use');
    expect(ignored.dungeon!.currentRoomId).toBe('A');
    expect(ignored.provisions.tool).toBe(1);
    expect(ignored.trinketUseRecords).toHaveLength(2);
    const positives = begin(['positive', 'positive'], 'trap');
    const one = decide(positives, 'use');
    expect(one.pendingDungeonTrinketAction).toMatchObject({ ignored: true });
    expect(one.heroes[1].equippedTrinkets[0].currentSide).toBe('positive');
    expect(decide(one, 'decline').provisions.tool).toBe(1);
  });
  proof('SAVE-REPLAY', () => {
    const original = begin(['negative', 'positive', 'positive'], 'none');
    const negativeUsed = decide(original, 'use');
    const positiveUsed = decide(negativeUsed, 'use');
    for (const checkpoint of [original, negativeUsed, positiveUsed]) {
      setRandomSource(() => { throw new Error('Must not reroll'); });
      const save = createSaveSnapshot(checkpoint);
      const restored = restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
      expect(restored.pendingDungeonTrinketAction).toEqual(checkpoint.pendingDungeonTrinketAction);
      let next = restored;
      while (next.pendingDungeonTrinketAction) next = decide(next, 'decline');
      expect(next.dungeon!.currentRoomId).toBe('A');
      expect(next.provisions.tool).toBe(checkpoint === positiveUsed ? 1 : checkpoint === original ? 1 : 0);
      expect(resolveOpenTrinketOpportunities(next, [{ opportunityId: checkpoint.pendingTrinketUseOpportunities[0].id, decision: 'use' }])).toEqual(next);
    }
    for (const mutation of [ { questId: 'bad' }, { questRunId: 'bad' }, { fromRoomId: 'bad' }, { destinationRoomId: 'H' },
      { originalResult: 'bad' }, { effectiveResult: 'bad' }, { processedTrinketInstanceIds: ['fake'] }, { ignored: 'yes' } ]) {
      const save = createSaveSnapshot(original);
      Object.assign(save.campaign.pendingDungeonTrinketAction!, mutation);
      const restored = restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
      expect(restored.pendingDungeonTrinketAction).toBeNull();
      expect(restored.pendingTrinketUseOpportunities).toHaveLength(0);
      expect(restored.dungeon!.currentRoomId).toBe('start');
    }
  });
  it('rejects corrupt, dead-holder, stale and orphan exploration opportunities on restore', () => {
    const original = begin(['negative', 'positive'], 'none');
    for (const mutate of [
      (c: CampaignState) => { c.gamePhase = 'hamlet'; },
      (c: CampaignState) => { c.heroes[0].dead = true; c.heroes[0].isAlive = false; },
      (c: CampaignState) => { c.pendingTrinketUseOpportunities[0].trinketInstanceId = 'unknown'; },
      (c: CampaignState) => { c.pendingTrinketUseOpportunities[0].side = 'positive'; },
      (c: CampaignState) => { c.pendingTrinketUseOpportunities.push({ ...c.pendingTrinketUseOpportunities[0], id: 'duplicate' }); },
      (c: CampaignState) => { c.pendingDungeonTrinketAction = null; },
    ]) {
      const save = createSaveSnapshot(structuredClone(original));
      mutate(save.campaign);
      const restored = restoreSaveSnapshot(save);
      expect(restored.pendingDungeonTrinketAction).toBeNull();
      expect(restored.pendingTrinketUseOpportunities).toHaveLength(0);
      expect(restored.dungeon!.currentRoomId).toBe('start');
    }
  });
  it('rolls once before window, never resolves consequences or room events until decline', () => {
    const campaign = guideFixture(['positive']);
    let calls = 0;
    setRandomSource(() => { calls += 1; return 0.2; });
    const staged = enterDungeonRoom(campaign, 'A').campaign;
    expect(calls).toBe(1);
    expect(staged.dungeon!.rooms.find((room) => room.id === 'A')!.status).toBe('revealed');
    expect(staged.log).toEqual(campaign.log);
    const completed = decide(staged, 'decline');
    expect(calls).toBe(1);
    expect(completed.dungeon!.rooms.find((room) => room.id === 'A')!.status).toBe('cleared');
  });
  it('the same physical card can participate in a later traversal of the same edge', () => {
    const staged = begin(['positive'], 'trap');
    let next = decide(staged, 'use');
    setRandomSource(() => 0.34);
    next = enterDungeonRoom(next, 'start').campaign; // Negative is inapplicable to Trap.
    setRandomSource(() => 0);
    next = enterDungeonRoom(next, 'A').campaign; // New None move allows Negative.
    expect(next.pendingTrinketUseOpportunities).toHaveLength(1);
    expect(next.pendingDungeonTrinketAction!.rootEventId).not.toBe(staged.pendingDungeonTrinketAction!.rootEventId);
    expect(decide(next, 'use').heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
  });
  it('rejects a second move while staged and gives repeated edges distinct roots', () => {
    const staged = begin(['positive'], 'trap');
    expect(enterDungeonRoom(staged, 'A')).toMatchObject({ ok: false, campaign: staged });
    const firstRoot = staged.pendingDungeonTrinketAction!.rootEventId;
    let next = decide(staged, 'decline');
    setRandomSource(() => 0);
    next = enterDungeonRoom(next, 'start').campaign;
    setRandomSource(() => 0.34);
    next = enterDungeonRoom(next, 'A').campaign;
    expect(next.pendingDungeonTrinketAction!.rootEventId).not.toBe(firstRoot);
  });
});
