# Phase 11A — 11-Quest Golden Run / Milestone Hash / Replay 决定性

> 由 `npm run audit:release-gate` 自动生成，请勿手改。

## 1. Golden Run 结果（seed `golden-normal-success-01`）

| 指标 | 值 |
| --- | --- |
| outcome | **campaign-over** |
| 最终 Act | 1 |
| 最终 GamePhase | `campaign-over` |
| 完成任务数 | 10 |
| 到达里程碑 | M00, M01, M02 |
| 阻断里程碑 | M03 |
| 事件数 | 140 |
| RNG 抽取次数 | 659 |
| 不变量违反 | 0 |
| 重复事务 | 0 |
| 死锁阶段 | — |
| Act 卡死首次触发 | 第 3 个任务 |
| Act 卡死下最多完成 | 10 个任务 |

> **阻断原因**：CAMPAIGN_FLOW_BLOCKED：已完成 10 个 Standard Quest（首次触发于第 3 个），campaign.act 始终为 1。Act 推进状态机（src/game-engine/campaign/campaign-progress.ts）无任何生产调用方，Boss Quest 定义（FACE_THE_THREAT_QUEST_DEFINITION）零引用，11-Quest 循环在正式路径上不可达。


### 1.1 垂直游玩真实性说明

本次 Golden Run **未使用任何 debug skip**（硬约束 4）：地牢逐房间推进、战斗逐技能释放
（`beginHeroSkillAction`）、Trinket 机会逐个结清、英雄阵亡走 Stagecoach 替补正式入口。
战役最终以 `campaign-over` 收束，说明**单 Act 内的纵向循环是通的**；
真正的阻塞在于 Act 之间的横向推进（见阻断原因）。

### 1.2 不得不使用的 UI-store-shim 步骤（ISSUE-P1-006 证据）

- `proceedToLoadout`
- `proceedToQuests`
- `moveToRoom`
- `autoBattle`
- `resolveVictory`
- `finishQuest`
- `returnToHamlet`
- `resolveReplacements`

> 上述步骤在 `src/game-engine/**` 中**没有可调用的编排入口**，只存在于
> `src/store/useGameStore.ts` / UI 页面。无头驱动必须在
> `src/audit/core-campaign/headless-shim.ts` 中逐行复刻，该文件的存在本身即为缺陷证据。

## 2. 16 里程碑覆盖

| ID | 里程碑 | 状态 | State Hash | Quest 数 | 依赖能力 |
| --- | --- | --- | --- | --- | --- |
| M00 | 新战役创建完成（4 英雄 + 默认技能） | ✅ 到达 | `f1a8e3da` | 0 | createNewCampaign / selectParty / applyDefaultLoadout |
| M01 | Act I · Standard Quest 1 结算完成 | ✅ 到达 | `f122fc56` | 1 | selectQuest / finishQuest / startHamletPhase |
| M02 | Act I · Standard Quest 2 结算完成 | ✅ 到达 | `52a0458e` | 2 | campaign-progress.withStandardQuestCompleted |
| M03 | Act I · Boss Quest 胜利 → 进入 Act II | ❌ 未到达 | — | — | campaign-progress.withActStarted + Boss Quest 可选中 |
| M04 | Act II · Standard Quest 1 结算完成 | ❌ 未到达 | — | — | Act 推进生效 |
| M05 | Act II · Standard Quest 2 结算完成 | ❌ 未到达 | — | — | Act 推进生效 |
| M06 | Act II · Boss Quest 胜利 → 进入 Act III | ❌ 未到达 | — | — | Act 推进生效 |
| M07 | Act III · Standard Quest 1 结算完成 | ❌ 未到达 | — | — | Act 推进生效 |
| M08 | Act III · Standard Quest 2 结算完成 | ❌ 未到达 | — | — | Act 推进生效 |
| M09 | Act III · Boss Quest 胜利 → 第三 Threat 后 Hamlet | ❌ 未到达 | — | — | Act 推进生效 |
| M10 | Darkest Dungeon 解锁 + Guardian Quest 生成 | ❌ 未到达 | — | — | act-four unlock + createGuardianQuest |
| M11 | Guardian 击败 → Final Hamlet | ❌ 未到达 | — | — | resolveGuardianVictory（官方数据缺失，仅 prototype harness） |
| M12 | Final Hamlet 4 天完成 | ❌ 未到达 | — | — | startFinalHamlet / advanceFinalHamletDay |
| M13 | Final Encounter 开始（首个 Form 出场） | ❌ 未到达 | — | — | prepareFinalEncounter / startFinalEncounter |
| M14 | 倒数第二个 Form 被击败 | ❌ 未到达 | — | — | defeatFinalForm / transitionToNextFinalForm |
| M15 | Heart of Darkness 击败 → Campaign Victory | ❌ 未到达 | — | — | resolveCampaignVictory |

到达率：**3 / 16**

### 2.1 Save / Resume 矩阵（§21）

在**每个到达的里程碑**处走真实存档管线做一次非破坏性往返：
`createSaveSnapshot` → JSON 序列化往返 → `validateSaveFile` → `restoreSaveSnapshot` → 状态哈希比对。

| 里程碑 | 名称 | saveVersion | 校验 | 哈希一致 | 结论 |
| --- | --- | --- | --- | --- | --- |
| M00 | 新战役创建完成（4 英雄 + 默认技能） | 16 | ✅ | ✅ | ✅ 通过 |
| M01 | Act I · Standard Quest 1 结算完成 | 16 | ✅ | ✅ | ✅ 通过 |
| M02 | Act I · Standard Quest 2 结算完成 | 16 | ✅ | ✅ | ✅ 通过 |

通过率：**3 / 3**
（Gate 位 `saveResumeKeyNodesPass` 由该表计算得出，非硬编码。）

## 3. Replay 决定性

| 指标 | 值 |
| --- | --- |
| 两次运行完全一致 | ❌ |
| 首个分叉事件下标 | 0 |
| RNG 序列一致 | ✅ |
| Bundle Hash A | `2a6e3203` |
| Bundle Hash B | `807cd6c0` |

> ❌ 存在非决定性，见 ISSUE-P1-002。

## 4. 不变量违反明细

_全程 0 违反_
