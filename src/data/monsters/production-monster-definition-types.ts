/** Compact content contract. Capability support is reuse evidence, never execution authorization. */
export type MonsterRuntimeCapabilityStatus =
  | 'SUPPORTED_EXISTING_PRIMITIVE' | 'SUPPORTED_EXISTING_COMPOSITION'
  | 'NEEDS_NEW_RUNTIME_PRIMITIVE' | 'DEFERRED_SEMANTIC' | 'NO_RUNTIME_EFFECT';
export interface CompactMonsterRequirement {
  requirementId: string;
  status: MonsterRuntimeCapabilityStatus;
  primitiveIds: readonly string[];
  deferredIds: readonly string[];
  reason?: string;
}
/** Authoring/audit evidence stays out of the gameplay payload. */
export interface MonsterRequirement extends CompactMonsterRequirement {
  implementationPaths: readonly string[];
  implementationSymbols: readonly string[];
  reason: string;
}
export interface CompactMonsterProfile {
  life: number | null; speed: number | null; dodge: number | null;
  size: string | null; occupiedSpaces: number | null; stanceSlots: number | null;
  deployment: string | null;
  tags: readonly string[] | null; resistances: readonly string[] | null; immunities: readonly string[] | null;
  protection: boolean | null;
}
export type CompactMonsterEffect = {
  kind: 'KNOWN_PRIMITIVE' | 'EXISTING_COMPOSITION' | 'NEW_PRIMITIVE';
  primitiveId: string;
  parameters: Readonly<Record<string, string | number | boolean | null>>;
  capability: CompactMonsterRequirement;
} | {
  kind: 'DEFERRED'; deferredIds: readonly string[]; reason: string;
  capability: CompactMonsterRequirement;
};
export type CompactMonsterStance =
  | { kind: 'SKILL_TABLE'; rows: readonly { min: number; max: number; actionId: string }[] }
  | { kind: 'INHERITS'; stance: string } | { kind: 'NO_ACTION' }
  | { kind: 'SOURCE_UNRESOLVED'; reason: string };
export interface CompactMonsterAction {
  actionId: string; number: number; printedName: string;
  range: { kind: 'EXACT'; distance: number } | { kind: 'SELF' } | null;
  targets: number | 'ALL_HEROES' | null;
  targeting: { priority: string; markedFirst: boolean; targetSide: string };
  attack: { kind: 'ROLL'; accuracy: number; damage: number; crit: number; critDamage: number }
    | { kind: 'PRINTED_ABSENT' };
  effects: readonly CompactMonsterEffect[];
  requirements: readonly CompactMonsterRequirement[];
  capability: MonsterRuntimeCapabilityStatus;
}
export interface ProductionMonsterDefinition {
  definitionId: string; identityId: string; printedName: string; contentSet: string;
  group: string | null; level: number | null;
  profile: CompactMonsterProfile;
  actions: readonly CompactMonsterAction[];
  selection: Readonly<Record<string, CompactMonsterStance>>;
  definitionRequirements: readonly CompactMonsterRequirement[];
  sourceContentVersion: string;
}
export interface ProductionMonsterIdentity {
  identityId: string; printedName: string; contentSet: string; definitionIds: readonly string[];
}
