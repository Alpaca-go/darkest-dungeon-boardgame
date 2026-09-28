import { readFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
const m = JSON.parse(readFileSync('docs/data/complete-edition/c1c24-boss-crop-manifest.json'));
mkdirSync('tmp/c1c24/review', {recursive: true});
// Review aids only: every tile is labelled with CardID and side, linked to full original crops.
for (const deck of [...new Set(m.crops.map(c => c.deckId))]) {
  const cards = m.crops.filter(c => c.deckId === deck).sort((a, b) => a.cardIndex - b.cardIndex);
  for (let offset = 0; offset < cards.length; offset += 6) {
    const batch = cards.slice(offset, offset + 6), tiles = [];
    for (const [index, card] of batch.entries()) for (const [column, side] of ['front', 'back'].entries()) {
      if (card[side].status !== 'SOURCE_BOUND') continue;
      const image = await sharp(card[side].path).resize({width: 390, height: 650, fit: 'contain', background: '#111'}).png().toBuffer();
      tiles.push({input: image, left: (index % 3) * 800 + column * 390, top: Math.floor(index / 3) * 690 + 30});
      const label = Buffer.from(`<svg width="390" height="30"><rect width="390" height="30" fill="white"/><text x="10" y="22" font-size="22">${card.cardId} ${side}</text></svg>`);
      tiles.push({input: label, left: (index % 3) * 800 + column * 390, top: Math.floor(index / 3) * 690});
    }
    await sharp({create: {width: 2400, height: Math.ceil(batch.length / 3) * 690, channels: 3, background: '#111'}}).composite(tiles).png().toFile(`tmp/c1c24/review/${deck}-${offset}.png`);
  }
}
