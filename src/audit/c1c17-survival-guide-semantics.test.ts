import { describe, expect, it } from 'vitest';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../data/community-reference/production-runtime';
import { compareTrinketSemanticPayload } from './trinket-semantic-coverage';
import { SURVIVAL_GUIDE_ID } from './production-proof-registry';
const source = COMMUNITY_SOURCE_TRINKETS.find((card) => card.id === SURVIVAL_GUIDE_ID)!;
const runtime = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[SURVIVAL_GUIDE_ID].definition;
describe('C1C17 exact source semantics', () => {
  for (const side of ['positiveSide', 'negativeSide'] as const) {
    it(side + ' exact empty conditions and payload', () => {
      expect(source[side].conditions).toEqual([]);
      expect(compareTrinketSemanticPayload(source[side], runtime[side]).runtimeSliceSemanticComplete).toBe(true);
    });
    const mutations = side === 'positiveSide' ? [ { options: ['trap'] }, { options: ['hunger'] }, { options: ['trap', 'hunger', 'none'] },
      { target: 'equipped-hero' }, { type: 'replace-exploration-result' } ] : [ { from: 'trap' }, { from: 'any-result' },
      { to: 'hunger' }, { to: 'none' }, { target: 'equipped-hero' }, { type: 'ignore-exploration-result' } ];
    for (const mutation of mutations) it(side + ' rejects ' + JSON.stringify(mutation), () => {
      const changed = structuredClone(runtime[side]);
      Object.assign(changed.effects[0], mutation);
      expect(compareTrinketSemanticPayload(source[side], changed).runtimeSliceSemanticComplete).toBe(false);
    });
    it(side + ' rejects missing effect, wrong trigger/window/target', () => {
      expect(compareTrinketSemanticPayload(source[side], { ...runtime[side], effects: [] }).runtimeSliceSemanticComplete).toBe(false);
      expect(compareTrinketSemanticPayload(source[side], { ...runtime[side], useWindows: ['before-dungeon-roll'] }).runtimeSliceSemanticComplete).toBe(false);
      expect(compareTrinketSemanticPayload({ ...source[side], trigger: 'scout' }, runtime[side]).runtimeSliceSemanticComplete).toBe(false);
      expect(compareTrinketSemanticPayload({ ...source[side], target: 'equipped-hero' }, runtime[side]).runtimeSliceSemanticComplete).toBe(false);
    });
  }
});
