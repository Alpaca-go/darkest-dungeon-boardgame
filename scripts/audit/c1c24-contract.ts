import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { observations, transcriptionPolicy } from './c1c24-printed-source';

export const baselineHead = '877f14bff74a4dd9dfd18ea3fff3e1d8acc0f549';
export const root = 'docs/data/complete-edition/';
export const git = (...args: string[]) => execFileSync('git', args, {encoding: 'utf8', maxBuffer: 128 * 1024 * 1024}).trim();
export const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const hash = (p: string) => sha256(readFileSync(p));
export const load = (name: string) => JSON.parse(readFileSync(root + name, 'utf8'));
const unresolved = (category: string, reason: string) => ({status: 'SOURCE_UNRESOLVED' as const, category, reason});
const absent = (basis: string) => ({status: 'PRINTED_ABSENT' as const, value: null, basis});
export interface Card {
  physicalIdentity: string; sourceObjectGuid: string; ttsPath: string; family: string; category: string;
  cardId: number; deckId: number; cardIndex: number; physicalCount: number; isState: boolean;
  numWidth: number; numHeight: number; uniqueBack: boolean; faceUrl: string; backUrl: string; visualIdentity: string;
}
interface Side {
  status: string; path: string; assetId: string; sheetPath: string; sheetSha256: string; sourceUrl: string;
  cell: number; grid: {width: number; height: number}; bounds: {left: number; top: number; width: number; height: number}; cropSha256: string;
}
interface Crop {physicalIdentity: string; sourceObjectGuid: string; ttsPath: string; cardId: number; deckId: number; cardIndex: number; uniqueBack: boolean; isState: boolean; front: Side; back: Side}
interface Asset {
  assetId: string; path: string; sourceUrl: string; acquiredAt: string; acquisitionKind: string;
  cachePath: string | null; mimeType: string; mimeBasis: string; sha256: string; sourceContentSha1: string;
  width: number; height: number; format: string; byteLength: number;
  gridBindings: Array<{deckId: number; side: string; gridWidth: number; gridHeight: number}>;
}
interface Manifest {ttsSource: {path: string; sha256: string}; inventoryPath: string; inventorySha256: string; assets: Asset[]; failures: unknown[]; crops: Crop[]}
interface Raw {physicalIdentity: string; containerHierarchy: Array<{guid: string; nickname: string; objectType: string; ttsPath: string}>}
export const ordinaryCards = (): Card[] => load('c1c22-boss-encounter-live-inventory.json').cards.filter((c: Card) => c.category === 'Bosses');
const assert = (v: unknown, why: string) => {if (!v) throw new Error('C1C24: ' + why);};
export function unresolvedFields(value: unknown, path = ''): Array<{field: string; category: string; reason: string}> {
  if (!value || typeof value !== 'object') return [];
  const obj = value as Record<string, unknown>;
  if (obj.status === 'SOURCE_UNRESOLVED') return [{field: path, category: String(obj.category), reason: String(obj.reason)}];
  return Object.entries(obj).flatMap(([key, child]) => unresolvedFields(child, path + '/' + key));
}
const rb = (page: number, region: string) => ({kind: 'LOCKED_CORE_RULEBOOK', path: root + 'c1c19-rulebook-extracted-evidence.json', page, region});
const subtypes = ['BATTLE', 'THREAT', 'ABILITY', 'BOSS_IDENTITY', 'PHASE', 'SUMMON', 'ROOM_RULE', 'TOKEN_RULE', 'REFERENCE', 'OTHER_SOURCE_BOUND', 'UNRESOLVED'];
const countTypes = (cards: Array<{subtype: string}>) => Object.fromEntries(subtypes.map(s => [s, cards.filter(c => c.subtype === s).length]));

