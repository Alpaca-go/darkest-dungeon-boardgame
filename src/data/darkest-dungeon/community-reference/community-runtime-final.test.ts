import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../../../types';
import { createCommunityCheckpoint } from '../../../testing/scenarios/community-runtime-scenario';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { getFinalEncounterRoom, getFinalFormPool } from '../final-form-registry';
import { getAncestorFirstFormMechanics } from '../final-encounter';
import { sanitizeFinalFormRuntimeState, setupFinalFormRuntime } from '../../../game-engine/campaign/act-four/final-forms/final-form-runtime';
import { applyFinalFormWoundedReaction, performFinalFormComeUntoYourMaker, rollFinalFormAncestorTeleport } from '../../../game-engine/campaign/act-four/final-forms/final-form-actions';

function finalReady(): CampaignState {
  const campaign = createCommunityCheckpoint();
  return { ...campaign, actFourState: { ...campaign.actFourState, stage: 'final-encounter-ready', skippedFinalFormId: 'ancestor-first-form', finalHamletState: { status: 'completed', totalDays: 4, currentDay: 4, drawHamletEvent: false, completedHeroIdsByDay: {}, buildingUsageByDay: {}, completedDayTransactionIds: [], lastTransactionId: null } } };
}
function withForm(formId: 'ancestor-second-form' | 'gestating-heart' | 'heart-of-darkness', encounterId: string): CampaignState {
  const setup = setupFinalFormRuntime(null, encounterId, formId, { mode: 'community-reference', rng: () => 0 });
  if (!setup.ok) throw new Error(setup.reason ?? 'form setup failed');
  const campaign = createCommunityCheckpoint();
  return { ...campaign, actFourState: { ...campaign.actFourState, finalFormRuntimeState: setup.state } };
}

describe('Community Final Encounter acceptance', () => {
  it('F01 requires Final Hamlet completion', () => expect(prepareFinalEncounter(createCommunityCheckpoint(), { mode: 'community-reference' }).reason).toContain('不能准备'));
  it('F02 Final Provision blocks before RNG', () => expect(() => prepareFinalEncounter(finalReady(), { mode: 'community-reference', rng: () => { throw new Error('RNG consumed'); } })).not.toThrow());
  it('F03 Final Provision blocks before mutation', () => { const campaign = finalReady(); const before = structuredClone(campaign); expect(prepareFinalEncounter(campaign, { mode: 'community-reference', rng: () => 0 })).toMatchObject({ campaign: before, blocker: { code: 'FINAL_PROVISION_POLICY_UNRESOLVED' } }); });
  it('F04 Community Final Room has source provenance', () => expect(getFinalEncounterRoom('community-reference')).toMatchObject({ id: 'community-dd-final-encounter-room', formAreaId: 'r12-C', officialDataStatus: 'partial' }));
  it('F05 skipped Form is preserved', () => expect(finalReady().actFourState.skippedFinalFormId).toBe('ancestor-first-form'));
  it('F06 Heart cannot be skipped', () => expect(getFinalFormPool('community-reference').find((form) => form.formId === 'heart-of-darkness')?.skippable).toBe(false));
  it('F07 Ancestor first confirmed mechanics trace', () => { const mechanics = getAncestorFirstFormMechanics('community-reference'); expect(mechanics.fullStanceSkillEffect).toEqual({ heal: 10, target: 'Most Wounded Monster', range: 1, trigger: 'During Ancestor turn when all Monster Stances are occupied' }); expect(mechanics.vacantStanceD10Map?.[1]).toBe('perfect'); expect(mechanics.vacantStanceD10Map?.[10]).toBe('imperfect'); });
  it('F08 Reflection trace', () => expect(getAncestorFirstFormMechanics('community-reference').reflectionCards.map((card) => [card.kind, card.maxWounds, card.skillIds.length])).toEqual([['perfect',24,2],['imperfect',19,2]]));
  it('F09 Ancestor second reaches Nothingness blocker without RNG', () => expect(rollFinalFormAncestorTeleport(withForm('ancestor-second-form', 'f09'), 1, { mode: 'community-reference', rng: () => { throw new Error('RNG consumed'); } })).toMatchObject({ blocker: { code: 'ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED' } }));
  it('F10 Gestating Heart reaches lethal timing blocker', () => expect(applyFinalFormWoundedReaction(withForm('gestating-heart', 'f10'), 1, { sourceHeroId: 'hero', woundsApplied: 1, lethal: true }, { mode: 'community-reference' })).toMatchObject({ blocker: { code: 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED' } }));
  it('F11 Heart reaches Come Unto Your Maker blocker', () => expect(performFinalFormComeUntoYourMaker(withForm('heart-of-darkness', 'f11'), { mode: 'community-reference' })).toMatchObject({ blocker: { code: 'COME_UNTO_YOUR_MAKER_UNRESOLVED' } }));
  it('F12 save restore preserves all form runtimes and blockers', () => { const setupIds = ['ancestor-first-form','ancestor-second-form','gestating-heart','heart-of-darkness'] as const; for (const formId of setupIds) { const setup = setupFinalFormRuntime(null, `f12-${formId}`, formId, { mode: 'community-reference', rng: () => 0.4 }); const restored = sanitizeFinalFormRuntimeState(JSON.parse(JSON.stringify(setup.state))); expect(restored?.contentMode).toBe('community-reference'); expect(restored?.runtimes[formId]).toEqual(setup.runtime); } });
});
