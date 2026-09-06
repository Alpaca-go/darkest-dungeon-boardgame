# Phase 11A — 核心盒 Campaign 内容审计与完整垂直游玩 · 最终报告

> 由 `npm run audit:final-report` 自动生成，请勿手改。
> 本报告只聚合 `docs/data/core-campaign/*.json` 中的既有结论，不做二次计算，
> 任何缺失项一律标注「未采集」而不是估算。

## 0. 最终结论

# CONDITIONAL — framework-complete-content-blocked

结论语法固定为 `PASS — core-campaign-official-ready` / `CONDITIONAL — framework-complete-content-blocked` / `FAIL — campaign-flow-blocked` 三选一。

**判定依据**：CONDITIONAL — framework-complete-content-blocked：主循环可闭环，但仍有 1 个 P0 内容缺口。

### 0.1 一句话总结

本项目已具备**完整的单 Act 纵向游玩能力**（选队 → 配技能 → 选任务 → 逐房间探索 → 逐技能战斗 →
战利品 → 饰品分配 → 回城 → Hamlet → 英雄阵亡替补 → 下一任务），且全程 0 条不变量违反、0 次重复事务、
0 处引擎死锁；但**四 Act 之间的横向推进链路是断的**，Act 推进状态机无任何生产调用方，
因此 11-Quest / 4-Act 主循环在正式引擎路径上不可达。同时 Act IV 全部官方数据 Gate 处于关闭状态。
两者叠加，本阶段不能宣称「核心盒 Campaign 完整可玩」。

## 1. 构建信息

| 项 | 值 |
| --- | --- |
| Commit | `9f37087628dad00d8ab714e3861278ce1ec8bbb1` |
| 分支 | `phase-11a1-campaign-orchestration-repair` |
| 工作区 | 36 个文件未提交 |
| Content Manifest Hash | `469d91eb` |
| Manifest 生成时间 | `1970-01-01T00:00:00.000Z`（**刻意固定为 epoch**，使 manifestHash 可复现；非真实时间） |

## 2. §43 要求项逐条对照

| 要求项 | 结论 |
| --- | --- |
| Build Commit | `9f37087628da` |
| Content Manifest Hash | `469d91eb` |
| 规则资料范围 | 15 条 P0 规则已登记 |
| official-ready 内容 | 1 / 158 |
| blocked 内容 | 10 |
| Prototype 污染（官方路径） | 0 处 |
| Traceability P0 完整 | ❌ |
| 十一 Quest Golden Run | ❌ 仅完成 9 个任务、act=4 |
| Boss 顺序覆盖 | ❌ 不适用 — Boss Quest 在正式路径上不可选中（ISSUE-P0-001） |
| Guardian 覆盖 | ❌ 不适用 — Guardian Data Gate 关闭（ISSUE-P0-002） |
| skipped Form 覆盖 | ❌ 不适用 — Final Encounter Data Gate 关闭（ISSUE-P0-002） |
| Outcome | `blocked`（`quest-select`） |
| Save / Resume | 10/10 通过，覆盖 10/16 里程碑 |
| Replay Hash | ❌ 同 seed 两次运行不一致 |
| Hero Death / Replacement | ✅ 已真实触发并走 Stagecoach 正式入口 |
| Failure Matrix | ⚠️ 仅 stagecoach-exhaustion 分支真实到达；其余 seed 标记 runnable:false |
| Guardian Matrix | ❌ 未采集 — Data Gate 关闭 |
| Final Form Matrix | ❌ 未采集 — Data Gate 关闭 |
| P0 / P1 / P2 | open P0=1 / P1=3 / P2=2 |
| Performance Baseline | ✅ 已采集（§32）：0.416ms / Quest 3.643ms / Battle 4.055ms / Save 0.004ms / Load 0.314ms / Form Transition 0.602ms（机制级）；完整 Run 104 事件、最大 Save 77834B |
| Release Gate | **CONDITIONAL** |
| 缺失卡牌资料 | 10 条 unavailable、157 条缺 sourceReference |
| 可称为「核心盒 Campaign 完整可玩」 | **否** |

## 3. 内容清单（Content Manifest）

总计 **158** 条内容定义。

**按官方数据状态**

