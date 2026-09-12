import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useGameStore } from '../../store/useGameStore';
import { createCommunityGuardianScenario } from '../../testing/scenarios/community-runtime-scenario';
import DarkestDungeonQuestReveal from './DarkestDungeonQuestReveal';
import TemplarsEncounterPanel from './TemplarsEncounterPanel';
import MammothCystEncounterPanel from './MammothCystEncounterPanel';
import ShufflingHorrorEncounterPanel from './ShufflingHorrorEncounterPanel';
import FinalFormMechanicsPanel from './FinalFormMechanicsPanel';

const hasCommunityArt = (html: string) => html.includes('data-cv-status="ready"');

describe('product-level Community visual profile isolation', () => {
  it.each(['prototype', 'formal'] as const)('P01/P02 Quest reveal in %s does not render Community art', (profileId) => {
    const campaign = createCommunityGuardianScenario(0);
    if (!campaign.actFourState.questDrawRecord) throw new Error('missing quest draw record');
    campaign.actFourState.questDrawRecord.runtimeProfileId = profileId;
    useGameStore.getState().replaceCampaign(campaign);
    expect(hasCommunityArt(renderToStaticMarkup(<DarkestDungeonQuestReveal />))).toBe(false);
  });

  it('P03 Prototype Templars panel does not render Community art', () => {
    const state = createCommunityGuardianScenario(1).actFourState.templarsEncounterState;
    expect(hasCommunityArt(renderToStaticMarkup(<TemplarsEncounterPanel state={state} profileId="prototype" />))).toBe(false);
  });

  it('P04 Prototype Mammoth panel does not render Community art', () => {
    const state = createCommunityGuardianScenario(2).actFourState.mammothCystEncounterState;
    expect(hasCommunityArt(renderToStaticMarkup(<MammothCystEncounterPanel state={state} profileId="prototype" />))).toBe(false);
  });

  it('P05 Prototype Shuffling panel does not render Community art', () => {
    const state = createCommunityGuardianScenario(0).actFourState.shufflingHorrorEncounterState;
    if (!state) throw new Error('missing shuffling state');
    expect(hasCommunityArt(renderToStaticMarkup(<ShufflingHorrorEncounterPanel state={{ ...state, mode: 'prototype' }} />))).toBe(false);
  });

  it('P06 non-Community Final panel does not render Community art', () => {
    const state = {
      contentMode: 'prototype', dataStatus: 'PROTOTYPE', activeFormId: 'ancestor-first-form',
      runtimes: { 'ancestor-first-form': { kind: 'ancestor-first-form', initiativeCardCount: 4, reflections: [], imperfectDeathReactionApplied: false, lastStanceResolution: null } },
    } as never;
    expect(hasCommunityArt(renderToStaticMarkup(<FinalFormMechanicsPanel state={state} />))).toBe(false);
  });

  it('P07 every product CommunityVisual callsite passes profileId', () => {
    const files = ['DarkestDungeonQuestReveal.tsx', 'TemplarsEncounterPanel.tsx', 'MammothCystEncounterPanel.tsx', 'ShufflingHorrorEncounterPanel.tsx', 'FinalFormMechanicsPanel.tsx'];
    for (const file of files) {
      const source = readFileSync(resolve('src/components/darkest-dungeon', file), 'utf8');
      for (const call of source.matchAll(/<CommunityVisual\b([\s\S]*?)\/>/g)) expect(call[1], file).toContain('profileId=');
    }
  });

  it('Community profile renders art in the real Templars product panel', () => {
    const state = createCommunityGuardianScenario(1).actFourState.templarsEncounterState;
    expect(hasCommunityArt(renderToStaticMarkup(<TemplarsEncounterPanel state={state} profileId="community-reference" />))).toBe(true);
  });
});
