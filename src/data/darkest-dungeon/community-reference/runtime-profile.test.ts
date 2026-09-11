import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../../../types';
import { createNewCampaign, selectParty } from '../../../game-engine/campaign';
import { completePostThirdThreatHamlet, unlockDarkestDungeonAct } from '../../../game-engine/campaign/act-four/unlock-act-four';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { activateDarkestDungeonContentSet, drawDarkestDungeonMonster } from '../../../game-engine/campaign/act-four/content-runtime';
import { buildDarkestDungeonMap, drawDarkestDungeonLayout } from '../../../game-engine/campaign/act-four/dungeon-map';
import { createGuardianQuest, startGuardianBattle } from '../../../game-engine/campaign/act-four/guardian-quest';
import { resolveExcavationSiteRoom } from '../../../game-engine/campaign/act-four/excavation-site';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { setupFinalFormRuntime } from '../../../game-engine/campaign/act-four/final-forms/final-form-runtime';
import { applyFinalFormWoundedReaction, performFinalFormComeUntoYourMaker, rollFinalFormAncestorTeleport } from '../../../game-engine/campaign/act-four/final-forms/final-form-actions';
import { resolveSpikedPitExitPolicy } from '../../../game-engine/room-hazards/room-area-movement-policy';
import { getFinalEncounterRoom } from '../final-form-registry';
import { COMMUNITY_TEMPLARS_ROOM } from './production-adapters';
import { sanitizeActFourState } from '../../../game-engine/campaign/act-four/act-four-state';
import { OFFICIAL_DARKEST_DUNGEON_QUESTS, PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS, getDarkestDungeonQuestPool } from '../quest-registry';
import { OFFICIAL_DARKEST_DUNGEON_LAYOUTS, PROTOTYPE_DARKEST_DUNGEON_LAYOUT_IDS, getDarkestDungeonLayoutPool, validateDarkestDungeonLayout } from '../layout-registry';
import { OFFICIAL_DARKEST_DUNGEON_GUARDIANS, getDarkestDungeonGuardianPool } from '../guardian-registry';
import { OFFICIAL_FINAL_FORMS, PROTOTYPE_FINAL_FORMS, getFinalFormPool } from '../final-form-registry';
import { COMMUNITY_DATASET } from './data';
import {
  COMMUNITY_REFERENCE_CONTENT_HASH,
  COMMUNITY_REFERENCE_RUNTIME_PROFILE,
  COMMUNITY_REFERENCE_SOURCE_SHA256,
  COMMUNITY_RUNTIME_BLOCKERS,
  blockCommunityOperation,
  computeCommunityReferenceContentHash,
  drawCommunityMonster,
  validateCommunityRuntimeProfile,
  validateCommunitySetupSnapshot,
} from './runtime-profile';

const HERO_IDS = ['crusader', 'vestal', 'highwayman', 'hellion'];
const PROFILE = 'community-reference' as const;

function baseCampaign(): CampaignState {
  let campaign = selectParty(createNewCampaign(), HERO_IDS);
  campaign = { ...campaign, campaignProgress: { ...campaign.campaignProgress, defeatedBossFamilyIds: ['necromancer', 'prophet', 'collector'] } };
  campaign = unlockDarkestDungeonAct(campaign, { now: '2026-09-11T00:00:00.000Z' }).campaign;
  return completePostThirdThreatHamlet(campaign, { now: '2026-09-11T00:00:01.000Z' }).campaign;
}

