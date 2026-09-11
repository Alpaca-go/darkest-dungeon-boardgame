import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const inputFlag = process.argv.indexOf('--input');
if (inputFlag < 0 || !process.argv[inputFlag + 1]) throw new Error('Usage: node scripts/audit/generate-community-reference-normalized.mjs --input <Astra intake package>');
const input = resolve(process.argv[inputFlag + 1]);
const outFlag = process.argv.indexOf('--out');
const out = resolve(outFlag >= 0 && process.argv[outFlag + 1] ? process.argv[outFlag + 1] : 'docs/data/darkest-dungeon/community-reference/antha-complete-edition');
const pkg = JSON.parse(readFileSync(input, 'utf8'));
const hash = createHash('sha256').update(readFileSync(input)).digest('hex');
const refs = new Map();
const add = (key, kind, detail) => { if (!refs.has(key)) refs.set(key, { key, kind, detail }); };
for (const requirement of pkg.requirements) {
  for (const asset of requirement.assets ?? []) {
    const renders = asset.renders?.map(({ side, url, cropBox, sourceImageSha256, renderedCropSha256 }) => ({ side, url, cropBox, sourceImageSha256, renderedCropSha256 }));
    const canonical = { guid: asset.guid, cardId: asset.cardId, ttsPath: asset.ttsPath, customDeck: asset.customDeck, customImage: asset.customImage, renders };
    add(asset.sourceObjectReference, 'tts-object', canonical);
    for (const ref of asset.renderReferences ?? []) add(ref, 'render-asset', canonical);
  }
  for (const field of Object.values(requirement.fields)) for (const ref of field.sourceReference ?? []) {
    if (ref.startsWith('rulebook:')) add(ref, 'rulebook-page', { page: Number(ref.slice(9)) });
  }
}
const normalized = { schemaVersion: 'phase11a3-community-normalized-intake.v1', sourceAuthority: pkg.sourceAuthority, sourceEdition: pkg.sourceEdition, workshopId: pkg.workshopId, sourcePackageSha256: hash, requirements: pkg.requirements.map(r => ({ requirementId: r.requirementId, componentId: r.componentId, componentGroup: r.componentGroup, componentType: r.componentType, quantity: r.quantity, status: r.status, assets: r.assets, fields: Object.fromEntries(Object.entries(r.fields).map(([key, f]) => [key, { value: f.value, evidenceType: f.evidenceType, sourceReference: f.sourceReference, confidence: f.confidence, eligibleForPendingImport: f.eligibleForPendingImport, status: f.value === null ? 'unresolved' : r.status }])) })) };
const bindings = [];
const expected = new Map();
const collect = (value, kind, sourceReference, requirementId) => {
  if (Array.isArray(value)) return value.forEach(v => collect(v, kind, sourceReference, requirementId));
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if (/sourceLocal(Id|SkillId|SlotId|MonsterDefinitionId)|areaId|mappedComponentIds|printedBossNames|guid|cardId/i.test(key)) {
      for (const id of Array.isArray(v) ? v : [v]) if (typeof id === 'string' || typeof id === 'number') { const sourceLocalId = String(id); expected.set(`${key}:${sourceLocalId}`, { sourceLocalId, sourceKind: key, sourceReference, requirementId }); bindings.push({ sourceLocalId, sourceKind: key, repositoryId: `community-dd-${sourceLocalId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, bindingBasis: 'exact source-local identity retained in normalized intake; community-reference ID created', sourceReference, requirementId }); }
    }
    collect(v, key, sourceReference, requirementId);
  }
};
for (const r of normalized.requirements) for (const f of Object.values(r.fields)) collect(f.value, 'field', f.sourceReference, r.requirementId);
for (const r of normalized.requirements) for (const a of r.assets ?? []) { expected.set(`physical-guid:${a.guid}`, { sourceLocalId: a.guid, sourceKind: 'physical-guid', sourceReference: [a.sourceObjectReference], requirementId: r.requirementId }); bindings.push({ sourceLocalId: a.guid, sourceKind: 'physical-guid', repositoryId: `community-dd-physical-${a.guid}`, bindingBasis: 'exact TTS GUID', sourceReference: [a.sourceObjectReference], requirementId: r.requirementId }); }
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'normalized-requirements.json'), JSON.stringify(normalized, null, 2) + '\n');
writeFileSync(resolve(out, 'source-reference-index.json'), JSON.stringify({ schemaVersion: 'phase11a3-community-reference-index.v1', sourcePackageSha256: hash, entries: [...refs.values()] }, null, 2) + '\n');
const bound = new Set(bindings.map(b => `${b.sourceKind}:${b.sourceLocalId}`));
const unboundSourceLocalIds = [...expected.entries()].filter(([key]) => !bound.has(key)).map(([, value]) => value);
writeFileSync(resolve(out, 'source-binding-manifest.json'), JSON.stringify({ schemaVersion: 'phase11a3-community-reference-binding-manifest.v3', expectedSourceLocalIds: [...expected.values()], bindings, unboundSourceLocalIds }, null, 2) + '\n');
console.log(JSON.stringify({ requirements: normalized.requirements.length, fields: normalized.requirements.reduce((n, r) => n + Object.keys(r.fields).length, 0), references: refs.size, bindings: bindings.length, hash }, null, 2));
