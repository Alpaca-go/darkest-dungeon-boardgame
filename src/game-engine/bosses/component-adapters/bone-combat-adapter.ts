import historicalJson from '../../../../docs/data/complete-edition/c1c30-reviewed-component-combat.json?raw';
import { HERO_DODGE_V1, assertHeroDodgeRuleSetVersion } from '../../rules/hero-dodge';
import reviewedJson from '../../../../docs/data/complete-edition/c1c31-necromancer-bone-definition-proof.json?raw';
import type { BoneCombatDependency, ProductionMonsterDefinition } from '../../../types/component-combat';
import { NECROMANCER_RULE_SET_VERSION } from '../../necromancer/contract-adapter';

const reviewed = JSON.parse(reviewedJson) as { definitionVersion?: string; bones: Array<BoneCombatDependency & { sourceCardId: number }> };
export const COMPONENT_COMBAT_VERSION = 'C1C32-BONE-PRODUCTION-v1';
export const NORMAL_NECROMANCER_SUMMON_IDS = ['bone-rabble', 'bone-soldier', 'bone-spearman'] as const;

/** Evidence intake may be partial; it never asserts that partial data is executable. */
export function inspectBoneCombatDependency(monsterId: string): BoneCombatDependency | undefined {
  const historical = JSON.parse(historicalJson) as { monsters: BoneCombatDependency[] };
  const candidate = historical.monsters.find(m=>m.monsterId===monsterId);
  return candidate ? structuredClone(candidate) : undefined;
}
export function inspectProductionBoneCombatDependency(monsterId: string): BoneCombatDependency | undefined {
  const candidate = reviewed.bones.find(m => m.monsterId === monsterId);
  return candidate ? structuredClone(candidate) : undefined;
}
export function validateBoneCombatDependency(candidate: BoneCombatDependency): string[] {
  const errors = [...candidate.unresolvedFields];
  if (!Number.isFinite(candidate.life) || candidate.life <= 0) errors.push('life');
  if (!Number.isInteger(candidate.speed) || candidate.speed < 0) errors.push('speed');
  if (!Number.isInteger(candidate.dodge) || candidate.dodge < 0) errors.push('dodge');
  if (!['NORMAL', 'LARGE'].includes(candidate.size)) errors.push('size');
  if (!candidate.sourceReferences.length || candidate.sourceReferences.some(r => !/^[a-f0-9]{64}$/.test(r.sha256))) errors.push('sourceReferences');
  if (candidate.initiative.cardsPerInstance !== 1 || !candidate.initiative.sourceReferences.length) errors.push('initiative');
  if (!Array.isArray(candidate.immunities) || !Array.isArray(candidate.resistances)) errors.push('conditions');
  if (!candidate.skills.length || new Set(candidate.skills.map(s => s.number)).size !== candidate.skills.length) errors.push('skills');
  for (const skill of candidate.skills) {
    if (![skill.number, skill.range, skill.targets, skill.accuracy, skill.damage, skill.crit, skill.critDamage,
      skill.selfPull, skill.targetPush, skill.targetDebuffTurns, ...(candidate.status === 'SOURCE_REVIEW_COMPLETE' ? [skill.targetStunTurns] : [])].every(Number.isInteger)
      || skill.selfPull < 0 || skill.targetPush < 0 || skill.targetDebuffTurns < 0 || (candidate.status === 'SOURCE_REVIEW_COMPLETE' && skill.targetStunTurns < 0)
      || skill.number <= 0 || skill.targets <= 0 || skill.range < 0 || skill.damage < 0 || skill.crit < 0 || skill.crit > 10
      || !['Closest', 'Furthest', 'Most Wounded', 'Crowded'].includes(skill.targeting)) errors.push(`skills.${skill.number}`);
  }
  for (const stance of ['aggressive', 'defensive', 'ranged', 'support']) {
    const selections = candidate.stanceSelections[stance];
    if (!selections) { errors.push(`stanceSelections.${stance}`); continue; }
    for (let roll = 1; roll <= 10; roll++) {
      const matches = selections.filter(s => roll >= s.min && roll <= s.max);
      if (matches.length !== 1 || !candidate.skills.some(s => s.number === matches[0]?.skill)) errors.push(`stanceSelections.${stance}.roll${roll}`);
    }
  }
  return [...new Set(errors)];
}
/** Required spawn gate. No lookup in the simplified Phase 3 Monster registry. */
export function resolveProductionMonsterDefinition(monsterId: string, ruleSetVersion = NECROMANCER_RULE_SET_VERSION): ProductionMonsterDefinition | undefined {
  assertHeroDodgeRuleSetVersion(ruleSetVersion);
  if (ruleSetVersion === HERO_DODGE_V1) return undefined;
  const candidate = reviewed.bones.find(m => m.monsterId === monsterId);
  if (!candidate || candidate.status !== 'SOURCE_REVIEW_COMPLETE' || validateBoneCombatDependency(candidate).length) return undefined;
  return {
    definitionStatus: 'EXECUTABLE_PRODUCTION_DEFINITION', componentDefinitionVersion: COMPONENT_COMBAT_VERSION,
    ordinaryNecromancerSummonPool: NORMAL_NECROMANCER_SUMMON_IDS.some(id=>id===candidate.monsterId),
    definitionId: candidate.monsterId, displayName: candidate.displayName, sourceCardId: candidate.sourceCardId,
    life: candidate.life, speed: candidate.speed, dodge: candidate.dodge, large: candidate.size === 'LARGE',
    occupiedSlots: candidate.size === 'LARGE' ? 2 : 1, tags: ['Unholy', 'Front'],
    dataAuthority: 'OFFICIAL_SOURCE', ruleSetVersion,
    skillIds: candidate.skills.map(s => `official:${candidate.sourceCardId}:skill:${s.number}`),
    skills: structuredClone(candidate.skills), stanceSelections: structuredClone(candidate.stanceSelections),
    initiative: structuredClone(candidate.initiative), immunities: [...candidate.immunities], resistances: [...candidate.resistances],
    sourceReferences: structuredClone(candidate.sourceReferences),
  };
}
export function productionBoneDefinitions(ruleSetVersion = NECROMANCER_RULE_SET_VERSION): ProductionMonsterDefinition[] {
  return [...NORMAL_NECROMANCER_SUMMON_IDS, 'bone-captain'].flatMap(id => {
    const definition = resolveProductionMonsterDefinition(id, ruleSetVersion);
    return definition ? [definition] : [];
  });
}
