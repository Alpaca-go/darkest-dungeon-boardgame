import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { buildC4C, C4C_BASE, currentObligations, nextDecision } from '../../scripts/audit/c4c-rest-simple-quest';
import predecessor from '../../docs/data/complete-edition/c4b-rest-quest-impact.json';
import matrix from '../../docs/data/complete-edition/c4a-standard-quest-capability-matrix.json';
import { C4C_SIMPLE_QUEST_IDS } from './c4c-quest-batch';

describe('C4C successor audit', () => {
  it('reproduces artifacts, preserves all other non-Rest obligations and records 71 effective gates', () => {
    const artifacts = buildC4C();
    for (const [path, value] of Object.entries(artifacts)) expect(readFileSync(path, 'utf8')).toBe(JSON.stringify(value, null, 2) + '\n');
    const impact = artifacts['docs/data/complete-edition/c4c-rest-quest-impact.json'] as { affectedQuests: Array<{ definitionId: string; remainingNonRestBlockers: string[] }> };
    expect(impact.affectedQuests).toHaveLength(71);
    for (const q of impact.affectedQuests) {
      expect(q.remainingNonRestBlockers).toEqual(predecessor.affectedQuests.find(p => p.definitionId === q.definitionId)!.remainingNonRestBlockers
        .filter(id => !(C4C_SIMPLE_QUEST_IDS.includes(q.definitionId) && id === `${q.definitionId}:persistence`)));
    }
    for (const q of matrix.quests) {
      expect(currentObligations(q.definitionId)).toEqual(q.obligations.filter(o => !(o.dependencies as string[]).includes('REST')
        && !(C4C_SIMPLE_QUEST_IDS.includes(q.definitionId) && o.capabilityId === 'QUEST_SAVE_CHOICE_TRANSACTION_BINDING')));
    }
    const decision = nextDecision();
    expect(decision.decisionCount).toBe(1);
    expect(decision.automaticImplementation).toBe(false);
    expect(decision.selectedWorkstream).toBe(decision.candidates[0].family);
    expect(decision.candidates.some(c => c.effectivelyAuthorizedQuestCount > 0)).toBe(true);
  });

  it('routes explicit C3/C4A/C4B/C4C workstreams and rejects unknown C4 successors', () => {
    const workflow = readFileSync('.github/workflows/development-fast-gate.yml', 'utf8');
    const selector = workflow.split('      - name: Select development workstream')[1].split('      - run:')[0]
      .split('        run: |')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
    const temp = mkdtempSync(join(tmpdir(), 'c4c-routing-'));
    try {
      const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
      const output = join(temp, 'output').replace(/\\/g, '/');
      for (const phase of ['c3', 'c4a', 'c4b', 'c4c']) {
        writeFileSync(output, '');
        execFileSync(bash, ['-c', selector], { env: { ...process.env, BRANCH_NAME: `codex/phase-11a7-${phase}-test`, GITHUB_OUTPUT: output } });
        expect(readFileSync(output, 'utf8').trim()).toBe(`phase=${phase}`);
      }
      for (const suffix of ['c4d', 'c4z', 'c4ab', 'c40', 'c4']) expect(() => execFileSync(bash, ['-c', selector], {
        stdio: 'pipe', env: { ...process.env, BRANCH_NAME: `codex/phase-11a7-${suffix}-test`, GITHUB_OUTPUT: output } })).toThrow();
      const blocks = workflow.split(/(?=^      - )/m).slice(1);
      const runs = (phase: string) => blocks.filter(b => !b.includes('        if:') || b.includes(`== '${phase}'`))
        .flatMap(b => { const match = b.match(/^      - (?:run|name): (.+)/); return match ? [match[1]] : []; })
        .filter(n => n !== 'Select development workstream');
      expect(runs('c4c')).toEqual(['npm ci', 'npm run typecheck', 'Verify C4B at the accepted C4C base',
        'npm run test:complete-edition-c4c', 'npm run verify:complete-edition-c4c', 'npm run build']);
      const baseWorkflow = execFileSync('git', ['show', `${C4C_BASE}:.github/workflows/development-fast-gate.yml`], { encoding: 'utf8' });
      const oldBlocks = baseWorkflow.split(/(?=^      - )/m).slice(1);
      for (const phase of ['c3', 'c4a', 'c4b']) {
        const prior = oldBlocks.filter(b => !b.includes('        if:') || b.includes(`== '${phase}'`))
          .flatMap(b => { const m = b.match(/^      - (?:run|name): (.+)/); return m ? [m[1]] : []; }).filter(n => n !== 'Select development workstream');
        expect(runs(phase)).toEqual(prior);
      }
      expect(workflow).toContain('git worktree add --detach "$base_worktree" ' + C4C_BASE);
    } finally {
      if (!resolve(temp).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected temporary cleanup target');
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
