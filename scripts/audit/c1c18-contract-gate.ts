import { readFileSync } from 'node:fs';
import { baselineHead, implementationAnchor, implementationTree, git, sha, buildContracts } from './c1c18-contract';

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('C1C18: ' + message);
}
export function validateArtifacts(artifacts: Record<string, any>, expected: Record<string, any>, extraction: any) {
  assert(JSON.stringify(artifacts) === JSON.stringify(expected), 'contract/evidence bindings drift');
  const wound = artifacts['c1c18-wound-semantics-contract.json'];
  for (const fact of wound.facts) {
    const region = extraction.pages[fact.page - 1]?.regions.find((r: any) => r.region === fact.region);
    const compact = (text: string) => text.replace(/\s+/g, ' ').trim();
    assert(region && compact(region.text).includes(compact(fact.requiredText)), 'extracted fact missing: ' + fact.factId);
    assert(fact.sourceSha256 === extraction.sourceSha256 && fact.sourceSha256 === sha(readFileSync(fact.source)), 'official source fact hash drift');
    assert(JSON.stringify(fact.bboxPoints) === JSON.stringify(region.bboxPoints), 'fact region drift');
  }
  assert(wound.primitiveOutcome === 'C' && !wound.exactPrimitiveProven && !wound.reuseDamagePipelineProven,
    'unproved resolved/equivalence claim');
  assert(wound.equivalentToDamage === null && wound.protectionApplies === null, 'unsupported wound mapping');
  assert(wound.multiWoundDeathblowCount === 1, 'p29 any-amount deathblow binding drift');
  const feasibility = artifacts['c1c18-damage-stone-feasibility.json'];
  assert(!feasibility.productionReady && !feasibility.damageStoneAdapterExists, 'Damage Stone promotion/adapter forbidden');
  for (const [level, count, total] of [[1, 7, 14], [2, 4, 11], [3, 4, 12]]) {
    const coverage = feasibility[`level${level}Coverage`];
    assert(coverage.productionReadyCount === count && coverage.sourceDefinitionCount === total && !coverage.completeForRandomDraw, 'Ready deck drift');
  }
  const ids = ['accuracy-stone', 'archers-ring', 'critical-stone', 'sages-book', 'survival-guide', 'warriors-bracer', 'warriors-cap'].map(n => `community-trinket-core-${n}`).sort();
  assert(JSON.stringify(feasibility.readySubset) === JSON.stringify(ids), 'Ready subset drift');
}
export function verifyContractGate() {
  assert(git('rev-parse', `${baselineHead}^`) === implementationAnchor, 'C1C17R exact baseline parent mismatch');
  assert(git('rev-parse', `${implementationAnchor}^{tree}`) === implementationTree, 'C1C17R implementation tree mismatch');
  git('merge-base', '--is-ancestor', baselineHead, 'HEAD');
  const oldPackage = JSON.parse(git('show', baselineHead + ':package.json'));
  const livePackage = JSON.parse(readFileSync('package.json', 'utf8'));
  oldPackage.scripts['audit:complete-edition-c1c18'] = 'vite-node scripts/audit/generate-complete-edition-c1c18.ts';
  oldPackage.scripts['verify:complete-edition-c1c18'] = 'vite-node scripts/audit/verify-complete-edition-c1c18.ts';
  assert(JSON.stringify(oldPackage) === JSON.stringify(livePackage), 'package scripts/dependencies changed outside contract commands');
  const allowed = (p: string) => /^scripts\/audit\/(?:c1c18-|(?:generate|verify|extract|test)-c1c18|(?:generate|verify)-complete-edition-c1c18)/.test(p)
    || /^docs\/(?:data|reports)\/complete-edition\/c1c18-/.test(p) || p === 'package.json';
  for (const args of [['diff', '--name-only', baselineHead], ['diff', '--cached', '--name-only']]) {
    assert(git(...args).split(/\r?\n/).filter(Boolean).every(allowed), 'contract phase changed forbidden source/history path');
  }
  const expected = buildContracts();
  const artifacts = Object.fromEntries(Object.keys(expected).map(n => [n, JSON.parse(readFileSync('docs/data/complete-edition/' + n, 'utf8'))]));
  const extraction = JSON.parse(readFileSync('docs/data/complete-edition/c1c18-rulebook-extracted-evidence.json', 'utf8'));
  validateArtifacts(artifacts, expected, extraction);
  const feasibility = artifacts['c1c18-damage-stone-feasibility.json'];
  for (const [path, hash] of Object.entries(feasibility.historicalEvidenceHashes)) assert(sha(readFileSync(path)) === hash, 'frozen source/history changed: ' + path);
  assert(extraction.pageCount === 44 && extraction.pages.length === 44, 'official research coverage incomplete');
  for (const term of ['Wound', 'Wounds', 'Damage', 'Health', 'HP', "Death's Door", 'Deathblow', 'take Damage', 'suffer Wounds']) {
    assert(Array.isArray(extraction.searchedTerms[term]), 'missing rulebook search: ' + term);
  }
  return { expected, artifacts, extraction };
}
