// Phase 11A.3 Source-Gate Integrity Repair §10：
// Production Command Audit 独立 command。
//
// 之前 productionCommandLayerPasses 是 in-process 计算的（run-audit.ts
// 在内部调 runProductionCommandAudit()）。本阶段把它提升为独立 command，
// 方便 verify:phase11a3-source-gate pipeline 把 measured 状态写进
// verification-results.json。
//
// 输出：
//   - exit 0: audit pass（productionCommandLayerPasses=true）
//   - exit 1: audit fail

import { runProductionCommandAudit } from '../../src/audit/core-campaign/production-command-audit';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = 'docs/data/core-campaign';

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const result = runProductionCommandAudit();
writeFileSync(
  join(DATA_DIR, 'production-command-audit.json'),
  JSON.stringify(result, null, 2) + '\n',
  'utf-8',
);

console.log('====================');
console.log('  audit:production-command');
console.log('====================');
console.log(`productionCommandLayerPasses: ${result.productionCommandLayerPasses}`);
console.log(`headlessShimFileExists       : ${result.headlessShimFileExists}`);
console.log(`driver shim import count     : ${result.simulationDriverShimImportCount}`);
console.log(`route contract expected      : ${result.commandRouteExpectedCount}`);
console.log(`route contract classified    : ${result.commandRouteClassifiedCount}`);
console.log(`route contract validated      : ${result.commandRouteValidatedCount}`);
console.log(`route violations             : ${result.routeViolations.length}`);
console.log(`import source violations     : ${result.importSourceViolations.length}`);
console.log(`differential coverage        : ${result.differentialImplementedCount}/${result.differentialExpectedCount}`);
console.log(`test policy boundary passes  : ${result.testPolicyBoundaryPasses}`);
console.log('');

if (result.routeViolations.length > 0) {
  console.log('Route violations:');
  for (const v of result.routeViolations) console.log(`  - ${v}`);
}
if (result.importSourceViolations.length > 0) {
  console.log('Import source violations:');
  for (const v of result.importSourceViolations) console.log(`  - ${v}`);
}

if (!result.productionCommandLayerPasses) {
  console.error('FAIL — production command layer not ready.');
  process.exit(1);
}
process.exit(0);
