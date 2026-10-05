import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { impact, candidates, verifyArtifacts } from '../../scripts/audit/c1c31r-contract';
import { HERO_DODGE_V1, HERO_DODGE_V2, resolveHeroDodge } from '../game-engine/rules/hero-dodge';
import { campaignHeroDodgeRuleSetVersion, explicitlyMigrateHeroDodgeToV2,
  recordHeroDodgeBindings, replayHeroDodgeRecord } from '../game-engine/rules/hero-dodge-versioning';
import { createNewCampaign, createHeroInstance } from '../game-engine/campaign';
import { createSaveSnapshot, migrateSaveFile, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { seededRuntimeSources, withRuntimeSources, SeededRandom } from '../game-engine/runtime-sources';
import { necromancerDefinition } from '../game-engine/necromancer/contract-adapter';
import { startBossFoundation, settleBossThreatBattle } from '../game-engine/commands/boss-foundation';
import { getHeroCombatDefinition } from '../data/progression/hero-level-registry';
import type { CampaignState } from '../types';
import type { HeroDodgeReplayRecord } from '../types/hero-dodge-rules';

const root = 'docs/data/complete-edition/';
const load = (name: string) => JSON.parse(readFileSync(root + name, 'utf8'));
const classValues = [ ['crusader', 0], ['vestal', 1], ['highwayman', 1], ['hellion', 1],
  ['leper', 1], ['occultist', 1], ['plague-doctor', 1], ['grave-robber', 1] ] as const;
const pairs = classValues.flatMap(([heroId, value]) => ([1, 2, 3] as const).map(level => ({ heroId, level, value })));
function fresh(): CampaignState {
  return withRuntimeSources(seededRuntimeSources(31), () => {
    const c = createNewCampaign('community-complete-edition');
    c.gamePhase = 'quest-select';
    c.heroes = ['crusader', 'highwayman', 'vestal', 'hellion'].map((id, i) => createHeroInstance(id, i)!);
    return c;
  });
}
function legacyEncounter(): CampaignState {
  const c = fresh(); c.heroes = c.heroes.filter(h => h.heroId !== 'vestal');
  c.currentQuestId = 'face-the-threat'; c.gamePhase = 'dungeon-explore';
  c.campaignProgress.activeBossFamilyId = 'necromancer'; c.campaignProgress.activeThreatId = 'necromancer-threat-level-1';
  c.campaignProgress.pendingThreatInitialization = false;
  c.dungeon = { questId: 'face-the-threat', questRunId: 'c1c31r-version-isolation', currentRoomId: 'threat-room', previousRoomId: null,
    rooms: [{ id: 'threat-room', type: 'battle', status: 'current', adjacentRoomIds: ['room-10'] },
      { id: 'room-10', type: 'objective', status: 'revealed', adjacentRoomIds: ['threat-room'] }],
    scoutedNextMove: false, roomsCleared: 0, objectiveComplete: false, canLeave: false };
  return startBossFoundation(c, necromancerDefinition(1), 31, 'threat-room',
    Object.fromEntries(c.heroes.map(h => [h.instanceId, getHeroCombatDefinition(h.heroId, h.level)!.dodge])), []);
}

describe('C1C31R complete explicit Dodge table and frozen authority', () => {
  it('verifies deterministic generated artifacts and immutable v1/C1C31/Bone evidence', () => verifyArtifacts());
  it('has exactly 24 unique required pairs and 21 unique noncanonical ruling IDs', () => {
    const table = load('c1c31r-hero-dodge-final-table.json');
    expect(table.rows).toHaveLength(24);
    expect(new Set(table.rows.map((r: { heroId: string; level: number }) => `${r.heroId}:${r.level}`)).size).toBe(24);
    expect(table.rows.map((r: { heroId: string; level: number }) => `${r.heroId}:${r.level}`).sort()).toEqual(pairs.map(p => `${p.heroId}:${p.level}`).sort());
    const overlay = load('c1c31r-project-rulings-v2.json');
    expect(overlay.rulings).toHaveLength(21); expect(new Set(overlay.rulings.map((r: { rulingId: string }) => r.rulingId)).size).toBe(21);
    for (const r of overlay.rulings) {
      expect(r).toMatchObject({ canonical: false, authority: 'PROJECT_RULING', canonicalSourceStatus: 'SOURCE_UNRESOLVED', status: 'ACCEPTED' });
      expect(r.riskMetadata.classification).toBe('HIGH_COMBAT_BALANCE');
      expect(r.riskMetadata.affectedPaths.length).toBeGreaterThan(0);
      expect(r.riskMetadata.saveReplayImpact).toBeTruthy(); expect(r.riskMetadata.migrationImpact).toBeTruthy();
    }
    expect(table.inherits).toBe(HERO_DODGE_V1); expect(overlay.inherits).toBe(HERO_DODGE_V1);
    expect(overlay.inheritedBossRulingsModified).toBe(false); expect(table.status).toBe('ACCEPTED_FROZEN');
  });
  it.each(pairs)('$heroId:$level resolves the exact frozen value $value under v2', ({ heroId, level, value }) => {
    const resolved = resolveHeroDodge({ heroId, level, ruleSetVersion: HERO_DODGE_V2 });
    expect(resolved.value).toBe(value); expect(resolved.ruleSetVersion).toBe(HERO_DODGE_V2);
    const official = level === 1 && ['crusader', 'highwayman', 'hellion'].includes(heroId);
    expect(resolved.authority).toBe(official ? 'OFFICIAL_SOURCE' : 'PROJECT_RULING');
    expect(resolved.canonical).toBe(official);
    if (official) { expect(resolved.rulingId).toBeNull(); expect(resolved.sourceReferences.length).toBeGreaterThan(0); }
    else { expect(resolved.rulingId).toBe(`C1C31R-DODGE-${heroId.toUpperCase()}-L${level}`); expect(resolved.sourceReferences).toEqual([]); }
  });
  it.each([['crusader', 0], ['highwayman', 1], ['hellion', 1]] as const)('keeps %s I official and prevents a project override', (heroId, value) => {
    const a = resolveHeroDodge({ heroId, level: 1, ruleSetVersion: HERO_DODGE_V1 });
    const b = resolveHeroDodge({ heroId, level: 1, ruleSetVersion: HERO_DODGE_V2 });
    expect(a).toMatchObject({ value, authority: 'OFFICIAL_SOURCE', canonical: true, rulingId: null });
    expect(b.sourceReferences).toEqual(a.sourceReferences);
    expect(load('c1c31r-project-rulings-v2.json').rulings.some((r: { heroId: string; level: number }) => r.heroId === heroId && r.level === 1)).toBe(false);
  });
  it('v2 lookups cannot contaminate v1 or the existing source-only registry', () => {
    expect(resolveHeroDodge({ heroId: 'vestal', level: 1, ruleSetVersion: HERO_DODGE_V2 }).value).toBe(1);
    expect(() => resolveHeroDodge({ heroId: 'vestal', level: 1, ruleSetVersion: HERO_DODGE_V1 })).toThrow('SOURCE_UNRESOLVED');
    expect(() => resolveHeroDodge({ heroId: 'highwayman', level: 2, ruleSetVersion: HERO_DODGE_V1 })).toThrow('SOURCE_UNRESOLVED');
    expect(getHeroCombatDefinition('vestal', 1)).toBeUndefined();
    const mutable = resolveHeroDodge({ heroId: 'highwayman', level: 1, ruleSetVersion: HERO_DODGE_V2 });
    mutable.sourceReferences[0].sha256 = 'changed';
    expect(resolveHeroDodge({ heroId: 'highwayman', level: 1, ruleSetVersion: HERO_DODGE_V1 }).sourceReferences[0].sha256).not.toBe('changed');
  });
  it.each([['unknown', 1], ['vestal', 4], ['crusader', 1.5], ['Vestal', 1]] as const)('unknown pair %s:%s hard fails', (heroId, level) => {
    expect(() => resolveHeroDodge({ heroId, level, ruleSetVersion: HERO_DODGE_V2 })).toThrow('Unknown Hero Dodge pair');
  });
  it('unknown rule versions hard fail instead of choosing v2 or v1', () => {
    expect(() => resolveHeroDodge({ heroId: 'vestal', level: 1, ruleSetVersion: 'latest' })).toThrow('Unsupported');
  });
});

describe('C1C31R exact impact comparison and decision', () => {
  it('covers all three complete candidate tables and all requested Accuracy/Dodge cells', () => {
    expect(candidates().map(c => c.candidateId)).toEqual(['A_ZERO_FILL', 'B_CLASS_BASELINE', 'C_LEVEL_PROGRESSION']);
    expect(candidates().every(c => c.rows.length === 24)).toBe(true);
    const matrix = load('c1c31r-dodge-impact-matrix.json');
    expect(matrix.typicalGrid).toHaveLength(20); expect(matrix.candidateComparisons).toHaveLength(3);
    expect(matrix.candidateComparisons.every((c: { attacks: unknown[] }) => c.attacks.length === 17)).toBe(true);
    expect(matrix.boundsReview.selectedMinimumRealAttackHitProbability).toBe(0.4);
    expect(matrix.actualAccuracyGrid.map((r: { accuracy: number }) => r.accuracy)).toEqual(expect.arrayContaining([5, 7, 8, 9, 10, 11, 12]));
    expect(load('c1c31r-next-workstream-decision.json')).toMatchObject({ selectedCandidate: 'B_CLASS_BASELINE',
      selectedRuleSetVersion: HERO_DODGE_V2, remainingRuleBlockers: 0, foundationAccepted: false, runtimeIntegrationSelected: false });
  });
  it('enumerates clipping, ten-point steps, low-roll critical intersection and modifier saturation', () => {
    expect([0, 1, 2, 3].map(d => impact(5, d).hitProbability)).toEqual([0.5, 0.4, 0.3, 0.2]);
    expect(impact(3, 3, 1)).toMatchObject({ hitProbability: 0, criticalHitProbability: 0 });
    expect(impact(12, 1, 1)).toMatchObject({ hitProbability: 1, criticalHitProbability: 0.1 });
    expect(impact(10, 1, 1)).toMatchObject({ hitProbability: 0.9, criticalHitProbability: 0.1 });
    expect(impact(5, 1, 1, 0, 1).hitProbability).toBe(0.3);
    expect(impact(5, 1, 1, 1).hitProbability).toBe(0.5);
    expect(impact(5, 1, 1, 0, 0, 1).criticalHitProbability).toBe(0.2);
  });
});

describe('C1C31R explicit migration, save preservation and rule-only replay', () => {
  it('legacy absence stays v1 through actual save load/migration/sanitation, with no new metadata', () => {
    const c = fresh(); const saved = createSaveSnapshot(c);
    const loaded = restoreSaveSnapshot(JSON.parse(JSON.stringify(saved)));
    expect(campaignHeroDodgeRuleSetVersion(loaded)).toBe(HERO_DODGE_V1);
    expect(loaded.heroDodgeRuleSetSelection).toBeUndefined();
    expect(migrateSaveFile(saved)!.campaign.heroDodgeRuleSetSelection).toBeUndefined();
    expect(validateSaveFile(saved)).toBeNull();
  });
  it('pre-encounter explicit upgrade is atomic, deterministic and idempotent without RNG or progression changes', () => {
    const sources = seededRuntimeSources(31);
    withRuntimeSources(sources, () => {
      const c = fresh(); const before = JSON.stringify(c); const rng = (sources.random as SeededRandom).snapshot();
      const upgraded = explicitlyMigrateHeroDodgeToV2(c, 'review-approved:campaign:31');
      expect(JSON.stringify(c)).toBe(before); expect((sources.random as SeededRandom).snapshot()).toBe(rng);
      expect(campaignHeroDodgeRuleSetVersion(upgraded)).toBe(HERO_DODGE_V2);
      expect(upgraded.campaignProgress).toBe(c.campaignProgress); expect(upgraded.gold).toBe(c.gold);
      expect(upgraded.battle).toBe(c.battle); expect(upgraded.dungeon).toBe(c.dungeon);
      expect(explicitlyMigrateHeroDodgeToV2(upgraded, 'review-approved:campaign:31')).toBe(upgraded);
      expect(() => explicitlyMigrateHeroDodgeToV2(upgraded, 'other')).toThrow('already committed');
      expect(() => explicitlyMigrateHeroDodgeToV2(c, '')).toThrow('ID required');
    });
  });
  it.each(['battle', 'checkpoint'] as const)('never migrates an existing v1 %s, even after Threat settlement', boundary => {
    let c = legacyEncounter();
    if (boundary === 'checkpoint') { c.battle!.status = 'victory'; c = settleBossThreatBattle(c); }
    const before = JSON.stringify(c);
    expect(() => explicitlyMigrateHeroDodgeToV2(c, 'forbidden')).toThrow('prohibited');
    expect(JSON.stringify(c)).toBe(before);
    const loaded = restoreSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot(c))));
    expect(campaignHeroDodgeRuleSetVersion(loaded)).toBe(HERO_DODGE_V1);
    expect(loaded.bossEncounterCheckpoint ?? loaded.battle!.bossEncounter).toEqual(c.bossEncounterCheckpoint ?? c.battle!.bossEncounter);
  });
  it('preserves old replay pins and roundtrips a complete v2 trace through real SaveFile', () => {
    const v1 = recordHeroDodgeBindings(fresh(), 'legacy-record', [{ heroId: 'highwayman', level: 1 }]);
    const upgraded = explicitlyMigrateHeroDodgeToV2(v1, 'approved');
    const traced = recordHeroDodgeBindings(upgraded, 'v2-table-record', pairs);
    const saved = createSaveSnapshot(traced); expect(validateSaveFile(saved)).toBeNull();
    const loaded = restoreSaveSnapshot(JSON.parse(JSON.stringify(saved)));
    expect(loaded.heroDodgeRuleSetSelection).toEqual(traced.heroDodgeRuleSetSelection);
    expect(loaded.heroDodgeReplayRecords).toEqual(traced.heroDodgeReplayRecords);
    const old = replayHeroDodgeRecord(loaded.heroDodgeReplayRecords![0]);
    expect(old[0].ruleSetVersion).toBe(HERO_DODGE_V1);
    const current = replayHeroDodgeRecord(loaded.heroDodgeReplayRecords![1]);
    expect(current).toHaveLength(24); expect(current.every(b => b.ruleSetVersion === HERO_DODGE_V2)).toBe(true);
    expect(recordHeroDodgeBindings(loaded, 'v2-table-record', pairs)).toBe(loaded);
  });
  it.each(['value', 'authority', 'version', 'source', 'ruling', 'duplicate'] as const)('rejects tampered %s replay provenance on validation and restore', field => {
    const c = recordHeroDodgeBindings(explicitlyMigrateHeroDodgeToV2(fresh(), 'approved'), 'record', [{ heroId: 'vestal', level: 1 }]);
    const saved = JSON.parse(JSON.stringify(createSaveSnapshot(c)));
    const record = saved.campaign.heroDodgeReplayRecords[0];
    if (field === 'value') record.bindings[0].value = 0;
    if (field === 'authority') record.bindings[0].authority = 'OFFICIAL_SOURCE';
    if (field === 'version') record.ruleSetVersion = HERO_DODGE_V1;
    if (field === 'source') record.bindings[0].sourceReferences = [{ path: 'fake', sha256: 'fake', region: 'fake' }];
    if (field === 'ruling') record.bindings[0].rulingId = 'other';
    if (field === 'duplicate') record.bindings.push(record.bindings[0]);
    expect(validateSaveFile(saved)).toContain('Hero Dodge');
    expect(() => restoreSaveSnapshot(saved)).toThrow();
  });
  it('rejects unknown saved version, absent explicit migration provenance and incompatible active encounter pins', () => {
    const upgraded = explicitlyMigrateHeroDodgeToV2(fresh(), 'approved');
    const saved = JSON.parse(JSON.stringify(createSaveSnapshot(upgraded)));
    saved.campaign.heroDodgeRuleSetSelection.ruleSetVersion = 'latest';
    expect(validateSaveFile(saved)).toContain('Unsupported');
    saved.campaign.heroDodgeRuleSetSelection.ruleSetVersion = HERO_DODGE_V2;
    delete saved.campaign.heroDodgeRuleSetSelection.explicitMigration;
    expect(validateSaveFile(saved)).toContain('explicit migration');
    const running = legacyEncounter(); running.heroDodgeRuleSetSelection = upgraded.heroDodgeRuleSetSelection;
    expect(validateSaveFile(createSaveSnapshot(running))).toContain('conflicts with pinned encounter');
  });
  it('replay rejects unknown recorded rule version without consulting campaign defaults', () => {
    const record = { schemaVersion: 1, recordId: 'unknown', ruleSetVersion: 'latest', bindings: [] } as unknown as HeroDodgeReplayRecord;
    record.bindings = [resolveHeroDodge({ heroId: 'vestal', level: 1, ruleSetVersion: HERO_DODGE_V2 })];
    expect(() => replayHeroDodgeRecord(record)).toThrow('Unsupported');
  });
});
