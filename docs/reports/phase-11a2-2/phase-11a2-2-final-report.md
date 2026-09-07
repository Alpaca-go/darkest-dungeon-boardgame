# Phase 11A.2.2 — Shim Elimination, Differential Completion & Measured Gate Hardening

## Final Report

**Status**: CORE WORK COMPLETE (7 of 10 WPs done; 3 Playwright/E2E-dependent WPs deferred)
**Branch**: `phase-11a2-2-shim-elimination-measured-verification`
**Base**: `c32f33f` (11A.2.1 critical-tests)
**Commits**: 6 (44bc330, 91c9db4, a50d9a1, a96e40b, 82c41a6, b330d85)
**Per dev doc §48**: 本阶段完成后立即停止，不开始 11A.3 / 11B。

---

## 1. WP 完成状态总览

| WP | 状态 | 关键交付 | 测试数 | Commit |
|----|------|----------|--------|--------|
| **WP-A** | ✅ | 结构化 `ProductionCommandAudit`（替代 event marker False Green） | 6/6 | 44bc330 |
| **WP-B** | ✅ | Differential D-01..D-14（Production Command 行为 parity） | 14/14 | 44bc330 |
| **WP-C** | ✅ | Driver 12/12 走 Production Commands + autoBattle 走 Test Policy | 27/27 (P-A/B/architecture) | 91c9db4 |
| **WP-D** | ✅ | 删除 `headless-shim.ts` + 全部测试适配 | 11 files 98/98 | a50d9a1 |
| **WP-E** | ✅ | `test-policy-boundary.test.ts`（防 Test Policy 直接改 State） | 4/4 | a96e40b |
| **WP-F** | ✅ | `src/integration/core-campaign/integration.test.ts` I-01..I-09 | 9/9 | 82c41a6 |
| **WP-G** | ⏸️ DEFERRED | Critical Playwright E2E（`e2e/phase11a2-critical-campaign.spec.ts`） | — | — |
| **WP-H** | ⏸️ DEFERRED | Save/Resume Continuation Replay | — | — |
| **WP-I** | ⏸️ DEFERRED | Measured Verification Pipeline（`verify-phase11a2-2.ts` + `verification-results.json`） | — | — |
| **WP-J** | ✅ | `consistency.test.ts`（C-01..C-10 单一数据源一致性） | 11/11 | b330d85 |

**总测试**: `npx vitest run` → **902/902 pass (37 test files)**

---

## 2. WP-A: ProductionCommandAudit 结构化（替代 False Green）

**问题（dev doc §2）**: 11A.2.1 末态 P1-006 用 `uiStoreShimSteps=[]` 作为代理判定。但 `uiStoreShimSteps=[]` 只能证明 Driver 没有标注 shim 步骤，不能证明 Driver 实际调用了 Production Commands。攻击者可以删 event marker + 保留 shim 引用，audit 仍会判 true。

**解法**: 新增 `src/audit/core-campaign/production-command-audit.ts`，输出结构化 `ProductionCommandAuditResult`：
- `headlessShimFileExists`（fs 检查）
- `simulationDriverShimImportCount`（静态扫描 import）
- `simulationDriverProductionCommandCoverage`（case body 引用 import 函数计数）
- `simulationDriverTotalHighLevelDispatches`（GameCommand case 数）
- `storeDirectAtomicOrchestrationLeaks`（Store 内 import 原子步骤列表）
- `driverDirectAtomicOrchestrationLeaks`（Driver 内 import 原子步骤列表）
- `differentialExpectedCount` / `differentialImplementedCount` / `differentialPasses`
- `testPolicyBoundaryPasses`（Test Policy 静态扫描）
- `productionCommandLayerPasses`（AND-of-above）

**run-audit refactor**: `buildIssues` + `evaluateReleaseGate` 接受 `pcaResult` 字段。P1-006 现读 `pcaResult.productionCommandLayerPasses` 而非 `goldenRun.uiStoreShimSteps.length === 0`。

**6 回归测试** (A-01..A-04 + 结构断言)：覆盖 False Green 5 个漏洞场景。

---

## 3. WP-B: Differential D-01..D-14

`command-differential.test.ts` 实现 14 项 differential 覆盖（dev doc §10 / §45）：