| 状态 | 数量 |
| --- | --- |
| partial | 117 |
| prototype | 30 |
| verified | 1 |
| unavailable | 10 |

**按运行时就绪度**

| 就绪度 | 数量 |
| --- | --- |
| framework-only | 147 |
| official-ready | 1 |
| blocked | 10 |

**按分类**

| 分类 | 数量 |
| --- | --- |
| heroes | 8 |
| heroSkills | 28 |
| quests | 3 |
| threats | 7 |
| bosses | 7 |
| monsters | 3 |
| rooms | 6 |
| curios | 4 |
| trinkets | 7 |
| quirks | 35 |
| diseases | 11 |
| afflictions | 5 |
| virtues | 5 |
| hamletEvents | 3 |
| buildings | 5 |
| provisions | 1 |
| darkestDungeonQuests | 6 |
| guardians | 6 |
| finalForms | 8 |

> ⚠️ `official-ready` 仅 **1** 条，`missingSourceReference` 高达
> **157** 条 —— 绝大多数内容尚未回指到规则书页码/卡牌编号，
> 这是 ISSUE-P2-001 的量化依据。

### 3.1 Prototype 污染与引用完整性

| 检查 | 结果 |
| --- | --- |
| 官方路径 prototype 引用 | 0 处 |
| 引用校验 error | 0 |
| 引用校验 warning | 0 |

## 4. 规则追溯矩阵（P0）

| 指标 | 值 |
| --- | --- |
| P0 规则总数 | 15 |
| implemented-and-tested | 7 |
| implemented-not-tested | 5 |
| data-missing | 3 |
| implementation-missing | 0 |
| P0 全覆盖 | ❌ |
| 被数据阻塞的规则 | R-OFFICIAL-GUARDIAN-DATA, R-OFFICIAL-FINAL-DATA, R-OFFICIAL-CORE-CARDS |

| 规则 ID | 状态 | 摘要 |
| --- | --- | --- |
| R-ACT-STRUCTURE | implemented-not-tested | 核心盒 = 四 Act / 十一 Quest；Acts I—III 各 2 普通 + 1 B… |
| R-BOSS-FAIL-OVER | implemented-not-tested | Boss Quest 失败 → Campaign Over。 |
| R-GUARDIAN-FAIL-OVER | implemented-not-tested | Darkest Dungeon Guardian 失败 → Campaign Over。 |
| R-FINAL-FAIL-OVER | implemented-not-tested | 任意 Final Form 失败 → Campaign Over。 |
| R-STAGECOACH-EXHAUSTION | implemented-and-tested | 无法组成 4 人 Party（Stagecoach 耗尽）→ Campaign Over。 |
| R-HEART-VICTORY | implemented-and-tested | Heart of Darkness 被击败 → Campaign Victory。 |
| R-ACT4-LEVEL | implemented-and-tested | Act IV 仍为 Campaign Level III。 |
| R-FORM-SEQ | implemented-and-tested | effective sequence 恰好 3 个 Form，Heart of Darkne… |
| R-PARTY-4 | implemented-and-tested | Active Party 固定 4 人；Hero 死亡从 Stagecoach 替补。 |
| R-QUEST-RESULT | implemented-and-tested | Quest 完成后结算 Gold / XP / Quirk / Disease，回 Haml… |
| R-OFFICIAL-GUARDIAN-DATA | data-missing | Act IV Guardian 正式卡牌资料（Ruins Boss 完整定义）。 |
| R-OFFICIAL-FINAL-DATA | data-missing | Final Encounter / Ancestor Room 正式卡牌资料。 |
| R-OFFICIAL-CORE-CARDS | data-missing | Hero / Skill / Quest / Monster / Room / Curio … |
| R-DETERMINISTIC-RNG | implemented-not-tested | 所有随机行为经统一可注入 RNG，禁止 Math.random() 直接进入正式逻辑。 |
| R-PROTOTYPE-ISOLATION | implemented-and-tested | official path 不得引用 prototype-* ID。 |

## 5. 确定性 RNG 审计

| 指标 | 值 |
| --- | --- |
| 整体通过 | ❌ |
| `Math.random` 命中（全仓） | 1 |
| `Math.random` 命中（官方路径） | 1 |
| 时间源命中 | 8 |
| Definition Hash 稳定 | ✅ |

