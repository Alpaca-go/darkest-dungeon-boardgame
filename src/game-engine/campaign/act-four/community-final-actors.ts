import type { BattleState, BattleUnit, CampaignState, Stance } from '../../../types';
import type { FinalFormId } from '../../../types/final-encounter';
import { getAliveReflections } from './final-forms/ancestor-first-form';

export const COMMUNITY_FINAL_FORM_SOURCE: Record<FinalFormId, string> = {
  'ancestor-first-form': 'community-dd-final-form-ancestor-first-form',
  'ancestor-second-form': 'community-dd-final-form-ancestor-second-form',
  'gestating-heart': 'community-dd-final-form-gestating-heart',
  'heart-of-darkness': 'community-dd-final-form-heart-of-darkness',
};

export function isCommunityFinalBattle(campaign: CampaignState): boolean {
  return campaign.actFourState.contentRuntime?.runtimeProfileId === 'community-reference'
    && !!campaign.actFourState.finalEncounterState
    && !!campaign.battle;
}

export function communityFinalFormUnit(battle: BattleState, formId: FinalFormId): BattleUnit | undefined {
  return battle.monsters.find((unit) => unit.sourceId === COMMUNITY_FINAL_FORM_SOURCE[formId]);
}

export function makeCommunityFinalActor(
  id: string,
  name: string,
  sourceId: string,
  hp: number,
  stance: Stance,
  position: number,
  skills: string[],
): BattleUnit {
  return {
    id,
    name,
    side: 'monster',
    sourceId,
    maxHp: hp,
    hp,
    stress: 0,
    position,
    speed: 1,
    stance,
    isAlive: hp > 0,
    atDeathsDoor: false,
    deathblowRollCount: 0,
    stunned: 0,
    bleed: 0,
    blight: 0,
    marked: false,
    buffs: [],
    debuffs: [],
    actionPoints: 0,
    monsterSkillIds: skills,
    resolveTestedThisQuest: false,
    resolveState: 'normal',
    virtueId: null,
    afflictionId: null,
    mentalEffectResolvedTurnId: null,
  };
}

export function materializeCommunityFinalBattle(campaign: CampaignState): CampaignState {
  if (!campaign.battle || campaign.actFourState.contentRuntime?.runtimeProfileId !== 'community-reference') return campaign;
  const encounter = campaign.actFourState.finalEncounterState;
  const formId = encounter?.activeFormId;
  const runtimeState = campaign.actFourState.finalFormRuntimeState;
  if (!encounter || !formId || !runtimeState) return campaign;
  const formUnit = communityFinalFormUnit(campaign.battle, formId);
  if (!formUnit) return campaign;

  let monsters = campaign.battle.monsters;
  const runtime = runtimeState.runtimes[formId];
  if (formId === 'ancestor-first-form' && runtime?.kind === 'ancestor-first-form') {
    const missing = runtime.reflections.filter((reflection) => !monsters.some((unit) => unit.id === reflection.id));
    const extras = missing.map((reflection, index) => makeCommunityFinalActor(
      reflection.id,
      reflection.kind === 'perfect' ? 'Perfect Reflection' : 'Imperfect Reflection',
      reflection.kind === 'perfect' ? 'community-dd-perfect-reflection' : 'community-dd-imperfect-reflection',
      reflection.maxWounds ?? 0,
      reflection.stance,
      index + 2,
      reflection.kind === 'perfect' ? ['reunion', 'we-are-the-same'] : ['it-chooses', 'we-are-the-same'],
    ));
    monsters = [...monsters, ...extras];
  }

  const reflectionIds = monsters.filter((unit) => unit.sourceId.includes('reflection')).map((unit) => unit.id);
  const copies = Array.from({ length: Math.max(1, runtime && 'initiativeCardCount' in runtime ? runtime.initiativeCardCount : 1) }, () => formUnit.id);
  const uniqueCopies = formId === 'ancestor-first-form' ? [formUnit.id] : copies;
  const withoutForm = campaign.battle.initiativeOrder.filter((id) => id !== formUnit.id && !reflectionIds.includes(id));
  const initiativeOrder = formId === 'ancestor-first-form'
    ? [...withoutForm, ...(runtime && runtime.kind === 'ancestor-first-form' ? runtime.reflections.map((item) => item.id) : []), formUnit.id]
    : [...withoutForm, ...uniqueCopies];

  const guarded = formId === 'ancestor-first-form' && runtime?.kind === 'ancestor-first-form' && getAliveReflections(runtime).length > 0;
  const nothingnessIds = runtime?.kind === 'ancestor-second-form'
    ? runtime.nothingness.filter((item) => !item.targetable).map((item) => item.id)
    : [];
  const battle: BattleState = {
    ...campaign.battle,
    monsters,
    initiativeOrder,
    communityFinal: {
      formId,
      ancestorUnitId: formUnit.id,
      guarded,
      forbiddenTargetIds: [
        ...(guarded ? [formUnit.id] : []),
        ...nothingnessIds,
      ],
    },
  };
  return { ...campaign, battle };
}
