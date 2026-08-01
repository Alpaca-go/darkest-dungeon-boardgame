# Phase 10A · Darkest Dungeon (Act IV) 通用框架 —— 验证报告

> 生成时间：2026-08-01
> 状态：**框架完成（verified Act IV framework complete）**，official Guardian / Final Encounter 战斗内容待源数据（Data Gate 已锁死）。

## 1. 验证结论

| 维度 | 结果 |
|---|---|
| `tsc --noEmit` 全项目类型检查 | ✅ 0 error |
| `npm run build`（tsc && vite build） | ✅ 通过（JS 458 kB / CSS 27 kB） |
| Unit Test（vitest） | ✅ 17 文件 / **500 用例全过**（含 Act IV 75 例） |
| Playwright E2E | ✅ **72 用例全过**（含 Act IV 11 例，2 例 DOM 驱动，此前 skip 现已跑通） |
| Save Migration v11 → v12 | ✅ 旧档可迁移、损坏档不白屏 |

## 2. §29 单元测试（82 项）覆盖

测试文件：`src/game-engine/campaign/act-four/act-four.test.ts`（75 个 `it`，82 个 §29 项全部有断言；同源语义项合并到单个 `it`）。

- **Act IV 解锁**（1–6）：第三个 Threat 后解锁、Campaign Level 恒为 3、不再抽 Threat、不再提供 Standard Quest、第三 Boss 后 Hamlet 可进入、解锁幂等。
- **Quest / Content**（7–21）：三选一、RNG 可注入、刷新不重抽、16 Rooms / 3 XP、保存 Guardian 与 skipped Form、skipped 仅限前三、official 数据缺失禁用（Data Gate）、Monster Deck / Level III / Room Deck / Ruins Curio / Trinket Tier III / 原 Deck 保留。
- **Layout / Boss Slots**（22–31）：两 Layout 抽一、16 Slots / 3 Boss Slots、Graph 连通、Objective 混洗且仅一次、Objective 落 Boss Slot、不走 Edge Room、刷新不重分配、UI 不泄露 Objective。
- **Excavation Site**（32–42）：Empty 解释、每 Hero 1 Provision Die、dead 不掷、先保存、Pool 增加、8 Point 免费 Rest、不耗 Firewood、Pending 阻止继续、刷新不重掷、Room cleared、同 Room 不重复。
- **Guardian**（43–48）：不可撤退、失败 Campaign Over、胜利 3 XP、skipped 保留、Prototype 不进 official、胜利后进 Final Hamlet。
- **Final Hamlet**（49–53）：恰好 4 Days、不抽 Event、刷新可恢复、第 4 Day 后 Ready、不进普通 Quest Select。
- **Final Encounter**（54–71）：不生成 Dungeon Exploration、Roll Provisions 不重掷、Form 顺序固定、跳过指定前三、Heart of Darkness 不可跳过、首 Form 正确、Transition 触发、不恢复 Life/Stress、不允许 Rest/Stance、同 Room、Initiative 重建、Round 重置、不发 Form 级 XP、Final 失败 Campaign Over、最后 Form 死亡 Victory。
- **Save / Migration**（72–82）：Phase9E 存档可迁移、Quest/Layout/Boss Slot/Excavation Rest/Final Hamlet/Active Form/Transition 可恢复、Hash 变化用 Snapshot、Victory 刷新不重复、损坏 ActFourState 不白屏。

## 3. §30 Playwright E2E（9 场景）覆盖

文件：`e2e/phase10a-act-four-framework.spec.ts`（场景 1–9，运行时集成层，注入确定性 RNG，「刷新」以 JSON 落盘 + `migrateCampaignToLatest` 模拟）、`e2e/phase10a-debug-panel-smoke.spec.ts`（DOM 冒烟 5 例）。

9 个场景全部通过：① 解锁 ② Quest+Layout ③ Objective 隐藏 ④ Excavation ⑤ Guardian Failure ⑥ Guardian Victory ⑦ Final Encounter 准备 ⑧ Form Transition ⑨ Campaign Victory。DOM 冒烟 4（分步按钮驱动解锁→Quest→Layout→地图）与冒烟 5（「一键通关 (prototype)」驱动至 Campaign Victory + 刷新保持）现已跑通。

## 4. §32 完成度对照（35 项）

