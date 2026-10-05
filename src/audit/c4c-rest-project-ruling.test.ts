import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import official from '../../docs/data/complete-edition/c4b-rest-official-contract.json';
import { C4C_REST_RULING, C4C_REST_RULING_ID, effectiveRestContract, effectiveRestSemanticsAuthorized,
  officialRestSemanticsComplete } from './c4c-rest-effective-contract';
import * as effective from './c4c-rest-effective-contract';
import * as quests from '../data/quests';
import { PRODUCTION_FACE_THE_THREAT_QUEST } from '../data/quests/production-face-the-threat';
import { restAllocationSemanticsImplemented } from './rest-semantic-contract';
import { commitRestAtCamp, createQuestRuntimeState } from '../game-engine/quests/quest-runtime';
import { restCampaign } from './c4c-quest-test-support';

describe('C4C explicit non-canonical Rest authority', () => {
  it('preserves official gaps and binds each unresolved production field to the authorized ruling', () => {
    expect(official.outcome).toBe('REST_OFFICIAL_CONTRACT_UNRESOLVED');
    expect(officialRestSemanticsComplete()).toBe(false);
    expect(restAllocationSemanticsImplemented()).toBe(false);
    expect(C4C_REST_RULING).toMatchObject({ canonical: false, productionAuthorized: true,
      authorizationKind: 'EXPLICIT_USER_PROJECT_AUTHORIZATION', authority: 'PROJECT_RULING' });
    for (const field of effectiveRestContract().fields) {
      const original = official.fields.find(f => f.field === field.field)!;
      expect(field.officialStatus).toBe(original.currentOfficialStatus);
      if (!original.productionUsable) {
        expect(field.effectiveAuthority).toBe('PROJECT_RULING');
        expect(field.rulingId).toBe(C4C_REST_RULING_ID);
        expect(field.officialStatus).not.toBe('OFFICIAL_EXPLICIT');
      }
    }
  });

  it('fails closed for missing, disabled, incomplete, altered or canonical masquerading rulings', () => {
    expect(effectiveRestSemanticsAuthorized()).toBe(true);
    expect(effectiveRestSemanticsAuthorized(null)).toBe(false);
    for (const patch of [{ productionAuthorized: false }, { canonical: true }, { authority: 'OFFICIAL' },
      { fields: { ...C4C_REST_RULING.fields, recoveryCap: '' } }, { rulingId: 'unknown' }]) {
      expect(effectiveRestSemanticsAuthorized({ ...C4C_REST_RULING, ...patch })).toBe(false);
    }
    const disabled = vi.spyOn(effective, 'effectiveRestSemanticsAuthorized').mockReturnValue(false);
    try { expect(commitRestAtCamp(restCampaign(), { allocations: [] }).error).toBe('REST_SEMANTICS_UNAUTHORIZED'); }
    finally { disabled.mockRestore(); }
  });
});

