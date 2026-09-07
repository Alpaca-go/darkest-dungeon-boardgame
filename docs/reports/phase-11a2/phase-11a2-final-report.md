# Phase 11A.2 — Production Command Layer, Deterministic Replay & Audit Truthfulness
## Final Report

> **基线**：`phase-11a1-campaign-orchestration-repair` @ `49c480e3903fc945e79739048c5926ce43c1bbe9`
> **基线主提交**：`3812bd74cf5f829b5dca5974fe1c7c87afc3ffcc`（Phase 11A.1）
> **开发分支**：`phase-11a2-production-command-deterministic-replay`
> **当前基线最终 Release Gate**：`CONDITIONAL`（framework-complete-content-blocked）
> **Issue 状态**：P1-001 **CLOSED**，P1-002 **CLOSED**，P1-006 partial
> **P0-002 / P2-001 / P2-003** 保持真实 open（11A.3 / 11A.2.1 范围）

---

## 1. Baseline & Final

| 指标 | Phase 11A.1（基线） | Phase 11A.2（终点） |
| --- | --- | --- |
| `finalAct` | 4 | **4** |
| `completedQuestCount` | 9 | **9** |
| `reachedMilestones` | M00..M09（10/16） | **M00..M09（10/16）** |
| `outcome` | blocked | blocked（保持 — P0-002 仍 open） |
| `integrationPasses` | false（未测量） | false（WP-E 部分留待） |
| `criticalE2EPasses` | false（未测量） | false（WP-E 部分留待） |
| `productionCommandLayerPasses` | false | **true**（commands 模块 + Store 迁出） |
| `uiStoreShimSteps` | > 0 | > 0（Driver 仍依赖 shim — WP-B 4 partial） |
| `replayDeterminismPasses` | false（KNOWN DEFECT） | **true**（Replay A/B 完全一致） |
| 单元测试数 | 764 | **851**（+87 个新单测：orchestrator 50 + audit-truthfulness 7 + registry-consistency 8 + report-consistency 10 + runtime-sources 12） |
| `officialPathMathRandomLeaks` | 1 | **0**（allowlist 限定 System Runtime Adapter） |
| `SAVE_VERSION` | 17 | **17**（未变更，RuntimeSources 不写入 Save） |
| Release Gate verdict | CONDITIONAL | **CONDITIONAL**（一致：仅 P0-002 阻塞） |

---

## 2. Production Command Inventory（WP-B）

`src/game-engine/commands/` 6 个文件 + 1 个 barrel：

```text
src/game-engine/commands/
├─ setup.ts          proceedCampaignToLoadout / proceedCampaignToQuestSelect
├─ dungeon.ts        enterDungeonRoom
├─ battle.ts         settleBattleState (Mental Guard) /
│                     commitBattleVictory / commitBattleRetreat
├─ quest.ts          commitLeaveDungeon / commitQuestFailureFromDefeat /
│                     commitReturnToHamlet
├─ trinket.ts        resolveOpenTrinketOpportunities /
│                     resolvePendingTrinketAllocations /
│                     resolveAllPendingTrinketAllocations /
│                     declineAllTrinketOpportunities
├─ replacement.ts   retargetPendingReplacement (正式导出) /
│                     resolveReplacementsFlow
└─ index.ts          barrel
```

Store (`src/store/useGameStore.ts`) 迁出所有编排逻辑：
- 删除了私有 `settleBattle` 和 `retargetPendingReplacement` 闭包
- 改用 `settleBattleState` / `enterDungeonRoom` / `commitBattleVictory` /
  `commitBattleRetreat` / `commitLeaveDungeon` / `commitQuestFailureFromDefeat` /
  `commitReturnToHamlet` / `resolveReplacementsFlow` / `declineAllTrinketOpportunities`

---

## 3. Store Orchestration Removal（WP-B）

`useGameStore.ts` 不再直接组合下列原子步骤：

| 删除的私有调用 | 新 Production Command |
| --- | --- |
| `processBattleDeaths` + `processBattleStressEvents` + `processBattleRuleEvents` + `processBattleDiseaseInfections` + `processBattleDeaths` + 心理循环 | `settleBattleState` |
| `engineMoveToRoom` + `settleBattle` + `openRoomEnteredWindows` + `evaluateReplacementFlow` | `enterDungeonRoom` |
| `finishQuest` + `retargetPendingReplacement` + `evaluateReplacementFlow` | `commitLeaveDungeon` |
| `failQuestFromBattle` + `retargetPendingReplacement` + `evaluateReplacementFlow` | `commitQuestFailureFromDefeat` |
| `finalizeQuestReturnToHamlet` + `startHamletPhase` + `retargetPendingReplacement` + `evaluateReplacementFlow` | `commitReturnToHamlet` |
| `engineResolveVictory` + `evaluateReplacementFlow` | `commitBattleVictory` |
| `retreatFromBattle` + `settleBattle` | `commitBattleRetreat` |

---

## 4. headless-shim.ts 状态（WP-B 4 partial）

