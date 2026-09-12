/**
 * Phase 11A.3 — Community Visual Contact Sheet Generator
 *
 * Generates a single composite image that shows every ready Community
 * visual asset in a grid, with each cell labeled by:
 *   - runtime entity name
 *   - local image filename
 *   - source GUID
 *   - source CardID (when applicable)
 *   - sourceReference
 *   - sourceAuthority (always COMMUNITY_RETAIL_REFERENCE)
 *
 * The contact sheet is the single image that a human reviewer can
 * inspect to confirm the visual integration is correct, independent of
 * the build / test pipeline.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');

const MANIFEST_PATH = join(repoRoot, 'docs', 'data', 'darkest-dungeon', 'community-reference', 'community-visual-asset-manifest.json');
const OUTPUT_DIR = join(repoRoot, 'docs', 'reports', 'phase-11a3');
const SHEET_PNG = join(OUTPUT_DIR, 'community-visual-asset-contact-sheet.png');
const SHEET_JSON = join(OUTPUT_DIR, 'community-visual-asset-contact-sheet.json');

interface ManifestEntry {
  assetId: string;
  runtimeEntityId: string;
  requirementId: string;
  assetKind: string;
  status: string;
  productSurface: string;
  sourceAuthority: string;
  sourceReference?: string[];
  guid?: string | null;
  cardId?: number | null;
  sourceUrl?: string;
  sourceSha256?: string;
  localPath?: string;
  localSha256?: string;
  width?: number;
  height?: number;
  crop?: Record<string, unknown>;
  reason?: string;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const m = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { assets: ManifestEntry[] };
  const ready = m.assets.filter((a) => a.status === 'ready');
  const sourceMissing = m.assets.filter((a) => a.status === 'source-missing');
  console.log(`Ready assets: ${ready.length}`);
  console.log(`Source-missing assets: ${sourceMissing.length}`);

  // Build a 6-column grid of tiles
  const COLS = 6;
  const ROWS = Math.ceil(ready.length / COLS);
  const TILE_W = 320;
  const TILE_H = 480;
  const LABEL_H = 130;
  const PADDING = 12;
  const GRID_W = COLS * TILE_W + (COLS + 1) * PADDING;
  const GRID_H = ROWS * (TILE_H + LABEL_H) + (ROWS + 1) * PADDING;
  const TITLE_H = 90;

  const totalW = GRID_W;
  const totalH = GRID_H + TITLE_H;

  // Render each tile image and label as a separate composite piece
  const overlay = [];
  for (let i = 0; i < ready.length; i++) {
    const a = ready[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PADDING + col * (TILE_W + PADDING);
    const y = TITLE_H + PADDING + row * (TILE_H + LABEL_H + PADDING);
    if (!a.localPath) continue;
    const absPath = join(repoRoot, a.localPath.replace(/\//g, sep));
    if (!existsSync(absPath)) continue;
    // Tile image: scale to fit
    const tileBuf = await sharp(absPath).resize({
      width: TILE_W,
      height: TILE_H,
      fit: 'contain',
      background: { r: 30, g: 30, b: 35, alpha: 1 },
    }).png().toBuffer();
    overlay.push({ input: tileBuf, top: y, left: x });

    // Label
    const labelText = [
      `${a.runtimeEntityId}`,
      `${a.assetKind}`,
      `guid: ${a.guid ?? '—'}  cardId: ${a.cardId ?? '—'}`,
      `${a.sourceReference?.join(', ') ?? ''}`,
      `${a.sourceAuthority}`,
    ];
    const labelSvg = renderLabel(labelText, TILE_W, LABEL_H);
    const labelBuf = await sharp(Buffer.from(labelSvg)).png().toBuffer();
    overlay.push({ input: labelBuf, top: y + TILE_H, left: x });
  }

  // Title bar
  const titleSvg = renderTitle(ready.length, sourceMissing.length, totalW, TITLE_H);
  const titleBuf = await sharp(Buffer.from(titleSvg)).png().toBuffer();
  overlay.unshift({ input: titleBuf, top: 0, left: 0 });

  // Add the source-missing panel below
  const missingPanelSvg = renderMissingPanel(sourceMissing, totalW, 0);
  const missingBuf = await sharp(Buffer.from(missingPanelSvg)).png().toBuffer();

  const finalH = totalH + Math.max(0, Math.ceil(sourceMissing.length / 4) * 90) + 40;

  const missingComposite = sourceMissing.length > 0
    ? [{ input: missingBuf, top: totalH, left: 0 }]
    : [];
  const allOverlays = [...missingComposite, ...overlay];
  const out = await sharp({
    create: { width: totalW, height: finalH, channels: 3, background: { r: 17, g: 17, b: 20 } },
  })
    .composite(allOverlays)
    .png()
    .toBuffer();
  await writeFile(SHEET_PNG, out);

  // Write a JSON descriptor that pairs each cell with its metadata
  const descriptor = {
    generatedAt: new Date('2026-09-12T15:56:23+08:00').toISOString(),
    sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
    sourceEdition: 'antha-complete-edition',
    total: m.assets.length,
    ready: ready.length,
    sourceMissingCount: sourceMissing.length,
    grid: { cols: COLS, rows: ROWS, tileW: TILE_W, tileH: TILE_H },
    cells: ready.map((a, i) => ({
      index: i,
      col: i % COLS,
      row: Math.floor(i / COLS),
      assetId: a.assetId,
      runtimeEntityId: a.runtimeEntityId,
      assetKind: a.assetKind,
      status: a.status,
      productSurface: a.productSurface,
      sourceAuthority: a.sourceAuthority,
      sourceReference: a.sourceReference,
      guid: a.guid,
      cardId: a.cardId,
      sourceUrl: a.sourceUrl,
      sourceSha256: a.sourceSha256,
      localPath: a.localPath,
      localSha256: a.localSha256,
      width: a.width,
      height: a.height,
    })),
    sourceMissing: sourceMissing.map((a) => ({
      assetId: a.assetId,
      runtimeEntityId: a.runtimeEntityId,
      requirementId: a.requirementId,
      assetKind: a.assetKind,
      reason: a.reason,
    })),
    sheetPngPath: SHEET_PNG.replace(/\\/g, '/'),
    sheetPngSha256: createHash('sha256').update(out).digest('hex'),
  };
  await writeFile(SHEET_JSON, JSON.stringify(descriptor, null, 2) + '\n');
  console.log(`Contact sheet: ${SHEET_PNG}`);
  console.log(`Descriptor:    ${SHEET_JSON}`);
  console.log(`Sheet SHA256:  ${descriptor.sheetPngSha256}`);
}

function renderTitle(ready: number, missing: number, w: number, h: number): string {
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="#1a1a22"/>
  <text x="20" y="36" font-family="Menlo,monospace" font-size="22" fill="#e5e7eb" font-weight="bold">Phase 11A.3 · Community Visual Asset Contact Sheet</text>
  <text x="20" y="62" font-family="Menlo,monospace" font-size="13" fill="#9ca3af">Source Authority: COMMUNITY_RETAIL_REFERENCE · Ready: ${ready} · Source-missing: ${missing}</text>
  <text x="20" y="80" font-family="Menlo,monospace" font-size="11" fill="#6b7280">Each cell: runtime entity id · asset kind · guid · cardId · sourceReference · authority</text>
</svg>`;
}

function renderLabel(lines: string[], w: number, h: number): string {
  const lineH = Math.floor(h / lines.length);
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="#1a1a22"/>
  <rect x="0" y="0" width="${w}" height="2" fill="#374151"/>
  ${lines.map((line, i) => `<text x="10" y="${(i + 1) * lineH - 4}" font-family="Menlo,monospace" font-size="11" fill="#d1d5db">${escapeXml(line)}</text>`).join('\n')}
</svg>`;
}

function renderMissingPanel(missing: ManifestEntry[], w: number, h: number): string {
  if (missing.length === 0) return `<svg width="${w}" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="40" fill="#1a1a22"/></svg>`;
  const cellH = 90;
  const lines = missing.map((a, i) => `${a.runtimeEntityId} (${a.assetKind}) — ${a.reason ?? 'no confirmed visual source'}`);
  return `<svg width="${w}" height="${40 + Math.ceil(missing.length / 4) * cellH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${40 + Math.ceil(missing.length / 4) * cellH}" fill="#1a1a22"/>
  <text x="20" y="24" font-family="Menlo,monospace" font-size="14" fill="#fca5a5" font-weight="bold">Source-missing entities (will render explicit placeholder, NOT substituted with Prototype/Official/AI art)</text>
  ${lines.map((l, i) => `<text x="20" y="${50 + Math.floor(i / 4) * cellH + (i % 4) * 16}" font-family="Menlo,monospace" font-size="11" fill="#fda4af">${escapeXml(l)}</text>`).join('\n')}
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

main().catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