export function buildArtifacts() {
  const cards = ordinaryCards();
  const manifest: Manifest = load('c1c24-boss-crop-manifest.json');
  const raw: {objects: Raw[]} = load('complete-edition-raw-inventory.json');
  assert(cards.length === 231 && new Set(cards.map(c => c.physicalIdentity)).size === 231, 'exact locked ordinary census');
  assert(observations.length === 231 && new Set(observations.map(o => o.cardId)).size === 231 && observations.every(o => cards.some(c => c.cardId === o.cardId)), 'reviewed cells must equal locked census');
  const inputPaths = ['c1c22-boss-encounter-live-inventory.json', 'complete-edition-raw-inventory.json', 'c1c24-boss-crop-manifest.json', 'c1c24-boss-ocr-drafts.json', 'c1c19-rulebook-extracted-evidence.json'].map(p => root + p).concat('scripts/audit/c1c24-printed-source.ts');
  const meta = {schemaVersion: 1, phase: '11A.4-C1C-24', baselineHead, inputSha256: Object.fromEntries(inputPaths.map(p => [p, hash(p)]))};
  const families = cards.map(c => {
    const object = raw.objects.find(o => o.physicalIdentity === c.physicalIdentity)!;
    const last = object.containerHierarchy.filter(h => h.nickname).at(-1)!;
    assert(last.nickname === c.family, 'family differs from exact source container');
    return {physicalIdentity: c.physicalIdentity, sourceObjectGuid: c.sourceObjectGuid, ttsPath: c.ttsPath,
      family: last.nickname, classificationStatus: 'FAMILY_CLASSIFIED', confidence: 'high',
      familyClassificationEvidence: [{kind: 'SOURCE_CONTAINER', ...last, sourcePath: root + 'complete-edition-raw-inventory.json',
        basis: 'Last named containing object on the SAME locked TTS physical path; auxiliary printed names do not create extra families.'}]};
  });
  const classifications = cards.map(c => {
    const o = observations.find(o => o.cardId === c.cardId)!;
    const crop = manifest.crops.find(p => p.physicalIdentity === c.physicalIdentity)!;
    const frontRole = o.subtype === 'THREAT' ? 'ABILITY' : o.subtype;
    return {physicalIdentity: c.physicalIdentity, family: c.family, cardId: c.cardId, subtype: o.subtype,
      classificationStatus: 'SUBTYPE_CLASSIFIED', confidence: 'high', componentRole: o.role,
      sideSubtypes: {front: frontRole, back: o.subtype === 'THREAT' ? 'THREAT' : o.backName === 'Cauldron Full' ? 'BATTLE' : 'REFERENCE'},
      printedSubtype: o.subtype === 'ABILITY' ? {status: 'PRINTED_EXPLICIT', value: 'Ability', side: 'back'} : absent('No literal Battle/Threat/Identity type word; class is bound from printed structure and core convention.'),
      classificationEvidence: [{kind: 'PRINTED_STRUCTURAL_CONVENTION', side: 'front', value: `${o.name}; ${o.marker}`, cropPath: crop.front.path, cropSha256: crop.front.cropSha256},
        {kind: 'PRINTED_LABEL', side: 'back', value: o.backName, cropPath: crop.back.path, cropSha256: crop.back.cropSha256},
        rb(o.subtype === 'BATTLE' ? 24 : 30, o.subtype === 'BATTLE' ? 'Anatomy of a Monster Card: numbered Skills, Life, Stance/Skill Eligibility' : 'Bosses: three level versions, passive Hamlet/Dungeon threats; flip Threats to Battle abilities; named Boss subject'),
        ...(c.family === 'Necromancer' || c.family === 'Prophet' ? [rb(38, c.family + ' Battle Card setup')] : c.family === 'Collector' || c.family === 'Fanatic' ? [rb(39, c.family + ' Battle Cards and auxiliary components')] : [])],
      review: {method: 'Independent visual reading of every original front/back crop; contact pages for enumeration, original resolution for full transcription', runtimeAsEvidence: false},
    };
  });
  const definitions = cards.map(c => {
    const o = observations.find(o => o.cardId === c.cardId)!;
    const crop = manifest.crops.find(p => p.physicalIdentity === c.physicalIdentity)!;
    const classification = classifications.find(s => s.physicalIdentity === c.physicalIdentity)!;
    const complete = !!o.frontFull && !!o.backFull;
    const copied = cards.filter(other => {
      const p = manifest.crops.find(p => p.physicalIdentity === other.physicalIdentity)!;
      return p.front.cropSha256 === crop.front.cropSha256 && p.back.cropSha256 === crop.back.cropSha256;
    });
    return {definitionId: `ce-boss-${c.cardId}-${c.sourceObjectGuid}`, physicalIdentity: c.physicalIdentity, sourceObjectGuid: c.sourceObjectGuid, ttsPath: c.ttsPath,
      family: c.family, cardId: c.cardId, subtype: o.subtype, printedName: o.name, printedBackName: o.backName,
      printedSubtype: classification.printedSubtype,
      printedLevel: o.level ? {status: 'PRINTED_EXPLICIT', value: o.level, side: o.levelSide} : absent('Both original sides reviewed; no printed Roman level. Never borrow level I from another card in this family.'),
      printedVariant: o.variant ? {status: 'PRINTED_EXPLICIT', value: o.variant, side: 'front+back'} : o.observedHeaderGlyph ? unresolved('VARIANT_UNRESOLVED', 'Same-name/level candidates differ in the printed white/black circular header mark. The observed glyph is preserved separately; its variant/copy meaning is not bound.') : absent('No separate variant label; named component/level is stored independently.'),
      frontLiteral: o.frontFull ?? `${o.name}${o.levelSide === 'front' ? '\n[LEVEL:' + o.level + ']' : ''}${o.observedHeaderGlyph ? '\n[HEADER_GLYPH:' + o.observedHeaderGlyph + ']' : ''}\n[REVIEWED_STRUCTURE] ${o.marker}`,
      backLiteral: o.backFull ?? `${o.backName}${o.level ? '\n[LEVEL:' + o.level + ']' : ''}`,
      literalStatus: complete ? 'LITERAL_COMPLETE' : 'LITERAL_PARTIAL', literalComplete: complete,
      remainingPrintedDefinition: complete ? {status: 'BOTH_SIDES_TRANSCRIBED'} : unresolved('PRINTED_TEXT_NOT_TRANSCRIBED', 'Header/structural classification reviewed; remaining functional text, values and icons require visual transcription. The source is acquired, not claimed unreadable. Unreviewed OCR is not authority.'),
      transcription: {policy: transcriptionPolicy, ocrDraftPath: root + 'c1c24-boss-ocr-drafts.json', ocrAuthority: false, runtimeAsEvidence: false},
      sourceReferences: (['front','back'] as const).map(side => ({kind: 'LOCKED_TTS_CARD_CROP', manifestPath: root + 'c1c24-boss-crop-manifest.json', physicalIdentity: c.physicalIdentity, side, ...crop[side]})),
      assetHashes: {frontSheet: crop.front.sheetSha256, backSheet: crop.back.sheetSha256, frontCrop: crop.front.cropSha256, backCrop: crop.back.cropSha256},
      identityRelations: {physicalCount: c.physicalCount, ttsAlternateState: c.isState, pairedPrintedState: o.variant ?? 'NONE_PRINTED',
        levelVariant: o.level, componentRole: o.role, identicalPrintedPixelPhysicalIds: copied.map(p => p.physicalIdentity),
        physicalDuplicate: o.sameNameLevelCandidateIds ? unresolved('COPY_POLICY_UNRESOLVED', 'Distinct TTS physical objects with same name/level but different printed header marks; duplicate policy cannot be inferred.') : copied.length > 1,
        sameNameLevelCandidatePhysicalIds: (o.sameNameLevelCandidateIds ?? [c.cardId]).map(id => cards.find(p => p.cardId === id)!.physicalIdentity),
        observedHeaderGlyph: o.observedHeaderGlyph ? {side: 'front', value: o.observedHeaderGlyph, cropSha256: crop.front.cropSha256} : absent('No paired header-glyph comparison asserted.'),
        printedDuplicate: o.sameNameLevelCandidateIds ? false : copied.length > 1,
        printedDuplicateBasis: o.sameNameLevelCandidateIds ? 'Original-resolution visual comparison found white versus black circular header marks. These are same-name/level candidates, not identical printed copies; meanings remain source unresolved.' : 'No reviewed printed-copy group beyond this object; exact BOTH crop-byte equality is retained separately, never sufficient for semantic merging.',
        sameArtworkDoesNotMerge: true, semanticEquivalence: unresolved('COPY_POLICY_UNRESOLVED', 'TTS physical copies and equal pixels do not establish campaign copy policy or equivalent semantics across levels, components and states.')},
      preliminarySemantic: {
        trigger: o.subtype === 'THREAT' ? {value: 'Separate Hamlet and Dungeon passive threats; cease when flipped for Boss Battle', source: rb(30,'Bosses; Fighting a Boss')} : unresolved('TIMING_UNRESOLVED','Full component-specific activation window and priority have not been normalized.'),
        window: unresolved('TIMING_UNRESOLVED','Clause timing, first battle/day, interrupt priority and simultaneous resolution need a card-local contract.'),
        target: unresolved('TARGET_UNRESOLVED','Printed targets and target glyphs require exact selection/tie policy; no current-Hero default.'),
        choice: unresolved('TARGET_UNRESOLVED','Required choices and ties must be bound; no assumed automatic choice.'),
        cost: unresolved('EFFECT_ORDER_UNRESOLVED','Cost versus condition/effect distinctions have not been normalized.'),
        effect: unresolved('EFFECT_ORDER_UNRESOLVED','Full functional rule/icon normalization and ordering remain open.'),
        duration: unresolved('TIMING_UNRESOLVED','Exact duration and persistence outside the printed window remain unbound.'),
        phase: o.variant ? {value: 'One physical card, Empty front / Full back', sourceDefinition: c.cardId} : unresolved('PHASE_RELATION_UNRESOLVED','No complete family transition contract; named forms and printed levels must not imply an invented phase order.'),
        stateTransition: o.variant ? {value: 'Ability 42418-42420 explicitly flips Empty to Full when occupied and back on Cauldron Life / Hero Death\'s Door condition', sourceCards: [42418,42419,42420]} : unresolved('PHASE_RELATION_UNRESOLVED','Pairing is known; transition eligibility, ordering and retained state require source review.'),
        summon: unresolved('BATTLE_DECK_MEMBERSHIP_UNRESOLVED','Summon identities, external monster-card membership, available copies and capacity precedence are not a complete contract.'),
        movement: unresolved('TARGET_UNRESOLVED','Exact movement/placement priorities and full-area handling have not been normalized.'),
        attack: unresolved('EFFECT_ORDER_UNRESOLVED','Accuracy/Crit/effect glyphs and skill eligibility need exact contracts, not a prototype attack adapter.'),
        condition: unresolved('TIMING_UNRESOLVED','All printed prerequisite and exception branches require card-local normalization.'),
        cleanup: unresolved('EFFECT_ORDER_UNRESOLVED','Component-specific cleanup and threat expiry/source exceptions require verification.'),
        victoryInteraction: unresolved('RULEBOOK_BINDING_UNRESOLVED','p30 generic Boss death ending battle is reference only; auxiliary/card exceptions and encounter victory unit need family binding.'),
        deckInteraction: unresolved(o.subtype === 'THREAT' ? 'THREAT_DECK_MEMBERSHIP_UNRESOLVED' : o.subtype === 'ABILITY' ? 'ABILITY_DECK_MEMBERSHIP_UNRESOLVED' : 'BATTLE_DECK_MEMBERSHIP_UNRESOLVED','Physical source container is established; campaign encounter selection/copy/level/expansion composition is unbound.'),
      }, semanticComplete: false, sourceGated: true, runtimeCandidate: false, productionReady: false,
    };
  });
  const gaps = definitions.flatMap(d => unresolvedFields(d).map(g => ({gapId: d.definitionId + ':' + g.field, blockerKind: 'SOURCE', scope: 'CARD', family: d.family, physicalIds: [d.physicalIdentity], ...g})));
  const familyStructures = [...new Set(cards.map(c => c.family))].sort().map(family => {
    const defs = definitions.filter(d => d.family === family);
    const classified = classifications.filter(d => d.family === family);
    const bySubtype = Object.fromEntries(subtypes.map(s => [s.toLowerCase(), defs.filter(d => d.subtype === s).map(d => d.physicalIdentity)]));
    const observedForms = defs.filter(d => /FORM|STATE|TRANSFORM|MULTIFORM|BODY_PART/.test(d.identityRelations.componentRole));
    return {family, physicalCardCount: defs.length, cards: bySubtype,
      subtypePhysicalCounts: countTypes(classified), abilitySidePhysicalIds: classified.filter(c => c.sideSubtypes.front === 'ABILITY').map(c => c.physicalIdentity),
      bossSubjectPhysicalIds: defs.filter(d => d.identityRelations.componentRole.startsWith('BOSS_SUBJECT')).map(d => d.physicalIdentity),
      attachedMechanismPhysicalIds: defs.filter(d => !d.identityRelations.componentRole.startsWith('BOSS_SUBJECT') && !d.identityRelations.componentRole.startsWith('REVERSIBLE') && d.identityRelations.componentRole !== 'BOSS_BATTLE_ABILITY').map(d => d.physicalIdentity),
      formAndStatePhysicalIds: observedForms.map(d => d.physicalIdentity),
      subtypeClassifiedCount: classified.length, literalCompleteCount: defs.filter(d => d.literalComplete).length,
      semanticCompleteCount: 0, sourceGatedCount: defs.length, unresolvedSubtypeCount: 0,
      unresolvedPrintedDefinitionCount: defs.filter(d => !d.literalComplete).length,
      sourceGapCount: gaps.filter(g => g.family === family).length, runtimeCandidateCount: 0, productionReadyCount: 0,
      allSourceSidesBound: defs.every(d => d.sourceReferences.every(s => s.status === 'SOURCE_BOUND')),
    };
  });
  const roi = buildRoi(familyStructures);
  const decision = decide(roi);
  const counts = {physicalCards: 231, families: familyStructures.length, familyClassified: families.length, familyUnresolved: 0,
    subtypePhysicalCounts: countTypes(classifications), abilitySideCards: classifications.filter(c => c.sideSubtypes.front === 'ABILITY').length,
    pairedPrintedStateCards: definitions.filter(d => d.printedBackName === 'Cauldron Full').length,
    sourceSheets: manifest.assets.length, sourceBoundSides: definitions.flatMap(d => d.sourceReferences).filter(s => s.status === 'SOURCE_BOUND').length,
    literalComplete: definitions.filter(d => d.literalComplete).length, literalPartial: definitions.filter(d => !d.literalComplete).length, notExtracted: 0,
    semanticComplete: 0, sourceGated: 231, productionReady: 0, sourceGapCount: gaps.length};
  const frozenPaths = git('ls-tree','-r','--name-only',baselineHead,'--','docs/data/complete-edition','docs/reports/complete-edition').split(/\r?\n/).filter(p => /\/c1c(?:20|21|22|23)-/.test(p) || p.startsWith(root + 'source-assets/c1c23/'));
  return {
    'c1c24-boss-source-manifest.json': {...meta, authority: 'Existing C1C22 physical identities, exact original TTS URLs/bytes/cells, printed crop observations, locked core PDF. No runtime/prototype/videogame authority.',
      counts, ttsSource: manifest.ttsSource, cropManifest: root + 'c1c24-boss-crop-manifest.json', rulebook: {path: 'docs/DD_EN_COREBOX_RULES.pdf', sha256: hash('docs/DD_EN_COREBOX_RULES.pdf'), extractedEvidence: root + 'c1c19-rulebook-extracted-evidence.json'},
      sourcePriority: ['PRINTED_LABEL', 'PRINTED_STRUCTURAL_CONVENTION_WITH_LOCKED_CORE_RULEBOOK', 'EXACT_SOURCE_CONTAINER'],
      glyphPolicy: transcriptionPolicy, excludedCategories: {bossQuest: 1, hamletEvent: 16, guardian: 16, finalEncounter: 14},
      acquisitionFailuresRemaining: manifest.failures.length, frozenInputSha256: Object.fromEntries(frozenPaths.map(p => [p, hash(p)])),
      baselineFrozenReady: {coreTrinket: '15/37', standardQuest: '3/75', hamletEvent: '0/16', hamletEventLiteralComplete: 16, hamletEventCardLocalSemanticComplete: 5},
      bossQuest: {printedName: 'Face the Threat!', separatelyCounted: true, readyGain: 0, retainedSourceGate: 'REST_INSUFFICIENT_RECOVERY_CAPACITY'},
      historicalE2EFailures: ['C1C13 reload retry exhaustion','C1C12 reload retry exhaustion','C1C11 reload retry exhaustion','C1C3 selector click timeout'],
    },
    'c1c24-boss-family-classification.json': {...meta, cards: families},
    'c1c24-boss-subtype-classification.json': {...meta, countingPolicy: 'Exclusive physical subtype: THREAT denotes the reversible Threat/Ability card. Ability-side totals overlap and never add physical cards. Combat cards remain BATTLE with componentRole, not duplicate SUMMON/PHASE census.', counts: countTypes(classifications), cards: classifications},
    'c1c24-boss-printed-definitions.json': {...meta, runtimeImplemented: false, counts, cards: definitions},
    'c1c24-boss-source-gap-register.json': {...meta, supportedCategories: ['FAMILY_UNRESOLVED','SUBTYPE_UNRESOLVED','PRINTED_TEXT_UNREADABLE','PRINTED_TEXT_NOT_TRANSCRIBED','PRINTED_NAME_UNRESOLVED','LEVEL_UNRESOLVED','VARIANT_UNRESOLVED','FRONT_BACK_PAIRING_UNRESOLVED','COPY_POLICY_UNRESOLVED','PHASE_RELATION_UNRESOLVED','BATTLE_DECK_MEMBERSHIP_UNRESOLVED','THREAT_DECK_MEMBERSHIP_UNRESOLVED','ABILITY_DECK_MEMBERSHIP_UNRESOLVED','TIMING_UNRESOLVED','TARGET_UNRESOLVED','EFFECT_ORDER_UNRESOLVED','RULEBOOK_BINDING_UNRESOLVED'],
      sourceGaps: gaps, sourceAssetUnavailableCount: 0, note: 'Partial transcription is not missing assets or unreadability. No ENGINE_BINDING_MISSING is used to conceal source uncertainty.'},
    'c1c24-boss-family-completeness-matrix.json': {...meta, countingPolicy: 'Exclusive subtype lists partition 231 physical identities; abilitySidePhysicalIds and formAndStatePhysicalIds are overlapping annotations.', counts, families: familyStructures},
    'c1c24-boss-source-intake-roi-matrix.json': {...meta, ...roi},
    'c1c24-next-workstream-decision.json': {...meta, ...decision},
  };
}
type FamilyMatrix = {family: string; physicalCardCount: number; subtypeClassifiedCount: number; literalCompleteCount: number; semanticCompleteCount: number; unresolvedSubtypeCount: number; unresolvedPrintedDefinitionCount: number; sourceGapCount: number; runtimeCandidateCount: number; allSourceSidesBound: boolean; formAndStatePhysicalIds: string[]};
export function buildRoi(matrix: FamilyMatrix[]) {
  const canonical: Record<string, number> = {Necromancer:38, Prophet:38, Collector:39, Fanatic:39};
  return {promotionBasis: 'FAMILY_SOURCE_COMPLETENESS_NOT_PRIMITIVE_HITS', scorePolicy: 'Eligibility requires complete classification/assets. Score = 100*literal fraction + 20*direct named canonical setup + 10*absence of observed forms/states - 10*source gaps per card. Size supplies bounded scope, never a small-family bonus. Runtime Ready gain is zero without a complete family semantic contract and production proof.',
    families: matrix.map(f => {
      const classificationComplete = f.subtypeClassifiedCount === f.physicalCardCount && f.unresolvedSubtypeCount === 0;
      const eligibleForDeeperSourceIntake = classificationComplete && f.allSourceSidesBound;
      const canonicalSetupPage = canonical[f.family] ?? null;
      const printedFraction = f.literalCompleteCount / f.physicalCardCount;
      const boundedStructure = f.formAndStatePhysicalIds.length === 0;
      const score = Math.round((100 * printedFraction + (canonicalSetupPage ? 20 : 0) + (boundedStructure ? 10 : 0) - 10*f.sourceGapCount/f.physicalCardCount)*100)/100;
      return {family: f.family, familySize: f.physicalCardCount, classificationComplete, allSourceSidesBound: f.allSourceSidesBound,
        literalCompleteCount: f.literalCompleteCount, semanticCompleteCount: f.semanticCompleteCount, sourceGapCount: f.sourceGapCount,
        observedFormAndStateCount: f.formAndStatePhysicalIds.length, canonicalSetupPage, eligibleForDeeperSourceIntake,
        sharedMechanics: ['Generic Boss threat flip/expiry and initiative p30','Monster card anatomy/target/stance convention p24', ...(f.family === 'Necromancer' ? ['Three level variants use one shared summoning ability; p38 named setup and cleanup'] : [])],
        existingEngineOverlap: {evidenceRole:'NEGATIVE_READINESS_ONLY', genericPrimitivesAreNotBossConsumer:true, sourceBoundBossConsumerProven:false},
        actIVOverlap: {referenceOnly:true, reusedAcceptedSemantics:false, ordinaryGardenGuardianIsNotActIVGuardian:true, readyGain:0},
        expectedSourceSafeProgression: {remainingLiteralDefinitions:f.unresolvedPrintedDefinitionCount, cardLocalSemanticContractsToEstablish:f.physicalCardCount-f.semanticCompleteCount,
          basis:'Concrete physical definition IDs in the family matrix; source intake may close these gaps, success is not presumed.'},
        expectedWholeContentReadyGain:0, immediateReadyGain:0, sourceIntakeScore:score,
      };
    }).sort((a,b) => b.sourceIntakeScore-a.sourceIntakeScore || a.family.localeCompare(b.family))};
}
export function decide(roi: ReturnType<typeof buildRoi>) {
  const best = roi.families.find(f => f.eligibleForDeeperSourceIntake && f.literalCompleteCount > 0);
  if (!best) return {outcome:'BOSS_SUBTYPE_CLASSIFICATION_CONTINUATION', verdict:'NEXT-BOSS-SUBTYPE-CLASSIFICATION-CONTINUATION', selectedFamily:null, nextWorkstream:'C1C25 Threat / Battle / Ability classification closure', expectedReadyGain:0};
  return {outcome:'BOSS_FAMILY_SOURCE_INTAKE_SELECTED', verdict:'NEXT-BOSS-FAMILY-SOURCE-INTAKE-SELECTED', selectedFamily:best.family,
    nextWorkstream:`C1C25 ${best.family} printed-definition + semantic source intake`, selectionScore:best.sourceIntakeScore,
    expectedSourceDefinitionScope:best.familySize, alreadyLiteralComplete:best.literalCompleteCount,
    boundedSemanticIntakePotential:best.expectedSourceSafeProgression.cardLocalSemanticContractsToEstablish, expectedReadyGain:0,
    reason:`Highest eligible reproducible source-intake score; ${best.literalCompleteCount}/${best.familySize} verified literals, exact two-sided assets and subtype closure, named core setup page ${best.canonicalSetupPage ?? 'not established'}, ${best.observedFormAndStateCount} observed form/state objects. This selects source semantics only; no family-wide semantic/production contract exists.`,
    requiredSourceClosure: ['Resolve card-specific timing/target/ties and effect ordering','Bind complete encounter composition, levels and campaign copy policy','Bind summon monster source cards and Room Card/Tile external dependencies',
      ...(best.family === 'Necromancer' ? ['Retain printed Bone Rabble vs core p38 Bone Rubble discrepancy until source-resolved','Resolve full-Stance summoning suppression versus general replacement rules and source precedence','Resolve lowest-roll Hero ties for Haunted Graveyard / The Restless Dead'] : [])],
    runtimeFoundationSelected:false, productionReadyGainDemonstrated:false};
}

