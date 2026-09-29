import type { BattleState, CampaignState } from '../../types';
import type { BossDefinitionContract, BossRuntimeInput, SpawnDefinition } from '../../types/boss-runtime';
import { advanceTurn, makeHeroUnit, resolveVictory } from '../battle';
import { applyBossRuntimeInput, assertBossEncounter, bindBossEncounter, withBossEncounterSources } from '../bosses/foundation';
import { validateThreatCheckpoint } from '../bosses/threat-checkpoint';
import { finalizeBossVictory, advanceCampaignAfterBoss } from '../campaign/campaign-orchestrator';
import { FACE_THE_THREAT_QUEST_ID } from '../../data/quests/face-the-threat';
import { resolveHeroDodge } from '../rules/hero-dodge';
import { campaignHeroDodgeRuleSetVersion } from '../rules/hero-dodge-versioning';
import { resolveBossDefinition } from '../bosses/definitions';
import { necromancerProductionDependencyGate } from '../bosses/production-dependency-gate';
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
  const bound = bindBossEncounter(battle, definition, seed, spawnDefinitions);
  bound.bossEncounter!.checkpointContext = {
    schemaVersion: 1, encounterId: `${campaign.id}:${campaign.dungeon.questRunId}:${definition.family}:${definition.level}`,
    battleId: battle.battleId, campaignId: campaign.id, questRunId: campaign.dungeon.questRunId,
    campaignLevel: campaign.campaignProgress.campaignLevel, threatId: campaign.campaignProgress.activeThreatId ?? '',
    definitionVersion: definition.ruleSetVersion, consumedOnceKeys: [...(campaign.activeThreatRuntime?.consumedOnceKeys ?? [])],
    heroDodge: Object.fromEntries(heroes.map(h => [h.id, h.bossCombatDodge!])), dependencyAuthority: 'EXPLICIT_BINDING',
  };
  return { ...campaign, gamePhase: 'battle', battle: bound };
}

/** Reattach the saved encounter, without re-binding, resetting events, or re-seeding. */
export function resumeBossFoundation(campaign: CampaignState, roomId: string): CampaignState {
  if (campaign.battle || !campaign.dungeon?.rooms.some(r => r.id === roomId && r.type === 'objective')) throw new Error('No available Boss objective Room');
  const saved = campaign.bossEncounterCheckpoint;
  if (!saved) throw new Error('No Threat checkpoint');
  validateThreatCheckpoint(campaign, saved);
  if (saved.pendingChoice) throw new Error('Resolve saved Threat choice before Room entry');
  const encounter = structuredClone(saved);
  const context = encounter.checkpointContext!;
  const heroes = campaign.heroes.filter(h => !h.dead).map((hero, index) => ({ ...makeHeroUnit(hero, index, campaign), bossCombatDodge: context.heroDodge[`u_${hero.instanceId}`], heroDodgeBinding: context.heroDodgeBindings?.[`u_${hero.instanceId}`] }));
  const battle: BattleState = { battleId: context.battleId, sourceRoomId: roomId, status: 'active', round: encounter.round,
    maxRounds: 4, ...(context.heroDodgeBindings ? {stagedIncomingAttacks:true} : {}), heroes, monsters: [], initiativeOrder: heroes.map(h => h.id), initiativeIndex: -1,
    activeActorId: null, currentActionPoints: 0, selectedSkillId: null, selectedTargetId: null, battleLog: [], rewards: { gold: 0 }, bossEncounter: encounter };
  assertBossEncounter(battle);
  const resumed = applyBossFoundationInput({ ...campaign, battle, gamePhase: 'battle' }, { type: 'ENTER_BOSS_ROOM' });
  return { ...resumed, bossEncounterCheckpoint: context.heroDodgeBindings ? null : campaign.bossEncounterCheckpoint, bossRoomStorage: campaign.bossRoomStorage ? { ...campaign.bossRoomStorage, roomId, lifecycle: 'IN_PLAY' } : undefined, activeThreatRuntime: resumed.activeThreatRuntime ? { ...resumed.activeThreatRuntime,
    consumedOnceKeys: [...new Set([...resumed.activeThreatRuntime.consumedOnceKeys, ...context.consumedOnceKeys])] } : null };
}

