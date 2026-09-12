#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const intakePath = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('usage: node generate-community-visual-identity-lock.mjs <canonical-intake>');
const inventoryPath = join(repoRoot, 'docs/data/darkest-dungeon/community-reference/asset-inventory.json');
const outputPath = join(repoRoot, 'docs/data/darkest-dungeon/community-reference/community-visual-identity-lock.json');
const [intake, inventory] = await Promise.all([
  readFile(intakePath, 'utf8').then(JSON.parse),
  readFile(inventoryPath, 'utf8').then(JSON.parse),
]);

const requirements = new Map(intake.requirements.map((r) => [r.requirementId, r]));
const exactAsset = (requirementId, guid, cardId = null) => {
  const requirement = requirements.get(requirementId);
  const matches = (requirement?.assets || []).filter((a) => a.guid === guid && (a.cardId ?? null) === (cardId ?? null));
  if (matches.length !== 1) throw new Error(`${requirementId}: expected one canonical intake asset for ${guid}/${cardId}, got ${matches.length}`);
  return matches[0];
};
const reference = (a, side) => ({
  sourceReference: `asset:${a.guid}:${side}`,
  ttsObjectPath: a.ttsPath,
  GUID: a.guid,
  CardID: a.cardId ?? null,
  sourceSide: side,
  ...(a.customDeck ? {
    deckId: a.customDeck.deckId,
    FaceURL: a.customDeck.faceUrl,
    BackURL: a.customDeck.backUrl,
    NumWidth: a.customDeck.numWidth,
    NumHeight: a.customDeck.numHeight,
    cardIndex: a.customDeck.cardIndex,
  } : {}),
  ...(a.customImage ? {
    ImageURL: a.customImage.imageUrl,
    SecondaryURL: a.customImage.secondaryUrl,
  } : {}),
});
const entries = [];
for (const item of inventory.items) {
  const base = {
    requirementId: item.requirementId,
    runtimeEntityId: item.runtimeEntityId,
    assetKind: item.assetKind,
    sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
    identityBasis: 'accepted-source-extraction-audit-v1 + object-specific TTS metadata',
  };
  if (item.status === 'source-missing') {
    entries.push({ ...base, canonicalSourceReferences: [], status: 'source-missing' });
    continue;
  }
  if (item.assetKind === 'monster-deck') {
    for (const member of item.selection.members) {
      const refs = member.cardIds.map((cardId, index) => reference(exactAsset(item.requirementId, member.guids[index], cardId), 'face'));
      const slug = member.logicalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      entries.push({
        ...base,
        runtimeEntityId: `community-dd-monster-${slug}`,
        assetKind: 'monster-deck-card',
        logicalName: member.logicalName,
        canonicalSourceReferences: refs,
        allowedPhysicalInstances: refs,
        visualRepresentative: refs[0].sourceReference,
      });
    }
    continue;
  }
  if (item.assetKind === 'dungeon-tile') {
    for (const tile of item.selection.tiles) {
      const a = exactAsset(item.requirementId, tile.guid, null);
      entries.push({ ...base, requirementId: `${item.requirementId}:${tile.guid}`, runtimeEntityId: `${item.runtimeEntityId}-${tile.guid}`, assetKind: 'guardian-room-tile', canonicalSourceReferences: [reference(a, 'imageUrl')] });
    }
    continue;
  }
  const selection = item.selection.visualRepresentative || item.selection;
  if (!selection.guid) {
    entries.push({ ...base, canonicalSourceReferences: [], status: item.status });
    continue;
  }
  const side = item.assetKind === 'guardian-room-tile' ? selection.sourceSide : 'face';
  const primary = exactAsset(item.requirementId, selection.guid, selection.cardId ?? null);
  const physical = (item.selection.allPhysical || []).map((p) => reference(exactAsset(item.requirementId, p.guid, p.cardId), 'face'));
  entries.push({
    ...base,
    canonicalSourceReferences: [reference(primary, side)],
    ...(physical.length ? { allowedPhysicalInstances: physical, visualRepresentative: `asset:${selection.guid}:face` } : {}),
  });
}

entries.sort((a, b) => `${a.requirementId}|${a.runtimeEntityId}|${a.assetKind}`.localeCompare(`${b.requirementId}|${b.runtimeEntityId}|${b.assetKind}`));
const lock = {
  schemaVersion: 'phase11a3-community-visual-identity-lock.v1',
  sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
  identityAuthority: 'Phase11A3_CompleteEdition_Source_Extraction_Audit_Report.md',
  entries,
};
await writeFile(outputPath, JSON.stringify(lock, null, 2) + '\n');
console.log(`wrote ${entries.length} canonical visual identities to ${outputPath}`);