/** Metadata pass precedes all raster work, so tampered identities/cells/URLs fail early. */
export async function verifyAssets(m: Manifest = load('c1c24-boss-crop-manifest.json'), rebuild = true) {
  const cards = ordinaryCards();
  const urls = [...new Set(cards.flatMap(c => [c.faceUrl,c.backUrl]))].sort();
  assert(m.crops.length === 231 && m.assets.length === 34 && m.failures.length === 0, 'exact 231-card/34-sheet census');
  assert(m.inventoryPath === root+'c1c22-boss-encounter-live-inventory.json' && m.inventorySha256 === hash(m.inventoryPath), 'locked inventory hash');
  assert(m.ttsSource.sha256 === 'd2fe21a6aa294f80fb47e56677c3a74090c3dc131361d798dfde709f6a3a64a2', 'locked original TTS hash');
  assert(JSON.stringify(m.assets.map(a => a.sourceUrl).sort()) === JSON.stringify(urls), 'locked source URL set');
  const paths = new Set<string>();
  for (const c of cards) {
    const matches = m.crops.filter(p => p.physicalIdentity === c.physicalIdentity);
    assert(matches.length === 1, 'unique physical crop binding');
    const p = matches[0];
    for (const k of ['sourceObjectGuid','ttsPath','cardId','deckId','cardIndex','uniqueBack','isState'] as const) assert(p[k] === c[k], 'physical identity drift');
    assert(c.physicalCount === 1 && c.deckId === Math.floor(c.cardId/100) && c.cardIndex === c.cardId%100, 'physical count/card cell arithmetic');
    for (const side of ['front','back'] as const) {
      const s = p[side], url = c[side === 'front' ? 'faceUrl' : 'backUrl'];
      const a = m.assets.find(a => a.sourceUrl === url)!;
      const cell = side === 'back' && !c.uniqueBack ? 0 : c.cardIndex;
      const width = side === 'back' && !c.uniqueBack ? 1 : c.numWidth, height = side === 'back' && !c.uniqueBack ? 1 : c.numHeight;
      const col = cell%width, row = Math.floor(cell/width), left = Math.floor(col*a.width/width), top = Math.floor(row*a.height/height);
      const bounds = {left,top,width:Math.floor((col+1)*a.width/width)-left,height:Math.floor((row+1)*a.height/height)-top};
      assert(s.status === 'SOURCE_BOUND' && s.sourceUrl === url && s.sheetPath === a.path && s.assetId === a.assetId && s.sheetSha256 === a.sha256 && s.cell === cell && s.grid.width === width && s.grid.height === height && JSON.stringify(s.bounds) === JSON.stringify(bounds), 'exact sheet/cell crop');
      assert(s.path === `${root}source-assets/c1c24/crops/${c.cardId}-${c.sourceObjectGuid}-${side}.png` && !paths.has(s.path), 'unique canonical crop path');
      assert(a.gridBindings.some(g => g.deckId === c.deckId && g.side === side && g.gridWidth === width && g.gridHeight === height), 'sheet grid/card relation');
      paths.add(s.path);
    }
  }
  for (const a of m.assets) {
    const bytes = readFileSync(a.path), receipt = JSON.parse(readFileSync(a.path+'.receipt.json','utf8'));
    const contentSha1 = createHash('sha1').update(bytes).digest('hex');
    const info = await sharp(bytes).metadata();
    assert(a.assetId === sha256(a.sourceUrl) && a.path === root+'source-assets/c1c24/sheets/'+a.assetId+'.bin', 'deduplicated canonical sheet path');
    assert(sha256(bytes) === a.sha256 && bytes.length === a.byteLength && contentSha1 === a.sourceContentSha1 && contentSha1.toUpperCase() === a.sourceUrl.split('/').filter(Boolean).at(-1), 'original byte/content hash');
    assert(info.width === a.width && info.height === a.height && info.format === a.format && a.mimeType === 'image/'+(info.format === 'jpeg' ? 'jpeg' : info.format), 'sheet decoded metadata');
    assert(Number.isFinite(Date.parse(a.acquiredAt)) && ['LOCKED_URL_HTTP_DOWNLOAD','EXACT_URL_CONTENT_HASH_VERIFIED_CACHE'].includes(a.acquisitionKind), 'valid acquisition receipt');
    for (const key of ['sourceUrl','acquiredAt','acquisitionKind','cachePath','mimeType','mimeBasis','sha256','sourceContentSha1'] as const) assert(receipt[key] === a[key], 'sheet receipt drift');
    assert(readFileSync(a.path+'.sha256','utf8') === `${a.sha256}  ${a.assetId}.bin\n`, 'sheet SHA sidecar');
  }
  if (rebuild) for (const p of m.crops) for (const side of ['front','back'] as const) {
    const s = p[side];
    const bytes = await sharp(s.sheetPath).extract(s.bounds).png().toBuffer();
    assert(sha256(bytes) === s.cropSha256 && hash(s.path) === s.cropSha256, 'crop bytes rebuild from exact source cell');
  }
  const ocr = load('c1c24-boss-ocr-drafts.json');
  assert(ocr.evidenceRole === 'DRAFT_ONLY_NOT_PRINTED_AUTHORITY' && ocr.cards.length === 462, 'OCR is draft-only, all 462 sides');
  for (const p of m.crops) for (const side of ['front','back'] as const) {
    const matches = ocr.cards.filter((d: {physicalIdentity:string; side:string}) => d.physicalIdentity === p.physicalIdentity && d.side === side);
    assert(matches.length === 1 && matches[0].cropPath === p[side].path && matches[0].cropSha256 === p[side].cropSha256 && matches[0].status === 'UNREVIEWED_OCR_DRAFT', 'OCR binding/status');
  }
  assert(hash('docs/DD_EN_COREBOX_RULES.pdf') === '9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae', 'locked core PDF');
}
export function validateArtifacts(actual: ReturnType<typeof buildArtifacts>) {
  const expected = buildArtifacts();
  for (const name of Object.keys(expected) as Array<keyof typeof expected>) assert(JSON.stringify(actual[name]) === JSON.stringify(expected[name]), 'source-derived artifact drift: '+name);
}
export function report() {
  const a = buildArtifacts(), m = a['c1c24-boss-family-completeness-matrix.json'], s = m.counts, d = a['c1c24-next-workstream-decision.json'];
  return `# C1C24 Boss source inventory and subtype classification\n\nVerdict: C1C24-BOSS-SOURCE-INVENTORY-AND-SUBTYPE-CLASSIFICATION-ACCEPTED\n\nBaseline: ${baselineHead}, codex/phase-11a4-c1c23-hamlet-event-source-intake. All 231 ordinary Boss objects are the existing C1C22 identities, with one family, one definition and exact two-sided provenance each. No second census.\n\n## Census and classification\n\nFamily classified ${s.familyClassified}/231; unresolved ${s.familyUnresolved}; ${s.families} source families. Exclusive physical subtypes: Battle ${s.subtypePhysicalCounts.BATTLE}, Threat ${s.subtypePhysicalCounts.THREAT}, Ability ${s.subtypePhysicalCounts.ABILITY}, Boss identity ${s.subtypePhysicalCounts.BOSS_IDENTITY}, Phase ${s.subtypePhysicalCounts.PHASE}, other 0, unresolved 0.\n\nThe ${s.subtypePhysicalCounts.THREAT} Threat objects have Battle abilities on the opposite side (core p30). ${s.abilitySideCards} cards have an Ability side; this overlapping total is not added to the 231 census. Combat-stat components retain BATTLE plus an auxiliary/summon/form role. ${s.pairedPrintedStateCards} Cauldron objects pair Empty/Full on one physical card. Printed levels, exact crop-byte groups and named components remain separate; no artwork semantic deduplication. Eight Frozen Farmhand / Shambler Tentacle objects form four same-name/level candidate pairs with different white/black circular header marks. They are not identical printed copies; each glyph is preserved and variant/copy meaning remains source unresolved. No standalone PHASE subtype is asserted; observed form/state relations remain annotated and source gated.\n\n## Source and printed definitions\n\nAll ${s.sourceSheets} original URL sheets and ${s.sourceBoundSides} exact crops acquired. Original content SHA-1 matches the locked URL suffix; original SHA-256, decoded MIME/dimensions/byte size, receipt and grid relations are persisted. Shared sheets are stored once. Six first-pass transmission failures remain in acquisition history; zero final unavailable assets. Three front sheets came from a byte-verified original cache, with honest copy-acquisition receipts. MIME is decoded original format rather than an unrecorded HTTP header.\n\nLiteral complete ${s.literalComplete}; literal partial ${s.literalPartial}; not extracted ${s.notExtracted}. Complete requires BOTH functional sides including numerals/icons; named glyph tokens preserve visual content without engine meaning. All 462 OCR drafts are hash-bound and explicitly unreviewed/non-authoritative. Partial rows preserve reviewed name/level/header/structural evidence and register remaining transcription; acquired-but-not-transcribed is not called unreadable. Manual intake concentrates on complete Necromancer and additional clear identity/Ability/Threat cards; the other ${s.literalPartial} cards still need full visual transcription.\n\nSemantic complete ${s.semanticComplete}; source gated ${s.sourceGated}; runtime candidates 0; production Ready 0. Preliminary normalization only records supported common threat expiry and explicit paired Cauldron states. Every unresolved leaf is registered (${s.sourceGapCount} source gaps), with timing, target, ordering, copy/deck membership and rulebook binding distinguished. No engine blocker conceals source gaps.\n\n## Family completeness\n\n| Family | Physical | Classified | Literal complete | Partial | Source gaps | Semantic complete |\n|---|---:|---:|---:|---:|---:|---:|\n${m.families.map(f => `| ${f.family} | ${f.physicalCardCount} | ${f.subtypeClassifiedCount} | ${f.literalCompleteCount} | ${f.unresolvedPrintedDefinitionCount} | ${f.sourceGapCount} | ${f.semanticCompleteCount} |`).join('\n')}\n\n## Next workstream\n\n${d.verdict}: ${d.nextWorkstream}. The ROI matrix is rebuilt from literal fraction, direct named core setup, observed forms/states and source gaps per card; small size does not grant a bonus. Necromancer has all 9 physical definitions and literals, three identity/Threat/Battle level sets, one shared summoning ability, and explicit core p38 setup/cleanup. It provides a bounded 9-card semantic intake scope. Prophet still has its three combat cards to transcribe and Wooden Pew dependencies; Collector has nine Collected auxiliary cards plus three main combat cards pending. Colour-family small scopes alone do not win: transformation/Focus Point and external summon dependencies remain.\n\nC1C25 must bind exact targets/ties, threat timing/expiry, encounter copy/level composition, external Bone cards and Room Card/Tile, and source precedence. Preserve the printed Bone Rabble versus rulebook p38 Bone Rubble difference; do not silently rename. Full-Stance suppression versus generic replacement and lowest-roll Hero ties need source closure. No gameplay foundation is selected and no whole-content Ready gain is demonstrated.\n\n## Frozen boundaries and validation\n\nC1C20 stays 15/37 Ready; C1C21 stays 3/75. C1C22 locked 278 census and C1C23 16 literal / 5 card-local semantic / 16 gated / 0 Ready are unchanged. Garden Guardian ordinary cards are not Act IV Guardian. Guardian 16 and Final Encounter 14 remain excluded accepted references. Face the Threat! remains the separately counted C1C21 Boss Quest with REST_INSUFFICIENT_RECOVERY_CAPACITY. Hamlet Events, Trinkets and Standard Quests are outside this intake.\n\nThe verifier checks exact identity/cells, original receipts/hashes, all 462 byte-rebuilt crops, draft bindings, complete artifact/gap/matrix/ROI reconstruction, and an audit-only Git allowlist against baseline. Tests reject omitted/duplicate identities, foreign categories/sources, artwork-only promotion, conflicting literals, missing gaps, counterfeit Ready and detached decisions. No Boss runtime, engine, selector, UI, save/replay or Act IV code changed.\n\nHistorical C1C21 E2E failures remain open: C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout. This phase does not claim Complete Edition E2E fully accepted. See c1c24-validation-report.md for actual command results.\n`;
}
export function generate() {
  for (const [name, value] of Object.entries(buildArtifacts())) writeFileSync(root+name, JSON.stringify(value,null,2)+'\n');
  writeFileSync('docs/reports/complete-edition/c1c24-boss-source-intake-report.md',report());
}
