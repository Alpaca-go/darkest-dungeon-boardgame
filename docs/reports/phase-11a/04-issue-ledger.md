# Phase 11A — Issue Ledger

> 由 `npm run audit:release-gate` 自动生成，请勿手改。

| 等级 | 数量 |
| --- | --- |
| P0 open | 2 |
| P1 open | 3 |
| P2 open | 2 |

---

## ISSUE-P0-001 · P0 · campaign-flow

**11-Quest / 4-Act 主循环在正式引擎路径上不可达**

- **状态**：open
- **描述**：断链共 5 处（均由 campaign-flow.test.ts 静态扫描固化）：
(1) Act 推进状态机 src/game-engine/campaign/campaign-progress.ts 中的 withActStarted / withStandardQuestCompleted / recomputeBossLock 等函数**没有任何生产调用方**（纯死代码，但函数本身逻辑正确 —— 缺的是接线不是实现）；
(2) finishQuest / selectQuest 中 act 只出现初始化字面量 act: 1，从不推进；
(3) Boss Quest 定义 FACE_THE_THREAT_QUEST_DEFINITION 零生产引用，玩家永远抽不到"直面威胁"；
(4) 全仓不存在任何 act: 2 / act: 3 写入 —— **Act II 与 Act III 在生产代码中彻底不可达**；
(5) 唯一能写 act: 4 的 unlockDarkestDungeonAct() 依赖 defeatedBossFamilyIds.length >= 3，而 defeatedBossFamilyIds 在生产代码里**从不追加**（只有初始化 []、存档反序列化，以及 dev 调试面板 ActFourDebugSection.tsx 硬塞 [necromancer, prophet, collector]）。即 Act IV 目前只能经调试面板进入，正式游玩路径不可达。
结论：战役永远停留在 Act I，M03~M15 里程碑无法达成。
- **期望**：完成 2 个 Standard Quest 后 Boss Quest 解锁并强制；Boss 胜利后追加 defeatedBossFamilyIds 并 act 1 → 2 → 3；击败 3 个 Boss 家族后由正式流程（非调试面板）解锁 Act IV。
- **实际**：完成 10 个任务后 act 仍为 1，阶段停在 campaign-over。
- **复现 seed**：`golden-normal-success-01`
- **复现命令**：`npm run test:golden` / `npm run audit:release-gate`
- **State Hash**：`b3f522a2`
- **回归测试**：`golden-run.test.ts:11-quest-loop` / `campaign-flow.test.ts:act-advance` / `campaign-flow.test.ts:act-four-debug-only`

---

## ISSUE-P0-002 · P0 · content-data

**Act IV 官方卡面数据缺失，官方池被 Data Gate 关闭**

- **状态**：open
- **描述**：Guardian 缺口 3 项、Final Encounter 缺口 5 项、Darkest Dungeon Quest 缺口 3 项。按硬约束 22，缺失数据一律标记 content-blocked，不得猜测补全。
- **期望**：官方 Guardian / Final Form / Quest 数据齐备且 Data Gate 打开。
- **实际**：isDarkestDungeonOfficialGuardianPoolEnabled()=false, isFinalEncounterOfficialEnabled()=false, isDarkestDungeonOfficialQuestPoolEnabled()=false
- **复现命令**：`npm run audit:content`
- **回归测试**：`content-manifest.test.ts:data-gate-closed`

---

## ISSUE-P1-001 · P1 · determinism

**createId() 直接使用 Math.random() / Date.now()，破坏 replay 可复现性**

- **状态**：open
- **描述**：src/game-engine/random.ts:29-30 的 createId() 绕开了可注入随机源 _rng，同时混入 Date.now()。任何包含新建 id 的状态都无法在同 seed 下逐位复现，Milestone Hash 必须先剥离这些字段才能比较（见 campaign-invariants.stripVolatile）。
- **期望**：正式逻辑内 0 处 Math.random()；id 生成走可注入随机源。
- **实际**：官方路径检出 1 处 Math.random() 泄漏。
- **复现命令**：`npm run audit:rules`
- **回归测试**：`rng-audit.test.ts:no-math-random-in-official-path`

---

