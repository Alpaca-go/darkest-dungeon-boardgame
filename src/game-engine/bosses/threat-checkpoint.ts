import type { BattleState, CampaignState } from '../../types';
import type { BossEncounterState } from '../../types/boss-runtime';
import { assertBossEncounter, recordBossRuntimeEvent } from './foundation';
import { resolveBossDefinition, encounterRuleDependencies } from './definitions';
import { resolveHeroDodge } from '../rules/hero-dodge';

/** Reject identity/version changes before any state or RNG is consumed. */
export function validateThreatCheckpoint(campaign: CampaignState, checkpoint: BossEncounterState): void {
  const context = checkpoint.checkpointContext;
  const dependencies = encounterRuleDependencies(checkpoint);
  if (!context) throw new Error('Checkpoint metadata absent: explicit migration required');
  if (checkpoint.bossFamily==='prophet' && !context.heroDodgeBindings) throw new Error('Successor Hero Dodge bindings missing');
  if (context.schemaVersion !== 1 || context.definitionVersion !== checkpoint.ruleSetVersion) throw new Error('Checkpoint definition version mismatch');
  if (context.campaignId !== campaign.id || context.questRunId !== campaign.dungeon?.questRunId
    || context.campaignLevel !== campaign.campaignProgress.campaignLevel
    || context.threatId !== campaign.campaignProgress.activeThreatId
    || checkpoint.bossFamily !== campaign.campaignProgress.activeBossFamilyId
    || checkpoint.bossLevel !== campaign.campaignProgress.campaignLevel) throw new Error('Checkpoint campaign linkage mismatch');
  if (context.encounterId !== `${campaign.id}:${context.questRunId}:${checkpoint.bossFamily}:${checkpoint.bossLevel}`
    || context.battleId !== `${context.questRunId}:boss`) throw new Error('Checkpoint encounter identity mismatch');
  const definition = resolveBossDefinition(checkpoint.bossFamily, checkpoint.bossLevel, checkpoint.ruleSetVersion);
  if (JSON.stringify(definition) !== JSON.stringify(checkpoint.definition)
    || checkpoint.threatAbilityCardId !== definition.threatAbilityCardId
    || checkpoint.battleCardId !== definition.battleCardId || checkpoint.bossIdentityCardId !== definition.bossIdentityCardId) throw new Error('Checkpoint pinned contract mismatch');
  if (checkpoint.events.some(event=>![definition.battleCardId,definition.threatAbilityCardId].includes(event.sourceCardId))) throw new Error('Checkpoint physical event identity mismatch');
  if (checkpoint.side !== 'THREAT' || checkpoint.phase !== 'THREAT_ACTIVE' || checkpoint.bossState.actorId
    || checkpoint.activeSummons.length || checkpoint.queuedDeathIds.length
    || Object.values(checkpoint.summonSupply).some(s => s.active)) throw new Error('Checkpoint is not a settled Threat state');
  if (!Array.isArray(context.consumedOnceKeys) || new Set(context.consumedOnceKeys).size !== context.consumedOnceKeys.length) throw new Error('Checkpoint consumed-once keys invalid');
  if(checkpoint.bossFamily==='prophet'){
    const receipts=checkpoint.events.filter(e=>e.eventType==='PROPHET_THREAT_APPLIED').map(e=>(e.result as {once:string}).once);
    if(new Set(receipts).size!==receipts.length||JSON.stringify(receipts)!==JSON.stringify(context.consumedOnceKeys)
      ||JSON.stringify(receipts)!==JSON.stringify(campaign.activeThreatRuntime?.consumedOnceKeys??[])
      ||receipts.some(id=>!campaign.processedCampaignTransactionIds?.includes(id)))throw new Error('Prophet Threat receipt/once-key mismatch');
  }
  if (context.questScope && checkpoint.events.some(event => event.eventType === 'ORDINARY_THREAT_BATTLE_ENTERED')
    && !checkpoint.threatState.firstBattleConsumed) throw new Error('Checkpoint first Battle consumption rolled back');
  const heroIds = campaign.heroes.filter(h => !h.dead).map(h => `u_${h.instanceId}`);
  if (heroIds.some(id => !Number.isFinite(context.heroDodge[id]))) throw new Error('Checkpoint Hero Dodge missing');
  if (context.heroDodgeBindings) {
    if (Object.keys(context.heroDodgeBindings).some(id => !campaign.heroes.some(h => `u_${h.instanceId}` === id))
      || heroIds.some(id => !context.heroDodgeBindings![id])) throw new Error('Checkpoint Hero binding coverage invalid');
    for (const hero of campaign.heroes.filter(h => !h.dead)) {
      const id = `u_${hero.instanceId}`;
      const expected = resolveHeroDodge({heroId:hero.heroId,level:hero.level,ruleSetVersion:dependencies.heroDodgeRuleSetVersion});
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

/** A Stagecoach replacement binds the new Hero without resetting encounter events or RNG. */
export function bindReplacementThreatHero(campaign: CampaignState, replacedId: string, newId: string): CampaignState {
  const saved = campaign.bossEncounterCheckpoint;
  if (!saved?.checkpointContext?.questScope || !saved.checkpointContext.heroDodgeBindings) return campaign;
  const hero = campaign.heroes.find(h => h.instanceId === newId && !h.dead);
  if (!hero) throw new Error('Replacement Hero missing');
  const checkpoint = structuredClone(saved), context = checkpoint.checkpointContext!;
  delete context.heroDodge[`u_${replacedId}`];
  delete context.heroDodgeBindings![`u_${replacedId}`];
  const binding = resolveHeroDodge({ heroId: hero.heroId, level: hero.level, ruleSetVersion: encounterRuleDependencies(checkpoint).heroDodgeRuleSetVersion });
  context.heroDodge[`u_${newId}`] = binding.value;
  context.heroDodgeBindings![`u_${newId}`] = binding;
  const shell: BattleState = { battleId: context.battleId, sourceRoomId: checkpoint.roomId, status: 'active', round: checkpoint.round,
    maxRounds: 4, heroes: [], monsters: [], initiativeOrder: [], initiativeIndex: -1, activeActorId: null, currentActionPoints: 0,
    selectedSkillId: null, selectedTargetId: null, battleLog: [], rewards: { gold: 0 }, bossEncounter: checkpoint };
  recordBossRuntimeEvent(shell, 'THREAT_HERO_REPLACED', { replacedId, newId, binding }, [`u_${newId}`]);
  return { ...campaign, bossEncounterCheckpoint: checkpoint };
}
