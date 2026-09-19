import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CATEGORIES, scanTts, sha256, validateInventory, type Category, type CategoryOverride } from './complete-edition-inventory-core';
import { HEROES } from '../../src/data/heroes';
import { SKILLS } from '../../src/data/skills';
import { QUESTS, STANDARD_QUESTS } from '../../src/data/quests';
import { MONSTERS } from '../../src/data/monsters';
import { MONSTER_SKILLS } from '../../src/data/monster-skills';
import { ALL_QUIRKS } from '../../src/data/quirks';
import { ALL_DISEASES } from '../../src/data/diseases';
import { VIRTUES } from '../../src/data/virtues';
import { AFFLICTIONS } from '../../src/data/afflictions';
import { CURIOS } from '../../src/data/curios';
import { HAMLET_BUILDINGS } from '../../src/data/hamlet-buildings';
import { HAMLET_EVENTS } from '../../src/data/hamlet-events';
import { officialTrinketPool, prototypeTrinketPool } from '../../src/data/trinkets/trinket-registry';
import { NORMALIZED_CORPUS } from '../../src/data/darkest-dungeon/community-reference/normalized';
import { COMMUNITY_DATASET } from '../../src/data/darkest-dungeon/community-reference/data';
import { COMMUNITY_RUNTIME_QUESTS, COMMUNITY_RUNTIME_MONSTER_COMPOSITION, COMMUNITY_RUNTIME_GUARDIAN_ACTORS, COMMUNITY_RUNTIME_FINAL_FORMS, COMMUNITY_RUNTIME_LAYOUTS, COMMUNITY_RUNTIME_BLOCKERS } from '../../src/data/darkest-dungeon/community-reference/runtime-profile';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const sourcePath = arg('--tts') ?? process.env.COMPLETE_EDITION_TTS;
if (!sourcePath) throw new Error('Provide --tts <3657612854.json> or COMPLETE_EDITION_TTS. Source is intentionally not vendored.');
const verify = process.argv.includes('--verify');
const root = resolve('.');
const baseHead = '3fcbde52e3d164cb753b2a801aa4b2488276a281';
const dataDir = 'docs/data/complete-edition';
const prefix = 'docs/data/darkest-dungeon/community-reference/';
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const sourceBytes = readFileSync(sourcePath);
const sourceSha256 = sha256(sourceBytes);
const source = JSON.parse(sourceBytes.toString('utf8'));
const manifest = readJson(`${prefix}community-visual-asset-manifest.json`);
if (manifest.inputs.find((x: any) => x.role === 'tts-save')?.sha256 !== sourceSha256) throw new Error('TTS source differs from accepted intake; review source version before regenerating.');

// Supplemental sources are inventory provenance, never gameplay constants.
const sourceInputs = [{ name: basename(sourcePath), sha256: sourceSha256, role: 'S1-primary' }];
for (const [name, role] of [['Phase11A3_CompleteEdition_Source_Intake_Package.json', 'S2-intake'], ['Phase11A3_CompleteEdition_Source_Extraction_Audit_Report.md', 'S3-extraction-audit'], ['DD_EN_COREBOX_RULES.pdf', 'S4-rulebook']]) {
  const file = join(arg('--source-dir') ?? dirname(sourcePath), name);
  if (!existsSync(file)) throw new Error(`Missing ${role}: ${file}. Supply --source-dir.`);
  sourceInputs.push({ name, role, sha256: sha256(readFileSync(file)) });
}
if (sourceInputs[1].sha256 !== NORMALIZED_CORPUS.sourcePackageSha256) throw new Error('Intake package hash mismatch');

