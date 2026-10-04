import type { BattleUnit, Stance } from '../../types';
import type { MonsterRuntimeOperation } from './production-runtime-types';

export const PRODUCTION_MONSTER_INTEGRATION_VERSION = 'C3D-MONSTER-INTEGRATION-v1';
export interface ProductionMonsterPendingExecution {
  runtimeVersion: string; actorUnitId: string; definitionId: string; actionId: string;
  targetIds: string[]; skillRoll: number; attackRoll: number; operationIndex: number;
  operations: MonsterRuntimeOperation[]; parentEventId: string;
  phase: 'MOVEMENT' | 'OPERATIONS'; hits: Record<string, boolean>; appliedEffectIndices: number[];
  diseaseDraws: Record<number, string>; criticalStressHeroIds: string[];
}
export interface ProductionMonsterChoice {
  choiceId: string; integrationVersion: string; parentEventId: string;
  kind: 'MOVEMENT' | 'SHUFFLE' | 'LARGE_DISPLACEMENT'; actorId: string; relativeToId: string;
  candidateIds: string[]; resumePhase: 'MOVEMENT' | 'OPERATIONS';
}
export interface ProductionMonsterBattleContext {
  schemaVersion: 1; integrationVersion: string; runtimeVersion: string; encounterId: string;
  definitionIds: Record<string, string>; placements: Record<string, string>;
  occupiedSpaces: Record<string, number>;
  /** Temporary Protection lives in BattleUnit.printedConditionTokens, shared with Hero damage readers. */
  protectionStorage: 'BATTLE_UNIT_PRINTED_CONDITION_TOKENS';
  rngCursor: number; rngCalls: number;
  pendingExecution: ProductionMonsterPendingExecution | null; pendingChoice: ProductionMonsterChoice | null;
  blocker: { status: 'DEFERRED_SEMANTIC' | 'UNKNOWN'; definitionId: string;
    actionId: string | null; deferredIds: readonly string[]; skillRoll: number; reason: string } | null;
  events: Array<{ eventId: string; parentEventId: string | null; type: string; detail: Record<string, unknown> }>;
  physicalCopyIds: Record<string, string>;
}
/** Explicit authority of selection belongs to the caller, never to printed level inference. */
export interface ProductionMonsterEncounterManifest {
  encounterId: string; seed: number;
  areas: Array<{ id: string; adjacent: string[]; capacity: number }>;
  monsters: Array<{ instanceId: string; definitionId: string; stance: Stance; areaId: string; physicalCopyId?: string }>;
  heroes: Array<{ unit: BattleUnit; areaId: string }>;
  initiative: string[];
}
