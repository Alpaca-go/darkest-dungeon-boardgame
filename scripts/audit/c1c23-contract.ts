import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { printedSources } from './c1c23-printed-source';

export const baselineHead = 'a6f29f9543f017c454724bbeade445c94d0c63f2';
export const root = 'docs/data/complete-edition/';
export const git = (...args: string[]) => execFileSync('git', args, {encoding: 'utf8', maxBuffer: 128 * 1024 * 1024}).trim();
export const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const hash = (path: string) => sha256(readFileSync(path));
export const load = (name: string) => JSON.parse(readFileSync(root + name, 'utf8'));
const unknown = (category: string, reason: string) => ({status: 'SOURCE_UNRESOLVED', category, reason});
const evidence = (page: number, region: string) => ({kind: 'LOCKED_CORE_RULEBOOK', path: root + 'c1c23-rulebook-evidence.json', page, region});
interface RegisterCard {
  cardIndex: number;
  physicalIdentity: string;
  cardId: number;
}

/** Every unresolved leaf is registered using a stable JSON path, never guessed away. */
export function unresolvedFields(value: unknown, path = ''): Array<{field: string; category: string; reason: string}> {
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  if (object.status === 'SOURCE_UNRESOLVED') return [{field: path, category: String(object.category), reason: String(object.reason)}];
  return Object.entries(object).flatMap(([key, child]) => unresolvedFields(child, path + '/' + key));
}

