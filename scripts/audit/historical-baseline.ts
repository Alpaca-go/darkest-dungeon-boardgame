import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { supplyProphetHistoricalObjects } from './historical-object-closure';

export const historicalBaselines = {
  c2d: {phase:'11A.5-C2D',commit:'2d979652c3b713d6104bd21c7007fcd24fe1af63',script:'scripts/audit/c2d-hero-runtime.ts',artifactPrefixes:['c2d-']},
  c2c: { phase: '11A.5-C2C', commit: 'e1e9f27c882000bee59cec115ec0d1b3f7fcb5de', script: 'scripts/audit/c2c-hero-production.ts', artifactPrefixes: ['c2c-'] },
  c2b: { phase: '11A.5-C2B', commit: '84e747b170d4ba65c463d1d5be1cfcd80dd0dd08', script: 'scripts/audit/c2b-hero-literal-closure.ts', artifactPrefixes: ['c2b-'] },
  'c2a-r1': { phase: '11A.5-C2A-R1', commit: '173ca67adf0e9a1fa2af18693c0fc3bc42973217', script: 'scripts/audit/c2a-r1-transport-binding.ts', artifactPrefixes: ['c2a-r1-'] },
  c2a: { phase: '11A.5-C2A', commit: '3bb559868ab4e69c8276e85c364be7fbb3fc1d0b', script: 'scripts/audit/c2a-hero-source-census.ts', artifactPrefixes: ['c2a-'] },
  c1c38r1: { phase: 'C1C38R1', commit: '7f4001b956cac441778dbb457cc33041f9057ad5', script: 'scripts/audit/c1c38r1-source-intake.ts', artifactPrefixes: ['c1c38r1-'] },
  c1c38: { phase: 'C1C38', commit: 'dcf017cb2065440251caad8d31075b99bc6355e0', script: 'scripts/audit/c1c38-source-closure.ts', artifactPrefixes: ['c1c38-'] },
  c1c37: { phase: 'C1C37', commit: '3ea7854b33dbfaf6dcbd85e3fb5bf86ffc55b0d3', script: 'scripts/audit/c1c37-successor.ts', artifactPrefixes: ['c1c37-'] },
  c1c36: { phase: 'C1C36', commit: '87f123b881fbbc44d79c312fe1aebb34eadea240', script: 'scripts/audit/c1c36-prophet-production-acceptance.ts', artifactPrefixes: ['c1c36-'] },
  c1c27: { commit: 'aaedb2d30b1e5d90bf8d41e7dbced9f93288f73a', script: 'scripts/audit/verify-complete-edition-c1c27.ts' },
  c1c28: { commit: 'b6fa9180b44cd4a33f9fd4ceed97f179e64fbd0f', script: 'scripts/audit/verify-complete-edition-c1c28.ts' },
  c1c33: { commit: 'e1fcfac0692eb91c5710552ac93e3bacb25f0240', script: 'scripts/audit/c1c33-production-freeze.ts' },
  c1c34: { commit: '051c2c400d391543f5c436cbaa141a54bdf19ac1', script: 'scripts/audit/c1c34-rebaseline.ts' },
  c1c35: { commit: '7b99c36c19159923799b3bda0180af9d8020ef82', script: 'scripts/audit/c1c35-prophet-contract.ts' },
  c1c35r1: { commit: '7a3a483cba0dca0eb537e744980eecd4c55fef24', script: 'scripts/audit/c1c35r1-prophet-contract.ts' },
  c1c35r2: { commit: '101c27c8c15fcb93802f956f399c37ed9c38a2e9', script: 'scripts/audit/c1c35r2-foundation-review.ts' },
  c1c35r2br1: { phase: 'C1C35R2B-R1', commit: '4d1fb9c0af33bb21cf4fa030aa081d5cff3a5106', script: 'scripts/audit/c1c35r2b-foundation.ts', artifactPrefixes: ['c1c35r2br1-'] },
  c1c35r2ar: { phase: 'C1C35R2A-R', commit: '007712ab6aec2c814fa31e06cf5fe05b21a30879', script: 'scripts/audit/c1c35r2a-shared-dispatch.ts', artifactPrefixes: ['c1c35r2a-', 'c1c35r2a-r-'] },
} as const;

