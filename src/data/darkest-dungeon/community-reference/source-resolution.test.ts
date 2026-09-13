import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_SOURCE_BLOCKER_RESOLUTION,
  COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT,
  validateCommunitySourceResolution,
  type CommunitySourceResolutionDossier,
  type CommunitySourceResolutionSupplement,
} from './source-resolution';

const clone = (): { dossier: CommunitySourceResolutionDossier; supplement: CommunitySourceResolutionSupplement } => ({
  dossier: structuredClone(COMMUNITY_SOURCE_BLOCKER_RESOLUTION),
  supplement: structuredClone(COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT),
});
const target = (dossier: CommunitySourceResolutionDossier, code: string) => dossier.targets.find((item) => item.blockerCode === code)!;

describe('Community source blocker resolution', () => {
  it('accepts the researched dossier and additive supplement', () => {
    expect(validateCommunitySourceResolution()).toEqual([]);
  });

  it('S01 resolved with empty source refs -> FAIL', () => {
    const { dossier, supplement } = clone(); target(dossier, 'FINAL_PROVISION_POLICY_UNRESOLVED').sourceReferences = [];
    expect(validateCommunitySourceResolution(dossier, supplement)).toContain('FINAL_PROVISION_POLICY_UNRESOLVED: source references empty');
  });

  it('S02 Community relabeled Official Retail Verified -> FAIL', () => {
    const { dossier, supplement } = clone(); target(dossier, 'SHUFFLING_INITIAL_AREA_UNRESOLVED').sourceAuthority = ['OFFICIAL_RETAIL_VERIFIED'];
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('Official Retail Verified'))).toBe(true);
  });

  it('S03 Prototype value copied -> FAIL', () => {
    const { dossier, supplement } = clone(); target(dossier, 'FINAL_PROVISION_POLICY_UNRESOLVED').resolvedValue = { source: 'PROTOTYPE', dice: 2 };
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('Prototype value copied'))).toBe(true);
  });

  it('S04 Monster logical-uniform fallback -> FAIL', () => {
    const { dossier, supplement } = clone(); target(dossier, 'MONSTER_DECK_DRAW_POLICY_UNRESOLVED').resolvedValue = { policy: 'uniform random among 9 logical identities', physical: true, return: 'Battle End' };
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('forbidden logical-uniform'))).toBe(true);
  });

  it('S05 DeckIDs order treated as draw policy -> FAIL', () => {
    const { dossier, supplement } = clone(); target(dossier, 'MONSTER_DECK_DRAW_POLICY_UNRESOLVED').resolvedValue = { savedDeckIdsArePolicy: true, physical: true, return: 'Battle End' };
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('forbidden logical-uniform'))).toBe(true);
  });

  it('S06 Templar adjacency inferred from artwork only -> FAIL', () => {
    const { dossier, supplement } = clone(); const value = target(dossier, 'TEMPLARS_AREA_ADJACENCY_UNRESOLVED'); value.verdict = 'resolved'; value.resolvedValue = { graph: ['art edge'] }; value.resolvedSemantics = { complete: true }; value.sourceReferences = ['asset:7a3fa9:imageUrl'];
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('artwork only'))).toBe(true);
  });

  it('S07 Pit exit inferred from generic movement -> FAIL', () => {
    const { dossier, supplement } = clone(); const value = target(dossier, 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED'); value.verdict = 'resolved'; value.resolvedValue = { rule: 'generic movement' }; value.resolvedSemantics = { complete: true };
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('pit exit inferred'))).toBe(true);
  });

  it('S08 Come Unto Your Maker copied from videogame -> FAIL', () => {
    const { dossier, supplement } = clone(); const value = target(dossier, 'COME_UNTO_YOUR_MAKER_UNRESOLVED'); value.verdict = 'resolved'; value.resolvedValue = { source: 'videogame', effect: 'sacrifice heroes' }; value.resolvedSemantics = { complete: true };
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('videogame definition'))).toBe(true);
  });

  it('S09 Final/Excavation provision tables assumed identical -> FAIL', () => {
    const { dossier, supplement } = clone(); target(dossier, 'EXCAVATION_PROVISION_DIE_MAP_UNRESOLVED').resolvedValue = { derivation: 'assumed identical to Final table' };
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('assumed identical'))).toBe(true);
  });

  it('S10 partial compound semantic marked resolved -> FAIL', () => {
    const { dossier, supplement } = clone(); target(dossier, 'MAMMOTH_STALK_NO_SPACE_RESOLUTION_ENGINE_UNSUPPORTED').verdict = 'resolved';
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('partial compound semantic'))).toBe(true);
  });

  it('S11 conflicts silently collapsed -> FAIL', () => {
    const { dossier, supplement } = clone(); target(dossier, 'FINAL_PROVISION_POLICY_UNRESOLVED').sourceFindings.push({ source: 'source-conflict', finding: 'conflict with another accepted edition' });
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('conflict silently collapsed'))).toBe(true);
  });

  it('S12 image-derived rule missing source identity/SHA -> FAIL', () => {
    const { dossier, supplement } = clone(); const semantic = supplement.semantics.find((item) => item.semanticId === 'community-shuffling-initial-deployment-v1')!; semantic.guid = []; semantic.assetIdentity = []; semantic.sourceSha256 = [];
    expect(validateCommunitySourceResolution(dossier, supplement).some((error) => error.includes('image-derived rule missing'))).toBe(true);
  });
});
