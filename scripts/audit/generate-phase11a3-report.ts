import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const data = join(root, 'docs/data/core-campaign');
const reportDir = join(root, 'docs/reports/phase-11a3');
const required = ['verification-results.json', 'release-gate.json', 'source-readiness.json', 'official-source-summary.json', 'issue-ledger.json'];

function read(name: string): Record<string, any> {
  const path = join(data, name);
  if (!existsSync(path)) throw new Error(`missing final artifact: ${name}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(): number {
  const artifacts = Object.fromEntries(required.map((name) => [name, read(name)]));
  const vr = artifacts['verification-results.json'];
  const gate = artifacts['release-gate.json'];
  const summary = artifacts['official-source-summary.json'];
  const readiness = artifacts['source-readiness.json'];
  const ledger = artifacts['issue-ledger.json'];
  if (vr.runId !== gate.runId || vr.verificationInputHash !== gate.verificationInputHash || vr.sourceInputHash !== readiness.sourceInputHash || vr.sourceInputHash !== gate.sourceInputHash) {
    throw new Error('final artifact identity mismatch');
  }
  mkdirSync(reportDir, { recursive: true });
  const lines = [
    '# Phase 11A.3 Source-Gate Final Acceptance Report', '',
    `- runId: \`${vr.runId}\``,
    `- verificationInputHash: \`${vr.verificationInputHash}\``,
    `- sourceInputHash: \`${vr.sourceInputHash}\``,
    `- phase11A3Status: **${vr.phase11A3Status}**`,
    `- release verdict: **${gate.verdict ?? 'UNKNOWN'}**`,
    `- requiredMissingCount: **${summary.requiredMissingCount ?? 'UNKNOWN'}**`,
    `- optionalMissingCount: **${summary.optionalMissingCount ?? 'UNKNOWN'}**`,
    `- allRequiredSourcesReady: **${readiness.gates?.allRequiredSourcesReady ?? false}**`,
    `- openP0 / openP1: **${ledger.openP0 ?? 'UNKNOWN'} / ${ledger.openP1 ?? 'UNKNOWN'}**`,
    `- canBeginOfficialImport: **${gate.canBeginOfficialImport ?? false}**`,
    `- canCloseP0_002: **${gate.canCloseP0_002 ?? false}**`,
    `- canEnterPhase11B: **${gate.canEnterPhase11B ?? false}**`, '',
    '## Verification', '',
    '| Check | Result |', '| --- | --- |',
    `| engineeringRegressionPasses | ${vr.engineeringRegressionPasses} |`,
    `| verifierHealthy | ${vr.verifierHealthy} |`,
    `| verificationFresh | ${vr.verificationFresh} |`,
    `| officialSourceAuditPasses | ${vr.officialSourceAuditPasses} |`,
    `| fieldProvenanceValidated | ${vr.fieldProvenanceValidated} |`,
    '', 'This report is generated exclusively from the five final JSON artifacts listed above.',
  ];
  writeFileSync(join(reportDir, 'phase-11a3-source-gate-final-acceptance-report.md'), lines.join('\n') + '\n', 'utf8');
  return 0;
}

try { process.exit(main()); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
