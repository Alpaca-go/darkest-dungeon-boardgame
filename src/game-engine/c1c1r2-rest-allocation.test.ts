import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { COMMUNITY_QUEST_RUNTIME_ADAPTERS } from '../data/community-reference/production-runtime';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon } from './dungeon';
import {
  commitRestAtCamp,
  createQuestRuntimeState,
  validateRestAllocation,
  type RestAllocation,
} from './quests/quest-runtime';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';

const QUEST_ID = 'community-quest-ruins-lvl1-scout-ahead';

function restCampaign(): CampaignState {
  const base = applyDefaultLoadout(selectParty(
    createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor'],
  ));
  const quest = COMMUNITY_QUEST_RUNTIME_ADAPTERS[QUEST_ID].definition;
  const dungeon = generateDungeon(QUEST_ID);
  return {
    ...base,
    currentQuestId: QUEST_ID,
    questStatus: 'active',
    gamePhase: 'dungeon-explore',
    dungeon: {
      ...dungeon,
      rooms: dungeon.rooms.map((room) => room.id === dungeon.currentRoomId ? { ...room, status: 'cleared' as const } : room),
    },
    heroes: base.heroes.map((hero, index) => index === 0
      ? { ...hero, wounds: 3, stress: 4 }
      : index === 1 ? { ...hero, wounds: 2, stress: 2 } : hero),
    questRuntimeState: createQuestRuntimeState(quest),
  };
}

function allocation(campaign: CampaignState): RestAllocation {
  return {
    allocations: [
      { heroId: campaign.heroes[0].instanceId, resource: 'stress', points: 3 },
      { heroId: campaign.heroes[0].instanceId, resource: 'life', points: 3 },
      { heroId: campaign.heroes[1].instanceId, resource: 'life', points: 2 },
    ],
  };
}

