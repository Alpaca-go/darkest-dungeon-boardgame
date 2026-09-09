/**
 * Phase 11A.3 infrastructure freeze acceptance.
 * This is deliberately a consumer of measured evidence, never a replacement
 * for the normal verifier or a source of formal-runtime matrix evidence.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeVerificationInputHash } from '../../src/audit/core-campaign/verification-input';

const root = process.cwd();
const data = join(root, 'docs/data/core-campaign');
const read = (name: string): Record<string, any> => JSON.parse(readFileSync(join(data, name), 'utf8'));
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

function runCleanEvidence(): void {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const command = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : npm;
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `${npm} run verify:phase11a3-clean-evidence`]
    : ['run', 'verify:phase11a3-clean-evidence'];
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) throw new Error(`clean evidence rebuild exited ${result.status}`);
}

function main(): void {
  const verification = read('verification-results.json');
  const gate = read('release-gate.json');
  const summary = read('official-source-summary.json');
  const matrix = gate.officialGuardianMatrix ?? {};
  const normalVerification = {
    runId: verification.runId,
    verificationInputHash: verification.verificationInputHash,
    sourceInputHash: verification.sourceInputHash,
    verifierHealthy: verification.verifierHealthy,
    engineeringRegressionPasses: verification.engineeringRegressionPasses,
    verificationFresh: verification.verificationFresh,
    unmeasuredGateBits: verification.unmeasuredGateBits ?? [],
    consistencyErrors: verification.consistencyErrors ?? [],
  };
  const fresh = normalVerification.verificationInputHash === computeVerificationInputHash();
  const businessTruth = gate.phase11A3Status === 'SOURCE-BLOCKED' && gate.verdict === 'SOURCE-BLOCKED' &&
    summary.requiredMissingCount === 26 && summary.optionalMissingCount === 1 &&
    gate.openP0 === 1 && gate.openP1 === 0 && gate.onlyOpenP0 === 'ISSUE-P0-002' &&
    matrix.status === 'SOURCE-BLOCKED' && matrix.combinationsRun === 0 &&
    gate.canCloseP0_002 === false && gate.canEnterPhase11B === false && gate.canBeginOfficialImport === false;
  const normalPasses = fresh && normalVerification.verifierHealthy === true &&
    normalVerification.engineeringRegressionPasses === true && normalVerification.verificationFresh === true &&
    normalVerification.unmeasuredGateBits.length === 0 && normalVerification.consistencyErrors.length === 0;
  if (!normalPasses || !businessTruth) {
    const artifact = { schemaVersion: 'phase-11a3/infrastructure-acceptance.v1', headSha, normalVerification, cleanEvidenceRebuildPasses: false, currentBusinessState: gate.phase11A3Status, requiredMissingCount: summary.requiredMissingCount, optionalMissingCount: summary.optionalMissingCount, openP0: gate.openP0, openP1: gate.openP1, formalMatrixStatus: matrix.status, formalMatrixCombinationsRun: matrix.combinationsRun, canCloseP0_002: gate.canCloseP0_002, canEnterPhase11B: gate.canEnterPhase11B, infrastructureAccepted: false };
    writeFileSync(join(data, 'phase11a3-infrastructure-acceptance.json'), JSON.stringify(artifact, null, 2) + '\n');
    throw new Error(`normal evidence rejected: fresh=${fresh}, normalPasses=${normalPasses}, businessTruth=${businessTruth}`);
  }
  runCleanEvidence();
  const artifact = { schemaVersion: 'phase-11a3/infrastructure-acceptance.v1', headSha, normalVerification, cleanEvidenceRebuildPasses: true, currentBusinessState: 'SOURCE-BLOCKED', requiredMissingCount: 26, optionalMissingCount: 1, openP0: 1, openP1: 0, formalMatrixStatus: 'SOURCE-BLOCKED', formalMatrixCombinationsRun: 0, canCloseP0_002: false, canEnterPhase11B: false, infrastructureAccepted: true };
  writeFileSync(join(data, 'phase11a3-infrastructure-acceptance.json'), JSON.stringify(artifact, null, 2) + '\n');
  console.log(`Phase 11A.3 infrastructure acceptance: PASS (${headSha})`);
}

try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
