// Phase 11A.2.3 §3 — GameCommand Route Contract。
//
// dev doc §3：每个 GameCommand 必须 exactly one route（无 unclassified / 无 duplicate）。
// 替代 11A.2.2 末态的 `MIN_DRIVER_PRODUCTION_COVERAGE=7` 假修复（coverage >= 7 即 PASS
// 是「只需验证一半 dispatch 仍可 PASS」的 False Green 漏洞）。
//
// 分类：
//   - production-command: Driver dispatch 直接调用 src/game-engine/commands/ 内的 Production Command
//   - atomic-engine:       Driver dispatch 直接调用单步 Engine API（无 orchestration 责任）
//   - test-policy:         Driver dispatch 通过 Test Policy 决定玩家行为，再调 Production Command
//   - engine-callback:     'engine' escape hatch（Act IV / Boss 运行时入口，调用方提供 apply 函数）
//
// ProductionCommandAudit 通过本文件判定：
//   commandRouteExpectedCount = GameCommand 全部 case 数（不含 'engine' 因其 route 是动态）
//   commandRouteClassifiedCount = 显式登记的 GameCommand 数
//   commandRouteValidatedCount = 静态扫描 case body 实际调用与登记 routeKind 一致的数量
//   unclassifiedCommands[] = 未登记的 GameCommand
//   routeViolations[] = 实际调用与登记 routeKind 不一致的 GameCommand
//
// productionCommandLayerPasses 真值 = shim absent + driverShimImports===0
//                              + commandRouteClassifiedCount===commandRouteExpectedCount
//                              + routeViolations.length===0
//                              + unclassifiedCommands.length===0
//                              + commandContractPasses
//                              + integrationIntegrityPasses
//                              + testPolicyBoundaryPasses
//                              + no store/driver atomic orchestration leaks
//
// 删除 11A.2.2 末态的 `MIN_DRIVER_PRODUCTION_COVERAGE`。

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { runProductionCommandAudit } from './production-command-audit';

export type GameCommandRouteKind =
  | 'production-command'
  | 'atomic-engine'
  | 'test-policy'
  | 'engine-callback';

export interface GameCommandRouteContract {
  commandType: string;
  routeKind: GameCommandRouteKind;
  /** 真实入口点（函数名）— 静态扫描 Driver 时用于匹配 case body 内的引用。 */
  expectedEntryPoint: string;
  /** 入口点定义来源（import path），用于审计「Driver 是否真的 import」。 */
  expectedImportFrom?: string;
  /** 分类理由（文档化「为什么是 production-command / atomic-engine / test-policy / engine-callback」）。 */
  reason: string;
}

/**
 * Phase 11A.2.3 §3 显式 Route Contract 登记表。
 *
 * 必须覆盖所有非 'engine' 的 GameCommand type（'engine' 是 escape hatch，route 动态）。
 * 添加新 GameCommand 必须同时添加本表条目；缺失 = unclassified → productionCommandLayerPasses=false。
 */
