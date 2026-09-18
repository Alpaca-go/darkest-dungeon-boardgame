import { describe, expect, it } from 'vitest';
import { createCommunityCheckpoint, createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { resolveExcavationSiteRoom } from '../../../game-engine/campaign/act-four/excavation-site';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { resolveEchoingDisassembly } from '../../../game-engine/bosses/shuffling-horror/echoing-disassembly-summon';
import { resolveSpikedPitExitPolicy } from '../../../game-engine/room-hazards/room-area-movement-policy';
import { COMMUNITY_TEMPLARS_ROOM } from './production-adapters';
import { COMMUNITY_RUNTIME_BLOCKERS, COMMUNITY_RUNTIME_QUESTS } from './runtime-profile';
import {
  beginCommunityFinalEncounter,
  driveCommunityFinalUntil,
} from './capability-test-support';
import { communityFinalFormUnit, runCommunityFinalFormTurn } from '../../../game-engine/campaign/act-four/community-final-combat';
import { transitionToNextFinalForm } from '../../../game-engine/campaign/act-four/transition-final-form';

const chooseFood = () => 'food' as const;

describe('Community Act IV three-route matrix', () => {
  it('R1 We Are The Flame reaches first Final Form through Guardian victory then a real transition', () => {
    const campaign = createCommunityGuardianScenario(0);
    expect(campaign.actFourState.questDrawRecord?.selectedQuestId).toBe(COMMUNITY_RUNTIME_QUESTS[0].id);
    expect(COMMUNITY_RUNTIME_QUESTS[0].name).toBe('We Are The Flame');
    expect(campaign.actFourState.skippedFinalFormId).toBe('ancestor-second-form');
    expect(campaign.actFourState.shufflingHorrorEncounterState?.actors.find((actor) => actor.role === 'horror')?.areaId).toBe('r10-S');
    const echoing = resolveEchoingDisassembly(campaign.actFourState.shufflingHorrorEncounterState!, 'r1');
    expect(echoing.ok).toBe(true);
    expect(echoing.summonedRoles).toEqual(['cultist-priest', 'malignant-growth']);
    const started = beginCommunityFinalEncounter(0);
    expect(started.actFourState.finalEncounterState?.orderedFormIds[0]).toBe('ancestor-first-form');
    const form = communityFinalFormUnit(started.battle!, 'ancestor-first-form')!;
    const acted = runCommunityFinalFormTurn(started, form.id);
    expect(acted.ok).toBe(true);
    const defeated = driveCommunityFinalUntil(acted.campaign, (state) => state.actFourState.finalEncounterState?.status === 'transitioning');
    const transition = transitionToNextFinalForm(defeated, { mode: 'community-reference', rng: () => 0.2 });
    expect(transition.ok, transition.reason ?? '').toBe(true);
    expect(transition.campaign.actFourState.finalEncounterState?.activeFormId).toBe('gestating-heart');
  });

  it('R2 Light the Way / Templars surfaces Pit exit then still reaches skipped-first-form Final runtime', () => {
    const campaign = createCommunityGuardianScenario(1);
    expect(COMMUNITY_RUNTIME_QUESTS[1].name).toBe('Light the Way');
    expect(campaign.actFourState.skippedFinalFormId).toBe('ancestor-first-form');
    const pit = resolveSpikedPitExitPolicy(COMMUNITY_TEMPLARS_ROOM.spikedPits[0], 'community-reference');
    expect(pit).toMatchObject({ ok: false, blocker: { code: 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED' } });
    expect(COMMUNITY_TEMPLARS_ROOM.areaGraph.edges.length).toBeGreaterThan(0);
    expect(COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'TEMPLARS_AREA_ADJACENCY_UNRESOLVED')).toBe(false);
    const started = beginCommunityFinalEncounter(1);
    expect(started.actFourState.finalEncounterState?.orderedFormIds[0]).toBe('ancestor-second-form');
    const acted = runCommunityFinalFormTurn(started, communityFinalFormUnit(started.battle!, 'ancestor-second-form')!.id);
    expect(acted.ok).toBe(true);
  });

  it('R3 Belly of the Beast reaches real Final Provision then Ancestor First actions and transition', () => {
    expect(COMMUNITY_RUNTIME_QUESTS[2].name).toBe('Belly of the Beast');
    const started = beginCommunityFinalEncounter(2);
    expect(started.actFourState.skippedFinalFormId).toBe('gestating-heart');
    expect(started.actFourState.finalEncounterState?.orderedFormIds[0]).toBe('ancestor-first-form');
    const acted = runCommunityFinalFormTurn(started, communityFinalFormUnit(started.battle!, 'ancestor-first-form')!.id);
    expect(acted.ok).toBe(true);
    const defeated = driveCommunityFinalUntil(acted.campaign, (state) => state.actFourState.finalEncounterState?.status === 'transitioning');
    const transition = transitionToNextFinalForm(defeated, { mode: 'community-reference', rng: () => 0.2 });
    expect(transition.ok, transition.reason ?? '').toBe(true);
    expect(transition.campaign.actFourState.finalEncounterState?.activeFormId).toBe('ancestor-second-form');
  });

  it('R4 excavation on a real Act IV map uses a distinct transaction from Final Provision', () => {
    const campaign = createCommunityGuardianScenario(2);
    const site = campaign.actFourState.excavationSiteStates[0];
    const available = { ...campaign, actFourState: { ...campaign.actFourState, excavationSiteStates: campaign.actFourState.excavationSiteStates.map((entry) => entry === site ? { ...entry, status: 'available' as const } : entry) } };
    const excavation = resolveExcavationSiteRoom(available, site.roomId, { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood });
    expect(excavation.ok).toBe(true);
    const started = beginCommunityFinalEncounter(2);
    const prepared = prepareFinalEncounter(started, { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood });
    expect(prepared.alreadyPrepared).toBe(true);
    expect(excavation.site?.provisionRollTransactionId).not.toBe(prepared.provisionRecord?.transactionId);
  });

  it('R5 Quest draw from the accepted Act IV checkpoint is a real command', () => {
    const result = drawDarkestDungeonQuest(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => 0.1, chooseWildProvision: chooseFood });
    expect(result.ok).toBe(true);
    expect(result.record?.runtimeProfileId).toBe('community-reference');
    expect(result.campaign.actFourState.selectedQuestId).toBeTruthy();
  });
});