export function buildArtifacts() {
  const register: {cards: RegisterCard[]} = load('c1c22-hamlet-event-source-intake-register.json');
  const crops = load('c1c23-hamlet-event-crop-manifest.json');
  const rulebook = load('c1c23-rulebook-evidence.json');
  const frozenPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition').split(/\r?\n/).filter(p => /\/c1c(?:20|21|22)-/.test(p));
  const inputPaths = [root + 'c1c22-hamlet-event-source-intake-register.json', root + 'c1c23-hamlet-event-crop-manifest.json', root + 'c1c23-rulebook-evidence.json', 'scripts/audit/c1c23-printed-source.ts'];
  const meta = {schemaVersion: 1, phase: '11A.4-C1C-23', baselineHead, inputSha256: Object.fromEntries(inputPaths.map(p => [p, hash(p)]))};
  const definitions = register.cards.map((card: {cardIndex: number; physicalIdentity: string; cardId: number}) => {
    const printed = printedSources.find(s => s.cell === card.cardIndex)!;
    const crop = crops.crops.find((c: {physicalIdentity: string}) => c.physicalIdentity === card.physicalIdentity);
    return {
      definitionId: `ce-hamlet-event-${card.cardId}`, physicalIdentity: card.physicalIdentity, printedName: printed.name,
      printedPreparationDays: printed.days, flavorLiteral: printed.flavor, rulesLiteral: String(printed.rule),
      frontLiteral: `${printed.name}\n[PREPARATION_DAYS:${printed.days}]\n${printed.flavor}${printed.rule ? '\n' + printed.rule : ''}`,
      backLiteral: 'HAMLET EVENT', backSemanticRole: 'card-back-only', literalComplete: true,
      transcription: {method: 'Independent visual reading of each original 590x980 front crop and original back sheet', reader: 'Codex C1C23 intake', normalization: 'Line wraps joined; typographic apostrophes normalized. Bracket tokens preserve printed glyphs; flavor and rules remain separate. Empty rulesLiteral is intentional on Uneventful Week, not unreadable text.', runtimeAsEvidence: false},
      sourceReferences: ['front', 'back'].map(side => ({kind: 'LOCKED_TTS_CARD_CROP', side, physicalIdentity: card.physicalIdentity, cardId: card.cardId, manifestPath: root + 'c1c23-hamlet-event-crop-manifest.json', ...crop[side]})),
      assetHashes: {frontSheet: crop.front.sheetSha256, backSheet: crop.back.sheetSha256, frontCrop: crop.front.cropSha256, backCrop: crop.back.cropSha256},
    };
  });
  const contracts = definitions.map((d: {definitionId: string; physicalIdentity: string; printedName: string; rulesLiteral: string}, index: number) => {
    const card = register.cards[index];
    const s = printedSources.find(s => s.cell === card.cardIndex)! as unknown as Record<string, unknown>;
    const effects: Array<Record<string, unknown>> = (s.effects as Array<Record<string, unknown>>).map((e, i) => ({unitId: `${d.definitionId}:effect:${i + 1}`, ...e, source: {definitionId: d.definitionId, field: 'rulesLiteral', literal: d.rulesLiteral}}));
    return {
      definitionId: d.definitionId, physicalIdentity: d.physicalIdentity, printedName: d.printedName,
      activation: {trigger: 'HAMLET_EVENT_RESOLVE', source: evidence(32, 'The Hamlet; Draw a Hamlet Event Card'), excludesFirstQuest: {value: true, source: evidence(10, 'Setting up the Game')}},
      preparationDays: {printed: s.days, value: s.days === '?' ? {training: 0, otherwise: 3} : s.days, source: {definitionId: d.definitionId, field: 'printedPreparationDays'}, legend: evidence(33, 'Event card example caption')},
      target: {effectTargets: effects.map(e => e.target), selectionIsNotCurrentHero: true, scope: s.targetScope ?? 'As explicitly named in each printed effect; Hero references are to the current party, not Stagecoach roster.'},
      choices: s.choices ?? [{choiceRequired: false, choiceType: 'NONE', options: []}],
      costs: s.costs ?? [], effects,
      effectOrder: {value: 'Printed clause order; conditional branches and deferred triggers retained separately', source: {definitionId: d.definitionId, field: 'rulesLiteral'}},
      lifecycle: s.lifecycleOverride ?? {destination: 'SHUFFLE_BACK_INTO_EVENT_DECK', timing: 'after event instructions', source: evidence(32, 'Draw a Hamlet Event Card')},
      expiry: effects.length ? 'Per effect timing/duration; card return does not cancel registered delayed obligations.' : 'No additional printed rule; preparation days still apply.',
      sourceReferences: [{kind: 'PRINTED_DEFINITION', definitionId: d.definitionId}, evidence(32, 'Draw a Hamlet Event Card'),
        ...([5, 12].includes(card.cardIndex) ? [evidence(33, 'Building upgrades and Caretaker collision rule')] : []),
        ...([14, 15].includes(card.cardIndex) ? [evidence(34, 'The Guild; normal Skill upgrade is by one Level (Event costs remain separate)')] : []),
        ...([0, 2, 7].includes(card.cardIndex) ? [evidence(12, 'Provision Dice legend and pooling rules')] : []),
        ...([6, 9].includes(card.cardIndex) ? [evidence(21, 'Stress recovery legend')] : []),
      ],
    };
  });
  const deckLifecycle = {
    initialComposition: {physicalIds: definitions.map((d: {physicalIdentity: string}) => d.physicalIdentity), count: 16, basis: 'C1C22 locked TTS container; core components list p5 also says 16 Hamlet Events', source: evidence(5, 'Components list')},
    initialShuffle: {value: 'Hamlet Event Cards shuffled into one deck beside Hamlet board', sources: [evidence(10, 'Ready the Hamlet'), evidence(11, 'Ready the Hamlet continuation')]},
    all16SimultaneouslyUsed: unknown('EXPANSION_MEMBERSHIP_UNRESOLVED', 'Single 16-card TTS container and core count do not prove Complete Edition campaign configuration uses every card together.'),
    expansionFiltering: unknown('EXPANSION_MEMBERSHIP_UNRESOLVED', 'No card-by-card expansion/configuration rule bound from the locked source; no expansion membership inferred from artwork or filenames.'),
    drawTiming: {value: 'First Hamlet step after a Dungeon delve; not before the first Quest', sources: [evidence(32, 'The Hamlet'), evidence(10, 'First Quest setup')]},
    drawCount: {value: 1, source: evidence(32, 'Draw a Hamlet Event Card')},
    revealTiming: unknown('TRIGGER_TIMING_UNRESOLVED', 'Draw and follow instructions imply reading, but a separate reveal trigger/order is not defined; no synthetic reveal event contract.'),
    resolveTiming: {value: 'Follow instructions on draw; individual clauses can install this-week or next-Quest effects', source: evidence(32, 'Draw a Hamlet Event Card')},
    discardDestination: {value: 'Normally return to Event deck; explicitly permanent cards removed from campaign', sources: [evidence(32, 'Draw a Hamlet Event Card'), evidence(33, 'Permanent discard note')], overrideCards: ['Labor Force (decline branch unresolved)', 'Guild Training']},
    reshuffleCondition: {value: 'Shuffle drawn card back after following instructions, except permanent removal; not a generic discard-pile exhaustion reshuffle', source: evidence(32, 'Draw a Hamlet Event Card')},
    exhaustedDeckBehavior: unknown('DECK_LIFECYCLE_UNRESOLVED', 'No explicit exhausted-deck rule in bound source; no assumed reshuffle/recycle of permanently removed Events.'),
    duplicateUniqueCopies: {value: '16 unique card cells and physical objects; one each in locked TTS container', campaignCopyPolicy: unknown('DECK_LIFECYCLE_UNRESOLVED', 'TTS physical copies do not establish every campaign/expansion copy policy.')},
    campaignPersistence: {value: 'Permanent discard from campaign for printed exceptions', source: evidence(33, 'Permanent discard note'), eventStateAcrossSave: unknown('DECK_LIFECYCLE_UNRESOLVED', 'Rulebook p35 allows campaign saving but does not enumerate Event state in this extraction; exact saved membership/order and pending effects remain unbound.')},
    saveReplayRequirements: {kind: 'ENGINE_OBLIGATIONS_NOT_PRINTED_RULES', obligations: ['Event definition and source version', 'deck membership/order and permanent removals', 'draw/choice/die results', 'pending deferred effects and expiry', 'idempotent resolution and replay'], proofAvailable: false, source: evidence(35, 'Saving the Game; general persistence only')},
  };
  const sourceGaps = [
    ...unresolvedFields(deckLifecycle, '/deckLifecycle').map(g => ({gapId: 'deck:' + g.field, blockerKind: 'SOURCE', scope: 'DECK', ...g, physicalIds: definitions.map((d: {physicalIdentity: string}) => d.physicalIdentity)})),
    ...contracts.flatMap((c: {physicalIdentity: string; definitionId: string}) => unresolvedFields(c).map(g => ({gapId: c.definitionId + ':' + g.field, blockerKind: 'SOURCE', scope: 'CARD', physicalIds: [c.physicalIdentity], ...g}))),
  ];
  const commonPrimitives = ['EVENT_SOURCE_BOUND_CONSUMER', 'EVENT_DECK_LIFECYCLE', 'EVENT_PREPARATION_DAYS', 'EVENT_SAVE_REPLAY', 'EVENT_PRODUCTION_SELECTOR', 'EVENT_PRODUCTION_UI'];
  const capabilities = contracts.map((c: typeof contracts[number]) => {
    const localGaps = sourceGaps.filter(g => g.scope === 'CARD' && g.physicalIds.includes(c.physicalIdentity));
    const globalGaps = sourceGaps.filter(g => g.scope === 'DECK');
    const primitives = [...new Set([...commonPrimitives, ...(c.effects as Array<Record<string, unknown>>).map(e => 'EVENT_' + e.type), ...((c.choices as Array<{choiceRequired: boolean; choiceType: string}>).filter(ch => ch.choiceRequired).map(ch => 'EVENT_' + ch.choiceType))])].sort();
    return {
      definitionId: c.definitionId, physicalIdentity: c.physicalIdentity, printedName: c.printedName,
      literalComplete: true, semanticComplete: localGaps.length === 0, sourceGated: localGaps.length + globalGaps.length > 0,
      runtimeConsumerAvailable: false, adapterAvailable: false, saveReplayProof: false, selectorReachable: false, productionProof: false, productionUiProof: false, productionReady: false,
      requiredPrimitives: primitives, missingPrimitives: primitives,
      sourceGates: [...globalGaps, ...localGaps].map(g => g.gapId),
      runtimeBlockers: ['ENGINE_BINDING_MISSING:source-bound Event consumer/deck contract', 'ENGINE_BINDING_MISSING:formal Event adapters and production selectors'],
      proofBlockers: ['PRODUCTION_PROOF_MISSING:Event save/replay', 'PRODUCTION_PROOF_MISSING:Event runtime and UI evidence'],
    };
  });
  const roi = buildRoi(capabilities);
  const decision = decide(roi);
  const runtimeGaps = capabilities.flatMap((c: typeof capabilities[number]) => [
    {gapId: c.definitionId + ':engine', blockerKind: 'RUNTIME', category: 'ENGINE_BINDING_MISSING', physicalIds: [c.physicalIdentity], requiredPrimitives: c.missingPrimitives},
    {gapId: c.definitionId + ':proof', blockerKind: 'PROOF', category: 'PRODUCTION_PROOF_MISSING', physicalIds: [c.physicalIdentity], obligations: c.proofBlockers},
  ]);
  return {
    'c1c23-hamlet-event-source-manifest.json': {...meta, authority: 'Only C1C22 locked TTS URLs/cells and unchanged C1A S4 core rulebook', assets: crops.assets, crops: root + 'c1c23-hamlet-event-crop-manifest.json', rulebook: {path: rulebook.source, sha256: rulebook.sourceSha256, evidencePath: root + 'c1c23-rulebook-evidence.json'}, frozenInputSha256: Object.fromEntries(frozenPaths.map(p => [p, hash(p)])), glyphNotation: {PROVISION_DIE: 'Tool/DD die; p12', LIGHT: 'flame light tracker; p12', STRESS: 'black stress pictogram; p21', HEART: 'red heart health pictogram', GREEN_PLUS: 'green recovery/Heal notation', GOLD: 'coin pictogram; p33 prices', D10: 'ten-sided die', FOUR_YELLOW_HELMETS: 'Literal glyph count preserved; target binding unresolved'}, excludedEvidence: ['src/data/hamlet-events.ts (3 mock events)', 'prototype Boss/Event data', 'runtime behavior as printed authority']},
    'c1c23-hamlet-event-printed-definitions.json': {...meta, cards: definitions},
    'c1c23-hamlet-event-semantic-contracts.json': {...meta, cards: contracts, deckLifecycle},
    'c1c23-hamlet-event-source-gap-register.json': {...meta, sourceGaps, runtimeGaps},
    'c1c23-hamlet-event-runtime-capability-matrix.json': {...meta, runtimeEvidence: {evidenceRole: 'Negative consumer audit only; never printed evidence', files: Object.fromEntries(['src/data/hamlet-events.ts', 'src/game-engine/hamlet.ts', 'src/components/hamlet/HamletEventCard.tsx'].map(p => [p, hash(p)])), finding: 'HAMLET_EVENTS contains 3 mock definitions. startHamletPhase picks that list; no ce-hamlet-event-* source IDs or formal Event deck/choice consumer. Generic healing/quirk/progression utilities alone are not Event adapters.'}, cards: capabilities, counts: {total: 16, literalComplete: 16, semanticComplete: capabilities.filter(c => c.semanticComplete).length, sourceGated: capabilities.filter(c => c.sourceGated).length, runtimeBlocked: 16, productionReady: 0}},
    'c1c23-hamlet-event-runtime-roi-matrix.json': {...meta, ...roi},
    'c1c23-next-workstream-decision.json': {...meta, ...decision},
  };
}

