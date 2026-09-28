import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildArtifacts, buildRoi, decide, load, ordinaryCards, root, unresolvedFields, validateArtifacts, verifyAssets } from '../../scripts/audit/c1c24-contract';

const source = buildArtifacts();
const fresh = () => structuredClone(source);
type Artifacts = typeof source;
const defs = source['c1c24-boss-printed-definitions.json'].cards;
describe('C1C24 ordinary Boss source inventory', () => {
  it('covers only all 231 existing ordinary physical identities, exactly once', () => {
    const locked = ordinaryCards();
    expect(defs).toHaveLength(231);
    expect(defs.map(d => d.physicalIdentity)).toEqual(locked.map(c => c.physicalIdentity));
    expect(new Set(defs.map(d => d.physicalIdentity)).size).toBe(231);
    expect(new Set(defs.map(d => d.definitionId)).size).toBe(231);
    expect(locked.every(c => c.category === 'Bosses' && c.physicalCount === 1)).toBe(true);
    const excluded = load('c1c22-boss-encounter-live-inventory.json').cards.filter((c: {category:string}) => c.category !== 'Bosses');
    expect(excluded).toHaveLength(47);
    expect(excluded.every((c: {physicalIdentity:string}) => !defs.some(d => d.physicalIdentity === c.physicalIdentity))).toBe(true);
    expect(source['c1c24-boss-source-manifest.json'].excludedCategories).toEqual({bossQuest:1,hamletEvent:16,guardian:16,finalEncounter:14});
    expect(source['c1c24-boss-source-manifest.json'].bossQuest.retainedSourceGate).toBe('REST_INSUFFICIENT_RECOVERY_CAPACITY');
  });
  it('classifies family from the exact containing object and subtype from printed evidence', () => {
    const families = source['c1c24-boss-family-classification.json'].cards;
    const sub = source['c1c24-boss-subtype-classification.json'];
    expect(families).toHaveLength(231);
    for (const f of families) {
      expect(f.familyClassificationEvidence[0].nickname).toBe(f.family);
      expect(f.familyClassificationEvidence[0].kind).toBe('SOURCE_CONTAINER');
      expect(f.classificationStatus).toBe('FAMILY_CLASSIFIED');
    }
    expect(sub.counts).toMatchObject({BATTLE:114,THREAT:51,ABILITY:12,BOSS_IDENTITY:54,PHASE:0,UNRESOLVED:0});
    expect(Object.values(sub.counts).reduce((a,b) => a+b,0)).toBe(231);
    for (const c of sub.cards) {
      expect(c.confidence).toBe('high');
      expect(c.classificationEvidence.some(e => e.kind === 'PRINTED_STRUCTURAL_CONVENTION')).toBe(true);
      expect(c.classificationEvidence.some(e => e.kind === 'LOCKED_CORE_RULEBOOK')).toBe(true);
      expect(c.classificationEvidence.some(e => /ARTWORK|RUNTIME|PROTOTYPE/.test(e.kind))).toBe(false);
    }
    expect(sub.cards.filter(c => c.subtype === 'THREAT').every(c => c.sideSubtypes.front === 'ABILITY' && c.sideSubtypes.back === 'THREAT')).toBe(true);
    expect(sub.cards.filter(c => c.sideSubtypes.front === 'ABILITY')).toHaveLength(63);
    expect(sub.cards.filter(c => c.componentRole === 'PAIRED_EMPTY_FULL_STATE')).toHaveLength(3);
    expect(families.filter(f => f.family === 'Garden Guardian')).toHaveLength(21);
  });
  it('rebuilds all 462 exact crops and checks original-byte receipts, MIME, grids and draft binding', async () => {
    await verifyAssets();
  }, 240_000);
  it('distinguishes both-sided literal completion, partial draft aids, printed absence and semantic gates', () => {
    expect(defs.filter(d => d.literalComplete)).toHaveLength(56);
    expect(defs.filter(d => d.literalStatus === 'LITERAL_PARTIAL')).toHaveLength(175);
    expect(defs.filter(d => d.family === 'Necromancer').every(d => d.literalComplete)).toBe(true);
    expect(defs.every(d => !d.semanticComplete && d.sourceGated && !d.runtimeCandidate && !d.productionReady)).toBe(true);
    expect(defs.every(d => !d.transcription.ocrAuthority && !d.transcription.runtimeAsEvidence)).toBe(true);
    expect(defs.find(d => d.cardId === 41900)?.printedLevel.status).toBe('PRINTED_ABSENT');
    expect(defs.find(d => d.cardId === 43702)?.printedLevel).toMatchObject({value:'I',side:'back'});
    expect(defs.find(d => d.cardId === 46039)?.frontLiteral).toContain('[ORANGE_HEART:144]');
    expect(defs.find(d => d.cardId === 46037)?.frontLiteral).toContain('Bone Rabble');
    expect(defs.find(d => d.cardId === 42004)?.backLiteral).toContain("Graveyard's effect as normal.");
    expect(defs.find(d => d.cardId === 42005)?.backLiteral).toContain("can't use the Graveyard's effect though.");
    expect(defs.find(d => d.cardId === 44022)?.identityRelations.sameNameLevelCandidatePhysicalIds).toHaveLength(2);
    expect(defs.find(d => d.cardId === 44022)?.identityRelations.identicalPrintedPixelPhysicalIds).toHaveLength(1);
    expect(defs.find(d => d.cardId === 44022)?.identityRelations.printedDuplicate).toBe(false);
    expect(defs.find(d => d.cardId === 44022)?.identityRelations.observedHeaderGlyph).toMatchObject({value:'WHITE_CIRCULAR_MARK'});
    expect(defs.find(d => d.cardId === 44023)?.identityRelations.observedHeaderGlyph).toMatchObject({value:'BLACK_CIRCULAR_MARK'});
    expect(defs.find(d => d.cardId === 43121)?.printedVariant.status).toBe('SOURCE_UNRESOLVED');
    expect(defs.find(d => d.cardId === 47313)?.printedVariant).toMatchObject({value:'Empty / Full'});
    for (const d of defs) expect(d.sourceReferences.map(r => r.side)).toEqual(['front','back']);
  });
  it('registers every unresolved leaf, not engine gaps masquerading as source gaps', () => {
    const gaps = source['c1c24-boss-source-gap-register.json'].sourceGaps;
    for (const d of defs) for (const g of unresolvedFields(d)) {
      expect(gaps.some(x => x.physicalIds[0] === d.physicalIdentity && x.field === g.field && x.category === g.category && x.reason === g.reason)).toBe(true);
    }
    expect(gaps).toHaveLength(defs.flatMap(d => unresolvedFields(d)).length);
    expect(new Set(gaps.map(g => g.gapId)).size).toBe(gaps.length);
    expect(gaps.every(g => g.blockerKind === 'SOURCE' && g.category !== 'ENGINE_BINDING_MISSING')).toBe(true);
    expect(gaps.filter(g => g.category === 'PRINTED_TEXT_NOT_TRANSCRIBED')).toHaveLength(175);
    expect(gaps.filter(g => /FAMILY_UNRESOLVED|SUBTYPE_UNRESOLVED|FRONT_BACK_PAIRING_UNRESOLVED|PRINTED_TEXT_UNREADABLE/.test(g.category))).toHaveLength(0);
  });
  it('partitions families and derives source ROI / decision; small family and primitive hits do not promote Ready', () => {
    const matrix = source['c1c24-boss-family-completeness-matrix.json'].families;
    expect(matrix).toHaveLength(20);
    expect(matrix.reduce((n,f) => n+f.physicalCardCount,0)).toBe(231);
    for (const f of matrix) {
      const local = defs.filter(d => d.family === f.family);
      expect(f.physicalCardCount).toBe(local.length);
      expect(Object.values(f.cards).flat().sort()).toEqual(local.map(d => d.physicalIdentity).sort());
      expect(f.literalCompleteCount).toBe(local.filter(d => d.literalComplete).length);
      expect(f.sourceGapCount).toBe(source['c1c24-boss-source-gap-register.json'].sourceGaps.filter(g => g.family === f.family).length);
    }
    const roi = buildRoi(matrix);
    expect(roi.families.every(f => f.expectedWholeContentReadyGain === 0 && f.immediateReadyGain === 0)).toBe(true);
    expect(roi.families[0].family).toBe('Necromancer');
    expect(decide(roi)).toMatchObject({selectedFamily:'Necromancer',outcome:'BOSS_FAMILY_SOURCE_INTAKE_SELECTED',expectedReadyGain:0,alreadyLiteralComplete:9,boundedSemanticIntakePotential:9,runtimeFoundationSelected:false});
    expect(source['c1c24-next-workstream-decision.json']).toMatchObject(decide(roi));
    const incomplete = matrix.map(f => ({...f, allSourceSidesBound:false}));
    expect(decide(buildRoi(incomplete)).outcome).toBe('BOSS_SUBTYPE_CLASSIFICATION_CONTINUATION');
    const unclassified = matrix.map(f => ({...f, subtypeClassifiedCount:0, unresolvedSubtypeCount:f.physicalCardCount}));
    expect(decide(buildRoi(unclassified)).outcome).toBe('BOSS_SUBTYPE_CLASSIFICATION_CONTINUATION');
    const withoutNecromancer = decide(buildRoi(matrix.map(f => f.family === 'Necromancer' ? {...f,allSourceSidesBound:false} : f)));
    expect(withoutNecromancer.selectedFamily).toBe('Prophet');
    expect(withoutNecromancer.requiredSourceClosure?.some(c => /Bone Rabble|Haunted Graveyard/.test(c))).toBe(false);
  });
  it('stored artifacts reproduce from locked sources and curated observations', () => {
    for (const [name, expected] of Object.entries(source)) expect(JSON.parse(readFileSync(root+name,'utf8'))).toEqual(expected);
  });
  it('rejects actual omitted cells, identity/state swaps, shifted cells, reused crops and foreign URLs', async () => {
    const missing = load('c1c24-boss-crop-manifest.json'); missing.crops.pop();
    await expect(verifyAssets(missing,false)).rejects.toThrow('census');
    const swapped = load('c1c24-boss-crop-manifest.json'); swapped.crops[0].cardId += 1;
    await expect(verifyAssets(swapped,false)).rejects.toThrow('physical identity');
    const shifted = load('c1c24-boss-crop-manifest.json'); shifted.crops[0].front.bounds.left += 1;
    await expect(verifyAssets(shifted,false)).rejects.toThrow('sheet/cell');
    const reused = load('c1c24-boss-crop-manifest.json'); reused.crops[0].front.path = reused.crops[1].front.path;
    await expect(verifyAssets(reused,false)).rejects.toThrow('canonical crop');
    const foreign = load('c1c24-boss-crop-manifest.json'); foreign.assets[0].sourceUrl = 'src/data/bosses.ts';
    await expect(verifyAssets(foreign,false)).rejects.toThrow('source URL');
  });
  const mutations: Array<[string,(a:Artifacts)=>void]> = [
    ['omitted identity',a => {a['c1c24-boss-printed-definitions.json'].cards.pop();}],
    ['duplicate definition',a => {a['c1c24-boss-printed-definitions.json'].cards[0].physicalIdentity = defs[1].physicalIdentity;}],
    ['Guardian intrusion',a => {a['c1c24-boss-family-classification.json'].cards[0].family = 'Guardian';}],
    ['artwork-only subtype',a => {a['c1c24-boss-subtype-classification.json'].cards[0].classificationEvidence = [{kind:'ARTWORK_ONLY',side:'front',value:'looks like a Threat',cropPath:'',cropSha256:''}];}],
    ['mock authority',a => {a['c1c24-boss-printed-definitions.json'].cards[0].sourceReferences[0].kind = 'PROTOTYPE_BOSS';}],
    ['conflicting literal',a => {a['c1c24-boss-printed-definitions.json'].cards[0].backLiteral = 'Graveyard is always blocked';}],
    ['false OCR completion',a => {a['c1c24-boss-printed-definitions.json'].cards.find(d => !d.literalComplete)!.literalComplete = true;}],
    ['unregistered gap',a => {a['c1c24-boss-source-gap-register.json'].sourceGaps.pop();}],
    ['counterfeit production Ready',a => {a['c1c24-boss-printed-definitions.json'].cards[0].productionReady = true;}],
    ['matrix count drift',a => {a['c1c24-boss-family-completeness-matrix.json'].families[0].physicalCardCount += 1;}],
    ['ROI detached from source',a => {a['c1c24-boss-source-intake-roi-matrix.json'].families[0].expectedWholeContentReadyGain = 9;}],
    ['runtime selected without semantics',a => {a['c1c24-next-workstream-decision.json'].outcome = 'BOSS_RUNTIME_FOUNDATION_SELECTED';}],
    ['upstream Ready drift',a => {a['c1c24-boss-source-manifest.json'].baselineFrozenReady.standardQuest = '4/75';}],
  ];
  it.each(mutations)('rejects %s', (_name,mutate) => {const a=fresh();mutate(a);expect(() => validateArtifacts(a)).toThrow('source-derived artifact drift');});
});