## ISSUE-P1-002 · P1 · determinism

**同一 seed 的两次 replay 不完全一致**

- **状态**：open
- **描述**：事件序列或 RNG 抽取序列在两次运行间发生分叉。
- **期望**：事件序列、RNG 序列、最终 state hash 三者逐位一致。
- **实际**：firstDivergentEventIndex=0, rngMatch=true, hashA=2a6e3203, hashB=807cd6c0
- **复现 seed**：`golden-normal-success-01`
- **复现命令**：`npm run test:golden`
- **回归测试**：`golden-run.test.ts:replay-determinism`

---

## ISSUE-P2-001 · P2 · content-governance

**大量内容条目缺少 sourceReference**

- **状态**：open
- **描述**：144/145 条内容没有规则书出处，按 spec §6 一律不能判定为 verified / official-ready。
- **期望**：所有官方内容条目具备 sourceReference。
- **实际**：缺失 144 条。
- **复现命令**：`npm run audit:content`
- **回归测试**：`content-manifest.test.ts:source-reference-coverage`

---

## ISSUE-P1-006 · P1 · architecture

**战役编排层只存在于 UI store / 页面，game-engine 缺少对应入口**

- **状态**：open
- **描述**：战役状态机被劈成两半：game-engine 只导出「原子步骤」，把它们串起来的编排层写在 src/store/useGameStore.ts 与 UI 页面里，且没有任何引擎侧导出。已实测到的缺口包括：① gamePhase 的 campaign-setup → skill-loadout → quest-select 迁移（store proceedToLoadout/proceedToQuests，引擎只有守卫 canProceedToLoadout()/isLoadoutComplete()）；② settleBattle 的 6 步战斗结算流水线（store:310-341，模块私有闭包）；③ moveToRoom / resolveVictory / leaveDungeon / failQuestFromDefeat / returnToHamlet 的组合动作；④ Trinket before-attack-roll 机会的批量结清（不结清则 pendingAction 永久冻结）；⑤ pendingTrinketAllocations 的批量结清（不结清则 startHamletPhase 静默返回原 state）；⑥ retargetPendingReplacement（store 模块私有函数，引擎无等价导出）；⑦ 替补流程「遍历所有未确认槽位」的循环（只在 ReplacementPage）。结果：任何无头驱动（Simulation Driver / Golden Run / Replay / 回归测试）都必须复制一份 UI 逻辑（见 src/audit/core-campaign/headless-shim.ts），存在长期不同步风险。
- **期望**：所有 gamePhase 迁移与组合动作都由 game-engine 导出的纯函数负责，store 只做转发；删除 headless-shim.ts 后无头驱动仍能跑完整局。
- **实际**：Golden Run 中有 8 类步骤依赖 UI-store-shim：proceedToLoadout, proceedToQuests, moveToRoom, autoBattle, resolveVictory, finishQuest, returnToHamlet, resolveReplacements。
- **复现 seed**：`golden-normal-success-01`
- **复现命令**：`npm run test:golden`
- **回归测试**：`simulation-driver.test.ts:no-ui-store-shim-required`

---

## ISSUE-P2-003 · P2 · state-model

**HamletState 未保存「本段总准备天数」，天数守恒无法在单帧状态上校验**

- **状态**：open
- **描述**：HamletState 同时持有 preparationDays（剩余天数倒计时，endHamletDay 每次 -1）与 currentDay（累加日序，跨 Hamlet 段不重置），但没有保存本段的初始总天数。因此「已过天数 + 剩余天数 = 事件规定天数」这条守恒关系无法从任一单帧状态推出，只能靠重放事件序列还原。本次审计早期据此写错不变量，产生 84 条假阳性 HAMLET_DAY_OVERFLOW，已修正（见 campaign-invariants.ts Hamlet 段注释）。
- **期望**：HamletState 记录 totalPreparationDays（或以 currentDay/总天数替代倒计时），使守恒可单帧校验。
- **实际**：preparationDays 与 currentDay 方向相反且无总量锚点，只能靠事件重放还原。
- **复现命令**：`npm run test:golden`
- **回归测试**：`campaign-invariants.test.ts:hamlet-day-semantics`

