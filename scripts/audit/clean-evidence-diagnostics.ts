import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACTS = [
  'verification-results.json',
  'release-gate.json',
  'phase11a3-pre-gate-evidence.json',
  'source-readiness.json',
  'issue-ledger.json',
] as const;

type JsonRecord = Record<string, unknown>;

function readJson(path: string): JsonRecord | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JsonRecord;
  } catch {
    return null;
  }
}

export interface CleanFailureDiagnostic {
  diagnosticPath: string;
  childExitCode: number;
  childRunId: string | null;
  missing: string[];
  releaseGate: JsonRecord | null;
  verification: JsonRecord | null;
}

/** Preserve the child evidence before its disposable worktree is removed. */
export function preserveCleanFailureDiagnostics(input: {
  root: string;
  temp: string;
  childExitCode: number;
}): CleanFailureDiagnostic {
  const data = join(input.temp, 'docs/data/core-campaign');
  const verification = readJson(join(data, 'verification-results.json'));
  const releaseGate = readJson(join(data, 'release-gate.json'));
  const childRunId = typeof verification?.runId === 'string' ? verification.runId : null;
  const diagnosticPath = join(
    input.root,
    '.phase11a3-clean-diagnostics',
    childRunId ?? `missing-run-${Date.now()}`,
  );
  const missing: string[] = [];
  mkdirSync(diagnosticPath, { recursive: true });

  for (const name of ARTIFACTS) {
    const source = join(data, name);
    if (!existsSync(source)) {
      missing.push(name);
      continue;
    }
    cpSync(source, join(diagnosticPath, name));
  }

  if (childRunId) {
    const sourceLogs = join(data, 'verification-runs', childRunId, 'logs');
    if (existsSync(sourceLogs)) {
      cpSync(sourceLogs, join(diagnosticPath, 'verification-runs', childRunId, 'logs'), {
        recursive: true,
      });
    } else {
      missing.push(`verification-runs/${childRunId}/logs`);
    }
  } else {
    missing.push('verification run id');
  }

  const diagnostic: CleanFailureDiagnostic = {
    diagnosticPath,
    childExitCode: input.childExitCode,
    childRunId,
    missing,
    releaseGate,
    verification,
  };
  writeFileSync(join(diagnosticPath, 'summary.json'), JSON.stringify(diagnostic, null, 2) + '\n');
  return diagnostic;
}

export function formatCleanFailureDiagnostic(diagnostic: CleanFailureDiagnostic): string {
  const gate = diagnostic.releaseGate ?? {};
  const verification = diagnostic.verification ?? {};
  const measuredBits = [
    'typecheckPasses', 'unitPasses', 'commandContractPasses', 'integrationPasses',
    'buildPasses', 'criticalE2EPasses', 'criticalE2ELifecyclePasses', 'goldenTestPasses',
    'replayDeterminismPasses', 'replayContinuationPasses', 'productionCommandLayerPasses',
    'officialSourceAuditPasses', 'contentAuditPasses', 'rulesAuditPasses',
    'fieldProvenanceValidated',
  ].map((key) => `${key}=${String(verification[key])}`);
  return [
    'Clean evidence child failed:',
    `childExitCode=${diagnostic.childExitCode}`,
    `childRunId=${diagnostic.childRunId ?? 'missing'}`,
    `releaseGate.verdict=${String(gate.verdict)}`,
    `releaseGate.phase11A3Status=${String(gate.phase11A3Status)}`,
    `releaseGate.conclusion=${String(gate.conclusion)}`,
    `verification.verifierHealthy=${String(verification.verifierHealthy)}`,
    `verification.engineeringRegressionPasses=${String(verification.engineeringRegressionPasses)}`,
    `verification.verificationFresh=${String(verification.verificationFresh)}`,
    ...measuredBits,
    `unmeasuredGateBits=${JSON.stringify(verification.unmeasuredGateBits ?? [])}`,
    `consistencyErrors=${JSON.stringify(verification.consistencyErrors ?? [])}`,
    `missing=${JSON.stringify(diagnostic.missing)}`,
    `diagnosticPath=${diagnostic.diagnosticPath}`,
  ].join('\n');
}
