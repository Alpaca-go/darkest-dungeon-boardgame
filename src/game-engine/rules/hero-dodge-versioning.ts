import type { CampaignState } from '../../types';
import type { HeroDodgeReplayRecord, HeroDodgeRuleSetVersion, ResolvedHeroDodge } from '../../types/hero-dodge-rules';
import { assertHeroDodgeRuleSetVersion, HERO_DODGE_V1, HERO_DODGE_V2, resolveHeroDodge } from './hero-dodge';
import {encounterRuleDependencies} from '../bosses/definitions';

export const HERO_DODGE_MIGRATION_POLICY = 'C1C31R-PRE-ENCOUNTER-EXPLICIT-MIGRATION-v1';

/** Validate a recorded binding against its own frozen rule version, never today's campaign version. */
export function replayHeroDodgeRecord(record: HeroDodgeReplayRecord): ResolvedHeroDodge[] {
  if (!record || record.schemaVersion !== 1 || typeof record.recordId !== 'string' || !record.recordId.trim()
    || !Array.isArray(record.bindings) || !record.bindings.length) throw new Error('Invalid Hero Dodge replay record');
  assertHeroDodgeRuleSetVersion(record.ruleSetVersion);
  if (new Set(record.bindings.map(b => `${b.heroId}:${b.level}`)).size !== record.bindings.length) throw new Error('Duplicate Hero Dodge replay pair');
  return record.bindings.map(binding => {
    const expected = resolveHeroDodge({ heroId: binding.heroId, level: binding.level, ruleSetVersion: record.ruleSetVersion });
    for (const field of ['value', 'authority', 'canonical', 'canonicalSourceStatus', 'rulingId', 'ruleSetVersion'] as const) {
      if (binding[field] !== expected[field]) throw new Error(`Hero Dodge replay binding mismatch: ${field}`);
    }
    if (!Array.isArray(binding.sourceReferences) || binding.sourceReferences.length !== expected.sourceReferences.length
      || binding.sourceReferences.some((r, i) => ['path', 'sha256', 'region', 'page'].some(field =>
        r[field as keyof typeof r] !== expected.sourceReferences[i][field as keyof typeof r]))) throw new Error('Hero Dodge replay source mismatch');
    return expected;
  });
}

/** Optional metadata is additive to save v22; legacy absence means v1 and stays absent. */
export function validateHeroDodgeCampaignMetadata(campaign: Partial<CampaignState>): void {
  const selection = campaign.heroDodgeRuleSetSelection;
  if (selection !== undefined) {
    if (!selection || selection.schemaVersion !== 1) throw new Error('Invalid Hero Dodge version selection');
    assertHeroDodgeRuleSetVersion(selection.ruleSetVersion);
    const migration = selection.explicitMigration;
    if (selection.ruleSetVersion !== HERO_DODGE_V2 || !migration || typeof migration.migrationId !== 'string'
      || !migration.migrationId.trim() || migration.fromVersion !== HERO_DODGE_V1 || migration.toVersion !== HERO_DODGE_V2
      || migration.policyId !== HERO_DODGE_MIGRATION_POLICY) throw new Error('Hero Dodge v2 requires explicit migration provenance');
    const activeEncounters = [campaign.battle?.bossEncounter, campaign.bossEncounterCheckpoint].filter(e => !!e);
    if (activeEncounters.some(e => encounterRuleDependencies(e!).heroDodgeRuleSetVersion !== selection.ruleSetVersion)) throw new Error('Hero Dodge selection conflicts with pinned encounter');
  }
  if (campaign.heroDodgeReplayRecords !== undefined) {
    if (!Array.isArray(campaign.heroDodgeReplayRecords)
      || new Set(campaign.heroDodgeReplayRecords.map(r => r.recordId)).size !== campaign.heroDodgeReplayRecords.length) throw new Error('Invalid Hero Dodge replay record list');
    campaign.heroDodgeReplayRecords.forEach(replayHeroDodgeRecord);
  }
}

export function campaignHeroDodgeRuleSetVersion(campaign: CampaignState): HeroDodgeRuleSetVersion {
  validateHeroDodgeCampaignMetadata(campaign);
  const pins = [campaign.battle?.bossEncounter, campaign.bossEncounterCheckpoint].filter(e=>!!e).map(e=>encounterRuleDependencies(e!).heroDodgeRuleSetVersion);
  pins.forEach(assertHeroDodgeRuleSetVersion);
  if (new Set(pins).size > 1) throw new Error('Conflicting recorded Hero Dodge encounter versions');
  if (pins.length) return pins[0] as HeroDodgeRuleSetVersion;
  return campaign.heroDodgeRuleSetSelection?.ruleSetVersion ?? HERO_DODGE_V1;
}

/** A metadata-only immutable command; no RNG, Battle rebind, UI mutation, or campaign progression. */
export function explicitlyMigrateHeroDodgeToV2(campaign: CampaignState, migrationId: string): CampaignState {
  if (typeof migrationId !== 'string' || !migrationId.trim()) throw new Error('Explicit Hero Dodge migration ID required');
  validateHeroDodgeCampaignMetadata(campaign);
  const existing = campaign.heroDodgeRuleSetSelection;
  if (existing) {
    if (existing.explicitMigration.migrationId === migrationId) return campaign;
    throw new Error('Hero Dodge migration already committed under another ID');
  }
  if (campaign.battle || campaign.bossEncounterCheckpoint) throw new Error('Hero Dodge migration prohibited during Battle or Threat checkpoint');
  return { ...campaign, heroDodgeRuleSetSelection: {
    schemaVersion: 1, ruleSetVersion: HERO_DODGE_V2,
    explicitMigration: { migrationId, fromVersion: HERO_DODGE_V1, toVersion: HERO_DODGE_V2, policyId: HERO_DODGE_MIGRATION_POLICY },
  } };
}

/** A rule-resolution trace only; it makes no claim of attack or full encounter replay. */
export function recordHeroDodgeBindings(campaign: CampaignState, recordId: string,
  pairs: Array<{ heroId: string; level: number }>): CampaignState {
  if (typeof recordId !== 'string' || !recordId.trim() || !pairs.length) throw new Error('Hero Dodge record ID and pairs required');
  const ruleSetVersion = campaignHeroDodgeRuleSetVersion(campaign);
  const record: HeroDodgeReplayRecord = { schemaVersion: 1, recordId, ruleSetVersion,
    bindings: pairs.map(pair => resolveHeroDodge({ ...pair, ruleSetVersion })) };
  replayHeroDodgeRecord(record);
  const existing = campaign.heroDodgeReplayRecords?.find(r => r.recordId === recordId);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(record)) throw new Error('Hero Dodge replay record ID already used');
    return campaign;
  }
  return { ...campaign, heroDodgeReplayRecords: [...(campaign.heroDodgeReplayRecords ?? []), record] };
}
