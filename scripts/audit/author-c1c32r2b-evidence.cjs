const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../../docs/data/complete-edition');
const tiles = require(path.join(root, 'c1c32r2a-ruins-tile-area-definitions.json')).tiles;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

// These identities were independently inspected against the rendered locked print
// sheets, including boundaries, pip capacities, glyphs, and Stance starts.
const visuallyAccepted = new Set(Array.from({ length: 9 }, (_, i) => `ruins-tile-${i + 1}`));
const proof = {
  schemaVersion: 1, phase: '11A.4-C1C32R2B', baselineHead: '2c4dfcf849579a5b53581f7a6d804285fe720c52',
  policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1', reviewedFrom: 'locked official production PDF renders',
  tiles: tiles.map(tile => {
    const source = tile.sourceReferences[0];
    const ids = new Set(tile.areas.map(area => area.id));
    const structural = tile.areas.length > 0 && tile.areas.every(area =>
      area.boundary.length >= 3 && area.capacity > 0 && area.adjacent.every(id =>
        ids.has(id) && tile.areas.find(other => other.id === id).adjacent.includes(area.id)))
      && [tile.heroStartingStanceAreas, tile.monsterStartingStanceAreas]
        .every(starts => Object.values(starts).every(id => ids.has(id)));
    const visualReviewed = visuallyAccepted.has(tile.tileId);
    return {
      tileId: tile.tileId, relativePath: source.relativePath, fileName: source.fileName,
      page: source.page, side: tile.side, sha256: source.sha256,
      areaCount: tile.areas.length, acceptedAreaIds: tile.areas.map(area => area.id),
      capacityMap: Object.fromEntries(tile.areas.map(area => [area.id, area.capacity])),
      elevationMap: Object.fromEntries(tile.areas.map(area => [area.id, area.elevation])),
      glyphMap: Object.fromEntries(tile.areas.map(area => [area.id, area.glyphs])),
      boundaryHash: hash(tile.areas.map(area => [area.id, area.boundary])),
      adjacencyHash: hash(tile.areas.map(area => [area.id, area.adjacent])),
      startingMapHash: hash([tile.heroStartingStanceAreas, tile.monsterStartingStanceAreas]),
      structuralValidation: structural, visualReviewed, result: structural && visualReviewed ? 'PASS' : 'FAIL',
    };
  }),
};
proof.acceptedCount = proof.tiles.filter(tile => tile.result === 'PASS').length;
fs.writeFileSync(path.join(root, 'c1c32r2b-tile-visual-topology-proof.json'), JSON.stringify(proof, null, 2) + '\n');
if (proof.acceptedCount !== 9) throw new Error('Nine ordinary Tile visual contracts required');

const corePath = 'DARKEST_DUNGEON_PRINT_EN_WAVE 1/MG_DD_01_EN_COREBOX_Print/DD_EN_COREBOX_RULES.pdf';
const aidPath = 'DARKEST_DUNGEON_PRINT_EN_WAVE 1/MG_DD_01_EN_COREBOX_Print/02_DD_CARDS_COREBOX/';
const common = { sourceClass: 'OFFICIAL_SOURCE' };
const sourceRoot = 'C:\\Users\\kyrie\\Desktop\\新建文件夹\\DARKEST DUNGEON EN_FILES';
function screenedLocalPdfs(directory = sourceRoot) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name.toLowerCase() === 'old_version' ? [] : screenedLocalPdfs(absolute);
    if (!entry.name.toLowerCase().endsWith('.pdf') || !/(rules|player_aids|setup|monster_)/i.test(entry.name)) return [];
    return [{ relativePath: path.relative(sourceRoot, absolute).replaceAll('\\', '/'), fileName: entry.name,
      sha256: shaFile(absolute), page: 'ALL_PAGES_TEXT_SEARCH',
      location: 'targeted text search for initial Large replacement discard return timing',
      componentId: 'initial-large-replacement-discard', sourceClass: /monster_|player_aids/i.test(entry.name)
        ? 'OFFICIAL_PRINTED_COMPONENT' : 'OFFICIAL_SOURCE', visualReview: false }];
  });
}
function shaFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
const files = [
  ...proof.tiles.map(tile => ({ relativePath: tile.relativePath, fileName: tile.fileName, sha256: tile.sha256,
    page: tile.page, location: `printed ordinary Room Tile ${tile.tileId}, ${tile.side} side`, componentId: tile.tileId,
    sourceClass: 'OFFICIAL_PRINTED_COMPONENT', visualReview: tile.visualReviewed })),
  ...[17, 25].map(page => ({ relativePath: corePath, fileName: 'DD_EN_COREBOX_RULES.pdf',
    sha256: '4c0bf3471bd0264443044b656b58d5a2d54c94b397aee19a049d20c0978e0125', page,
    location: page === 17 ? 'Large Monster spawning/replacement' : 'Battle End Monster-card return',
    componentId: 'initial-large-replacement-discard', visualReview: true, ...common })),
  ...[
    ['DD_EN_COREBOX_CARDS_70_120_PLAYER_AIDS_FRONT.pdf', 'e034a88db094cac38558e3c647aa9ee82012dfb430c8adf3cad2ea715fe6d362'],
    ['DD_EN_COREBOX_CARDS_70_120_PLAYER_AIDS_BACK.pdf', 'b83b6c4331cbc7b7315b6a26c8417f24dc17bba5f76b0c669dd341caadb84f8b'],
  ].flatMap(([fileName, sha256]) => Array.from({ length: 8 }, (_, i) => ({ relativePath: `${aidPath}${fileName}`,
    fileName, sha256, page: i + 1, location: 'targeted text search for pre-Battle discard return timing',
    componentId: 'initial-large-replacement-discard', visualReview: false, ...common }))),
  ...screenedLocalPdfs(),
];
const manifest = { schemaVersion: 1, phase: '11A.4-C1C32R2B', policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1',
  mandatoryRoot: sourceRoot,
  acquisition: 'TARGETED_FINAL_LOCAL_OFFICIAL_REVIEW', files };
fs.writeFileSync(path.join(root, 'c1c32r2b-local-official-source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
