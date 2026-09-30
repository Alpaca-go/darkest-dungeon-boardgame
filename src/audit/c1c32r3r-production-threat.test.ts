import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { explicitlyMigrateHeroDodgeToV2 } from '../game-engine/rules/hero-dodge-versioning';
import { selectProductionRuinsV6, commitNecromancerProductionQuestSelection } from '../game-engine/commands/necromancer-production-entry';
import { enterProductionOrdinaryThreat, synchronizeOrdinaryThreatDeaths, chooseOrdinaryReanimation,
  validateProductionOrdinaryThreat } from '../game-engine/ruins/production-threat-runtime';
import { applyBattleUnitDamage } from '../game-engine/damage';
import { checkEnd } from '../game-engine/battle';
import { commitBattleVictory } from '../game-engine/commands/battle';
import { enterDungeonRoom } from '../game-engine/commands/dungeon';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { ruinsMonster } from '../game-engine/ruins/source-registry';
import { RUINS_V6 } from '../types/ruins-executable';
import { enterProductionBossRoom } from '../game-engine/commands/boss-foundation';
import { commitQuestSelection, commitLeaveDungeon, commitReturnToHamlet } from '../game-engine/commands/quest';
import { getQuestPool, runtimeContentContext } from '../data/content-selector';
import { chooseNecromancerPreparationHero, beginNecromancerGraveyardVisit, commitNecromancerGraveyardVisit } from '../game-engine/campaign/necromancer-preparation-day';
import { skipHeroAction, endHamletDay } from '../game-engine/hamlet';

const monster = (id: string) => ruinsMonster(id, RUINS_V6);

/** Focused executable contract fixture, not a new-campaign/browser acceptance proof. */
function ready(level: 1 | 2 | 3): CampaignState {
  return withRuntimeSources(seededRuntimeSources(3233), () => {
    let c = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
      ['crusader', 'leper', 'highwayman', 'vestal']));
    c.gamePhase = 'quest-select';
    Object.assign(c.campaignProgress, { campaignLevel: level, act: level,
      activeBossFamilyId: 'necromancer', activeThreatId: `necromancer-threat-level-${level}`,
      pendingThreatInitialization: false, completedStandardQuestsThisAct: 2, bossQuestRequired: true });
    c = selectProductionRuinsV6(explicitlyMigrateHeroDodgeToV2(c, 'r3r-contract-v2'));
    const selected = commitNecromancerProductionQuestSelection(c);
    if (!selected.ok) throw new Error(selected.error ?? 'selection failed');
    return selected.campaign;
  });
}
function atGuardedRoom(c: CampaignState, token: 'lair' | 'treasure' | 'curio' = 'lair'): CampaignState {
  c = structuredClone(c);
  const dungeon = c.dungeon!;
  const room = dungeon.rooms.find(r => r.type !== 'objective' && r.id !== dungeon.currentRoomId)!;
  room.sourceRoomToken = token;
  room.type = token === 'curio' ? 'empty' : 'battle';
  dungeon.previousRoomId = dungeon.currentRoomId;
  dungeon.currentRoomId = room.id;
  room.status = 'current';
  return c;
}
function reload(c: CampaignState): CampaignState {
  const save = JSON.parse(JSON.stringify(createSaveSnapshot(c)));
  expect(validateSaveFile(save)).toBeNull();
  const restored = restoreSaveSnapshot(save);
  expect(restored).toEqual(c);
  return restored;
}
function kill(c: CampaignState, ids: string[]): CampaignState {
  c = structuredClone(c);
  c.battle!.monsters = c.battle!.monsters.map(u => ids.includes(u.id) ? applyBattleUnitDamage(u, u.hp).unit : u);
  c.battle = checkEnd(c.battle!);
  return c;
}

