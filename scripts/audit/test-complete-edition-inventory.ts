import assert from 'node:assert/strict';
import { scanTts, validateInventory } from './complete-edition-inventory-core';

const deck = (face: string, width = 2) => ({ FaceURL: face, BackURL: 'back', NumWidth: width, NumHeight: 1, UniqueBack: true });
const card = (guid: string, id = 100, extra = {}) => ({ Name: 'Card', GUID: guid, CardID: id, ...extra });
let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`PASS ${name}`); }

test('nested bags, alternate states, children and inherited CustomDeck are all visited', () => {
  const source = { ObjectStates: [{ Name: 'Bag', GUID: 'bag', ContainedObjects: [{ Name: 'Deck', GUID: 'deck', DeckIDs: [100], CustomDeck: { 1: deck('a') }, ContainedObjects: [card('base', 100, { States: { 2: card('upgraded', 101) }, ChildObjects: [{ Name: 'Custom_Token', GUID: 'token', CustomImage: { ImageURL: 'token.png' } }] })] }] }] };
  const result = scanTts(source);
  assert.equal(result.objects.length, 5);
  assert.equal(result.customImages.length, 1);
  assert.equal(result.customDeckDeclarations.length, 1);
  assert.equal(result.objects.find(x => x.sourceObjectGuid === 'upgraded')!.faceUrl, 'a');
  assert.equal(result.objects.filter(x => x.isCard).reduce((s, x) => s + x.physicalCount, 0), 1);
  assert.deepEqual(validateInventory(result), []);
});
test('same CardID in unrelated local decks does not merge', () => {
  const result = scanTts({ ObjectStates: [card('a', 100, { CustomDeck: { 1: deck('a') } }), card('b', 100, { CustomDeck: { 1: deck('b') } })] });
  assert.notEqual(result.objects[0].logicalIdentity, result.objects[1].logicalIdentity);
});
test('local override wins over inherited declaration', () => {
  const result = scanTts({ ObjectStates: [{ Name: 'Bag', GUID: 'bag', CustomDeck: { 1: deck('parent') }, ContainedObjects: [card('a', 100, { CustomDeck: { 1: deck('child') } })] }] });
  assert.equal(result.objects[1].faceUrl, 'child');
});
test('same GUID at two paths remains two physical cards and records exact-image duplicate', () => {
  const result = scanTts({ ObjectStates: [card('same', 100, { CustomDeck: { 1: deck('a') } }), card('same', 100, { CustomDeck: { 1: deck('a') } })] });
  assert.equal(result.objects.length, 2);
  assert.notEqual(result.objects[0].physicalIdentity, result.objects[1].physicalIdentity);
  assert.equal(result.objects[1].classification, 'duplicate-physical-copy');
  assert.ok(result.objects[1].sourceBlockers.length); // duplicate does not mean semantic extraction
});
test('infinite-bag prototype is retained without finite physical inflation', () => {
  const result = scanTts({ ObjectStates: [{ Name: 'Infinite_Bag', GUID: 'bag', ContainedObjects: [card('template', 100, { CustomDeck: { 1: deck('a') } })] }] });
  assert.equal(result.objects[1].isInfiniteTemplate, true);
  assert.equal(result.objects[1].physicalCount, 0);
});
test('missing deck and out-of-range cell fail indexing gate', () => {
  const result = scanTts({ ObjectStates: [card('missing'), card('outside', 102, { CustomDeck: { 1: deck('a') } })] });
  assert.equal(validateInventory(result).filter(x => x.startsWith('unindexed')).length, 2);
});
test('DeckIDs multiplicity is checked, not just membership set', () => {
  const result = scanTts({ ObjectStates: [{ Name: 'Deck', GUID: 'deck', DeckIDs: [100, 100], CustomDeck: { 1: deck('a') }, ContainedObjects: [card('a')] }] });
  assert.ok(validateInventory(result).some(e => e.includes('DeckIDs')));
});
test('deleting a contained card fails the deck gate, never substitutes a prototype', () => {
  const result = scanTts({ ObjectStates: [{ Name: 'Deck', GUID: 'deck', DeckIDs: [100], CustomDeck: { 1: deck('a') }, ContainedObjects: [card('a')] }] });
  result.objects.pop();
  assert.ok(validateInventory(result).some(e => e.includes('DeckIDs')));
});
test('unlabelled source is retained as source-blocked, never dropped', () => {
  const result = scanTts({ ObjectStates: [{ Name: 'Custom_Tile', GUID: 'unknown', CustomImage: { ImageURL: 'unread.png' } }] });
  assert.equal(result.objects.length, 1);
  assert.equal(result.objects[0].classification, 'source-blocked');
  assert.ok(result.objects[0].classificationReason);
});
test('unknown classification cannot pass the gate', () => {
  const result = scanTts({ ObjectStates: [{ Name: 'Bag', GUID: 'bag' }] });
  result.objects[0].classification = 'unknown';
  assert.ok(validateInventory(result).some(e => e.startsWith('unclassified')));
});
test('state physical double counting and missing owners are rejected', () => {
  const result = scanTts({ ObjectStates: [card('a', 100, { CustomDeck: { 1: deck('a') }, States: { 2: card('b', 101) } })] });
  result.objects[1].physicalCount = 1;
  result.objects[1].stateOwnerPath = '/absent';
  assert.equal(validateInventory(result).length, 2);
});
test('unused CustomDeck cells remain declarations, never invented card objects', () => {
  const result = scanTts({ ObjectStates: [{ Name: 'Bag', GUID: 'bag', CustomDeck: { 1: deck('unused', 10) } }] });
  assert.equal(result.customDeckDeclarations.length, 1);
  assert.equal(result.objects.filter(x => x.isCard).length, 0);
});
console.log(`${passed} inventory regression/adversarial checks passed`);
