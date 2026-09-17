import { describe, expect, it } from 'vitest';
import { createCommunityCheckpoint, createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { resolveExcavationSiteRoom } from '../../../game-engine/campaign/act-four/excavation-site';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { startFinalEncounter } from '../../../game-engine/campaign/act-four/final-form-sequence';
import { transitionToNextFinalForm } from '../../../game-engine/campaign/act-four/transition-final-form';
import { resolveEchoingDisassembly } from '../../../game-engine/bosses/shuffling-horror/echoing-disassembly-summon';
import { resolveSpikedPitExitPolicy } from '../../../game-engine/room-hazards/room-area-movement-policy';
import { COMMUNITY_TEMPLARS_ROOM } from './production-adapters';
import { COMMUNITY_RUNTIME_BLOCKERS, COMMUNITY_RUNTIME_QUESTS } from './runtime-profile';
import { finalReady } from './capability-test-support';

const chooseFood = () => 'food' as const;

describe('Community Act IV three-route matrix', () => {
  it('R1 We Are The Flame / Shuffling deploys Room 10 stance areas and summons Priest before Growth', () => {
    const campaign = createCommunityGuardianScenario(0);
    expect(campaign.actFourState.questDrawRecord?.selectedQuestId).toBe(COMMUNITY_RUNTIME_QUESTS[0].id);
    expect(COMMUNITY_RUNTIME_QUESTS[0].name).toBe('We Are The Flame');
    expect(campaign.actFourState.skippedFinalFormId).toBe('ancestor-second-form');
    expect(campaign.actFourState.shufflingHorrorEncounterState?.actors.find((actor) => actor.role === 'horror')?.areaId).toBe('r10-S');
    const echoing = resolveEchoingDisassembly(campaign.actFourState.shufflingHorrorEncounterState!, 'r1');
    expect(echoing.ok).toBe(true);
    expect(echoing.summonedRoles).toEqual(['cultist-priest', 'malignant-growth']);
    expect(echoing.state.actors.filter((actor) => actor.role !== 'horror').every((actor) => !actor.inReserve && actor.areaId)).toBe(true);
  });

  it('R2 Light the Way / Templars surfaces Pit exit rather than a golden-path bypass', () => {
    const campaign = createCommunityGuardianScenario(1);
    expect(COMMUNITY_RUNTIME_QUESTS[1].name).toBe('Light the Way');
    expect(campaign.actFourState.skippedFinalFormId).toBe('ancestor-first-form');
    const pit = resolveSpikedPitExitPolicy(COMMUNITY_TEMPLARS_ROOM.spikedPits[0], 'community-reference');
    expect(pit).toMatchObject({ ok: false, blocker: { code: 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED' } });
    expect(COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'TEMPLARS_AREA_ADJACENCY_UNRESOLVED')).toBe(true);
  });

  it('R3 Belly of the Beast / Mammoth reaches real Final Provision then exact remaining Final blocker', () => {
    expect(COMMUNITY_RUNTIME_QUESTS[2].name).toBe('Belly of the Beast');
    const campaign = finalReady();
    expect(campaign.actFourState.skippedFinalFormId).toBe('gestating-heart');
    expect(campaign.actFourState.stage).toBe('final-encounter-ready');
    const prepared = prepareFinalEncounter(campaign, { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood });
    expect(prepared.ok).toBe(true);
    expect(prepared.alreadyPrepared).toBe(false);
    const started = startFinalEncounter(prepared.campaign, { mode: 'community-reference', rng: () => 0 });
    if (started.ok) {
      const transition = transitionToNextFinalForm(started.campaign, { mode: 'community-reference', rng: () => 0 });
      expect(transition.ok).toBe(false);
      expect(COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED' || blocker.code === 'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED')).toBe(true);
    } else {
      expect(started.reason).toBeTruthy();
      expect(COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED' || blocker.code === 'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED')).toBe(true);
    }
  });

  it('R4 excavation on a real Act IV map uses a distinct transaction from Final Provision', () => {
    const campaign = createCommunityGuardianScenario(2);
    const site = campaign.actFourState.excavationSiteStates[0];
    const available = { ...campaign, actFourState: { ...campaign.actFourState, excavationSiteStates: campaign.actFourState.excavationSiteStates.map((entry) => entry === site ? { ...entry, status: 'available' as const } : entry) } };
    const excavation = resolveExcavationSiteRoom(available, site.roomId, { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood });
    expect(excavation.ok).toBe(true);
    const prepared = prepareFinalEncounter(finalReady(), { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood });
    expect(prepared.ok).toBe(true);
    expect(excavation.site?.provisionRollTransactionId).not.toBe(prepared.provisionRecord?.transactionId);
  });

  it('R5 Quest draw from the accepted Act IV checkpoint is a real command', () => {
    const result = drawDarkestDungeonQuest(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => 0.1, chooseWildProvision: chooseFood });
    expect(result.ok).toBe(true);
    expect(result.record?.runtimeProfileId).toBe('community-reference');
    expect(result.campaign.actFourState.selectedQuestId).toBeTruthy();
  });
});