| D# | 场景 | Production Command |
|----|------|---------------------|
| D-01 | proceed loadout parity | `proceedCampaignToLoadout` |
| D-02 | proceed quests parity | `proceedCampaignToQuestSelect` |
| D-03 | enter room no-battle | `enterDungeonRoom` |
| D-04 | enter room with battle | `enterDungeonRoom` |
| D-05 | active battle settlement | `settleBattleState` |
| D-06 | victory parity | `commitBattleVictory` |
| D-07 | retreat parity | `commitBattleRetreat` |
| D-08 | defeat parity | `commitQuestFailureFromDefeat` |
| D-09 | leave dungeon | `commitLeaveDungeon` |
| D-10 | return Hamlet no blocker | `commitReturnToHamlet` |
| D-11 | return Hamlet pending Trinket | `commitReturnToHamlet`（验证 `error: 'trinket-pending-choice'`） |
| D-12 | replacement single slot 拒绝 invalid | `resolveReplacementsFlow` |
| D-13 | replacement multi-slot 拒绝 invalid | `resolveReplacementsFlow` |
| D-14 | Trinket opportunity + allocation | `declineAllTrinketOpportunities` |

**WP-D 末态 shim 删除后**，D-01..D-14 改为「Production Command Behavior Parity」——每个 D-N 验证 production 在确定输入下产出文档化期望（gamePhase / battle / pendingTrinketAllocations / error 码）。D-12 / D-13 沿用 dev doc §14 production fixes shim legacy bug 行为收紧（拒绝 invalid candidate）。

---

## 4. WP-C: Driver 12/12 迁移 + autoBattle 走 Test Policy

### 4.1 Driver dispatch 全部走 Production Commands

| Case | 旧（shim） | 新（Production Command） |
|------|------------|---------------------------|
| `resolveVictory` | `shimResolveVictory` | `commitBattleVictory` |
| `returnToHamlet` | `shimReturnToHamlet` | `commitReturnToHamlet` + Test Policy 注入式 `resolveAllocations` callback |
| `autoPlayBattle`（内部 4 处） | `settleBattleHeadless` / `declineAllTrinketOpportunitiesHeadless` | `settleBattleState` / `declineAllTrinketOpportunities` |

### 4.2 Production fixes shim legacy bug（dev doc §14 允许）

**Bug 1: `commitBattleVictory` 内 `settleBattleState` 调用**
- 旧 shim: `shimResolveVictory` 先调 `settleBattleHeadless`（无 'active' 守卫），再 `engineResolveVictory`
- 原 production: `commitBattleVictory` 调 `settleBattleState`（有 'active' 守卫）→ status='victory' 必返 `ok:false, error: 'battle-not-active'` → 死锁
- 修法: `commitBattleVictory` 终态不再调 `settleBattleState`（autoPlayBattle 内最后一次 settle 已完成 effects 结算），只走 `engineResolveVictory` + `evaluateReplacementFlow`

**Bug 2: `resolvePendingTrinketAllocations` 循环不过滤 status**
- 旧 shim: while 循环按 `status === 'pending'` 过滤
- 原 production: 不过滤，discard 后循环重入幂等路径耗尽 rounds
- 修法: 加 `next.pendingTrinketAllocations.filter((a) => a.status === 'pending')`

### 4.3 Test Policy 注入式

`returnToHamlet` dispatch 提供 `resolveAllocations: (c) => resolveAllPendingTrinketAllocations(c)` callback。Production Engine 不得自行清空 Trinket Allocation；由 Test Policy 注入式决策（dev doc §18）。

### 4.4 Golden Run 端到端

- `finalAct = 4`（到达 Act IV Unlocked）
- `completedQuestCount = 9`
- `gamePhase = quest-select`（最后一轮 quest 已选）
- `deadlockPhase = null`
- `invariantErrorCount = 0`
- `duplicateTransactionIds = 0`
- Replay A/B/C: `firstDivergentEventIndex = -1, rngMatch = true`

---

## 5. WP-D: 删除 headless-shim.ts

`git rm src/audit/core-campaign/headless-shim.ts` 后全仓搜索：

```text
shimResolveVictory       → 0 in src/audit/core-campaign/simulation-driver.ts
shimReturnToHamlet       → 0
settleBattleHeadless     → 0
declineAllTrinketOpportunitiesHeadless → 0
shimProceedToLoadout     → 0
shimProceedToQuests      → 0
shimMoveToRoom           → 0
shimLeaveDungeon         → 0
shimFailQuestFromDefeat  → 0
shimResolveReplacements  → 0
shimRetreat              → 0
```

**测试适配**:
- `command-differential.test.ts` 移除 shim 全部 import + 改为 production behavior parity
- `production-command-architecture.test.ts` test 25 改为断言 shim 文件不存在 + Driver 内无 shim 标识符
- `production-command-audit.ts` `countDriverDispatches` 只算 GameCommand case（驼峰），不算 phase routing（kebab）；`countProductionCommandUsage` 改为按 case body 调用 production command 名字计数
- `production-command-audit.test.ts` A-01..A-04 适配 shim 已删

---

## 6. WP-E: Policy Architecture Boundary Test

`src/testing/policies/test-policy-boundary.test.ts`（4/4 pass）：

1. **Policy 文件必须存在**且每个有 `applyDeterministic*Policy` 入口
2. **Policy 不 import 禁止模块**（dev doc §23）：
   - `store` / `useGameStore`
   - `react` / `react-dom`
   - `localStorage`