describe('C4C Rest validation and atomic commit', () => {
  it('leaves frozen Boss Rest execution and initial state outside standard-Quest ruling binding', () => {
    const state = createQuestRuntimeState(PRODUCTION_FACE_THE_THREAT_QUEST)!;
    expect(state.restRuleVersion).toBeUndefined();
    const bossLookup = vi.spyOn(quests, 'getCampaignQuest').mockReturnValue(PRODUCTION_FACE_THE_THREAT_QUEST);
    try {
      const c = restCampaign();
      delete c.questRuntimeState!.restRuleVersion;
      delete c.questRuntimeState!.restSemanticAuthority;
      expect(commitRestAtCamp(c, { allocations: [] }).error).toBe('REST_ALLOCATION_INCOMPLETE_BUDGET');
      const full = commitRestAtCamp(c, { allocations: [{ heroId: c.heroes[0].instanceId, resource: 'stress', points: 8 }] });
      expect(full.ok).toBe(true);
      expect(full.campaign.questRuntimeState!.restRuleVersion).toBeUndefined();
    } finally { bossLookup.mockRestore(); }
  });
  it.each([[8, 5, 10], [8, 0, 10], [8, 8, 10], [12, 4, 4], [8, 0, 0]])(
    'budget %i / spend %i / real capacity %i', (budget, points, capacity) => {
      const c = restCampaign(undefined, budget, capacity);
      const result = commitRestAtCamp(c, { allocations: points ? [{ heroId: c.heroes[0].instanceId, resource: 'stress', points }] : [] });
      expect(result.ok).toBe(true);
      expect(result.campaign.heroes[0].stress).toBe(capacity - points);
      expect(result.campaign.questRuntimeState).toMatchObject({ restingPointsRemaining: 0,
        restingPointsSpent: points, firewoodTokensRemaining: c.questRuntimeState!.firewoodTokensRemaining! - 1 });
    });
  it.each([
    [9, 'stress', 'REST_ALLOCATION_EXCEEDS_BUDGET'],
    [3, 'life', 'REST_ALLOCATION_EXCEEDS_RECOVERY_CAP'],
    [-1, 'stress', 'REST_ALLOCATION_INVALID_POINTS'],
    [1.5, 'stress', 'REST_ALLOCATION_INVALID_POINTS'],
    [1, 'gold', 'REST_ALLOCATION_INVALID_RESOURCE'],
  ])('rejects allocation %s %s atomically', (points, resource, error) => {
    const c = restCampaign(); c.heroes[0].wounds = 2;
    expect(commitRestAtCamp(c, { allocations: [{ heroId: c.heroes[0].instanceId, resource, points }] } as never))
      .toEqual({ ok: false, campaign: c, error });
  });
  it('bounds aggregate repeated allocations and applies Life OR Stress once per point', () => {
    const c = restCampaign(); c.heroes[0].wounds = 2;
    const life = { heroId: c.heroes[0].instanceId, resource: 'life' as const, points: 2 };
    expect(commitRestAtCamp(c, { allocations: [life, life] }).error).toBe('REST_ALLOCATION_EXCEEDS_RECOVERY_CAP');
    const result = commitRestAtCamp(c, { allocations: [life] });
    expect(result.campaign.heroes[0].wounds).toBe(0);
    expect(result.campaign.heroes[0].stress).toBe(10);
    expect(result.campaign.questRuntimeState!.restingPointsSpent).toBe(2);
  });
  it('preserves cleared Room, living Hero, location, Firewood and version restrictions', () => {
    const c = restCampaign();
    expect(commitRestAtCamp({ ...c, gamePhase: 'quest-select' }, { allocations: [] }).error).toBe('REST_NOT_IN_DUNGEON_EXPLORE');
    const uncleared = structuredClone(c); uncleared.dungeon!.rooms.forEach(r => { r.status = 'revealed'; });
    expect(commitRestAtCamp(uncleared, { allocations: [] }).error).toBe('REST_NOT_IN_CLEARED_ROOM');
    const noWood = structuredClone(c); noWood.questRuntimeState!.firewoodTokensRemaining = 0;
    expect(commitRestAtCamp(noWood, { allocations: [] }).error).toBe('REST_NO_FIREWOOD');
    const dead = structuredClone(c); dead.heroes[0].dead = true;
    expect(commitRestAtCamp(dead, { allocations: [{ heroId: dead.heroes[0].instanceId, resource: 'stress', points: 1 }] }).error).toBe('REST_ALLOCATION_DEAD_HERO');
    expect(commitRestAtCamp(c, { allocations: [{ heroId: 'unknown', resource: 'stress', points: 1 }] }).error).toBe('REST_ALLOCATION_UNKNOWN_HERO');
    const wrong = structuredClone(c); wrong.questRuntimeState!.restRuleVersion = 'unknown';
    expect(commitRestAtCamp(wrong, { allocations: [] }).error).toBe('REST_SEMANTICS_UNAUTHORIZED');
  });
});
