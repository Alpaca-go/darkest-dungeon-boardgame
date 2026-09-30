/** v6 PROJECT_RULING, canonical=false. Exchange indivisible adjacent cards.
 * Vacancies remain explicit slots. Crossing a Large consumes its entire width,
 * rounding the last requested step outward. No RNG or input-array tie break. */
export function shuffleAtomicStanceBlocks(cards: Array<{ id: string; start: number; width: number }>,
  actorId: string, direction: 'push' | 'pull', distance: number): Record<string, number> {
  if (!Number.isInteger(distance) || distance < 0) throw new Error('Invalid Stance distance');
  const occupied = new Set<number>();
  if (new Set(cards.map(c => c.id)).size !== cards.length) throw new Error('Duplicate Stance identity');
  for (const card of cards) {
    if (![1, 2].includes(card.width) || !Number.isInteger(card.start) || card.start < 0 || card.start + card.width > 4)
      throw new Error('Invalid atomic Stance block');
    for (let i = card.start; i < card.start + card.width; i++) {
      if (occupied.has(i)) throw new Error('Overlapping atomic Stance blocks');
      occupied.add(i);
    }
  }
  const blocks = [...cards.map(c => ({ ...c, vacancy: false })),
    ...[0, 1, 2, 3].filter(i => !occupied.has(i)).map(i => ({ id: `vacancy:${i}`, start: i, width: 1, vacancy: true }))]
    .sort((a, b) => a.start - b.start);
  let index = blocks.findIndex(c => !c.vacancy && c.id === actorId);
  if (index < 0) throw new Error('Atomic Stance actor absent');
  const step = direction === 'push' ? 1 : -1;
  while (distance > 0 && index + step >= 0 && index + step < blocks.length) {
    const neighbor = index + step;
    distance -= blocks[neighbor].width;
    [blocks[index], blocks[neighbor]] = [blocks[neighbor], blocks[index]];
    index = neighbor;
  }
  let slot = 0;
  const positions: Record<string, number> = {};
  for (const block of blocks) {
    if (!block.vacancy) positions[block.id] = slot;
    slot += block.width;
  }
  return positions;
}
