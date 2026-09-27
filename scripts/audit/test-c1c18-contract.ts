import { validateArtifacts, verifyContractGate } from './c1c18-contract-gate';
const { expected, artifacts, extraction } = verifyContractGate();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const mutations: Array<[string, (a: Record<string, any>, e: any) => void]> = [
  ['false resolved', a => { a['c1c18-wound-semantics-contract.json'].primitiveOutcome = 'A'; }],
  ['wound equals damage', a => { a['c1c18-wound-semantics-contract.json'].equivalentToDamage = true; }],
  ['wrong deathblow count', a => { a['c1c18-wound-semantics-contract.json'].multiWoundDeathblowCount = 2; }],
  ['source region substitution', a => { a['c1c18-wound-semantics-contract.json'].facts[0].page = 21; }],
  ['source extraction tamper', (_a, e) => { e.pages[28].regions[0].text = ''; }],
  ['promote Damage Stone', a => { a['c1c18-damage-stone-feasibility.json'].productionReady = true; }],
  ['false scope complete', a => { a['c1c18-damage-runtime-surface.json'].coverage = 'SOURCE_BOUND'; }],
  ['omit caller', a => { a['c1c18-damage-runtime-surface.json'].callers.pop(); }],
  ['omit grammar', a => { a['c1c18-wound-semantics-contract.json'].grammarInventory.pop(); }],
  ['pre-commit assumption', a => { a['c1c18-damage-stone-source-contract.json'].trigger.firesBeforeCommit = true; }],
  ['ready count drift', a => { a['c1c18-damage-stone-feasibility.json'].level1Coverage.productionReadyCount = 8; }],
];
for (const [name, mutate] of mutations) {
  const a = clone(artifacts), e = clone(extraction);
  mutate(a, e);
  let rejected = false;
  try { validateArtifacts(a, expected, e); } catch { rejected = true; }
  if (!rejected) throw new Error('C1C18 false-green mutation accepted: ' + name);
}
console.log(`C1C18 contract gate and ${mutations.length} adversarial mutations passed`);
