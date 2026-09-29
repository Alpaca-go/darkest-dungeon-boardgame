import type { CombatSourceReference } from './component-combat';

export type HeroDodgeRuleSetVersion = 'C1C28-DIGITAL-DEFAULT-v1' | 'C1C31-DIGITAL-DEFAULT-v2';
export interface ResolvedHeroDodge {
  heroId: string;
  level: 1 | 2 | 3;
  value: number;
  authority: 'OFFICIAL_SOURCE' | 'PROJECT_RULING';
  canonical: boolean;
  canonicalSourceStatus: 'OFFICIAL_SOURCE' | 'SOURCE_UNRESOLVED';
  rulingId: string | null;
  sourceReferences: CombatSourceReference[];
  ruleSetVersion: HeroDodgeRuleSetVersion;
}
/** Serializable rule-only record. It does not create or promote a combat encounter. */
export interface HeroDodgeReplayRecord {
  schemaVersion: 1;
  recordId: string;
  ruleSetVersion: HeroDodgeRuleSetVersion;
  bindings: ResolvedHeroDodge[];
}
export interface HeroDodgeRuleSetSelection {
  schemaVersion: 1;
  ruleSetVersion: HeroDodgeRuleSetVersion;
  explicitMigration: {
    migrationId: string;
    fromVersion: 'C1C28-DIGITAL-DEFAULT-v1';
    toVersion: 'C1C31-DIGITAL-DEFAULT-v2';
    policyId: 'C1C31R-PRE-ENCOUNTER-EXPLICIT-MIGRATION-v1';
  };
}
