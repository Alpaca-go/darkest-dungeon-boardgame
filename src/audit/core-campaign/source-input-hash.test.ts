import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeAuditInputHash } from './official-source-audit';

const requirement: any = { requirementId: 'req', componentId: 'component', componentType: 'card', quantity: 1, requiredFields: ['maxHp'], requiredForCompletion: true };
const doc = (overrides: any = {}) => ({ sourceAssetId: 'asset-a', componentId: 'component', sourceType: 'card', sourceReference: 'A', extractedFields: { maxHp: 100 }, fieldProvenance: { maxHp: { status: 'verified', sourceReference: 'A' } }, ...overrides });
const hash = (requirements = [requirement], documents = [doc()], rulebook = 'rules') => {
  const dir = mkdtempSync(join(tmpdir(), 'dd-hash-')); const path = join(dir, 'rulebook.bin'); writeFileSync(path, rulebook);
  return computeAuditInputHash(requirements, new Map([['req', documents]]), [], path);
};

describe('source input identity', () => {
  it('changes for values, references, provenance, asset identity, and requirements', () => {
    const base = hash();
    expect(hash([requirement], [doc({ extractedFields: { maxHp: 101 } })])).not.toBe(base);
    expect(hash([requirement], [doc({ sourceReference: 'B' })])).not.toBe(base);
    expect(hash([requirement], [doc({ fieldProvenance: { maxHp: { status: 'partial', sourceReference: 'B' } } })])).not.toBe(base);
    expect(hash([requirement], [doc({ sourceAssetId: 'asset-b' })])).not.toBe(base);
    expect(hash([{ ...requirement, requiredFields: ['maxHp', 'skills'] }])).not.toBe(base);
  });
  it('is discovery-order independent and includes rulebook bytes', () => {
    expect(hash([requirement], [doc(), doc({ sourceAssetId: 'asset-b' })])).toBe(hash([requirement], [doc({ sourceAssetId: 'asset-b' }), doc()]));
    expect(hash([requirement], [doc()], 'A')).not.toBe(hash([requirement], [doc()], 'B'));
  });
});