const requirements = NORMALIZED_CORPUS.requirements;
// A 3D model in a requirement is still a model, not an additional physical card.
const requirementCategory = (r: typeof requirements[number]): Category => r.componentType === 'dungeon-tile' ? 'Dungeon Tiles' : r.componentType === 'room-card' ? 'Room Cards' : r.componentGroup === 'quest' ? 'DD Quests' : r.componentGroup === 'monster-deck' ? 'DD Monsters' : r.componentGroup === 'final-encounter' ? 'Final Encounter Cards' : 'Guardian Cards';
const visualClassificationPath = `${dataDir}/complete-edition-visual-classification.json`;
const visualClassification = readJson(visualClassificationPath);
if (visualClassification.sourceSha256 !== sourceSha256) throw new Error('Visual observations belong to a different source');
const overrides: Record<string, CategoryOverride> = {};
for (const observation of visualClassification.observations) {
  const original = observation.path.split('/').filter(Boolean).reduce((v: any, key: string) => v?.[key], source);
  if (original?.GUID !== observation.guid || original?.CustomImage?.ImageURL !== observation.url) throw new Error(`Visual observation source mismatch: ${observation.path}`);
  overrides[observation.path] = { category: observation.category, classification: observation.classification, reason: observation.reason };
}
const inventory = scanTts(source, overrides);
// Semantic identities are sourced from containers / independent intake, never runtime constants.
const sourceComposition = requirements.find(r => r.componentGroup === 'monster-deck')!.fields.deckComposition.value as { composition: Array<{ sourceLocalMonsterDefinitionId: string; members: Array<{ guid: string; cardId: number }> }> };
for (const row of inventory.objects) {
  const hero = row.containerHierarchy.find((p, i, all) => i > 0 && all[i - 1].nickname === 'The Darkest Heroes');
  if (row.runtimeCategory === 'Heroes' && hero) {
    row.logicalIdentity = `source-hero:${hero.nickname}`;
    row.logicalIdentityBasis = 'Named hero container; alternative mats belong to one class. Stats remain source-blocked.';
  }
  if (row.runtimeCategory === 'Hero Skills' && hero) {
    row.logicalIdentity = `source-hero-skill:${row.stateOwnerPath ?? row.ttsPath}`;
    row.logicalIdentityBasis = 'Source skill object and its upgrade states form one logical skill family; per-form values remain source-blocked.';
  }
  if (row.runtimeCategory === 'DD Monsters') {
    const definition = sourceComposition.composition.find(d => d.members.some(m => m.guid === row.sourceObjectGuid && m.cardId === row.cardId));
    if (definition) {
      row.logicalIdentity = `source-dd-monster:${definition.sourceLocalMonsterDefinitionId}`;
      row.logicalIdentityBasis = 'Independent normalized source deckComposition membership (GUID + CardID + DD container); not runtime self-proof.';
    }
  }
}
// Requirement.assets also lists supporting references (quest cards, models and tiles).
// Never reclassify a source object just because a later requirement cites it.
for (const row of inventory.objects) {
  const matching = requirements.filter(r => requirementCategory(r) === row.runtimeCategory && r.assets.some(a => `/${a.ttsPath.replace(/^\//, '')}` === row.ttsPath));
  if (matching.length && row.isCard) {
    row.definitionStatus = matching.every(r => r.status === 'confirmed') ? 'existing-normalized-source' : 'existing-normalized-partial';
    row.sourceBlockers = row.sourceBlockers.filter(b => b !== 'printed-definition-not-bound');
    if (row.definitionStatus === 'existing-normalized-partial') row.sourceBlockers.push('existing-intake-partial; inspect field evidence and runtime blockers');
    if (row.sourceBlockers.length === 0) row.classification = row.duplicateOf ? 'duplicate-physical-copy' : 'runtime-content';
    row.classificationReason += ` Existing intake references: ${matching.map(r => r.requirementId).join(', ')}.`;
  }
}
const errors = validateInventory(inventory);
const rows = inventory.objects;
// Independent raw traversal guards against a scanner accidentally skipping a subtree.
const discoveredPaths: string[] = [];
function discover(v: any, path: string) {
  if (!v || typeof v !== 'object') return;
  if (!Array.isArray(v) && 'GUID' in v && 'Transform' in v) discoveredPaths.push(path);
  for (const [key, child] of Object.entries(v)) discover(child, `${path}/${key}`);
}
discover(source, '');
if (JSON.stringify([...discoveredPaths].sort()) !== JSON.stringify(rows.map(r => r.ttsPath).sort())) errors.push('raw source discovery / classified path conservation failed');
const unique = <T>(values: T[]) => [...new Set(values)];

