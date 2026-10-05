import type { OrdinaryRuinsEncounter, RuinsDrawState } from './encounter-draw';
import { reserveRuinsSummonCopy, returnRuinsSummonCopies, validateRuinsDrawState } from './encounter-draw';
import type { BattleState } from '../../types';
import { ruinsMonster } from './source-registry';

/** Locked Core Rules p6/p38: finite Bone miniatures are distinct from Monster cards. */
export const NECROMANCER_BONE_FIGURE_COUNTS = {
  'bone-rabble': 3, 'bone-soldier': 3, 'bone-spearman': 3, 'bone-captain': 1,
} as const;
export type BoneFigureFamily = keyof typeof NECROMANCER_BONE_FIGURE_COUNTS;
export type FigureOwner = { location: 'AVAILABLE' }
  | { location: 'ORDINARY' | 'SUMMON' | 'REANIMATION' | 'SUMMON_DEFEATED'; encounterId: string };
export interface BoneFigureSupplyState {
  schemaVersion: 1;
  figureOwners: Record<string, FigureOwner>;
  ordinaryAssignments: Record<string, Record<string, string>>;
}

export interface NecromancerFigureBinding {
  encounterId: string;
  supply: BoneFigureSupplyState;
  tokenFigures: Record<string, string>;
  draw?: RuinsDrawState;
  tokenCards: Record<string, string>;
}

/** Explicit successor binding. Historical encounters never acquire this ledger implicitly. */
export function bindNecromancerFigures(battle: BattleState, supply: BoneFigureSupplyState, draw?: RuinsDrawState): BattleState {
  if (!battle.bossEncounter || battle.necromancerFigureBinding || battle.bossEncounter.eventSequence !== 1
    || battle.bossEncounter.events[0]?.eventType !== 'ENCOUNTER_SETUP')
    throw new Error('Necromancer figure binding requires an unstarted summon ledger');
  validateBoneFigureSupply(supply, draw);
  const next = structuredClone(battle);
  next.necromancerFigureBinding = { encounterId: battle.bossEncounter.checkpointContext?.encounterId ?? battle.battleId,
    supply: structuredClone(supply), tokenFigures: {}, tokenCards: {}, ...(draw ? { draw: structuredClone(draw) } : {}) };
  for (const token of Object.values(battle.bossEncounter.summonSupply).flatMap(entry => entry.tokens).filter(item => item.state === 'active')) {
    const assignment = Object.entries(supply.ordinaryAssignments).flatMap(([encounterId, copies]) =>
      Object.entries(copies).map(([copyId, id]) => ({ encounterId, copyId, id })))
      .find(item => token.instanceId === `ruins:${item.encounterId}:${item.copyId}`);
    if (!assignment) throw new Error('Existing summon token has no ordinary physical identity');
    next.necromancerFigureBinding.tokenFigures[token.tokenId] = assignment.id;
    next.necromancerFigureBinding.tokenCards[token.tokenId] = assignment.copyId;
  }
  validateNecromancerFigures(next);
  return next;
}

export function hasNecromancerFigure(battle: BattleState, family: string): boolean {
  if (!battle.necromancerFigureBinding) return true;
  const binding = battle.necromancerFigureBinding;
  const cardAvailable = !binding.draw || ruinsMonster(family, binding.draw.ruleSetVersion).physicalCopyIds
    .some(id => binding.draw!.ownership[id]?.location === 'DECK');
  return cardAvailable && !!Object.entries(binding.supply.figureOwners)
    .find(([id, owner]) => familyOf(id) === family && owner.location === 'AVAILABLE');
}

export function commitNecromancerFigure(battle: BattleState, family: string, tokenId: string, reanimation: boolean): void {
  const binding = battle.necromancerFigureBinding;
  if (!binding) return;
  if (!families.includes(family as BoneFigureFamily)) throw new Error('Summon physical family unbound');
  if (reanimation) {
    const id = binding.tokenFigures[tokenId];
    if (!id) throw new Error('Reanimation token has no physical figure');
    if (binding.supply.figureOwners[id].location !== 'ORDINARY')
      binding.supply = reanimateSummonFigure(binding.supply, id, binding.encounterId);
  } else {
    if (binding.tokenFigures[tokenId]) throw new Error('Summon token already has a figure');
    const result = reserveNecromancerSummonFigure(binding.supply, family as BoneFigureFamily, binding.encounterId, family === 'bone-captain');
    binding.supply = result.state;
    binding.tokenFigures[tokenId] = result.figureId;
    if (binding.draw) {
      const id = ruinsMonster(family, binding.draw.ruleSetVersion).physicalCopyIds
        .find(copyId => binding.draw!.ownership[copyId]?.location === 'DECK');
      if (!id) throw new Error('Physical summon Monster card unavailable');
      binding.draw = reserveRuinsSummonCopy(binding.draw, id, binding.encounterId);
      binding.tokenCards[tokenId] = id;
    }
  }
}