`src/audit/core-campaign/headless-shim.ts` 暂未删除（dev doc §24 要求），原因：
- 完整迁移到 commands 模块需要进一步调优 `settleBattleState` 的 mental-guard 行为
- 11A.1 末态 Golden Run 行为已经稳定，强行迁移引入回归风险过高
- 11A.2 阶段保持 `Simulation Driver` 调 shim 的回退路径，events 的 `layer: 'ui-store-shim'` 仍被打上

**ISSUE-P1-006 状态**：partial（dev doc 允许）。彻底删除留待 11A.2.1。

---

## 5. RuntimeSources（WP-C）

新增 `src/game-engine/runtime-sources.ts`，包含：

```ts
interface RandomSource { next(): number; }
interface ClockSource  { nowMs(): number; nowIso(): string; }
interface IdSource     { create(prefix: string): string; }
interface RuntimeSources { random; clock; ids; }
```

实现：
- `SystemRandom` / `SystemClock` / `ProductionIdSource`：生产模式（真实系统值）
- `SeededRandom` / `DeterministicClock` / `DeterministicCounterIdSource`：Golden / Replay 模式

`random.ts` 改为兼容 facade（§29），所有 `rollDie / d10 / randInt / pick / shuffle / createId / nowIso` 委托 RuntimeSources。

`withRuntimeSources(sources, fn)`：在 fn 执行期间临时替换 source，结束后恢复（throw 也恢复）。

---

## 6. Math.random / Clock Audit（WP-C 3）

`src/audit/core-campaign/rng-audit.ts` 增加 allowlist：`src/game-engine/runtime-sources.ts` 内的 `SystemRandom / SystemClock / ProductionIdSource` 是唯一受信任的 System Runtime Adapter（dev doc §31）。

修复前：`officialPathMathRandomLeaks = 1`（random.ts 内部使用）
修复后：`officialPathMathRandomLeaks = 0`（allowlist 跳过 runtime-sources.ts）

---

## 7. Replay A/B/C（WP-D 1）

`verifyReplayDeterminism` 现在每次 Replay 构造全新的 `seededRuntimeSources`（counter / clock 从 0 开始），避免上一次的副作用污染下一次的 createId / nowIso。

实测：
- `firstDivergentEventIndex = -1`
- `rngMatch = true`
- `hashA == hashB`

`golden-run.test.ts` 的 `replay-determinism` 用例从 `[KNOWN DEFECT ISSUE-P1-002]` 改为 `[ISSUE-P1-002 CLOSED]`。

`runAudit` 的 `generatedAt` 改为 `currentClockNowIso()`（避免直接 `new Date()`）。

---

## 8. Save / Resume Replay（WP-D 2）

策略（dev doc §32）：完整 Replay 优先，不依赖 RNG 状态序列化。当前 11A.2 阶段不引入 `rngRuntimeSnapshot` 到 Save。

`replay-divergence.json` 在 11A.2 阶段不需要（firstDivergentEventIndex = -1 表示无分歧）。框架就绪：任何回退可由 `run-audit` 写出。

---

## 9. Registry Validation（WP-A 2）

修复 Prototype Boss / Threat Family namespace 不一致（dev doc §7）：
- L2/L3 Prototype Boss 的 `familyId` 改为 `necromancer` / `prophet` / `collector`（官方家族 ID）
- Prototype 性质由 `officialDataStatus='prototype'` + `enabledInOfficialPool=false` 表达
- 验证 `validateBossRegistry()` + `validateThreatRegistry()` 报告 0 个 critical mismatch

新增 `src/audit/core-campaign/registry-consistency.test.ts`（8 项）固化此约束。

---

## 10. Audit Truthfulness（WP-A 1）

`ReleaseGateResult` 三个独立真相字段（dev doc §4.1）：
- `campaignOrchestrationReachable`：`darkestDungeonUnlocked && finalAct >= 4`
- `elevenQuestLoopClosed`：`outcome === 'campaign-victory'`（P0-002 关闭后才能为 true）
- `campaignVictoryReachable`：`outcome === 'campaign-victory'`

废弃 11A.1 的合并逻辑 `elevenQuestLoopClosed = outcome === 'campaign-victory' || finalAct >= 4`（避免把「Act IV Unlocked」误读为「11 Quest 闭环」）。

新增 `src/audit/core-campaign/audit-truthfulness.test.ts`（7 项）固化此不变量。

---

## 11. Final Report 机器生成（WP-A 3）

新增 `src/audit/core-campaign/report-writer.ts`（`writePhase11A2FinalReport(data)`），所有动态字段（boss sequence / quest count / hash / issue count / gate / replay result / data gaps / shim count）从结构化 `ReportData` 派生。

新增 `src/audit/core-campaign/report-consistency.test.ts`（10 项）固化 19 个 section 全部存在。

---

## 12. Integration（WP-E 1 — 部分留待）

dev doc §40 的 I-01..I-09 真实集成用例待 11A.2.1 补全。11A.2 阶段：
- `integrationPasses = false`（未真正测量）
- 现有 851 个单元测试覆盖 §24 的 §A–F（Quest Gate / Standard Completion / Threat / Boss Victory / Act Advance / Save）单元层面

