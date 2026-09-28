import { describe, expect, it } from 'vitest';
import { createNewCampaign, createHeroInstance } from '../campaign';
import { seededRuntimeSources, withRuntimeSources } from '../runtime-sources';
import { necromancerDefinition, NECROMANCER_RULE_SET_VERSION } from '../necromancer/contract-adapter';
import { startBossFoundation, commitBossFoundationVictory, applyBossFoundationInput, settleBossThreatBattle } from './boss-foundation';
import { isThreatActive } from '../threats/threat-passives';
import { applyBossRuntimeInput, checkBossRuntimeEnd } from '../bosses/foundation';
import { syntheticBoneDefinitions } from '../bosses/foundation-test-fixture';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../save';
import type { CampaignState } from '../../types';

export function campaignFoundationFixture(level: 1 | 2 | 3 = 1): CampaignState {
  return withRuntimeSources(seededRuntimeSources(29), () => {
    const c = createNewCampaign();
    c.heroes = ['crusader', 'highwayman', 'vestal', 'hellion'].map((id, index) => createHeroInstance(id, index)!);
    c.gamePhase = 'dungeon-explore'; c.currentQuestId = 'face-the-threat';
    c.campaignProgress.activeThreatId = `necromancer-threat-level-${level}`;
    c.campaignProgress.activeBossFamilyId = 'necromancer';
    c.campaignProgress.pendingThreatInitialization = false;
    c.dungeon = { questId: 'face-the-threat', questRunId: 'c1c29-boss-run', currentRoomId: 'room-10', previousRoomId: null,
      rooms: [{ id: 'room-10', type: 'objective', status: 'current', adjacentRoomIds: [] }], scoutedNextMove: false, roomsCleared: 0, objectiveComplete: false, canLeave: false };
    return startBossFoundation(c, necromancerDefinition(level), 29, 'room-10', Object.fromEntries(c.heroes.map(h => [h.instanceId, 0])), syntheticBoneDefinitions);
  });
}
describe('C1C29 production commands and real saves', () => {
  it('flipping to Ability stops the existing Threat collector immediately and updates its legacy mirror', () => {
    const c = campaignFoundationFixture();
    c.activeThreatRuntime = { threatId: 'necromancer-threat-level-1', bossFamilyId: 'necromancer', bossDefinitionId: 'legacy', campaignLevel: 1,
      drawTransactionId: 'fixture-threat-draw', drawnAt: '1970-01-01T00:00:00.000Z', active: true, deactivatedAt: null, deactivationTransactionId: null, consumedOnceKeys: [] };
    expect(isThreatActive(c)).toBe(true);
    const next = applyBossFoundationInput(c, { type: 'ENTER_BOSS_ROOM' });
    expect(isThreatActive(next)).toBe(false); expect(next.activeThreatRuntime!.active).toBe(false);
  });
  it('ordinary Threat Battle settlement preserves its serializable checkpoint without advancing the campaign', () => {
    const c = campaignFoundationFixture(); c.battle!.status = 'victory';
    const after = settleBossThreatBattle(c); expect(after.battle).toBeNull(); expect(after.bossEncounterCheckpoint!.side).toBe('THREAT');
    expect(after.campaignProgress.act).toBe(1); expect(after.campaignProgress.defeatedBossFamilyIds).toEqual([]);
    expect(validateSaveFile(createSaveSnapshot(after))).toBeNull();
  });
  it('roundtrips a pending choice through the existing SaveFile', () => {
    const c = campaignFoundationFixture(3); const b = c.battle!;
    c.battle = applyBossRuntimeInput(b, { type: 'PREPARATION_DAY', rolls: Object.fromEntries(b.heroes.map(h => [h.id, 1])) });
    const snapshot = createSaveSnapshot(c); expect(validateSaveFile(snapshot)).toBeNull();
    const loaded = restoreSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(loaded.battle!.bossEncounter).toEqual(c.battle.bossEncounter);
    expect(loaded.battle!.bossEncounter!.ruleSetVersion).toBe(NECROMANCER_RULE_SET_VERSION);
  });
  it('rejects silent version changes and tampered definition snapshots on import', () => {
    const c = campaignFoundationFixture(); c.battle!.bossEncounter!.ruleSetVersion = 'changed';
    expect(validateSaveFile(createSaveSnapshot(c))).toContain('migration');
    const other = campaignFoundationFixture(); other.battle!.bossEncounter!.definition.stats.HP++;
    expect(validateSaveFile(createSaveSnapshot(other))).toContain('pinned contract');
  });
  it('executes real campaign progression and Room cleanup once, retaining replay history', () => {
    const c = campaignFoundationFixture(); c.battle = applyBossRuntimeInput(c.battle!, { type: 'ENTER_BOSS_ROOM' });
    c.battle.monsters[0].isAlive = false; c.battle.monsters[0].hp = 0; c.battle = checkBossRuntimeEnd(c.battle);
    const after = commitBossFoundationVictory(c); expect(after.battle).toBeNull();
    expect(after.campaignProgress.defeatedBossFamilyIds).toContain('necromancer');
    expect(after.campaignProgress.act).toBe(2); expect(after.dungeon!.rooms[0].status).toBe('cleared');
    expect(after.bossEncounterHistory).toHaveLength(1); expect(after.bossEncounterHistory![0].cleanupState.roomCleaned).toBe(true);
    expect(after.bossEncounterHistory![0].ruleSetVersion).toBe(NECROMANCER_RULE_SET_VERSION);
    expect(commitBossFoundationVictory(after)).toBe(after);
  });
  it('campaign mismatch rejects the transaction without rewarding, advancing or cleaning the original', () => {
    const c = campaignFoundationFixture(); c.battle = applyBossRuntimeInput(c.battle!, { type: 'ENTER_BOSS_ROOM' });
    c.battle.monsters[0].isAlive = false; c.battle = checkBossRuntimeEnd(c.battle); c.campaignProgress.activeBossFamilyId = 'other';
    const before = JSON.stringify(c); expect(() => commitBossFoundationVictory(c)).toThrow('rejected'); expect(JSON.stringify(c)).toBe(before);
  });
});
