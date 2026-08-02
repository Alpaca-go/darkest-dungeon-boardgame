# Phase 11A — Release Gate 判定

> 由 `npm run audit:release-gate` 自动生成，请勿手改。

## 最终判定

# FAIL — campaign-flow-blocked：11-Quest / 4-Act 主循环无法在正式引擎路径上闭环（停在 Act 1 / campaign-over，完成 10 个任务）。 根因：CAMPAIGN_FLOW_BLOCKED：已完成 10 个 Standard Quest（首次触发于第 3 个），campaign.act 始终为 1。Act 推进状态机（src/game-engine/campaign/campaign-progress.ts）无任何生产调用方，Boss Quest 定义（FACE_THE_THREAT_QUEST_DEFINITION）零引用，11-Quest 循环在正式路径上不可达。

## 门禁明细

| 门禁项 | 结果 |
| --- | --- |
| build 通过 | ✅ |
| 单元测试通过 | ✅ |
| 集成测试通过 | ⚪ 未验证 |
| 关键 E2E 通过 | ⚪ 未验证 |
| Golden Campaign 通过 | ❌ |
| Replay 决定性 | ❌ |
| 11-Quest 循环闭环 | ❌ |
| Campaign Victory 可达 | ❌ |
| Campaign Over 可达 | ✅ |
| 3 Guardian 全通 | ❌ (官方数据 unavailable) |
| 3 skipped-Form 全通 | ❌ (官方数据 unavailable) |
| 4 Ruins Boss 全通 | ❌ (Boss Quest 不可选中) |
| Save/Resume 关键节点 | ✅ 3/3 通过（⚠️ 覆盖率仅 3/16 里程碑，M03+ 因 Act 推进断裂不可达，未被验证） |
| P0 规则追溯完整 | ❌ |
| open P0 | 2 |
| open P1 | 3 |
| 官方路径 prototype 引用 | 0 |
| 重复提交事务 | 0 |
| 引擎死锁 | 0 |

## Data Gate 状态

| Gate | 开启 | 数据缺口 |
| --- | --- | --- |
| 官方 Guardian 池 | ❌ | 3 |
| 官方 Final Encounter | ❌ | 5 |
| 官方 Darkest Dungeon Quest 池 | ❌ | 3 |

## Golden Seed 可运行性

- 可运行：**1 / 13**
- 被阻断：**12**

## 内容治理

- 内容条目：**145**，其中 official-ready **1**
- 缺 `sourceReference`：**144**
