import { useGameStore } from '../../store/useGameStore';
import { getActiveUnit, legalTargetsForActor, heroSkillActionError } from '../../game-engine/battle';
import { getReplacementCandidates } from '../../game-engine/stagecoach';
import { createNewCampaign, selectParty } from '../../game-engine/campaign';
import { completePostThirdThreatHamlet, unlockDarkestDungeonAct } from '../../game-engine/campaign/act-four/unlock-act-four';
import type { CampaignState } from '../../types';

export function buildCommunityReferenceCheckpoint(): CampaignState {
  if (import.meta.env.VITE_E2E_MODE !== '1') throw new Error('E2E mode required');
  let campaign = selectParty(createNewCampaign(), ['crusader', 'vestal', 'highwayman', 'hellion']);
  campaign = { ...campaign, campaignProgress: { ...campaign.campaignProgress, defeatedBossFamilyIds: ['necromancer', 'prophet', 'collector'] } };
  campaign = unlockDarkestDungeonAct(campaign, { now: '2026-09-11T00:00:00.000Z' }).campaign;
  campaign = completePostThirdThreatHamlet(campaign, { now: '2026-09-11T00:00:01.000Z' }).campaign;
  return campaign;
}


/** Player decisions only: every write is a public product action. */
export function playNextLegalAction(): void {
  if (import.meta.env.VITE_E2E_MODE !== '1') throw new Error('E2E mode required');
  const store = useGameStore.getState();
  const c = store.campaign;
  if (!c) throw new Error('No campaign');
  const opportunity = c.pendingTrinketUseOpportunities.find(o => o.status === 'open');
  if (opportunity) return store.declineTrinketOpportunity(opportunity.id);
  const allocation = c.pendingTrinketAllocations.find(a => a.status === 'pending');
  if (allocation) return store.resolveTrinketAllocation(allocation.allocationId, { type: 'discard' });
  switch (c.gamePhase) {
    case 'dungeon-explore': {
      const d = c.dungeon;
      if (!d) throw new Error('Missing dungeon');
      if (d.objectiveComplete && d.canLeave) return store.leaveDungeon();
      const current = d.rooms.find(r => r.id === d.currentRoomId);
      const adjacent = d.rooms.filter(r => current?.adjacentRoomIds.includes(r.id));
      const uncleared = adjacent.filter(r => r.status !== 'cleared');
      const next = [...(uncleared.length ? uncleared : adjacent)].sort((a,b) => a.id.localeCompare(b.id))[0];
      if (!next) throw new Error('No legal room');
      return store.moveToRoom(next.id);
    }
    case 'battle': {
      const battle = c.battle;
      if (!battle) throw new Error('Missing battle');
      if (battle.status === 'victory') return store.battleResolveVictory();
      if (battle.status !== 'active') throw new Error('Player lost battle');
      const actor = getActiveUnit(battle);
      if (!actor) throw new Error('Missing active actor');
      const hero = c.heroes.find(h => h.instanceId === actor.sourceId);
      for (const skill of hero?.equippedSkillIds ?? []) {
        const targets = legalTargetsForActor(battle, skill);
        if (targets.length && !heroSkillActionError(battle, actor.id, skill, targets[0])) {
          store.selectBattleSkill(skill);
          store.battleUseSkill(targets[0]);
          return;
        }
      }
      return store.battleEndTurn();
    }
    case 'hamlet': {
      const hero = c.heroes.find(h => h.isAlive && !h.hasActedToday);
      if (hero) return store.skipHeroToday(hero.instanceId);
      return store.endHamletDay();
    }
    case 'replacement': {
      const slot = c.stagecoach.pendingReplacement?.slots.find(s => !s.confirmed);
      if (!slot) return store.completeReplacementFlow();
      if (slot.selectedHeroClassId) return store.confirmReplacement(slot.deadCampaignHeroId);
      const candidate = getReplacementCandidates(c).find(h => h.selectable);
      if (!candidate) throw new Error('No replacement candidate');
      return store.selectReplacementHero(slot.deadCampaignHeroId, candidate.hero.id);
    }
    default: throw new Error(`Unsupported player phase: ${c.gamePhase}`);
  }
}

export function playUntil(target: 'quest-result' | 'quest-select'): void {
  if (import.meta.env.VITE_E2E_MODE !== '1') throw new Error('E2E mode required');
  for (let step = 0; step < 4000; step++) {
    const before = useGameStore.getState().campaign;
    if (before?.gamePhase === target && !before.pendingTrinketAllocations.some(a => a.status === 'pending')
      && !before.pendingTrinketUseOpportunities.some(o => o.status === 'open')) return;
    playNextLegalAction();
    if (before === useGameStore.getState().campaign) throw new Error(`Player action made no progress: ${before?.gamePhase}`);
  }
  throw new Error('Player step limit exceeded');
}

// E2E harness exports only production-command orchestration helpers.
