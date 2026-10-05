import { describe, expect, it } from 'vitest';
import { buildRebaseline, validateRebaseline } from '../../scripts/audit/c1c34-rebaseline';
import { verifyCurrentFreeze } from '../../scripts/audit/historical-baseline';

describe('C1C34 successor source and freeze integrity', () => {
  it('checks current runtime/evidence against the immutable C1C33 manifest', () => {
    expect(() => verifyCurrentFreeze()).not.toThrow();
  });
  it('rejects prototype substitutions, invented source completion and hidden promotion', () => {
    for (const mutate of [
      (a: ReturnType<typeof buildRebaseline>) => { a['prophet-source-rebaseline'].items.find(r=>r.id==='d10-area-mapping')!.value = {1:'prototype'}; },
      (a: ReturnType<typeof buildRebaseline>) => { a['next-workstream-decision'].foundationExecutionAllowed = true; },
      (a: ReturnType<typeof buildRebaseline>) => { a['prophet-source-rebaseline'].items.find(r=>r.id==='level-3-stats')!.value.life = 79; },
      (a: ReturnType<typeof buildRebaseline>) => { a['boss-family-reuse-ranking'].ranking[0].planningCost = -999; },
    ]) {
      const a = buildRebaseline(); mutate(a);
      expect(()=>validateRebaseline(a)).toThrow();
    }
  });
  it('keeps every executable path gated and requires source/ruling/save/browser evidence for promotion', () => {
    const a = buildRebaseline();
    expect(()=>validateRebaseline(a)).not.toThrow();
    expect(a['prophet-production-dependency-matrix'].executionPaths.every(p=>!p.executable)).toBe(true);
    expect(a['next-workstream-decision']).toMatchObject({outcome:'PROPHET_PRODUCTION_BINDING_SELECTED',foundationExecutionAllowed:false,productionReady:false});
    expect(a['next-workstream-decision'].contract.rulingPolicy).toMatchObject({canonical:false,explicitVersionRequired:true});
  });
});