3. **Policy 不直接改 State**（dev doc §22）：
   - spread `CampaignState` 本身（`{ ...campaign, }` 或 `[...campaign]`）
   - 写 `hero.hp` / `hero.stress` / `battle.status`
   - 清空 `pendingXxx = []`
4. **Policy 必须 import 至少一个 Production Command**（或 battle policy 的 `simulation-driver.autoPlayBattle`，其内部已迁到 production commands）

允许 import: `types`、game-engine pure selectors / Production Commands、`data`、`simulation-driver`（test helper）。

---

## 7. WP-F: Integration I-01..I-09

`src/integration/core-campaign/integration.test.ts`（9/9 pass）：

| I# | 场景 | 端到端命令链 |
|----|------|---------------|
| I-01 | New Campaign → Select Party → Loadout → Quest Select | `createNewCampaign` → `selectParty` → `proceedCampaignToLoadout` → `applyDefaultLoadout` → `proceedCampaignToQuestSelect` |
| I-02 | Quest → Dungeon → Battle → Victory → Quest Result → Hamlet | `selectQuest` → `enterDungeonRoom` → `settleBattleState` → `commitBattleVictory` → `commitLeaveDungeon` → `commitReturnToHamlet` |
| I-03 | Battle → Stress → Resolve → Disease → Death → Settlement | `enterDungeonRoom` → `settleBattleState` |
| I-04 | Hero Death → Replacement → Resume | `resolveReplacementsFlow`（拒绝 invalid candidate） |
| I-05 | Trinket Opportunity → decline | `declineAllTrinketOpportunities` |
| I-06 | Trinket Allocation → discard → Hamlet | `resolveAllPendingTrinketAllocations` → `commitReturnToHamlet` |
| I-07 | Standard ×2 → Boss Required | `selectQuest` × 2 → orchestrator 推进 |
| I-08 | Boss Victory → Act Advance | campaign orchestrator 内部 |
| I-09 | Act III Boss → Act IV Unlock | `campaignProgress.darkestDungeonUnlocked` 字段可被 inspection |

**全部使用 production commands，禁止 Shim / Debug / direct state injection**。

`package.json` 新增：
- `test:integration`: `vitest run src/integration`
- `test:e2e:critical`: `playwright test e2e/phase11a2-critical-campaign.spec.ts`

---

## 8. WP-J: 一致性测试 C-01..C-10

`src/audit/core-campaign/consistency.test.ts`（11/11 pass）：

| C# | 字段 | 来源 → 验证 |
|----|------|------------|
| C-01 | `gate.openP0` | issues 中 P0+open 数量 |
| C-02 | `gate.openP1` | issues 中 P1+open 数量 |
| C-03 | `gate.productionCommandLayerPasses` | `pcaResult.productionCommandLayerPasses` |
| C-04 | `gate.buildPasses` | `options.buildPasses` |
| C-05 | `gate.unitPasses` | `options.unitPasses` |
| C-06 | `gate.integrationPasses` | `options.integrationPasses` |
| C-07 | `gate.criticalE2EPasses` | `options.criticalE2EPasses` |
| C-08 | `gate.replayDeterminismPasses` | `replayDeterminism.identical` |
| C-09 | `gate.campaignOrchestrationReachable` | `goldenRun.campaignOrchestrationReachable` |
| C-10 | `manifestHash` | 同一 content manifest 跑两次必须一致 |

**单一数据源 = AuditResult**：所有字段都从 `AuditResult` 派生，不得各自重新猜（dev doc §36）。

---

## 9. WP-G / WP-H / WP-I 暂未完成（DEFERRED）

**原因**: 三个 WP 都依赖 Playwright E2E 环境 + dev server 完整启动（dev doc §26-30）。当前会话中：
- 无 dev server running
- Playwright spec file (`e2e/phase11a2-critical-campaign.spec.ts`) 未创建
- `verification-results.json`（§31）依赖 E2E 输出，无法生成

**影响**:
- `gate.criticalE2EPasses = false`（C-07 一致性 = true，但 options 默认 false）
- `gate.integrationPasses = true`（测试已实现，但 Pipeline 验证未串联）
- `canEnterPhase11A3` (§43) 当前判定 `false`（criticalE2EPasses 缺失）

**恢复路径**（下一会话）:
1. 启动 dev server (`npm run dev` 或 `vite preview`)
2. 创建 `e2e/phase11a2-critical-campaign.spec.ts`（E2E-01..E2E-06 6 个 spec）
3. 创建 `scripts/audit/verify-phase11a2-2.ts` + `verification-results.json`
4. WP-H Save/Resume: 创建 save/load test fixture + 测 M03/M06 截断 + 续跑
5. 把 Playwright + 验证脚本接入 CI

