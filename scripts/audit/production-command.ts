import { runProductionCommandAudit } from '../../src/audit/core-campaign/production-command-audit';
import { writeJson } from './io';
const pca = runProductionCommandAudit();
writeJson('production-command-audit.json', {
  ...pca,
  routeExpected: pca.commandRouteExpectedCount,
  routeValidated: pca.commandRouteValidatedCount,
  shimExists: pca.headlessShimFileExists,
  policyBoundaryPasses: pca.testPolicyBoundaryPasses,
});
if (!pca.productionCommandLayerPasses) process.exitCode = 1;
