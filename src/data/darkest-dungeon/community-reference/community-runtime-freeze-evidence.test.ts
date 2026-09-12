import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT,
  COMMUNITY_RUNTIME_PROJECTION_PROOFS,
  COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT,
  DD_LAYOUT_TOPOLOGY_PROOF_VERSION,
  validateCommunityRuntimeProjectionProofs,
  type CommunitySourceProjectionEnvironment,
} from './runtime-field-coverage';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';

const clone = <T>(value: T): T => structuredClone(value);
const fieldValue = (requirementId: string, field: string): unknown => COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT.corpus.requirements.find(item => item.requirementId === requirementId)!.fields[field].value;
const sourceWith = (key: string, value: unknown): CommunitySourceProjectionEnvironment => ({ ...COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT, overrides: { [key]: value } });
const mismatch = (source = COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT, runtime = COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT, proofs = COMMUNITY_RUNTIME_PROJECTION_PROOFS) => validateCommunityRuntimeProjectionProofs(proofs, runtime, COMMUNITY_RUNTIME_BLOCKERS, source);

describe('Community Runtime freeze evidence mutations', () => {
  it('F01 mutate source DD corridor edge -> traceability FAIL', () => {
    const layouts = clone(fieldValue('tierB-dd-dungeon-tile', 'tileGeometry')) as any[];
    layouts[0].corridorEdges.splice(0, 1);
    expect(mismatch(sourceWith('tierB-dd-dungeon-tile.tileGeometry', layouts))).toContain('runtime semantic mismatch tierB-dd-dungeon-tile.tileGeometry');
  });

  it('F02 mutate source DD start room -> traceability FAIL', () => {
    const layouts = clone(fieldValue('tierB-dd-dungeon-tile', 'tileGeometry')) as any[];
    const startEdges = layouts[0].corridorEdges.filter((candidate: string[]) => candidate.includes(layouts[0].start.id));
    const first = layouts[0].corridorEdges.indexOf(startEdges[0]);
    const second = layouts[0].corridorEdges.indexOf(startEdges[1]);
    [layouts[0].corridorEdges[first], layouts[0].corridorEdges[second]] = [layouts[0].corridorEdges[second], layouts[0].corridorEdges[first]];
    expect(mismatch(sourceWith('tierB-dd-dungeon-tile.tileGeometry', layouts))).toContain('runtime semantic mismatch tierB-dd-dungeon-tile.tileGeometry');
  });

  it('F03 mutate source DD boss-slot identity -> traceability FAIL', () => {
    const layouts = clone(fieldValue('tierB-dd-dungeon-tile', 'tileGeometry')) as any[];
    layouts[0].roomSlots.find((slot: any) => slot.sourceLocalSlotId === 'c4r0').bossCandidate = false;
    layouts[0].roomSlots.find((slot: any) => slot.sourceLocalSlotId === 'c4r1').bossCandidate = true;
    expect(mismatch(sourceWith('tierB-dd-dungeon-tile.tileGeometry', layouts))).toContain('runtime semantic mismatch tierB-dd-dungeon-tile.tileGeometry');
  });

  it('F04 mutate runtime DD corridor edge -> traceability FAIL', () => {
    const runtime = clone(COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT);
    runtime.profile.layouts[0].corridorDefinitions.splice(0, 1);
    expect(mismatch(COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT, runtime)).toContain('runtime semantic mismatch tierB-dd-dungeon-tile.tileGeometry');
  });

  it('F05 mutate runtime DD start room -> traceability FAIL', () => {
    const runtime = clone(COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT);
    runtime.profile.layouts[0].startRoomSlotId = runtime.profile.layouts[0].roomSlotIds[0];
    expect(mismatch(COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT, runtime)).toContain('runtime semantic mismatch tierB-dd-dungeon-tile.tileGeometry');
  });

  it('F06 mutate Templars source victory condition -> traceability FAIL', () => {
    expect(mismatch(sourceWith('tierB-templars-room.victoryCondition', { objective: 'Defeat only one Templar' }))).toContain('runtime semantic mismatch tierB-templars-room.victoryCondition');
  });

  it('F07 mutate Mammoth source summonPlacement -> traceability FAIL', () => {
    const value = clone(fieldValue('tierB-mammoth-cyst-room', 'spawnAreaPolicy')) as any;
    value.summonPlacement = 'Place in r11-bottom';
    expect(mismatch(sourceWith('tierB-mammoth-cyst-room.spawnAreaPolicy', value))).toContain('runtime semantic mismatch tierB-mammoth-cyst-room.spawnAreaPolicy.summonPlacement');
  });

  it('F08 mutate Mammoth source victory condition -> traceability FAIL', () => {
    const value = clone(fieldValue('tierB-mammoth-cyst-room', 'victoryCondition')) as any;
    value.roundLimit = 'Count every Battle Round';
    expect(mismatch(sourceWith('tierB-mammoth-cyst-room.victoryCondition', value))).toContain('runtime semantic mismatch tierB-mammoth-cyst-room.victoryCondition');
  });

  it('F09 mutate Ancestor source formAreaPlacement -> traceability FAIL', () => {
    const value = clone(fieldValue('tierB-ancestor-room', 'formAreaPlacement')) as any;
    value.ancestorFirstForm = 'r12-N (Monster Aggressive)';
    expect(mismatch(sourceWith('tierB-ancestor-room.formAreaPlacement', value))).toContain('runtime semantic mismatch tierB-ancestor-room.formAreaPlacement');
  });

  it('F10 mutate Ancestor source vacantStanceFillSource -> traceability FAIL', () => {
    const value = clone(fieldValue('tierB-ancestor-first-form', 'vacantStanceFillSource')) as any;
    value.skills[0].summons = 'Imperfect Reflection';
    expect(mismatch(sourceWith('tierB-ancestor-first-form.vacantStanceFillSource', value))).toContain('runtime semantic mismatch tierB-ancestor-first-form.vacantStanceFillSource');
  });

  it('F11 hard-coded source normalizer fixture -> validator FAIL', () => {
    const target = COMMUNITY_RUNTIME_PROJECTION_PROOFS.find(proof => proof.requirementId === 'tierB-templars-room' && proof.sourcePath === 'victoryCondition')!;
    const fixture = { ...target, normalizeSource: () => target.normalizeSource(target.sourceSelector(COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT)) };
    expect(mismatch(COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT, COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT, COMMUNITY_RUNTIME_PROJECTION_PROOFS.map(proof => proof === target ? fixture : proof))).toContain('source-insensitive normalizer tierB-templars-room.victoryCondition');
  });

  it('F12 consumed count-only topology normalizer -> validator FAIL', () => {
    const target = COMMUNITY_RUNTIME_PROJECTION_PROOFS.find(proof => proof.requirementId === 'tierB-dd-dungeon-tile' && proof.sourcePath === 'tileGeometry')!;
    const fixture = { ...target, normalizerId: 'layout-topology.v1', normalizeSource: (value: unknown) => (value as any[]).map(layout => ({ roomCount: layout.roomSlots.length, bossCount: layout.roomSlots.filter((slot: any) => slot.bossCandidate).length })) };
    const errors = mismatch(COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT, COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT, COMMUNITY_RUNTIME_PROJECTION_PROOFS.map(proof => proof === target ? fixture : proof));
    expect(errors).toContain('invalid DD layout topology contract layout-topology.v1');
    expect(DD_LAYOUT_TOPOLOGY_PROOF_VERSION).toBe('dd-layout-topology.v2');
  });
});