| # | 完成项 | 状态 |
|---|---|---|
| 1 | Act IV 状态机 | ✅ |
| 2 | 第三个 Threat 后解锁 | ✅ |
| 3 | Campaign Level III | ✅ |
| 4 | Quest 三选一 | ✅ |
| 5 | Guardian + Skipped Form 保存 | ✅ |
| 6 | Darkest Dungeon 内容切换 | ✅ |
| 7 | 两张 Layout 随机 | ✅ |
| 8 | 16 Rooms | ✅ |
| 9 | 3 Boss Slots | ✅ |
| 10 | Objective 隐藏分配 | ✅ |
| 11 | Excavation Site | ✅ |
| 12 | 每 Hero 一个 Provision Die | ✅ |
| 13 | 免费 8 Point Rest | ✅ |
| 14 | 不耗 Firewood | ✅ |
| 15 | Guardian Quest Failure | ✅ |
| 16 | Guardian Victory 3 XP | ✅ |
| 17 | Final Hamlet 4 Days | ✅ |
| 18 | No Hamlet Event | ✅ |
| 19 | Final Encounter 无探索 | ✅ |
| 20 | Final Provisions | ✅ |
| 21 | 四 Form 固定顺序 | ✅ |
| 22 | 跳过前三之一 | ✅ |
| 23 | Multi-Form Transition | ✅ |
| 24 | 无 Life/Stress 恢复 | ✅ |
| 25 | 无 Rest / Stance Change | ✅ |
| 26 | Same Room | ✅ |
| 27 | Campaign Victory 容器 | ✅ |
| 28 | Data Audit | ✅ |
| 29 | Verified / Prototype 隔离 | ✅ |
| 30 | Phase9E 存档迁移 | ✅ |
| 31 | Unit Test 通过 | ✅ |
| 32 | Playwright 通过 | ✅ |
| 33 | `npm run build` 通过 | ✅ |
| 34 | 不含正式 Guardian 技能 | ✅ |
| 35 | 不含正式 Final Boss 技能 | ✅ |

## 5. 本会话修复（Task #22 收尾 + 调试挂载）

- 修复 `ActFourDebugSection.tsx`：移除不存在的 `RngSource` 类型导入（RNG 类型为 `() => number`），重命名 `useRefSeed`→`makeSeedSequence`，修正 `failFinalEncounter` 结果无 `ok` 字段的调用，修正 `transitionToNextFinalForm` 的导入来源。tsc 0 error。
- **挂载孤儿调试组件**：`ActFourDebugSection`（§27 调试区，14 个受控按钮 + 「一键通关」）此前未被 `DebugPanel.tsx` 引用，导致 DOM 驱动的 E2E 不可用。已挂载（dev-only）。
- **打通「一键通关」**：调试 harness 的解锁按钮与 `onFullRun` 现在会从空白战役补齐「已击败 3 个 Boss Family」前置并走完 `createGuardianQuest → startGuardianBattle → resolveGuardianVictory`，使端到端验证可从零跑通。新增「创建 Guardian Quest」「进入 Guardian Battle」两个离散按钮，手动分步流程与 Stage 顺序一致。

## 6. Data Gate / Verified-Prototype 隔离

- 所有 official 池（`isDarkestDungeonOfficial*Enabled()`）因数据缺失返回 `false`，`mode:'formal'` 调用 Quest/Layout/Guardian/Final 一律被拒。
- 仅 `mode:'prototype'`（带 `prototype-` 前缀 ID）可跑通；正式数值严禁写入正式 ID（类型层 + 运行时双保险）。
- 不含任何正式 Guardian / Final Form 战斗技能（硬约束 22/23）。

## 7. 已知限制 / 发现

1. **Playwright 浏览器**：`~/.cache/ms-playwright` 原本为空，`npx playwright install chromium` 后 chromium-1234 可用，E2E 全程本地执行，无需联网。
2. **Firewood 计数器**：Firewood 仅作为卡面静态字段（`firewoodCount?`），「不消耗 Firewood」由 `consumeFirewood: false` 断言，无 campaign 级 Firewood 计数可比对。
3. **引擎/UI 缺陷**：无。本会话仅新增测试与挂载调试组件，未改动引擎业务源码。

## 8. 提交状态

- 代码改动**尚未提交**（按约定：git commit/push 需用户明确确认后执行）。
- 待确认后可执行沙箱绕过式 `git commit`（`git write-tree` → `git commit-tree` → 直写 `refs/heads/main`），再 `git push origin main`。
- 最终结论落档：`Phase 10A verified Act IV framework complete; official Guardian and Final Encounter combat content pending source data.`