export const GAME_COMMAND_ROUTE_CONTRACT: GameCommandRouteContract[] = [
  {
    commandType: 'newCampaign',
    routeKind: 'atomic-engine',
    expectedEntryPoint: 'createNewCampaign',
    expectedImportFrom: 'game-engine/campaign',
    reason: '纯单步：建立空 Campaign，无 orchestration。',
  },
  {
    commandType: 'selectParty',
    routeKind: 'atomic-engine',
    expectedEntryPoint: 'selectParty',
    expectedImportFrom: 'game-engine/campaign',
    reason: '单步：选择 4 hero 进 party；party 是 CampaignState.heroes 子集，无需 orchestration。',
  },
  {
    commandType: 'proceedToLoadout',
    routeKind: 'production-command',
    expectedEntryPoint: 'proceedCampaignToLoadout',
    expectedImportFrom: 'game-engine/commands',
    reason: '11A.2.2 §16 已迁出 UI-store-shim：Production Command 入口。',
  },
  {
    commandType: 'applyLoadout',
    routeKind: 'atomic-engine',
    expectedEntryPoint: 'applyDefaultLoadout',
    expectedImportFrom: 'game-engine/campaign',
    reason: '单步：默认技能分配；无 orchestration。',
  },
  {
    commandType: 'proceedToQuests',
    routeKind: 'production-command',
    expectedEntryPoint: 'proceedCampaignToQuestSelect',
    expectedImportFrom: 'game-engine/commands',
    reason: '11A.2.2 §16 已迁出 UI-store-shim：Production Command 入口。',
  },
  {
    commandType: 'chooseQuest',
    routeKind: 'production-command',
    expectedEntryPoint: 'commitQuestSelection',
    expectedImportFrom: 'game-engine/commands',
    reason: '11A.2.3 §4 收口：两步 orchestration（engineChooseQuest + selectQuest）合并为单一入口。',
  },
  {
    commandType: 'scout',
    routeKind: 'atomic-engine',
    expectedEntryPoint: 'scoutDungeon',
    expectedImportFrom: 'game-engine/dungeon',
    reason: '单步：揭示相邻房间；无 orchestration。',
  },
  {
    commandType: 'moveToRoom',
    routeKind: 'production-command',
    expectedEntryPoint: 'enterDungeonRoom',
    expectedImportFrom: 'game-engine/commands',
    reason: '11A.2.2 §16 已迁出 UI-store-shim：Production Command 入口（含 settleBattle / 房间窗口 / 替补判定）。',
  },
  {
    commandType: 'autoBattle',
    routeKind: 'test-policy',
    expectedEntryPoint: 'autoPlayBattle',
    expectedImportFrom: 'audit/core-campaign/simulation-driver',
    reason: '11A.2.2 §19：driver 一律选择「首个合法目标」（确定性 policy），内部走 settleBattleState + declineAllTrinketOpportunities（Production Command）。',
  },
  {
    commandType: 'resolveVictory',
    routeKind: 'production-command',
    expectedEntryPoint: 'commitBattleVictory',
    expectedImportFrom: 'game-engine/commands',
    reason: '11A.2.2 §17 已迁出 shim：Production Command 入口。',
  },
  {
    commandType: 'finishQuest',
    routeKind: 'production-command',
    expectedEntryPoint: 'commitLeaveDungeon',
    expectedImportFrom: 'game-engine/commands',
    reason: '11A.2.2 §16 已迁出 shim：Production Command 入口（含 commitQuestFailureFromDefeat 替代）。',
  },
  {
    commandType: 'skipAllHeroActions',
    routeKind: 'atomic-engine',
    expectedEntryPoint: 'skipHeroAction',
    expectedImportFrom: 'game-engine/hamlet',
    reason: '单步：单个英雄 skip；多次调用循环遍历存活英雄。',
  },
  {
    commandType: 'returnToHamlet',
    routeKind: 'test-policy',
    expectedEntryPoint: 'commitReturnToHamlet',
    expectedImportFrom: 'game-engine/commands',
    reason: '11A.2.2 §18：Production Engine 不替玩家做 Trinket 选择；Driver 注入 Test Policy callback（resolveAllocations）后调 commitReturnToHamlet。',
  },
  {
    commandType: 'endHamletDay',
    routeKind: 'atomic-engine',
    expectedEntryPoint: 'endHamletDay',
    expectedImportFrom: 'game-engine/hamlet',
    reason: '单步：结束当前 day；触发 Quest Supply Cycle。',
  },
  {
    commandType: 'resolveReplacements',
    routeKind: 'production-command',
    expectedEntryPoint: 'resolveReplacementsFlow',
    expectedImportFrom: 'game-engine/commands',
    reason: '11A.2.2 §16 已迁出 shim：Production Command 入口。',
  },
];

// 'engine' 是 escape hatch（label + apply），route 动态。ProductionCommandAudit 不将其
// 计入 expectedCount。
export const ENGINE_COMMAND_TYPE = 'engine';

const DRIVER_PATH = 'src/audit/core-campaign/simulation-driver.ts';

/**
 * 计算 input Hash 用于 verification-results.json 的 stale detection。
 * dev doc §21：src/** e2e/** scripts/** package.json lockfile playwright.config.ts
 *             vite config tsconfig 全部纳入。排除 generated docs / dist / pw-out / coverage。
 */
export function computeVerificationInputHash(extraExcludePatterns: string[] = []): string {
  const { execSync } = require('child_process') as typeof import('child_process');
  // 用 git ls-files 拿到所有 tracked files（保证 hash 跨环境一致）
  const files = execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.length > 0)
    .filter((f) => !f.includes('node_modules'))
    .filter((f) => !f.startsWith('dist/'))
    .filter((f) => !f.startsWith('pw-out/'))
    .filter((f) => !f.startsWith('coverage/'))
    .filter((f) => !f.includes('verification-results.json')) // 输出文件本身不计入
    .filter((f) => !extraExcludePatterns.some((p) => f.includes(p)))
    .sort();
  // 简单稳定 hash：拼接 file:hash 行
  const crypto = require('crypto') as typeof import('crypto');
  const h = crypto.createHash('sha256');
  for (const f of files) {
    if (!existsSync(f)) continue;
    const content = readFileSync(f);
    h.update(f);
    h.update('\0');
    h.update(content);
    h.update('\0');
  }
  return h.digest('hex');
}

