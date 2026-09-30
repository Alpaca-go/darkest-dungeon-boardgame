import type { BattleState, CampaignState } from '../../types';
import { RUINS_STANCES, RUINS_V6 } from '../../types/ruins-executable';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter, validateRuinsDrawState } from './encounter-draw';
import { beginOrdinaryRuinsBattle, makeRuinsMonsterUnit, validateOrdinaryRuinsBattle } from './battle-runtime';
import { createBoneFigureSupply, validateBoneFigureSupply } from './physical-supply';
import { ruinsMonster, ruinsMonsterDefinitions, ruinsTile } from './source-registry';
import { recordBossRuntimeEvent, withBossEncounterSources } from '../bosses/foundation';
import { validateThreatCheckpoint } from '../bosses/threat-checkpoint';
import { isNonUnholy, isReanimationEligible } from '../bosses/threat-semantics';
import { shuffleWithRng } from '../campaign/act-four/rng';
import { withTransactionRecorded } from '../campaign/campaign-orchestrator';
import { advanceTurn, checkEnd } from '../battle';

export function hasProductionOrdinaryThreat(c: CampaignState): boolean {
  return c.ruinsRuleSetSelection?.ruleSetVersion === RUINS_V6
    && c.bossEncounterCheckpoint?.bossFamily === 'necromancer'
    && !!c.bossEncounterCheckpoint.checkpointContext?.heroDodgeBindings;
}

