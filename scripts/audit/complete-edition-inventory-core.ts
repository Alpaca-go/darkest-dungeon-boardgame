import { createHash } from 'node:crypto';

// TTS is an external, heterogeneous document. Keep its unknown fields intact.
type TtsObject = Record<string, any>;
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const last = <T>(items: T[]): T | undefined => items[items.length - 1];
export const CATEGORIES = ['Heroes', 'Hero Skills', 'Hero Level / Upgrade Cards', 'Hero Accessories', 'Standard Quests', 'Boss Quests', 'Threat Cards', 'DD Quests', 'Monsters', 'Monster Battle Cards', 'Monster Ability Cards', 'Bosses', 'Guardian Cards', 'Final Encounter Cards', 'DD Monsters', 'Dungeon Tiles', 'Room Cards', 'Corridor / Room Content', 'Curios', 'Traps', 'Rubble', 'Hunger', 'Encounter / Event Content', 'Trinkets', 'Provisions', 'Loot / Rewards', 'Quirks', 'Diseases', 'Virtues', 'Afflictions', 'Hamlet', 'Building Levels / Effects', 'Caretaker', 'Other'] as const;
export type Category = typeof CATEGORIES[number];
export const CLASSIFICATIONS = ['runtime-content', 'duplicate-physical-copy', 'visual-only', 'token', 'board-component', 'rule-reference', 'expansion-content', 'non-runtime', 'source-blocked', 'unknown'];
export interface InventoryRow {
  sourceObjectGuid: string | null; objectType: string; nickname: string; description: string; gmNotes: string; tags: unknown[];
  cardId: number | null; deckId: number | null; cardIndex: number | null; customDeckId: string | null;
  faceUrl: string | null; backUrl: string | null; numWidth: number | null; numHeight: number | null; uniqueBack: boolean | null;
  customImage: unknown; customDeck: unknown; ttsPath: string; parentGuid: string | null;
  containerHierarchy: Array<{ guid: string | null; nickname: string; objectType: string; ttsPath: string }>;
  sourceCategory: string; runtimeCategory: Category; physicalIdentity: string; logicalIdentity: string | null;
  visualIdentity: string | null; logicalIdentityBasis: string; classification: string; confidence: string; classificationReason: string;
  isCard: boolean; isState: boolean; isInfiniteTemplate: boolean; physicalCount: number; stateOwnerPath: string | null;
  deckIds: number[]; sourceBlockers: string[]; duplicateOf: string | null; definitionStatus: string;
}
export interface CategoryOverride { category: Category; classification?: string; reason: string }

