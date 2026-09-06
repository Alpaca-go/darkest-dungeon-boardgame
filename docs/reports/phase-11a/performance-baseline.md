# Phase 11A — §32 性能基线

> 由 `npm run audit:performance-baseline` 自动生成，请勿手改。
> 本基线走**真实引擎路径**（CampaignSimulationDriver / 正式 Act IV 装配链），非估算。
> `measuredAt` 刻意固定为 epoch 以保持产物可复现（非真实时间）。

## 0. 环境

| 项 | 值 |
| --- | --- |
| Node | `v24.20.0` |
| 平台 | `win32` |
| measuredAt | `1970-01-01T00:00:00.000Z` |

## 1. 步骤耗时（§32 要求项）

| 步骤 | 次数 | avg | min | max | p95 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| New Campaign 初始化 | 20 | 0.416 ms | 0.005 ms | 4.689 ms | 4.689 ms |
| Quest Setup | 10 | 3.643 ms | 1.539 ms | 9.249 ms | 9.249 ms |
| Battle Setup | 10 | 4.055 ms | 2.112 ms | 14.452 ms | 14.452 ms |
| Save | 50 | 0.004 ms | 0.001 ms | 0.05 ms | 0.022 ms | 21566 B |
| Load | 50 | 0.314 ms | 0.197 ms | 3.798 ms | 0.486 ms |
| Form Transition | 10 | 0.602 ms | 0.291 ms | 2.555 ms | 2.555 ms | 机制级 |

> **Form Transition 为机制级测量**：正式四 Act 主循环在 Act I 断裂（ISSUE-P0-001），
> 无法通过自然游玩到达 Final Encounter；此处复用 Phase 10E 调试面板同款正式引擎入口把战役推到
> Final Encounter 后再对 `transitionToNextFinalForm` 计时。
> 机制级测量：经正式引擎装配链推到 Final Encounter 后计时；正式四 Act 主循环不可达（ISSUE-P0-001）。

## 2. 完整 Run 体量极值

| 指标 | 值 |
| --- | --- |
| 完整 Run 事件数 | 104 |
| 最大 Save 大小 (B) | 77834 |
| 最大 Ledger（待处理事务） | 33 |
| 峰值 Actor（英雄+怪物） | 7 |
| 峰值 Initiative（先攻序长度） | 7 |

> 完整 Run 在正式路径上仅能跑到 Act I（完成 9 个任务后停在 quest-select），以下为**该可达 Run**的真实极值，不代表完整 11-Quest 全链路。

## 3. 工程门禁（§32 收尾要求）

| 门禁项 | 结果 |
| --- | --- |
| Save/Load ×100 不崩溃 | ✅ |
| Save/Load ×100 无体积膨胀 | ✅ |
| Form Transition 无事务泄漏 | ✅ |
| 无长时无响应命令（步骤 < 预算） | ✅ |
| 重复监听器膨胀（浏览器维度） | ⚪ 未测量（node 侧无法测） |
| 步骤预算 (ms) | newCampaignInit=50, questSetup=250, battleSetup=300, save=60, load=60, formTransition=120 |

- **不重复监听器膨胀**：浏览器/React 维度，node 侧无法测量，标记 ⚪。
- **无指数级 Save 膨胀**：以 Save/Load ×100 前后快照体积对比验证。
- **Form Transition 无泄漏**：完整 defeat+transition 链走完后，`processedTransactionIds` 不重复且受 Form 数上界约束。
- **无长时无响应命令**：各步骤单次 avg 耗时均须低于预算（见步骤预算行）。

## 4. 备注

_无_

---

_本报告由 `scripts/audit/performance-baseline.ts` 生成。数据来源：`docs/data/core-campaign/performance-baseline.json`。_
