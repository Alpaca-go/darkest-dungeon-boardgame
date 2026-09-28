import type { BattleState, CampaignState } from '../../types';
import type { BossDefinitionContract, BossRuntimeInput, SpawnDefinition } from '../../types/boss-runtime';
import { makeHeroUnit, resolveVictory } from '../battle';
import { applyBossRuntimeInput, bindBossEncounter, withBossEncounterSources } from '../bosses/foundation';
import { finalizeBossVictory, advanceCampaignAfterBoss } from '../campaign/campaign-orchestrator';
import { FACE_THE_THREAT_QUEST_ID } from '../../data/quests/face-the-threat';
import { nowIso } from '../random';

/** Programmatic production entry. Selector and complete-edition dependency promotion stay gated. */
export function startBossFoundation(campaign: CampaignState, definition: BossDefinitionContract, seed: number,
  roomId: string, heroDodge: Record<string, number>, spawnDefinitions: SpawnDefinition[]): CampaignState {
  if (campaign.battle || !campaign.dungeon?.rooms.some(r => r.id === roomId)) throw new Error('No available Boss encounter Room');
  if (campaign.bossEncounterCheckpoint) throw new Error('Existing encounter checkpoint requires the Room resumption bridge');
  const heroes = campaign.heroes.filter(h => !h.dead).map((hero, index) => {
    const unit = makeHeroUnit(hero, index, campaign);
    const dodge = heroDodge[hero.instanceId];
    if (!Number.isFinite(dodge)) throw new Error('Resolved Hero Dodge required');
    return { ...unit, bossCombatDodge: dodge };
  });
  const battle: BattleState = { battleId: `${campaign.dungeon.questRunId}:boss`, status: 'active', sourceRoomId: roomId,
    round: 1, maxRounds: 4, heroes, monsters: [], initiativeOrder: heroes.map(h => h.id), initiativeIndex: -1,
    activeActorId: null, currentActionPoints: 0, selectedSkillId: null, selectedTargetId: null, battleLog: [], rewards: { gold: 0 } };
  return { ...campaign, gamePhase: 'battle', battle: bindBossEncounter(battle, definition, seed, spawnDefinitions) };
}
export function applyBossFoundationInput(campaign: CampaignState, input: BossRuntimeInput): CampaignState {
  if (!campaign.battle?.bossEncounter) throw new Error('No Boss foundation battle');
  const battle = applyBossRuntimeInput(campaign.battle, input);
  let next = { ...campaign, battle };
  if (battle.bossEncounter!.side === 'ABILITY' && campaign.activeThreatRuntime?.active) {
    withBossEncounterSources(battle, () => {
      next = { ...next, activeThreatRuntime: { ...campaign.activeThreatRuntime!, active: false, deactivatedAt: nowIso(), deactivationTransactionId: `${battle.battleId}:threat-flip` } };
      return battle;
    });
  }
  return next;
}
export function settleBossThreatBattle(campaign: CampaignState): CampaignState {
  const battle = campaign.battle;
  if (!battle?.bossEncounter || battle.bossEncounter.side !== 'THREAT' || battle.status !== 'victory') return campaign;
  const ended = applyBossRuntimeInput(battle, { type: 'END_THREAT_BATTLE' });
  const settled = resolveVictory({ ...campaign, battle: { ...ended, status: 'victory' } });
  return { ...settled, bossEncounterCheckpoint: ended.bossEncounter! };
}

/** The existing campaign transaction log owns progression/rewards; no local substitute counter. */
export function commitBossFoundationVictory(campaign: CampaignState): CampaignState {
  const battle = campaign.battle;
  if (!battle?.bossEncounter || battle.status !== 'victory') return campaign;
  if (!campaign.dungeon || !campaign.campaignProgress.activeThreatId) throw new Error('Campaign Boss victory context missing');
  const cleaned = applyBossRuntimeInput(battle, { type: 'CLEANUP' });
  const e = cleaned.bossEncounter!;
  let result = campaign;
  withBossEncounterSources(cleaned, () => {
    const finalized = finalizeBossVictory({ ...campaign, battle: cleaned }, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID, questRunId: campaign.dungeon!.questRunId,
      threatId: campaign.campaignProgress.activeThreatId!, bossFamilyId: e.bossFamily,
    });
    if (!finalized.ok) throw new Error(`Boss victory rejected: ${finalized.error}`);
    const advanced = advanceCampaignAfterBoss(finalized.campaign);
    if (!advanced.ok) throw new Error(`Campaign progression rejected: ${advanced.error}`);
    e.cleanupState.campaignTransactionId = finalized.transactionId;
    e.cleanupState.roomCleaned = true;
    result = resolveVictory(advanced.campaign);
    return cleaned;
  });
  return { ...result, bossEncounterCheckpoint: null, bossEncounterHistory: [...(result.bossEncounterHistory ?? []), cleaned.bossEncounter!] };
}
