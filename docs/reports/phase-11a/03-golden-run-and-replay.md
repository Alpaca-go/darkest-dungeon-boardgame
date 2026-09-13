# Phase 11A — 11-Quest Golden Run / Milestone Hash / Replay 决定性

> 由 `npm run audit:release-gate` 自动生成，请勿手改。

## 1. Golden Run 结果（seed `golden-normal-success-01`）

| 指标 | 值 |
| --- | --- |
| outcome | **blocked** |
| 最终 Act | 4 |
| 最终 GamePhase | `quest-select` |
| 完成任务数 | 9 |
| 到达里程碑 | M00, M01, M02, M03, M04, M05, M06, M07, M08, M09 |
| 阻断里程碑 | — |
| 事件数 | 97 |
| RNG 抽取次数 | 337 |
| 不变量违反 | 0 |
| 重复事务 | 0 |
| 死锁阶段 | — |
| Act 卡死首次触发 | — |
| Act 卡死下最多完成 | 0 个任务 |



### 1.1 垂直游玩真实性说明

本次 Golden Run **未使用任何 debug skip**（硬约束 4）：地牢逐房间推进、战斗逐技能释放
（`beginHeroSkillAction`）、Trinket 机会逐个结清、英雄阵亡走 Stagecoach 替补正式入口。
战役最终以 `quest-select` 收束，说明**单 Act 内的纵向循环是通的**；
当前已到达 Act IV；完整官方战役仍受 ISSUE-P0-002 数据缺口阻断。

### 1.2 不得不使用的 UI-store-shim 步骤（ISSUE-P1-006 证据）

_无_

> Driver 与 Store 共用 Production Commands；headless shim 已删除，结构化 PCA 产物记录实际路由和导入验证结果。

## 2. 16 里程碑覆盖

| ID | 里程碑 | 状态 | State Hash | Quest 数 | 依赖能力 |
| --- | --- | --- | --- | --- | --- |
| M00 | 新战役创建完成（4 英雄 + 默认技能） | ✅ 到达 | `b196c24b` | 0 | createNewCampaign / selectParty / applyDefaultLoadout |
| M01 | Act I · Standard Quest 1 结算完成 | ✅ 到达 | `61cf933c` | 1 | selectQuest / finishQuest / startHamletPhase |
| M02 | Act I · Standard Quest 2 结算完成 | ✅ 到达 | `9e24f76f` | 2 | campaign-progress.withStandardQuestCompleted |
| M03 | Act I · Boss Quest 胜利 → 进入 Act II | ✅ 到达 | `3abfa7b2` | 3 | campaign-progress.withActStarted + Boss Quest 可选中 |
| M04 | Act II · Standard Quest 1 结算完成 | ✅ 到达 | `d64c21a2` | 4 | Act 推进生效 |
| M05 | Act II · Standard Quest 2 结算完成 | ✅ 到达 | `546105ba` | 5 | Act 推进生效 |
| M06 | Act II · Boss Quest 胜利 → 进入 Act III | ✅ 到达 | `4dcb256f` | 6 | Act 推进生效 |
| M07 | Act III · Standard Quest 1 结算完成 | ✅ 到达 | `a4451b1b` | 7 | Act 推进生效 |
| M08 | Act III · Standard Quest 2 结算完成 | ✅ 到达 | `2b70ce0f` | 8 | Act 推进生效 |
| M09 | Act III · Boss Quest 胜利 → 第三 Threat 后 Hamlet | ✅ 到达 | `1b9bd9b9` | 9 | Act 推进生效 |
| M10 | Darkest Dungeon 解锁 + Guardian Quest 生成 | ❌ 未到达 | — | — | act-four unlock + createGuardianQuest |
| M11 | Guardian 击败 → Final Hamlet | ❌ 未到达 | — | — | resolveGuardianVictory（官方数据缺失，仅 prototype harness） |
| M12 | Final Hamlet 4 天完成 | ❌ 未到达 | — | — | startFinalHamlet / advanceFinalHamletDay |
| M13 | Final Encounter 开始（首个 Form 出场） | ❌ 未到达 | — | — | prepareFinalEncounter / startFinalEncounter |
| M14 | 倒数第二个 Form 被击败 | ❌ 未到达 | — | — | defeatFinalForm / transitionToNextFinalForm |
| M15 | Heart of Darkness 击败 → Campaign Victory | ❌ 未到达 | — | — | resolveCampaignVictory |

到达率：**10 / 16**

### 2.1 Save / Resume 矩阵（§21）

在**每个到达的里程碑**处走真实存档管线做一次非破坏性往返：
`createSaveSnapshot` → JSON 序列化往返 → `validateSaveFile` → `restoreSaveSnapshot` → 状态哈希比对。

| 里程碑 | 名称 | saveVersion | 校验 | 哈希一致 | 结论 |
| --- | --- | --- | --- | --- | --- |
| M00 | 新战役创建完成（4 英雄 + 默认技能） | 17 | ✅ | ✅ | ✅ 通过 |
| M01 | Act I · Standard Quest 1 结算完成 | 17 | ✅ | ✅ | ✅ 通过 |
| M02 | Act I · Standard Quest 2 结算完成 | 17 | ✅ | ✅ | ✅ 通过 |
| M03 | Act I · Boss Quest 胜利 → 进入 Act II | 17 | ✅ | ✅ | ✅ 通过 |
| M04 | Act II · Standard Quest 1 结算完成 | 17 | ✅ | ✅ | ✅ 通过 |
| M05 | Act II · Standard Quest 2 结算完成 | 17 | ✅ | ✅ | ✅ 通过 |
| M06 | Act II · Boss Quest 胜利 → 进入 Act III | 17 | ✅ | ✅ | ✅ 通过 |
| M07 | Act III · Standard Quest 1 结算完成 | 17 | ✅ | ✅ | ✅ 通过 |
| M08 | Act III · Standard Quest 2 结算完成 | 17 | ✅ | ✅ | ✅ 通过 |
| M09 | Act III · Boss Quest 胜利 → 第三 Threat 后 Hamlet | 17 | ✅ | ✅ | ✅ 通过 |

通过率：**10 / 10**
（Gate 位 `saveResumeKeyNodesPass` 由该表计算得出，非硬编码。）

## 3. Replay 决定性

| 指标 | 值 |
| --- | --- |
| 两次运行完全一致 | ✅ |
| 首个分叉事件下标 | -1 |
| RNG 序列一致 | ✅ |
| Bundle Hash A | `a356075e` |
| Bundle Hash B | `a356075e` |

> Milestone Hash 在 `stripVolatile()`（剥离 `id` / `createdAt` / `updatedAt` / `log`）后可稳定复现。

## 4. 不变量违反明细

_全程 0 违反_
