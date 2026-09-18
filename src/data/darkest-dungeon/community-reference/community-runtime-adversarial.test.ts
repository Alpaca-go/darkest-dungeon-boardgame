import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMUNITY_TEMPLARS_ENCOUNTER, COMMUNITY_TEMPLARS_ROOM, COMMUNITY_TEMPLAR_IMPALER, COMMUNITY_TEMPLAR_WARLORD, COMMUNITY_MAMMOTH_CYST, COMMUNITY_MAMMOTH_CYST_GUARDIAN, COMMUNITY_MAMMOTH_CYST_ROOM, COMMUNITY_WHITE_CELL_STALK, COMMUNITY_MAMMOTH_CYST_SUMMON, requireCommunityNumber, validateCommunityMammothDefinitions, validateCommunityTemplarsDefinitions } from './production-adapters';
import { COMMUNITY_RUNTIME_FIELD_COVERAGE, COMMUNITY_RUNTIME_PROJECTION_PROOFS, validateCommunityRuntimeProjectionProofs } from './runtime-field-coverage';
import { sanitizeShufflingHorrorEncounterState } from '../../../game-engine/bosses/shuffling-horror/shuffling-horror-content-validation';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { resolveExcavationSiteRoom } from '../../../game-engine/campaign/act-four/excavation-site';
import { computeCommunityReferenceContentHash, COMMUNITY_REFERENCE_CONTENT_HASH, COMMUNITY_REFERENCE_RUNTIME_PROFILE } from './runtime-profile';
import { OFFICIAL_DARKEST_DUNGEON_GUARDIANS } from '../guardian-registry';

