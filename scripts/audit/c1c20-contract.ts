import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { buildCoreTerminalAudit, assertCoreTerminalAudit } from '../../src/audit/core-trinket-terminal-blockers';
import { getTrinketPoolByLevel, runtimeContentContext } from '../../src/data/content-selector';
import { createNewCampaign } from '../../src/game-engine/campaign';
import { git, sha, frozenHash, officialHash } from './c1c19-contract';

export { git, sha };
export const historyHash = (path: string, bytes: Buffer) => path.startsWith('scripts/audit/') && /\.(?:ts|mjs|py)$/.test(path)
  ? sha(bytes.toString('utf8').replace(/\r\n/g, '\n')) : frozenHash(path, bytes);
export const baselineHead = '78d2899c4b6a9ee7a5343e4ce2131dc4b0d8068d';
export const baselineTree = '0c2f6a142155f22c92a781157efaf1f54712d562';
export const verdict = 'C1C20-CORE-TRINKET-TERMINAL-BLOCKER-CONSOLIDATION-ACCEPTED-SOURCE-GATED-15-OF-37';
const meta = { schemaVersion: 1, phase: '11A.4-C1C-20', baselineHead, baselineTree };
export const trackedPrior = (...roots: string[]) => git('ls-tree', '-r', '--name-only', baselineHead, '--', ...roots).split(/\r?\n/).filter(Boolean);
const blob = (path: string) => execFileSync('git', ['show', `${baselineHead}:${path}`], { maxBuffer: 128 * 1024 * 1024 });
export function historicalFreeze() {
  return Object.fromEntries(trackedPrior('docs/data/complete-edition', 'docs/reports/complete-edition', 'scripts/audit', 'src/audit').sort()
    .map(path => [path, historyHash(path, blob(path))]));
}
function files(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${root}/${e.name}`) : e.isFile() ? [`${root}/${e.name}`] : []);
}
export function scanSourceDelta() {
  const priorPaths = trackedPrior('docs/source', 'src/data/community-reference/trinkets', 'docs/data/complete-edition/trinkets',
    'docs/data/complete-edition/complete-edition-raw-inventory.json', 'docs/data/complete-edition/c1a-rulebook-evidence.json',
    'docs/data/complete-edition/c1a-asset-manifest.json', 'docs/data/complete-edition/c1a-source-review-lock.json',
    'src/assets/community-reference/complete-edition/trinkets/core');
  const available = [...files('docs/source'), ...files('src/data/community-reference/trinkets'), ...files('docs/data/complete-edition/trinkets'),
    ...files('src/assets/community-reference/complete-edition/trinkets/core'),
    ...files('docs').filter(p => !p.startsWith('docs/data/') && !p.startsWith('docs/reports/')
      && (/\.pdf$/i.test(p) || /faq|errata|clarification|reference.card/i.test(p))),
    ...files('.artifacts').filter(p => /3657612854|Source_Intake|Source_Extraction|faq|errata|clarification|rulebook|reference.card/i.test(p)
      && /\.(?:pdf|json|md|txt)$/i.test(p)),
    ...(process.env.COMPLETE_EDITION_TTS && existsSync(process.env.COMPLETE_EDITION_TTS) ? [process.env.COMPLETE_EDITION_TTS.replace(/\\/g, '/')] : [])];
  const paths = [...new Set([...priorPaths, ...available])].sort();
  const inventory = JSON.parse(readFileSync('docs/data/complete-edition/complete-edition-raw-inventory.json', 'utf8')).sourceInputs;
  const rows = paths.map(path => {
    const priorHash = priorPaths.includes(path) ? sha(blob(path))
      : /DD_EN_COREBOX_RULES\.pdf$/i.test(path) ? officialHash
        : inventory.find((i: {name: string}) => path.endsWith('/' + i.name))?.sha256 ?? null;
    const currentHash = existsSync(path) ? sha(readFileSync(path)) : null;
    return { path, baselineSha256: priorHash, currentSha256: currentHash,
      baselineBinding: priorPaths.includes(path) ? 'C1C19_GIT_BLOB' : priorHash ? 'FROZEN_SOURCE_INPUT_HASH' : 'NO_PRIOR_BINDING',
      change: priorHash === currentHash && currentHash !== null ? 'UNCHANGED' : currentHash === null ? 'MISSING' : priorHash === null ? 'NEW_CANDIDATE_REQUIRES_REVIEW' : 'CHANGED_REQUIRES_REVIEW' };
  });
  const changes = rows.filter(r => r.change !== 'UNCHANGED');
  const faq = JSON.parse(readFileSync('docs/source/darkest-dungeon-designer-faq/source-provenance.json', 'utf8'));
  return { ...meta, scope: 'Current locally available locked source set; no claim of exhaustive worldwide publication discovery',
    scanRoots: ['docs/source', 'docs (PDF/FAQ/errata/clarification/reference candidates)', 'src/data/community-reference/trinkets',
      'docs/data/complete-edition/trinkets', 'src/assets/community-reference/complete-edition/trinkets/core', '.artifacts (source candidates)', 'COMPLETE_EDITION_TTS if supplied'],
    sourceDelta: changes.length === 0 ? 'NONE' : 'REVIEW_REQUIRED', snapshot: rows, changedCandidates: changes,
    originalInputs: inventory.map((i: {name: string; role: string; sha256: string}) => ({ ...i,
      locallyComparedPaths: rows.filter(r => r.path.endsWith('/' + i.name)).map(r => r.path),
      binding: rows.some(r => r.path.endsWith('/' + i.name)) ? 'CURRENT_BYTES_COMPARED' : 'FROZEN_NORMALIZED_EXTRACTION_ONLY; raw original not reacquired' })),
    faqAcquisitionStatus: faq.acquisitionStatus, faqBinaryAvailable: faq.fileHash !== null,
    newRulebook: false, newFaq: false, newErrata: false, newReferenceCard: false, newTtsRuleObject: false, newOfficialClarification: false,
    decision: changes.length === 0 ? 'INHERIT_FROZEN_CONTRACTS_WITHOUT_REINTERPRETATION' : 'STOP_AND_REVIEW_NEW_OR_CHANGED_SOURCE' };
}
export function buildArtifacts() {
  const audit = buildCoreTerminalAudit();
  assertCoreTerminalAudit(audit);
  const sourceDelta = scanSourceDelta();
  if (sourceDelta.sourceDelta !== 'NONE') throw new Error('C1C20 source delta requires new review: ' + JSON.stringify(sourceDelta.changedCandidates));
  const context = runtimeContentContext(createNewCampaign('community-complete-edition'));
  const readySubsets = ([1, 2, 3] as const).map(level => ({ level, enabled: true,
    ids: getTrinketPoolByLevel(context, level).filter(t => t.id.startsWith('community-trinket-core-')).map(t => t.id).sort() }));
  return {
    'c1c20-core-trinket-coverage.json': { ...meta, ...audit.coverage, cards: audit.cards, readySubsets,
      historicalEvidenceHashes: historicalFreeze(), hashPolicy: 'Evidence byte-exact; src/audit TS and scripts/audit source code normalized to LF for Windows checkout parity', verdict },
    'c1c20-core-trinket-terminal-blocker-register.json': { ...meta, cards: audit.blocked,
      rootPartition: audit.coverage.rootPartition, immediateRuntimeOnlyReadyGain: audit.coverage.immediateWholeCardRuntimeCandidates },
    'c1c20-core-source-gap-register.json': { ...meta, gaps: audit.groups, sourceDelta: sourceDelta.sourceDelta },
    'c1c20-core-runtime-roi-matrix.json': { ...meta, rows: audit.runtimeRoi,
      counterfactualPolicy: 'Current gain is computed through upstream gate reachability. Source closure only reopens evaluation; no automatic promotions or invented future proof. Empty source-closed promotion lists mean none demonstrated, not forever impossible.',
      immediateRuntimeOnlyReadyGain: audit.coverage.immediateWholeCardRuntimeCandidates },
    'c1c20-core-source-delta.json': sourceDelta,
  };
}
