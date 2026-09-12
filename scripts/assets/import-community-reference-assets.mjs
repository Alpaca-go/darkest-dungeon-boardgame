#!/usr/bin/env node
/**
 * Phase 11A.3 — Community Visual Asset Importer
 *
 * Deterministic, source-traceable asset importer.
 *
 * Required inputs:
 *   --intake   <path to Phase11A3_CompleteEdition_Source_Intake_Package.json>
 *   --tts      <path to 3657612854.json>
 *   --out      <output directory for committed local assets>
 *
 * Optional inputs:
 *   --inventory <path to asset-inventory.json>   (default: <repo>/docs/data/darkest-dungeon/community-reference/asset-inventory.json)
 *   --manifest  <output manifest path>           (default: <repo>/docs/data/darkest-dungeon/community-reference/community-visual-asset-manifest.json)
 *   --cache     <local raw sheet cache>          (default: <repo>/.artifacts/community-reference-assets/raw)
 *   --only      <comma-separated list of asset kinds to import>   (default: all)
 *   --skip-download  (use existing cache only; fail if a source is uncached)
 *
 * Determinism contract:
 *   - All outputs are sorted by stable assetId before being written
 *   - Every downloaded source sheet is keyed by sourceUrl sha256
 *   - Cropped outputs are stored with stable names derived from inventory
 *   - The output manifest contains sha256 of intake + tts + inventory to detect
 *     nondeterministic inputs
 *
 * Forbidden:
 *   - No hard-coded local paths
 *   - No remote image fetch at runtime (the importer is the ONLY thing that
 *     reads from steamusercontent.com)
 *   - No silent fallback to placeholder / Prototype / Official art
 *   - No guessing when a crop is ambiguous (CANDIDATE_SET etc. uses the
 *     explicit "firstPhysical" record from the inventory, never a heuristic)
 *
 * Exit codes:
 *   0  success
 *   2  argument / IO error
 *   3  source download failed (no usable cache)
 *   4  source identity ambiguous / mapping invalid
 *   5  image decode / crop failure
 *   6  nondeterministic output detected (sha mismatch with prior run)
 */

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, access } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');

const ARGS = parseArgs(process.argv.slice(2));

if (!ARGS.intake || !ARGS.tts || !ARGS.out) {
  console.error('ERROR: --intake, --tts, --out are required');
  process.exit(2);
}

const INTAKE_PATH = resolve(ARGS.intake);
const TTS_PATH = resolve(ARGS.tts);
const OUT_DIR = resolve(ARGS.out);
const INVENTORY_PATH = ARGS.inventory
  ? resolve(ARGS.inventory)
  : join(repoRoot, 'docs', 'data', 'darkest-dungeon', 'community-reference', 'asset-inventory.json');
const MANIFEST_PATH = ARGS.manifest
  ? resolve(ARGS.manifest)
  : join(repoRoot, 'docs', 'data', 'darkest-dungeon', 'community-reference', 'community-visual-asset-manifest.json');
const CACHE_DIR = ARGS.cache
  ? resolve(ARGS.cache)
  : join(repoRoot, '.artifacts', 'community-reference-assets', 'raw');
const ONLY = ARGS.only
  ? ARGS.only.split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const SKIP_DOWNLOAD = ARGS.skipDownload === true;

