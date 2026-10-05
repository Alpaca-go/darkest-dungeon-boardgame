import type { SpawnDefinition } from './boss-runtime';

export interface CombatSourceReference {
  path: string;
  sha256: string;
  region: string;
  page?: number;
}
export interface HeroCombatDefinition {
  heroId: string;
  level: 1 | 2 | 3;
  dodge: number;
  sourceReferences: CombatSourceReference[];
}
export interface PrintedMonsterSkill {
  number: number;
  name: string;
  range: number;
  targets: number;
  targeting: 'Closest' | 'Furthest' | 'Most Wounded' | 'Crowded';
  accuracy: number;
  damage: number;
  crit: number;
  critDamage: number;
  selfPull: number;
  targetPush: number;
  targetDebuffTurns: number;
  targetStunTurns: number;
}
export interface BoneCombatDependency {
  monsterId: string;
  displayName: string;
  life: number;
  speed: number;
  dodge: number;
  size: 'NORMAL' | 'LARGE';
  skills: PrintedMonsterSkill[];
  /** Null is an unresolved selection, never an instruction to use Skill 1. */
  stanceSelections: Record<string, Array<{ min: number; max: number; skill: number }> | null>;
  immunities: string[];
  resistances: string[];
  initiative: { cardsPerInstance: number; sourceReferences: CombatSourceReference[] };
  sourceReferences: CombatSourceReference[];
  unresolvedFields: string[];
  status: 'PARTIAL' | 'IMPLEMENTED' | 'SOURCE_REVIEW_COMPLETE';
}
export interface ProductionMonsterDefinition extends SpawnDefinition {
  definitionStatus: 'EXECUTABLE_PRODUCTION_DEFINITION';
  componentDefinitionVersion: string;
  ordinaryNecromancerSummonPool: boolean;
  displayName: string;
  dodge: number;
  skills: PrintedMonsterSkill[];
  stanceSelections: BoneCombatDependency['stanceSelections'];
  initiative: BoneCombatDependency['initiative'];
  immunities: string[];
  resistances: string[];
  sourceReferences: CombatSourceReference[];
}

/** Source-bound attack continuation shared by ordinary Monsters and Bosses. */
export interface SourceMonsterAttack {
  skill: import('./index').MonsterSkillDefinition;
  criticalEnabled: boolean;
  criticalThreshold: number;
  criticalDamage: number;
  targetPush: number;
  remainingHeroes: string[];
  alreadyResolvedHeroes: string[];
  successfulHits: string[];
  parentEventId: string;
  targetAreaId: string;
  summonDefinitionId: string | null;
  skillNumber: number;
}