type Capability = {definitionId: string; physicalIdentity: string; printedName: string; semanticComplete: boolean; sourceGated: boolean; requiredPrimitives: string[]; sourceGates: string[]; proofBlockers: string[]};
export function buildRoi(cards: Capability[]) {
  const familySpecs = [
    {family: 'HAMLET_EVENT_PREPARATION_ONLY', names: ['Uneventful Week']},
    {family: 'HAMLET_EVENT_SIMPLE_NEXT_QUEST', names: ['Lost Shipment', 'Unsettling Darkness', 'Supply Run']},
    {family: 'HAMLET_EVENT_DAILY_CARETAKER', names: ['Busy Week', 'General Repairs']},
    {family: 'HAMLET_EVENT_SELECTION_AND_RECOVERY', names: ['The Feast', 'Medical Breakthrough', 'Caregivers Convention', 'Town Fair']},
    {family: 'HAMLET_EVENT_TRAINING_AND_REMOVAL', names: ['Labor Force', 'Guild Training', 'Militia Training']},
    {family: 'HAMLET_EVENT_ROLL_AND_TRANSACTION', names: ['In Good Spirits', 'Traveling Merchants', 'Gypsy Trail']},
  ];
  const families = familySpecs.map(spec => {
    const candidates = cards.filter(c => spec.names.includes(c.printedName));
    const bundle = [...new Set(candidates.flatMap(c => c.requiredPrimitives))].sort();
    const qualifies = (c: Capability) => c.semanticComplete && !c.sourceGated && c.sourceGates.length === 0 && c.requiredPrimitives.every(p => bundle.includes(p));
    return {family: spec.family, candidateDefinitionIds: candidates.map(c => c.definitionId), implementationBundle: bundle,
      assumedProofClosure: ['Complete Event save/replay, production runtime and UI proof required; none supplied in C1C23'],
      promotionChecks: candidates.map(c => ({definitionId: c.definitionId, physicalIdentity: c.physicalIdentity, semanticComplete: c.semanticComplete, remainingSourceGates: c.sourceGates, remainingPrimitivesAfterBundle: c.requiredPrimitives.filter(p => !bundle.includes(p)), proofObligations: c.proofBlockers, qualifiesForWholeEventPromotion: qualifies(c)})),
      expectedReadyDefinitionIds: candidates.filter(qualifies).map(c => c.definitionId),
      expectedReadyGain: candidates.filter(qualifies).length,
      immediateReadyGain: 0,
    };
  });
  return {promotionBasis: 'WHOLE_EVENT_PROMOTION', sourceClosureAssumed: false, proofClosureIsRequired: true, primitiveHitCountIsNotReadyGain: true, families};
}
export function decide(roi: ReturnType<typeof buildRoi>) {
  const eligible = roi.families.filter(f => f.expectedReadyGain > 0).sort((a, b) => b.expectedReadyGain - a.expectedReadyGain || a.family.localeCompare(b.family));
  if (eligible.length) return {outcome: 'EVENT_RUNTIME_IMPLEMENTATION_SELECTED', selectedFamily: eligible[0].family, candidateDefinitionIds: eligible[0].expectedReadyDefinitionIds, expectedReadyGain: eligible[0].expectedReadyGain, nextWorkstream: 'C1C24 source-exact bounded Event family with complete proof obligations'};
  return {outcome: 'NO_IMMEDIATE_SOURCE_SAFE_CANDIDATE', selectedFamily: null, candidateDefinitionIds: [], expectedReadyGain: 0, nextWorkstream: 'C1C24 Boss source intake: Threat / Battle / Ability subtype classification', reason: 'All Event families retain deck-level source gates; some also have card-specific semantic gaps. Runtime-only changes cannot close those gates. No complete Event Ready gain is demonstrated.'};
}

