import type { BattleUnit } from './index';

export type RuleAuthority = 'OFFICIAL_SOURCE' | 'PROJECT_RULING';
export type BossEncounterPhase = 'SETUP' | 'THREAT_ACTIVE' | 'BOSS_ROOM' | 'BATTLE_ACTIVE' | 'BATTLE_RESOLVING' | 'VICTORY' | 'CLEANUP' | 'COMPLETE';
export type ChoiceType = 'CHOICE_TARGET_HERO' | 'CHOICE_TARGET_AREA' | 'CHOICE_REANIMATION_DEATH' | 'CHOICE_PLACEMENT_DESTINATION' | 'CHOICE_DISPLACEMENT_CHARACTER' | 'CHOICE_DEATH_EFFECT';
export interface PendingChoice {
  choiceId: string;
  choiceType: ChoiceType;
  sourceEffectId: string;
  candidateIds: string[];
  createdAtEventId: string;
  selectedId: string | null;
  status: 'PENDING' | 'COMMITTED';
  ruleSetVersion: string;
  continuation: BossContinuation;
}
export interface BossRuntimeEvent {
  eventId: string;
  eventType: string;
  sourceCardId: number;
  authority: RuleAuthority;
  rulingId?: string;
  actor: string | null;
  targets: string[];
  result: unknown;
  parentEventId: string | null;
  ruleSetVersion: string;
}
export interface SummonSupplyEntry {
  total: number;
  available: number;
  active: number;
  spentThisBattle: number;
  permanentlyRemoved: number;
  tokens: Array<{ tokenId: string; state: 'available' | 'active' | 'spentThisBattle' | 'permanentlyRemoved'; instanceId: string | null }>;
}
export type SummonSupplyLedger = Record<string, SummonSupplyEntry>;
export interface BossRoomArea { id: string; capacity: number; highGround: boolean; }
export interface BossSkill {
  number: number; name: string; range: number; targetCount: number; accuracy: number;
  crit: number | { state: string }; critDamage: number | { state: string }; damage: number | { state: string };
  stress: number; self: { direction: string; count: number }; targetEffect: { monster: string };
}
export interface BossDefinitionContract {
  family: string;
  level: 1 | 2 | 3;
  ruleSetVersion: string;
  ruleSourcePolicyId: string;
  battleCardId: number;
  threatAbilityCardId: number;
  bossIdentityCardId: number;
  roomCardId: number;
  roomNumber: number;
  bossStartArea: string;
  heroStartArea: string;
  initialStance: string;
  stats: { HP: number; speed: number; dodge: number; type: string[]; glyphMeanings: Record<string, string>; immunityTokens: string[]; resistanceTokens: string[] };
  actionsPerRound: number;
  skills: BossSkill[];
  attackTable: Array<{ rollMin: number; rollMax: number; skill: number }>;
  areas: BossRoomArea[];
  adjacency: string[][];
  supply: Array<{ name: string; digitalBattleSupplyLimit: number; role: string }>;
  reanimation: boolean;
  captainThreat: boolean;
  hamlet: 'BLOCK_GRAVEYARD' | 'FORCE_GRAVEYARD_USE' | 'FORCE_GRAVEYARD_NO_USE';
  alias: { printedLiteral: string; rulebookP38Literal: string; runtimeIdentity: string };
  sourceFieldIds: string[];
}
/** A resolved definition is required; the executor never parses card text or invents Life. */
export interface SpawnDefinition {
  definitionId: string;
  sourceCardId: number;
  dataAuthority: RuleAuthority | 'TEST_FIXTURE';
  ruleSetVersion: string;
  life: number;
  speed: number;
  large: boolean;
  occupiedSlots: number;
  tags: string[];
  skillIds: string[];
  /** Already resolved effects; runtime does not parse a dying component's printed text. */
  onDeathEffects?: Array<{ effectId: string; targetIds: string[]; damage: number }>;
  onDeathOrder?: string[];
}
export interface DeathSnapshot {
  instanceId: string;
  definition: SpawnDefinition;
  areaId: string;
  correspondingAreaId: string;
  unit: BattleUnit;
  tokenId: string | null;
}
export type BossContinuation =
  | { kind: 'graveyard' }
  | { kind: 'skill'; skillNumber: number; attackRoll: number | null; parentEventId: string; movementDone?: boolean; selfPushDone?: boolean }
  | { kind: 'boss-move' | 'self-push'; skillNumber: number; attackRoll: number | null; parentEventId: string; targetAreaId: string }
  | { kind: 'spawn'; definitionId: string; areaId: string; parentEventId: string; displacedId?: string }
  | { kind: 'reanimate'; deaths: DeathSnapshot[]; parentEventId: string }
  | { kind: 'death-effects'; deaths: DeathSnapshot[]; remainingEffectIds: string[]; nestedDeathIds: string[]; parentEventId: string };
export interface BossEncounterState {
  bossFamily: string;
  bossLevel: 1 | 2 | 3;
  ruleSetVersion: string;
  definition: BossDefinitionContract;
  roomId: string;
  battleCardId: number;
  threatAbilityCardId: number;
  bossIdentityCardId: number;
  phase: BossEncounterPhase;
  round: number;
  side: 'THREAT' | 'ABILITY';
  bossState: { actorId: string | null; lastActionRound: number; storage: 'IN_PLAY' | 'BOSS_ENCOUNTER_STORAGE' };
  summonSupply: SummonSupplyLedger;
  activeSummons: string[];
  queuedDeathIds: string[];
  spawnDefinitions: Record<string, SpawnDefinition>;
  placements: Record<string, string>;
  correspondingAreas: Record<string, string>;
  reanimationState: { firstDeathWindowConsumed: boolean; lockedEventId: string | null };
  threatState: { firstBattleConsumed: boolean; preparationDayConsumed: boolean; forcedHeroId: string | null; permanentlyRemovedDefinitionIds: string[]; appearedDefinitionIds: string[]; appearedTokenIds: string[] };
  pendingChoice: PendingChoice | null;
  eventSequence: number;
  events: BossRuntimeEvent[];
  inputs: BossRuntimeInput[];
  rngState: number;
  clockCursor: number;
  idCursor: number;
  idSeed: number;
  cleanupState: { completed: boolean; campaignTransactionId: string | null; roomCleaned: boolean };
  /** Bridge metadata for checkpoints created from C1C30 onward. */
  checkpointContext?: {
    schemaVersion: 1;
    encounterId: string;
    battleId: string;
    campaignId: string;
    questRunId: string;
    campaignLevel: number;
    threatId: string;
    definitionVersion: string;
    consumedOnceKeys: string[];
    heroDodge: Record<string, number>;
    heroCombatDefinitions?: Record<string, import('./component-combat').HeroCombatDefinition>;
    dependencyAuthority: 'EXPLICIT_BINDING' | 'OFFICIAL_SOURCE';
  };
}
export type BossRuntimeInput =
  | { type: 'ENTER_BOSS_ROOM' }
  | { type: 'PREPARATION_DAY'; rolls: Record<string, number> }
  | { type: 'FIRST_DUNGEON_BATTLE' }
  | { type: 'SKILL'; skillRoll?: number; attackRoll?: number }
  | { type: 'CHOICE'; choiceId: string; selectedId: string }
  | { type: 'DEATHS'; instanceIds: string[] }
  | { type: 'MONSTER_DAMAGE'; amounts: Record<string, number> }
  | { type: 'END_THREAT_BATTLE' }
  | { type: 'CLEANUP' };
