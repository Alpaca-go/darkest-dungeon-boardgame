import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EXPECTED_TEST_IDS, readStructuredReport, SUITES } from './community-engine-final-acceptance-contract';

/** Mutate the actual production module in an isolated Vite child, never the working tree. */
export function runProductionMutation(file: string, from: string, to: string, testId: string) {
  const root = process.cwd();
  if (readFileSync(resolve(root, file), 'utf8').split(from).length !== 2) throw new Error(`Mutation anchor must occur once: ${file}`);
  const scratch = mkdtempSync(join(tmpdir(), 'community-capability-mutation-'));
  const reportPath = join(scratch, 'result.json'); const configPath = join(scratch, 'vite.config.mts');
  const baseConfig = resolve(root, 'vite.config.ts').split('\\').join('/');
  writeFileSync(configPath, `import base from ${JSON.stringify(baseConfig)};
export default { ...base, root: ${JSON.stringify(root)}, plugins: [...base.plugins, { name: 'acceptance-production-mutation', enforce: 'pre', transform(code, id) { if (id.replaceAll('\\\\','/').split('?')[0].endsWith(${JSON.stringify('/' + file)})) { if (!code.includes(${JSON.stringify(from)})) throw new Error('Mutation anchor missing'); return code.replace(${JSON.stringify(from)}, ${JSON.stringify(to)}); } } }], test: { ...base.test, pool: 'forks', maxWorkers: 1, minWorkers: 1 } };\n`);
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', SUITES.production, '--config', configPath, '--reporter=json', `--outputFile=${reportPath}`], { cwd: root, encoding: 'utf8', timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  const rows = readStructuredReport(JSON.parse(readFileSync(reportPath, 'utf8')));
  if (rows.length !== EXPECTED_TEST_IDS.production.length) throw new Error('Mutation discovery differs from production contract');
  if (rows.some(row => !['passed', 'failed'].includes(row.status))) throw new Error('Mutation run skipped a test');
  const matching = rows.filter(row => row.title.startsWith(`${testId} `));
  return { exitCode: result.status, discovered: matching.length, failed: matching.filter(row => row.status === 'failed').length, rows: matching, diagnostics: `${result.stdout}\n${result.stderr}` };
}
