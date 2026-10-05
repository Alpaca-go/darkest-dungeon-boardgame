import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { C4B_BASE, REQUIRED_FIELDS, artifactsC4B, assertFrozenInputs, assertSourceMap, buildC4B,
  deriveContract, loadSourceMap, questImpact, readinessAfter } from '../../scripts/audit/c4b-rest-official-contract';
import census from '../../docs/data/complete-edition/c4a-standard-quest-census.json';
import matrix from '../../docs/data/complete-edition/c4a-standard-quest-capability-matrix.json';
import historical from '../../docs/data/complete-edition/rest-semantic-contract.json';

describe('C4B official Rest source review', () => {
  const map = loadSourceMap();
  const contract = deriveContract(map);

  it('uses hash-bound official source classes and frozen printed Quest observations', () => {
    expect(() => assertSourceMap(map)).not.toThrow();
    expect(map.externalAcquisition).toBe(false);
    expect(map.transportIsAuthority).toBe(false);
    expect(map.sourceInventory.every(s => ['OFFICIAL_LOCKED_RULEBOOK', 'OFFICIAL_PRINTED_COMPONENT'].includes(s.sourceClass))).toBe(true);
    expect(map.printedQuestCards.every(c => c.completionSemanticsSupported === false)).toBe(true);
  });

  it('rejects designer/community evidence even if labelled an explicit answer', () => {
    const bad = structuredClone(map);
    bad.sourceInventory[0].sourceClass = 'DESIGNER_FORUM_CLARIFICATION';
    expect(() => deriveContract(bad)).toThrow(/Disallowed authority/);
    const unbound = structuredClone(map);
    unbound.passages.push({ ...unbound.passages[0], evidenceId: 'C1C1R3:S2:ARGYRIS-ALL-POINTS',
      sourceId: 'FORUM', fieldSupport: [{ field: 'budgetConsumption', support: 'EXPLICIT' }] });
    expect(() => deriveContract(unbound)).toThrow(/Unbound official evidence/);
    expect(map.rejectedHistoricalAuthorities.find(a => a.evidenceId === 'C1C1R3:S2:ARGYRIS-ALL-POINTS')?.admissible).toBe(false);
  });

  it('maps every complete core Rest passage, special Rest and locked tutorial/Farmstead context', () => {
    for (const sourceId of ['CORE', 'CORE-PRINT']) {
      expect(map.sourceInventory.find(s => s.sourceId === sourceId)?.reviewedPages).toEqual(Array.from({ length: 44 }, (_, i) => i + 1));
      for (const page of [11, 15, 25, 30, 36]) expect(map.passages.some(p => p.sourceId === sourceId && p.page === page)).toBe(true);
    }
    const missing = structuredClone(map);
    missing.passages = missing.passages.filter(p => !(p.sourceId === 'CORE' && p.page === 15));
    expect(() => assertSourceMap(missing, false)).toThrow(/Missing Rest/);
    for (const sourceId of ['OLD-ROAD', 'OLD-ROAD-V2', 'COM']) expect(map.passages.some(p => p.sourceId === sourceId)).toBe(true);
    expect(map.passages.find(p => p.sourceId === 'WEALD' && p.page === 3)?.fieldSupport)
      .toContainEqual({ field: 'insufficientRecoveryCapacity', support: 'INSUFFICIENT' });
  });

  it('cannot transfer tutorial or Color of Madness completion into standard Quest Rest', () => {
    const scoped = structuredClone(map);
    scoped.passages.find(p => p.sourceId === 'COM' && p.page === 7)!.fieldSupport = [{ field: 'budgetConsumption', support: 'EXPLICIT' }];
    expect(() => deriveContract(scoped)).toThrow(/Scoped or disallowed/);
  });

  it('reproduces seven sufficient fields from explicit/derived official support without blind historical labels', () => {
    expect(contract.closedFields).toEqual(['firewoodUse', 'sessionBudget', 'restingPointAllocation', 'pointConversion',
      'multiplePointsPerHero', 'onePurposePerPoint', 'roomGate']);
    expect(contract.productionRequiredFields).toEqual([...REQUIRED_FIELDS]);
    for (const field of contract.fields) {
      const support = map.passages.filter(p => field.officialEvidence.includes(p.evidenceId))
        .flatMap(p => p.fieldSupport.filter(s => s.field === field.field).map(s => s.support));
      if (field.productionUsable) expect(support.some(s => s === 'EXPLICIT' || s === 'DERIVED')).toBe(true);
      if (field.currentOfficialStatus === 'OFFICIAL_DERIVED') expect(field.derivation).toBeTruthy();
    }
    expect(contract.fields.find(f => f.field === 'multiplePointsPerHero')?.currentOfficialStatus).toBe('OFFICIAL_DERIVED');
  });

  it('re-evaluates full-budget, partial and zero-point completion under the current policy', () => {
    for (const field of ['budgetConsumption', 'partialSpend', 'zeroPointRest']) {
      const row = contract.fields.find(f => f.field === field)!;
      expect(row.currentOfficialStatus).toBe('OFFICIAL_INSUFFICIENT');
      expect(row.productionUsable).toBe(false);
      expect(row.rule).toBeNull();
      expect(row.historicalEvidenceIds).toContain('C1C1R3:S2:ARGYRIS-ALL-POINTS');
      expect(row.officialEvidence.every(id => id.startsWith('C4B:CORE'))).toBe(true);
    }
  });

  it('never chooses an insufficient-capacity behavior or upgrades an allocation cap from token arithmetic', () => {
    const capacity = contract.fields.find(f => f.field === 'insufficientRecoveryCapacity')!;
    expect(capacity.currentOfficialStatus).toBe('SOURCE_UNRESOLVED');
    expect(capacity.rule).toBeNull();
    const cap = contract.fields.find(f => f.field === 'recoveryCap')!;
    expect(cap.historicalStatus).toBe('MODEL_INVARIANT');
    expect(cap.currentOfficialStatus).toBe('OFFICIAL_INSUFFICIENT');
    expect(cap.productionUsable).toBe(false);
    expect(contract.canonicalClosure).toBe(false);
  });

  it('keeps all 71 affected Quest budgets and independent blockers bound to the accepted 76-Quest census', () => {
    const impact = questImpact(contract);
    expect(impact.currentQuestDefinitionCount).toBe(76);
    expect(impact.restGatedQuestCount).toBe(71);
    expect(impact.previousRestSourceGateCount).toBe(142);
    expect(impact.restSourceGatesRemoved).toBe(0);
    for (const q of impact.affectedQuests) {
      const original = census.quests.find(p => p.definitionId === q.definitionId)!;
      expect({ tokens: q.firewoodCount, restingPoints: q.restingPoints }).toEqual(original.rest.firewood);
      const nonRest = matrix.quests.find(p => p.definitionId === q.definitionId)!.obligations
        .filter(o => !(o.dependencies as string[]).includes('REST') && ['SOURCE_BLOCKED', 'NEEDS_NEW_RUNTIME_PRIMITIVE',
          'DEFERRED_SEMANTIC', 'NEEDS_QUEST_ADAPTER'].includes(o.classification)).map(o => o.obligationId);
      expect(q.remainingNonRestBlockers).toEqual(nonRest);
      expect(q.currentReadiness).toBe(original.readiness);
    }
    expect(impact.counts).toEqual({ PRODUCTION_READY_EXISTING: 3, ADAPTER_READY: 0, RUNTIME_PRIMITIVE_BLOCKED: 0,
      SOURCE_BLOCKED: 65, DEFERRED_SEMANTIC: 0, MULTI_BLOCKED: 8 });
  });

  it('never promotes a Quest while any independent source, primitive, action or adapter gap remains', () => {
    expect(readinessAfter([{ classification: 'SOURCE_BLOCKED' }], true)).toBe('SOURCE_BLOCKED');
    expect(readinessAfter([{ classification: 'DEFERRED_SEMANTIC' }], true)).toBe('DEFERRED_SEMANTIC');
    expect(readinessAfter([{ classification: 'NEEDS_NEW_RUNTIME_PRIMITIVE' }, { classification: 'SOURCE_BLOCKED' }], true)).toBe('MULTI_BLOCKED');
    expect(readinessAfter([{ classification: 'NEEDS_QUEST_ADAPTER' }], true)).toBe('ADAPTER_READY');
    expect(readinessAfter([], false)).toBe('ADAPTER_READY');
    const hypothetical = structuredClone(contract);
    hypothetical.canonicalClosure = true;
    hypothetical.fields.forEach(f => { f.productionUsable = true; });
    const simulated = questImpact(hypothetical);
    expect(simulated.restSourceGatesRemoved).toBe(142);
    expect(simulated.affectedQuests.filter(q => q.remainingNonRestBlockers.length)
      .every(q => q.currentReadiness !== 'PRODUCTION_READY_EXISTING')).toBe(true);
  });

  it('records eight conditional adapters separately from absent current selector/save proofs', () => {
    const impact = questImpact(contract);
    expect(impact.conditionalCandidates).toHaveLength(8);
    expect(impact.implementationEligibleCandidateIds).toEqual([]);
    for (const candidate of impact.conditionalCandidates) {
      expect(candidate.existingRuntimeAdapter.adapterId).toBe('c1c1-simple-community-quest-v1');
      expect(candidate.remainingNonRestSourceBlockers).toEqual([]);
      expect(candidate.remainingAdapterWork).toEqual(['QUEST_SAVE_CHOICE_TRANSACTION_BINDING']);
      expect(candidate.saveReplayProofStatus).toBe('NO_CURRENT_PRODUCTION_BOUND_PROOF');
      expect(candidate.selectorProofStatus).toBe('NOT_SELECTOR_REACHABLE');
      expect(candidate.implementationEligible).toBe(false);
    }
  });

  it('preserves the historical Rest contract, C4A classifications and every gameplay runtime path', () => {
    const preserved = assertFrozenInputs();
    expect(preserved.gameplayRuntimeChanged).toBe(false);
    const old = execFileSync('git', ['show', C4B_BASE + ':docs/data/complete-edition/rest-semantic-contract.json'], { encoding: 'utf8' });
    expect(readFileSync('docs/data/complete-edition/rest-semantic-contract.json', 'utf8')).toBe(old);
    expect(historical.budgetConsumption.status).toBe('SOURCE_EXPLICIT');
    expect(historical.insufficientRecoveryCapacity.status).toBe('SOURCE_UNRESOLVED');
  });

  it('records exactly one blocked next decision with no automatic ruling or implementation batch', () => {
    const result = buildC4B();
    expect(result.contract.outcome).toBe('REST_OFFICIAL_CONTRACT_UNRESOLVED');
    expect(result.sourceGaps.corpusExhaustedUnderCurrentPolicy).toBe(true);
    expect(result.sourceGaps.selectedAlternative).toBeNull();
    expect(result.decision.decisionCount).toBe(1);
    expect(result.decision.selectedWorkstream).toBe('REST_SOURCE_POLICY_DECISION_REQUIRED');
    expect(result.decision.permittedRoutes).toHaveLength(2);
    expect(result.decision.automaticProjectRulingAuthorized).toBe(false);
    expect(result.decision.implementationBatchSelected).toBe(false);
  });

  it('requires reproducible successor artifacts and a fixed review receipt', () => {
    for (const [path, value] of Object.entries(artifactsC4B()))
      expect(readFileSync(path, 'utf8')).toBe(JSON.stringify(value, null, 2) + '\n');
    const altered = structuredClone(map);
    altered.passages[0].literalWordingSummary = 'Unreviewed rule';
    expect(() => assertSourceMap(altered)).toThrow(/Unreviewed source map/);
  });

  it('routes C3, C4A and C4B correctly and refuses unknown C4 successors', () => {
    const workflow = readFileSync('.github/workflows/development-fast-gate.yml', 'utf8');
    const selector = workflow.split('      - name: Select development workstream')[1].split('      - run:')[0]
      .split('        run: |')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
    const temp = mkdtempSync(join(tmpdir(), 'c4b-routing-'));
    try {
      const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
      const output = join(temp, 'output').replace(/\\/g, '/');
      for (const [branch, phase] of [
        ['codex/phase-11a6-c3e-monster-full-player-path-acceptance-freeze', 'c3'],
        ['codex/phase-11a7-c4a-standard-quest-production-rebaseline', 'c4a'],
        ['codex/phase-11a7-c4b-rest-official-contract-review', 'c4b']
      ]) {
        writeEmpty(output);
        execFileSync(bash, ['-c', selector], { env: { ...process.env, BRANCH_NAME: branch, GITHUB_OUTPUT: output } });
        expect(readFileSync(output, 'utf8').trim()).toBe('phase=' + phase);
      }
      expect(() => execFileSync(bash, ['-c', selector], { stdio: 'pipe', env: { ...process.env,
        BRANCH_NAME: 'codex/phase-11a7-c4c-unsupported', GITHUB_OUTPUT: output } })).toThrow();
      const blocks = workflow.split(/(?=^      - )/m).slice(1);
      const runs = (phase: string) => blocks.filter(block => !block.includes('        if:') || block.includes(`== '${phase}'`))
        .flatMap(block => { const match = block.match(/^      - (?:run|name): (.+)/); return match ? [match[1]] : []; })
        .filter(name => name !== 'Select development workstream');
      expect(runs('c3')).toEqual(['npm ci', 'npm run typecheck', 'npm run verify:complete-edition-c3c',
        'npm run test:complete-edition-c3d', 'npm run verify:complete-edition-c3d', 'npm run test:complete-edition-c3e',
        'npm run verify:complete-edition-c3e', 'npm run build']);
      expect(runs('c4a')).toEqual(['npm ci', 'npm run typecheck', 'Verify C3E at the authoritative C4A base',
        'npm run test:complete-edition-c4a', 'npm run verify:complete-edition-c4a', 'npm run build']);
      expect(runs('c4b')).toEqual(['npm ci', 'npm run typecheck', 'Verify C4A at the accepted C4B base',
        'npm run test:complete-edition-c4b', 'npm run verify:complete-edition-c4b', 'npm run build']);
      expect(workflow).toContain('git worktree add --detach "$base_worktree" ' + C4B_BASE);
    } finally {
      if (!resolve(temp).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected temporary cleanup target');
      rmSync(temp, { recursive: true, force: true });
    }
  });
});

// Temporary output belongs outside the repository and is never audit authority.
function writeEmpty(path: string) { writeFileSync(path, ''); }