describe('C1C32R3R focused production ordinary Threat contracts', () => {
  it.each([1, 2, 3] as const)('Level %i keeps one active Threat across distinct Standard and Face checkpoints', level => {
    withRuntimeSources(seededRuntimeSources(3233), () => {
      let c = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
        ['crusader', 'leper', 'highwayman', 'vestal']));
      c.gamePhase = 'quest-select';
      // Higher-level campaign prerequisites only; all Quest/Preparation mutations use product commands.
      Object.assign(c.campaignProgress, { act: level, campaignLevel: level });
      c = selectProductionRuinsV6(explicitlyMigrateHeroDodgeToV2(c, 'r3r-standard-v2'));
      const identities: string[] = [];
      let threatId: string | null = null;
      for (let quest = 0; quest < 2; quest++) {
        const selected = commitQuestSelection(c, getQuestPool(runtimeContentContext(c))[0].id);
        expect(selected.ok).toBe(true); c = selected.campaign;
        threatId ??= c.activeThreatRuntime!.threatId;
        expect(c.activeThreatRuntime!.threatId).toBe(threatId);
        expect(c.activeThreatRuntime!.active).toBe(true);
        const cp = c.bossEncounterCheckpoint!;
        expect(cp.checkpointContext!.questScope).toBe('STANDARD');
        identities.push(cp.checkpointContext!.encounterId);
        reload(c);
        const leave = commitLeaveDungeon(c); expect(leave.ok).toBe(true); c = leave.campaign;
        const outcome = c.lastQuestResult!.outcome;
        expect(outcome).toBe('completed');
        c = commitReturnToHamlet(c, { questId: c.currentQuestId!, questRunId: c.dungeon!.questRunId, questOutcome: outcome }).campaign;
        expect(c.bossEncounterCheckpoint).toBeNull();
        expect(c.necromancerQuestThreatHistory!.at(-1)!.checkpoint.checkpointContext!.encounterId).toBe(identities.at(-1));
        if (level !== 1) {
          c = reload(c);
          if (c.necromancerPreparationDay!.status === 'PENDING_TIE') {
            const choice = c.necromancerPreparationDay!.checkpoint.pendingChoice!;
            c = chooseNecromancerPreparationHero(c, choice.choiceId, choice.candidateIds[0]);
          }
          c = reload(beginNecromancerGraveyardVisit(c));
          if (level === 2) c = reload(commitNecromancerGraveyardVisit(c, quest === 0));
          const receipt = c.necromancerGraveyardReceipts!.at(-1)!;
          expect(receipt.sourceQuestRunId).toBe(cp.checkpointContext!.questRunId);
          expect(receipt.useEffect).toBe(level === 2 && quest === 0);
          expect(c.necromancerPreparationDay!.status).toBe('COMMITTED');
        }
        for (let day = 0; day < 8 && c.gamePhase === 'hamlet'; day++) {
          for (const h of c.heroes.filter(h => !h.dead && !h.hasActedToday)) c = skipHeroAction(c, h.instanceId);
          c = endHamletDay(c);
        }
        expect(c.gamePhase).toBe('quest-select'); reload(c);
      }
      expect(new Set(identities).size).toBe(2);
      c = commitNecromancerProductionQuestSelection(c).campaign;
      expect(c.bossEncounterCheckpoint!.checkpointContext!.questScope).toBe('FACE_THE_THREAT');
      expect(identities).not.toContain(c.bossEncounterCheckpoint!.checkpointContext!.encounterId);
      expect(c.activeThreatRuntime!.threatId).toBe(threatId);
      expect(commitLeaveDungeon(c).error).toBe('boss-quest-cannot-leave');
      reload(c);
    });
  });
  it.each([1, 2, 3] as const)('Level %i draws source cards, cross-links one checkpoint and reloads', level => {
    const c = atGuardedRoom(ready(level));
    const before = structuredClone(c);
    const entered = enterProductionOrdinaryThreat(c, c.dungeon!.currentRoomId);
    expect(c).toEqual(before);
    expect(entered.battle!.bossEncounter).toBeUndefined();
    expect(entered.battle!.ruinsContext!.executionSchemaVersion).toBe(2);
    expect(entered.battle!.ruinsContext!.threatEncounterId).toBe(c.bossEncounterCheckpoint!.checkpointContext!.encounterId);
    expect(entered.ruinsDrawState!.encounters).toHaveLength(1);
    expect(entered.battle!.monsters.every(m => monster(m.sourceId).executable)).toBe(true);
    reload(entered);
  });

  it('uses Captain as the first real initial draw, two slots and one finite miniature', () => {
    const c = atGuardedRoom(ready(2));
    const entered = enterProductionOrdinaryThreat(c, c.dungeon!.currentRoomId);
    const encounter = entered.ruinsDrawState!.encounters[0];
    expect(encounter.monsters[0]).toMatchObject({ definitionId: 'bone-captain', slots: 2, stance: 'aggressive' });
    expect(entered.bossEncounterCheckpoint!.threatState.firstBattleConsumed).toBe(true);
    const captain = encounter.monsters[0];
    expect(entered.ruinsBoneFigureSupply!.ordinaryAssignments[encounter.encounterId][captain.copyId]).toBe('bone-captain:figure-1');
    expect(encounter.drawEvents.filter(e => e.copyId === captain.copyId && e.type === 'DRAW')).toHaveLength(1);
    expect(reload(entered).bossEncounterCheckpoint!.events.filter(e => e.eventType === 'CAPTAIN_THREAT_CONSUMED')).toHaveLength(1);
  });

  it('freezes simultaneous first deaths, persists candidates, and allocates a fresh instance from the same copy', () => {
    let c = atGuardedRoom(ready(3));
    c = enterProductionOrdinaryThreat(c, c.dungeon!.currentRoomId);
    const eligible = c.battle!.monsters.filter(m => monster(m.sourceId).size !== 'LARGE');
    expect(eligible.length).toBeGreaterThan(1);
    const initial = structuredClone(c);
    c = synchronizeOrdinaryThreatDeaths(kill(c, eligible.map(m => m.id)));
    const choice = c.battle!.ruinsContext!.pendingReanimationChoice!;
    expect(choice.candidateIds).toEqual(eligible.map(m => m.id).sort());
    c = reload(c);
    const selected = eligible[0].id;
    const binding = initial.battle!.ruinsContext!.unitPhysicalBindings![selected];
    const ruinsRng = c.battle!.ruinsContext!.rngCursor;
    const checkpointRng = c.bossEncounterCheckpoint!.rngState;
    c = chooseOrdinaryReanimation(c, choice.choiceId, selected);
    const fresh = c.battle!.monsters.find(m => c.battle!.ruinsContext!.unitPhysicalBindings![m.id].predecessorUnitId === selected)!;
    expect(fresh.id).not.toBe(selected);
    expect(fresh.hp).toBe(monster(fresh.sourceId).life);
    expect(c.battle!.ruinsContext!.unitPhysicalBindings![fresh.id]).toEqual({ ...binding, generation: 1, predecessorUnitId: selected });
    expect(c.battle!.ruinsContext!.retiredMonsterInstances!.find(d => d.unit.id === selected)!.unit.isAlive).toBe(false);
    expect(c.battle!.ruinsContext!.rngCursor).toBe(ruinsRng);
    expect(c.bossEncounterCheckpoint!.rngState).not.toBe(checkpointRng);
    expect(c.ruinsDrawState!.ownership).toEqual(initial.ruinsDrawState!.ownership);
    expect(c.ruinsBoneFigureSupply).toEqual(initial.ruinsBoneFigureSupply);
    reload(c);
  });

  it('defers last-kill victory until Reanimation and never repeats the first window', () => {
    let c = atGuardedRoom(ready(3));
    c = enterProductionOrdinaryThreat(c, c.dungeon!.currentRoomId);
    c = kill(c, c.battle!.monsters.map(m => m.id));
    expect(c.battle!.status).toBe('active');
    c = synchronizeOrdinaryThreatDeaths(c);
    const choice = c.battle!.ruinsContext!.pendingReanimationChoice;
    if (choice) c = chooseOrdinaryReanimation(c, choice.choiceId, choice.candidateIds[0]);
    expect(c.battle!.monsters).toHaveLength(1);
    c = synchronizeOrdinaryThreatDeaths(kill(c, c.battle!.monsters.map(m => m.id)));
    expect(c.battle!.status).toBe('victory');
    expect(c.bossEncounterCheckpoint!.events.filter(e => e.eventType === 'REANIMATION_SPAWNED')).toHaveLength(1);
    // The fixture deliberately settles any staged pre-death attack before exercising victory return.
    c.battle!.pendingMonsterAttack = null;
    c.battle!.ruinsContext!.pendingChoice = null;
    c.battle!.activeActorId = null;
    const ended = commitBattleVictory(c);
    expect(ended.ok).toBe(true);
    expect(ended.campaign.battle).toBeNull();
    expect(ended.campaign.bossEncounterCheckpoint!.reanimationState).toEqual({ firstDeathWindowConsumed: false, lockedEventId: null });
    expect(ended.campaign.ruinsDrawState!.encounters[0].returned).toBe(true);
    reload(ended.campaign);
    expect(commitBattleVictory(ended.campaign).campaign).toBe(ended.campaign);
  });

  it('rejects missing or forged checkpoints, generations, candidates and physical copy aliases', () => {
    const c = atGuardedRoom(ready(3));
    const entered = enterProductionOrdinaryThreat(c, c.dungeon!.currentRoomId);
    for (const forge of [
      (s: CampaignState) => { s.bossEncounterCheckpoint = null; },
      (s: CampaignState) => { s.battle!.ruinsContext!.threatEncounterId = 'other'; },
      (s: CampaignState) => { Object.values(s.battle!.ruinsContext!.unitPhysicalBindings!)[0].generation = 2; },
      (s: CampaignState) => { Object.values(s.battle!.ruinsContext!.unitPhysicalBindings!)[0].copyId = 'forged'; },
    ]) {
      const forged = structuredClone(entered); forge(forged);
      expect(() => validateProductionOrdinaryThreat(forged)).toThrow();
      expect(validateSaveFile(createSaveSnapshot(forged))).not.toBeNull();
    }
  });

  it('returns all used/replaced cards, removes every non-Unholy copy, then resumes the same Boss identity', () => {
    let c = atGuardedRoom(ready(1));
    c = enterProductionOrdinaryThreat(c, c.dungeon!.currentRoomId);
    const identity = c.bossEncounterCheckpoint!.checkpointContext!.encounterId;
    const appeared = c.battle!.monsters.map(m => m.sourceId);
    c = synchronizeOrdinaryThreatDeaths(kill(c, c.battle!.monsters.map(m => m.id)));
    c.battle!.pendingMonsterAttack = null; c.battle!.ruinsContext!.pendingChoice = null; c.battle!.activeActorId = null;
    const ended = commitBattleVictory(c).campaign;
    const excluded = appeared.filter(id => !monster(id).tags.some(t => t.toLowerCase() === 'unholy'));
    expect(excluded.length).toBeGreaterThan(0);
    for (const id of excluded) for (const copy of monster(id).physicalCopyIds) {
      expect(ended.ruinsDrawState!.ownership[copy].location).toBe('PERMANENTLY_REMOVED');
      expect(ended.ruinsDrawState!.monsterDeck).not.toContain(copy);
    }
    reload(ended);
    const boss = enterProductionBossRoom(ended, ended.bossRoomStorage!.roomId);
    expect(boss.battle!.bossEncounter!.checkpointContext!.encounterId).toBe(identity);
    expect(boss.battle!.bossEncounter!.side).toBe('ABILITY');
    expect(boss.bossEncounterCheckpoint).toBeNull();
    reload(boss);
  });

  it.each(['lair', 'treasure', 'curio'] as const)('enters guarded %s through the complete production movement command', token => {
    let c = ready(2);
    const target = c.dungeon!.rooms.find(r => c.dungeon!.rooms.find(x => x.id === c.dungeon!.currentRoomId)!.adjacentRoomIds.includes(r.id))!;
    target.sourceRoomToken = token; target.type = token === 'curio' ? 'empty' : 'battle'; target.status = 'hidden';
    if (token === 'curio') target.curioGuardRoll = 2;
    c = withRuntimeSources(seededRuntimeSources(32), () => enterDungeonRoom(c, target.id).campaign);
    expect(c.battle!.ruinsContext!.executionSchemaVersion).toBe(2);
    expect(c.battle!.sourceRoomId).toBe(target.id);
    if (token === 'curio') expect(c.dungeon!.rooms.find(r => r.id === target.id)!.curioGuardRoll).toBe(2);
    reload(c);
  });
});
