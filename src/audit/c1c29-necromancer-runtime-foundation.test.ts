import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildArtifacts, verifyArtifacts, root } from '../../scripts/audit/c1c29-contract';

describe('C1C29 real runtime binding and honest evidence', () => {
  const artifacts = buildArtifacts() as Record<string, Record<string, any>>;
  it('verifies checked-in traces against the production executor and frozen upstream inputs', () => { expect(() => verifyArtifacts()).not.toThrow(); });
  it('binds exactly nine distinct core cards from the C1C28 graph', () => {
    const bindings = artifacts['c1c29-necromancer-runtime-binding.json'].bindings;
    expect(bindings).toHaveLength(9); expect(new Set(bindings.map((b: any) => b.cardId)).size).toBe(9);
  });
  it('imports only the pinned semantic artifact into the family adapter', () => {
    const adapter = readFileSync('src/game-engine/necromancer/contract-adapter.ts', 'utf8');
    expect(adapter).toContain('c1c28-necromancer-runtime-semantic-contract.json?raw');
    expect(adapter).not.toMatch(/from ['"].*scripts\/audit|frontLiteral|backLiteral|parse.*Literal|HP\s*[:=]\s*(77|103|144)/);
    expect(readFileSync('src/game-engine/bosses/foundation.ts', 'utf8')).not.toMatch(/Math\.random\(|prototype-necromancer/);
  });
  it('all four tie proofs have identical original/reload/replay final hashes', () => {
    const cases = artifacts['c1c29-necromancer-save-replay-proof.json'].cases;
    expect(cases).toHaveLength(4);
    for (const proof of cases) { expect(proof.finalStateSha256).toBe(proof.reloadStateSha256); expect(proof.finalStateSha256).toBe(proof.replayStateSha256); expect(proof.choices.length).toBeGreaterThan(0); }
  });
  it('keeps fixture proof separate from official production acceptance', () => {
    expect(artifacts['c1c29-necromancer-runtime-proof.json']).toMatchObject({ normalProductionGameplayAccepted: false, syntheticMonsterLifeIsOfficial: false });
    expect(artifacts['c1c29-next-workstream-decision.json']).toMatchObject({ decision: 'NECROMANCER_RUNTIME_FOUNDATION_CONTINUATION', productionReady: 0, returnToSourceAcquisition: false });
  });
  it('freezes the global rule-source policy and records missing rules honestly', () => {
    expect(artifacts['rule-source-policy.json']).toMatchObject({ policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1', externalAuthorityAcquisition: false,
      missingRulePolicy: { authority: 'PROJECT_RULING', canonical: false } });
    expect(artifacts['rule-source-policy.json'].disallowed).toContain('TTS Lua');
    expect(JSON.parse(readFileSync(root + 'c1c28-necromancer-runtime-semantic-contract.json', 'utf8')).runtimeImplemented).toBe(false);
  });
});