function categorize(o: TtsObject, ancestors: InventoryRow[], override?: CategoryOverride): { category: Category; classification: string; reason: string } {
  if (override) return { category: override.category, classification: override.classification ?? 'source-blocked', reason: override.reason };
  const names = [...ancestors.map(a => a.nickname), o.Nickname || ''];
  const context = names.join(' > ');
  const card = typeof o.CardID === 'number';
  const match = (regex: RegExp) => regex.test(context);
  if (/Bag|Deck/.test(o.Name)) return { category: 'Other', classification: 'non-runtime', reason: 'Container; descendants counted separately (including infinite-bag templates).' };
  if (/HandTrigger|LayoutZone/.test(o.Name)) return { category: 'Other', classification: 'non-runtime', reason: 'TTS interaction zone.' };
  if (o.Name === 'Custom_PDF' || match(/Aid Cards|Regles/)) return { category: 'Other', classification: 'rule-reference', reason: 'Explicit rule/reference document container or PDF.' };
  if (card) {
    const categories: Array<[RegExp, Category]> = [[/Trinkets/i, 'Trinkets'], [/Quirks/i, 'Quirks'], [/Diseases/i, 'Diseases'], [/Afflictions/i, 'Afflictions'], [/Virtues/i, 'Virtues'], [/Boss Quest/i, 'Boss Quests'], [/Quests > Darkest dungeon/, 'DD Quests'], [/Quests/i, 'Standard Quests'], [/Darkest Dungeon Monsters/, 'DD Monsters'], [/Monsters? Cards?|Common Monsters|Ruins Monsters/i, 'Monsters'], [/Boss Room Cards|Room Cards/, 'Room Cards'], [/Curio Spawn/, 'Corridor / Room Content'], [/Curio/i, 'Curios'], [/Hamlet Event/, 'Encounter / Event Content']];
    for (const [re, category] of categories) if (re.test(context)) return { category, classification: 'source-blocked', reason: `Explicit source container identifies ${category}; printed fields require extraction/binding.` };
    if (match(/The Darkest Heroes/)) {
      // A hero skill object has two alternate upgrade states; no inference of effects.
      const root = [...ancestors].reverse().find(a => a.isCard);
      const skill = Object.keys(o.States || {}).length === 2 || root?.runtimeCategory === 'Hero Skills';
      const category = skill ? 'Hero Skills' : o.Name === 'CardCustom' ? 'Heroes' : 'Hero Level / Upgrade Cards';
      return { category, classification: 'source-blocked', reason: skill ? 'Hero container, three-state card family; upgrade states indexed individually; effects untranscribed.' : 'Hero-container card role (hero mat or level card), consistent with scoped Crusader visual review; fields untranscribed.' };
    }
    if (match(/Boss Cards.*Figurines/)) {
      const dd = names.filter(n => n === 'Darkest Dungeon').length > 1;
      const category = dd ? (match(/Ancestor|Heart of darkness/) ? 'Final Encounter Cards' : 'Guardian Cards') : 'Bosses';
      return { category, classification: 'source-blocked', reason: 'Boss-family container; battle/threat/ability subtype requires card evidence.' };
    }
    return { category: 'Other', classification: 'source-blocked', reason: 'Unlabelled card: retain exact scoped crop; do not infer content from CardID.' };
  }
  if (/Custom_Model$|Custom_Assetbundle/.test(o.Name)) return { category: 'Other', classification: 'visual-only', reason: '3D figurine/asset bundle, not a printed card definition.' };
  if (match(/Dungeon Tiles/)) return { category: 'Dungeon Tiles', classification: 'board-component', reason: 'Explicit dungeon-tile container.' };
  if (match(/Hamlet Upgrades/)) return { category: 'Building Levels / Effects', classification: 'source-blocked', reason: 'Upgrade component; printed costs and effects require extraction.' };
  if (match(/Caretaker/)) return { category: 'Caretaker', classification: 'token', reason: 'Named caretaker marker; rules not inferred from marker.' };
  if (/Token|Dice|Tile_Stack/.test(o.Name) || ancestors.some(a => /Infinite/.test(a.objectType))) return { category: 'Other', classification: 'token', reason: 'Token/die/template object; physical marker does not establish a rule definition.' };
  return { category: 'Other', classification: 'source-blocked', reason: 'Unlabelled board/image component; image semantics not yet confirmed.' };
}

