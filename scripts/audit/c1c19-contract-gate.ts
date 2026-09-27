import { readFileSync } from 'node:fs';
import { baselineHead, baselineTree, c1c17Implementation, official, officialHash, ids, git, sha, frozenHash, buildContracts, tracked } from './c1c19-contract';

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('C1C19: ' + message);
}
const equal = (a: unknown, b: unknown, message: string) => assert(JSON.stringify(a) === JSON.stringify(b), message);
export function validateArtifacts(artifacts: Record<string, any>, expected: Record<string, any>, extraction: any) {
  const source = artifacts['c1c19-hero-caused-condition-source-contract.json'];
  assert(source.outcome === 'C' && source.resolutionStatus === 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', 'unsupported timing resolution');
  assert(extraction.sourceSha256 === officialHash && sha(readFileSync(official)) === officialHash, 'official PDF hash drift');
  for (const fact of source.facts) {
    const region = extraction.pages[fact.page - 1]?.regions.find((r: any) => r.region === fact.region);
    const compact = (s: string) => s.replace(/\s+/g, ' ').trim();
    assert(fact.source === official && fact.sourceSha256 === officialHash, 'unbound official fact source');
    assert(region && fact.requiredText.every((text: string) => compact(region.text).includes(compact(text))), 'official extracted fact missing: ' + fact.factId);
    equal(fact.bboxPoints, region.bboxPoints, 'official fact region drift');
  }
  equal(source.cards.map((c: any) => c.definitionId), ids, 'four Charm inventory drift');
  const conditions = ['bleed', 'blight', 'debuff', 'stun'];
  const sourceIndexes = [12, 10, 6, 3];
  for (const [index, card] of source.cards.entries()) {
    const condition = conditions[index];
    equal(card.sourceReferences, [`c1a-source:tts-path:/ObjectStates/59/ContainedObjects/${sourceIndexes[index]}`], 'Charm source identity drift');
    assert(card.sourceStatus === 'source-supported' && card.unresolvedFields.length === 0, 'literal recognition drift');
    assert(card.positive.trigger === 'hero-skill-hits' && card.positive.target === 'skill-target', 'Positive is not skill-target');
    equal(card.positive.effects, [{ kind: 'apply-condition-stack', condition, turns: condition === 'stun' ? 1 : 2, amount: index < 2 ? 2 : null }], 'Charm magnitude/duration drift');
    assert(card.negative.trigger === 'hero-causes-condition' && card.negative.target === 'condition-being-caused', 'Negative target/trigger drift');
    equal(card.negative.effects, [{ kind: 'modify-condition-duration', turns: -1 }], 'Negative changes anything but duration');
    equal(card.negative.conditions, [], 'invented same-named condition restriction');
    for (const visual of card.visualEvidence) assert(visual.actualAssetSha256 === visual.recordedAssetSha256, 'literal image/provenance hash drift');
  }
  assert(!source.positive.exactTargetMatch && source.positive.exactInsertionPoint === null && source.positive.deadTargetApplicable === null, 'speculative Positive stage/death policy');
  assert(source.negative.percentageResistanceOrdering === null && source.negative.categoricalResistanceOrdering === null
    && source.negative.immunityOrdering === null && source.negative.resistedConditionCountsAsCaused === null, 'invented resistance/causation ordering');
  assert(source.negative.sourceTarget === 'condition-being-caused' && !source.negative.sameNamedConditionOnly
    && source.negative.singularCondition && !source.negative.appliesToAllConditionsWithOneUse, 'wrong duration target/scope/multi-condition semantics');
  assert(source.positive.sourceTarget === 'skill-target', 'skill-target replaced with skill');
  assert(!source.physicalCards.recursionAllowed && !source.physicalCards.samePhysicalCardSameBattleTurnDoubleUse, 'same physical card double-use');
  const duration = artifacts['c1c19-condition-duration-modifier-contract.json'];
  assert(duration.minimumDuration === null && duration.zeroDurationApplication === null && !duration.magnitudeModified, 'invented zero/floor/potency semantics');
  const surface = artifacts['c1c19-hero-condition-runtime-surface.json'];
  const gaps = artifacts['c1c19-hero-skill-condition-source-gap.json'];
  const expectedGaps = surface.heroSkillConditions.filter((c: any) => c.durationTurns === null);
  equal(surface.conditionCallsites, expected['c1c19-hero-condition-runtime-surface.json'].conditionCallsites, 'condition caller omitted or changed');
  equal(gaps.gaps.map((c: any) => `${c.skillId}:${c.effectIndex}`), expectedGaps.map((c: any) => `${c.skillId}:${c.effectIndex}`), 'incomplete legacy duration census');
  assert(gaps.gaps.every((c: any) => c.sourceDuration === null && c.runtimeDuration === null && !c.reconstructionAuthorized), 'duration inferred from amount');
  const debuff = artifacts['c1c19-debuff-duration-contract.json'];
  assert(debuff.sourceDurationStatus === 'SOURCE_BOUND' && debuff.runtimeStatus === 'NOT_IMPLEMENTED'
    && !debuff.runtimeTurnTick && !debuff.runtimeExpiration && !debuff.runtimePercentDebuffResistanceConsumer, 'Debuff source/runtime gap misclassified');
  const feasibility = artifacts['c1c19-condition-charm-feasibility.json'];
  assert(!feasibility.productionImplementationAuthorized && feasibility.productionReadyGain === 0, 'speculative/Positive-only promotion');
  for (const card of feasibility.cards) {
    assert(!card.adapterExists && !card.productionReady && !card.positive.implementationPossibleNow && !card.negative.implementationPossibleNow, 'Charm adapter/Ready promotion');
  }
  for (const [level, count, total] of [[1, 7, 14], [2, 4, 11], [3, 4, 12]]) {
    const coverage = feasibility[`level${level}Coverage`];
    assert(coverage.productionReadyCount === count && coverage.sourceDefinitionCount === total && !coverage.completeForRandomDraw, 'Ready count drift');
  }
  equal(feasibility.readySubset, ['accuracy-stone', 'archers-ring', 'critical-stone', 'sages-book', 'survival-guide', 'warriors-bracer', 'warriors-cap'].map(c => `community-trinket-core-${c}`).sort(), 'Ready selector drift');
  assert(!feasibility.damageStoneFrozen.adapterExists && !feasibility.damageStoneFrozen.productionReady, 'Damage Stone drift');
  equal(artifacts, expected, 'contract/source/runtime binding drift');
}
export function verifyContractGate() {
  assert(git('rev-parse', `${baselineHead}^{tree}`) === baselineTree, 'exact C1C18 baseline tree mismatch');
  assert(git('rev-parse', `${baselineHead}^`) === 'd7bd56c65db32ef0cb8aa2a2c365c27f1df95b18', 'C1C18 lineage drift');
  git('merge-base', '--is-ancestor', baselineHead, 'HEAD');
  git('merge-base', '--is-ancestor', c1c17Implementation, baselineHead);
  const allowed = (path: string) => /^scripts\/audit\/(?:c1c19-|(?:extract|test)-c1c19|(?:generate|verify)-complete-edition-c1c19)/.test(path)
    || /^docs\/(?:data|reports)\/complete-edition\/c1c19-/.test(path) || path === 'package.json';
  for (const args of [['diff', '--name-only', baselineHead], ['diff', '--cached', '--name-only']]) {
    assert(git(...args).split(/\r?\n/).filter(Boolean).every(allowed), 'production/historical/C1C18 changes forbidden');
  }
  const baselinePackage = JSON.parse(git('show', baselineHead + ':package.json'));
  baselinePackage.scripts['audit:complete-edition-c1c19'] = 'vite-node scripts/audit/generate-complete-edition-c1c19.ts';
  baselinePackage.scripts['verify:complete-edition-c1c19'] = 'vite-node scripts/audit/verify-complete-edition-c1c19.ts';
  equal(JSON.parse(readFileSync('package.json', 'utf8')), baselinePackage, 'unrelated package/script/dependency mutation');
  const expected = buildContracts();
  const artifacts = Object.fromEntries(Object.keys(expected).map(name => [name, JSON.parse(readFileSync('docs/data/complete-edition/' + name, 'utf8'))]));
  const extraction = JSON.parse(readFileSync('docs/data/complete-edition/c1c19-rulebook-extracted-evidence.json', 'utf8'));
  validateArtifacts(artifacts, expected, extraction);
  assert(extraction.pageCount === 44 && extraction.pages.length === 44, 'incomplete rulebook search');
  for (const term of ['Condition', 'duration', 'stack', 'Resistance', 'Immunity', 'additional', 'causing', 'hit', 'Trinket', 'zero', '0 turns']) {
    assert(Array.isArray(extraction.searchedTerms[term]), 'missing source search term: ' + term);
  }
  const freeze = artifacts['c1c19-condition-charm-feasibility.json'].c1c18AndEarlierEvidenceHashes;
  for (const path of tracked('docs/data/complete-edition', 'docs/reports/complete-edition')) assert(freeze[path], 'historical inventory omission: ' + path);
  for (const [path, hash] of Object.entries(freeze)) assert(frozenHash(path, readFileSync(path)) === hash, 'historical/source evidence changed: ' + path);
  return { artifacts, expected, extraction };
}
