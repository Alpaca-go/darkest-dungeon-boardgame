// Phase 11A — Core Campaign Audit shared types.
// These mirror the contracts in docs/Darkest_Dungeon_Web_Phase11A_*.md §6/§10/§15/§34.

export type OfficialDataStatus = 'verified' | 'partial' | 'prototype' | 'unavailable';
export type RuntimeReadiness = 'official-ready' | 'framework-only' | 'blocked' | 'not-in-scope';

export interface ContentManifestEntry {
  id: string;
  category: string;
  sourceFile?: string;
  sourceReference?: string;
  officialDataStatus: OfficialDataStatus;
  runtimeReadiness: RuntimeReadiness;
  enabledInOfficialPool: boolean;
  definitionHash?: string;
  dependencies: string[];
  missingFields: string[];
  auditNotes: string[];
}

export interface CoreCampaignContentManifest {
  version: string;
  heroes: ContentManifestEntry[];
  heroSkills: ContentManifestEntry[];
  quests: ContentManifestEntry[];
  threats: ContentManifestEntry[];
  bosses: ContentManifestEntry[];
  monsters: ContentManifestEntry[];
  rooms: ContentManifestEntry[];
  roomTiles: ContentManifestEntry[];
  curios: ContentManifestEntry[];
  lootChests: ContentManifestEntry[];
  trinkets: ContentManifestEntry[];
  quirks: ContentManifestEntry[];
  diseases: ContentManifestEntry[];
  afflictions: ContentManifestEntry[];
  virtues: ContentManifestEntry[];
  hamletEvents: ContentManifestEntry[];
  buildings: ContentManifestEntry[];
  buildingUpgrades: ContentManifestEntry[];
  provisions: ContentManifestEntry[];
  darkestDungeonQuests: ContentManifestEntry[];
  guardians: ContentManifestEntry[];
  finalForms: ContentManifestEntry[];
  generatedAt: string;
}

export type RuleSourceType =
  | 'rulebook'
  | 'battle-card'
  | 'room-card'
  | 'quest-card'
  | 'threat-card'
  | 'implementation-policy';

export type RuleTraceabilityStatus =
  | 'implemented-and-tested'
  | 'implemented-not-tested'
  | 'data-missing'
  | 'implementation-missing'
  | 'out-of-scope';

export interface RuleTraceabilityRecord {
  id: string;
  /** 规则优先级：P0 = 核心盒主循环必须成立的规则。 */
  priority: 'P0' | 'P1' | 'P2';
  ruleDomain: string;
  ruleSummary: string;
  sourceReference: string;
  sourceType: RuleSourceType;
  implementationFiles: string[];
  definitionIds: string[];
  testIds: string[];
  status: RuleTraceabilityStatus;
  notes: string[];
}

export type AuditIssueSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type AuditIssueStatus = 'open' | 'fixed' | 'verified' | 'deferred';

export interface AuditIssue {
  id: string;
  severity: AuditIssueSeverity;
  domain: string;
  title: string;
  description: string;
  sourceReference?: string;
  reproductionSeed?: string;
  reproductionCommands: string[];
  expected: string;
  actual: string;
  firstBadEventIndex?: number;
  stateHash?: string;
  status: AuditIssueStatus;
  fixCommit?: string;
  regressionTestIds: string[];
}

export interface ReferenceValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  context?: string;
}

export interface CampaignMilestoneHash {
  id: string;
  label: string;
  stateHash: string;
  rngSnapshotId: string;
  party: string[];
  stagecoach: string[];
  gold: number;
  xp: number;
  buildings: string[];
  boss: string | null;
  questCount: number;
  saveVersion: number;
  contentManifestHash: string;
  pendingTransactionCount: number;
}

export interface GameEventRecord {
  index: number;
  type: string;
  command?: string;
  payload?: unknown;
  stateHashBefore: string;
  stateHashAfter: string;
}

export interface RngSnapshotRecord {
  index: number;
  seedId: string;
  drawIndex: number;
  value: number;
}

export interface CampaignReplayBundle {
  campaignId: string;
  seedId: string;
  initialStateHash: string;
  events: GameEventRecord[];
  rngSnapshots: RngSnapshotRecord[];
  milestoneHashes: CampaignMilestoneHash[];
  finalStateHash: string;
  buildVersion: string;
  contentManifestHash: string;
}

export interface ReleaseGateResult {
  buildPasses: boolean;
  unitPasses: boolean;
  integrationPasses: boolean;
  criticalE2EPasses: boolean;
  goldenCampaignPasses: boolean;
  replayDeterminismPasses: boolean;
  openP0: number;
  openP1: number;
  prototypeReferencesInOfficialPath: number;
  duplicateCommittedTransactions: number;
  engineDeadlocks: number;
  elevenQuestLoopClosed: boolean;
  campaignVictoryReachable: boolean;
  campaignOverReachable: boolean;
  threeGuardiansPass: boolean;
  threeSkippedFormsPass: boolean;
  fourRuinsBossesPass: boolean;
  saveResumeKeyNodesPass: boolean;
  ruleTraceabilityP0Complete: boolean;
  passed: boolean;
  verdict: 'PASS' | 'CONDITIONAL' | 'FAIL';
  conclusion: string;
}

/** Deterministic FNV-1a 32-bit hash over a stable JSON representation. */
export function stableHash(input: unknown): string {
  const json = typeof input === 'string' ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Stable hash of a campaign-ish object for milestone comparison (sorted keys). */
export function stableHashState(state: unknown): string {
  return stableHash(sortDeep(state));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