export function scanTts(source: unknown, overrides: Record<string, CategoryOverride> = {}) {
  const objects: InventoryRow[] = [];
  const customDeckDeclarations: Array<{ ttsPath: string; ownerPath: string | null; customDeckId: string; definition: unknown }> = [];
  const customImages: Array<{ ttsPath: string; ownerPath: string | null; definition: unknown }> = [];
  function walk(v: any, path: string, ancestors: InventoryRow[], inheritedDecks: TtsObject, stateOwner: string | null) {
    if (!v || typeof v !== 'object') return;
    let lineage = ancestors;
    let decks = inheritedDecks;
    if (!Array.isArray(v) && typeof v.Name === 'string' && ('GUID' in v || 'Transform' in v)) {
      decks = { ...inheritedDecks, ...v.CustomDeck };
      const cardId = typeof v.CardID === 'number' ? v.CardID : null;
      const deckId = cardId === null ? null : Math.floor(cardId / 100);
      const cardIndex = cardId === null ? null : cardId % 100;
      const d = deckId === null ? null : decks[String(deckId)];
      const isInfiniteTemplate = ancestors.some(a => /Infinite/.test(a.objectType));
      const role = categorize(v, ancestors, overrides[path]);
      const row: InventoryRow = {
        sourceObjectGuid: v.GUID ?? null, objectType: v.Name, nickname: v.Nickname ?? '', description: v.Description ?? '', gmNotes: v.GMNotes ?? '', tags: v.Tags ?? [],
        cardId, deckId, cardIndex, customDeckId: deckId === null ? null : String(deckId), faceUrl: d?.FaceURL ?? null, backUrl: d?.BackURL ?? null,
        numWidth: d?.NumWidth ?? null, numHeight: d?.NumHeight ?? null, uniqueBack: d?.UniqueBack ?? null,
        customImage: v.CustomImage ?? null, customDeck: v.CustomDeck ?? null, ttsPath: path, parentGuid: last(ancestors)?.sourceObjectGuid ?? null,
        containerHierarchy: ancestors.map(a => ({ guid: a.sourceObjectGuid, nickname: a.nickname, objectType: a.objectType, ttsPath: a.ttsPath })),
        sourceCategory: ancestors.find(a => /^The |^Darkest Dungeon$/.test(a.nickname))?.nickname ?? 'Shared table',
        runtimeCategory: role.category, physicalIdentity: `tts-path:${stateOwner ?? path}`, logicalIdentity: null, logicalIdentityBasis: 'unresolved',
        visualIdentity: null, classification: role.classification, confidence: 'container-or-type-confirmed; printed-definition-unverified', classificationReason: role.reason,
        isCard: cardId !== null, isState: stateOwner !== null, isInfiniteTemplate, physicalCount: stateOwner || isInfiniteTemplate ? 0 : 1, stateOwnerPath: stateOwner,
        deckIds: v.DeckIDs ?? [], sourceBlockers: [], duplicateOf: null, definitionStatus: 'not-extracted',
      };
      if (cardId !== null) {
        if (!d?.FaceURL || !d?.BackURL || !Number.isInteger(d.NumWidth) || !Number.isInteger(d.NumHeight) || d.NumWidth < 1 || d.NumHeight < 1 || cardIndex! >= d.NumWidth * d.NumHeight) row.sourceBlockers.push('missing-or-invalid-scoped-custom-deck');
        else {
          row.logicalIdentity = `visual-card:${sha256(JSON.stringify([d.FaceURL, d.BackURL, d.NumWidth, d.NumHeight, d.UniqueBack ?? false, cardIndex]))}`;
          row.visualIdentity = row.logicalIdentity;
          row.logicalIdentityBasis = 'exact-scoped-face/back-cell; NOT a confirmed semantic/gameplay definition';
        }
      }
      if (row.classification === 'source-blocked') row.sourceBlockers.push('printed-definition-not-bound');
      objects.push(row); lineage = [...ancestors, row];
    }
    if (v.CustomDeck) for (const [id, definition] of Object.entries(v.CustomDeck)) customDeckDeclarations.push({ ttsPath: `${path}/CustomDeck/${id}`, ownerPath: last(lineage)?.ttsPath ?? null, customDeckId: id, definition });
    if (v.CustomImage) customImages.push({ ttsPath: `${path}/CustomImage`, ownerPath: last(lineage)?.ttsPath ?? null, definition: v.CustomImage });
    for (const [key, child] of Object.entries(v)) {
      if (key === 'States' && child && typeof child === 'object') {
        for (const [stateId, state] of Object.entries(child)) walk(state, `${path}/States/${stateId}`, lineage, decks, stateOwner ?? path);
      } else walk(child, `${path}/${key}`, lineage, decks, stateOwner);
    }
  }
  walk(source, '', [], {}, null);
  // Exact image duplicates are recorded, but differing levels/backs are never merged by name or GUID.
  const seen = new Map<string, InventoryRow>();
  for (const row of objects) if (row.logicalIdentity) {
    const first = seen.get(row.logicalIdentity);
    if (first) {
      row.duplicateOf = first.ttsPath;
      if (!row.isState && !row.isInfiniteTemplate) row.classification = 'duplicate-physical-copy';
    } else seen.set(row.logicalIdentity, row);
  }
  return { objects, customDeckDeclarations, customImages };
}

export function validateInventory(inventory: ReturnType<typeof scanTts>) {
  const errors: string[] = [];
  const byPath = new Map(inventory.objects.map(o => [o.ttsPath, o]));
  if (byPath.size !== inventory.objects.length) errors.push('duplicate object path');
  for (const row of inventory.objects) {
    if (!CLASSIFICATIONS.includes(row.classification) || row.classification === 'unknown') errors.push(`unclassified: ${row.ttsPath}`);
    if (row.isCard && (!row.logicalIdentity || row.sourceBlockers.includes('missing-or-invalid-scoped-custom-deck'))) errors.push(`unindexed card: ${row.ttsPath}`);
    if (row.isState && row.physicalCount !== 0) errors.push(`state double counted: ${row.ttsPath}`);
    if (row.stateOwnerPath && !byPath.has(row.stateOwnerPath)) errors.push(`missing state owner: ${row.ttsPath}`);
    if (row.deckIds.length) {
      const cards = inventory.objects.filter(o => last(o.containerHierarchy)?.ttsPath === row.ttsPath && !o.isState && o.isCard).map(o => o.cardId).sort((a, b) => a! - b!);
      if (JSON.stringify(cards) !== JSON.stringify([...row.deckIds].sort((a, b) => a - b))) errors.push(`DeckIDs / contained cards mismatch: ${row.ttsPath}`);
    }
  }
  return errors;
}
