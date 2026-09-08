# Phase 11A — Issue Ledger

> 由 `npm run audit:release-gate` 自动生成，请勿手改。

| 等级 | 数量 |
| --- | --- |
| P0 open | 1 |
| P1 open | 0 |
| P2 open | 2 |

---

## ISSUE-P0-002 · P0 · content-data

**Act IV 官方卡面数据缺失，官方池被 Data Gate 关闭**

- **状态**：open
- **描述**：Guardian 缺口 6 项、Final Encounter 缺口 5 项、Darkest Dungeon Quest 缺口 3 项。按硬约束 22，缺失数据一律标记 content-blocked，不得猜测补全。
- **期望**：官方 Guardian / Final Form / Quest 数据齐备且 Data Gate 打开。
- **实际**：isDarkestDungeonOfficialGuardianPoolEnabled()=false, isFinalEncounterOfficialEnabled()=false, isDarkestDungeonOfficialQuestPoolEnabled()=false
- **复现命令**：`npm run audit:content`
- **回归测试**：`content-manifest.test.ts:data-gate-closed`

---

## ISSUE-P2-001 · P2 · content-governance

**大量内容条目缺少 sourceReference**

- **状态**：open
- **描述**：147/158 条内容没有规则书出处，按 spec §6 一律不能判定为 verified / official-ready。
- **期望**：所有官方内容条目具备 sourceReference。
- **实际**：缺失 147 条。
- **复现命令**：`npm run audit:content`
- **回归测试**：`content-manifest.test.ts:source-reference-coverage`

---

## ISSUE-P2-003 · P2 · state-model

**HamletState 未保存「本段总准备天数」，天数守恒无法在单帧状态上校验**

- **状态**：open
- **描述**：HamletState 同时持有 preparationDays（剩余天数倒计时，endHamletDay 每次 -1）与 currentDay（累加日序，跨 Hamlet 段不重置），但没有保存本段的初始总天数。因此「已过天数 + 剩余天数 = 事件规定天数」这条守恒关系无法从任一单帧状态推出，只能靠重放事件序列还原。本次审计早期据此写错不变量，产生 84 条假阳性 HAMLET_DAY_OVERFLOW，已修正（见 campaign-invariants.ts Hamlet 段注释）。
- **期望**：HamletState 记录 totalPreparationDays（或以 currentDay/总天数替代倒计时），使守恒可单帧校验。
- **实际**：preparationDays 与 currentDay 方向相反且无总量锚点，只能靠事件重放还原。
- **复现命令**：`npm run test:golden`
- **回归测试**：`campaign-invariants.test.ts:hamlet-day-semantics`

