/** Integration-only fixtures. Selection/eligibility authority is never inferred from these manifests. */
import type { BattleState, CampaignState } from '../types';
import type { CompactMonsterAction, ProductionMonsterDefinition } from '../data/monsters/production-monster-definition-types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { makeHeroUnit, freezePendingMonsterAttack, commitPendingMonsterAttackResolution } from '../game-engine/battle';
import { initializeProductionMonsterBattle } from '../game-engine/monsters/production-encounter';
import { withProductionMonsterSources, resolveProductionMonsterChoice } from '../game-engine/monsters/production-battle-runtime';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { resolveHeroDodgeForHero, HERO_DODGE_V2 } from '../game-engine/rules/hero-dodge';

export function productionBattleFixture(d: ProductionMonsterDefinition, a: CompactMonsterAction): CampaignState {
  const campaign = withRuntimeSources(seededRuntimeSources(333), () => applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor'])));
  const heroes = campaign.heroes.map((h, index) => { const binding = resolveHeroDodgeForHero(h, HERO_DODGE_V2);
    return { unit: { ...makeHeroUnit(h, index, campaign), hp: 100, maxHp: 100, heroDodgeBinding: binding }, areaId: 'a' + (a.range?.kind === 'EXACT' ? a.range.distance : 0) }; });
  const targetArea = heroes[0].areaId;
  const width = d.profile.stanceSlots ?? 1;
  const allies = width === 2 ? [3, 4] : [2, 3];
  const stances = ['aggressive', 'defensive', 'ranged', 'support'] as const;
  const battle = initializeProductionMonsterBattle({ encounterId: 'c3d-fixture:' + a.actionId, seed: 333,
    areas: Array.from({ length: 6 }, (_, i) => ({ id: 'a' + i, capacity: 8,
      adjacent: [i - 1, i + 1].filter(n => n >= 0 && n < 6).map(n => 'a' + n) })), heroes,
    monsters: [{ instanceId: 'actor', definitionId: d.definitionId, stance: 'aggressive', areaId: 'a0' },
      ...allies.map(i => ({ instanceId: 'ally' + i, definitionId: 'bone-soldier', stance: stances[i - 1], areaId: targetArea }))],
    initiative: ['actor', ...heroes.map(h => h.unit.id), ...allies.map(i => 'ally' + i)] });
  battle.activeActorId = 'actor'; battle.initiativeIndex = 0;
  battle.monsters = battle.monsters.map(u => u.id === 'actor' ? { ...u, hp: Math.max(1, u.hp - 1) } : { ...u, hp: 2 });
  return { ...campaign, battle };
}

/** Uses the same staged freeze/commit helpers; reaction-window tests separately exercise the Campaign bridge. */
export function drainProductionBattle(state: BattleState): BattleState {
  let b = state;
  for (let i = 0; i < 100; i++) {
    const c = b.productionMonsterContext!;
    if (c.pendingChoice) { b = resolveProductionMonsterChoice(b, c.pendingChoice.choiceId, c.pendingChoice.candidateIds[0]); continue; }
    if (b.pendingMonsterAttack) { b = withProductionMonsterSources(b, current => commitPendingMonsterAttackResolution(freezePendingMonsterAttack(current))); continue; }
    if (!c.pendingExecution || c.blocker) return b;
    throw new Error('Production continuation stalled');
  }
  throw new Error('Production fixture guard exceeded');
}
