import { createHash } from 'node:crypto';
import type { CampaignState } from '../../src/types';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../../src/game-engine/save';
import { seededRuntimeSources, withRuntimeSources } from '../../src/game-engine/runtime-sources';
import { beginHeroSkillAction, resolveTrinketOpportunity } from '../../src/game-engine/trinkets/battle-trinket-bridge';
import { endHeroTurn, heroSkillActionError } from '../../src/game-engine/battle';
import { getSkillById } from '../../src/data/skills';
import { settleBattleState, commitBattleVictory } from '../../src/game-engine/commands/battle';
import { applyBossFoundationInput } from '../../src/game-engine/commands/boss-foundation';
import { commitOrdinaryRuinsChoice } from '../../src/game-engine/commands/ordinary-ruins';
import { enterDungeonRoom } from '../../src/game-engine/commands/dungeon';
import { chooseNecromancerPreparationHero, beginNecromancerGraveyardVisit, commitNecromancerGraveyardVisit } from '../../src/game-engine/campaign/necromancer-preparation-day';
import { skipHeroAction, endHamletDay } from '../../src/game-engine/hamlet';

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

/** A shared production-command policy, with no state mutation or synthetic damage. */
function step(c: CampaignState): CampaignState {
  const b = c.battle;
  if (b) {
    const opportunity = c.pendingTrinketUseOpportunities.find(o => o.status === 'open');
    if (opportunity) return settleBattleState(resolveTrinketOpportunity(c, opportunity.id, 'decline').campaign).campaign;
    const ordinary = b.ruinsContext?.pendingReanimationChoice ?? b.ruinsContext?.pendingChoice;
    if (ordinary) return commitOrdinaryRuinsChoice(c, ordinary.choiceId, ordinary.candidateIds[0]);
    const boss = b.bossEncounter?.pendingChoice;
    if (boss) return settleBattleState(applyBossFoundationInput(c, { type: 'CHOICE', choiceId: boss.choiceId, selectedId: boss.candidateIds[0] })).campaign;
    if (b.status === 'victory') return commitBattleVictory(c).campaign;
    if (b.status === 'defeat') return c;
    const actor = b.heroes.find(h => h.id === b.activeActorId && h.isAlive);
    if (actor) {
      for (const id of actor.equippedSkillIds ?? []) {
        if (getSkillById(id)?.targetSide !== 'enemy') continue;
        const target = b.monsters.find(m => m.isAlive && heroSkillActionError(b, actor.id, id, m.id) === null);
        if (target) return settleBattleState(beginHeroSkillAction(c, id, target.id).campaign).campaign;
      }
      return settleBattleState({ ...c, battle: endHeroTurn(b, actor.id) }).campaign;
    }
    return settleBattleState(c).campaign;
  }
  if (c.gamePhase === 'hamlet') {
    const prep = c.necromancerPreparationDay;
    if (prep?.status === 'PENDING_TIE') return chooseNecromancerPreparationHero(c, prep.checkpoint.pendingChoice!.choiceId, prep.checkpoint.pendingChoice!.candidateIds[0]);
    if (prep?.status === 'PENDING_VISIT') return beginNecromancerGraveyardVisit(c);
    if (prep?.status === 'PENDING_LEVEL_II_EFFECT') return commitNecromancerGraveyardVisit(c, true);
    const hero = c.heroes.find(h => !h.dead && !h.hasActedToday);
    return hero ? skipHeroAction(c, hero.instanceId) : endHamletDay(c);
  }
  if (c.gamePhase === 'dungeon-explore' && c.dungeon) {
    const current = c.dungeon.rooms.find(r => r.id === c.dungeon!.currentRoomId)!;
    const next = current.adjacentRoomIds.find(id => c.dungeon!.rooms.some(r => r.id === id && r.status === 'hidden'));
    return next ? enterDungeonRoom(c, next).campaign : c;
  }
  return c;
}

export function compareProductionReplay(point: string, campaign: CampaignState) {
  const snapshot = withRuntimeSources(seededRuntimeSources(3233), () => createSaveSnapshot(campaign));
  const error = validateSaveFile(snapshot);
  if (error) throw new Error(`${point}: ${error}`);
  const reloaded = restoreSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
  if (hash(reloaded) !== hash(campaign)) throw new Error(`${point}: restored state differs`);
  const suffix = (initial: CampaignState) => withRuntimeSources(seededRuntimeSources(3233), () => {
    let c = structuredClone(initial);
    // Continue the current Battle/Preparation segment, including the actual pending choice.
    for (let n = 0; n < 400; n++) {
      const before = hash(c), next = step(c);
      c = next;
      if (before === hash(c) || initial.battle && !c.battle || initial.gamePhase === 'hamlet' && c.gamePhase !== 'hamlet') break;
      if (!initial.battle && initial.gamePhase !== 'hamlet') break;
    }
    return c;
  });
  const uninterrupted = suffix(campaign), resumed = suffix(reloaded);
  if (hash(uninterrupted) !== hash(resumed)) throw new Error(`${point}: save/reload continuation differs`);
  // Historical gameplay evidence retains its original envelope version. The real current
  // snapshot above is still validated and restored through the current save implementation.
  const historicalEnvelope = { ...snapshot, version: campaign.saveVersion };
  return { point, status: 'PASS', preSaveHash: hash(campaign), saveHash: hash(historicalEnvelope), reloadedHash: hash(reloaded),
    uninterruptedResultHash: hash(uninterrupted), resumedResultHash: hash(resumed),
    eventSequenceHash: hash(resumed.battle?.ruinsContext?.events ?? resumed.battle?.bossEncounter?.events ?? resumed.bossEncounterHistory?.at(-1)?.events ?? []),
    physicalOwnershipHash: hash({ draw: resumed.ruinsDrawState, figures: resumed.ruinsBoneFigureSupply }),
    ruleSetVersion: campaign.battle?.ruinsContext?.ruleSetVersion ?? campaign.bossEncounterCheckpoint?.ruleSetVersion
      ?? campaign.necromancerPreparationDay?.checkpoint.ruleSetVersion ?? campaign.bossEncounterHistory?.at(-1)?.ruleSetVersion };
}
