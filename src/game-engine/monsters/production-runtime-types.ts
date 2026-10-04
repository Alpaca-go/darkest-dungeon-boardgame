import type { BattleUnit } from '../../types';
import type { CompactMonsterAction, CompactMonsterEffect } from '../../data/monsters/production-monster-definition-types';

export const PRODUCTION_MONSTER_RUNTIME_VERSION = 'C3C-GENERIC-MONSTER-RUNTIME-v1';
export type ProductionRuntimeUnit = Pick<BattleUnit, 'id' | 'side' | 'isAlive' | 'hp' | 'maxHp' |
  'stress' | 'stance' | 'position' | 'marked'> & { areaId: string; guardStacks: number };
export interface ProductionMonsterRuntimeRequest {
  actorUnitId: string;
  definitionId: string;
  stance: string;
  skillRoll?: number;
  /** One pinned attack die shared across target resolutions, matching the accepted staged pipeline. */
  attackRoll?: number;
}
export type KnownMonsterEffect = Exclude<CompactMonsterEffect, { kind: 'DEFERRED' }>;
export type MonsterRuntimeOperation = {
  kind: 'ATTACK'; actorId: string; targetId: string; roll: number;
  attack: Extract<CompactMonsterAction['attack'], { kind: 'ROLL' }>;
  markedDamageBonus: number;
} | {
  kind: 'EFFECT'; actorId: string; targetId: string; relativeToId: string;
  primitiveId: string; parameters: KnownMonsterEffect['parameters'];
  /** Index in the immutable compact definition, retained even for delayed operations. */
  effectIndex: number;
  oncePerAction: boolean;
  timing: 'BEFORE_ATTACK' | 'ON_HIT' | 'PRINTED_EFFECT' | 'AFTER_ACTION';
  hitTargetId: string | null;
};
export type ProductionMonsterRuntimeResult =
  | { status: 'READY' | 'EXECUTED'; definitionId: string; actionId: string;
      runtimeVersion: string; targetIds: readonly string[]; operations: readonly MonsterRuntimeOperation[] }
  | { status: 'NO_ACTION'; reason: string }
  | { status: 'DEFERRED_SEMANTIC'; actionId: string | null; deferredIds: readonly string[]; reason: string }
  | { status: 'UNKNOWN'; actionId: string | null; reason: string }
  | { status: 'OUT_OF_RANGE'; actionId: string; requiredRange: number; targetIds: readonly string[] };

/** Read-only spatial boundary: no encounter, deck, campaign or source-audit ownership. */
export interface ProductionMonsterEnvironment {
  units(): readonly ProductionRuntimeUnit[];
  distance(fromId: string, toId: string): number;
}
/** Synchronous isolated execution. C3D may consume READY operations through its staged pipeline instead.
 * Preflight must validate every operation and all adapter RNG/choice dependencies before any mutation.
 * attack uses the existing printed attack/damage contract and returns the hit after reaction resolution.
 * effect binds existing engine helpers, including damage for self-wounds and both shuffle dimensions.
 */
export interface ProductionMonsterExecutionAdapter extends ProductionMonsterEnvironment {
  preflight(operations: readonly MonsterRuntimeOperation[]): void;
  attack(operation: Extract<MonsterRuntimeOperation, { kind: 'ATTACK' }>): { hit: boolean };
  effect(operation: Extract<MonsterRuntimeOperation, { kind: 'EFFECT' }>): void;
}
