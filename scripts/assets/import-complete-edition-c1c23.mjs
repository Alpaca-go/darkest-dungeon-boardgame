import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const root = 'docs/data/complete-edition/';
const dir = root + 'source-assets/c1c23/';
const register = JSON.parse(readFileSync(root + 'c1c22-hamlet-event-source-intake-register.json'));
const sha = b => createHash('sha256').update(b).digest('hex');
mkdirSync(dir + 'crops', { recursive: true });
const assets = [];
for (const [side, key] of [['front', 'faceUrl'], ['back', 'backUrl']]) {
  const urls = [...new Set(register.cards.map(c => c[key]))];
  if (urls.length !== 1) throw new Error('Expected one locked sheet per side');
  const path = dir + `hamlet-event-${side}.jpg`;
  const receiptPath = path + '.receipt.json';
  if (!existsSync(path)) {
    const response = await fetch(urls[0]);
    if (!response.ok) throw new Error(`${side}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(path, bytes);
    writeFileSync(receiptPath, JSON.stringify({sourceUrl: urls[0], acquiredAt: new Date().toISOString(), mimeType: response.headers.get('content-type'), sha256: sha(bytes)}, null, 2) + '\n');
  }
  const bytes = readFileSync(path), meta = await sharp(bytes).metadata();
  const receipt = JSON.parse(readFileSync(receiptPath));
  if (receipt.sourceUrl !== urls[0] || receipt.sha256 !== sha(bytes)) throw new Error('Acquisition receipt drift');
  assets.push({side, path, ...receipt, byteLength: bytes.length, width: meta.width, height: meta.height, format: meta.format, gridWidth: 5, gridHeight: 5});
  writeFileSync(dir + `hamlet-event-${side}.sha256`, `${sha(bytes)}  hamlet-event-${side}.jpg\n`);
}
const crops = [];
for (const card of register.cards) {
  const sides = {};
  for (const asset of assets) {
    const col = card.cardIndex % card.numWidth, row = Math.floor(card.cardIndex / card.numWidth);
    const left = Math.floor(col * asset.width / card.numWidth), top = Math.floor(row * asset.height / card.numHeight);
    const bounds = {left, top, width: Math.floor((col + 1) * asset.width / card.numWidth) - left, height: Math.floor((row + 1) * asset.height / card.numHeight) - top};
    const path = dir + `crops/${card.cardId}-${asset.side}.png`;
    const bytes = await sharp(asset.path).extract(bounds).png().toBuffer();
    writeFileSync(path, bytes);
    sides[asset.side] = {path, sheetPath: asset.path, sheetSha256: asset.sha256, cropSha256: sha(bytes), bounds};
  }
  crops.push({physicalIdentity: card.physicalIdentity, sourceObjectGuid: card.sourceObjectGuid, ttsPath: card.ttsPath, cardId: card.cardId, deckId: card.deckId, cardIndex: card.cardIndex, uniqueBack: card.uniqueBack, grid: {width: card.numWidth, height: card.numHeight, cell: card.cardIndex}, ...sides});
}
writeFileSync(root + 'c1c23-hamlet-event-crop-manifest.json', JSON.stringify({schemaVersion: 1, phase: '11A.4-C1C-23', assets, crops}, null, 2) + '\n');
console.log(`Acquired ${assets.length} sheets; bound ${crops.length} front/back crop pairs.`);