// Historical scope is evaluated by the original, unchanged verifier in its own checkout.
// The successor still verifies current frozen evidence; a baseline PASS cannot hide drift.
export function verifyHistoricalBaseline(phase: keyof typeof historicalBaselines, testFiles: string[] = [], probe?: (checkout: string)=>void) {
  // Frozen infrastructure-only rejection is exercised with its original executor, not successor gameplay.
  if(phase==='c1c35r2ar'&&!testFiles.length)testFiles=['src/audit/c1c35r2a-shared-dispatch.test.ts'];
  const fullProphetFoundation=phase==='c1c35r2br1' && !testFiles.length;
  if (fullProphetFoundation) testFiles=['src'];
  const { commit, script } = historicalBaselines[phase];
  const git = (args: string[]) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 });
  git(['merge-base', '--is-ancestor', commit, 'HEAD']);
  verifyHistoricalArtifacts(phase);
  if(phase==='c2d' && !testFiles.length && !probe) {
    const accepted=JSON.parse(readFileSync('docs/data/complete-edition/c2d-production-runtime-acceptance.json','utf8'));
    if(accepted.outcome!=='HERO_PRODUCTION_RUNTIME_FOUNDATION_ACCEPTED') throw new Error('C2D acceptance identity changed');
    console.log('c2d immutable checkpoint: PASS; HERO_PRODUCTION_RUNTIME_FOUNDATION_ACCEPTED');return;
  }
  if (phase === 'c2c' && !testFiles.length && !probe) {
    const accepted = JSON.parse(readFileSync('docs/data/complete-edition/c2c-production-definition-acceptance.json','utf8'));
    if (accepted.outcome !== 'HERO_PRODUCTION_DEFINITION_LAYER_ACCEPTED' || !accepted.C2DAllowed || accepted.runtimeProductionReady || accepted.deferredManualValidationRemaining !== 8) throw new Error('C2C historical acceptance identity changed');
    console.log('c2c immutable checkpoint: PASS; HERO_PRODUCTION_DEFINITION_LAYER_ACCEPTED'); return;
  }
  if(phase==='c2d'&&!testFiles.length&&!probe) {
    const accepted=JSON.parse(readFileSync('docs/data/complete-edition/c2d-production-runtime-acceptance.json','utf8'));
    if(accepted.outcome!=='HERO_PRODUCTION_RUNTIME_FOUNDATION_ACCEPTED'||!accepted.C2EAllowed||accepted.productionReady||accepted.normalPlayerRouteEnabled||accepted.runtimeVersion!=='C2D-HERO-PRODUCTION-RUNTIME-v1')throw new Error('C2D immutable acceptance identity changed');
    console.log('c2d immutable historical checkpoint: PASS; HERO_PRODUCTION_RUNTIME_FOUNDATION_ACCEPTED');return;
  }
  if (phase === 'c2b' && !testFiles.length && !probe) {
    const accepted = JSON.parse(readFileSync('docs/data/complete-edition/c2b-hero-literal-closure-acceptance.json','utf8'));
    if (accepted.outcome !== 'HERO_LITERAL_CLOSURE_BLOCKED' || !accepted.literalTranscriptionComplete || accepted.literalClosureComplete)
      throw new Error('C2B historical acceptance identity changed');
    console.log('c2b immutable historical checkpoint: PASS; HERO_LITERAL_CLOSURE_BLOCKED');
    return;
  }
  if (phase === 'c2a-r1' && !testFiles.length && !probe) {
    const accepted = JSON.parse(readFileSync('docs/data/complete-edition/c2a-r1-hero-source-census-acceptance.json','utf8'));
    if (accepted.outcome !== 'HERO_SOURCE_CENSUS_ACCEPTED' || !accepted.C2BAllowed || accepted.runtimeModified || accepted.prototypePromoted)
      throw new Error('C2A-R1 immutable acceptance identity changed');
    console.log('c2a-r1 immutable acceptance: PASS; HERO_SOURCE_CENSUS_ACCEPTED');
    return;
  }
  if (phase === 'c2a' && !testFiles.length && !probe) {
    const accepted = JSON.parse(readFileSync('docs/data/complete-edition/c2a-hero-source-census-acceptance.json','utf8'));
    if (accepted.outcome !== 'HERO_SOURCE_CENSUS_PARTIAL' || accepted.C2BAllowed || accepted.runtimeProductionReady)
      throw new Error('C2A immutable acceptance identity changed');
    console.log('c2a immutable acceptance: PASS; HERO_SOURCE_CENSUS_PARTIAL');
    return;
  }
  if (phase === 'c1c38r1' && !testFiles.length && !probe) {
    const decision = JSON.parse(readFileSync('docs/data/complete-edition/c1c38r1-source-intake-decision.json', 'utf8'));
    if (decision.outcome !== 'THING_OFFICIAL_SOURCE_INTAKE_PARTIAL' || decision.gateAPassed || decision.runtimeImplementationAuthorized || decision.C1C39Allowed)
      throw new Error('C1C38R1 immutable acceptance identity changed');
    console.log('c1c38r1 immutable acceptance: PASS; THING_OFFICIAL_SOURCE_INTAKE_PARTIAL');
    return;
  }
  if (phase === 'c1c38' && !testFiles.length && !probe) {
    const decision = JSON.parse(readFileSync('docs/data/complete-edition/c1c38-next-workstream-decision.json', 'utf8'));
    if (decision.outcome !== 'THING_SOURCE_CLOSURE_BLOCKED' || decision.gateAPassed || decision.runtimeImplementationAuthorized)
      throw new Error('C1C38 immutable acceptance identity changed');
    console.log('c1c38 immutable acceptance: PASS; THING_SOURCE_CLOSURE_BLOCKED');
    return;
  }
  if (phase === 'c1c37') {
    const read = (name: string) => JSON.parse(readFileSync(`docs/data/complete-edition/c1c37-${name}.json`, 'utf8'));
    const accepted = read('successor-acceptance'), selected = read('next-family-decision');
    const registry = read('production-capability-registry');
    if (accepted.outcome !== 'C1C37-SUCCESSOR-REBASELINE-ACCEPTED'
      || accepted.nextFamily !== 'thing-from-the-stars' || accepted.runtimeImplementationAuthorized
      || accepted.necromancerCompatibility !== 'PASS' || accepted.prophetCompatibility !== 'PASS'
      || selected.selectedFamily !== 'thing-from-the-stars' || selected.productionReady
      || selected.selectionStatus !== 'SOURCE_CLOSURE_CANDIDATE'
      || registry.capabilities.map((c: {familyId: string}) => c.familyId).join(',') !== 'necromancer,prophet')
      throw new Error('C1C37 immutable acceptance identity changed');
    if (!testFiles.length && !probe) { console.log('c1c37 immutable acceptance: PASS'); return; }
  }
  // Immutable acceptance is a byte/identity gate, independent of successor behavior.
  // No full historical browser campaign is needed to prove unchanged evidence.
  if (phase === 'c1c36') {
    const accepted = JSON.parse(readFileSync('docs/data/complete-edition/c1c36-prophet-production-acceptance.json','utf8'));
    if (accepted.outcome !== 'C1C36-PROPHET-PRODUCTION-ACCEPTED' || accepted.decision !== 'PROPHET_PRODUCTION_READY'
      || !accepted.productionAccepted || !accepted.productionReady || accepted.automatedTests.passed !== 2745)
      throw new Error('C1C36 acceptance identity changed');
    if (!testFiles.length && !probe) { console.log('c1c36 immutable acceptance: PASS'); return; }
  }
  const scratch = mkdtempSync(join(tmpdir(), `dd-${phase}-baseline-`));
  const checkout = join(scratch, 'repo');
  if (!resolve(scratch).startsWith(resolve(tmpdir()) + '\\') && !resolve(scratch).startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe scratch cleanup');
  if (!resolve(checkout).startsWith(resolve(scratch) + '\\') && !resolve(checkout).startsWith(resolve(scratch) + '/')) throw new Error('Unsafe checkout cleanup');
  let added = false;
  try {
    if (fullProphetFoundation) {
      // Its unchanged suite creates further C1C27/C1C28 worktrees. Give that
      // nested verifier its own repository/refs, retaining locally available
      // objects via an alternate, then explicitly supply historical objects
      // absent from the Actions checkout.
      git(['clone', '--quiet', '--shared', '--no-checkout', resolve('.'), checkout]);
      supplyProphetHistoricalObjects(checkout);
      execFileSync('git', ['-c', 'core.autocrlf=false', 'checkout', '--quiet', '--detach', commit], { cwd: checkout });
    } else {
      git(['-c', 'core.autocrlf=false', 'worktree', 'add', '--quiet', '--detach', checkout, commit]);
      added = true;
    }
    // These phases used an ignored rulebook. Supply only the exact, now vendored locked bytes.
    if (!existsSync(join(checkout, 'docs/DD_EN_COREBOX_RULES.pdf'))) {
      const locked = JSON.parse(readFileSync('docs/data/complete-edition/c1a-rulebook-evidence.json', 'utf8'));
      const pdf = readFileSync('docs/DD_EN_COREBOX_RULES.pdf');
      if (createHash('sha256').update(pdf).digest('hex') !== locked.sha256) throw new Error('Locked rulebook mismatch');
      copyFileSync('docs/DD_EN_COREBOX_RULES.pdf', join(checkout, 'docs/DD_EN_COREBOX_RULES.pdf'));
    }
    symlinkSync(resolve('node_modules'), join(checkout, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const flags = (phase === 'c2a' || phase === 'c2b' || phase === 'c2c') ? ['--verify'] : phase === 'c1c35r2br1' ? ['--verify-r2b'] : phase === 'c1c35r2ar' ? ['--verify-dispatch'] : phase === 'c1c35r1' ? ['--verify-r1'] : phase === 'c1c35r2' ? ['--verify-r2'] : phase.startsWith('c1c3') ? ['--verify'] : [];
    if (phase !== 'c1c36') execFileSync(process.execPath, ['--import', pathToFileURL(resolve('scripts/audit/legacy-transport-preload.mjs')).href, resolve('node_modules/vite-node/vite-node.mjs'), script, ...flags],
      { cwd: checkout, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, DDBG_LEGACY_TRANSPORT_ARCHIVE: resolve('docs/data/complete-edition/source-assets/c1c34/legacy-transport.json.gz') } });
    if (testFiles.length) {
      const report=join(scratch,'historical-tests.json');
      try {
        execFileSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', ...testFiles, '--maxWorkers=1', '--minWorkers=1', '--reporter=json', '--outputFile', report], {cwd: checkout, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024});
      } catch(error) {
        if(existsSync(report)) {
          const failed=JSON.parse(readFileSync(report,'utf8'));
          const failures=failed.testResults.flatMap((suite:any)=>suite.assertionResults.filter((t:any)=>t.status==='failed').map((t:any)=>({file:suite.name,test:t.fullName,messages:t.failureMessages})));
          throw new Error('Historical test failure '+phase+': '+JSON.stringify({passed:failed.numPassedTests,failed:failed.numFailedTests,failedSuites:failed.numFailedTestSuites,pending:failed.numPendingTests,todo:failed.numTodoTests,
            suiteFailures:failed.testResults.filter((s:any)=>s.status==='failed').map((s:any)=>({file:s.name,message:s.message})),failures}));
        }
        throw error;
      }
      const tests=JSON.parse(readFileSync(report,'utf8'));
      if (tests.numFailedTests || tests.numFailedTestSuites || tests.numPendingTests || tests.numTodoTests) throw new Error('Historical suites require zero failed/pending/todo');
      if(fullProphetFoundation && (tests.numPassedTests!==2729 || tests.testResults.find((r:{name:string})=>r.name.replace(/\\/g,'/').endsWith('/c1c35r2br1-prophet-production.test.ts'))?.assertionResults.length!==67))
        throw new Error('R2B-R1 requires exactly 2729 regression tests and 67 targeted tests');
      console.log(`${phase} unchanged historical suites: ${tests.numPassedTests} passed; 0 failed / pending / todo`);
    }
    probe?.(checkout);
  } finally {
    // Only remove the junction itself; never recurse through the shared dependency directory.
    if (existsSync(join(checkout, 'node_modules'))) unlinkSync(join(checkout, 'node_modules'));
    if (added) git(['worktree', 'remove', '--force', checkout]);
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(`${phase} immutable baseline ${commit}: PASS; current frozen evidence: PASS`);
}

export function verifyHistoricalArtifacts(phase: keyof typeof historicalBaselines) {
  const checkpoint = historicalBaselines[phase];
  const {commit} = checkpoint;
  const prefixes = 'artifactPrefixes' in checkpoint ? checkpoint.artifactPrefixes : [`${phase}-`];
  const git = (args: string[]) => execFileSync('git', args, {maxBuffer: 128 * 1024 * 1024});
  const entries = git(['ls-tree', '-r', '--name-only', commit]).toString().trim().split(/\r?\n/)
    .filter(p => (phase === 'c2c' && (p.startsWith('src/data/heroes/production-') || p === 'src/types/hero-production.ts' || p === 'docs/data/complete-edition/source-ambiguity-defer-policy-v1.json')) || p.split('/').some(part=>prefixes.some(prefix=>part.startsWith(prefix))) || (phase === 'c2b' && /(^|[/_-])c2b([/_.-]|$)/.test(p)) || (phase === 'c2a-r1' && /(^|[/_-])c2a-r1([/_.-]|$)/.test(p)) || (phase === 'c2a' && /(^|[/_-])c2a([/_.-]|$)/.test(p)) || (phase === 'c1c38' && /(^|[/_-])c1c38([/_.-]|$)/.test(p)) || (phase === 'c1c38r1' && /(^|[/_-])c1c38r1([/_.-]|$)/.test(p)));
  if (phase === 'c2a' || phase === 'c2a-r1' || phase === 'c2b' || phase === 'c2c') {
    const actual=execFileSync('git',['hash-object','--stdin-paths'],{input:entries.join('\n')+'\n',maxBuffer:128*1024*1024}).toString().trim().split(/\r?\n/);
    const blobs=new Map(git(['ls-tree','-r',commit]).toString().trim().split(/\r?\n/).map(line=>{const [meta,path]=line.split('\t');return [path,meta.split(' ')[2]];}));
    for(const [i,path] of entries.entries()) if(actual[i]!==blobs.get(path)) {
      const original=git(['show', `${commit}:${path}`]);
      if (!/\.(?:json|ts|mjs|py|md)$/.test(path) || original.toString('utf8').replace(/\r\n/g,'\n')!==readFileSync(path,'utf8').replace(/\r\n/g,'\n')) throw new Error('Frozen '+phase+' evidence changed: '+path);
    }
    return entries.length;
  }
  for (const path of entries) if (!git(['show', `${commit}:${path}`]).equals(readFileSync(path))) throw new Error(`Frozen ${phase} evidence changed: ${path}`);
  return entries.length;
}

/** Compatibility alias for evidence consumers. Exact runtime verification belongs in the accepted checkout. */
export function verifyCurrentFreeze() {
  verifyHistoricalArtifacts('c1c33');
  const manifest = JSON.parse(readFileSync('docs/data/complete-edition/c1c33-necromancer-production-freeze-manifest.json', 'utf8'));
  for (const [path, expected] of Object.entries({ ...manifest.evidenceHashes, ...manifest.acceptanceHashes })) {
    if (createHash('sha256').update(readFileSync(path)).digest('hex') !== expected) throw new Error(`Frozen production evidence changed: ${path}`);
  }
}