describe('C1C-1R2 source-backed Rest allocation', () => {
  it('commits only the player-authored choices and records actual points spent', () => {
    const campaign = restCampaign();
    const result = commitRestAtCamp(campaign, allocation(campaign));
    expect(result).toMatchObject({ ok: true, error: null });
    expect(result.campaign.heroes[0]).toMatchObject({ stress: 1, wounds: 0 });
    expect(result.campaign.heroes[1]).toMatchObject({ stress: 2, wounds: 0 });
    expect(result.campaign.heroes[2]).toEqual(campaign.heroes[2]);
    expect(result.campaign.questRuntimeState).toMatchObject({
      firewoodTokensRemaining: 0,
      restingPointsRemaining: 0,
      restingPointsSpent: 8,
    });
  });

  it('RS-01 rejects voluntary partial spending atomically', () => {
    const campaign = restCampaign();
    const result = commitRestAtCamp(campaign, {
      allocations: [{ heroId: campaign.heroes[0].instanceId, resource: 'life', points: 1 }],
    });
    expect(result).toEqual({ ok: false, campaign, error: 'REST_ALLOCATION_INCOMPLETE_BUDGET' });
  });

  it('RS-02 rejects a zero-point Rest while recoverable capacity exists', () => {
    const campaign = restCampaign();
    expect(commitRestAtCamp(campaign, { allocations: [] })).toEqual({
      ok: false,
      campaign,
      error: 'REST_ALLOCATION_INCOMPLETE_BUDGET',
    });
  });

  it.each([
    ['RA-01 over budget', (campaign: CampaignState): RestAllocation => ({ allocations: [{ heroId: campaign.heroes[0].instanceId, resource: 'stress', points: 9 }] }), 'REST_ALLOCATION_EXCEEDS_BUDGET'],
    ['RA-02 negative points', (campaign: CampaignState): RestAllocation => ({ allocations: [{ heroId: campaign.heroes[0].instanceId, resource: 'stress', points: -1 }] }), 'REST_ALLOCATION_INVALID_POINTS'],
    ['RA-03 unknown Hero', (): RestAllocation => ({ allocations: [{ heroId: 'missing-hero', resource: 'stress', points: 1 }] }), 'REST_ALLOCATION_UNKNOWN_HERO'],
  ] as const)('%s fails closed', (_name, makeAllocation, expectedError) => {
    const campaign = restCampaign();
    const result = commitRestAtCamp(campaign, makeAllocation(campaign));
    expect(result).toEqual({ ok: false, campaign, error: expectedError });
  });

  it('RA-04 rejects a dead Hero atomically', () => {
    const original = restCampaign();
    const campaign = { ...original, heroes: original.heroes.map((hero, index) => index === 0 ? { ...hero, dead: true, isAlive: false } : hero) };
    const result = commitRestAtCamp(campaign, { allocations: [{ heroId: campaign.heroes[0].instanceId, resource: 'stress', points: 1 }] });
    expect(result).toEqual({ ok: false, campaign, error: 'REST_ALLOCATION_DEAD_HERO' });
  });

  it('RA-05 rejects no Firewood atomically', () => {
    const original = restCampaign();
    const campaign = { ...original, questRuntimeState: { ...original.questRuntimeState!, firewoodTokensRemaining: 0 } };
    const result = commitRestAtCamp(campaign, allocation(campaign));
    expect(result).toEqual({ ok: false, campaign, error: 'REST_NO_FIREWOOD' });
  });

  it('RA-06 rejects a room that is not cleared atomically', () => {
    const original = restCampaign();
    const campaign = { ...original, dungeon: { ...original.dungeon!, rooms: original.dungeon!.rooms.map((room) => room.id === original.dungeon!.currentRoomId ? { ...room, status: 'current' as const } : room) } };
    const result = commitRestAtCamp(campaign, allocation(campaign));
    expect(result).toEqual({ ok: false, campaign, error: 'REST_NOT_IN_CLEARED_ROOM' });
  });

  it('RA-08 rejects over-recovery without consuming Firewood', () => {
    const campaign = restCampaign();
    const result = commitRestAtCamp(campaign, { allocations: [{ heroId: campaign.heroes[1].instanceId, resource: 'stress', points: 3 }] });
    expect(result.error).toBe('REST_ALLOCATION_EXCEEDS_RECOVERY_CAP');
    expect(result.campaign).toBe(campaign);
    expect(result.campaign.questRuntimeState?.firewoodTokensRemaining).toBe(1);
  });

  it('validation is pure and accepts duplicate entries only within aggregate recovery caps', () => {
    const campaign = restCampaign();
    const before = structuredClone(campaign);
    expect(validateRestAllocation(campaign, {
      allocations: [
        { heroId: campaign.heroes[0].instanceId, resource: 'stress', points: 2 },
        { heroId: campaign.heroes[0].instanceId, resource: 'stress', points: 2 },
        { heroId: campaign.heroes[0].instanceId, resource: 'life', points: 3 },
        { heroId: campaign.heroes[1].instanceId, resource: 'life', points: 1 },
      ],
    })).toMatchObject({ ok: true, spentPoints: 8 });
    expect(campaign).toEqual(before);
  });

  it('RA-11 committed allocation survives save/reload exactly', () => {
    const campaign = restCampaign();
    const committed = commitRestAtCamp(campaign, allocation(campaign)).campaign;
    const restored = restoreSaveSnapshot(createSaveSnapshot(committed));
    expect(restored.heroes).toEqual(committed.heroes);
    expect(restored.questRuntimeState).toEqual(committed.questRuntimeState);
  });

  it('RA-09/RA-10 engine contains no automatic Hero choice, stress-first, or round-robin strategy', () => {
    const implementation = readFileSync('src/game-engine/quests/quest-runtime.ts', 'utf8');
    expect(implementation).not.toMatch(/round[- ]robin|stress[- ]first|point\s*%\s*candidates|chooseHero|automatic hero/i);
    expect(implementation).not.toMatch(/for\s*\(let point[\s\S]*hero\.stress\s*>\s*0[\s\S]*hero\.wounds/);
  });

  it('RA-07 Cancel is UI-only and RA-12 E2E contains no direct state injection', () => {
    const page = readFileSync('src/pages/DungeonExplorePage.tsx', 'utf8');
    expect(page).toContain('closeRestAllocation');
    expect(page).not.toMatch(/setCampaign|replaceCampaign/);
    const e2e = readFileSync('e2e/phase11a4-c1c1r2-rest-allocation.spec.ts', 'utf8');
    expect(e2e).not.toMatch(/store\.setState|recordQuestQualificationEvent|\.stress\s*=(?!=)|\.wounds\s*=(?!=)/);
    expect(e2e.match(/window\.localStorage\.setItem\([^)]*\)/g)).toBeNull();
  });
});