export function defeatNecromancerFigure(battle: BattleState, tokenId: string): void {
  const binding = battle.necromancerFigureBinding;
  if (!binding) return;
  const id = binding.tokenFigures[tokenId], owner = binding.supply.figureOwners[id];
  if (!id || !owner || !['SUMMON', 'REANIMATION', 'ORDINARY'].includes(owner.location)) throw new Error('Defeated summon figure unbound');
  if (owner.location === 'ORDINARY') return;
  binding.supply.figureOwners[id] = { location: 'SUMMON_DEFEATED', encounterId: binding.encounterId };
}

export function returnNecromancerFigures(battle: BattleState): void {
  const binding = battle.necromancerFigureBinding;
  if (!binding) return;
  for (const id of Object.values(binding.tokenFigures)) if (binding.supply.figureOwners[id].location !== 'ORDINARY')
    binding.supply.figureOwners[id] = { location: 'AVAILABLE' };
  binding.tokenFigures = {};
  if (binding.draw) binding.draw = returnRuinsSummonCopies(binding.draw, binding.encounterId);
  binding.tokenCards = {};
  validateBoneFigureSupply(binding.supply, binding.draw);
}

export function validateNecromancerFigures(battle: BattleState): void {
  const binding = battle.necromancerFigureBinding;
  if (!binding) return;
  if (!battle.bossEncounter) throw new Error('Figure binding requires Boss runtime');
  validateBoneFigureSupply(binding.supply, binding.draw);
  const entries = Object.entries(binding.tokenFigures);
  if (new Set(entries.map(([, id]) => id)).size !== entries.length) throw new Error('Duplicate summon figure ownership');
  for (const [tokenId, id] of entries) {
    const token = Object.values(battle.bossEncounter.summonSupply).flatMap(entry => entry.tokens).find(item => item.tokenId === tokenId);
    const owner = binding.supply.figureOwners[id];
    if (!token || !['active','spentThisBattle'].includes(token.state) || familyOf(tokenId) !== familyOf(id) || !owner || owner.location === 'AVAILABLE'
      || owner.location !== 'ORDINARY' && (owner.encounterId !== binding.encounterId || (token.state === 'active' ? !['SUMMON','REANIMATION'].includes(owner.location)
        : token.state === 'spentThisBattle' ? owner.location !== 'SUMMON_DEFEATED' : true)))
      throw new Error('Summon token/figure ledgers differ');
    if (binding.draw) {
      const copyId = binding.tokenCards[tokenId], cardOwner = binding.draw.ownership[copyId];
      if (!copyId || familyOf(copyId) !== familyOf(tokenId) || !cardOwner
        || (owner.location === 'ORDINARY' ? cardOwner.location !== 'ENCOUNTER' || cardOwner.encounterId !== owner.encounterId
          || binding.supply.ordinaryAssignments[owner.encounterId]?.[copyId] !== id
          : cardOwner.location !== 'SUMMON_POOL' || cardOwner.encounterId !== binding.encounterId))
        throw new Error('Summon token/card ledgers differ');
    }
  }
  if (Object.values(battle.bossEncounter.summonSupply).flatMap(entry => entry.tokens)
    .some(token => ['active','spentThisBattle'].includes(token.state) && !binding.tokenFigures[token.tokenId]))
    throw new Error('Summon token missing physical figure');
  if (binding.draw && (Object.keys(binding.tokenCards).length !== entries.length
    || new Set(Object.values(binding.tokenCards)).size !== entries.length)) throw new Error('Duplicate or orphan summon card');
}

const figureId = (family: BoneFigureFamily, index: number) => `${family}:figure-${index}`;
const families = Object.keys(NECROMANCER_BONE_FIGURE_COUNTS) as BoneFigureFamily[];
function familyOf(id: string): BoneFigureFamily | null {
  return families.find(family => id === family || id.startsWith(`${family}:`)) ?? null;
}

export function createBoneFigureSupply(): BoneFigureSupplyState {
  return { schemaVersion: 1, ordinaryAssignments: {}, figureOwners: Object.fromEntries(
    families.flatMap(family => Array.from({ length: NECROMANCER_BONE_FIGURE_COUNTS[family] }, (_, index) =>
      [figureId(family, index + 1), { location: 'AVAILABLE' }]))),
  };
}

