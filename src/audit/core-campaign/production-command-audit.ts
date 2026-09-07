// Phase 11A.2.2 WP-A — Production Command Audit。
//
// Structural checks（替代 dev doc §2 False Green 中的 event marker 伪修复）。
// productionCommandLayerPasses 必须由此结构计算：
//   !shimExists && driverShimImports===0 && driverCoverage===total
//   && no store leaks && no driver leaks
//   && differentialPasses && policyBoundaryPasses

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import {
  runGameCommandRouteAudit,
  type GameCommandRouteAuditResult,
} from './game-command-route-contract';

const SRC = join(process.cwd(), 'src');

/** Audit 实际核查的结构事实。 */
export interface ProductionCommandAuditResult {
  /** headless-shim.ts 文件是否存在。 */
  headlessShimFileExists: boolean;
  /** simulation-driver.ts 中引用 headless-shim 的次数。 */
  simulationDriverShimImportCount: number;
  /** Driver dispatch case body 引用 production command 名字的 case 数（诊断字段；11A.2.3 §3 起不再参与 gate）。 */
  simulationDriverProductionCommandCoverage: number;
  /** Driver high-level dispatch 的总 case 数（诊断字段）。 */
  simulationDriverTotalHighLevelDispatches: number;
  /** Route Contract 统计（11A.2.3 §3 替代 coverage >= N 假修复）。 */
  commandRouteExpectedCount: number;
  commandRouteClassifiedCount: number;
  commandRouteValidatedCount: number;
  unclassifiedCommands: string[];
  routeViolations: string[];
  /** Store 直接 import 原子编排步骤的函数名列表。 */
  storeDirectAtomicOrchestrationLeaks: string[];
  /** Driver 直接 import 原子编排步骤的函数名列表。 */
  driverDirectAtomicOrchestrationLeaks: string[];
  /** Differential 期望数量（14）。 */
  differentialExpectedCount: number;
  /** Differential 实际实现数量。 */
  differentialImplementedCount: number;
  /** Differential Coverage 是否完整。 */
  differentialPasses: boolean;
  /** Test Policy 是否仅通过 Production Commands 改 State。 */
  testPolicyBoundaryPasses: boolean;
  /** 详细 route 表（commandType → { routeKind, validated }）。 */
  routeDetails: GameCommandRouteAuditResult['details'];
  /** 结构化判定。 */
  productionCommandLayerPasses: boolean;
}

const SHIM_PATH = 'src/audit/core-campaign/headless-shim.ts';
const DRIVER_PATH = 'src/audit/core-campaign/simulation-driver.ts';
const STORE_PATH = 'src/store/useGameStore.ts';
const POLICIES_GLOB = 'src/testing/policies';