function productionSetup(questIndex: number, layoutIndex: number): CampaignState {
  let campaign = baseCampaign();
  const quest = drawDarkestDungeonQuest(campaign, { mode: PROFILE, rng: () => (questIndex + 0.1) / 3, now: '2026-09-11T00:00:02.000Z' });
  expect(quest.ok).toBe(true);
  campaign = quest.campaign;
  const content = activateDarkestDungeonContentSet(campaign, { mode: PROFILE, now: '2026-09-11T00:00:03.000Z' });
  expect(content.ok).toBe(true);
  campaign = content.campaign;
  const layout = drawDarkestDungeonLayout(campaign, { mode: PROFILE, rng: () => (layoutIndex + 0.1) / 2, now: '2026-09-11T00:00:04.000Z' });
  expect(layout.ok).toBe(true);
  campaign = layout.campaign;
  const map = buildDarkestDungeonMap(campaign, { mode: PROFILE, rng: () => 0.314159, now: '2026-09-11T00:00:05.000Z' });
  expect(map.ok).toBe(true);
  return map.campaign;
}

function cloneProfile(): typeof COMMUNITY_REFERENCE_RUNTIME_PROFILE {
  return structuredClone(COMMUNITY_REFERENCE_RUNTIME_PROFILE) as typeof COMMUNITY_REFERENCE_RUNTIME_PROFILE;
}

describe('Community Reference Runtime Profile positive contract', () => {
  it('P01 loads from the accepted corpus', () => {
    expect(validateCommunityRuntimeProfile()).toEqual([]);
    expect(COMMUNITY_REFERENCE_SOURCE_SHA256).toBe(COMMUNITY_DATASET.corpus.sourcePackageSha256);
    expect(COMMUNITY_DATASET.bindings).toHaveLength(300);
    expect(COMMUNITY_REFERENCE_RUNTIME_PROFILE.quests.map((item) => item.name)).toEqual(COMMUNITY_DATASET.quests.map((item) => item.fields.name.value));
    expect(COMMUNITY_REFERENCE_RUNTIME_PROFILE.layouts.map((item) => item.id.replace('community-dd-layout-', ''))).toEqual((COMMUNITY_DATASET.dungeonTiles[0].fields.tileGeometry.value as Array<{ sourceTileGuid: string }>).map((item) => item.sourceTileGuid));
  });
  it('P02 exposes exactly the three printed Quest names', () => expect(getDarkestDungeonQuestPool(PROFILE).map((quest) => quest.name)).toEqual(['We Are The Flame', 'Light the Way', 'Belly of the Beast']));
  it('P03 maps every Quest to its accepted Guardian', () => expect(getDarkestDungeonQuestPool(PROFILE).map((quest) => quest.guardianDefinitionId)).toEqual(['community-dd-guardian-family-shuffling-horror', 'community-dd-guardian-family-templars', 'community-dd-guardian-family-mammoth-cyst']));
  it('P04 persists the accepted skipped Final Form mapping', () => expect(getDarkestDungeonQuestPool(PROFILE).map((quest) => quest.skippedFinalFormId)).toEqual(['ancestor-second-form', 'ancestor-first-form', 'gestating-heart']));
  it('P05 Quest draw is deterministic and replay-stable', () => { const first = drawDarkestDungeonQuest(baseCampaign(), { mode: PROFILE, rng: () => 0.7 }); const replay = drawDarkestDungeonQuest(first.campaign, { mode: PROFILE, rng: () => 0 }); expect(replay.record).toEqual(first.record); expect(replay.alreadyDrawn).toBe(true); });
  it('P06 loads two graph-valid Community layouts', () => { const layouts = getDarkestDungeonLayoutPool(PROFILE); expect(layouts).toHaveLength(2); expect(layouts.every((layout) => validateDarkestDungeonLayout(layout).isComplete)).toBe(true); });
  it('P07 snapshots the Community profile through content activation', () => { const campaign = productionSetup(0, 0); expect(campaign.actFourState.contentRuntime).toMatchObject({ runtimeProfileId: PROFILE, contentHash: COMMUNITY_REFERENCE_CONTENT_HASH }); });
  it('P08 makes all seven Guardian actors reachable through Community family IDs', () => { const families = getDarkestDungeonGuardianPool(PROFILE); expect(families.flatMap((family) => family.actorDefinitionIds)).toHaveLength(7); expect(families.flatMap((family) => family.actorDefinitionIds).every((id) => COMMUNITY_REFERENCE_RUNTIME_PROFILE.guardianActors.some((actor) => actor.id === id))).toBe(true); });
  it('P09 exposes confirmed Mammoth Cyst mappings', () => { const actor = COMMUNITY_REFERENCE_RUNTIME_PROFILE.guardianActors.find((item) => item.requirementId === 'tierB-mammoth-cyst'); expect(actor?.fields.maxHp.value).toBeTypeOf('number'); expect(actor?.fields.skillIds.value).toBeTruthy(); });
  it('P10 exposes confirmed Shuffling Horror action mappings', () => { const actor = COMMUNITY_REFERENCE_RUNTIME_PROFILE.guardianActors.find((item) => item.requirementId === 'tierB-shuffling-horror'); expect(actor?.fields.d10SkillTable.value).toBeTruthy(); expect(actor?.fields.skillIds.value).toBeTruthy(); });
  it('P11 keeps the fixed Final Encounter form order', () => expect(getFinalFormPool(PROFILE).map((form) => form.formId)).toEqual(['ancestor-first-form', 'ancestor-second-form', 'gestating-heart', 'heart-of-darkness']));
  it('P12 never permits Heart of Darkness to be skipped', () => expect(getFinalFormPool(PROFILE).find((form) => form.formId === 'heart-of-darkness')?.skippable).toBe(false));
  it('P13 exposes 26 physical / 9 logical Monsters', () => { expect(COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition).toHaveLength(9); expect(COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition.reduce((total, item) => total + item.physicalInstances.length, 0)).toBe(26); });
  it('P14 preserves the source-pinned hash through save/restore', () => { const campaign = productionSetup(1, 1); const restored = sanitizeActFourState(JSON.parse(JSON.stringify(campaign.actFourState))); expect(restored.contentRuntime?.contentHash).toBe(COMMUNITY_REFERENCE_CONTENT_HASH); expect(restored.contentRuntime?.runtimeProfileId).toBe(PROFILE); });
  it('P15 leaves Prototype pools byte-for-byte compatible', () => { expect(getDarkestDungeonQuestPool('prototype').map((item) => item.id)).toEqual(PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS); expect(getDarkestDungeonLayoutPool('prototype').map((item) => item.id)).toEqual(PROTOTYPE_DARKEST_DUNGEON_LAYOUT_IDS); expect(getFinalFormPool('prototype')).toEqual(PROTOTYPE_FINAL_FORMS); });
  it('P16 leaves Formal Quest draw blocked', () => expect(drawDarkestDungeonQuest(baseCampaign(), { mode: 'formal', rng: () => 0 }).ok).toBe(false));
});