export function validateBoneFigureSupply(state: BoneFigureSupplyState, draw?: RuinsDrawState): void {
  const expected = families.flatMap(family => Array.from({ length: NECROMANCER_BONE_FIGURE_COUNTS[family] }, (_, index) =>
    figureId(family, index + 1))).sort();
  if (state.schemaVersion !== 1 || Object.keys(state.figureOwners).sort().join('|') !== expected.join('|'))
    throw new Error('Bone figure inventory census mismatch');
  const assigned = Object.entries(state.ordinaryAssignments).flatMap(([encounterId, copies]) =>
    Object.entries(copies).map(([copyId, id]) => ({ encounterId, copyId, id })));
  if (new Set(assigned.map(entry => entry.id)).size !== assigned.length) throw new Error('Bone figure has duplicate ordinary owner');
  for (const [id, owner] of Object.entries(state.figureOwners)) {
    if (!['AVAILABLE', 'ORDINARY', 'SUMMON', 'REANIMATION', 'SUMMON_DEFEATED'].includes(owner.location)
      || (owner.location !== 'AVAILABLE' && !owner.encounterId?.trim())) throw new Error('Bone figure owner invalid');
    const assignment = assigned.find(entry => entry.id === id);
    if (owner.location === 'ORDINARY' ? !assignment || assignment.encounterId !== owner.encounterId : !!assignment)
      throw new Error('Bone figure assignment differs from ledger');
  }
  if (draw) {
    validateRuinsDrawState(draw);
    for (const assignment of assigned) {
      const encounter = draw.encounters.find(entry => entry.encounterId === assignment.encounterId && !entry.returned);
      const monster = encounter?.monsters.find(entry => entry.copyId === assignment.copyId);
      if (!monster || familyOf(assignment.id) !== familyOf(monster.definitionId)
        || draw.ownership[assignment.copyId]?.location !== 'ENCOUNTER')
        throw new Error('Bone figure ordinary assignment lacks active card provenance');
    }
    for (const encounter of draw.encounters.filter(entry => !entry.returned)) {
      const copies = state.ordinaryAssignments[encounter.encounterId];
      if (copies && encounter.monsters.some(monster => familyOf(monster.definitionId) && !copies[monster.copyId]))
        throw new Error('Active Bone card has no assigned figure');
    }
  }
}

/** Physical figure allocation is independent of the ordinary Monster card deck. */
export function assignOrdinaryBoneFigures(state: BoneFigureSupplyState, draw: RuinsDrawState,
  encounter: OrdinaryRuinsEncounter): BoneFigureSupplyState {
  validateBoneFigureSupply(state, draw);
  const already = state.ordinaryAssignments[encounter.encounterId];
  if (already) return state;
  if (encounter.returned || !draw.encounters.some(entry => entry.encounterId === encounter.encounterId && !entry.returned))
    throw new Error('Active ordinary encounter required for figure assignment');
  const next = structuredClone(state);
  const assignments: Record<string, string> = {};
  for (const monster of encounter.monsters) {
    const family = familyOf(monster.definitionId);
    if (!family) continue;
    const id = Object.keys(next.figureOwners).sort().find(candidate => familyOf(candidate) === family
      && next.figureOwners[candidate].location === 'AVAILABLE');
    if (!id) throw new Error(`Physical Bone figure unavailable: ${family}`);
    next.figureOwners[id] = { location: 'ORDINARY', encounterId: encounter.encounterId };
    assignments[monster.copyId] = id;
  }
  next.ordinaryAssignments[encounter.encounterId] = assignments;
  validateBoneFigureSupply(next, draw);
  return next;
}

export function reserveNecromancerSummonFigure(state: BoneFigureSupplyState, family: BoneFigureFamily,
  encounterId: string, captainInjection = false): { state: BoneFigureSupplyState; figureId: string } {
  validateBoneFigureSupply(state);
  if (!encounterId.trim() || family === 'bone-captain' && !captainInjection)
    throw new Error('Necromancer figure reservation unavailable');
  const id = Object.keys(state.figureOwners).sort().find(candidate => familyOf(candidate) === family
    && state.figureOwners[candidate].location === 'AVAILABLE');
  if (!id) throw new Error(`Physical Bone figure unavailable: ${family}`);
  const next = structuredClone(state);
  next.figureOwners[id] = { location: 'SUMMON', encounterId };
  validateBoneFigureSupply(next);
  return { state: next, figureId: id };
}

export function markSummonFigureDefeated(state: BoneFigureSupplyState, id: string, encounterId: string): BoneFigureSupplyState {
  validateBoneFigureSupply(state);
  const owner = state.figureOwners[id];
  if (owner?.location !== 'SUMMON' || owner.encounterId !== encounterId) throw new Error('Summon figure ownership mismatch');
  const next = structuredClone(state);
  next.figureOwners[id] = { location: 'SUMMON_DEFEATED', encounterId };
  return next;
}

/** Reanimation moves the same figure identity; it never manufactures another miniature. */
export function reanimateSummonFigure(state: BoneFigureSupplyState, id: string, encounterId: string): BoneFigureSupplyState {
  validateBoneFigureSupply(state);
  const owner = state.figureOwners[id];
  if (owner?.location !== 'SUMMON_DEFEATED' || owner.encounterId !== encounterId) throw new Error('Reanimation figure unavailable');
  const next = structuredClone(state);
  next.figureOwners[id] = { location: 'REANIMATION', encounterId };
  return next;
}

export function returnOrdinaryBoneFigures(state: BoneFigureSupplyState, encounterId: string): BoneFigureSupplyState {
  validateBoneFigureSupply(state);
  const assignments = state.ordinaryAssignments[encounterId];
  if (!assignments) return state;
  const next = structuredClone(state);
  for (const id of Object.values(assignments)) next.figureOwners[id] = { location: 'AVAILABLE' };
  delete next.ordinaryAssignments[encounterId];
  validateBoneFigureSupply(next);
  return next;
}
