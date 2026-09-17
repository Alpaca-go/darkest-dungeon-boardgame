import { expect } from 'vitest';
import type { CampaignState } from '../../../types';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { advanceTurn, endHeroTurn, runMonsterTurn } from '../../../game-engine/battle';
import { beginHeroSkillAction } from '../../../game-engine/trinkets/battle-trinket-bridge';
import { commitBattleVictory } from '../../../game-engine/commands/battle';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { resolveEchoingDisassembly } from '../../../game-engine/bosses/shuffling-horror/echoing-disassembly-summon';
import { appendShufflingSummonBattleUnits } from '../../../game-engine/bosses/shuffling-horror/shuffling-horror-runtime';
import { createSaveSnapshot, migrateSaveFile, restoreSaveSnapshot, validateSaveFile } from '../../../game-engine/save';
import { startFinalHamlet, advanceFinalHamletDay } from '../../../game-engine/campaign/act-four/final-hamlet';
import { setRandomSource } from '../../../game-engine/random';

export const noRng = (): never => { throw new Error('Unexpected RNG consumption'); };
export const actors = ['templars-impaler', 'templars-warlord', 'mammoth-cyst', 'white-cell-stalk', 'shuffling-horror'] as const;
export const summonedActors = ['cultist-priest', 'malignant-growth'] as const;
export type Actor = typeof actors[number];
export type CombatActor = Actor | typeof summonedActors[number];
export function scriptedD10(...rolls: number[]) {
  const queue = [...rolls];
  setRandomSource(() => {
    if (queue.length === 0) return 0.49;
    return (queue.shift()! - 0.5) / 10;
  });
}
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
export function targetId(campaign: CampaignState, actor: CombatActor): string {
  const unit = campaign.battle!.monsters.find(unit => unit.sourceId === `community-dd-${actor}`);
  expect(unit).toBeDefined();
  return unit!.id;
}
export function deployShufflingSummons(campaign = createCommunityGuardianScenario(0)): CampaignState {
  const echo = resolveEchoingDisassembly(campaign.actFourState.shufflingHorrorEncounterState!, 'capability-echo');
  expect(echo.ok, echo.reason ?? '').toBe(true);
  expect(echo.summonedRoles).toEqual(['cultist-priest', 'malignant-growth']);
  return {
    ...campaign,
    battle: appendShufflingSummonBattleUnits(campaign.battle!, echo.state, echo.summonedRoles),
    actFourState: { ...campaign.actFourState, shufflingHorrorEncounterState: echo.state },
  };
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
export function communityAttack(actor: Exclude<CombatActor, 'mammoth-cyst' | 'white-cell-stalk'>, skillRoll: number, hitRoll: number) {
  const campaign = summonedActors.includes(actor as typeof summonedActors[number]) ? deployShufflingSummons() : scenario(actor as Actor);
  const hero = campaign.battle!.heroes.find(unit => unit.isAlive)!;
  scriptedD10(skillRoll, hitRoll);
  const result = runMonsterTurn(campaign.battle!, targetId(campaign, actor));
  const event = result.communityAttackEvents?.at(-1);
  expect(event).toBeDefined();
  expect(event!.attackRoll).toBe(hitRoll);
  return { before: campaign.battle!, result, heroId: hero.id, campaign: { ...campaign, battle: result } };
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
  let campaign = index === 2 ? summon() : index === 0 ? deployShufflingSummons() : createCommunityGuardianScenario(index);
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
