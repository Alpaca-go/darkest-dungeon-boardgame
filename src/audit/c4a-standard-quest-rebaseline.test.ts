import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildC4A, assertC4A, assertFrozenInputs, artifactsC4A, classifyReadiness, monsterForms,
  type Obligation } from '../../scripts/audit/c4a-standard-quest-rebaseline';
import normalized from '../../docs/data/complete-edition/quests/community-quest-normalized.json';
const quests = normalized.definitions;

describe('C4A current Quest census and source gates', () => {
  const audit = buildC4A();
  it('covers the discovered identity set and every normalized special-rule atom', () => {
    assertC4A(audit);
    for (const source of quests) {
      const row = audit.quests.find(q => q.definitionId === source.id)!;
      source.specialRules.forEach((_, index) => expect(row.obligations.some(o => o.sourceField === `specialRules.${index}`)).toBe(true));
      expect(row.obligations.some(o => o.sourceField === 'objective')).toBe(true);
      expect(row.obligations.some(o => o.sourceField === 'dungeonComposition')).toBe(true);
    }
  });
  it('includes the source-only 76th identity without modifying the frozen 75-card runtime catalog', () => {
    const omitted = audit.quests.find(q => q.definitionId.endsWith('rest-in-rubble-iii'))!;
    expect(omitted.presentInCurrentRuntimeCatalog).toBe(false);
    expect(omitted.sourceCompleteness.literalComplete).toBe(false);
    expect(omitted.readiness).toBe('SOURCE_BLOCKED');
    expect(audit.quests.length).toBe(76);
    expect(audit.historicalComparison.historicalSourceDefinitionCount).toBe(75);
  });
  it('distinguishes hard blockers from adapters and refuses promotion despite a binding', () => {
    const base = audit.quests[0].obligations[0];
    const atom = (classification: Obligation['classification']) => ({ ...base, classification });
    expect(classifyReadiness([atom('NEEDS_QUEST_ADAPTER')], true)).toBe('ADAPTER_READY');
    expect(classifyReadiness([atom('SOURCE_BLOCKED'), atom('NEEDS_QUEST_ADAPTER')], true)).toBe('SOURCE_BLOCKED');
    expect(classifyReadiness([atom('SOURCE_BLOCKED'), atom('NEEDS_NEW_RUNTIME_PRIMITIVE')], true)).toBe('MULTI_BLOCKED');
    expect(classifyReadiness([atom('DEFERRED_SEMANTIC')], false)).toBe('DEFERRED_SEMANTIC');
    expect(classifyReadiness([atom('SUPPORTED_EXISTING_PRIMITIVE')], false)).toBe('ADAPTER_READY');
  });
  it('rejects dropped obligations, fake counts and tampered readiness', () => {
    const bad = structuredClone(audit);
    bad.quests[0].obligations.pop();
    expect(() => assertC4A(bad)).toThrow();
    const count = structuredClone(audit);
    count.counts.ADAPTER_READY++;
    expect(() => assertC4A(count)).toThrow();
    const promoted = structuredClone(audit);
    promoted.quests.find(q => q.rest.status === 'SOURCE_BLOCKED')!.readiness = 'PRODUCTION_READY_EXISTING';
    expect(() => assertC4A(promoted)).toThrow();
  });
  it('re-evaluates named Monster profile, action and automatic eligibility independently', () => {
    const q = audit.quests.find(q => q.definitionId.endsWith('deep-horrors-2'))!;
    expect(q.obligations.find(o => o.capabilityId === 'QUEST_EXPLICIT_MONSTER_MANIFEST' && o.description.includes('Squiffy'))?.classification)
      .toBe('SUPPORTED_EXISTING_COMPOSITION');
    expect(q.obligations.find(o => o.obligationId.endsWith('squiffy-ghast:action-2'))?.classification).toBe('DEFERRED_SEMANTIC');
    expect(q.obligations.find(o => o.capabilityId === 'QUEST_REGIONAL_PHYSICAL_DRAW_SOURCE')?.classification).toBe('SOURCE_BLOCKED');
    expect(monsterForms('Crocodilian', 3).map(d => d.definitionId)).toEqual(['crocodillian']);
    expect(monsterForms('Crone', 3)).toEqual([]);
  });
  it('removes historical Hero effect gaps without inventing Quest event routes', () => {
    const q = audit.quests.find(q => q.definitionId.endsWith('unclean-waters-3'))!;
    expect(q.obligations.find(o => o.capabilityId === 'HERO_TIMED_CONDITIONS')?.classification).toBe('SUPPORTED_EXISTING_COMPOSITION');
    expect(q.obligations.find(o => o.capabilityId === 'QUEST_HERO_EVENT_ROUTING')?.classification).toBe('NEEDS_QUEST_ADAPTER');
  });
  it('keeps each Firewood Quest gated and excludes prohibited historical Rest authority', () => {
    for (const q of audit.quests) {
      const source = quests.find(s => s.id === q.definitionId)!;
      if (source.firewood.tokens > 0) {
        expect(q.rest.status).toBe('SOURCE_BLOCKED');
        expect(q.obligations.find(o => o.capabilityId === 'REST_INSUFFICIENT_RECOVERY_CAPACITY')?.classification).toBe('SOURCE_BLOCKED');
        expect(q.obligations.find(o => o.capabilityId === 'REST_OFFICIAL_SOURCE_SCOPE')?.classification).toBe('SOURCE_BLOCKED');
      } else expect(q.rest.status).toBe('SOURCE_CLEAR');
    }
  });
  it('separates full physical Trinket decks from frozen effect semantics and reward adapters', () => {
    for (const suffix of ['family-trinkets', 'tainted-trinkets', 'take-em-back']) {
      const q = audit.quests.find(q => q.definitionId.endsWith(suffix))!;
      expect(q.obligations.find(o => o.capabilityId === 'TRINKET_PHYSICAL_SOURCE_DECK')?.classification).toBe('SUPPORTED_EXISTING_PRIMITIVE');
      expect(q.obligations.find(o => o.capabilityId === 'TRINKET_SOURCE_BOUND_DRAW')?.classification).toBe('SUPPORTED_EXISTING_COMPOSITION');
      expect(q.obligations.find(o => o.capabilityId === 'TRINKET_FULL_DECK_EFFECT_SEMANTICS')?.classification).toBe('SOURCE_BLOCKED');
      expect(q.obligations.find(o => o.capabilityId === 'QUEST_TRINKET_ACQUISITION_RETURN')?.classification).toBe('NEEDS_QUEST_ADAPTER');
    }
  });
  it('identifies actual roster/activation gaps rather than copying historical category names', () => {
    const q = audit.quests.find(q => q.definitionId.endsWith('great-unclean-ones'))!;
    expect(q.obligations.some(o => o.capabilityId === 'QUEST_ADDITIONAL_INITIATIVE' && o.classification === 'NEEDS_NEW_RUNTIME_PRIMITIVE')).toBe(true);
    expect(audit.quests.find(q => q.definitionId.endsWith('patrol-the-woods'))!.obligations
      .find(o => o.capabilityId === 'QUEST_FIRST_ROUND_INITIATIVE')?.classification).toBe('NEEDS_QUEST_ADAPTER');
  });
  it('deduplicates backlog and reports zero unsupported whole-Quest ROI claims', () => {
    expect(new Set(audit.backlog.map(b => b.id)).size).toBe(audit.backlog.length);
    for (const item of audit.backlog) {
      expect(item.affectedQuestCount).toBe(item.affectedQuestIds.length);
      expect(new Set(item.affectedQuestIds).size).toBe(item.affectedQuestCount);
      expect(item.expectedWholeQuestCoverageGain).toBe(item.unlockedQuestIds.length);
    }
    expect(audit.decision.decisionCount).toBe(1);
    expect(audit.decision.selectedKind).toBe('SOURCE_EVIDENCE_SUCCESSOR');
    expect(audit.historicalComparison.newlyUnblockedQuestIds).toEqual([]);
    expect(audit.decision.expectedQuestCoverageGain).toBe(0);
  });
  it('requires frozen base bytes and reproducible checked-in artifacts', () => {
    expect(assertFrozenInputs().gameplayRuntimeChanged).toBe(false);
    for (const [path, expected] of Object.entries(artifactsC4A(audit))) expect(readFileSync(path, 'utf8')).toBe(JSON.stringify(expected, null, 2) + '\n');
  });
});
