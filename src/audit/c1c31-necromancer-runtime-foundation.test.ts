import { describe, expect, it } from 'vitest';
import { buildArtifacts, reviewedBoneDefinitions, requiredHeroCoverage, verifyArtifacts } from '../../scripts/audit/c1c31-contract';
import { inspectBoneCombatDependency, productionBoneDefinitions } from '../game-engine/bosses/component-adapters/bone-combat-adapter';
import { createHeroInstance, createNewCampaign } from '../game-engine/campaign';
import { necromancerProductionDependencyGate } from '../game-engine/bosses/production-dependency-gate';
import { commitQuestSelection } from '../game-engine/commands/quest';
import { createSaveSnapshot, restoreSaveSnapshot } from '../game-engine/save';

describe('C1C31 terminal rulebook-only contract review', () => {
  it('verifies frozen C1C20–30 evidence, unchanged v1/runtime and deterministic generated artifacts', () => {
    verifyArtifacts();
    expect(buildArtifacts()).toEqual(buildArtifacts());
  });
  it.each(['bone-rabble', 'bone-soldier', 'bone-spearman', 'bone-captain'])('%s has an explicit source-bound mapping for every Stance and d10 result', id => {
    const bone = reviewedBoneDefinitions().find(b => b.monsterId === id)!;
    expect(bone.authority).toBe('OFFICIAL_SOURCE');
    expect(bone.unresolvedFields).toEqual([]);
    for (const selections of Object.values(bone.stanceSelections)) {
      for (let roll = 1; roll <= 10; roll++) {
        const match = selections.filter(s => s.min <= roll && s.max >= roll);
        expect(match).toHaveLength(1);
        expect(bone.skills.some(s => s.number === match[0].skill)).toBe(true);
      }
    }
    expect(bone.sourceReferences.some(s => s.page === 24)).toBe(true);
    expect(inspectBoneCombatDependency(id)!.unresolvedFields).toHaveLength(2);
  });
  it('correctly separates Captain Stun from Debuff without rewriting the frozen historical review', () => {
    const captain = reviewedBoneDefinitions().find(b => b.monsterId === 'bone-captain')!;
    expect(captain.immunities).toEqual(['bleed', 'stun']);
    expect(captain.skills[1].targetStunTurns).toBe(2);
    expect(captain.skills[1].targetDebuffTurns).toBe(0);
    expect(captain.size).toBe('LARGE');
    expect(captain.normalSkillSummonPool).toBe(false);
    expect(inspectBoneCombatDependency('bone-captain')!.immunities).toContain('debuff');
  });
  it('preserves the printed split boundaries and shared cluster numbers, rather than selecting the first Skill', () => {
    const bones = reviewedBoneDefinitions();
    const skill = (id: string, stance: string, roll: number) =>
      bones.find(b => b.monsterId === id)!.stanceSelections[stance as 'aggressive'].find(s => s.min <= roll && roll <= s.max)!.skill;
    expect(skill('bone-rabble', 'support', 1)).toBe(2);
    expect(skill('bone-soldier', 'defensive', 10)).toBe(1);
    expect(skill('bone-spearman', 'aggressive', 5)).toBe(2);
    expect(skill('bone-spearman', 'aggressive', 6)).toBe(1);
    expect(skill('bone-spearman', 'ranged', 10)).toBe(1);
    expect(skill('bone-captain', 'defensive', 6)).toBe(1);
    expect(skill('bone-captain', 'defensive', 7)).toBe(2);
    expect(skill('bone-captain', 'ranged', 1)).toBe(2);
  });
  it('covers all actually selectable class/level pairs and exposes exact missing pairs with no inferred numbers', () => {
    const coverage = requiredHeroCoverage();
    expect(coverage).toHaveLength(24);
    expect(coverage.filter(h => h.executable)).toHaveLength(3);
    expect(coverage.filter(h => !h.executable)).toHaveLength(21);
    expect(coverage.find(h => h.requiredPair === 'vestal:1')).toMatchObject({ productionReachable: true, dodge: null });
    expect(coverage.find(h => h.requiredPair === 'highwayman:2')!.dodge).toBeNull();
  });
  it('draft digital numbers never enter executable registry or silently migrate saved v1 provenance', () => {
    const c = createNewCampaign();
    c.runtimeContentProfile = 'community-complete-edition'; c.gamePhase = 'quest-select';
    c.heroes = ['crusader', 'highwayman', 'vestal', 'hellion'].map((id, i) => createHeroInstance(id, i)!);
    c.campaignProgress.activeBossFamilyId = 'necromancer';
    c.campaignProgress.activeThreatId = 'necromancer-threat-level-1';
    const snapshot = createSaveSnapshot(c);
    const restored = restoreSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
    const before = JSON.stringify(restored);
    expect(necromancerProductionDependencyGate(restored, 1).enabled).toBe(false);
    expect(commitQuestSelection(restored, 'face-the-threat').error).toBe('necromancer-production-dependencies-unbound');
    expect(JSON.stringify(restored)).toBe(before);
    expect(productionBoneDefinitions()).toEqual([]);
    expect(necromancerProductionDependencyGate(restored, 1).ruleSetVersion).toBe('C1C28-DIGITAL-DEFAULT-v1');
  });
  it('does not claim production hashes, integration selection, or IMPLEMENTED bridges while review is pending', () => {
    const a = buildArtifacts();
    const decision = a['c1c31-next-workstream-decision.json'] as { decision: string; foundationAccepted: boolean; ordinaryFoundationContinuationAllowed: boolean };
    expect(decision.decision).toBe('NECROMANCER_DIGITAL_RULING_REVIEW_REQUIRED');
    expect(decision.foundationAccepted).toBe(false);
    expect(decision.ordinaryFoundationContinuationAllowed).toBe(false);
    const proof = a['c1c31-necromancer-production-save-replay-proof.json'] as { scenarios: Array<{ finalHash: string | null; productionAcceptance: boolean }> };
    expect(proof.scenarios.every(s => s.finalHash === null && !s.productionAcceptance)).toBe(true);
  });
});