/** Transient event/source adapter. Never attached to the ordinary Battle or persisted twice. */
function shell(c: CampaignState): BattleState {
  const checkpoint = c.bossEncounterCheckpoint!;
  return { battleId: checkpoint.checkpointContext!.battleId, sourceRoomId: checkpoint.roomId,
    status: 'active', round: 1, maxRounds: 4, heroes: [], monsters: [], initiativeOrder: [],
    initiativeIndex: -1, activeActorId: null, currentActionPoints: 0, selectedSkillId: null,
    selectedTargetId: null, battleLog: [], rewards: { gold: 0 }, bossEncounter: checkpoint };
}
function event(c: CampaignState, type: string, detail: unknown, targets: string[] = [], ruling?: string, parent: string | null = null) {
  return recordBossRuntimeEvent(shell(c), type, detail, targets, ruling, parent);
}
function seed(text: string): number {
  return Array.from(text).reduce((n, char) => Math.imul(n ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

/** First guarded Room allocates the one persistent deck. Captain changes only its order, never RNG. */
export function enterProductionOrdinaryThreat(campaign: CampaignState, roomId: string): CampaignState {
  if (!hasProductionOrdinaryThreat(campaign) || campaign.battle || !campaign.dungeon
    || campaign.dungeon.currentRoomId !== roomId) throw new Error('Production ordinary Threat entry unavailable');
  validateThreatCheckpoint(campaign, campaign.bossEncounterCheckpoint!);
  const next = structuredClone(campaign);
  const e = next.bossEncounterCheckpoint!;
  const context = e.checkpointContext!;
  const encounterId = `${context.encounterId}:ordinary:${roomId}`;
  if (!next.ruinsDrawState) {
    next.ruinsDrawState = createRuinsDrawState(e.bossLevel,
      seed(`${next.id}:${context.questRunId}:${context.threatId}:ruins-v6`), RUINS_V6);
    const excluded = ruinsMonsterDefinitions(RUINS_V6).filter(d => e.threatState.permanentlyRemovedDefinitionIds.includes(d.canonicalId))
      .flatMap(d => d.physicalCopyIds);
    next.ruinsDrawState.monsterDeck = next.ruinsDrawState.monsterDeck.filter(id => !excluded.includes(id));
    for (const id of excluded) if (next.ruinsDrawState.ownership[id]) next.ruinsDrawState.ownership[id] = { location: 'PERMANENTLY_REMOVED' };
  }
  next.ruinsBoneFigureSupply ??= createBoneFigureSupply();
  if (next.ruinsDrawState.level !== e.bossLevel || next.ruinsDrawState.ruleSetVersion !== RUINS_V6)
    throw new Error('Ordinary draw differs from pinned Threat');
  if (!e.threatState.firstBattleConsumed) {
    e.threatState.firstBattleConsumed = true;
    if (e.definition.captainThreat) {
      const parent = event(next, 'CAPTAIN_THREAT_CONSUMED', { firstMonster: true, ordinaryEncounterId: encounterId }, [], 'NECRO_CAPTAIN_PROJECT_COMPONENT_BINDING');
      const captain = ruinsMonster('bone-captain', RUINS_V6);
      const copy = captain.physicalCopyIds.find(id => next.ruinsDrawState!.ownership[id]?.location === 'DECK');
      const figure = Object.keys(next.ruinsBoneFigureSupply.figureOwners).find(id => id.startsWith('bone-captain:')
        && next.ruinsBoneFigureSupply!.figureOwners[id].location === 'AVAILABLE');
      let available = !!copy && !!figure;
      if (available) {
        const proposed = structuredClone(next.ruinsDrawState);
        proposed.monsterDeck = [copy!, ...proposed.monsterDeck.filter(id => id !== copy)];
        // Probe the accepted initial draw on a clone; failure consumes neither live draw nor live RNG.
        try { drawOrdinaryRuinsEncounter(proposed, encounterId,
          Object.fromEntries(next.heroes.filter(h => !h.dead).map(h => [h.instanceId, h.stance]))); }
        catch (error) {
          if (!(error instanceof Error) || !error.message.includes('placement')) throw error;
          available = false;
        }
        if (available) next.ruinsDrawState = proposed;
      }
      event(next, available ? 'CAPTAIN_INITIAL_DRAW_BOUND' : 'CAPTAIN_SUPPRESSED_INITIAL_PLACEMENT',
        { copyId: available ? copy : null, figureId: available ? figure : null, noReplacement: true }, [], undefined, parent);
    }
  }
  next.ruinsDrawState = drawOrdinaryRuinsEncounter(next.ruinsDrawState, encounterId,
    Object.fromEntries(next.heroes.filter(h => !h.dead).map(h => [h.instanceId, h.stance])));
  const entered = beginOrdinaryRuinsBattle(next, encounterId);
  const b = entered.battle!, r = b.ruinsContext!;
  r.executionSchemaVersion = 2;
  r.threatEncounterId = context.encounterId;
  r.unitPhysicalBindings = Object.fromEntries(b.monsters.map((unit, i) => [unit.id,
    { copyId: r.physicalCopyIds[i], definitionId: unit.sourceId, generation: 0, predecessorUnitId: null }]));
  r.retiredMonsterInstances = [];
  r.pendingThreatDeathIds = [];
  r.pendingReanimationChoice = null;
  for (const id of Object.values(r.definitionIds)) {
    if (!e.threatState.appearedDefinitionIds.includes(id)) e.threatState.appearedDefinitionIds.push(id);
  }
  event(entered, 'ORDINARY_THREAT_BATTLE_ENTERED', { encounterId, tileId: r.tileId,
    definitionIds: r.definitionIds, physicalBindings: r.unitPhysicalBindings });
  entered.battle = advanceTurn(b);
  validateProductionOrdinaryThreat(entered);
  return entered;
}

/** Battle-only damage boundary freezes the set; the Campaign command owns Threat mutation. */
export function captureOrdinaryThreatDeaths(battle: BattleState): BattleState {
  if (battle.ruinsContext?.executionSchemaVersion !== 2) return battle;
  const ids = battle.monsters.filter(m => !m.isAlive).map(m => m.id);
  if (!ids.length || battle.ruinsContext.pendingThreatDeathIds?.length) return battle;
  const b = structuredClone(battle);
  b.ruinsContext!.pendingThreatDeathIds = ids;
  return b;
}

function reanimate(c: CampaignState, selectedId: string, parent: string, candidates: string[]): void {
  const b = c.battle!, r = b.ruinsContext!, e = c.bossEncounterCheckpoint!;
  const death = r.retiredMonsterInstances!.find(d => d.unit.id === selectedId);
  if (!death || !candidates.includes(selectedId)) throw new Error('Invalid ordinary death choice');
  e.reanimationState.firstDeathWindowConsumed = true;
  event(c, 'REANIMATION_WINDOW_CONSUMED', { selectedId, candidateIds: candidates }, candidates,
    'NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER', parent);
  const definition = ruinsMonster(death.definitionId, RUINS_V6);
  const tile = ruinsTile(r.tileId);
  const area = tile.areas.find(a => a.id === death.correspondingAreaId)!;
  const used = [...b.heroes, ...b.monsters].filter(u => u.isAlive && r.placements[u.id] === area.id)
    .reduce((sum, u) => sum + r.occupiedSpaces[u.id], 0);
  const stance = RUINS_STANCES.find(s => !b.monsters.some(u => u.isAlive && u.stance === s
    || u.isAlive && ruinsMonster(u.sourceId, RUINS_V6).stanceSlots === 2 && u.position + 1 === RUINS_STANCES.indexOf(s) + 1));
  if (used + definition.occupiedSpaces > area.capacity || !stance) {
    event(c, 'REANIMATION_IGNORED_NO_SPACE', { correspondingAreaId: area.id }, [selectedId], undefined, parent);
  } else {
    const encounter = c.ruinsDrawState!.encounters.find(entry => entry.encounterId === r.encounterId)!;
    const placement = encounter.monsters.find(entry => entry.copyId === death.copyId)!;
    const unit = makeRuinsMonsterUnit(encounter, { ...placement, stance, areaId: area.id });
    const generation = death.generation + 1;
    unit.id = `${unit.id}:generation:${generation}`;
    b.monsters.push(unit);
    r.unitPhysicalBindings![unit.id] = { copyId: death.copyId, definitionId: death.definitionId,
      generation, predecessorUnitId: selectedId };
    r.definitionIds[unit.id] = death.definitionId;
    r.placements[unit.id] = area.id;
    r.occupiedSpaces[unit.id] = definition.occupiedSpaces;
    b.largeMovementContract!.placements[unit.id] = area.id;
    b.largeMovementContract!.occupiedSpaces[unit.id] = definition.occupiedSpaces;
    const completed = b.initiativeOrder.slice(0, b.initiativeIndex + 1);
    const remaining = b.initiativeOrder.slice(b.initiativeIndex + 1);
    const working = withBossEncounterSources(shell(c), (s, rng) => {
      b.initiativeOrder = [...completed, ...shuffleWithRng(rng, [...remaining, unit.id])];
      return s;
    });
    c.bossEncounterCheckpoint = working.bossEncounter;
    event(c, 'REANIMATION_SPAWNED', { instanceId: unit.id, predecessorUnitId: selectedId,
      definitionId: death.definitionId, copyId: death.copyId, generation, areaId: area.id,
      figureId: c.ruinsBoneFigureSupply?.ordinaryAssignments[r.encounterId]?.[death.copyId] ?? null },
    [unit.id], 'NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER', parent);
  }
  r.pendingReanimationChoice = null;
  event(c, 'DEATH_CHAIN_RESUMED', { oldInstanceIds: candidates }, [], 'NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER', parent);
}

/** Atomic checkpoint + instance update. Source definitions carry no on-death effects in this registry. */
export function synchronizeOrdinaryThreatDeaths(campaign: CampaignState): CampaignState {
  if (campaign.battle?.ruinsContext?.executionSchemaVersion !== 2) return campaign;
  if (campaign.battle.ruinsContext.pendingReanimationChoice) return campaign;
  const captured = captureOrdinaryThreatDeaths(campaign.battle);
  const ids = captured.ruinsContext!.pendingThreatDeathIds ?? [];
  if (!ids.length) return campaign;
  const c = structuredClone({ ...campaign, battle: captured });
  const b = c.battle!, r = b.ruinsContext!, e = c.bossEncounterCheckpoint!;
  const deaths = b.monsters.filter(u => ids.includes(u.id));
  const snapshots = deaths.map(unit => {
    const binding = r.unitPhysicalBindings![unit.id];
    const original = c.ruinsDrawState!.encounters.find(entry => entry.encounterId === r.encounterId)!
      .monsters.find(entry => entry.copyId === binding.copyId)!;
    return { unit: structuredClone(unit), copyId: binding.copyId, definitionId: binding.definitionId,
      generation: binding.generation, areaId: r.placements[unit.id], correspondingAreaId: original.areaId };
  });
  const parent = event(c, 'ATOMIC_DEATH_SNAPSHOT', { ids, ordinaryEncounterId: r.encounterId, snapshots }, ids);
  for (const unit of deaths) {
    r.retiredMonsterInstances!.push({ ...snapshots.find(snapshot => snapshot.unit.id === unit.id)!, deathEventId: parent });
    delete r.placements[unit.id]; delete r.occupiedSpaces[unit.id]; delete r.definitionIds[unit.id];
    delete b.largeMovementContract!.placements[unit.id]; delete b.largeMovementContract!.occupiedSpaces[unit.id];
  }
  const eligible = deaths.filter(u => isReanimationEligible(ruinsMonster(u.sourceId, RUINS_V6).size === 'LARGE')).map(u => u.id);
  const opens = !!e.definition.reanimation && !e.reanimationState.firstDeathWindowConsumed
    && !e.reanimationState.lockedEventId && !!eligible.length;
  if (opens) e.reanimationState.lockedEventId = parent;
  event(c, 'MANDATORY_DEATH_EFFECTS_RESOLVED', { count: 0 }, ids, undefined, parent);
  b.monsters = b.monsters.filter(u => !ids.includes(u.id));
  const prefix = b.initiativeOrder.slice(0, b.initiativeIndex + 1).filter(id => !ids.includes(id));
  b.initiativeOrder = [...prefix, ...b.initiativeOrder.slice(b.initiativeIndex + 1).filter(id => !ids.includes(id))];
  b.initiativeIndex = prefix.length - 1;
  if (b.activeActorId && ids.includes(b.activeActorId)) { b.activeActorId = null; b.currentActionPoints = 0; }
  b.largeMovementContract!.overflow = b.largeMovementContract!.overflow.filter(g => !ids.includes(g.entrantId));
  r.pendingThreatDeathIds = [];
  event(c, 'OLD_INSTANCES_REMOVED', { ids }, ids, undefined, parent);
  if (opens) {
    if (eligible.length > 1) {
      const choiceId = event(c, 'CHOICE_CREATED', { type: 'CHOICE_REANIMATION_DEATH', candidateIds: [...eligible].sort() }, eligible,
        'NECRO_SIMULTANEOUS_FIRST_DEATH_PLAYER_CHOICE', parent);
      r.pendingReanimationChoice = { choiceId: `${choiceId}:choice`, candidateIds: [...eligible].sort(), parentEventId: parent, ruleSetVersion: e.ruleSetVersion };
    } else reanimate(c, eligible[0], parent, eligible);
  }
  if (b.status === 'victory') b.status = 'active';
  c.battle = checkEnd(b);
  validateProductionOrdinaryThreat(c);
  return c;
}

export function chooseOrdinaryReanimation(campaign: CampaignState, choiceId: string, selectedId: string): CampaignState {
  validateProductionOrdinaryThreat(campaign);
  const choice = campaign.battle?.ruinsContext?.pendingReanimationChoice;
  if (!choice || choice.choiceId !== choiceId || !choice.candidateIds.includes(selectedId)) throw new Error('Invalid ordinary Reanimation choice');
  const c = structuredClone(campaign);
  event(c, 'CHOICE_COMMITTED', { choiceId, selectedId }, [selectedId], undefined, choice.parentEventId);
  reanimate(c, selectedId, choice.parentEventId, choice.candidateIds);
  c.battle = checkEnd(c.battle!);
  validateProductionOrdinaryThreat(c);
  return c;
}

/** Called after ordinary card return, before clearing Battle and granting rewards. */
export function endProductionOrdinaryThreat(campaign: CampaignState): CampaignState {
  if (campaign.battle?.ruinsContext?.executionSchemaVersion !== 2) return campaign;
  const c = structuredClone(campaign), r = c.battle!.ruinsContext!, e = c.bossEncounterCheckpoint!;
  if (r.pendingReanimationChoice || r.pendingThreatDeathIds?.length || c.battle!.monsters.some(u => !u.isAlive))
    throw new Error('Ordinary Threat death chain is unsettled');
  const key = `${r.encounterId}:threat-settled`;
  if (e.checkpointContext!.consumedOnceKeys.includes(key)) return campaign;
  if (e.definition.hamlet === 'BLOCK_GRAVEYARD') {
    for (const id of Object.values(r.unitPhysicalBindings!).map(binding => binding.definitionId)) {
      if (isNonUnholy(ruinsMonster(id, RUINS_V6).tags) && !e.threatState.permanentlyRemovedDefinitionIds.includes(id))
        e.threatState.permanentlyRemovedDefinitionIds.push(id);
    }
    const excluded = ruinsMonsterDefinitions(RUINS_V6).filter(d => e.threatState.permanentlyRemovedDefinitionIds.includes(d.canonicalId))
      .flatMap(d => d.physicalCopyIds);
    for (const copyId of excluded) if (c.ruinsDrawState!.ownership[copyId]) c.ruinsDrawState!.ownership[copyId] = { location: 'PERMANENTLY_REMOVED' };
    c.ruinsDrawState!.monsterDeck = c.ruinsDrawState!.monsterDeck.filter(id => !excluded.includes(id));
  }
  e.reanimationState = { firstDeathWindowConsumed: false, lockedEventId: null };
  e.checkpointContext!.consumedOnceKeys.push(key);
  event(c, 'THREAT_BATTLE_ENDED', { ordinaryEncounterId: r.encounterId,
    permanentlyRemovedDefinitionIds: e.threatState.permanentlyRemovedDefinitionIds });
  validateRuinsDrawState(c.ruinsDrawState!);
  return withTransactionRecorded(c, key);
}

export function validateProductionOrdinaryThreat(campaign: CampaignState): void {
  const draw = campaign.ruinsDrawState;
  if (draw && Object.values(draw.ownership).some(owner => owner.location === 'PERMANENTLY_REMOVED')) {
    const authority = campaign.bossEncounterCheckpoint ?? campaign.battle?.bossEncounter
      ?? campaign.bossEncounterHistory?.slice().reverse().find(entry => entry.bossFamily === 'necromancer' && entry.bossLevel === draw.level)
      ?? campaign.necromancerQuestThreatHistory?.slice().reverse().find(entry => entry.checkpoint.bossLevel === draw.level)?.checkpoint;
    if (!authority || authority.bossLevel !== 1 || authority.definition.hamlet !== 'BLOCK_GRAVEYARD')
      throw new Error('Permanent ordinary card removal has no Threat authority');
    for (const definition of ruinsMonsterDefinitions(draw.ruleSetVersion)) {
      const removed = authority.threatState.permanentlyRemovedDefinitionIds.includes(definition.canonicalId);
      if (definition.physicalCopyIds.some(id => draw.ownership[id]
        && (draw.ownership[id].location === 'PERMANENTLY_REMOVED') !== removed))
        throw new Error('Permanent card copies differ from checkpoint removal authority');
    }
  }
  const b = campaign.battle, r = b?.ruinsContext;
  if (r?.executionSchemaVersion !== 2) return;
  const e = campaign.bossEncounterCheckpoint;
  if (!e || b!.bossEncounter || r.ruleSetVersion !== RUINS_V6 || r.threatEncounterId !== e.checkpointContext?.encounterId
    || !r.unitPhysicalBindings || !r.retiredMonsterInstances || !Array.isArray(r.pendingThreatDeathIds))
    throw new Error('Ordinary Threat authoritative checkpoint cross-link invalid');
  validateThreatCheckpoint(campaign, e);
  if (!e.threatState.firstBattleConsumed) throw new Error('Ordinary Threat first Battle consumption rolled back');
  const enteredIndex = e.events.map(entry => entry.eventType).lastIndexOf('ORDINARY_THREAT_BATTLE_ENTERED');
  const consumed = e.events.slice(enteredIndex + 1).find(entry => entry.eventType === 'REANIMATION_WINDOW_CONSUMED');
  if (e.reanimationState.firstDeathWindowConsumed !== !!consumed
    || e.reanimationState.lockedEventId !== (consumed?.parentEventId ?? r.pendingReanimationChoice?.parentEventId ?? null))
    throw new Error('Ordinary Reanimation consumption differs from causal history');
  validateOrdinaryRuinsBattle(b!, campaign.ruinsDrawState);
  if (!campaign.ruinsBoneFigureSupply) throw new Error('Ordinary Threat figures absent');
  validateBoneFigureSupply(campaign.ruinsBoneFigureSupply, campaign.ruinsDrawState);
  for (const death of r.retiredMonsterInstances) {
    const snapshot = e.events.find(entry => entry.eventId === death.deathEventId && entry.eventType === 'ATOMIC_DEATH_SNAPSHOT');
    const detail = snapshot?.result as { snapshots?: Array<Omit<typeof death, 'deathEventId'>> } | undefined;
    const saved = detail?.snapshots?.find(entry => entry.unit.id === death.unit.id);
    const { deathEventId: _eventId, ...instance } = death;
    if (!saved || JSON.stringify(saved) !== JSON.stringify(instance)) throw new Error('Retired death snapshot differs from immutable causal event');
  }
  const choice = r.pendingReanimationChoice;
  if (choice && (!e.definition.reanimation || e.reanimationState.firstDeathWindowConsumed
    || e.reanimationState.lockedEventId !== choice.parentEventId || choice.ruleSetVersion !== e.ruleSetVersion
    || new Set(choice.candidateIds).size !== choice.candidateIds.length || choice.candidateIds.length < 2
    || !e.events.some(entry => `${entry.eventId}:choice` === choice.choiceId && entry.eventType === 'CHOICE_CREATED'
      && JSON.stringify((entry.result as {candidateIds?: string[]}).candidateIds) === JSON.stringify(choice.candidateIds))
    || choice.candidateIds.some(id => !r.retiredMonsterInstances!.some(d => d.unit.id === id && d.deathEventId === choice.parentEventId
      && isReanimationEligible(ruinsMonster(d.definitionId, RUINS_V6).size === 'LARGE'))))) throw new Error('Ordinary death candidates invalid');
}
