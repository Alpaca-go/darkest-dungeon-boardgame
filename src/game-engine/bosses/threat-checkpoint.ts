import type { BattleState, CampaignState } from '../../types';
import type { BossEncounterState } from '../../types/boss-runtime';
import { assertBossEncounter } from './foundation';
import { resolveBossDefinition } from './definitions';
import { resolveHeroDodge } from '../rules/hero-dodge';

/** Reject identity/version changes before any state or RNG is consumed. */
export function validateThreatCheckpoint(campaign: CampaignState, checkpoint: BossEncounterState): void {
  const context = checkpoint.checkpointContext;
  if (!context) throw new Error('Checkpoint metadata absent: explicit migration required');
  if (context.schemaVersion !== 1 || context.definitionVersion !== checkpoint.ruleSetVersion) throw new Error('Checkpoint definition version mismatch');
  if (context.campaignId !== campaign.id || context.questRunId !== campaign.dungeon?.questRunId
    || context.campaignLevel !== campaign.campaignProgress.campaignLevel
    || context.threatId !== campaign.campaignProgress.activeThreatId
    || checkpoint.bossFamily !== campaign.campaignProgress.activeBossFamilyId) throw new Error('Checkpoint campaign linkage mismatch');
  if (context.encounterId !== `${campaign.id}:${context.questRunId}:${checkpoint.bossFamily}:${checkpoint.bossLevel}`
    || context.battleId !== `${context.questRunId}:boss`) throw new Error('Checkpoint encounter identity mismatch');
  const definition = resolveBossDefinition(checkpoint.bossFamily, checkpoint.bossLevel, checkpoint.ruleSetVersion);
  if (JSON.stringify(definition) !== JSON.stringify(checkpoint.definition)
    || checkpoint.threatAbilityCardId !== definition.threatAbilityCardId
    || checkpoint.battleCardId !== definition.battleCardId || checkpoint.bossIdentityCardId !== definition.bossIdentityCardId) throw new Error('Checkpoint pinned contract mismatch');
  if (checkpoint.side !== 'THREAT' || checkpoint.phase !== 'THREAT_ACTIVE' || checkpoint.bossState.actorId
    || checkpoint.activeSummons.length || checkpoint.queuedDeathIds.length
    || Object.values(checkpoint.summonSupply).some(s => s.active)) throw new Error('Checkpoint is not a settled Threat state');
  if (!Array.isArray(context.consumedOnceKeys) || new Set(context.consumedOnceKeys).size !== context.consumedOnceKeys.length) throw new Error('Checkpoint consumed-once keys invalid');
  const heroIds = campaign.heroes.filter(h => !h.dead).map(h => `u_${h.instanceId}`);
  if (heroIds.some(id => !Number.isFinite(context.heroDodge[id]))) throw new Error('Checkpoint Hero Dodge missing');
  if (context.heroDodgeBindings) {
    if (Object.keys(context.heroDodgeBindings).length !== heroIds.length) throw new Error('Checkpoint Hero binding coverage invalid');
    for (const hero of campaign.heroes.filter(h => !h.dead)) {
      const id = `u_${hero.instanceId}`;
      const expected = resolveHeroDodge({heroId:hero.heroId,level:hero.level,ruleSetVersion:checkpoint.ruleSetVersion});
      if (JSON.stringify(context.heroDodgeBindings[id]) !== JSON.stringify(expected) || context.heroDodge[id] !== expected.value)
        throw new Error('Checkpoint Hero binding differs from pinned resolver');
    }
  }
  if (checkpoint.threatState.forcedHeroId && !heroIds.includes(checkpoint.threatState.forcedHeroId)) throw new Error('Checkpoint selected Hero missing');
  if (checkpoint.pendingChoice && (checkpoint.pendingChoice.continuation.kind !== 'graveyard'
    || checkpoint.pendingChoice.candidateIds.some(id => !heroIds.includes(id)))) throw new Error('Checkpoint pending choice cannot be resumed in this campaign');
  const shell: BattleState = { battleId: context.battleId, sourceRoomId: checkpoint.roomId, status: 'active', round: checkpoint.round,
    maxRounds: 4, heroes: [], monsters: [], initiativeOrder: [], initiativeIndex: -1, activeActorId: null,
    currentActionPoints: 0, selectedSkillId: null, selectedTargetId: null, battleLog: [], rewards: { gold: 0 }, bossEncounter: checkpoint };
  assertBossEncounter(shell);
}
