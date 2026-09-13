import { expect } from 'vitest';
import type { CampaignState } from '../../../types';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { advanceTurn, endHeroTurn } from '../../../game-engine/battle';
import { beginHeroSkillAction } from '../../../game-engine/trinkets/battle-trinket-bridge';
import { commitBattleVictory } from '../../../game-engine/commands/battle';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { createSaveSnapshot, migrateSaveFile, restoreSaveSnapshot, validateSaveFile } from '../../../game-engine/save';
import { startFinalHamlet, advanceFinalHamletDay } from '../../../game-engine/campaign/act-four/final-hamlet';

export const noRng = (): never => { throw new Error('Unexpected RNG consumption'); };
export const actors = ['templars-impaler', 'templars-warlord', 'mammoth-cyst', 'white-cell-stalk', 'shuffling-horror'] as const;
export type Actor = typeof actors[number];
export function reload(campaign: CampaignState): CampaignState {
  const file = migrateSaveFile(JSON.parse(JSON.stringify(createSaveSnapshot(campaign))));
  expect(file).not.toBeNull();
  expect(validateSaveFile(file)).toBeNull();
  return restoreSaveSnapshot(file!);
}
export function scenario(actor: Actor): CampaignState {
  const index = actor.startsWith('templars') ? 1 : actor === 'shuffling-horror' ? 0 : 2;
  let campaign = createCommunityGuardianScenario(index);
  if (actor === 'white-cell-stalk') campaign = summon(campaign);
  expect(campaign.battle).not.toBeNull();
  return campaign;
}
export function targetId(campaign: CampaignState, actor: Actor): string {
  const unit = campaign.battle!.monsters.find(unit => unit.sourceId === `community-dd-${actor}`);
  expect(unit).toBeDefined();
  return unit!.id;
}
export function summon(campaign = createCommunityGuardianScenario(2)): CampaignState {
  const card = campaign.actFourState.mammothCystEncounterState!.initiativeCards.find(card => card.owner === 'mammoth-cyst')!;
  const result = executeMammothCystAction(campaign, card.id, { mode: 'community-reference', rng: () => 0, now: '2026-09-12T00:00:01.000Z' });
  expect(result.ok, result.reason ?? '').toBe(true);
  expect(result.actionType).toBe('summon-linked-actor');
  return result.campaign;
}
export function attack(actor: 'mammoth-cyst' | 'white-cell-stalk', skillRoll: number, hitRoll: number, campaign = summon()) {
  const state = campaign.actFourState.mammothCystEncounterState!;
  const cards = state.initiativeCards.filter(card => card.owner === actor);
  const card = actor === 'mammoth-cyst' ? cards[1] : cards[0];
  const heroId = campaign.heroes[0].instanceId;
  const rolls = [skillRoll, hitRoll];
  const result = executeMammothCystAction(campaign, card.id, { mode: 'community-reference', targetHeroId: heroId, rng: () => {
    const roll = rolls.shift();
    if (roll === undefined) throw new Error('Attack used more than skill/hit dice');
    return (roll - 0.5) / 10;
  }, now: '2026-09-12T00:00:02.000Z' });
  expect(result.ok, result.reason ?? '').toBe(true);
  expect(rolls).toEqual([]);
  return { before: campaign, result, cardId: card.id, heroId };
}

/** Play registered Hero skills from a real setup, without editing HP/actor/transaction state. */
export function defeatWithHeroSkills(campaign: CampaignState, actor: Actor): CampaignState {
  const id = targetId(campaign, actor);
  let next = campaign;
  for (let step = 0; step < 200 && next.battle!.monsters.find(unit => unit.id === id)!.isAlive; step++) {
    const battle = next.battle!;
    expect(battle.status).toBe('active');
    if (!battle.activeActorId) { next = { ...next, battle: advanceTurn(battle) }; continue; }
    const active = battle.heroes.find(unit => unit.id === battle.activeActorId);
    expect(active).toBeDefined();
    if (active!.position > 3) { next = { ...next, battle: endHeroTurn(battle, active!.id) }; continue; }
    const action = beginHeroSkillAction(next, 'crusader-holy-lance', id);
    expect(action.error).toBeNull();
    expect(action.paused).toBe(false);
    next = action.campaign;
  }
  expect(next.battle!.monsters.find(unit => unit.id === id)).toMatchObject({ hp: 0, isAlive: false });
  return next;
}
export function win(index: 0 | 1 | 2): CampaignState {
  let campaign = index === 2 ? summon() : createCommunityGuardianScenario(index);
  const targets: Actor[] = index === 1 ? ['templars-impaler', 'templars-warlord'] : index === 2 ? ['mammoth-cyst'] : ['shuffling-horror'];
  for (const actor of targets) campaign = defeatWithHeroSkills(campaign, actor);
  const result = commitBattleVictory(campaign);
  expect(result.ok).toBe(true);
  expect(result.campaign.actFourState.guardianQuestState?.status).toBe('victory');
  return result.campaign;
}
export function finalReady(): CampaignState {
  const started = startFinalHamlet(win(2), { rng: () => 0 });
  expect(started.ok).toBe(true);
  let campaign = started.campaign;
  for (let day = 1; day <= 4; day++) {
    const advanced = advanceFinalHamletDay(campaign, { rng: () => 0 });
    expect(advanced.ok).toBe(true);
    campaign = advanced.campaign;
  }
  expect(campaign.actFourState.stage).toBe('final-encounter-ready');
  return campaign;
}