**官方路径命中明细**

| 文件 | 行 | 代码 |
| --- | --- | --- |
| `src/game-engine/random.ts` | 29 | `const rand = Math.random().toString(36).slice(2, 8);` |

> 该命中位于 `createId()`，用于生成实体 id 而非游戏结果；但它使**同 seed 两次运行的状态哈希不同**，
> 直接导致 Replay 决定性判定失败（ISSUE-P1-001 / ISSUE-P1-002）。

## 6. Golden Run（十一 Quest 垂直游玩）

| 指标 | 值 |
| --- | --- |
| seed | `golden-normal-success-01` |
| outcome | **blocked** |
| 最终 Act | 4 |
| 最终 GamePhase | `quest-select` |
| 完成任务数 | 9 |
| 事件数 | 104 |
| RNG 抽取次数 | 447 |
| 不变量违反（error） | 0 |
| 重复事务 | 0 |
| 引擎死锁 | 无 |
| Act 卡死首次触发 | — |
| Act 卡死下最多完成 | 0 个任务 |



### 6.1 里程碑覆盖（状态谓词判定，非任务数下标映射）

| ID | 里程碑 | 到达 | State Hash |
| --- | --- | --- | --- |
| M00 | 新战役创建完成（4 英雄 + 默认技能） | ✅ | `1a6e84bb` |
| M01 | Act I · Standard Quest 1 结算完成 | ✅ | `e0bc6a01` |
| M02 | Act I · Standard Quest 2 结算完成 | ✅ | `1dec2cf6` |
| M03 | Act I · Boss Quest 胜利 → 进入 Act II | ✅ | `1352f39d` |
| M04 | Act II · Standard Quest 1 结算完成 | ✅ | `54aa9b4a` |
| M05 | Act II · Standard Quest 2 结算完成 | ✅ | `501a5094` |
| M06 | Act II · Boss Quest 胜利 → 进入 Act III | ✅ | `53ac5a97` |
| M07 | Act III · Standard Quest 1 结算完成 | ✅ | `3f7b3dd0` |
| M08 | Act III · Standard Quest 2 结算完成 | ✅ | `b832b935` |
| M09 | Act III · Boss Quest 胜利 → 第三 Threat 后 Hamlet | ✅ | `1b71a425` |
| M10 | Darkest Dungeon 解锁 + Guardian Quest 生成 | ❌ | — |
| M11 | Guardian 击败 → Final Hamlet | ❌ | — |
| M12 | Final Hamlet 4 天完成 | ❌ | — |
| M13 | Final Encounter 开始（首个 Form 出场） | ❌ | — |
| M14 | 倒数第二个 Form 被击败 | ❌ | — |
| M15 | Heart of Darkness 击败 → Campaign Victory | ❌ | — |

到达率：**10 / 16**

### 6.2 Save / Resume 矩阵

| 里程碑 | 名称 | 往返 |
| --- | --- | --- |
| M00 | 新战役创建完成（4 英雄 + 默认技能） | ✅ |
| M01 | Act I · Standard Quest 1 结算完成 | ✅ |
| M02 | Act I · Standard Quest 2 结算完成 | ✅ |
| M03 | Act I · Boss Quest 胜利 → 进入 Act II | ✅ |
| M04 | Act II · Standard Quest 1 结算完成 | ✅ |
| M05 | Act II · Standard Quest 2 结算完成 | ✅ |
| M06 | Act II · Boss Quest 胜利 → 进入 Act III | ✅ |
| M07 | Act III · Standard Quest 1 结算完成 | ✅ |
| M08 | Act III · Standard Quest 2 结算完成 | ✅ |
| M09 | Act III · Boss Quest 胜利 → 第三 Threat 后 Hamlet | ✅ |

> 覆盖率受 Act 推进断裂限制：M03 及之后的里程碑从未到达，其存档往返**未被验证**。

### 6.3 UI-store-shim 步骤（架构泄漏证据）

- `proceedToLoadout`
- `proceedToQuests`
- `moveToRoom`
- `autoBattle`
- `resolveVictory`
- `finishQuest`
- `returnToHamlet`
- `resolveReplacements`