// Explicit source-scoped hero grouping. No stats are copied from the prototype.
const heroContainers = rows.filter(r => r.containerHierarchy.some(p => p.nickname === 'The Darkest Heroes') && /Bag/.test(r.objectType));
const heroGroups = heroContainers.map(h => {
  const cards = rows.filter(r => r.isCard && r.containerHierarchy.some(p => p.ttsPath === h.ttsPath));
  return { name: h.nickname, sourceGuid: h.sourceObjectGuid, ttsPath: h.ttsPath, heroCards: cards.filter(c => c.runtimeCategory === 'Heroes' && !c.isState).length, levelCards: cards.filter(c => c.runtimeCategory === 'Hero Level / Upgrade Cards' && !c.isState).length, skillPhysical: cards.filter(c => c.runtimeCategory === 'Hero Skills' && !c.isState).length, skillForms: cards.filter(c => c.runtimeCategory === 'Hero Skills').length, normalizedHeroSkills: 0, productionSourceBackedHeroSkills: 0, blocker: 'printed stats, per-level skills and effects not extracted or bound' };
});

const legacy: Array<{ category: Category; definitions: { id: string }[]; authority: string; sourceFile: string; consumer: string }> = [
  { category: 'Heroes', definitions: HEROES, authority: 'prototype; last four explicitly placeholder', sourceFile: 'src/data/heroes.ts', consumer: 'src/pages/CampaignSetupPage.tsx' },
  { category: 'Hero Skills', definitions: SKILLS, authority: 'prototype; no Complete Edition leaf binding', sourceFile: 'src/data/skills.ts', consumer: 'src/pages/BattlePage.tsx' },
  { category: 'Standard Quests', definitions: STANDARD_QUESTS, authority: 'prototype', sourceFile: 'src/data/quests.ts', consumer: 'src/pages/QuestSelectPage.tsx' },
  { category: 'Boss Quests', definitions: QUESTS.filter(q => !STANDARD_QUESTS.includes(q)), authority: 'prototype', sourceFile: 'src/data/quests.ts', consumer: 'src/pages/QuestSelectPage.tsx' },
  { category: 'Monsters', definitions: MONSTERS, authority: 'prototype simplified', sourceFile: 'src/data/monsters.ts', consumer: 'src/data/battle-encounters.ts' },
  { category: 'Monster Ability Cards', definitions: MONSTER_SKILLS, authority: 'prototype skill definitions, not physical cards', sourceFile: 'src/data/monster-skills.ts', consumer: 'src/pages/BattlePage.tsx' },
  { category: 'Quirks', definitions: ALL_QUIRKS, authority: 'prototype simplified', sourceFile: 'src/data/quirks.ts', consumer: 'src/game-engine/quirks.ts' },
  { category: 'Diseases', definitions: ALL_DISEASES, authority: 'rulebook backed; TTS face/effect equality not yet audited', sourceFile: 'src/data/diseases.ts', consumer: 'src/game-engine/diseases/acquire-disease.ts' },
  { category: 'Virtues', definitions: VIRTUES, authority: 'existing rules; TTS binding unverified', sourceFile: 'src/data/virtues.ts', consumer: 'src/game-engine' },
  { category: 'Afflictions', definitions: AFFLICTIONS, authority: 'existing rules; TTS binding unverified', sourceFile: 'src/data/afflictions.ts', consumer: 'src/game-engine' },
  { category: 'Curios', definitions: CURIOS, authority: 'existing simplified pool; TTS binding unverified', sourceFile: 'src/data/curios.ts', consumer: 'src/game-engine/diseases/curio.ts' },
  { category: 'Hamlet', definitions: HAMLET_BUILDINGS, authority: 'simplified building definitions', sourceFile: 'src/data/hamlet-buildings.ts', consumer: 'src/pages/HamletPage.tsx' },
  { category: 'Encounter / Event Content', definitions: HAMLET_EVENTS, authority: 'mock Hamlet events', sourceFile: 'src/data/hamlet-events.ts', consumer: 'src/game-engine/hamlet.ts' },
  { category: 'Trinkets', definitions: officialTrinketPool(), authority: 'formal verified pool; not a Community registry', sourceFile: 'src/data/trinkets/verified-trinkets.ts', consumer: 'src/game-engine/trinkets/draw-trinket.ts' },
];
const baseline = legacy.map(({ definitions, ...meta }) => ({ ...meta, registry: definitions.length, definitionIds: definitions.map(d => d.id) }));
const codeFiles: string[] = [];
function files(dir: string) { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) files(p); else if (/\.(tsx?|json)$/.test(e.name) && !e.name.startsWith('.tmp')) codeFiles.push(p); } }
files('src'); files('scripts/audit');
const consumerEdges = codeFiles.filter(f => !/\.test\.|src\/audit|scripts\/audit|src\/data\//.test(f)).flatMap(file => readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line, index) => /(?:from .*data\/(?:heroes|quests|monsters|skills|quirks|diseases|virtues|afflictions|curios|hamlet|trinkets)|COMMUNITY_RUNTIME_|getDarkestDungeonQuestPool|officialTrinketPool|prototypeTrinketPool)/.test(line) ? [{ file, line: index + 1, text: line.trim() }] : []));

const communityRegistry: Partial<Record<Category, { ids: string[]; productionIds: string[]; uiIds: string[]; evidence: string[] }>> = {};
function register(category: Category, items: { id: string }[], production: { id: string }[], ui: { id: string }[], evidence: string[]) {
  communityRegistry[category] = { ids: items.map(x => x.id), productionIds: production.map(x => x.id), uiIds: ui.map(x => x.id), evidence };
}
register('DD Quests', COMMUNITY_RUNTIME_QUESTS, COMMUNITY_RUNTIME_QUESTS, COMMUNITY_RUNTIME_QUESTS, ['src/data/darkest-dungeon/quest-registry.ts', 'src/game-engine/campaign/act-four/draw-quest.ts']);
register('DD Monsters', COMMUNITY_RUNTIME_MONSTER_COMPOSITION, COMMUNITY_RUNTIME_MONSTER_COMPOSITION, COMMUNITY_RUNTIME_MONSTER_COMPOSITION, ['src/game-engine/campaign/act-four/community-physical-monster-deck.ts', 'src/game-engine/campaign/act-four/community-final-combat.ts']);
register('Guardian Cards', COMMUNITY_RUNTIME_GUARDIAN_ACTORS, COMMUNITY_RUNTIME_GUARDIAN_ACTORS, COMMUNITY_RUNTIME_GUARDIAN_ACTORS, ['src/data/darkest-dungeon/community-reference/production-adapters.ts', 'docs/reports/phase-11a4r1/phase-11a4r1a-community-guardian-room-acceptance-report.md']);
register('Final Encounter Cards', COMMUNITY_DATASET.finalEncounter.filter(r => ['battle-card', 'special-card'].includes(requirements.find(x => x.requirementId === r.requirementId)!.componentType)), COMMUNITY_RUNTIME_FINAL_FORMS, COMMUNITY_RUNTIME_FINAL_FORMS, ['src/data/darkest-dungeon/community-reference/runtime-profile.ts', 'docs/reports/phase-11a4r2a/phase-11a4r2a-community-final-runtime-acceptance-report.md']);
register('Room Cards', COMMUNITY_DATASET.rooms, COMMUNITY_DATASET.rooms, COMMUNITY_DATASET.rooms, ['src/data/darkest-dungeon/room-registry.ts', 'src/data/darkest-dungeon/community-reference/production-adapters.ts']);
register('Dungeon Tiles', COMMUNITY_RUNTIME_LAYOUTS, COMMUNITY_RUNTIME_LAYOUTS, COMMUNITY_RUNTIME_LAYOUTS, ['src/data/darkest-dungeon/layout-registry.ts']);

const categories = CATEGORIES.map(category => {
  const objects = rows.filter(r => r.runtimeCategory === category);
  const cards = objects.filter(r => r.isCard);
  const definitions = requirements.filter(r => requirementCategory(r) === category);
  const registry = communityRegistry[category];
  const extracted = definitions.length;
  return { category, sourceObjects: objects.length, sourcePhysical: objects.reduce((s, r) => s + r.physicalCount, 0), sourceCardPhysical: cards.reduce((s, r) => s + r.physicalCount, 0), sourceStates: objects.filter(r => r.isState).length, sourceInfiniteTemplates: objects.filter(r => r.isInfiniteTemplate).length, sourceLogicalVisual: unique(cards.map(r => r.visualIdentity).filter(Boolean)).length,
    extracted, normalized: category === 'DD Monsters' ? COMMUNITY_RUNTIME_MONSTER_COMPOSITION.length : definitions.length,
    registry: registry?.ids.length ?? 0, production: registry?.productionIds.length ?? 0, ui: registry?.uiIds.length ?? 0,
    sourceBlockedObjects: objects.filter(r => r.sourceBlockers.length > 0).length,
    sourceBlockedVisualIdentities: unique(cards.filter(r => r.sourceBlockers.length > 0).map(r => r.visualIdentity)).length,
    sourceLogical: unique(cards.map(r => r.logicalIdentity).filter(Boolean)).length,
    existingRegistry: baseline.filter(b => b.category === category).reduce((s, b) => s + b.registry, 0),
    normalizedRequirementIds: definitions.map(r => r.requirementId),
    sourceSemanticStatus: ['Threat Cards', 'Monster Battle Cards', 'Monster Ability Cards', 'Traps', 'Rubble', 'Hunger', 'Provisions', 'Loot / Rewards'].includes(category) ? 'subtype/embedded-rule count source-blocked; zero identified is not confirmed absence' : objects.some(r => r.sourceBlockers.length) ? 'partially identified; semantic source blockers retained' : 'structurally identified; see existing runtime blockers',
    notes: category === 'Monsters' ? 'Battle cards include embedded skills and multiple levels. Family/skill semantic total remains source-blocked until transcription; no standalone skill-card count inferred.' : category === 'Heroes' ? `${heroGroups.length} named hero classes; physical/visual counts are mats; sourceLogical counts named classes.` : category === 'Dungeon Tiles' ? 'Normalized requirements are tile/geometry packages; registry counts generated layouts. Units differ; do not subtract.' : category === 'Other' ? 'Includes containers, tokens, models, references and explicit source-blocked unnamed objects.' : 'Source Logical counts scoped visual identities, including alternate states; semantic definitions may merge/split these. Never subtract cross-unit counts.',
  };
});

const groupByContainer = new Map<string, typeof rows>();
for (const row of rows.filter(r => r.isCard)) {
  const name = row.containerHierarchy.map(p => p.nickname).filter(Boolean).join(' > ') || '(unlabelled table/deck)';
  groupByContainer.set(name, [...(groupByContainer.get(name) ?? []), row]);
}
const containerCounts = [...groupByContainer.entries()].map(([container, list]) => ({ container, physical: list.reduce((s, r) => s + r.physicalCount, 0), stateRecords: list.filter(r => r.isState).length, visualIdentities: unique(list.map(r => r.visualIdentity)).length }));
const duplicateGuids = unique(rows.map(r => r.sourceObjectGuid)).flatMap(guid => { const matches = rows.filter(r => r.sourceObjectGuid === guid); return matches.length > 1 ? [{ guid, paths: matches.map(r => r.ttsPath) }] : []; });
const deckIdReuse = unique(inventory.customDeckDeclarations.map(d => d.customDeckId)).flatMap(id => { const declarations = inventory.customDeckDeclarations.filter(d => d.customDeckId === id); const variants = unique(declarations.map(d => sha256(JSON.stringify(d.definition)))); return variants.length > 1 ? [{ id, definitions: variants.length }] : []; });
const assetChecks = manifest.assets.filter((a: any) => a.status === 'ready').map((a: any) => ({ assetId: a.assetId, path: a.localPath, expectedSha256: a.localSha256, actualSha256: existsSync(a.localPath) ? sha256(readFileSync(a.localPath)) : null }));
for (const asset of assetChecks) if (asset.expectedSha256 !== asset.actualSha256) errors.push(`asset SHA mismatch: ${asset.path}`);
for (const r of requirements) for (const a of r.assets) if (!rows.some(o => o.ttsPath === `/${a.ttsPath.replace(/^\//, '')}` && o.sourceObjectGuid === a.guid)) errors.push(`unknown source path/GUID: ${r.requirementId} ${a.ttsPath}`);

// Commit-independent freshness: source and implementation hashes survive an audit-only commit.
const dependencyPaths = unique([...codeFiles, 'package.json', visualClassificationPath, ...['antha-complete-edition/normalized-requirements.json', 'antha-complete-edition/source-reference-index.json', 'antha-complete-edition/source-binding-manifest.json', 'community-visual-asset-manifest.json'].map(f => prefix + f)]).sort();
const dependencyHashes = dependencyPaths.map(path => ({ path, sha256: sha256(readFileSync(path)) }));
const implementationFingerprint = sha256(JSON.stringify(dependencyHashes));
const totals = { discovered: rows.length, classified: rows.filter(r => r.classification !== 'unknown').length, unknown: rows.filter(r => r.classification === 'unknown').length, cardRecords: rows.filter(r => r.isCard).length, cardPhysical: rows.filter(r => r.isCard).reduce((s, r) => s + r.physicalCount, 0), cardStateRecords: rows.filter(r => r.isCard && r.isState).length, cardInfiniteTemplates: rows.filter(r => r.isCard && r.isInfiniteTemplate && !r.isState).length, visualCardIdentities: unique(rows.filter(r => r.isCard).map(r => r.visualIdentity)).length, customDeckDeclarations: inventory.customDeckDeclarations.length, customImages: inventory.customImages.length, sourceBlockedObjects: rows.filter(r => r.sourceBlockers.length).length, duplicateGuidGroups: duplicateGuids.length, conflictingDeckIdGroups: deckIdReuse.length };
const coverage = { schemaVersion: 'complete-edition-coverage.c0.v1', authority: 'COMMUNITY_RETAIL_REFERENCE', scope: 'C0 audit only; STOP before C1', baseHead, sourceInputs, implementationFingerprint, dependencyHashes, totals, classifications: Object.fromEntries(unique(rows.map(r => r.classification)).map(c => [c, rows.filter(r => r.classification === c).length])), categories, heroGroups, containerCounts, existingRepository: baseline, prototypeTrinkets: prototypeTrinketPool().map(r => r.id), communityRegistry, consumerEdges, embeddedBuildingHeadings: visualClassification.embeddedBuildingHeadings, activeRuntimeBlockers: COMMUNITY_RUNTIME_BLOCKERS, assetChecks, duplicateGuids, deckIdReuse, auditErrors: errors, validation: errors.length ? 'FAIL' : 'PASS', productionMeasurement: 'Static imported registry counts and source consumer inspection; existing Act IV acceptance evidence referenced, not rerun. No new UI/session acceptance claimed.', logicalCountPolicy: 'Hero class/skill-state grouping and independent DD source composition establish identities where supported; elsewhere exact scoped image identity is a provisional candidate, not OCR or semantic identity. CardID and GUID alone are never logical keys. Alternate States share physical identity. Infinite bag contents are templates, not finite deck copies.' };
const raw = { schemaVersion: 'complete-edition-raw-inventory.c0.v1', sourceInputs, ...inventory };

let report = `| Category | Source Physical | Source Logical¹ | Extracted² | Normalized² | Registry³ | Production³ | UI³ | Source-blocked objects |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n`;
for (const c of categories) report += `| ${c.category} | ${c.sourcePhysical} | ${c.sourceLogical} | ${c.extracted} | ${c.normalized} | ${c.registry} | ${c.production} | ${c.ui} | ${c.sourceBlockedObjects} |\n`;
report += `\n# Complete Edition — C0 content coverage audit\n\n**STOP after C0. No gameplay, registry, UI, save or draw behavior changed.**\n\nBase: \`${baseHead}\`. Source SHA-256: \`${sourceSha256}\`. Implementation fingerprint: \`${implementationFingerprint}\`. Gate: **${coverage.validation}**.\n\n## Counting contract and limits\n\n1. Source Physical = serialized non-state, non-infinite-template objects in that category; containers/models remain in Other. Source Logical = named hero classes and skill families (upgrade states grouped), independently bound DD monster definitions, otherwise unique scoped face/back/cell identities for cards. Untranscribed visual identities are **provisional logical candidates, not confirmed semantic definitions**. A zero for a subtype such as Threat/Monster Ability means no separately identified cards, not proof the mechanic is absent. Skills printed inside monster/boss mats still require leaf extraction.\n2. Extracted = existing intake requirement packages (may be partial). Normalized = those packages, except DD Monsters uses actual composition definitions. Dungeon Tiles uses geometry packages in Normalized and layouts in Registry: these units cannot be compared by subtraction. Metadata extraction alone does not count as printed-field extraction.\n3. Registry/Production/UI measure **Community source-backed definitions only**, not legacy/prototype pools. Production/UI are static reachable catalogue counts, not a new playtest. Final Encounter production/UI count four main forms; auxiliary actor/skill execution is not claimed by that number. Existing Act IV acceptance has unresolved source rules.\n\nThis is a complete structural inventory with explicit semantic blockers, not full semantic normalization or proof that all discovered content is playable. Unclassified=0 is achieved by retaining unconfirmed objects as source-blocked, never deleting them. No videogame wiki, guessed values or prototype promotion is used.\n\n## Structural totals\n\n- Objects discovered/classified: **${totals.discovered}/${totals.classified}**; unknown: **${totals.unknown}**.\n- Card records: **${totals.cardRecords}**; physical card objects: **${totals.cardPhysical}**; alternate card states: **${totals.cardStateRecords}**; infinite-bag card templates: **${totals.cardInfiniteTemplates}**; scoped visual identities: **${totals.visualCardIdentities}**.\n- CustomDeck declarations: **${totals.customDeckDeclarations}**; CustomImage declarations: **${totals.customImages}**. All declarations retained, including unused atlas definitions. Unused atlas cells are NOT presumed physical cards.\n- Reused GUID groups: **${totals.duplicateGuidGroups}**; reused Deck IDs with differing definitions: **${totals.conflictingDeckIdGroups}**. Full paths and scoped deck lookup are mandatory.\n- Source-blocked object records: **${totals.sourceBlockedObjects}**. Each raw record records the reason; this is not a count of unique missing gameplay definitions.\n\n## P0 findings\n\n- Trinkets: shared table level decks contain 14 + 12 + 12 = **38** physical cards; Color of Madness adds **11**. Total **49** physical / **${categories.find(c => c.category === 'Trinkets')!.sourceLogicalVisual}** visual definitions, independently scanned. Existing official runtime pool is **${officialTrinketPool().length}**; Community trinket registry is **0**. Core expected 38 is not used as the Complete Edition total.\n- Standard quests: five source region quest groups each contain 15 cards, **75** in total. A separately named Boss Quest contributes **1**; DD quests remain **3**. Existing ordinary Quest Select uses ${STANDARD_QUESTS.length} standard + ${QUESTS.length - STANDARD_QUESTS.length} boss prototype definitions. The 75 source cards still need objectives/rewards/room counts transcribed.\n- Heroes: **${heroGroups.length} named classes**, with **${heroGroups.reduce((s, h) => s + h.heroCards, 0)} hero mats**, **${heroGroups.reduce((s, h) => s + h.levelCards, 0)} level cards**, **${heroGroups.reduce((s, h) => s + h.skillPhysical, 0)} physical skill objects / ${heroGroups.reduce((s, h) => s + h.skillForms, 0)} skill forms**. Existing ${HEROES.length} heroes include ${HEROES.filter(h => h.description?.includes('占位')).length} explicit placeholders. None has a full Complete Edition source-leaf skill binding.\n- Ordinary monster container cards: **${categories.find(c => c.category === 'Monsters')!.sourceCardPhysical}** physical / **${categories.find(c => c.category === 'Monsters')!.sourceLogicalVisual}** visual variants. Monster family and embedded skill totals are **source-blocked**, not inferred from card quantities. Existing runtime has ${MONSTERS.length} simplified monsters / ${MONSTER_SKILLS.length} prototype skills.\n- DD monster pool: **${COMMUNITY_RUNTIME_MONSTER_COMPOSITION.reduce((s, m) => s + m.physicalInstances.length, 0)}** physical / **${COMMUNITY_RUNTIME_MONSTER_COMPOSITION.length}** bound logical definitions; this is separate from ordinary monsters.\n\n## Existing repository and production consumers\n\nCounts below are imported from actual registries, not copied from the task baseline. These are not credited to Complete Edition coverage without source bindings.\n\n| Category | Existing registry | Authority / gap | Consumer |\n| --- | ---: | --- | --- |\n`;
for (const b of baseline) report += `| ${b.category} | ${b.registry} | ${b.authority} | \`${b.consumer}\` |\n`;
report += `\nPrototype trinkets: ${prototypeTrinketPool().length}. Full definition IDs and source-import edges with line numbers are in coverage JSON. QuestSelectPage imports QUESTS; CampaignSetupPage imports HEROES; battle-encounters imports MONSTERS. These are future C1–C5 seams, unchanged here.\n\n## Hero source count by class\n\n| Hero | Mats | Level cards | Physical skills | Skill forms | Normalized / production source-backed skills |\n| --- | ---: | ---: | ---: | ---: | --- |\n`;
for (const h of heroGroups) report += `| ${h.name} | ${h.heroCards} | ${h.levelCards} | ${h.skillPhysical} | ${h.skillForms} | 0 / 0 |\n`;
report += `\n## Card containers (includes expansion content)\n\nExpansion roots are preserved in sourceCategory, not excluded. States are not extra physical copies.\n\n| Container | Physical | Alternate states | Visual identities |\n| --- | ---: | ---: | ---: |\n`;
for (const c of containerCounts) report += `| ${c.container} | ${c.physical} | ${c.stateRecords} | ${c.visualIdentities} |\n`;
report += `\n## Blocker disposition and missing work\n\n- Visually reviewed Hamlet board 72a96b identifies **${visualClassification.embeddedBuildingHeadings.names.length} building headings**: ${visualClassification.embeddedBuildingHeadings.names.join(", ")}. These are embedded board definitions, not nine physical cards. Separate Graveyard board and 14 upgrade components are retained; costs/effects are not normalized.\n- P0: Trinket sides/timing/modifiers; ordinary quest objectives/rewards/special rules; hero stats/level differences/skill effects; monster families/levels/d10/embedded skills require source-card transcription and evidence binding. The source image exists; semantic extraction is missing. This is distinct from missing source imagery.\n- P1: Quirks require effect equality checks, even when names match; 11 existing diseases require TTS alignment; virtues/afflictions need trigger/result evidence; Curios need text/effect extraction; Hamlet board/building costs and effects need board and rulebook evidence.\n- Rule-only Trap/Rubble/Hunger/Provision/building mechanics are not inferred from token counts. Unnamed boards/cards are explicitly source-blocked in raw inventory; all remain addressable by path.\n- Known DD source-level blockers: ${COMMUNITY_RUNTIME_BLOCKERS.map(b => `\`${b.code}\``).join(', ')}.\n- Source assets from earlier intake are SHA checked (${assetChecks.length} ready records). Existing requirement-to-path/GUID bindings are checked separately from runtime definitions. Source completeness is not asserted merely because a normalized package exists.\n- Complete semantic totals for embedded monster/boss skills and unnamed board effects remain source-blocked. C1 must resolve relevant leaves before release; the structural audit must not be described as full content acceptance.\n\n## Reproduction / gates\n\nRun \`npm run audit:complete-edition-content -- --tts <3657612854.json>\`, then \`npm run verify:complete-edition-content-coverage -- --tts <3657612854.json>\`. S2/S3/S4 files must be adjacent, or use \`--source-dir\`. Alternatively set COMPLETE_EDITION_TTS.\n\nVerify regenerates in memory and compares every byte of committed outputs; checks classification conservation, card crop indexes, deck membership multiplicities, state ownership, source paths/GUIDs and existing asset SHA. Inputs and implementation are fingerprinted; no self-referential publication commit hash. Deleting an object, changing a source/registry, or tampering with outputs fails. The later normalized=registry and production-pool semantic gates are not claimed by this C0 gate.\n\nAudit errors: ${errors.length ? errors.map(e => `\n- ${e}`).join('') : 'none'}.\n`;
const outputs: Record<string, string> = {
  [`${dataDir}/complete-edition-raw-inventory.json`]: JSON.stringify(raw, null, 2) + '\n',
  [`${dataDir}/complete-edition-content-coverage.json`]: JSON.stringify(coverage, null, 2) + '\n',
  'docs/reports/complete-edition/complete-edition-content-coverage-report.md': report,
  'docs/reports/complete-edition-content-coverage.md': report,
};
if (!verify && errors.length) throw new Error(`Refusing to publish invalid inventory evidence:\n${errors.join('\n')}`);
for (const [path, content] of Object.entries(outputs)) {
  if (verify) { if (!existsSync(path) || readFileSync(path, 'utf8') !== content) errors.push(`stale/tampered artifact: ${path}`); }
  else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
console.log(JSON.stringify({ mode: verify ? 'verify' : 'generate', head, implementationFingerprint, totals, errors }, null, 2));
if (errors.length) process.exitCode = 1;