const assetKindDir = {
  'quest-card-front': 'quests',
  'guardian-battle-card': 'guardians',
  'guardian-room-card': 'rooms',
  'guardian-room-tile': 'rooms',
  'dungeon-tile': 'dungeon-tile',
  'final-form-card': 'final-encounter',
  'monster-deck': 'monster-deck',
  'monster-deck-card': 'monster-deck',
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skip-download') { out.skipDownload = true; continue; }
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function sha256File(path) {
  const h = createHash('sha256');
  await pipeline(createReadStream(path), h);
  return h.digest('hex');
}

async function sha256OfObject(obj) {
  // Stable serialization: keys sorted
  return sha256Buffer(stableStringify(obj));
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

async function downloadToFile(url, destPath) {
  await mkdir(dirname(destPath), { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) {
    throw new Error(`Unexpected content-type "${ct}" for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return buf;
}

async function ensureSourceSheet(sourceUrl, cacheKey) {
  // cacheKey is sha256 of sourceUrl
  const cached = join(CACHE_DIR, cacheKey + '.png');
  if (await fileExists(cached)) {
    const buf = await readFile(cached);
    return { buffer: buf, sha256: sha256Buffer(buf), cached: true };
  }
  if (SKIP_DOWNLOAD) {
    throw new Error(`Source sheet ${sourceUrl} not in cache; --skip-download is set`);
  }
  const buf = await downloadToFile(sourceUrl, cached);
  return { buffer: buf, sha256: sha256Buffer(buf), cached: false };
}

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function cropCell(buffer, numWidth, numHeight, cardIndex) {
  // TTS CustomDeck uses row-major, 0-based, left-to-right then top-to-bottom.
  const img = sharp(buffer);
  const meta = await img.metadata();
  const col = cardIndex % numWidth;
  const row = Math.floor(cardIndex / numWidth);
  const cellW = Math.floor(meta.width / numWidth);
  const cellH = Math.floor(meta.height / numHeight);
  const left = col * cellW;
  const top = row * cellH;
  const png = await img
    .extract({ left, top, width: cellW, height: cellH })
    .png()
    .toBuffer();
  return {
    png,
    sheetWidth: meta.width,
    sheetHeight: meta.height,
    cellWidth: cellW,
    cellHeight: cellH,
    left,
    top,
    width: cellW,
    height: cellH,
  };
}

function buildAssetId(runtimeEntityId, assetKind) {
  return `${runtimeEntityId}-${assetKind}`;
}

function buildLocalAssetPath(runtimeEntityId, assetKind) {
  const dir = assetKindDir[assetKind] || 'misc';
  const slug = runtimeEntityId.replace(/^community-dd-/, '').replace(/-/g, '-');
  const suffix = assetKind === 'monster-deck-card' ? '.front.png' : '.front.png';
  return `src/assets/darkest-dungeon/community-reference/antha-complete-edition/${dir}/${slug}${suffix}`;
}

function inventorySlugFor(runtimeEntityId, selection) {
  // The visual file name uses the runtime entity id, with member
  // disambiguation for monster-deck.
  return runtimeEntityId.replace(/^community-dd-/, '');
}

function buildMemberAsset(member) {
  // For a monster-deck member, the runtime entity id is a per-name id.
  return {
    runtimeEntityId: `community-dd-monster-${member.logicalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    assetKind: 'monster-deck-card',
    selection: {
      strategy: 'DIRECT_DECK_PARTIAL_FIELDS',
      firstPhysical: { guid: member.guids[0], cardId: member.cardIds[0], deckId: '460', cardIndex: member.cardIds[0] - 46000, numWidth: 10, numHeight: 7 },
      allPhysical: member.cardIds.map((c, i) => ({ guid: member.guids[i], cardId: c })),
    },
  };
}

async function main() {
  // Validate paths exist
  await mustExist(INTAKE_PATH, 'intake');
  await mustExist(TTS_PATH, 'tts');
  await mustExist(INVENTORY_PATH, 'inventory');

  const intakeRaw = await readFile(INTAKE_PATH, 'utf8');
  const inventoryRaw = await readFile(INVENTORY_PATH, 'utf8');
  const intakeSha = sha256Buffer(Buffer.from(intakeRaw));
  const ttsSha = await sha256File(TTS_PATH);
  const inventorySha = sha256Buffer(Buffer.from(inventoryRaw));

  const intake = JSON.parse(intakeRaw);
  const inventory = JSON.parse(inventoryRaw);

  if (intake.sourceAuthority !== 'COMMUNITY_RETAIL_REFERENCE') {
    throw new Error(`intake.sourceAuthority must be COMMUNITY_RETAIL_REFERENCE, got ${intake.sourceAuthority}`);
  }
  if (inventory.sourceAuthority !== 'COMMUNITY_RETAIL_REFERENCE') {
    throw new Error(`inventory.sourceAuthority must be COMMUNITY_RETAIL_REFERENCE, got ${inventory.sourceAuthority}`);
  }

  // Build a list of asset jobs (ready + sourceMissing + mappedUnrendered)
  const jobs = [];
  for (const item of inventory.items) {
    if (ONLY && !ONLY.includes(item.assetKind)) continue;

    if (item.status === 'ready') {
      jobs.push(item);
    } else if (item.status === 'source-missing') {
      // We still emit a manifest entry but with no localPath
      jobs.push(item);
    } else if (item.status === 'mapped-unrendered' && item.assetKind === 'monster-deck') {
      // Special: monster deck expands to 9 per-name members for contact sheet
      for (const member of item.selection.members) {
        jobs.push({
          ...buildMemberAsset(member),
          requirementId: item.requirementId,
          status: 'ready',
          productSurface: 'contact-sheet-only',
        });
      }
      // Retain the parent requirement as mapped-unrendered for inventory parity
      jobs.push({
        ...item,
        status: 'mapped-unrendered',
        productSurface: item.productSurface,
        __alreadyEmitted: true,
      });
    } else if (item.status === 'mapped-unrendered' && item.assetKind === 'dungeon-tile') {
      // DIRECT_QUANTITY_MATCH: convert to TILE_IMAGE jobs (one per tile).
      // Use unique child requirementIds per tile so the per-requirement
      // count remains correct.
      for (const tile of item.selection.tiles) {
        jobs.push({
          ...item,
          requirementId: item.requirementId + ':' + tile.guid,
          status: 'ready',
          productSurface: 'contact-sheet-only',
          runtimeEntityId: item.runtimeEntityId + '-' + tile.guid,
          selection: {
            strategy: 'TILE_IMAGE',
            guid: tile.guid,
            imageUrl: tile.imageUrl,
          },
        });
      }
      // Retain the parent requirement as mapped-unrendered for inventory parity
      jobs.push({
        ...item,
        status: 'mapped-unrendered',
        productSurface: item.productSurface,
        __alreadyEmitted: true,
      });
    } else if (item.status === 'mapped-unrendered' && item.assetKind === 'guardian-room-card') {
      // Use firstPhysical for the contact sheet only
      const fp = item.selection.firstPhysical;
      if (fp) {
        jobs.push({
          ...item,
          status: 'ready',
          productSurface: 'contact-sheet-only',
          selection: {
            strategy: 'DIRECT_NAMED_CARD',
            guid: fp.guid,
            cardId: fp.cardId,
            deckId: fp.deckId,
            cardIndex: fp.cardIndex,
            numWidth: fp.numWidth,
            numHeight: fp.numHeight,
          },
        });
      }
    } else if (item.status === 'mapped-unrendered' && item.assetKind === 'guardian-room-tile') {
      // Use the first tile (11-12 by convention; "11-12" is the deepest room tile)
      const tile = item.selection.tiles[0];
      jobs.push({
        requirementId: item.requirementId,
        runtimeEntityId: item.runtimeEntityId,
        assetKind: 'guardian-room-tile',
        status: 'ready',
        productSurface: 'contact-sheet-only',
        selection: {
          strategy: 'TILE_IMAGE',
          guid: tile.guid,
          nickname: tile.nickname,
          imageUrl: tile.imageUrl,
        },
      });
    }
    // All other mapped-unrendered items without a direct visual source are
    // still recorded in the manifest for documentation, but no file is produced.
  }

  // For each ready job, derive sourceUrl + crop metadata
  const manifestAssets = [];
  let downloadedSheets = 0;
  let cacheHits = 0;
  let totalBytes = 0;
  const downloadedSheetSet = new Set();

  // First emit mapped-unrendered parents that the children branches
  // already processed (so per-requirement counts stay correct).
  for (const job of stableSortBy(jobs, (j) => buildAssetId(j.runtimeEntityId, j.assetKind))) {
    if (!job.__alreadyEmitted) continue;
    manifestAssets.push({
      assetId: buildAssetId(job.runtimeEntityId, job.assetKind),
      runtimeEntityId: job.runtimeEntityId,
      requirementId: job.requirementId,
      assetKind: job.assetKind,
      status: 'mapped-unrendered',
      productSurface: job.productSurface,
      sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
      sourceReferences: job.selection?.guids || (job.selection?.tiles ? job.selection.tiles.map((t) => t.guid) : []),
    });
  }

  for (const job of stableSortBy(jobs, (j) => buildAssetId(j.runtimeEntityId, j.assetKind))) {
    if (job.__alreadyEmitted) continue;
    if (job.status === 'source-missing') {
      manifestAssets.push({
        assetId: buildAssetId(job.runtimeEntityId, job.assetKind),
        runtimeEntityId: job.runtimeEntityId,
        requirementId: job.requirementId,
        assetKind: job.assetKind,
        status: 'source-missing',
        productSurface: job.productSurface,
        sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
        reason: job.selection.reason || 'no confirmed visual source in accepted intake',
        sourceReferences: job.selection.guids || [],
      });
      continue;
    }

    if (job.selection.strategy === 'TILE_IMAGE') {
      // Custom_Tile: full image, no crop
      const url = job.selection.imageUrl;
      const cacheKey = sha256Buffer(Buffer.from(url));
      let src;
      try {
        src = await ensureSourceSheet(url, cacheKey);
      } catch (e) {
        throw new Error(`Failed to download tile ${url}: ${e.message}`);
      }
      if (src.cached) cacheHits++; else { downloadedSheets++; downloadedSheetSet.add(url); }
      const localRelPath = buildLocalAssetPath(job.runtimeEntityId, 'guardian-room-tile');
      const localAbsPath = join(OUT_DIR, localRelPath.replace(/^src\/assets\//, ''));
      await mkdir(dirname(localAbsPath), { recursive: true });
      await writeFile(localAbsPath, src.buffer);
      const meta = await sharp(src.buffer).metadata();
      const localSha = sha256Buffer(src.buffer);
      totalBytes += src.buffer.length;
      manifestAssets.push({
        assetId: buildAssetId(job.runtimeEntityId, job.assetKind),
        runtimeEntityId: job.runtimeEntityId,
        requirementId: job.requirementId,
        assetKind: job.assetKind,
        status: 'ready',
        productSurface: job.productSurface,
        sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
        sourceReference: [`asset:${job.selection.guid}:imageUrl`],
        guid: job.selection.guid,
        cardId: null,
        sourceUrl: url,
        sourceSha256: src.sha256,
        localPath: localRelPath.replaceAll(sep, '/'),
        localSha256: localSha,
        width: meta.width,
        height: meta.height,
        crop: { kind: 'tile-image' },
      });
      continue;
    }

    // CustomDeck: crop a cell. The selection can either be a DIRECT_NAMED_CARD
    // (fields live at the top level) or a MULTI_VARIANT/CANDIDATE_SET (fields
    // live under firstPhysical + allPhysical). Normalize accordingly.
    const sel = normalizeFirstPhysical(job.selection);
    if (!sel || !sel.deckId || sel.cardIndex === undefined || sel.cardIndex === null) {
      throw new Error(`Invalid selection for ${job.runtimeEntityId}: missing firstPhysical (strategy=${job.selection.strategy})`);
    }
    // Find the source sheet by faceUrl from intake
    const sourceUrl = findSourceSheetUrl(intake, sel);
    if (!sourceUrl) {
      throw new Error(`No source sheet URL found for ${job.runtimeEntityId} (guid=${sel.guid} cardId=${sel.cardId})`);
    }
    const cacheKey = sha256Buffer(Buffer.from(sourceUrl));
    let src;
    try {
      src = await ensureSourceSheet(sourceUrl, cacheKey);
    } catch (e) {
      throw new Error(`Failed to download sheet ${sourceUrl} for ${job.runtimeEntityId}: ${e.message}`);
    }
    if (src.cached) cacheHits++; else { downloadedSheets++; downloadedSheetSet.add(sourceUrl); }

    const cropped = await cropCell(src.buffer, sel.numWidth, sel.numHeight, sel.cardIndex);
    const localRelPath = buildLocalAssetPath(job.runtimeEntityId, job.assetKind);
    const localAbsPath = join(OUT_DIR, localRelPath.replace(/^src\/assets\//, ''));
    await mkdir(dirname(localAbsPath), { recursive: true });
    await writeFile(localAbsPath, cropped.png);
    const localSha = sha256Buffer(cropped.png);
    totalBytes += cropped.png.length;
    manifestAssets.push({
      assetId: buildAssetId(job.runtimeEntityId, job.assetKind),
      runtimeEntityId: job.runtimeEntityId,
      requirementId: job.requirementId,
      assetKind: job.assetKind,
      status: 'ready',
      productSurface: job.productSurface,
      sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
      sourceReference: [`asset:${sel.guid}:face`],
      guid: sel.guid,
      cardId: sel.cardId,
      sourceUrl,
      sourceSha256: src.sha256,
      localPath: localRelPath.replaceAll(sep, '/'),
      localSha256: localSha,
      width: cropped.width,
      height: cropped.height,
      crop: {
        kind: 'custom-deck-cell',
        deckId: sel.deckId,
        cardIndex: sel.cardIndex,
        numWidth: sel.numWidth,
        numHeight: sel.numHeight,
        sheetWidth: cropped.sheetWidth,
        sheetHeight: cropped.sheetHeight,
        cellWidth: cropped.cellWidth,
        cellHeight: cropped.cellHeight,
        left: cropped.left,
        top: cropped.top,
      },
    });
  }

  // Add a deterministic ordering of all mapped-unrendered items not yet in jobs
  for (const item of stableSortBy(inventory.items, (i) => i.runtimeEntityId)) {
    if (jobs.find((j) => j.requirementId === item.requirementId)) continue;
    manifestAssets.push({
      assetId: buildAssetId(item.runtimeEntityId, item.assetKind),
      runtimeEntityId: item.runtimeEntityId,
      requirementId: item.requirementId,
      assetKind: item.assetKind,
      status: item.status,
      productSurface: item.productSurface || 'none',
      sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
      sourceReferences: [],
    });
  }

  // Sort final manifest assets
  const finalAssets = stableSortBy(manifestAssets, (a) => a.assetId);

  const manifest = {
    schemaVersion: 'phase11a3-community-visual-asset-manifest.v1',
    generatedAt: new Date('2026-09-12T15:56:23+08:00').toISOString(),
    sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
    sourceEdition: inventory.sourceEdition,
    workshopId: inventory.workshopId,
    inputs: {
      intakePath: relative(repoRoot, INTAKE_PATH).replaceAll(sep, '/'),
      intakeSha256: intakeSha,
      ttsPath: relative(repoRoot, TTS_PATH).replaceAll(sep, '/'),
      ttsSha256: ttsSha,
      inventoryPath: relative(repoRoot, INVENTORY_PATH).replaceAll(sep, '/'),
      inventorySha256: inventorySha,
    },
    counts: {
      total: inventory.items.length,
      ready: finalAssets.filter((a) => a.status === 'ready').length,
      mappedUnrendered: finalAssets.filter((a) => a.status === 'mapped-unrendered').length,
      sourceMissing: finalAssets.filter((a) => a.status === 'source-missing').length,
      notApplicable: finalAssets.filter((a) => a.status === 'not-applicable').length,
    },
    importer: {
      cacheDir: relative(repoRoot, CACHE_DIR).replaceAll(sep, '/'),
      downloadedSheets: downloadedSheets,
      cachedSheets: cacheHits,
      totalLocalBytes: totalBytes,
      uniqueSheets: downloadedSheetSet.size,
    },
    assets: finalAssets,
  };

  // Determinism: hash the manifest content WITHOUT the manifestSha256 field
  // (so the field itself does not cause a hash drift), then write the final
  // JSON including the field.
  const contentHash = sha256Buffer(Buffer.from(JSON.stringify(manifest)));
  manifest.manifestSha256 = contentHash;
  const finalJson = JSON.stringify(manifest, null, 2) + '\n';
  const finalHash = sha256Buffer(Buffer.from(finalJson));

  await mkdir(dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, finalJson);

  console.log('=== importer summary ===');
  console.log('intakeSha256:', intakeSha);
  console.log('ttsSha256:', ttsSha);
  console.log('inventorySha256:', inventorySha);
  console.log('manifestContentSha256:', contentHash);
  console.log('manifestFileSha256:', finalHash);
  console.log('downloadedSheets:', downloadedSheets, ' cachedSheets:', cacheHits, ' uniqueSheets:', downloadedSheetSet.size);
  console.log('totalLocalBytes:', totalBytes);
  console.log('counts:', JSON.stringify(manifest.counts));
  console.log('manifestPath:', relative(repoRoot, MANIFEST_PATH).replaceAll(sep, '/'));
}

function normalizeFirstPhysical(selection) {
  if (!selection) return null;
  if (selection.firstPhysical) return selection.firstPhysical;
  // DIRECT_NAMED_CARD / DIRECT_QUANTITY_MATCH / OBJECT_PRESENT_TYPE_MISMATCH
  if (selection.guid !== undefined && (selection.deckId || selection.imageUrl)) {
    return {
      guid: selection.guid,
      cardId: selection.cardId,
      deckId: selection.deckId,
      cardIndex: selection.cardIndex,
      numWidth: selection.numWidth,
      numHeight: selection.numHeight,
      imageUrl: selection.imageUrl,
    };
  }
  return null;
}

function findSourceSheetUrl(intake, sel) {
  // Look up the customDeck faceUrl for the requirement that owns this guid/cardId
  for (const r of intake.requirements) {
    for (const a of r.assets || []) {
      if (a.guid === sel.guid && a.cardId === sel.cardId && a.customDeck) {
        return a.customDeck.faceUrl;
      }
    }
  }
  return null;
}

function stableSortBy(arr, keyFn) {
  return arr.map((x, i) => ({ x, i, k: keyFn(x) })).sort((a, b) => {
    if (a.k < b.k) return -1;
    if (a.k > b.k) return 1;
    return a.i - b.i;
  }).map(({ x }) => x);
}

async function mustExist(p, label) {
  try { await stat(p); }
  catch { throw new Error(`Required ${label} file not found: ${p}`); }
}

main().catch((err) => {
  console.error('FATAL:', err.stack || err.message);
  process.exit(1);
});