> 这些编排步骤在 `src/game-engine/**` 中没有可调用入口，只存在于 `src/store/useGameStore.ts` 与 UI 页面。
> 无头审计必须在 `src/audit/core-campaign/headless-shim.ts` 中逐行复刻，该文件的存在本身即为 ISSUE-P1-006 的证据。

### 6.4 性能基线（§32）

| 步骤 | avg | 备注 |
| --- | --- | --- |
| New Campaign 初始化 | 0.416 ms | 真实路径 |
| Quest Setup | 3.643 ms | 真实路径 |
| Battle Setup | 4.055 ms | 真实路径 |
| Save | 0.004 ms | 代表性存档 21566 B |
| Load | 0.314 ms | 真实路径 |
| Form Transition | 0.602 ms | **机制级**（正式四 Act 主循环不可达，ISSUE-P0-001） |

完整 Run 体量极值：事件数 **104**、最大 Save **77834 B**、最大 Ledger **33**、峰值 Actor **7**、峰值 Initiative **7**。

工程门禁：Save/Load×100 不崩溃 `true`、无体积膨胀 `true`、Form Transition 无泄漏 `true`、无长时无响应 `✅`。

> 完整报告见 [performance-baseline.md](./performance-baseline.md)。浏览器内存趋势为浏览器/Playwright 维度，node 侧未测量。

## 7. Golden Seed 矩阵

| Seed | 模式 | 可跑 | 阻断原因 |
| --- | --- | --- | --- |
| golden-normal-success-01 | normal | ❌ 不可跑 | Act 推进状态机（campaign-progress.ts）无任何生产调用方，Boss Quest 定义零引用 → 11-Quest 循环在正式路径上不可达（ISSUE-P0-001） |
| golden-save-resume-01 | save-resume | ❌ 不可跑 | 依赖完整 11-Quest 循环；Save/Resume 本身可在已达成的里程碑上单独验证 |
| golden-hero-death-replacement-01 | hero-death | ❌ 不可跑 | 依赖完整 11-Quest 循环（英雄死亡/替补机制本身已实现并单测覆盖） |
| golden-stagecoach-exhaustion-01 | stagecoach-exhaustion | ✅ 可跑 | — |
| golden-boss-failure-01 | boss-failure | ❌ 不可跑 | Boss Quest 无法通过正式路径选中（FACE_THE_THREAT_QUEST_DEFINITION 零引用） |
| golden-guardian-failure-01 | guardian-failure | ❌ 不可跑 | Guardian 官方数据 unavailable（Data Gate 关闭），仅 prototype harness 可跑 |
| golden-final-failure-01 | final-failure | ❌ 不可跑 | Final Encounter 官方数据 unavailable（isFinalEncounterOfficialEnabled() === false） |
| golden-templars-guardian | guardian | ❌ 不可跑 | 官方 Guardian 数据缺失；prototype harness 已在 Phase 10B E2E 覆盖 |
| golden-mammoth-cyst-guardian | guardian | ❌ 不可跑 | 官方 Guardian 数据缺失；prototype harness 已在 Phase 10C E2E 覆盖 |
| golden-shuffling-horror-guardian | guardian | ❌ 不可跑 | 官方 Guardian 数据缺失；prototype harness 已在 Phase 10D E2E 覆盖 |
| golden-skip-ancestor-first | skipped-form | ❌ 不可跑 | Final Encounter 官方数据 unavailable；prototype harness 已在 Phase 10E E2E 覆盖 |
| golden-skip-ancestor-second | skipped-form | ❌ 不可跑 | Final Encounter 官方数据 unavailable；prototype harness 已在 Phase 10E E2E 覆盖 |
| golden-skip-gestating-heart | skipped-form | ❌ 不可跑 | Final Encounter 官方数据 unavailable；prototype harness 已在 Phase 10E E2E 覆盖 |

可跑 **1 / 13**。

## 8. Issue Ledger

open **P0=1 / P1=3 / P2=2**