/** A saved Preparation Day tie can be resolved without initializing a second encounter. */
export function resolveBossThreatCheckpointChoice(campaign: CampaignState, choiceId: string, selectedId: string): CampaignState {
  if (campaign.battle || !campaign.bossEncounterCheckpoint) throw new Error('No available Threat checkpoint');
  const saved = campaign.bossEncounterCheckpoint;
  validateThreatCheckpoint(campaign, saved);
  const context = saved.checkpointContext!;
  const heroes = campaign.heroes.filter(h => !h.dead).map((hero, index) => ({ ...makeHeroUnit(hero, index, campaign), bossCombatDodge: context.heroDodge[`u_${hero.instanceId}`] }));
  const battle: BattleState = { battleId: context.battleId, sourceRoomId: saved.roomId, status: 'active', round: saved.round,
    maxRounds: 4, heroes, monsters: [], initiativeOrder: heroes.map(h => h.id), initiativeIndex: -1, activeActorId: null,
    currentActionPoints: 0, selectedSkillId: null, selectedTargetId: null, battleLog: [], rewards: { gold: 0 }, bossEncounter: structuredClone(saved) };
  const resolved = applyBossRuntimeInput(battle, { type: 'CHOICE', choiceId, selectedId });
  return { ...campaign, bossEncounterCheckpoint: resolved.bossEncounter! };
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
  if (ended.bossEncounter!.checkpointContext) ended.bossEncounter!.checkpointContext.consumedOnceKeys = [...(campaign.activeThreatRuntime?.consumedOnceKeys ?? [])];
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
  return { ...result, bossRoomStorage: campaign.bossRoomStorage ? { ...campaign.bossRoomStorage, lifecycle: 'RETURNED' } : undefined, bossEncounterCheckpoint: null, bossEncounterHistory: [...(result.bossEncounterHistory ?? []), cleaned.bossEncounter!] };
}

/** Production selector reserves one versioned Threat encounter and one authoritative Room card/tile. */
export function reserveProductionBossEncounter(campaign: CampaignState): CampaignState {
  if (campaign.runtimeContentProfile !== 'community-complete-edition' || campaign.currentQuestId !== 'face-the-threat'
    || campaign.campaignProgress.activeBossFamilyId !== 'necromancer') return campaign;
  if (campaign.bossEncounterCheckpoint) { validateThreatCheckpoint(campaign, campaign.bossEncounterCheckpoint); return campaign; }
  const level = campaign.campaignProgress.campaignLevel;
  const gate = necromancerProductionDependencyGate(campaign, level);
  if (!gate.enabled) throw new Error('Production Boss dependencies unavailable');
  const room = campaign.dungeon?.rooms.find(r=>r.type==='objective');
  if (!room) throw new Error('Production Boss objective Room missing');
  const version = campaignHeroDodgeRuleSetVersion(campaign);
  const definition = resolveBossDefinition('necromancer', level, version);
  const bindings = Object.fromEntries(campaign.heroes.filter(h=>!h.dead).map(h=>
    ['u_' + h.instanceId, resolveHeroDodge({ heroId: h.heroId, level: h.level, ruleSetVersion: version })]));
  const seed = Array.from(campaign.dungeon!.questRunId).reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);
  const bound = startBossFoundation(campaign, definition, seed, room.id,
    Object.fromEntries(campaign.heroes.filter(h=>!h.dead).map(h=>[h.instanceId,bindings['u_'+h.instanceId].value])), gate.spawnDefinitions);
  const e = bound.battle!.bossEncounter!;
  e.checkpointContext!.heroDodgeBindings = bindings;
  e.checkpointContext!.dependencyAuthority = 'OFFICIAL_SOURCE';
  return { ...campaign, bossEncounterCheckpoint: e, bossRoomStorage: { roomId: room.id, roomCardId: definition.roomCardId,
    tileId: 'tile-10', encounterId: e.checkpointContext!.encounterId, lifecycle: 'RESERVED' } };
}
export function enterProductionBossRoom(campaign: CampaignState, roomId: string): CampaignState {
  const reserved = reserveProductionBossEncounter(campaign);
  const gate = necromancerProductionDependencyGate(reserved, reserved.campaignProgress.campaignLevel);
  if (!gate.enabled || reserved.bossEncounterCheckpoint?.pendingChoice) throw new Error('Production Boss Room entry blocked');
  const resumed=resumeBossFoundation(reserved, roomId);
  return {...resumed,battle:advanceTurn(resumed.battle!)};
}

export function applyBossThreatCheckpointInput(campaign: CampaignState, input: BossRuntimeInput): CampaignState {
  const e=campaign.bossEncounterCheckpoint;
  if (campaign.battle || !e || !['PREPARATION_DAY','CHOICE'].includes(input.type)) throw new Error('No valid Threat preparation checkpoint');
  validateThreatCheckpoint(campaign,e);
  const context=e.checkpointContext!;
  const heroes=campaign.heroes.filter(h=>!h.dead).map((hero,index)=>({...makeHeroUnit(hero,index,campaign),
    bossCombatDodge:context.heroDodge['u_'+hero.instanceId],heroDodgeBinding:context.heroDodgeBindings?.['u_'+hero.instanceId]}));
  const battle: BattleState={battleId:context.battleId,sourceRoomId:e.roomId,status:'active',round:e.round,maxRounds:4,
    heroes,monsters:[],initiativeOrder:[],initiativeIndex:-1,activeActorId:null,currentActionPoints:0,
    selectedSkillId:null,selectedTargetId:null,battleLog:[],rewards:{gold:0},bossEncounter:structuredClone(e)};
  const result=applyBossRuntimeInput(battle,input);
  return {...campaign,bossEncounterCheckpoint:result.bossEncounter!};
}