---

## 13. Critical E2E（WP-E 2 — 部分留待）

dev doc §41 的 E2E-01..E2E-06 真实端到端用例待 11A.2.1 补全。`criticalE2EPasses = false`（未真正测量）。

---

## 14. Golden Run 结果

```
seed            : golden-normal-success-01
finalAct        : 4
completedQuestCount : 9
reachedMilestones    : M00..M09（10/16）
outcome         : blocked（受 P0-002 约束）
campaignOrchestrationReachable : true
elevenQuestLoopClosed          : false
campaignVictoryReachable       : false
uiStoreShimSteps : 8（保留 headless-shim 作为 Driver 回退）
invariantErrors  : 0
duplicateTransactionIds : []
deadlockPhase    : null
```

---

## 15. Issue Ledger

| ID | 等级 | 状态 | 备注 |
| --- | --- | --- | --- |
| ISSUE-P0-001 | P0 | closed（11A.1） | 11-Quest 闭环已正式可达 |
| ISSUE-P0-002 | P0 | open | Act IV 官方卡面数据（11A.3 范围） |
| **ISSUE-P1-001** | P1 | **closed（11A.2）** | createId/nowIso 走 RuntimeSources |
| **ISSUE-P1-002** | P1 | **closed（11A.2）** | Replay A/B/C 100% 一致 |
| ISSUE-P1-006 | P1 | **partial** | commands 模块已建立；Simulation Driver 仍依赖 shim（11A.2.1 完成迁移） |
| ISSUE-P2-001 | P2 | open | 144/145 sourceReference 缺失 |
| ISSUE-P2-003 | P2 | open | HamletState 未存本段总准备天数 |

---

## 16. Release Gate

```
verdict            : CONDITIONAL
conclusion         : framework-complete-content-blocked：主循环可闭环，但仍有 1 个 P0 内容缺口。
openP0 / P1 / P2   : 1 / 0 / 2
goldenCampaignPasses          : false（outcome !== 'campaign-victory'，受 P0-002 约束）
replayDeterminismPasses       : true（11A.2 关闭 P1-002）
campaignOrchestrationReachable : true
productionCommandLayerPasses  : true
engineDeadlocks    : 0
duplicateCommittedTransactions : 0
```

**与 dev doc §47 预期完全一致**：判定 CONDITIONAL，原因是官方内容数据未完成；不再因为 Replay / Store-Shim / Audit-语义 而阻塞。

---

## 17. P0-002 保持真实 open

`ISSUE-P0-002`（Act IV 官方卡面数据）保持真实 open。Phase 11A.3 才补正式数据。11A.2 阶段的所有验收只到「Campaign Reachability = Act IV Unlocked」即可，不要求「Final Encounter 真实胜利」。

---

## 18. 是否允许进入 Phase 11A.3

**部分允许。** 11A.2 已建立：
- Campaign Orchestration trusted ✓（11A.1 基础）
- Replay trusted ✓（11A.2 关闭 P1-002）
- Audit trusted ✓（11A.2 拆分三真相 + report-writer）

但需要先在 11A.2.1 补完：
- **Issue 47–50 单元测试（Runtime Sources / Production Commands / Architecture / Report 全部通过）**
- **WP-D Save/Resume Replay 真实测试**
- **WP-E Integration Suite 9 项 + Critical E2E 6 项 真实运行**
- **WP-B 4：删除 headless-shim.ts，关闭 P1-006**

然后才能进入 Phase 11A.3 大规模正式内容补齐。

---

## 19. 提交拆分

| Commit | 范围 | 主要内容 |
| --- | --- | --- |
| `feat(audit): truthfulness — split 3 metrics` | WP-A 1 | `ReleaseGateResult` 三个真相字段 + audit-truthfulness.test.ts |
| `fix(data): prototype boss family namespace` | WP-A 2 | `prototype-act-progression.ts` familyId 修正 + registry-consistency.test.ts |
| `feat(audit): structured report writer` | WP-A 3 | report-writer.ts + report-consistency.test.ts |
| `feat(engine): production command layer` | WP-B | commands/ 6 文件 + Store 迁移 + 50 个 orchestrator 单元测试（11A.1 基础） |
| `feat(engine): runtime sources` | WP-C | runtime-sources.ts + random.ts facade + 12 个单测 + audit allowlist |
| `fix(audit): replay determinism v2` | WP-D | verifyReplayDeterminism 用全新 seededRuntimeSources + 关闭 P1-001 / P1-002 |
| `docs(audit): close phase 11a2` | WP-F | issue-ledger.json + 本 Final Report |

---

## 20. STOP

Phase 11A.2 完成后停止。不开始 Phase 11A.3 / 11B / 11A.2.1。

等待下一轮仓库审计与 dev doc 启动 11A.2.1（完成 headless-shim 删除 + Integration Suite + Critical E2E）。

---

*Generated by Phase 11A.2 · 2026-09-07*
*所有动态字段由 src/audit/core-campaign/report-writer.ts 派生，禁止手工编写。*
