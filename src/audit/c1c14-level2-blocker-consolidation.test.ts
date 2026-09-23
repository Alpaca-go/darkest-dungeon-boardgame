import { describe, expect, it } from 'vitest';
import { COMMUNITY_TRINKET_CAPABILITIES } from '../data/community-reference/production-runtime';
import { BLOCKER_TAXONOMY, level2TerminalAudit } from './level2-terminal-blockers';

const audit = level2TerminalAudit();
const byName = (name: string) => audit.cards.find((card) => card.printedName === name)!;

describe('C1C14 terminal blocker census', () => {
  it('binds every Level 2 card to live readiness and preserves random draw lock', () => {
    expect(audit.cards).toHaveLength(11);
    expect(new Set(audit.cards.map((card) => card.definitionId)).size).toBe(11);
    expect(audit.readyCount).toBe(4);
    expect(audit.notReadyCount).toBe(7);
    expect(audit.completeForRandomDraw).toBe(false);
    expect(audit.readinessInvariantErrors).toEqual([]);
    expect(audit.cards.every((card) => card.productionReady ? card.blockerCodes.length === 0 : card.blockerCodes.length > 0)).toBe(true);
  });

  it('classifies every live blocker and preserves source-before-runtime dependencies', () => {
    const liveCodes = new Set(audit.cards.flatMap((card) => card.blockerCodes));
    expect(new Set(audit.blockerRegister.map((entry) => entry.blockerCode))).toEqual(liveCodes);
    for (const blocker of audit.blockerRegister) {
      expect(BLOCKER_TAXONOMY).toHaveProperty(blocker.blockerCode);
      if (blocker.recommendedAction === 'DEFER') {
        expect(blocker.upstreamBlockers).toContain('TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED');
        expect(blocker.wouldIncreaseReadyCountIfResolvedAlone).toBe(0);
      }
    }
    expect(audit.blockerRegister.find((entry) => entry.blockerCode === 'NO_TRINKETMODIFIERTYPE_MOVEMENT'))
      .toMatchObject({ category: 'RUNTIME_PRIMITIVE', recommendedAction: 'DEFER', wouldIncreaseReadyCountIfResolvedAlone: 0 });
    expect(audit.blockerRegister.find((entry) => entry.blockerCode === 'TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED')?.affectedCards).toHaveLength(6);
  });

  it('keeps Chirurgeon source gated and Relaxation non-implementable', () => {
    const chirurgeon = byName("Chirurgeon's Charm");
    expect(chirurgeon.productionReady).toBe(false);
    expect(chirurgeon.blockerCodes).toEqual(['TRINKET_TRIGGER_SCOPE_UNRESOLVED', 'TRINKET_TRIGGER_SCOPE_UNRESOLVED']);
    expect(chirurgeon.sides.every((side) => side.blockerCodes.every((code) => code === 'TRINKET_TRIGGER_SCOPE_UNRESOLVED'))).toBe(true);
    const relaxation = byName('Book of Relaxation');
    expect(relaxation.productionReady).toBe(false);
    expect(relaxation.sides.every((side) => !side.implementationPossibleNow)).toBe(true);
    expect(relaxation.sides.find((side) => side.side === 'negative')?.blockerCodes).toContain('TRINKET_MODIFIER_CONSUMER_MISSING');
  });

  it('rejects attempted readiness and source-gate mutations', () => {
    const promoted = COMMUNITY_TRINKET_CAPABILITIES.map((capability) => capability.definitionId === byName("Chirurgeon's Charm").definitionId
      ? { ...capability, productionReady: true } : capability);
    const mutated = level2TerminalAudit(promoted);
    expect(mutated.readyCount).toBe(5);
    expect(mutated.readinessInvariantErrors.length).toBeGreaterThan(0);
    const omitted = COMMUNITY_TRINKET_CAPABILITIES.filter((capability) => capability.definitionId !== byName('Book of Relaxation').definitionId);
    expect(() => level2TerminalAudit(omitted)).toThrow('Missing capability');
  });
});
