import { validateArtifacts, verifyContractGate } from './c1c19-contract-gate';
const { artifacts, expected, extraction } = verifyContractGate();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Mutation = (artifacts: Record<string, any>, extraction: any) => void;
const mutations: Array<[string, Mutation]> = [
  ['duration = amount', a => { const gap = a['c1c19-hero-skill-condition-source-gap.json'].gaps[0]; gap.sourceDuration = gap.amount; gap.runtimeDuration = gap.amount; }],
  ['Negative same-named condition only', a => { a['c1c19-hero-caused-condition-source-contract.json'].negative.sameNamedConditionOnly = true; }],
  ['Negative targets equipped Hero', a => { a['c1c19-hero-caused-condition-source-contract.json'].cards[0].negative.target = 'equipped-hero'; }],
  ['Positive targets skill', a => { a['c1c19-hero-caused-condition-source-contract.json'].cards[0].positive.target = 'skill'; }],
  ['invent categorical ordering', a => { a['c1c19-hero-caused-condition-source-contract.json'].negative.categoricalResistanceOrdering = 'CHARM_FIRST'; }],
  ['invent percentage ordering', a => { a['c1c19-hero-caused-condition-source-contract.json'].negative.percentageResistanceOrdering = 'AFTER_ROLL'; }],
  ['invent immunity ordering', a => { a['c1c19-hero-caused-condition-source-contract.json'].negative.immunityOrdering = 'BEFORE_CHARM'; }],
  ['resisted counts as definitely caused', a => { a['c1c19-hero-caused-condition-source-contract.json'].negative.resistedConditionCountsAsCaused = true; }],
  ['Debuff falsely implemented', a => { a['c1c19-debuff-duration-contract.json'].runtimeStatus = 'IMPLEMENTED'; a['c1c19-debuff-duration-contract.json'].runtimeExpiration = true; }],
  ['invent 0-turn cancellation', a => { a['c1c19-condition-duration-modifier-contract.json'].zeroDurationApplication = 'DO_NOT_APPLY'; }],
  ['invent floor rule', a => { a['c1c19-condition-duration-modifier-contract.json'].minimumDuration = 0; }],
  ['physical recursion allowed', a => { a['c1c19-hero-caused-condition-source-contract.json'].physicalCards.recursionAllowed = true; }],
  ['one Use affects all Conditions', a => { a['c1c19-hero-caused-condition-source-contract.json'].negative.appliesToAllConditionsWithOneUse = true; }],
  ['Ready count changed', a => { a['c1c19-condition-charm-feasibility.json'].level1Coverage.productionReadyCount = 11; }],
  ['omit legacy gap', a => { a['c1c19-hero-skill-condition-source-gap.json'].gaps.pop(); }],
  ['rulebook fact region substituted', a => { a['c1c19-hero-caused-condition-source-contract.json'].facts[0].page = 21; }],
  ['tamper extracted fact', (_a, e) => { e.pages[19].regions[1].text = ''; }],
  ['promote Positive only', a => { a['c1c19-condition-charm-feasibility.json'].cards[0].positive.implementationPossibleNow = true; }],
  ['Stun null becomes source amount 1', a => { a['c1c19-hero-caused-condition-source-contract.json'].cards[3].positive.effects[0].amount = 1; }],
  ['restore purported exact timing', a => { a['c1c19-hero-caused-condition-source-contract.json'].positive.exactInsertionPoint = 'before-damage-applied'; }],
];
// Alter the mirror too: these cases must fail source/semantic invariants, not just JSON inequality.
for (const [name, mutate] of mutations) {
  const candidate = clone(artifacts), mirror = clone(expected), evidence = clone(extraction);
  mutate(candidate, evidence);
  mutate(mirror, clone(extraction));
  let rejected = false;
  try { validateArtifacts(candidate, mirror, evidence); } catch { rejected = true; }
  if (!rejected) throw new Error('C1C19 semantic mutation falsely passed: ' + name);
}
// Inventory omission is also bound independently to a fresh live scan.
const omitted = clone(artifacts);
omitted['c1c19-hero-condition-runtime-surface.json'].conditionCallsites.pop();
let rejected = false;
try { validateArtifacts(omitted, expected, extraction); } catch { rejected = true; }
if (!rejected) throw new Error('C1C19 caller inventory omission accepted');
console.log(`C1C19 live source/contract gate and ${mutations.length + 1} adversarial mutations passed`);