| ID | 级别 | 状态 | 域 | 标题 |
| --- | --- | --- | --- | --- |
| ISSUE-P0-002 | P0 | open | content-data | Act IV 官方卡面数据缺失，官方池被 Data Gate 关闭 |
| ISSUE-P1-001 | P1 | open | determinism | createId() 直接使用 Math.random() / Date.now()，破坏 replay 可复现性 |
| ISSUE-P1-002 | P1 | open | determinism | 同一 seed 的两次 replay 不完全一致 |
| ISSUE-P2-001 | P2 | open | content-governance | 大量内容条目缺少 sourceReference |
| ISSUE-P1-006 | P1 | open | architecture | 战役编排层只存在于 UI store / 页面，game-engine 缺少对应入口 |
| ISSUE-P2-003 | P2 | open | state-model | HamletState 未保存「本段总准备天数」，天数守恒无法在单帧状态上校验 |

## 9. Release Gate 明细

| 门禁项 | 值 |
| --- | --- |
| buildPasses | ✅ |
| unitPasses | ✅ |
| integrationPasses | ⚪ 未验证（本阶段未测量，不计为通过） |
| criticalE2EPasses | ⚪ 未验证（本阶段未测量，不计为通过） |
| goldenCampaignPasses | ✅ |
| replayDeterminismPasses | ❌ |
| openP0 | 1 |
| openP1 | 3 |
| prototypeReferencesInOfficialPath | 0 |
| duplicateCommittedTransactions | 0 |
| engineDeadlocks | 0 |
| elevenQuestLoopClosed | ✅ |
| campaignVictoryReachable | ❌ |
| campaignOverReachable | ✅ |
| threeGuardiansPass | ❌ |
| threeSkippedFormsPass | ❌ |
| fourRuinsBossesPass | ❌ |
| saveResumeKeyNodesPass | ✅ |
| ruleTraceabilityP0Complete | ❌ |
| passed | ❌ |

> ⚪ 标记的门禁位**未被测量**，与「测量后失败」是两回事。
> `ReleaseGateResult` 内部用 `?? false` 收敛（对门禁判定保守是对的），
> 但报告必须把两者区分开，否则会读成「build 挂了」。

## 10. 未采集项（诚实声明）

Phase 11A 的定义（§45）共 35 项，以下项目**本阶段未采集**，不得视为通过：

- **Performance Baseline（§32）** — 已采集（见 [performance-baseline.md](./performance-baseline.md)）；浏览器内存趋势仍 ⚪ 未测量（node 侧无法测）。
- **Manual Vertical Playtest（§38-39）** — 未产出 `docs/reports/phase-11a/playtests/` 人工游玩日志。
- **Playwright E2E 五套 spec（§37）** — `core-campaign-golden` / `campaign-failure` / `guardian-matrix` / `final-form-matrix` / `save-resume-matrix` 未创建。
- **CI 工作流（§41）** — 未接入。
- **CoreCampaignAuditPanel.tsx（§44）** — 审计调试面板未创建。
- **四 Ruins Boss / 三 Guardian / 三 skipped Form 覆盖（§25-26）** — 前置阻塞（Act 推进 + Data Gate），不可达。


> 之所以逐条列出而不是省略：Phase 11A 的目的就是**诚实地界定当前边界**。
> 把未做的事标成"通过"会让后续阶段基于错误前提排期。

## 11. 结论与后续建议

1. **ISSUE-P0-001（Act 推进断裂）是唯一的横向阻塞点**，且根因明确、修复面很小：
   `campaign-progress.ts` 的纯函数本身经测试证明是正确的，缺的只是在 `finishQuest` 里接线。
   修复后 M03—M09 应立即可达。
2. **ISSUE-P0-002（Act IV 官方数据缺失）** 属于资料问题而非代码问题，需要补齐规则书/卡牌数据后再开 Data Gate。
3. **ISSUE-P1-001/002（`createId` 用 `Math.random`）** 使 Replay 决定性无法成立，建议改为由 seed 派生的计数器。
4. **ISSUE-P1-006（编排逻辑只存在于 store）** 是本次审计成本最高的一项；建议把
   `headless-shim.ts` 里复刻的 8 类编排上提为引擎导出，store 退化为薄适配层。

---

_本报告由 `scripts/audit/final-report.ts` 生成。数据来源：`docs/data/core-campaign/`。_