const ATOMIC_ORCHESTRATION = [
  'processBattleDeaths',
  'processBattleStressEvents',
  'processBattleRuleEvents',
  'processBattleDiseaseInfections',
  'openRoomEnteredWindows',
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

function readSafe(p: string): string {
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function findImports(text: string, target: string): string[] {
  // 匹配 `import ... '...target...'` 和 `import '...target...'`
  const re = new RegExp(`from\\s+['"][^'"]*${target.replace(/[/.]/g, '\\$&')}[^'"]*['"]`, 'g');
  return text.match(re) ?? [];
}

function findTermInText(text: string, term: string): boolean {
  // 排除注释与字符串字面量
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  return new RegExp(`\\b${term}\\b`).test(stripped);
}

function countDriverDispatches(driverText: string): number {
  // 高层 dispatch case 数：只算 GameCommand 类型的 case（驼峰命名），不算 phase routing case（kebab-case）。
  // GameCommand 类型 case 形如 `case 'newCampaign':` / `case 'proceedToLoadout':`，
  // 而 phase routing case 形如 `case 'home':` / `case 'campaign-setup':`。
  // 用 camelCase 区分（至少有一个大写字母的 case 名视为 command case）。
  const re = /case\s+['"]([a-zA-Z][a-zA-Z]*)['"]\s*:/g;
  const matches = driverText.match(re) ?? [];
  let count = 0;
  for (const m of matches) {
    // 提取 case 名字，必须包含大写字母（驼峰）
    const nameMatch = m.match(/case\s+['"]([a-zA-Z][a-zA-Z]*)['"]/);
    if (nameMatch && /[A-Z]/.test(nameMatch[1])) {
      count += 1;
    }
  }
  return count;
}

function countProductionCommandUsage(driverText: string): number {
  // 提取每个 dispatch case body，检查是否调用了任一 production command（已 import 的）函数名。
  // 步骤：
  //   1) 从 import 块提取所有 from '.../commands' 的标识符
  //   2) 把每个 case body 拆出来，统计其中至少引用一个 production command 的 case 数
  // 不在 case body 但被引用的不算（例如 'engine' case 走的是 engine.apply callback）。
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*\/commands(?:\/[^'"]*)?['"]/g;
  const importedNames = new Set<string>();
  for (const m of driverText.matchAll(importRe)) {
    for (const ident of m[1].split(',')) {
      const name = ident.trim().split(/\s+as\s+/).pop()!.replace(/^type\s+/, '').trim();
      if (name) importedNames.add(name);
    }
  }
  const caseRe = /case\s+['"][a-zA-Z]+['"]\s*:[\s\S]*?(?=case\s+['"]|default\s*:|\}$)/g;
  const cases = driverText.match(caseRe) ?? [];
  let count = 0;
  for (const c of cases) {
    for (const name of importedNames) {
      const re = new RegExp(`\\b${name}\\b`);
      if (re.test(c)) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

/** 检查 Test Policy 是否仅通过 Production Commands 改 State。 */
function checkPolicyBoundary(): boolean {
  const policyFiles = walk(join(SRC.replace('src', ''), POLICIES_GLOB));
  if (policyFiles.length === 0) return false;

  // 禁止 Test Policy 包含：直接改 stagecoach/hero.hp/battle.status/pending* 等
  const DIRECT_MUTATION_PATTERNS = [
    /\.stagecoach\s*[:=]\s*\{/,
    /hero\.hp\s*=/,
    /hero\.stress\s*=/,
    /battle\.status\s*=/,
    /pending\w+\s*=\s*\[\]/,
  ];
  for (const f of policyFiles) {
    const text = readFileSync(f, 'utf8');
    for (const p of DIRECT_MUTATION_PATTERNS) {
      if (p.test(text)) return false;
    }
  }
  return true;
}

/** 主入口：运行结构化 Production Command Audit。 */
export function runProductionCommandAudit(): ProductionCommandAuditResult {
  const shimPath = join(SRC.replace('src', ''), SHIM_PATH);
  const driverPath = join(SRC.replace('src', ''), DRIVER_PATH);
  const storePath = join(SRC.replace('src', ''), STORE_PATH);

  const shimExists = existsSync(shimPath);
  const driverText = readSafe(driverPath);
  const storeText = readSafe(storePath);

  // 1. Shim file exists
  const headlessShimFileExists = shimExists;

  // 2. Driver shim imports（headless-shim）
  const driverShimImports = findImports(driverText, './headless-shim');
  const simulationDriverShimImportCount = driverShimImports.length;

  // 3. Store / Driver direct atomic orchestration leaks
  const storeDirectAtomicOrchestrationLeaks = ATOMIC_ORCHESTRATION.filter((fn) =>
    findTermInText(storeText, fn),
  );
  const driverDirectAtomicOrchestrationLeaks = ATOMIC_ORCHESTRATION.filter((fn) =>
    findTermInText(driverText, fn),
  );

  // 4. Driver dispatch coverage（11A.2.3 §3 起由 Route Contract 主导；保留为诊断字段）
  // 注意：countDriverDispatches / countProductionCommandUsage 在 Route Contract 引入后
  // 不再参与 gate 判定，但仍可用于诊断输出。
  const simulationDriverTotalHighLevelDispatches = countDriverDispatches(driverText);
  const simulationDriverProductionCommandCoverage = countProductionCommandUsage(driverText);

  // 5. Differential coverage
  // 简单实现：扫描 command-differential.test.ts 中的 test 名是否覆盖 D-01..D-14
  const diffPath = join(SRC, 'audit/core-campaign/command-differential.test.ts');
  const diffText = readSafe(diffPath);
  const differentialExpectedCount = 14;
  let differentialImplementedCount = 0;
  for (let i = 1; i <= 14; i++) {
    const tag = `D-${String(i).padStart(2, '0')}`;
    if (diffText.includes(tag)) differentialImplementedCount += 1;
  }
  const differentialPasses = differentialImplementedCount === differentialExpectedCount;

  // 6. Test Policy boundary
  const testPolicyBoundaryPasses = checkPolicyBoundary();

  // 7. GameCommand Route Contract（11A.2.3 §3 替代 MIN_DRIVER_PRODUCTION_COVERAGE）
  // 严禁 coverage >= N 假修复：每个 GameCommand 必须 exactly one route 且静态验证真实调用。
  const routeAudit = runGameCommandRouteAudit();
  const routeCoveragePasses =
    routeAudit.commandRouteClassifiedCount === routeAudit.commandRouteExpectedCount &&
    routeAudit.unclassifiedCommands.length === 0 &&
    routeAudit.routeViolations.length === 0;

  // 8. productionCommandLayerPasses：结构化判定（11A.2.3 §5）
  //   - shim absent
  //   - Driver shim imports 0
  //   - Route 100% classified
  //   - Route 100% validated
  //   - no orchestration leaks
  //   - command contract pass
  //   - test policy boundary pass
  const productionCommandLayerPasses =
    !headlessShimFileExists &&
    simulationDriverShimImportCount === 0 &&
    routeCoveragePasses &&
    storeDirectAtomicOrchestrationLeaks.length === 0 &&
    driverDirectAtomicOrchestrationLeaks.length === 0 &&
    differentialPasses &&
    testPolicyBoundaryPasses;

  return {
    headlessShimFileExists,
    simulationDriverShimImportCount,
    simulationDriverProductionCommandCoverage,
    simulationDriverTotalHighLevelDispatches,
    commandRouteExpectedCount: routeAudit.commandRouteExpectedCount,
    commandRouteClassifiedCount: routeAudit.commandRouteClassifiedCount,
    commandRouteValidatedCount: routeAudit.commandRouteValidatedCount,
    unclassifiedCommands: routeAudit.unclassifiedCommands,
    routeViolations: routeAudit.routeViolations,
    storeDirectAtomicOrchestrationLeaks,
    driverDirectAtomicOrchestrationLeaks,
    differentialExpectedCount,
    differentialImplementedCount,
    differentialPasses,
    testPolicyBoundaryPasses,
    routeDetails: routeAudit.details,
    productionCommandLayerPasses,
  };
}
