import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { git, load, root, sha256 } from './c1c25-contract';
import { categories } from './c1c26-contract';

export { categories };
export const baselineHead = '8db6c64334a7c5ca95e75ef4de201329251cc634';
const prefix = 'c1c27-necromancer-';
const assert = (v: unknown, m: string) => { if (!v) throw new Error('C1C27: ' + m); };
const hash = (p: string) => sha256(readFileSync(p));
const inherited = (n: string) => load('c1c26-necromancer-' + n + '.json');
export const allowedAuthority = ['AUTHORITATIVE_VERIFIED', 'OFFICIAL_BUT_VERSION_UNVERIFIED', 'TRANSPORT_MIRROR_VERIFIED_BYTES'];

// Authority is a proved relationship, never a property inferred from HTTP success.
export function isClosureAuthority(s: any): boolean {
  if (!s || !allowedAuthority.includes(s.authorityStatus) || !s.contentSha256 || !s.originalBytesPath ||
    !s.provenanceEvidence?.length || s.authenticatedRuleContent !== true) return false;
  if (s.authorityStatus === 'TRANSPORT_MIRROR_VERIFIED_BYTES') return !!s.byteEquality?.knownAuthoritySourceId &&
    s.byteEquality.originalSha256 === s.contentSha256 && s.byteEquality.mirrorSha256 === s.contentSha256;
  return s.provenanceVerified === true;
}
export function canExhaust(e: any, sources: any[]): boolean {
  const fields = ['allKnownRulebooksChecked', 'allKnownErrataChecked', 'designerFaqCheckedOrAuthenticatedUnavailable',
    'officialComponentReferencesChecked', 'laterRevisionLeadsChecked', 'relevantPrintedComponentsChecked', 'publisherClarificationPathsChecked', 'noUnexaminedAuthoritativeLead'];
  return !!e && fields.every(k => e[k] === true) && e.exhaustionEvidenceIds?.length > 0 &&
    !sources.some(s => s.pendingAuthority === true) && e.accessFailuresAsExhaustionProof !== true &&
    e.exhaustionEvidenceIds.every((id: string) => e.exhaustionEvidenceRecords?.some((r: any) => r.evidenceId === id && r.verified === true &&
      ['AUTHENTICATED_CORPUS_REVIEW', 'AUTHENTICATED_PERMANENT_UNAVAILABILITY'].includes(r.kind) && r.proofReferences?.length > 0)) &&
    fields.every(k => e.exhaustionEvidenceRecords?.some((r: any) => e.exhaustionEvidenceIds.includes(r.evidenceId) && r.covers?.includes(k)));
}
export function structuredTie(t: any): boolean {
  return !!t && Array.isArray(t.tieParticipants) && t.tieParticipants.length > 0 && typeof t.tieBreakAuthority === 'string' &&
    ['reroll', 'playerChoice', 'activePlayer', 'firstPlayer', 'random', 'simultaneous'].every(k => typeof t[k] === 'boolean') &&
    typeof t.algorithm === 'string' && t.algorithm.length > 0 && t.sourceEvidenceIds?.length > 0;
}
export function deriveDecision(topics: any[], slices: any[], sources: any[], prerequisitesComplete = false) {
  const remaining = topics.filter(t => t.status !== 'RESOLVED');
  const terminal = remaining.length > 0 && remaining.every(t => t.status === 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' && canExhaust(t.exhaustionEvidence, sources));
  const partial = slices.some(s => s.sourceStatus === 'SOURCE_COMPLETE_RUNTIME_MISSING' && s.completeGameplaySlice === true &&
    s.productionValidationPossible === true && s.nonReachableGateProven === true && s.reachableBlockerCategories?.length === 0 &&
    s.productionProofEvidenceIds?.length > 0 && s.reachabilityEvidenceIds?.length > 0 && s.expectedProductionReadyGain > 0);
  const full = topics.length === categories.length && remaining.length === 0 && prerequisitesComplete;
  const outcome = full ? 'NECROMANCER_RUNTIME_FOUNDATION_SELECTED' : partial ? 'NECROMANCER_PARTIAL_RUNTIME_FOUNDATION_SELECTED' :
    terminal ? 'NECROMANCER_TERMINAL_BLOCKER_CONSOLIDATION' : 'NECROMANCER_SOURCE_CLOSURE_CONTINUATION';
  return { selectedFamily: 'Necromancer', outcome, runtimeFoundationAllowed: full || partial, partialScopeAllowed: partial && !full,
    nextPhase: 'C1C28', nextAction: full ? 'C1C28 Necromancer Runtime Foundation' : partial ? 'C1C28 Necromancer Partial Runtime Foundation' :
      terminal ? 'C1C28 Necromancer Terminal Blocker Consolidation' : 'C1C28 Necromancer Source Closure Continuation',
    verdict: 'NEXT-' + outcome.replace(/_/g, '-'), reassessOtherFamiliesAllowed: false,
    remainingCategories: remaining.map(t => t.category), terminalCategories: remaining.filter(t => t.status === 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' && canExhaust(t.exhaustionEvidence, sources)).map(t => t.category) };
}

export function buildArtifacts(): Record<string, any> {
  const a: Record<string, any> = {};
  const retrieval = load('c1c27-source-retrieval-evidence.json');
  const discovery = load('c1c27-source-discovery-review.json');
  const inputNames = git('ls-tree', '-r', '--name-only', baselineHead, '--', root).split(/\r?\n/).filter(p => /\/c1c26-.*\.json$/.test(p));
  const inputPaths = [...inputNames, root + 'c1c27-source-retrieval-evidence.json', root + 'c1c27-source-discovery-review.json'];
  const meta = { schemaVersion: 1, phase: '11A.4-C1C27', family: 'Necromancer', baselineHead, runtimeImplemented: false,
    inputSha256: Object.fromEntries(inputPaths.map(p => [p, hash(p)])) };
  const put = (name: string, body: any) => { a[prefix + name + '.json'] = { ...meta, ...body }; };
  const copy = (name: string) => { const { schemaVersion, phase, family, baselineHead, runtimeImplemented, inputSha256, ...body } = inherited(name); return body; };
  const lockedHash = hash('docs/DD_EN_COREBOX_RULES.pdf');
  const sources: any[] = [{ sourceId: 'locked-core-rulebook', title: 'Darkest Dungeon Core Box Rules', sourceType: 'CORE_RULEBOOK',
    publisher: 'Mythic Games', designer: null, originalHost: null, currentHost: 'repository', retrievalMethod: 'INHERITED_LOCKED_SOURCE',
    retrievalStatus: 'INHERITED_CHECKED_C1C26', contentSha256: lockedHash, originalBytesPath: 'docs/DD_EN_COREBOX_RULES.pdf',
    knownOriginalFilename: 'DD_EN_COREBOX_RULES.pdf', knownOriginalDate: null, version: null,
    provenanceEvidence: [root + 'c1c19-rulebook-extracted-evidence.json', root + 'c1c26-necromancer-frozen-baseline-contracts.json'],
    provenanceVerified: true, authenticatedRuleContent: true, authorityStatus: 'AUTHORITATIVE_VERIFIED', pendingAuthority: false,
    scope: 'Inherited accepted core clauses only; not a later revision or new acquisition' }];
  for (const r of retrieval.receipts) {
    const id = r.candidateId;
    const pdfComplete = r.exitCode === 0 && r.httpStatus === 200 && r.contentType?.includes('application/pdf') && r.responsePath && readFileSync(r.responsePath).subarray(0, 5).toString() === '%PDF-';
    const equal = pdfComplete && r.responseSha256 === lockedHash;
    const designer = id.startsWith('designer');
    const community = ['house-rule-lead', 'wargamer-distribution', 'tts-discovery', 'tts-community-complete'].includes(id);
    sources.push({ sourceId: id, title: id.startsWith('designer-faq') ? 'Darkest Dungeon the Board Game FAQ by the Designers' : r.candidateIdentity.description,
      sourceType: r.candidateIdentity.sourceType, publisher: id.startsWith('publisher') ? 'Mythic Games (historical domain only)' : null,
      designer: designer ? 'Nick Niotis / Argyris Poungouras (listing claim; exact uploader association unverified)' : null,
      uploader: designer ? 'apoxwrhthrio1980' : id.startsWith('faq-mirror') ? 'LilG' : id.startsWith('production-') && !id.includes('drive') ? 'yoyoboy170' : null,
      originalHost: designer ? 'boardgamegeek.com' : id.includes('mirror') ? null : new URL(r.url).host,
      currentHost: new URL(r.effectiveUrl ?? r.url).host, downloadSource: r.url, retrievalMethod: 'curl.exe ordinary public HTTPS; indexed discovery reviewed separately',
      retrievalStatus: r.failureClass, contentSha256: pdfComplete ? r.responseSha256 : null, originalBytesPath: pdfComplete ? r.responsePath : null,
      responseSha256: r.responseSha256, knownOriginalFilename: equal ? 'DD_EN_COREBOX_RULES.pdf' : null,
      filenameLead: id.startsWith('faq-mirror') ? 'DD_FAQ_EN (preview save label; not authenticated original filename)' : null,
      knownOriginalDate: null, version: null, provenanceEvidence: [r.evidenceId, ...discovery.reviews.filter((v: any) => v.candidateId === id || v.candidateIds?.includes(id)).map((v: any) => v.id)],
      provenanceVerified: !!equal, authenticatedRuleContent: !!equal,
      authorityStatus: equal ? 'TRANSPORT_MIRROR_VERIFIED_BYTES' : id === 'publisher-root' ? 'REJECTED' : community ? 'COMMUNITY_ONLY' : 'UNAUTHENTICATED_LEAD',
      byteEquality: equal ? { knownAuthoritySourceId: 'locked-core-rulebook', originalSha256: lockedHash, mirrorSha256: r.responseSha256 } : null,
      pendingAuthority: !equal && !community && id !== 'publisher-root' && id !== 'rulebook-mirror-gamershq',
      reason: equal ? 'Complete response equals already checked locked original bytes; no new revision or rules.' :
        id === 'publisher-root' ? 'Current HTTP 200 body is unrelated gambling content; reject publisher identity.' :
        pdfComplete ? 'Complete PDF acquired but no authenticated original-byte equality or provenance; lead only.' : 'Transport/index/preview response does not authenticate original rule content.' });
  }
  a['c1c27-authoritative-source-authentication.json'] = { ...meta, sources, closureEligibleAuthorityStatuses: allowedAuthority,
    designerFaqAcquiredAndAuthenticated: sources.some(s => s.sourceType === 'DESIGNER_FAQ' && isClosureAuthority(s)),
    laterOfficialClarificationAcquired: false, newAuthoritativeRuleFiles: [],
    inheritedPrintedComponents: { path: root + 'c1c26-necromancer-frozen-baseline-contracts.json', checked: true, promotion: 'NONE' },
    authorityPolicy: 'Only authenticated original rule content or mirrors proven equal to known authority bytes may close fields; distribution permission and uploader claims alone are insufficient.' };
  const pending = sources.filter(s => s.pendingAuthority).map(s => s.sourceId);
  const before = inherited('source-gap-register').baselineLeafUsages;
  const previousTopics = inherited('source-exhaustion-register').topics;
  const topics = categories.map(category => {
    const p = previousTopics.find((t: any) => t.category === category);
    const usages = before.filter((g: any) => g.category === category);
    return { category, status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY', sourceStatus: 'SOURCE_BLOCKED', terminal: false,
      baselineGapIds: usages.map((g: any) => g.gapId), c1c26Usages: usages.length, remainingUsages: usages.length, closedUsages: 0,
      terminalUsages: 0, blockedOnInaccessibleAuthorityUsages: usages.length, authoritativeResolutionEvidenceIds: [],
      checkedSourceReferences: p.sourceReferences, nextEvidence: p.nextEvidence, pendingAuthoritySourceIds: pending,
      retrievalEvidenceIds: retrieval.receipts.map((r: any) => r.evidenceId),
      exhaustionEvidence: { allKnownRulebooksChecked: false, allKnownErrataChecked: false, designerFaqCheckedOrAuthenticatedUnavailable: false,
        officialComponentReferencesChecked: false, laterRevisionLeadsChecked: false, relevantPrintedComponentsChecked: true,
        publisherClarificationPathsChecked: true, noUnexaminedAuthoritativeLead: false, exhaustionEvidenceIds: [], exhaustionEvidenceRecords: [], accessFailuresAsExhaustionProof: false },
      rationale: 'Inherited core/component review remains valid. Designer PDF not acquired; later original distribution and revision provenance remain unexamined. Public access failures and unauthenticated previews cannot establish exhaustion.' };
  });
  put('source-exhaustion-register', { topics, leafUsages: before.map((g: any) => ({ ...g, resolutionStatus: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY',
    c1c27Status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY', exhaustionEvidenceIds: [], authoritativeResolutionEvidenceIds: [] })),
    totals: { inheritedUsages: 75, remainingUsages: 75, closedUsages: 0, terminalUsages: 0, blockedOnUnretrievedAuthorityUsages: 75, categories: 9 },
    standard: 'All known corpus classes examined with evidence IDs, or independently authenticated permanent unavailability; HTTP/DNS/timeout alone never qualifies.' });
  put('lowest-roll-tie-closure', { ...copy('lowest-roll-tie-contract'), status: topics[3].status,
    deterministicTieContract: { status: 'SOURCE_UNRESOLVED', tieParticipants: ['Heroes sharing lowest D10 result'], tieBreakAuthority: null,
      reroll: null, playerChoice: null, activePlayer: null, firstPlayer: null, random: null, simultaneous: null, algorithm: null, sourceEvidenceIds: [] } });
  put('area-tie-closure', { ...copy('area-target-tie-contract'), status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY', characterPriorityAppliesToAreaTie: false,
    deterministicTieContract: { status: 'SOURCE_UNRESOLVED', tieParticipants: ['Equally crowded eligible Target Areas'], tieBreakAuthority: null,
      reroll: null, playerChoice: null, activePlayer: null, firstPlayer: null, random: null, simultaneous: null, algorithm: null, sourceEvidenceIds: [] } });
  put('summon-count-closure', { ...copy('summon-count-contract'), status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY',
    levelSummary: [1, 2, 3].map(level => ({ level, summonCount: null, basis: null, status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY' })),
    candidateBases: ['per activation', 'per target area', 'per successful Hero hit', 'per successful attack', 'per empty Stance'],
    examples: [], normativeExamplePolicy: 'An example closes only explicitly demonstrated scope after original authority authentication; grammar alone never closes multiplicity.' });
  put('summon-supply-closure', { ...copy('summon-copy-policy'), status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY',
    policyDimensions: ['physical miniature count', 'monster card copies', 'spawn supply', 'runtime logical instances', 'campaign availability', 'battle-local availability'] });
  put('bone-identity-closure', { ...copy('bone-identity-closure'), status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY', identityOutcome: 'STILL_UNRESOLVED' });
  put('reanimation-order-closure', { ...copy('reanimation-order-contract'), status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY',
    fieldSourceStatus: Object.fromEntries(Object.keys(inherited('reanimation-order-contract').order).map(k => [k, 'BLOCKED_ON_UNRETRIEVED_AUTHORITY'])) });
  put('room-capacity-closure', { ...copy('room-capacity-resolution'), status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY',
    scenarios: [{ scenario: 'Target Area full', status: 'BOUND_DISPLACEMENT_ONLY', evidence: 'Core p31 inherited miniatureDisplacement; nearest tie and no-space remain blocked' },
      { scenario: 'Nearest available Area tie', status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY', value: null },
      { scenario: 'Entire Room full', status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY', value: null }] });
  put('cleanup-destination-closure', { ...copy('cleanup-destination-contract'), status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY',
    componentResetPolicy: ['bossIdentity', 'threatAbility', 'bossBattle'].map(component => ({ component, destination: null, resetSide: null, status: 'BLOCKED_ON_UNRETRIEVED_AUTHORITY' })) });
  put('source-precedence-final', { ...copy('source-precedence-closure'), policyFrozen: true,
    precedenceContract: { scope: 'Complete Edition Necromancer; preserves accepted C1C25/C1C26 functional clauses',
      correctionRequirements: ['authenticated original', 'specific corrected clause', 'applicable scope', 'known version or explicit correction context', 'supersession relationship'],
      relations: [{ higher: 'later explicit official correction', lower: 'named earlier clause', when: 'Authenticated explicit supersession within matching scope' },
        { higher: 'explicit designer FAQ', lower: 'named printed/core clause', when: 'Authenticated correction or clarification explicitly addresses conflict; no blanket FAQ precedence' },
        { higher: 'later official rulebook revision', lower: 'earlier rulebook', when: 'Authenticated applicability and changed clause are identified' },
        { higher: 'Boss-specific printed functional clause', lower: 'generic core rule', when: 'Same trigger/scope and generic exception permits; keep frozen bound rulings' }],
      componentReferenceRole: 'Setup/component corroboration within authenticated scope; no silent naming supersession',
      ttsRole: 'Physical identity/structure corroboration only; nickname or scripts never settle semantics', communityRole: 'Non-authoritative discovery only',
      appliedNewSupersessions: [], unresolvedConflict: 'Bone Rabble / Bone Rubble; no authenticated alias or renaming; Captain association remains separately gated' } });
  put('semantic-completeness-matrix', copy('semantic-completeness-matrix'));
  const readiness = copy('runtime-readiness-matrix');
  readiness.slices = readiness.slices.map((s: any) => ({ ...s, reachableBlockerCategories: s.blockers.length ? s.blockers :
    ['SUMMON_COPY_POLICY_UNRESOLVED', 'CLEANUP_DESTINATION_UNRESOLVED'], reachabilityEvidenceIds: [], productionProofEvidenceIds: [],
    analysis: 'Static facts can be represented but complete encounter execution reaches blocked effects/supply or cleanup. No independent complete gameplay slice has production proof.' }));
  put('runtime-readiness-matrix', readiness);
  a['c1c27-next-workstream-decision.json'] = { ...meta, ...deriveDecision(topics, readiness.slices, sources),
    acceptanceVerdict: 'C1C27-NECROMANCER-SOURCE-CLOSURE-ACCEPTED', expectedProductionReadyGain: 0,
    noExecutableSourceProgressProven: false, remainingSourceProgress: ['Authenticate designer original PDF and version/hash', 'Recover original backer production distribution manifest',
      'Authenticate official corebox TTS revision provenance before scoped comparison'],
    implementationProhibitedThisPhase: true };
  return a;
}

export function validateStatuses(topics: any[], sources: any[]) {
  assert(topics.length === 9 && new Set(topics.map(t => t.category)).size === 9 && topics.every(t => categories.includes(t.category)), 'all nine categories required');
  for (const t of topics) {
    assert(['RESOLVED', 'BOUNDED_STILL_UNRESOLVED', 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', 'BLOCKED_ON_UNRETRIEVED_AUTHORITY'].includes(t.status), 'status');
    if (t.status === 'RESOLVED') assert(t.authoritativeResolutionEvidenceIds?.length > 0 && t.authoritativeResolutionEvidenceIds.every((id: string) => sources.some(s => s.sourceId === id && isClosureAuthority(s))), 'resolved requires authenticated rule authority');
    if (t.status === 'SOURCE_EXHAUSTED_STILL_UNRESOLVED') assert(canExhaust(t.exhaustionEvidence, sources), 'exhaustion incomplete');
  }
}
export function validateArtifacts(a: Record<string, any>) {
  const expected = buildArtifacts();
  assert(JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(expected).sort()), 'artifact set');
  const auth = a['c1c27-authoritative-source-authentication.json'];
  validateStatuses(a[prefix + 'source-exhaustion-register.json'].topics, auth.sources);
  for (const s of auth.sources) if (allowedAuthority.includes(s.authorityStatus)) {
    assert(isClosureAuthority(s), 'unproved authority'); assert(hash(s.originalBytesPath) === s.contentSha256, 'authority byte hash');
    if (s.byteEquality) assert(auth.sources.some((o: any) => o.sourceId === s.byteEquality.knownAuthoritySourceId && o.authorityStatus !== 'TRANSPORT_MIRROR_VERIFIED_BYTES' && isClosureAuthority(o) && o.contentSha256 === s.contentSha256), 'mirror original authority');
  }
  for (const [n, v] of Object.entries(expected)) assert(JSON.stringify(a[n]) === JSON.stringify(v), 'deterministic artifact drift: ' + n);
}
export function verifyScope(paths: string[]) {
  for (const p of paths) assert(p === 'package.json' || /^scripts\/audit\/(?:c1c27-contract\.ts|(?:generate|verify)-complete-edition-c1c27\.ts|acquire-c1c27-sources\.mjs)$/.test(p) ||
    p === 'src/audit/c1c27-necromancer-source-closure.test.ts' || /^docs\/data\/complete-edition\/c1c27-[\w-]+\.json$/.test(p) ||
    /^docs\/data\/complete-edition\/source-assets\/c1c27\/[\w.-]+$/.test(p) || /^docs\/reports\/complete-edition\/c1c27-[\w-]+\.md$/.test(p), 'scope violation: ' + p);
}
export function verifyBaselineAndReceipts() {
  git('merge-base', '--is-ancestor', baselineHead, 'HEAD');
  verifyScope(git('diff', '--name-only', baselineHead).split(/\r?\n/).filter(Boolean));
  const preexisting = (p: string) => p.startsWith('.tmp-') || p.startsWith('tmp/') || p === 'src/.tmp-geom-check.test.ts';
  verifyScope(git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(p => p && !preexisting(p)));
  const entries = git('ls-tree', '-r', baselineHead).split(/\r?\n/).map(line => { const [header, path] = line.split('\t'); return { path, oid: header.split(' ')[2] }; }).filter(e => e.path !== 'package.json');
  const currentHashes = execFileSync('git', ['hash-object', '--stdin-paths'], { input: entries.map(e => e.path).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim().split(/\r?\n/);
  assert(currentHashes.length === entries.length, 'frozen file count');
  entries.forEach((e, i) => {
    if (e.oid === currentHashes[i]) return;
    const old = execFileSync('git', ['show', baselineHead + ':' + e.path], { maxBuffer: 128 * 1024 * 1024 });
    const now = readFileSync(e.path);
    assert(!old.includes(0) && !now.includes(0) && old.toString().replace(/\r\n/g, '\n') === now.toString().replace(/\r\n/g, '\n'), 'frozen content changed: ' + e.path);
  });
  const pkg = JSON.parse(git('show', baselineHead + ':package.json'));
  for (const [key, value] of Object.entries({ 'import:complete-edition-c1c27': 'node scripts/audit/acquire-c1c27-sources.mjs',
    'audit:complete-edition-c1c27': 'vite-node scripts/audit/generate-complete-edition-c1c27.ts', 'verify:complete-edition-c1c27': 'vite-node scripts/audit/verify-complete-edition-c1c27.ts' })) pkg.scripts[key] = value;
  assert(JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8'))) === JSON.stringify(pkg), 'package additions only');
  const receipts = load('c1c27-source-retrieval-evidence.json').receipts;
  for (const r of receipts) {
    assert(r.url && Number.isFinite(Date.parse(r.timestamp)) && r.candidateIdentity && r.retryPath && r.httpStatus !== 0 && Array.isArray(r.redirectChain), 'retrieval receipt');
    assert(!r.permanentlyUnavailable && !r.authenticatedRuleFile, 'transport cannot certify authority');
    if (r.responsePath) assert(hash(r.responsePath) === r.responseSha256, 'response hash');
    if (r.headersPath) assert(hash(r.headersPath) === r.headersSha256, 'header hash');
    assert(JSON.stringify(JSON.parse(readFileSync(root + 'source-assets/c1c27/' + r.candidateId + '.receipt.json', 'utf8'))) === JSON.stringify(r), 'sidecar drift');
  }
}

export function report(a: Record<string, any>) {
  const register = a[prefix + 'source-exhaustion-register.json'];
  const d = a['c1c27-next-workstream-decision.json'];
  const auth = a['c1c27-authoritative-source-authentication.json'];
  const rows = register.topics.map((t: any) => `| ${t.category} | ${t.c1c26Usages} | ${t.remainingUsages} | ${t.closedUsages} | ${t.terminalUsages} | ${t.blockedOnInaccessibleAuthorityUsages} | ${t.status} |`).join('\n');
  const responses = load('c1c27-source-retrieval-evidence.json').receipts.map((r: any) => `| ${r.candidateId} | ${r.httpStatus ?? 'none'} | ${r.exitCode} | ${r.failureClass} | ${r.responseBytes} |`).join('\n');
  return `# C1C27 Necromancer Source Closure\n\nBaseline: ${baselineHead}, branch codex/phase-11a4-c1c26-necromancer-source-closure. Acceptance verdict: ${d.acceptanceVerdict}. This accepts source acquisition/classification and its verifier; build and browser acceptance remain separately unverified.\n\nPhysical 9; literal 9/9; card-local semantic 3/9; family semantic 0/9; source gated 9/9; runtime eligible 0/9; Production Ready 0/9. All 75 inherited leaf usages retain exact identity and category. Closed 0; terminal 0; blocked on unretrieved authority 75. No gameplay implementation or semantic promotion.\n\n| Category | C1C26 usages | C1C27 remaining | Closed | Terminal | Blocked on inaccessible authority | C1C27 status |\n| --- | ---: | ---: | ---: | ---: | ---: | --- |\n${rows}\n\n## Twelve required answers\n\n| Question | Answer | Consequence |\n| --- | --- | --- |\n| 1. Designer FAQ acquired and authenticated? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | BGG title/uploader listing known; original PDF filename, version, date/hash unknown |\n| 2. Other later official clarification obtained? | NO | Later production ZIP/TTS/Drive leads discovered, no authenticated corrective rule content |\n| 3. Lowest-roll Hero tie resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Structured participants retained; authority and all tie-break fields remain null |\n| 4. Crowded Area tie resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Character Stance priority cannot resolve Area occupancy ties |\n| 5. Each Level summon count resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Levels I/II/III and all nine Skills retained; count and basis remain null |\n| 6. Finite supply / reuse resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Miniatures/cards/spawn/logical/campaign/Battle dimensions remain distinct |\n| 7. Bone Rabble / Rubble resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Both literals retained, no alias; Captain narrow/full association independently blocked |\n| 8. Reanimation ordering resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Eight key ordering fields independently blocked; generic casualty facts retained |\n| 9. Room capacity fallback resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Full Area displacement bound; nearest tie and entire Room full independently blocked |\n| 10. Boss trio cleanup destination resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Identity, Threat/Ability, Battle destination and reset separate; inherited Room sequence retained |\n| 11. Any blocker formally terminal? | NO | Exhaustion gate fails while original FAQ/later corpus remain unexamined |\n| 12. C1C28 runtime allowed? | NO | ${d.outcome}; no complete independent gameplay slice proved |\n\n## Acquisition and authentication\n\nThe [designer listing](https://boardgamegeek.com/boardgame/317321/darkest-dungeon-the-board-game/files) identifies the FAQ and uploader apoxwrhthrio1980. Public direct/index requests and an ordinary retry were attempted; no original designer PDF was authenticated. The [Scribd preview](https://www.scribd.com/document/686825056/DD-FAQ-EN) is readable through the web tool, uploaded by LilG. It is an unauthenticated transport lead, not proof of byte identity with designer filepage 250715. Preview mechanics and suggested house-rule precedence cannot close fields.\n\nNew [Warrens production](https://boardgamegeek.com/filepage/315734/darkest-dungeon-the-board-game-the-warrens-printin) and [Color of Madness production](https://boardgamegeek.com/filepage/315735/darkest-dungeon-the-board-game-the-color-of-madnes) listings identify community uploader yoyoboy170 and January/February 2026 ZIP names. Distribution permission for Red Hook IP does not prove these bytes are original production revisions. Public community-linked Drive folders were attempted; original distribution receipt/manifest remains needed. Inspection scope is cross-cutting clarification only, not other Boss implementation.\n\nThe [secondary distribution article](https://www.wargamer.com/darkest-dungeon-board-game/files) links the same historical official notice; official URL and site-search retry did not recover the corpus. Current mythicgames.net responds with unrelated gambling content; its HTTP 200 body is REJECTED as publisher authority. A successful HTTP response is not evidence of current publisher ownership.\n\nA retailer core PDF path was tried with a longer ordinary retry. Only exact complete-byte equality with the locked rulebook can authenticate it as duplicate transport; a timeout/partial body cannot. Source authentication currently records ${auth.sources.filter((s: any) => s.authorityStatus === 'TRANSPORT_MIRROR_VERIFIED_BYTES').length} verified duplicate mirrors and zero new authoritative corrections. No existing core rulebook parsing was repeated. Official TTS and later revisions remain acquisition/provenance work, not nickname/script rule authority.\n\nRaw response bytes, headers and per-attempt receipts are under source-assets/c1c27. Failure classes distinguish access denial, missing links, DNS, TLS/transport and timeout; partial HTTP 200 bodies retain failure status. The acquisition script runs explicitly and is separate from the deterministic network-free generator. Indexed discovery observations are recorded with queries/URLs; they are not represented as HTTP receipts or original PDFs.\n\n| Candidate | HTTP | curl exit | Classification | Received bytes |\n| --- | ---: | ---: | --- | ---: |\n${responses}\n\n## Closure, precedence and exhaustion\n\nC1C26 source-bound values/references are inherited unchanged. New per-topic files add statuses and missing structured fields without inventing values. The frozen precedence contract requires an authenticated scoped correction and explicit supersession relationship; no blanket printed-card/FAQ rule is introduced. Rabble/Rubble conflict remains unresolved. All nine categories are BLOCKED_ON_UNRETRIEVED_AUTHORITY, rather than claiming exhaustion from access failures. Exhaustion evidence IDs remain empty because no exhaustion claim passes the full corpus gate.\n\n## Reachability and next workstream\n\nSetup descriptors, Room starts, Threat flip/expiry and full-Stance suppression remain source-complete primitives. They do not form an independently complete playable slice: encounter supply, effect dispatch or completion still reaches blocked fields. No positive Ready gain or production proof exists; descriptor storage cannot select partial runtime. Matrix-derived decision: ${d.nextAction}; ${d.verdict}. Other families remain unselected; further source progress is executable through original FAQ authentication, original backer manifests and official TTS provenance.\n\n## Frozen regression and validation limits\n\nBaseline tracked content is checked against C1C26 Git objects, allowing only line-ending differences. Only three package script additions are allowed. Frozen counts: Core Trinket 15/37; Standard Quest 3/75; census 278; Hamlet Event 16 literal / 5 local semantic / 0 Ready; Boss census 231 / 20 families; Battle 114; Threat 51; exclusive Ability 12; Identity 54. C1C25 nine literal / zero family semantic and C1C26 75 unresolved / nine categories / zero terminal remain frozen. Build results are recorded separately in c1c27-validation-report.md; no bundler/Vite config changes. Historical C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector timeout remain open. Complete Edition browser E2E is not fully accepted.\n`;
}
export function writeArtifacts() {
  const a = buildArtifacts(); validateArtifacts(a);
  for (const [n, value] of Object.entries(a)) writeFileSync(root + n, JSON.stringify(value, null, 2) + '\n');
  writeFileSync('docs/reports/complete-edition/c1c27-necromancer-source-closure-report.md', report(a));
}
