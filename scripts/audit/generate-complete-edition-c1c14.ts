import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { level2TerminalAudit } from '../../src/audit/level2-terminal-blockers';

const root = process.cwd();
const data = resolve(root, 'docs/data/complete-edition');
const report = resolve(root, 'docs/reports/complete-edition');
const baselineHead = 'd4c00cbccd5f4c495a6df208b59e23cdd9540433';
const voluntaryHead = '600eacd';
const healingHead = '1b41731';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const write = (name: string, value: unknown) => writeFileSync(resolve(data, name), `${JSON.stringify(value, null, 2)}\n`);
const sourcePaths = (ref: string) => git('ls-tree', '-r', '--name-only', ref, '--', 'docs/source', 'docs/DD_EN_COREBOX_RULES.pdf')
  .split(/\r?\n/).filter(Boolean);
const authoritativePaths = [...new Set([
  ...sourcePaths(voluntaryHead), ...sourcePaths(healingHead), ...sourcePaths('HEAD'),
  'docs/DD_EN_COREBOX_RULES.pdf', 'src/data/community-reference/trinkets/data.json',
])].sort();
function delta(prior: string) {
  return authoritativePaths.map((path) => {
    const trackedPrior = git('ls-tree', '-r', '--name-only', prior, '--', path) === path;
    const trackedNow = git('ls-tree', '-r', '--name-only', 'HEAD', '--', path) === path;
    const priorHash = trackedPrior ? sha(execFileSync('git', ['show', `${prior}:${path}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 })) : null;
    const currentHash = existsSync(resolve(root, path)) ? sha(readFileSync(resolve(root, path))) : null;
    return { path, trackedPrior, trackedNow, priorHash, currentHash,
      change: trackedPrior && trackedNow ? (priorHash === currentHash ? 'UNCHANGED' : 'CHANGED')
        : !trackedPrior && !trackedNow && currentHash ? 'LOCAL_SOURCE_WITHOUT_HISTORICAL_BLOB' : 'ADDED_OR_REMOVED' };
  });
}
const audit = level2TerminalAudit();
const voluntaryDelta = delta(voluntaryHead);
const healingDelta = delta(healingHead);
const relevantChanges = [...voluntaryDelta, ...healingDelta].filter((entry) => entry.change === 'CHANGED' || entry.change === 'ADDED_OR_REMOVED');
const sourceDelta = { schemaVersion: 1, phase: '11A.4-C1C-14', baselineHead,
  priorContracts: { voluntary: 'c1c7-voluntary-declaration-timing-contract.json', healing: 'c1c5r-chirurgeons-trigger-scope.json' },
  voluntary: { priorCommit: voluntaryHead, sourceSnapshot: voluntaryDelta, sourceDelta: relevantChanges.length ? 'REVIEW_REQUIRED' : 'NONE' },
  healing: { priorCommit: healingHead, sourceSnapshot: healingDelta, sourceDelta: relevantChanges.length ? 'REVIEW_REQUIRED' : 'NONE' },
  localRulebookNote: 'The rulebook PDF is present locally but not tracked at either prior commit; its historical bytes cannot be compared. The prior contracts already cite this same named source.',
  newlyAvailableRelevantAuthoritativeEvidence: relevantChanges,
  decision: relevantChanges.length ? 'REVIEW_SOURCE_DELTA' : 'PRESERVE_FAIL_CLOSED' };
if (relevantChanges.length) throw new Error(`New source candidates require review: ${JSON.stringify(relevantChanges)}`);
const meta = { schemaVersion: 1, phase: '11A.4-C1C-14', baselineHead,
  verifiedImplementationHead: git('rev-parse', 'HEAD'), verifiedImplementationTree: git('rev-parse', 'HEAD^{tree}') };
const capabilityMatrix = { ...meta, readyCount: audit.readyCount, notReadyCount: audit.notReadyCount,
  completeForRandomDraw: audit.completeForRandomDraw, readinessInvariantErrors: audit.readinessInvariantErrors,
  cards: audit.cards };
write('c1c14-source-delta.json', { ...meta, ...sourceDelta });
write('c1c14-level2-trinket-capability-matrix.json', capabilityMatrix);
write('c1c14-level2-terminal-blocker-register.json', { ...meta, blockers: audit.blockerRegister });
write('c1c14-level2-source-gap-register.json', { ...meta, gaps: [
  { id: 'generic-voluntary-declaration-domain', blockerCode: 'TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED',
    affectedCards: audit.blockerRegister.find((entry) => entry.blockerCode === 'VOLUNTARY_DECLARATION_RUNTIME')?.affectedCards,
    missingEvidence: ['legal declaration contexts', 'battle and non-battle insertion points', 'usage epoch', 'multiple-card ordering', 'save/replay semantics'],
    priorContract: 'c1c7-voluntary-declaration-timing-contract.json', status: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' },
  { id: 'chirurgeons-healing-trigger-scope', blockerCode: 'TRINKET_TRIGGER_SCOPE_UNRESOLVED',
    affectedCards: audit.blockerRegister.find((entry) => entry.blockerCode === 'TRINKET_TRIGGER_SCOPE_UNRESOLVED')?.affectedCards,
    missingEvidence: ['battle-only or all-healing scope', 'non-battle source and receiver applicability'],
    priorContract: 'c1c5r-chirurgeons-trigger-scope.json', status: 'SOURCE_UNRESOLVED' },
] });
write('c1c14-level2-runtime-opportunity-matrix.json', { ...meta,
  opportunities: audit.cards.flatMap((card) => card.sides.map((side) => ({ card: card.printedName, definitionId: card.definitionId, ...side }))),
  proposedTasks: [
    { task: 'generic-voluntary-runtime-without-source-closure', readyGainIfImplementedAlone: 0, status: 'INVALID_SOURCE_ASSUMPTION', priority: 'P4' },
    { task: 'movement-modifier-and-consumer', readyGainIfImplementedAlone: 0, status: 'RUNTIME_DEFERRED_BEHIND_SOURCE_GATE', priority: 'P3' },
    { task: 'voluntary-dodge-consumer', readyGainIfImplementedAlone: 0, status: 'CONTEXT_SPECIFIC_CONSUMER_NOT_GENERIC', priority: 'P3' },
    { task: 'expand-chirurgeon-healing-surfaces-without-source-closure', readyGainIfImplementedAlone: 0, status: 'INVALID_SOURCE_ASSUMPTION', priority: 'P4' },
  ] });
const healingSurfaces = [
  ['battle-healing-skill', 'battle.ts / trinkets/healing-trinket-bridge.ts', 'battle', true, true, true, true, 'IN_SCOPE'],
  ['campaign-resolve-healing', 'healing.ts resolveHealing()', 'campaign', false, true, true, false, 'SOURCE_UNRESOLVED'],
  ['resting-point-life-recovery', 'campaign/act-four/excavation-site.ts', 'rest', false, true, true, false, 'SOURCE_UNRESOLVED'],
  ['provision-caused-healing', 'No direct current caller found', 'dungeon', false, false, false, false, 'SOURCE_UNRESOLVED'],
  ['trinket-caused-healing', 'trinkets/use-trinket.ts', 'campaign', false, true, true, false, 'SOURCE_UNRESOLVED'],
  ['hamlet-healing', 'hamlet.ts Sanitarium', 'hamlet', false, true, true, false, 'SOURCE_UNRESOLVED'],
  ['quest-or-reward-healing', 'campaign/act-four/excavation-site.ts; quirks.ts', 'quest', false, true, true, false, 'SOURCE_UNRESOLVED'],
  ['battle-non-skill-healing', 'mental-effects.ts; campaign/act-four/community-final-combat.ts', 'battle', 'VARIES', true, true, false, 'SOURCE_UNRESOLVED'],
  ['debug-or-migration', 'No direct healing caller found', 'debug', false, false, false, false, 'NOT_APPLICABLE'],
] as const;
write('c1c14-healing-runtime-surface.json', { ...meta, surfaces: healingSurfaces.map((row) => ({
  surfaceId: row[0], caller: row[1], phase: row[2], healerIdentityAvailable: row[3], receiverIdentityAvailable: row[4],
  sourceDescribedAsHealing: row[5], passesTrinketWindow: row[6], sourceScopeStatus: row[7] })) });
write('c1c14-source-gap-freeze.json', { ...meta,
  voluntaryDeclaration: { previousPhase: 'C1C7', status: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', sourceDeltaSincePrior: 'NONE' },
  chirurgeonHealingScope: { previousPhase: 'C1C5R', status: 'SOURCE_UNRESOLVED', sourceDeltaSincePrior: 'NONE' } });
const verdict = `C1C14-LEVEL2-BLOCKER-CONSOLIDATION-ACCEPTED-READY-${audit.readyCount}-OF-${audit.cards.length}-SOURCE-GATED`;
writeFileSync(resolve(report, 'c1c14-level2-blocker-consolidation-report.md'), `# C1C14 Level 2 blocker consolidation\n\nVerdict: **${verdict}**\n\nUnder the currently locked authoritative source set, Level 2 production readiness is source-gated at **${audit.readyCount} / ${audit.cards.length}**. ${audit.notReadyCount} cards remain unready; random draw stays locked. Readiness invariants: ${audit.readinessInvariantErrors.length}.\n\n## Dependency and development decision\n\nGeneric voluntary declaration timing affects six of the seven remaining cards: Bloodthirst Ring, Book of Constitution, Book of Holiness, Book of Relaxation, Fortunate Armlet, and Protective Padlock. The C1C7 timing contract remains unresolved. It blocks a generic runtime window, which in turn blocks voluntary effects and context-specific consumers. Movement affects Constitution and Padlock but its isolated implementation promotes **0** cards. Book of Relaxation's Dodge modifier cannot borrow the incoming-attack-only Camouflage consumer.\n\nChirurgeon's Charm is independent. Both sides have implemented battle-healing slices and proofs; the source still does not establish whether their triggers cover other healing surfaces. A complete scope ruling could allow re-evaluation, including a proof-only promotion if battle-only is established. Expanding healing to Rest, Hamlet, Provisions, or Trinkets now would assert an unsupported rule.\n\nFive cards have an implemented side and a source-blocked sibling: Bloodthirst, Constitution, Holiness, Fortunate, and Protective. Chirurgeon has two battle-complete but scope-incomplete sides. Relaxation remains largely unimplemented behind timing.\n\nThe source delta compares tracked source documents and card normalization at the C1C7 and C1C5R anchors with the current tree. No relevant tracked source changed. The local rulebook was not tracked at those anchors, so historical PDF bytes are not comparable; its named source was already assessed in both prior contracts. The designer FAQ remains unavailable as rule text. The result preserves the prior fail-closed decisions.\n\n## Reopening criteria\n\nNew authoritative evidence must define generic declaration contexts, insertion points, usage epoch, ordering, and save/replay semantics before C1C15 Generic Voluntary Declaration Runtime. A complete healing trigger-scope ruling can instead open C1C15 Chirurgeon Scope Closure. Until then, stop Level 2 speculative runtime work and move to source-complete work elsewhere.\n\nImplementation anchor: \`${meta.verifiedImplementationHead}\` (tree \`${meta.verifiedImplementationTree}\`).\n`);
console.log(JSON.stringify({ verdict, readyCount: audit.readyCount, notReadyCount: audit.notReadyCount, sourceDelta: 'NONE' }));