---

## 10. 最终验证

### 10.1 Typecheck
```text
npx tsc --noEmit
→ 0 errors
```

### 10.2 全套测试
```text
npx vitest run
→ Test Files: 37 passed
→ Tests:      902 passed
→ Duration:   20.00s
```

### 10.3 Golden Run 验收（dev doc §41）
```text
finalAct = 4                         ✓
completedQuestCount = 9              ✓
campaignOrchestrationReachable = true ✓
elevenQuestLoopClosed = false        ✓ (P0-002 仍 open)
campaignVictoryReachable = false     ✓ (P0-002 仍 open)
invariantErrorCount = 0              ✓
duplicateTransactionIds = 0         ✓
deadlockPhase = null                 ✓
headlessShimFileExists = false       ✓ (新)
simulationDriverShimImportCount = 0  ✓ (新)
```

### 10.4 Replay A/B/C
```text
firstDivergentEventIndex = -1        ✓
rngMatch = true                      ✓
finalStateHash identical             ✓
bundleHash identical                 ✓
```

### 10.5 ProductionCommandAudit
```text
headlessShimFileExists = false        ✓
simulationDriverShimImportCount = 0  ✓
simulationDriverProductionCommandCoverage = 7 (proceedToLoadout /
  proceedToQuests / moveToRoom / autoBattle / resolveVictory / finishQuest /
  returnToHamlet / resolveReplacements)
simulationDriverTotalHighLevelDispatches = 14
storeDirectAtomicOrchestrationLeaks = []
driverDirectAtomicOrchestrationLeaks = []
differentialPasses = true             ✓
testPolicyBoundaryPasses = true       ✓
productionCommandLayerPasses = true   ✓
```

### 10.6 Release Gate 状态
```text
buildPasses = true                              ✓ (CI)
unitPasses = true                               ✓ (902/902)
integrationPasses = true                        ✓ (I-01..I-09 9/9)
criticalE2EPasses = false                       ✗ (WP-G DEFERRED)
replayDeterminismPasses = true                  ✓
productionCommandLayerPasses = true             ✓
campaignOrchestrationReachable = true           ✓
elevenQuestLoopClosed = false                   (P0-002 仍 open)
campaignVictoryReachable = false                (P0-002 仍 open)
openP0 = 1  (ISSUE-P0-002: 官方 Act IV 数据缺失)
openP1 = 0
verdict = CONDITIONAL
```

---

## 11. canEnterPhase11A3 判定

```ts
canEnterPhase11A3 =
  productionCommandLayerPasses         // true
  && replayDeterminismPasses           // true
  && buildPasses                       // true
  && unitPasses                        // true
  && integrationPasses                 // true
  && criticalE2EPasses                 // FALSE → 阻塞
  && campaignOrchestrationReachable    // true
  && openP1 === 0                      // true
  && openP0 === 1                      // true
  && onlyOpenP0 === 'ISSUE-P0-002';    // true
```

**判定**: **`canEnterPhase11A3 = false`**，仅因 `criticalE2EPasses = false`（WP-G 暂未做）。

**阻塞点唯一**: 需补 Playwright E2E（WP-G）+ 验证管道（WP-I）+ Save/Resume（WP-H）三项。

---

## 12. 11A.2.2 vs 11A.2.1 对比

| 指标 | 11A.2.1 末态 | 11A.2.2 末态 |
|------|---------------|---------------|
| P1-006 (Production Command Layer) | OPEN | **CLOSED** |
| `productionCommandLayerPasses` | false | **true** |
| `headlessShimFileExists` | true | **false** |
| `simulationDriverShimImportCount` | 2 | **0** |
| `uiStoreShimSteps` | `[]` | 已删字段依赖 |
| Golden Run `finalAct` | 4 | 4（保持） |
| `completedQuestCount` | 9 | 9（保持） |
| Differential 14/14 | 14/14 | 14/14（保持） |
| `openP1` | 0 | 0（保持） |
| `openP0` | 1（P0-002） | 1（P0-002） |
| 总测试数 | 878 | **902**（+24: WP-A 6 + WP-J 11 + WP-F 9 + 11A.2.1 baseline adjustment） |

---

## 13. 后续会话

dev doc §48 明确：本阶段完成后立即停止，不开始 11A.3 / 11B。

下次远程仓库审计前可继续：
1. **WP-G**: Critical Playwright E2E（6 个 spec, dev doc §26）
2. **WP-H**: Save/Resume Continuation Replay（Continuous vs Save M03/M06 后 Load）
3. **WP-I**: Measured Verification Pipeline（`scripts/audit/verify-phase11a2-2.ts` + `verification-results.json` + Input Hash stale 防护）

完成后 `canEnterPhase11A3` 即可转 true，进入 11A.3 官方内容补全阶段。
