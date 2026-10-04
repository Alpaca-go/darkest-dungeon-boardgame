import { afterAll, expect, vi } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyHistoricalBaseline } from '../../scripts/audit/historical-baseline';
import '../../scripts/audit/legacy-transport-preload.mjs';

// Preserve the original test files (also hash-bound by C1C31/R). Only their
// historical checkout dispatch changes; all semantic and scope assertions use
// the original module. This adapter executes the real original CLI, not a stub.
vi.mock('../../scripts/audit/c1c27-contract', async importOriginal => {
  const original = await importOriginal<typeof import('../../scripts/audit/c1c27-contract')>();
  return { ...original, verifyBaselineAndReceipts: () => verifyHistoricalBaseline('c1c27') };
});
vi.mock('../../scripts/audit/c1c28-contract', async importOriginal => {
  const original = await importOriginal<typeof import('../../scripts/audit/c1c28-contract')>();
  return { ...original, verifyBaselineAndScope: () => verifyHistoricalBaseline('c1c28') };
});

// C1C31's frozen entry-attempt hash includes the pre-C2D save envelope metadata.
// Exercise its original evidence verifier and tests at the accepted C2C checkout.
vi.mock('../../scripts/audit/c1c31-contract', async importOriginal => {
  const original = await importOriginal<typeof import('../../scripts/audit/c1c31-contract')>();
  return { ...original, verifyArtifacts: () => verifyHistoricalBaseline('c2c',['src/audit/c1c31-necromancer-runtime-foundation.test.ts']) };
});

// The legacy CLI test invokes the real generator. Its supported environment
// overrides route generated outputs outside the frozen repository, while it
// still consumes the actual official-source inputs and locked rulebook.
if (expect.getState().testPath?.replace(/\\/g, '/').endsWith('/core-campaign/cli-exit-contract.test.ts')) {
  const scratch = mkdtempSync(join(tmpdir(), 'dd-c1c34-cli-output-'));
  mkdirSync(join(scratch,'docs/data/darkest-dungeon'),{recursive:true});
  copyFileSync(resolve('docs/DD_EN_COREBOX_RULES.pdf'),join(scratch,'docs/DD_EN_COREBOX_RULES.pdf'));
  const sourceLink = join(scratch,'docs/data/darkest-dungeon/official');
  symlinkSync(resolve('docs/data/darkest-dungeon/official'),sourceLink,process.platform==='win32'?'junction':'dir');
  const keys = ['PHASE11A3_REPO_ROOT'] as const;
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.PHASE11A3_REPO_ROOT = scratch;
  afterAll(() => {
    for(const k of keys) if(previous[k]===undefined) delete process.env[k]; else process.env[k]=previous[k];
    if(!resolve(scratch).startsWith(resolve(tmpdir())+'\\') && !resolve(scratch).startsWith(resolve(tmpdir())+'/')) throw new Error('Unsafe CLI fixture cleanup');
    unlinkSync(sourceLink);
    rmSync(scratch, {recursive:true,force:true});
  });
}
