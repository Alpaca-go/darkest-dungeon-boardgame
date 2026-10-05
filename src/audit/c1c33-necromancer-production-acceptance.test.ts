import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { compareProductionReplay } from '../../scripts/audit/c1c32r3r-replay';
import { commitBattleVictory } from '../game-engine/commands/battle';
import { commitQuestFailureFromDefeat } from '../game-engine/commands/quest';

// Immutable R3R player observations; never install these into a production browser.
const states = (level: number): Array<{point: string; campaign: CampaignState}> =>
  JSON.parse(readFileSync(`docs/data/complete-edition/c1c32r3r-browser-level${level}-replay-states.json`, 'utf8'));
const ordinary = (level: number) => states(level).find(s => s.point === 'ordinary-battle-active')!.campaign;
const reanimated = () => states(3).find(s => s.campaign.battle?.ruinsContext?.retiredMonsterInstances?.length)!.campaign;
const binding = (c: CampaignState) => Object.values(c.battle!.ruinsContext!.unitPhysicalBindings!)[0];
function reject(c: CampaignState, mutate: (c: CampaignState) => void) {
  const forged = structuredClone(c); mutate(forged);
  const save = JSON.parse(JSON.stringify(createSaveSnapshot(forged)));
  expect(validateSaveFile(save)).not.toBeNull();
  expect(() => restoreSaveSnapshot(save)).toThrow();
}

describe('C1C33 production freeze / save tamper rejection', () => {
  it.each([
    ['threatEncounterId', (c: CampaignState) => { c.battle!.ruinsContext!.threatEncounterId = 'forged'; }],
    ['questRunId', (c: CampaignState) => { c.dungeon!.questRunId = 'forged'; }],
    ['activeThreatId', (c: CampaignState) => { c.campaignProgress.activeThreatId = 'forged'; }],
    ['physical copy binding', (c: CampaignState) => { binding(c).copyId = 'forged'; }],
    ['figure binding', (c: CampaignState) => {
      const assignment = Object.values(c.ruinsBoneFigureSupply!.ordinaryAssignments)[0];
      assignment[Object.keys(assignment)[0]] = 'bone-captain:figure-99';
    }],
    ['generation', (c: CampaignState) => { binding(c).generation++; }],
    ['predecessorUnitId', (c: CampaignState) => { binding(c).predecessorUnitId = 'forged'; }],
    ['ruleset version', (c: CampaignState) => { c.battle!.ruinsContext!.ruleSetVersion = 'forged' as never; }],
    ['duplicate card ownership', (c: CampaignState) => { c.ruinsDrawState!.monsterDeck.push(binding(c).copyId); }],
    ['duplicate initiative', (c: CampaignState) => { c.battle!.initiativeOrder.push(c.battle!.initiativeOrder[0]); }],
  ] as const)('fails closed for %s', (_name, mutate) => reject(ordinary(2), mutate));

  it('rejects Room storage ownership', () => reject(ordinary(2), c => { c.bossRoomStorage!.encounterId = 'forged'; }));
  it('rejects Captain consumed flag rollback', () => reject(ordinary(2), c => { c.bossEncounterCheckpoint!.threatState.firstBattleConsumed = false; }));
  it('rejects Captain consumed rollback after ordinary settlement', () => reject(
    states(2).find(s => s.point === 'ordinary-after-settlement')!.campaign,
    c => { c.bossEncounterCheckpoint!.threatState.firstBattleConsumed = false; }));
  it('rejects immutable retired instance changes', () => reject(reanimated(), c => { c.battle!.ruinsContext!.retiredMonsterInstances![0].unit.hp++; }));
  it('rejects Reanimation consumed state rollback', () => reject(reanimated(), c => { c.bossEncounterCheckpoint!.reanimationState.firstDeathWindowConsumed = false; }));
  it('rejects Reanimation causal lock tampering', () => reject(reanimated(), c => { c.bossEncounterCheckpoint!.reanimationState.lockedEventId = 'forged'; }));
  it('rejects loss of Reanimation audit history', () => reject(reanimated(), c => { c.battle!.ruinsContext!.retiredMonsterInstances = []; }));

  it.each([1, 2, 3])('Level %i preserves schema-2 state and deterministic command continuation', level => {
    for (const s of states(level)) {
      const proof = compareProductionReplay(s.point, s.campaign);
      expect(proof).toBeTruthy();
    }
  });
  it.each([1, 2, 3])('Level %i does not duplicate settled victory transactions', level => {
    const c = states(level).find(s => s.point === 'boss-after-settlement')!.campaign;
    expect(commitBattleVictory(c).campaign).toEqual(c);
    expect(new Set(c.processedCampaignTransactionIds).size).toBe(c.processedCampaignTransactionIds.length);
  });
  it('Standard Quest failure preserves the active Threat and cannot award Boss progression', () => {
    const c = structuredClone(ordinary(1));
    expect(c.currentQuestId).not.toBe('face-the-threat');
    c.battle!.status = 'defeat'; // Explicit failure fault injection, never browser/production combat proof.
    const result = commitQuestFailureFromDefeat(c);
    expect(result.ok).toBe(true);
    expect(result.campaign.activeThreatRuntime!.active).toBe(true);
    expect(result.campaign.campaignProgress.act).toBe(c.campaignProgress.act);
    expect(result.campaign.campaignProgress.defeatedThreatIds).toEqual(c.campaignProgress.defeatedThreatIds);
    expect(result.campaign.campaignProgress.defeatedBossFamilyIds).toEqual(c.campaignProgress.defeatedBossFamilyIds);
    expect(result.campaign.bossEncounterHistory ?? []).toHaveLength(0);
  });
});