describe('Community Reference Runtime Profile adversarial contract', () => {
  it('N01 rejects a Community Quest inserted into the official pool', () => { const profile = cloneProfile(); (profile.quests[0] as { enabledInOfficialPool: boolean }).enabledInOfficialPool = true; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
  it('N02 rejects an official-enabled Community Guardian', () => { const profile = cloneProfile(); (profile.guardianFamilies[0] as { enabledInOfficialPool: boolean }).enabledInOfficialPool = true; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
  it('N03 rejects a Community Final Form masquerading as official verified', () => { const profile = cloneProfile(); (profile.finalForms[0] as { officialDataStatus: string }).officialDataStatus = 'verified'; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
  it('N04 rejects a guessed Templars pit-exit rule', () => { const profile = cloneProfile(); profile.unresolvedRules.TEMPLARS_PIT_EXIT_RULE_UNRESOLVED = 'generic movement'; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
  it('N05 rejects a default Absolute Nothingness stance', () => { const profile = cloneProfile(); profile.unresolvedRules.ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED = 'defensive'; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
  it('N06 rejects guessed Gestating Heart lethal timing', () => { const profile = cloneProfile(); profile.unresolvedRules.GESTATING_HEART_LETHAL_TIMING_UNRESOLVED = 'immediate'; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
  it('N07 rejects a videogame Come Unto Your Maker definition', () => { const profile = cloneProfile(); profile.unresolvedRules.COME_UNTO_YOUR_MAKER_UNRESOLVED = { source: 'videogame' }; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
  it('N08 rejects treating saved DeckIDs order as draw policy', () => { const profile = cloneProfile(); profile.unresolvedRules.MONSTER_DECK_DRAW_POLICY_UNRESOLVED = 'saved DeckIDs order'; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
  it('N09 rejects Prototype Monster policy fallback', () => { const profile = cloneProfile(); (profile.capabilities.monsterDeck as { randomDraw: string }).randomDraw = 'prototype'; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
  it('N10 prevents Quest redraw after reload', () => { const campaign = productionSetup(2, 0); const replay = drawDarkestDungeonQuest({ ...campaign, actFourState: sanitizeActFourState(JSON.parse(JSON.stringify(campaign.actFourState))) }, { mode: PROFILE, rng: () => 0 }); expect(replay.record).toEqual(campaign.actFourState.questDrawRecord); });
  it('N11 prevents skipped Final Form rerandomization', () => { const campaign = productionSetup(1, 0); const replay = drawDarkestDungeonQuest(campaign, { mode: PROFILE, rng: () => 0.99 }); expect(replay.record?.skippedFinalFormId).toBe('ancestor-first-form'); });
  it('N12 prevents a Community save reloading as Prototype', () => { const original = productionSetup(0, 1); const restored = sanitizeActFourState(JSON.parse(JSON.stringify(original.actFourState))); expect(validateCommunitySetupSnapshot(restored)).toEqual([]); const replay = drawDarkestDungeonQuest({ ...original, actFourState: restored }, { rng: () => 0.99 }); expect(replay.quest?.id.startsWith('community-')).toBe(true); });
  it('N13 rejects a content hash that ignores source package SHA', () => { const profile = cloneProfile(); (profile as { sourcePackageSha256: string }).sourcePackageSha256 = 'different-source'; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); expect(computeCommunityReferenceContentHash('different-source')).not.toBe(COMMUNITY_REFERENCE_CONTENT_HASH); });
  it('N14 does not mutate any Official registry', () => { expect(OFFICIAL_DARKEST_DUNGEON_QUESTS.some((item) => item.id.startsWith('community-'))).toBe(false); expect(OFFICIAL_DARKEST_DUNGEON_LAYOUTS.some((item) => item.id.startsWith('community-'))).toBe(false); expect(OFFICIAL_DARKEST_DUNGEON_GUARDIANS.some((item) => item.id.startsWith('community-'))).toBe(false); expect(OFFICIAL_FINAL_FORMS.some((item) => item.id.startsWith('community-'))).toBe(false); });
  it('N15 rejects direct state injection as command-path proof', () => { const state = sanitizeActFourState({ ...baseCampaign().actFourState, selectedQuestId: COMMUNITY_REFERENCE_RUNTIME_PROFILE.quests[0].id }); expect(validateCommunitySetupSnapshot(state)).not.toEqual([]); });
  it('N16 rejects fullActFourPlayable=true while blockers remain', () => { const profile = cloneProfile(); (profile.capabilities as { fullActFourPlayable: boolean }).fullActFourPlayable = true; expect(validateCommunityRuntimeProfile(profile)).not.toEqual([]); });
});

describe('COMMUNITY RUNTIME SETUP MATRIX', () => {
  for (let questIndex = 0; questIndex < 3; questIndex += 1) {
    for (let layoutIndex = 0; layoutIndex < 2; layoutIndex += 1) {
      it(`setup ${questIndex + 1} x ${layoutIndex + 1} persists through production commands`, () => {
        const campaign = productionSetup(questIndex, layoutIndex);
        expect(validateCommunitySetupSnapshot(campaign.actFourState)).toEqual([]);
        expect(campaign.actFourState.questDrawRecord?.guardianDefinitionId).toBe(campaign.actFourState.guardianDefinitionId);
        expect(campaign.actFourState.questDrawRecord?.skippedFinalFormId).toBe(campaign.actFourState.skippedFinalFormId);
        expect(campaign.actFourState.mapState?.roomCount).toBe(16);
        const restored = sanitizeActFourState(JSON.parse(JSON.stringify(campaign.actFourState)));
        expect(restored.questDrawRecord).toEqual(campaign.actFourState.questDrawRecord);
        expect(restored.layoutDrawRecord).toEqual(campaign.actFourState.layoutDrawRecord);
        expect(restored.contentRuntime).toEqual(campaign.actFourState.contentRuntime);
      });
    }
  }
});

describe('COMMUNITY PRODUCTION-PATH MATRIX', () => {
  for (let questIndex = 0; questIndex < 3; questIndex += 1) {
    for (let layoutIndex = 0; layoutIndex < 2; layoutIndex += 1) {
      it(`production ${questIndex + 1} x ${layoutIndex + 1} enters the Community family setup`, () => {
        let campaign = productionSetup(questIndex, layoutIndex);
        const created = createGuardianQuest(campaign, { mode: PROFILE, now: '2026-09-11T00:00:06.000Z' });
        expect(created.ok).toBe(true);
        campaign = created.campaign;
        const started = startGuardianBattle(campaign, created.quest!.objectiveRoomId, { mode: PROFILE, rng: () => 0.25, now: '2026-09-11T00:00:07.000Z' });
        expect(started.ok).toBe(true);
        const family = created.guardian!.family;
        if (family === 'templars') {
          expect(started.campaign.actFourState.templarsEncounterState?.actorStates.map((actor) => actor.actorDefinitionId)).toEqual(['community-dd-templars-impaler', 'community-dd-templars-warlord']);
        } else if (family === 'mammoth-cyst') {
          expect(started.campaign.actFourState.mammothCystEncounterState?.mammothCystBattleRuntime).toMatchObject({ reserveWhiteCellStalkDefinitionId: 'community-dd-white-cell-stalk' });
        } else {
          expect(started.campaign.actFourState.shufflingHorrorEncounterState?.actors.map((actor) => actor.actorId)).toEqual(['u_community-dd-shuffling-horror', 'u_community-dd-cultist-priest', 'u_community-dd-malignant-growth']);
        }
      });
    }
  }

  it('normal-room Monster draw reaches the real blocker without mutation', () => {
    const campaign = productionSetup(0, 0);
    const before = structuredClone(campaign);
    const result = drawDarkestDungeonMonster(campaign, () => { throw new Error('RNG must not run'); });
    expect(result).toMatchObject({ ok: false, kind: 'community-source-blocked', blocker: { code: 'MONSTER_DECK_DRAW_POLICY_UNRESOLVED' } });
    expect(result.campaign).toEqual(before);
  });

  it('selects the Community Ancestor room directly', () => {
    expect(getFinalEncounterRoom(PROFILE)).toMatchObject({ id: 'community-dd-final-encounter-room', formAreaId: 'r12-C' });
  });

  it('Excavation blocks before RNG and state mutation', () => {
    const original = productionSetup(0, 0);
    const first = original.actFourState.excavationSiteStates[0];
    const campaign: CampaignState = { ...original, actFourState: { ...original.actFourState, excavationSiteStates: original.actFourState.excavationSiteStates.map((site) => site === first ? { ...site, status: 'available' as const } : site) } };
    const before = structuredClone(campaign);
    const result = resolveExcavationSiteRoom(campaign, first.roomId, { mode: PROFILE, rng: () => { throw new Error('RNG must not run'); } });
    expect(result).toMatchObject({ ok: false, kind: 'community-source-blocked', blocker: { code: 'EXCAVATION_PROVISION_DIE_MAP_UNRESOLVED' } });
    expect(result.campaign).toEqual(before);
  });

  it('Final preparation blocks at the provision boundary before mutation', () => {
    const original = baseCampaign();
    const campaign: CampaignState = { ...original, actFourState: { ...original.actFourState, stage: 'final-encounter-ready' as const, skippedFinalFormId: 'ancestor-first-form' as const, finalHamletState: { status: 'completed' as const, totalDays: 4 as const, currentDay: 4 as const, drawHamletEvent: false as const, completedHeroIdsByDay: {}, buildingUsageByDay: {}, completedDayTransactionIds: [], lastTransactionId: null } } };
    const before = structuredClone(campaign);
    const result = prepareFinalEncounter(campaign, { mode: PROFILE, rng: () => { throw new Error('RNG must not run'); } });
    expect(result).toMatchObject({ ok: false, kind: 'community-source-blocked', blocker: { code: 'FINAL_PROVISION_POLICY_UNRESOLVED' } });
    expect(result.campaign).toEqual(before);
  });

  it('Templars reaches the real pit-exit blocker only when exit is requested', () => {
    const result = resolveSpikedPitExitPolicy(COMMUNITY_TEMPLARS_ROOM.spikedPits[0], PROFILE);
    expect(result).toMatchObject({ ok: false, kind: 'community-source-blocked', blocker: { code: 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED' } });
  });

  it('Final forms initialize confirmed Community data and block at actual unknown semantics', () => {
    const a1 = setupFinalFormRuntime(null, 'enc-a1', 'ancestor-first-form', { mode: PROFILE, rng: () => 0 });
    expect(a1.ok).toBe(true);
    expect(a1.runtime?.kind).toBe('ancestor-first-form');

    const makeCampaign = (formId: 'ancestor-second-form' | 'gestating-heart' | 'heart-of-darkness', encounterId: string) => {
      const setup = setupFinalFormRuntime(null, encounterId, formId, { mode: PROFILE, rng: () => 0 });
      expect(setup.ok).toBe(true);
      const campaign = baseCampaign();
      return { ...campaign, actFourState: { ...campaign.actFourState, finalFormRuntimeState: setup.state } };
    };
    expect(rollFinalFormAncestorTeleport(makeCampaign('ancestor-second-form', 'enc-a2'), 1, { mode: PROFILE, rng: () => { throw new Error('RNG must not run'); } })).toMatchObject({ kind: 'community-source-blocked', blocker: { code: 'ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED' } });
    expect(applyFinalFormWoundedReaction(makeCampaign('gestating-heart', 'enc-gh'), 1, { sourceHeroId: 'hero', woundsApplied: 1, lethal: true }, { mode: PROFILE })).toMatchObject({ kind: 'community-source-blocked', blocker: { code: 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED' } });
    expect(performFinalFormComeUntoYourMaker(makeCampaign('heart-of-darkness', 'enc-hod'), { mode: PROFILE })).toMatchObject({ kind: 'community-source-blocked', blocker: { code: 'COME_UNTO_YOUR_MAKER_UNRESOLVED' } });
  });
});

describe('supported-path unresolved boundaries', () => {
  it.each(COMMUNITY_RUNTIME_BLOCKERS.map((item) => [item.code, item.requirementId, item.field] as const))('%s returns an explicit community-source blocker', (code, requirementId, field) => expect(blockCommunityOperation(code)).toMatchObject({ ok: false, kind: 'community-source-blocked', blocker: { code, requirementId, field, sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE' } }));
  it('Monster draw refuses saved-order and Prototype fallback', () => expect(drawCommunityMonster().blocker.code).toBe('MONSTER_DECK_DRAW_POLICY_UNRESOLVED'));
  it('pins the profile to the accepted source package', () => expect(COMMUNITY_REFERENCE_SOURCE_SHA256).toBe(COMMUNITY_REFERENCE_RUNTIME_PROFILE.sourcePackageSha256));
});