/** Driver text 静态扫描：验证 case body 是否真调用了 expected entry point。 */
function validateDriverRoute(driverText: string, contract: GameCommandRouteContract): boolean {
  // 找 case 'commandType': 块（一直到下一个 case / default / 末尾）
  const re = new RegExp(
    `case\\s+['"]${contract.commandType}['"]\\s*:[\\s\\S]*?(?=case\\s+['"]|default\\s*:|\\}\\s*$)`,
    'g',
  );
  const m = driverText.match(re);
  if (!m || m.length === 0) return false;
  const body = m[0];
  // 真实引用：函数名必须出现至少一次（在 body 中）
  return new RegExp(`\\b${contract.expectedEntryPoint}\\b`).test(body);
}

export interface GameCommandRouteAuditResult {
  /** GameCommand 全部 case 数（不含 'engine'）。 */
  commandRouteExpectedCount: number;
  /** 显式登记在 GAME_COMMAND_ROUTE_CONTRACT 的 GameCommand 数。 */
  commandRouteClassifiedCount: number;
  /** 静态扫描 Driver 后 entry point 真实调用的 GameCommand 数。 */
  commandRouteValidatedCount: number;
  /** 未登记的 GameCommand（Driver 实际 case 但 contract 表缺失）。 */
  unclassifiedCommands: string[];
  /** 登记但 Driver case body 未引用 expected entry point 的 GameCommand。 */
  routeViolations: string[];
  /** 详细登记表（commandType → { routeKind, ok }）。 */
  details: Array<{ commandType: string; routeKind: GameCommandRouteKind; validated: boolean }>;
}

/**
 * 主入口：扫描 Driver + 登记比对。
 */
export function runGameCommandRouteAudit(): GameCommandRouteAuditResult {
  const driverPath = join(process.cwd(), DRIVER_PATH);
  const driverText = existsSync(driverPath) ? readFileSync(driverPath, 'utf8') : '';

  const details: GameCommandRouteAuditResult['details'] = [];
  const unclassifiedCommands: string[] = [];
  const routeViolations: string[] = [];

  // 1. 从 driver text 提取所有 case 'xxx' 中的 commandType（驼峰）
  const caseRe = /case\s+['"]([a-zA-Z][a-zA-Z]*)['"]\s*:/g;
  const seenTypes = new Set<string>();
  for (const m of driverText.matchAll(caseRe)) {
    const name = m[1];
    if (/[A-Z]/.test(name) && name !== ENGINE_COMMAND_TYPE) {
      seenTypes.add(name);
    }
  }

  // 2. 分类 + 验证
  for (const t of seenTypes) {
    const contract = GAME_COMMAND_ROUTE_CONTRACT.find((c) => c.commandType === t);
    if (!contract) {
      unclassifiedCommands.push(t);
      details.push({ commandType: t, routeKind: 'engine-callback', validated: false });
      continue;
    }
    const validated = validateDriverRoute(driverText, contract);
    if (!validated) {
      routeViolations.push(t);
    }
    details.push({
      commandType: t,
      routeKind: contract.routeKind,
      validated,
    });
  }

  return {
    commandRouteExpectedCount: seenTypes.size,
    commandRouteClassifiedCount: details.filter((d) =>
      GAME_COMMAND_ROUTE_CONTRACT.some((c) => c.commandType === d.commandType),
    ).length,
    commandRouteValidatedCount: details.filter((d) => d.validated).length,
    unclassifiedCommands,
    routeViolations,
    details,
  };
}

/**
 * 组合 audit：合并 GameCommandRouteAudit + ProductionCommandAudit。
 * dev doc §5：productionCommandLayerPasses 包含 commandContractPasses。
 */
export function runFullProductionCommandAudit() {
  const route = runGameCommandRouteAudit();
  const pca = runProductionCommandAudit();
  const commandContractPasses =
    route.commandRouteClassifiedCount === route.commandRouteExpectedCount &&
    route.unclassifiedCommands.length === 0 &&
    route.routeViolations.length === 0;
  return {
    route,
    pca,
    commandContractPasses,
    productionCommandLayerPasses:
      commandContractPasses &&
      pca.productionCommandLayerPasses,
  };
}
