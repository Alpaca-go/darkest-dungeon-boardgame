import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
const root = 'docs/data/complete-edition/';
const dir = root + 'source-assets/c1c24/';
const hash = b => createHash('sha256').update(b).digest('hex');
const sha1 = b => createHash('sha1').update(b).digest('hex');
const run = promisify(execFile);
const cards = JSON.parse(readFileSync(root + 'c1c22-boss-encounter-live-inventory.json')).cards.filter(c => c.category === 'Bosses');
if (cards.length !== 231) throw new Error('Locked ordinary Boss census must be 231');
const previous = existsSync(root + 'c1c24-boss-crop-manifest.json') ? JSON.parse(readFileSync(root + 'c1c24-boss-crop-manifest.json')) : null;
const ttsPath = process.argv.includes('--tts') ? process.argv[process.argv.indexOf('--tts') + 1] : process.env.COMPLETE_EDITION_TTS ?? previous?.ttsSource?.path;
if (!ttsPath) throw new Error('Supply the locked original TTS with --tts or COMPLETE_EDITION_TTS');
const ttsBytes = readFileSync(ttsPath), tts = JSON.parse(ttsBytes);
if (hash(ttsBytes) !== 'd2fe21a6aa294f80fb47e56677c3a74090c3dc131361d798dfde709f6a3a64a2') throw new Error('Original TTS source hash differs from C0/C1C22');
for (const c of cards) {
  const o = c.ttsPath.split('/').filter(Boolean).reduce((v, k) => v[k], tts), deck = o.CustomDeck[c.deckId];
  if (o.GUID !== c.sourceObjectGuid || o.CardID !== c.cardId || deck.FaceURL !== c.faceUrl || deck.BackURL !== c.backUrl || deck.NumWidth !== c.numWidth || deck.NumHeight !== c.numHeight || deck.UniqueBack !== c.uniqueBack) throw new Error('Locked TTS physical identity/deck drift');
}
mkdirSync(dir + 'sheets', {recursive: true});
mkdirSync(dir + 'crops', {recursive: true});
const urls = [...new Set(cards.flatMap(c => [c.faceUrl, c.backUrl]))].sort();
const assets = [];
const failures = [];
const candidates = await Promise.allSettled(urls.map(async sourceUrl => {
  const id = hash(sourceUrl);
  const path = dir + `sheets/${id}.bin`;
  if (existsSync(path)) return {sourceUrl, retained: true};
  const cache = `.artifacts/community-reference-assets/raw/${id}.png`;
  if (existsSync(cache)) {
    const bytes = readFileSync(cache);
    if (sha1(bytes).toUpperCase() !== sourceUrl.split('/').filter(Boolean).at(-1)) throw new Error('Exact URL cache content SHA-1 mismatch');
    return {sourceUrl, bytes, acquisitionKind: 'EXACT_URL_CONTENT_HASH_VERIFIED_CACHE', cachePath: cache};
  }
  const {stdout} = await run('curl.exe', ['--fail', '--silent', '--show-error', '--retry', '2', '--max-time', '180', sourceUrl], {encoding: 'buffer', maxBuffer: 100 * 1024 * 1024});
  return {sourceUrl, bytes: stdout, acquisitionKind: 'LOCKED_URL_HTTP_DOWNLOAD'};
}));
// Network/cache reads are independent; persist their results sequentially.
for (const [index, sourceUrl] of urls.entries()) {
  const assetId = hash(sourceUrl), path = dir + `sheets/${assetId}.bin`, receiptPath = path + '.receipt.json';
  const result = candidates[index];
  if (result.status === 'rejected') {
    const error = String(result.reason.stderr ?? result.reason.message ?? result.reason);
    failures.push({assetId, sourceUrl, status: 'SOURCE_ASSET_UNAVAILABLE', checkedAt: new Date().toISOString(), httpStatus: error.match(/error:\s*(\d+)/)?.[1] ?? null, reason: error, sourceBytesAcquired: false});
    continue;
  }
  if (!result.value.retained) {
    const {bytes, acquisitionKind, cachePath} = result.value;
    const decoded = await sharp(bytes).metadata();
    if (sha1(bytes).toUpperCase() !== sourceUrl.split('/').filter(Boolean).at(-1)) throw new Error('Original source content does not match locked Steam content SHA-1');
    writeFileSync(path, bytes);
    writeFileSync(receiptPath, JSON.stringify({sourceUrl, acquiredAt: new Date().toISOString(), acquisitionKind, cachePath: cachePath ?? null, mimeType: `image/${decoded.format === 'jpeg' ? 'jpeg' : decoded.format}`, mimeBasis: 'Decoded original format; no HTTP MIME claimed for a cache', sha256: hash(bytes), sourceContentSha1: sha1(bytes)}, null, 2) + '\n');
  }
  const receipt = JSON.parse(readFileSync(receiptPath)), bytes = readFileSync(path), meta = await sharp(bytes).metadata();
  if (receipt.sha256 !== hash(bytes) || receipt.sourceUrl !== sourceUrl) throw new Error('Acquisition receipt drift');
  const bindings = cards.flatMap(c => ['front', 'back'].filter(s => c[s === 'front' ? 'faceUrl' : 'backUrl'] === sourceUrl).map(side => ({deckId: c.deckId, side, gridWidth: side === 'back' && !c.uniqueBack ? 1 : c.numWidth, gridHeight: side === 'back' && !c.uniqueBack ? 1 : c.numHeight})));
  assets.push({assetId, path, ...receipt, byteLength: bytes.length, width: meta.width, height: meta.height, format: meta.format, gridBindings: [...new Map(bindings.map(b => [JSON.stringify(b), b])).values()]});
  writeFileSync(path + '.sha256', `${hash(bytes)}  ${assetId}.bin\n`);
  console.log(`Sheet ${index + 1}/${urls.length}: ${meta.width}x${meta.height}`);
}
const crops = [];
for (const card of cards) {
  const sides = {};
  for (const side of ['front', 'back']) {
    const asset = assets.find(a => a.sourceUrl === card[side === 'front' ? 'faceUrl' : 'backUrl']);
    if (!asset) { sides[side] = {status: 'SOURCE_ASSET_UNAVAILABLE', sourceUrl: card[side === 'front' ? 'faceUrl' : 'backUrl'], failureAssetId: hash(card[side === 'front' ? 'faceUrl' : 'backUrl']), cropSha256: null, path: null}; continue; }
    const cell = side === 'back' && !card.uniqueBack ? 0 : card.cardIndex;
    const width = side === 'back' && !card.uniqueBack ? 1 : card.numWidth, height = side === 'back' && !card.uniqueBack ? 1 : card.numHeight;
    const col = cell % width, row = Math.floor(cell / width);
    if (cell >= width * height) throw new Error('Cell outside locked grid');
    const left = Math.floor(col * asset.width / width), top = Math.floor(row * asset.height / height);
    const bounds = {left, top, width: Math.floor((col + 1) * asset.width / width) - left, height: Math.floor((row + 1) * asset.height / height) - top};
    const path = dir + `crops/${card.cardId}-${card.sourceObjectGuid}-${side}.png`;
    const bytes = await sharp(asset.path).extract(bounds).png().toBuffer();
    writeFileSync(path, bytes);
    sides[side] = {status: 'SOURCE_BOUND', path, assetId: asset.assetId, sheetPath: asset.path, sheetSha256: asset.sha256, sourceUrl: asset.sourceUrl, cell, grid: {width, height}, bounds, cropSha256: hash(bytes)};
  }
  crops.push({physicalIdentity: card.physicalIdentity, sourceObjectGuid: card.sourceObjectGuid, ttsPath: card.ttsPath, cardId: card.cardId, deckId: card.deckId, cardIndex: card.cardIndex, uniqueBack: card.uniqueBack, isState: card.isState, ...sides});
}
writeFileSync(root + 'c1c24-boss-crop-manifest.json', JSON.stringify({schemaVersion: 1, phase: '11A.4-C1C-24', ttsSource: {path: ttsPath, sha256: hash(ttsBytes)}, inventoryPath: root + 'c1c22-boss-encounter-live-inventory.json', inventorySha256: hash(readFileSync(root + 'c1c22-boss-encounter-live-inventory.json')), cropConvention: 'Row-major; floor cell boundaries; UniqueBack false uses entire back image, otherwise same card cell', acquisitionHistory: [...(previous?.acquisitionHistory ?? []), ...(previous?.failures ?? [])], assets, failures, crops}, null, 2) + '\n');
console.log(`Covered ${crops.length} Boss identities; ${assets.length} source assets acquired, ${failures.length} source assets unavailable; ${crops.flatMap(c => [c.front, c.back]).filter(s => s.status === 'SOURCE_BOUND').length} exact crops.`);