export async function verifyAssets(m = load('c1c23-hamlet-event-crop-manifest.json')) {
  const r = load('c1c22-hamlet-event-source-intake-register.json');
  if (m.assets.length !== 2 || m.crops.length !== 16 || r.cards.length !== 16) throw new Error('Exact 16-card/2-sheet census');
  const paths = new Set<string>();
  for (const asset of m.assets) {
    const receipt = JSON.parse(readFileSync(asset.path + '.receipt.json', 'utf8'));
    const meta = await sharp(asset.path).metadata();
    if (hash(asset.path) !== asset.sha256 || receipt.sha256 !== asset.sha256 || receipt.sourceUrl !== asset.sourceUrl || receipt.acquiredAt !== asset.acquiredAt || receipt.mimeType !== asset.mimeType || !Number.isFinite(Date.parse(asset.acquiredAt)) || meta.width !== asset.width || meta.height !== asset.height || meta.format !== asset.format || readFileSync(asset.path).length !== asset.byteLength || !asset.mimeType.startsWith('image/') || asset.gridWidth !== 5 || asset.gridHeight !== 5) throw new Error('Original sheet/receipt metadata drift');
    if (readFileSync(asset.path.replace('.jpg', '.sha256'), 'utf8') !== `${asset.sha256}  hamlet-event-${asset.side}.jpg\n`) throw new Error('SHA sidecar drift');
    if (!r.cards.every((c: Record<string, unknown>) => c[asset.side === 'front' ? 'faceUrl' : 'backUrl'] === asset.sourceUrl)) throw new Error('Not locked source URL');
  }
  for (const card of r.cards) {
    const pairs = m.crops.filter((c: Record<string, unknown>) => c.physicalIdentity === card.physicalIdentity);
    if (pairs.length !== 1) throw new Error('Unique physical crop binding');
    const pair = pairs[0];
    for (const key of ['cardId', 'deckId', 'cardIndex', 'sourceObjectGuid', 'ttsPath', 'uniqueBack']) if (pair[key] !== card[key]) throw new Error('Physical identity drift');
    if (Math.floor(card.cardId / 100) !== card.deckId || card.cardId % 100 !== card.cardIndex || pair.grid.width !== card.numWidth || pair.grid.height !== card.numHeight || pair.grid.cell !== card.cardIndex) throw new Error('Card/cell arithmetic drift');
    for (const side of ['front', 'back']) {
      const crop = pair[side], asset = m.assets.find((a: {side: string}) => a.side === side);
      const col = card.cardIndex % card.numWidth, row = Math.floor(card.cardIndex / card.numWidth);
      const left = Math.floor(col * asset.width / card.numWidth), top = Math.floor(row * asset.height / card.numHeight);
      const bounds = {left, top, width: Math.floor((col + 1) * asset.width / card.numWidth) - left, height: Math.floor((row + 1) * asset.height / card.numHeight) - top};
      if (JSON.stringify(crop.bounds) !== JSON.stringify(bounds) || crop.sheetSha256 !== asset.sha256 || crop.sheetPath !== asset.path || paths.has(crop.path)) throw new Error('Exact unique sheet/cell crop');
      paths.add(crop.path);
      const regenerated = await sharp(asset.path).extract(bounds).png().toBuffer();
      if (sha256(regenerated) !== crop.cropSha256 || hash(crop.path) !== crop.cropSha256) throw new Error('Crop bytes are not reproducible from bound cell');
    }
  }
  const rb = load('c1c23-rulebook-evidence.json');
  if (hash(rb.source) !== rb.sourceSha256 || rb.sourceSha256 !== load('c1a-rulebook-evidence.json').sha256) throw new Error('Frozen S4 rulebook drift');
}

