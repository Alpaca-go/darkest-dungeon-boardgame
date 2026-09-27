import { describe, expect, it } from 'vitest';
import { buildCoreTerminalAudit, assertCoreTerminalAudit, coreId } from './core-trinket-terminal-blockers';

type Audit = ReturnType<typeof buildCoreTerminalAudit>;
const card = (a: Audit, name: string) => a.cards.find(c => c.definitionId === coreId(name))!;
describe('C1C20 live terminal blocker graph', () => {
  it('locks 37 exact definitions, 15 Ready, 22 source gated, 16/4/1/1 partition and zero gain', () => {
    const audit = buildCoreTerminalAudit();
    expect(() => assertCoreTerminalAudit(audit)).not.toThrow();
    expect(audit.coverage.sourceGateCompletionSimulation.resultingReadyCount).toBe(15);
    expect(audit.blocked.every(c => c.rootFamilies.length === 1 && c.sourceGate && c.runtimeOnlyReadyGain === 0)).toBe(true);
    expect(audit.cards.filter(c => c.productionReady).every(c => c.rootFamilies.length === 0)).toBe(true);
    expect(audit.blocked.every(c => c.downstreamRuntimeBlockers.every(b => b.rootSourceGate === c.sourceGate!.sourceGapId))).toBe(true);
  });
  it('does not use stale normalized diagnoses as current missing primitive truth', () => {
    const audit = buildCoreTerminalAudit();
    for (const c of audit.cards.filter(c => c.productionReady)) {
      expect(c.liveMissingPrimitives).toEqual([]);
      expect(c.downstreamRuntimeBlockers).toEqual([]);
    }
    expect(card(audit, 'chirurgeons-charm').obligations.every(s => s.implementationStatus === 'PARTIAL')).toBe(true);
  });
  const mutations: Array<[string, (a: Audit) => void]> = [
    ['Ready 16', a => { a.coverage.productionReadyCount = 16; }],
    ['Not Ready 21', a => { a.coverage.notReadyCount = 21; }],
    ['Damage Stone runtime-only', a => { card(a, 'damage-stone').sourceGate = null; }],
    ['Charm implementation possible now', a => { a.runtimeRoi.find(r => r.primitive === 'CONDITION_CHARM_POSITIVE_SKILL_TARGET')!.implementableNow = true; }],
    ['Movement immediate gain', a => { a.runtimeRoi.find(r => /movement/i.test(r.primitive))!.cardsPromotedIfImplementedAlone.push(coreId('book-of-constitution')); }],
    ['Crown Negative promotion', a => { a.runtimeRoi.find(r => r.primitive === 'CROWN_NEGATIVE_RESOLVE_VIRTUE_CHANCE_MINUS_2')!.cardsPromotedIfImplementedAlone.push(coreId('dark-crown')); }],
    ['Caution Positive promotion', a => { a.runtimeRoi.find(r => r.primitive === 'CAUTION_CLOAK_POSITIVE_SCOUT_PREVENT_STRESS')!.cardsPromotedIfImplementedAlone.push(coreId('caution-cloak')); }],
    ['Chirurgeon voluntary', a => { card(a, 'chirurgeons-charm').rootBlockerFamily = 'VOLUNTARY_DECLARATION'; card(a, 'chirurgeons-charm').rootFamilies = ['VOLUNTARY_DECLARATION']; }],
    ['omitted card', a => { a.blocked.pop(); }],
    ['duplicate root assignment', a => { card(a, 'damage-stone').rootFamilies.push('VOLUNTARY_DECLARATION'); }],
    ['complete full deck', a => { a.coverage.levels[0].completeForRandomDraw = true; }],
    ['Ready root blocker', a => { card(a, 'accuracy-stone').rootFamilies.push('DAMAGE_WOUND'); }],
    ['downstream missing upstream', a => { card(a, 'speed-stone').downstreamRuntimeBlockers[0].rootSourceGate = null; }],
    ['replace exact Ready ID', a => { a.coverage.readyIds[0] = coreId('damage-stone'); }],
    ['optimistic all runtime promotion', a => { a.coverage.sourceGateCompletionSimulation.resultingReadyCount = 37; }],
  ];
  it.each(mutations)('rejects mutation: %s', (_name, mutate) => {
    const audit = structuredClone(buildCoreTerminalAudit());
    mutate(audit);
    expect(() => assertCoreTerminalAudit(audit)).toThrow(/C1C20/);
  });
});
