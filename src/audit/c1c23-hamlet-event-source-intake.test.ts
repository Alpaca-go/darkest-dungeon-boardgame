import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildArtifacts, buildRoi, decide, load, root, unresolvedFields, verifyAssets } from '../../scripts/audit/c1c23-contract';

const fresh = () => buildArtifacts();
type Artifacts = ReturnType<typeof fresh>;
const sameAsSource = (a: Artifacts) => {
  const expected = fresh();
  for (const key of Object.keys(expected) as Array<keyof Artifacts>) {
    if (JSON.stringify(a[key]) !== JSON.stringify(expected[key])) throw new Error('Source/semantic/capability drift: ' + key);
  }
};
describe('C1C23 exact printed source intake', () => {
  it('covers exactly all 16 locked physical identities with unique two-sided sheet/cell crops', async () => {
    await verifyAssets();
    const r = load('c1c22-hamlet-event-source-intake-register.json');
    const a = fresh();
    const defs = a['c1c23-hamlet-event-printed-definitions.json'].cards;
    expect(defs).toHaveLength(16);
    expect(new Set(defs.map((c: {physicalIdentity: string}) => c.physicalIdentity)).size).toBe(16);
    expect(defs.map((c: {physicalIdentity: string}) => c.physicalIdentity)).toEqual(r.cards.map((c: {physicalIdentity: string}) => c.physicalIdentity));
    for (const d of defs) {
      expect(d.printedName.length).toBeGreaterThan(0);
      expect(d.frontLiteral).toContain(d.printedName);
      expect(d.sourceReferences.map((s: {side: string}) => s.side)).toEqual(['front', 'back']);
      expect(d.sourceReferences.every((s: {kind: string}) => s.kind === 'LOCKED_TTS_CARD_CROP')).toBe(true);
      expect(d.backLiteral).toBe('HAMLET EVENT');
      expect(d.assetHashes.frontSheet).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(defs.find((d: {printedName: string}) => d.printedName === 'Uneventful Week')?.rulesLiteral).toBe('');
    expect(defs.find((d: {printedName: string}) => d.printedName === 'Militia Training')?.printedPreparationDays).toBe('?');
  }, 20_000); // Re-encodes all 32 PNG crops; budget for full byte-level provenance on busy hosts.
  it('registers every unresolved card/deck leaf and separates source, runtime and proof blockers', () => {
    const a = fresh();
    const sem = a['c1c23-hamlet-event-semantic-contracts.json'];
    const gaps = a['c1c23-hamlet-event-source-gap-register.json'];
    expect(sem.cards).toHaveLength(16);
    for (const c of sem.cards) for (const leaf of unresolvedFields(c)) {
      expect(gaps.sourceGaps.some(g => g.physicalIds.includes(c.physicalIdentity) && g.field === leaf.field && g.category === leaf.category && g.reason === leaf.reason)).toBe(true);
    }
    for (const leaf of unresolvedFields(sem.deckLifecycle, '/deckLifecycle')) expect(gaps.sourceGaps.some(g => g.field === leaf.field)).toBe(true);
    expect(gaps.sourceGaps.every(g => g.blockerKind === 'SOURCE')).toBe(true);
    expect(gaps.runtimeGaps.every(g => g.blockerKind === 'RUNTIME' || g.blockerKind === 'PROOF')).toBe(true);
    const medical = sem.cards.find((c: {printedName: string}) => c.printedName === 'Medical Breakthrough');
    expect(medical?.effects[0].target).toBe('selected Hero (not current Hero)');
    const lost = sem.cards.find((c: {printedName: string}) => c.printedName === 'Lost Shipment');
    expect(lost?.effects[0]).toMatchObject({type: 'MODIFY_PROVISION_ROLL_COUNT', amount: -2, timing: 'BEFORE_NEXT_QUEST'});
    expect(sem.deckLifecycle.reshuffleCondition.value).toContain('Shuffle drawn card back');
  });
  it('covers capability and whole-event ROI; reconstructs the decision without primitive-hit promotions', () => {
    const a = fresh();
    const caps = a['c1c23-hamlet-event-runtime-capability-matrix.json'];
    expect(caps.cards).toHaveLength(16);
    expect(caps.counts).toEqual({total: 16, literalComplete: 16, semanticComplete: 5, sourceGated: 16, runtimeBlocked: 16, productionReady: 0});
    const roi = buildRoi(caps.cards);
    expect(roi.promotionBasis).toBe('WHOLE_EVENT_PROMOTION');
    expect(roi.families.flatMap(f => f.candidateDefinitionIds).sort()).toEqual(caps.cards.map((c: {definitionId: string}) => c.definitionId).sort());
    expect(roi.families.every(f => f.expectedReadyGain === 0 && f.expectedReadyDefinitionIds.length === 0)).toBe(true);
    const stored = a['c1c23-next-workstream-decision.json'];
    expect(stored).toMatchObject(decide(roi));
    expect(stored.outcome).toBe('NO_IMMEDIATE_SOURCE_SAFE_CANDIDATE');
    // A shared primitive by itself never suffices; full bundles still retain source gates.
    expect(roi.families[0].implementationBundle).toContain('EVENT_SAVE_REPLAY');
    expect(roi.families[0].promotionChecks[0].remainingSourceGates.length).toBeGreaterThan(0);
  });
  it('stored artifacts reproduce exactly from source-bound inputs', () => {
    for (const [name, expected] of Object.entries(fresh())) expect(JSON.parse(readFileSync(root + name, 'utf8'))).toEqual(expected);
  });
  it('rejects actual provenance substitutions before accepting a crop manifest', async () => {
    const missing = load('c1c23-hamlet-event-crop-manifest.json');
    missing.crops.pop();
    await expect(verifyAssets(missing)).rejects.toThrow('Exact 16-card');
    const wrongCell = load('c1c23-hamlet-event-crop-manifest.json');
    wrongCell.crops[0].front.bounds.left += 1;
    await expect(verifyAssets(wrongCell)).rejects.toThrow('sheet/cell crop');
    const sharedCrop = load('c1c23-hamlet-event-crop-manifest.json');
    sharedCrop.crops[1].front.path = sharedCrop.crops[0].front.path;
    await expect(verifyAssets(sharedCrop)).rejects.toThrow('sheet/cell crop');
    const foreignSource = load('c1c23-hamlet-event-crop-manifest.json');
    foreignSource.assets[0].sourceUrl = 'src/data/hamlet-events.ts';
    await expect(verifyAssets(foreignSource)).rejects.toThrow('sheet/receipt');
  });
  const mutations: Array<[string, (a: Artifacts) => void]> = [
    ['omitted physical identity', a => {a['c1c23-hamlet-event-printed-definitions.json'].cards.pop();}],
    ['duplicate definition', a => {const c = a['c1c23-hamlet-event-printed-definitions.json'].cards; c[0].physicalIdentity = c[1].physicalIdentity;}],
    ['wrong crop sheet hash', a => {a['c1c23-hamlet-event-printed-definitions.json'].cards[0].assetHashes.frontSheet = '0'.repeat(64);}],
    ['back binding omitted', a => {a['c1c23-hamlet-event-printed-definitions.json'].cards[0].sourceReferences.pop();}],
    ['mock/runtime used as printed evidence', a => {a['c1c23-hamlet-event-printed-definitions.json'].cards[0].sourceReferences[0].kind = 'src/data/hamlet-events.ts';}],
    ['rule literal adapted to mock behavior', a => {a['c1c23-hamlet-event-printed-definitions.json'].cards[0].rulesLiteral = 'each provision +1';}],
    ['missing semantic contract', a => {a['c1c23-hamlet-event-semantic-contracts.json'].cards.pop();}],
    ['source gap silently cleared', a => {a['c1c23-hamlet-event-source-gap-register.json'].sourceGaps.pop();}],
    ['capability census shortened', a => {a['c1c23-hamlet-event-runtime-capability-matrix.json'].cards.pop();}],
    ['false production readiness', a => {a['c1c23-hamlet-event-runtime-capability-matrix.json'].cards[0].productionReady = true;}],
    ['primitive hits used for ROI', a => {a['c1c23-hamlet-event-runtime-roi-matrix.json'].families[0].expectedReadyGain = 16;}],
    ['decision detached from ROI', a => {a['c1c23-next-workstream-decision.json'].expectedReadyGain = 1;}],
    ['ordinary shuffle inferred at exhaustion', a => {a['c1c23-hamlet-event-semantic-contracts.json'].deckLifecycle.exhaustedDeckBehavior.reason = 'reshuffle discard pile';}],
  ];
  it.each(mutations)('rejects %s', (_name, mutate) => {const a = fresh(); mutate(a); expect(() => sameAsSource(a)).toThrow();});
});
