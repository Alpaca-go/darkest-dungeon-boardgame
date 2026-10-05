import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = 'docs/data/complete-edition/';
export const ruleSetVersion = 'C1C35R2-PROPHET-DIGITAL-DEFAULT-v1';
export const capacityRulingId = 'C1C35R2-PROPHET-AREA-C-CAPACITY-v1';
export const sourceContractVersion = 'C1C35R2-PROPHET-EXECUTION-CONTRACT-v1';
export const baseline = '7a3a483cba0dca0eb537e744980eecd4c55fef24';
export const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const read = (p: string) => JSON.parse(readFileSync(root + p + '.json', 'utf8'));
export function buildGateA() {
  const refs = ['c1c35-prophet-project-rulings', 'c1c35r1-prophet-rubble-target-scope-ruling', 'c1c35r1-prophet-source-closure', 'c1c35-prophet-tile-contract', 'rule-source-policy', 'c1c35-prophet-d10-area-map', 'c1c35-prophet-glyph-semantic-contract'];
  const inputHashes = Object.fromEntries(refs.map(p => [root+p+'.json', hash(root+p+'.json')]));
  const ruling = { schemaVersion: 1, id: capacityRulingId, version: capacityRulingId, authority: 'PROJECT_RULING', canonical: false,
    areaId: 'ruins-tile-11:C', actorCapacity: 6, canonicalStatus: 'SOURCE_UNRESOLVED', canonicalCapacity: null,
    authorizedBy: 'C1C35R2 user instruction section 1', scope: 'BattleActor occupancy only',
    rationale: 'Large Prophet occupies two Actor spaces; four normal Heroes occupy four. Six permits the standard party without an unsupported missing-dot bottleneck.',
    pew: { battleActor: false, capacityCost: 0, targetable: false, hp: null, initiative: 'none', d10SixPlacementLegal: true }, inputHashes };
  const items = structuredClone(read('c1c35r1-prophet-source-closure').items);
  const tile = items.find((r: any) => r.id === 'tile');
  Object.assign(tile, { status: 'PROJECT_RULING', canonical: false, contractExecutable: true,
    canonicalStatus: 'SOURCE_UNRESOLVED', rulingReferences: [{id: capacityRulingId, version: capacityRulingId}],
    executableCapacity: {areaId: ruling.areaId, actorCapacity: 6, authority: ruling.authority, canonical: false, rulingId: ruling.id},
    reason: ruling.rationale });
  return { ruling, acceptance: {schemaVersion: 1, baseline, sourceContractVersion, ruleSetVersion, inputHashes,
    rulingReferences: [
      {path: root+refs[0]+'.json', version: 'C1C35-PROPHET-DIGITAL-DEFAULT-v1', sha256: inputHashes[root+refs[0]+'.json']},
      {path: root+refs[1]+'.json', version: 'C1C35R1-PROPHET-RUBBLE-TARGET-SCOPE-v1', sha256: inputHashes[root+refs[1]+'.json']},
      {path: root+'c1c35r2-prophet-area-c-capacity-ruling.json', version: capacityRulingId, sha256: createHash('sha256').update(JSON.stringify(ruling,null,2)+'\n').digest('hex')}
    ], items, requiredFieldCount: 22, closedExecutionFields: 22, executionBlockers: [],
    outcome: 'PROPHET_GATE_A_CONTRACT_ACCEPTED', gateAPassed: true, canonicalComplete: false, digitalExecutionContractComplete: true,
    canonicalMissingFields: ['ruins-tile-11:C.capacity', 'Rubble target scope'], inheritsNecromancerRulings: false,
    productionAccepted: false } };
}
export function validateGateAStructure(a: ReturnType<typeof buildGateA>) {
  if(a.ruling.id!==capacityRulingId || a.ruling.version!==capacityRulingId || a.ruling.authority!=='PROJECT_RULING'
    || a.ruling.canonical || a.ruling.actorCapacity!==6 || a.ruling.canonicalCapacity!==null
    || a.ruling.canonicalStatus!=='SOURCE_UNRESOLVED' || a.ruling.areaId!=='ruins-tile-11:C') throw new Error('Capacity authority/value drift');
  if(a.ruling.pew.battleActor || a.ruling.pew.capacityCost!==0 || a.ruling.pew.targetable || a.ruling.pew.hp!==null
    || a.ruling.pew.initiative!=='none' || !a.ruling.pew.d10SixPlacementLegal) throw new Error('Pew capacity contamination');
  if(a.acceptance.items.length!==22 || new Set(a.acceptance.items.map((r:any)=>r.id)).size!==22
    || a.acceptance.items.some((r:any)=>!r.contractExecutable || !['OFFICIAL_SOURCE','PROJECT_RULING'].includes(r.status))) throw new Error('Gate A execution blocker');
  if(a.acceptance.canonicalComplete || !a.acceptance.digitalExecutionContractComplete || !a.acceptance.gateAPassed
    || a.acceptance.ruleSetVersion!==ruleSetVersion || a.acceptance.executionBlockers.length || a.acceptance.inheritsNecromancerRulings
    || a.acceptance.productionAccepted) throw new Error('Gate A completeness/version drift');
  if(JSON.stringify(a)!==JSON.stringify(buildGateA())) throw new Error('Gate A contract drift');
}
export function verifyGateA() {
  const a = buildGateA(); validateGateAStructure(a);
  for(const [p,h] of Object.entries(a.acceptance.inputHashes)) {
    if(hash(p)!==h || createHash('sha256').update(execFileSync('git',['show',`${baseline}:${p}`],{maxBuffer:16*1024*1024})).digest('hex')!==h) throw new Error('Frozen source drift: '+p);
  }
  if(a.acceptance.items.length!==22 || a.acceptance.items.some((r:any)=>!r.contractExecutable || !['OFFICIAL_SOURCE','PROJECT_RULING'].includes(r.status))) throw new Error('Gate A execution blocker');
  for(const [name,expected] of [['area-c-capacity-ruling',a.ruling],['gate-a-acceptance',a.acceptance]] as const)
    if(JSON.stringify(read('c1c35r2-prophet-'+name))!==JSON.stringify(expected)) throw new Error('Gate A artifact drift: '+name);
  console.log('C1C35R2 Gate A PASS: 22/22 executable fields; canonicalComplete=false; digitalExecutionContractComplete=true.');
}
if(process.argv.includes('--write-gate-a')) {
  const a=buildGateA();
  writeFileSync(root+'c1c35r2-prophet-area-c-capacity-ruling.json',JSON.stringify(a.ruling,null,2)+'\n');
  writeFileSync(root+'c1c35r2-prophet-gate-a-acceptance.json',JSON.stringify(a.acceptance,null,2)+'\n');
  verifyGateA();
}
if(process.argv.includes('--verify-gate-a')) verifyGateA();