export function report() {
  const a = buildArtifacts();
  const counts = a['c1c23-hamlet-event-runtime-capability-matrix.json'].counts;
  const caps = a['c1c23-hamlet-event-runtime-capability-matrix.json'].cards;
  return `# C1C23 Hamlet Event Printed-Definition Intake\n\nVerdict: C1C23-HAMLET-EVENT-SOURCE-INTAKE-ACCEPTED\n\nNext: NEXT-NO-IMMEDIATE-SOURCE-SAFE-CANDIDATE\n\nThis is source extraction, semantic normalization and capability auditing. No gameplay, UI, draw logic or save/replay implementation changed. Baseline: ${baselineHead} (C1C22).\n\n## A. Physical source binding\n\nAll 16 C1C22 physical identities have exact front and back source bindings. Two original 2950 x 4900 JPEG sheets, acquisition receipts, MIME/byte metadata and SHA-256 sidecars are retained under source-assets/c1c23. Each of the 16 front/back crop pairs is 590 x 980 and regenerates from its original 5 x 5 cell. uniqueBack=true is honored: each back uses its own cell, even though the printed back label is uniformly HAMLET EVENT with no gameplay semantics. No nickname, mock Event or runtime rule is source evidence.\n\nAll 16 original front crops were independently read in cell order; rules and flavor were transcribed. Bracketed tokens denote original pictograms, not supplied words. The source manifest records the token convention; unresolved glyph scope is retained for Town Fair. Back art was inspected on the original sheet. Visual transcription remains a human-reviewable extraction, not a claim that hashes alone prove text recognition.\n\n## B. Capability counts\n\n| Total | literalComplete | semanticComplete (card-local) | sourceGated (including deck) | runtimeBlocked | productionReady |\n|---:|---:|---:|---:|---:|---:|\n| ${counts.total} | ${counts.literalComplete} | ${counts.semanticComplete} | ${counts.sourceGated} | ${counts.runtimeBlocked} | ${counts.productionReady} |\n\nsemanticComplete measures unresolved card-local contract leaves; it excludes unresolved shared deck lifecycle. sourceGated includes both. Therefore a clear single-card contract is not a complete production contract. Costs, optional choices, selected Heroes, delayed triggers and permanent removal are separated.\n\n| Card | Card-local semantics complete | Source gates |\n|---|---|---:|\n${caps.map(c => `| ${c.printedName} | ${c.semanticComplete} | ${c.sourceGates.length} |`).join('\n')}\n\nSpecific gaps include Supply Run's gains-versus-roll ordering; Town Fair's four-helmet target glyph; Labor Force removal on decline; Traveling Merchants' dice attribution after pooling; Gypsy Trail duration; optional-choice reversal after commitment; Medical Breakthrough with no eligible disease; In Good Spirits with existing Virtue/Affliction; and Militia Training mixed participation and unspecified upgrade costs. These are source gaps, not engine deficiencies. Clear effects without Event adapters are separately ENGINE_BINDING_MISSING.\n\n## C. Deck lifecycle\n\nNot fully determined. The unchanged, previously locked C1A S4 core PDF supplies core setup (p10-11), 16 component count (p5), one Event as the first Hamlet step and following instructions then shuffling back (p32), preparation-day legend and permanent campaign discard exceptions (p33), and general saving (p35). The glyph/related-rule pages are also extracted with the original PDF hash. Core rules do not prove Complete Edition expansion membership or simultaneous use of every cell. Separate reveal timing, exhausted-deck behavior, campaign copy policy and exact Event save-state fields remain SOURCE_UNRESOLVED. No default discard-pile reshuffle was inserted. Labor Force and Guild Training have explicit permanent-removal clauses; Labor Force's declined branch remains open.\n\n## D/E. Runtime family and whole-Event ROI\n\nNo immediate source-safe Event runtime family is selected. All six audited family bundles yield 0 complete Event Ready gain while deck source gates remain. Even Uneventful Week requires a formal source-bound consumer, preparation-day integration, deck lifecycle, selector, UI and save/replay proof. Existing 3 mock Hamlet Events are not the formal 16-card consumer; generic healing, progression or Quirk helpers do not establish Event adapters. The matrix lists every candidate, full primitive bundle, remaining source gates and required proof. Primitive frequency is never counted as Ready gain, and no hypothetical source closure is assumed.\n\n## F. Next workstream\n\nC1C24: Boss source intake with Threat / Battle / Ability subtype classification, as allowed by the C1C23 decision rule. Event runtime remains gated until the enumerated deck/card ambiguities have authoritative closure.\n\n## Verification and regression boundary\n\nRun import:complete-edition-c1c23 to reproduce crops, audit:complete-edition-c1c23 to regenerate data/report, and verify:complete-edition-c1c23 for byte-level crop provenance, generated-artifact consistency, decision rebuilding and adversarial audit tests. extract-c1c23-rulebook.py --verify independently re-extracts the locked PDF. The verifier preserves baseline gameplay and every C1C20/C1C21/C1C22 tracked artifact; Core Trinket 15/37, Standard Quest 3/75, Boss/Encounter inventory, Act IV and prior source gates/hashes remain frozen.\n\nC1C21 full verification remains historically unaccepted: C1C13/12/11 reload retry exhaustion and C1C3 selector click timeout are not fixed or cleared here. No entire Complete Edition E2E pass is claimed. C1C23 validation is recorded separately in the validation report.\n`;
}
export function generate() {
  for (const [name, value] of Object.entries(buildArtifacts())) writeFileSync(root + name, JSON.stringify(value, null, 2) + '\n');
  writeFileSync('docs/reports/complete-edition/c1c23-hamlet-event-source-intake-report.md', report());
  console.log('C1C23 generated: 16 source-bound Events; runtime Ready 0; no immediate safe candidate.');
}
