import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { BOOK_OF_CONSTITUTION_ID, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { acquireDisease } from './diseases/acquire-disease';
import {
  beginDiseaseAcquisitionWithTrinkets,
  resolveDiseaseTrinketOpportunity,
} from './trinkets/disease-trinket-bridge';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';

const proof = (id: string) => PRODUCTION_PROOF_REGISTRY[id];

function fixture(copies = 1): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  campaign = { ...campaign, heroes: campaign.heroes.map((hero, index) => index === 0 ? { ...hero, level: 2 as const } : hero) };
  for (let index = 0; index < copies; index += 1) campaign = acquireTrinket(campaign, {
    trinketId: BOOK_OF_CONSTITUTION_ID,
    source: 'debug',
    sourceEventId: `book-${index}`,
    heroId: campaign.heroes[0].instanceId,
  }).campaign;
  return campaign;
}

function begin(campaign: CampaignState, diseaseId = 'black-plague', sourceEventId = 'disease-1') {
  return beginDiseaseAcquisitionWithTrinkets(campaign, {
    heroId: campaign.heroes[0].instanceId,
    diseaseId,
    source: 'curio',
    sourceEventId,
    questId: 'c1c12-proof',
    deathSource: 'exploration',
    deathResumePhase: 'dungeon-explore',
  });
}

function openId(campaign: CampaignState): string {
  return campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!.id;
}

describe('C1C-12 Book of Constitution pre-commit disease discard', () => {
  productionProofTest(proof('C1C12-CONSTITUTION-DISEASE-DISCARD-RUNTIME'), () => {
    const staged = begin(fixture());
    expect(staged.paused).toBe(true);
    expect(staged.campaign.heroes[0].disease).toBeNull();
    expect(staged.campaign.pendingDiseaseTrinketAction).toMatchObject({
      sourceEventId: 'disease-1', diseaseId: 'black-plague', rootEventId: 'disease-acquisition:disease-1',
    });
    const resolved = resolveDiseaseTrinketOpportunity(staged.campaign, openId(staged.campaign), 'use');
    expect(resolved.error).toBeNull();
    expect(resolved.campaign.heroes[0].disease).toBeNull();
    expect(resolved.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
    expect(resolved.campaign.processedDiseaseEventIds).toContain('disease-1');
    expect(resolved.campaign.lastDiseaseAcquisition).toMatchObject({
      outcome: 'discarded-by-trinket', preventedByTrinketId: BOOK_OF_CONSTITUTION_ID,
    });
    expect(resolved.campaign.pendingDiseaseTrinketAction).toBeNull();
  });

  productionProofTest(proof('C1C12-CONSTITUTION-REPLACEMENT-PREVENTION'), () => {
    let campaign = fixture();
    campaign = acquireDisease(campaign, {
      heroId: campaign.heroes[0].instanceId, diseaseId: 'black-plague', source: 'debug', sourceEventId: 'existing',
    }).campaign;
    const existing = campaign.heroes[0].disease;
    const staged = begin(campaign, 'bulimic', 'replacement');
    const resolved = resolveDiseaseTrinketOpportunity(staged.campaign, openId(staged.campaign), 'use').campaign;
    expect(resolved.heroes[0].disease).toEqual(existing);
    expect(resolved.pendingDiseaseTransaction).toBeNull();
    expect(resolved.pendingQuirkDecisions).toHaveLength(0);
    expect(resolved.heroes[0].negativeQuirkIds).toHaveLength(0);
  });

  productionProofTest(proof('C1C12-CONSTITUTION-SAVE-REPLAY'), () => {
    const staged = begin(fixture()).campaign;
    const opportunityId = openId(staged);
    const replay = restoreSaveSnapshot(createSaveSnapshot(staged));
    expect(replay.pendingDiseaseTrinketAction).toEqual(staged.pendingDiseaseTrinketAction);
    expect(openId(replay)).toBe(opportunityId);
    const once = resolveDiseaseTrinketOpportunity(replay, opportunityId, 'use').campaign;
    const afterUse = restoreSaveSnapshot(createSaveSnapshot(once));
    expect(afterUse.pendingDiseaseTrinketAction).toBeNull();
    expect(afterUse.processedDiseaseEventIds.filter((id) => id === 'disease-1')).toHaveLength(1);
    expect(afterUse.diseaseAcquisitionRecords.filter((record) => record.sourceEventId === 'disease-1')).toHaveLength(1);
  });

  it('decline commits the original acquisition exactly once', () => {
    const staged = begin(fixture()).campaign;
    const declined = resolveDiseaseTrinketOpportunity(staged, openId(staged), 'decline').campaign;
    expect(declined.heroes[0].disease?.diseaseId).toBe('black-plague');
    expect(declined.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
    expect(declined.diseaseAcquisitionRecords.filter((record) => record.sourceEventId === 'disease-1')).toHaveLength(1);
    const replay = restoreSaveSnapshot(createSaveSnapshot(declined));
    expect(replay.pendingDiseaseTrinketAction).toBeNull();
  });

  it('does not offer the Book for duplicate, invalid, or dead-hero acquisitions', () => {
    let duplicate = fixture();
    duplicate = acquireDisease(duplicate, {
      heroId: duplicate.heroes[0].instanceId, diseaseId: 'black-plague', source: 'debug', sourceEventId: 'existing',
    }).campaign;
    duplicate = begin(duplicate, 'black-plague', 'duplicate').campaign;
    expect(duplicate.pendingDiseaseTrinketAction).toBeNull();
    expect(duplicate.lastDiseaseAcquisition?.outcome).toBe('duplicate-discarded');

    const invalid = begin(fixture(), 'not-a-disease', 'invalid').campaign;
    expect(invalid.pendingDiseaseTrinketAction).toBeNull();
    expect(invalid.lastDiseaseAcquisition?.outcome).toBe('discarded-invalid');

    const alive = fixture();
    const dead = { ...alive, heroes: alive.heroes.map((hero, index) => index === 0
      ? { ...hero, dead: true, isAlive: false } : hero) };
    const discarded = begin(dead, 'black-plague', 'dead').campaign;
    expect(discarded.pendingDiseaseTrinketAction).toBeNull();
    expect(discarded.lastDiseaseAcquisition?.outcome).toBe('discarded-dead-hero');
  });

  it('supports physical copies but consumes the root transaction only once', () => {
    const staged = begin(fixture(2)).campaign;
    expect(staged.pendingTrinketUseOpportunities.filter((entry) => entry.status === 'open')).toHaveLength(2);
    const resolved = resolveDiseaseTrinketOpportunity(staged, openId(staged), 'use').campaign;
    expect(resolved.pendingTrinketUseOpportunities.filter((entry) => entry.rootEventId === 'disease-acquisition:disease-1')).toHaveLength(0);
    expect(resolved.heroes[0].equippedTrinkets.filter((entry) => entry.currentSide === 'negative')).toHaveLength(1);
  });

  it('fails closed when a restored pending action is stale', () => {
    const staged = begin(fixture()).campaign;
    const stale = { ...staged, heroes: staged.heroes.map((hero, index) => index === 0
      ? { ...hero, dead: true, isAlive: false } : hero) };
    const restored = restoreSaveSnapshot(createSaveSnapshot(stale));
    expect(restored.pendingDiseaseTrinketAction).toBeNull();
    expect(restored.pendingTrinketUseOpportunities.some((entry) => entry.rootEventId === 'disease-acquisition:disease-1')).toBe(false);
  });
});
