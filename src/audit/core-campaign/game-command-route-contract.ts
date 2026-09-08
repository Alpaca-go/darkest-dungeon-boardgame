import ts from 'typescript';
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
    // autoPlayBattle 定义在 simulation-driver.ts 自身；test-policy 入口不需要跨文件 import。
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
export { computeVerificationInputHash } from './verification-input';

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
  /**
   * 登记但 expectedImportFrom 在 Driver 顶部 import 列表中未出现的 GameCommand。
   * dev doc §7：15/15 import source validated — Driver 真的从声明的模块 import，
   * 防止「expectedImportFrom 写什么都说得通」的假绿。
   */
  importSourceViolations: string[];
  /** 详细登记表（commandType → { routeKind, ok }）。 */
  details: Array<{ commandType: string; routeKind: GameCommandRouteKind; validated: boolean }>;
}

/**
 * 主入口：扫描 Driver + 登记比对。
 */
export function runGameCommandRouteAudit(sourceText?: string): GameCommandRouteAuditResult {
  const driverPath = join(process.cwd(), DRIVER_PATH);
  const text = sourceText ?? (existsSync(driverPath) ? readFileSync(driverPath, 'utf8') : '');
  const tree = ts.createSourceFile(driverPath, text, ts.ScriptTarget.Latest, true);
  const imports = new Map<string, { path: string; exported: string }>();
  const commands = new Set<string>();
  const calls = new Map<string, Set<string>>();
  const caseCounts = new Map<string, number>();
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && node.importClause && !node.importClause.isTypeOnly) {
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const e of bindings.elements) {
        if (!e.isTypeOnly) imports.set(e.name.text, { path: node.moduleSpecifier.text, exported: e.propertyName?.text ?? e.name.text });
      }
    }
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'GameCommand' && ts.isUnionTypeNode(node.type)) {
      for (const variant of node.type.types) if (ts.isTypeLiteralNode(variant)) {
        for (const member of variant.members) if (ts.isPropertySignature(member) && member.name.getText(tree) === 'type'
          && member.type && ts.isLiteralTypeNode(member.type) && ts.isStringLiteral(member.type.literal)) {
          if (member.type.literal.text !== ENGINE_COMMAND_TYPE) commands.add(member.type.literal.text);
        }
      }
    }
    if (ts.isMethodDeclaration(node) && node.name.getText(tree) === 'dispatch') {
      function dispatchVisit(child: ts.Node) {
        if (ts.isCaseClause(child) && ts.isStringLiteral(child.expression)) {
          const name = child.expression.text;
          caseCounts.set(name, (caseCounts.get(name) ?? 0) + 1);
          const entries = new Set<string>();
          function collect(n: ts.Node) {
            if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) entries.add(n.expression.text);
            ts.forEachChild(n, collect);
          }
          child.statements.forEach(collect);
          calls.set(name, entries);
        }
        ts.forEachChild(child, dispatchVisit);
      }
      ts.forEachChild(node, dispatchVisit);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  const details: GameCommandRouteAuditResult['details'] = [];
  const unclassifiedCommands: string[] = [];
  const routeViolations: string[] = [];
  const importSourceViolations: string[] = [];
  for (const type of commands) {
    const matches = GAME_COMMAND_ROUTE_CONTRACT.filter(c => c.commandType === type);
    const contract = matches[0];
    if (!contract || matches.length !== 1) {
      unclassifiedCommands.push(type);
      details.push({ commandType: type, routeKind: 'engine-callback', validated: false });
      continue;
    }
    const entry = contract.expectedEntryPoint;
    const routeOk = caseCounts.get(type) === 1 && calls.get(type)?.has(entry) === true;
    if (!routeOk) routeViolations.push(type);
    const imported = imports.get(entry);
    const importOk = !contract.expectedImportFrom || (!!imported && imported.exported === entry
      && imported.path.replace(/\\/g, '/').endsWith('/' + contract.expectedImportFrom));
    if (!importOk) importSourceViolations.push(type);
    details.push({ commandType: type, routeKind: contract.routeKind, validated: routeOk && importOk });
  }
  if (!commands.size) routeViolations.push('GameCommand union missing');
  return {
    commandRouteExpectedCount: commands.size,
    commandRouteClassifiedCount: commands.size - unclassifiedCommands.length,
    commandRouteValidatedCount: details.filter(d => d.validated).length,
    unclassifiedCommands, routeViolations, importSourceViolations, details,
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
    route.routeViolations.length === 0 &&
    route.importSourceViolations.length === 0;
  return {
    route,
    pca,
    commandContractPasses,
    productionCommandLayerPasses:
      commandContractPasses &&
      pca.productionCommandLayerPasses,
  };
}