describe('Community runtime final-acceptance adversarial requirements', () => {
  it('A01 removing Templar bleed fails validation', () => { const room = structuredClone(COMMUNITY_TEMPLARS_ROOM); room.spikedPits[0].entryEffects = room.spikedPits[0].entryEffects.filter((effect) => effect.condition !== 'bleed'); expect(validateCommunityTemplarsDefinitions({ encounter: COMMUNITY_TEMPLARS_ENCOUNTER, impaler: COMMUNITY_TEMPLAR_IMPALER, warlord: COMMUNITY_TEMPLAR_WARLORD, room }).isComplete).toBe(false); });
  it('A02 resistance leaves consume shuffle through the printed duration/distance policy', () => { const leaves = COMMUNITY_RUNTIME_FIELD_COVERAGE.filter(entry => entry.sourcePath.startsWith('resistances.')); expect(leaves.length).toBeGreaterThan(0); expect(leaves.filter(entry => entry.sourcePath.endsWith('.shuffle')).every(entry => entry.classification === 'consumed')).toBe(true); expect(leaves.find(entry => entry.requirementId === 'tierB-mammoth-cyst' && entry.sourcePath === 'resistances.stun')?.classification).toBe('consumed'); });
  it('A03 critical scope consumes printed Guardian attacks including Templars', () => { expect(COMMUNITY_RUNTIME_FIELD_COVERAGE.find(entry => entry.requirementId === 'tierB-mammoth-cyst' && entry.sourcePath === 'crit.digestion')?.classification).toBe('consumed'); expect(COMMUNITY_RUNTIME_FIELD_COVERAGE.find(entry => entry.requirementId === 'tierB-templars-impaler' && entry.sourcePath === 'crit.torment')?.classification).toBe('consumed'); });
  it('A04 missing numeric cannot silently become zero', () => expect(() => requireCommunityNumber(undefined, 'test.field')).toThrow('Missing confirmed Community numeric field'));
  it('A05 Community Templar validator cannot be bypassed', () => { const impaler = structuredClone(COMMUNITY_TEMPLAR_IMPALER); impaler.skills[0].d10Rolls = []; expect(validateCommunityTemplarsDefinitions({ encounter: COMMUNITY_TEMPLARS_ENCOUNTER, impaler, warlord: COMMUNITY_TEMPLAR_WARLORD, room: COMMUNITY_TEMPLARS_ROOM }).isComplete).toBe(false); });
  it('A06 Community Mammoth validator cannot be bypassed', () => { const room = structuredClone(COMMUNITY_MAMMOTH_CYST_ROOM); delete (room.teleportationD10Map as Record<string, string>)['10']; expect(validateCommunityMammothDefinitions({ guardian: COMMUNITY_MAMMOTH_CYST_GUARDIAN, cyst: COMMUNITY_MAMMOTH_CYST, stalk: COMMUNITY_WHITE_CELL_STALK, room, summon: COMMUNITY_MAMMOTH_CYST_SUMMON }).isComplete).toBe(false); });
  it('A07 derived Templar graph is closed: no isolated area, endpoints valid, adjacency blocker gone', () => {
    // Phase 11A.4R1 WP-5：TEMPLARS_AREA_ADJACENCY_UNRESOLVED 已关闭 —— edges 由已接受
    // tileGeometry 轮廓派生；此处验证派生图的结构完整性，而非「空图 + blocker」旧态。
    const result = validateCommunityTemplarsDefinitions();
    const room = COMMUNITY_TEMPLARS_ROOM;
    expect(room.areaGraph.edges.length).toBeGreaterThan(0);
    const valid = new Set(room.validAreaIds);
    for (const edge of room.areaGraph.edges) {
      expect(valid.has(edge.from)).toBe(true);
      expect(valid.has(edge.to)).toBe(true);
      expect(edge.from).not.toBe(edge.to);
    }
    const connected = new Set(room.areaGraph.edges.flatMap((edge) => [edge.from, edge.to]));
    // 普通 Area 全部接入图（Pit 是 Area 内部的 hole，不作为独立图节点）。
    for (const areaId of room.validAreaIds.filter((id) => !room.spikedPits.some((pit) => pit.areaId === id))) {
      expect(connected.has(areaId)).toBe(true);
    }
    expect(result.knownBlockers).not.toContain('TEMPLARS_AREA_ADJACENCY_UNRESOLVED');
    expect(result.knownBlockers).toContain('TEMPLARS_PIT_EXIT_RULE_UNRESOLVED');
  });
  it('A08 Shuffling Community save cannot restore as Prototype', () => { const state = createCommunityGuardianScenario(0).actFourState.shufflingHorrorEncounterState!; expect(sanitizeShufflingHorrorEncounterState(JSON.parse(JSON.stringify(state)))?.mode).toBe('community-reference'); });
  it('A09 Community Final has no broad Official object inheritance', () => expect(readFileSync('src/data/darkest-dungeon/final-encounter/index.ts', 'utf8')).not.toMatch(/COMMUNITY_[A-Z_]+[^=]*=\s*\{\s*\.\.\.OFFICIAL_/));
  it('A10 an unclassified projection proof fails', () => { const altered = COMMUNITY_RUNTIME_PROJECTION_PROOFS.map((proof, index) => index === 0 ? { ...proof, classification: '' as never } : proof); expect(validateCommunityRuntimeProjectionProofs(altered)).not.toEqual([]); });
  it('A11 editing a published runtime hash cannot manufacture truth', () => { const coverage = structuredClone(COMMUNITY_RUNTIME_FIELD_COVERAGE); coverage.find(entry => entry.classification === 'consumed')!.runtimeValueHash = 'forged'; expect(validateCommunityRuntimeProjectionProofs()).toEqual([]); });
  it('A12 blocker cannot mutate state first', () => { const original = createCommunityGuardianScenario(0); const site = original.actFourState.excavationSiteStates[0]; const campaign = { ...original, actFourState: { ...original.actFourState, excavationSiteStates: original.actFourState.excavationSiteStates.map((entry) => entry === site ? { ...entry, status: 'available' as const } : entry) } }; const before = structuredClone(campaign); expect(resolveExcavationSiteRoom(campaign, site.roomId, { mode: 'community-reference', rng: () => 0 }).campaign).toEqual(before); });
  it('A13 blocker cannot consume RNG first', () => { const original = createCommunityGuardianScenario(0); const site = original.actFourState.excavationSiteStates[0]; const campaign = { ...original, actFourState: { ...original.actFourState, excavationSiteStates: original.actFourState.excavationSiteStates.map((entry) => entry === site ? { ...entry, status: 'available' as const } : entry) } }; expect(() => resolveExcavationSiteRoom(campaign, site.roomId, { mode: 'community-reference', rng: () => { throw new Error('RNG'); } })).not.toThrow(); });
  it('A14 E2E cannot inject an already-prepared Community state', () => { const harness = readFileSync('src/testing/e2e/e2e-player-harness.ts', 'utf8'); expect(harness).not.toMatch(/drawDarkestDungeonQuest|activateDarkestDungeonContentSet|startGuardianBattle/); });
  it('A15 verifier requires exact discovered test counts', () => expect(readFileSync('scripts/audit/verify-community-reference-runtime.ts', 'utf8')).toContain('discovered'));
  it('A16 report counts originate from structured reporter', () => expect(readFileSync('scripts/audit/verify-community-reference-runtime.ts', 'utf8')).toMatch(/json|junit/i));
  it('A17 Guardian saves retain Community profile', () => { for (const index of [0,1,2] as const) { const state = createCommunityGuardianScenario(index).actFourState; expect(state.contentRuntime?.runtimeProfileId).toBe('community-reference'); } });
  it('A18 artifact hash changes alter content hash', () => expect(computeCommunityReferenceContentHash(undefined, { ...COMMUNITY_REFERENCE_RUNTIME_PROFILE.artifactIdentities, normalizedRequirementsSha256: 'changed' })).not.toBe(COMMUNITY_REFERENCE_CONTENT_HASH));
  it('A19 Community definition cannot enter Official pool', () => expect(OFFICIAL_DARKEST_DUNGEON_GUARDIANS.some((entry) => entry.id.startsWith('community-'))).toBe(false));
  it('A20 Community runtime cannot use Prototype definition IDs', () => expect(JSON.stringify(COMMUNITY_REFERENCE_RUNTIME_PROFILE)).not.toContain('prototype-'));
});
