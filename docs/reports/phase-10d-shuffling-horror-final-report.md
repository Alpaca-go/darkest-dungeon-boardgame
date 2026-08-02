# Phase 10D 最终报告 — Shuffling Horror / 动态怪物行动优先级 / Echoing Disassembly / Hero Stance Shuffle

- **完成日期**：2026-08-02
- **提交**：`b77cbcb`（本地，parent `c96a5d5`），26 文件 / +3947 −17
- **推送状态**：未推送，`main` 领先 `origin/main` 1 个提交，等待用户确认
- **阶段边界**：Phase 10D 到此为止，**未进入 Phase 10E**

---

## 1. 文档与数据前置阅读

12 份开发文档 + `docs/data/darkest-dungeon/shuffling-horror/` 全部 6 个 JSON 已完整通读，规则依据锁定在 `DD_EN_COREBOX_RULES.pdf` p30–31（Monster Initiative Priority）与 p40（Shuffling Horror / Echoing Disassembly / Undulations）。

## 2. 数据审计报告

产出 `docs/reports/phase-10d-shuffling-horror-data-audit.md`，逐项标注 `verified / partial / prototype / unavailable`，**缺失数据一律不猜测**。

| 结论 | 内容 |
|---|---|
| `verified` | `initiative-policy.json` 全部字段（stancePriority、eligibility、excessPolicy、resolveAtDrawTime）；Echoing 的 Priest→Growth 顺序与各 +1 Opportunity |
| `partial` | Guardian 定义、三名 Actor 的 stats/skills、Undulations 细节、victory cleanup |
| `unavailable` | Room 定义（`validAreaIds` / `stanceToAreaMap` 均为空）、room tile/card |

**核心结论**：正式战斗数值不可用 → official Shuffling Horror 保持禁用，开发全程走 `prototype-shuffling-horror-guardian-harness`。

## 3. 基线回归（开工前）

Phase 10C 基线 `build` / `test` / `playwright` 均先行确认，作为改动前的对照。

## 4. 不新增第二套状态机（硬约束 1）

未创建任何独立的 Battle / Dungeon / Initiative 状态机。Shuffling Horror 完全挂在既有 Guardian Battle 之上，通过 `actFourState.shufflingHorrorEncounterState` 承载遭遇态。

## 5. Monster Opportunity 不绑定 Actor（硬约束 2/3/13）

`MonsterInitiativeOpportunity` 卡不携带 actorId。`resolveAtDrawTime = true`，抽到时才按
`stancePriority = [aggressive, defensive, ranged, support]` + `alive` + `inTracker` + `remaining-actions > 0`
动态解析真正行动的 Monster。

## 6. 每轮行动预算独立（硬约束 4/5）

Horror `{max: 2}`、Cultist Priest `{max: 1}`、Malignant Growth `{max: 1}`，三份预算互不影响，`advanceShufflingHorrorRound` 统一重置。

## 7. Stance 变化影响下一张未解析卡（硬约束 6/7）

Stance 占据关系存于 `stancePriority.stanceOccupant`，解析发生在抽卡瞬间，故 Stance 变动只影响其后未解析的卡，已解析的不回溯。

## 8. 无合格 Actor 标记 Excess（硬约束 14）

全员预算耗尽后再抽卡 → 卡被标记 `isExcess` 并移入弃牌堆，不产生行动。

## 9. Tracker 未满强制 Echoing Disassembly（硬约束 8/9）

`isMonsterStanceTrackerFull(state) === false` 时，Horror 的行动被强制替换为 Echoing Disassembly，不执行普通 Skill。

## 10. Priest→Growth 原子双召唤（硬约束 10/11/12）

单次事务内按 Priest → Growth 顺序召唤两名，各自 `+1 Monster Initiative Opportunity`；任一步失败整体回滚，不留半成品。

## 11. Undulations 洗 Hero Stance（硬约束 18–23）

取全部 Hero Stance Token → 洗混 → 放回。保证：RNG 先保存（刷新不重掷）、**每人恰好分配一次**、**只改 Stance 不改 Area**、已行动标记 `hasActedThisRound` 保留不重置。

## 12. 死亡不立即重生（硬约束 16/17）

Priest / Growth 阵亡后不即时补位；需等到**下一次 Horror 行动**才重召唤缺失 Role，且对应 `generationByRole` 自增。

## 13. Horror 死亡停 Queue 并清理（硬约束 24/25）

Horror 阵亡即停止 Monster Queue（牌堆清空），并在 `death` 阶段同步清理关联的 Priest / Growth。`victory` 阶段的清理为**幂等兜底**（正常链路下 `cleanedLinkedActorIds` 为空）。

## 14. Victory / Failure 收敛（硬约束 26/27）

Victory → 3 XP + 进入 Final Hamlet（完全复用 Phase 10A 链路，未另起分支）；Failure → Campaign Over。

## 15. Data Gate（硬约束 28）

`isShufflingHorrorOfficialEncounterEnabled()` 恒返回 false 并附缺口清单；`mode: 'formal'` 的 Setup 一律被拦截，`shufflingHorrorEncounterState` 保持 null。

## 16. Prototype 独立 ID（硬约束 29）

全部原型资产使用 `prototype-` 前缀独立 ID，**原型数值未写入任何正式 Definition**。

## 17. 存档迁移

`SAVE_VERSION 14 → 15`，`actFourState` 新增 `shufflingHorrorEncounterState`；旧档迁移时补 `null`。迁移链 `migrateCampaignToLatest` 已接入并有用例覆盖。

## 18. UI 产出

- `ShufflingHorrorEncounterPanel.tsx`（310 行，只读，挂 `ActFourHeader`）：三名 Actor 卡（Reserve 显式标注）、Stance Priority Tracker、Opportunity 分区（待抽 / 已解析 / Excess）、Hero Stance 排列、死亡与重召唤提示、Data Gate 说明。
- `ShufflingHorrorDebugSection.tsx`（360 行，dev-only，挂 `DebugPanel`）：10 个受控按钮 + 20 行只读字段，全部只调正式运行时入口。

## 19. 单元测试

`src/game-engine/bosses/shuffling-horror/shuffling-horror.test.ts` — **55 个用例全绿**，覆盖 §31.1–§31.10 全部硬约束分支。

## 20. E2E 测试

`e2e/phase10d-shuffling-horror.spec.ts` — **§32.1–§32.9 九场景全绿**（23.7 秒）：Setup / Echoing / Undulations / 动态 Opportunity / Excess / 死亡不重生 / Horror 死亡停 Queue / Victory-Failure / Data Gate + 一键跑通。

## 21. 全量验证结果

| 项目 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm run test` | **691 / 691 通过**（20 个测试文件） |
| `npx playwright test` | **90 / 90 通过**（全套 12 个 spec，2.8 分钟） |
| `npm run build` | 成功（258 modules，504.09 KB JS / 149.93 KB gzip） |

## 22. 过程中修复的缺陷

1. **生产 bug — `alive` 写成 `isAlive`**：`shuffling-horror-death.ts`（2 处）与 `-victory.ts`（1 处）向 `ShufflingHorrorActorState` 写入了不存在的 `isAlive` 字段（该类型用 `alive`，只有根类型 `BattleUnit` 才用 `isAlive`），导致 actor 未真正标记死亡，连锁使 Victory 评估失败、清理数为 0。修复后单测由 44 → 55 全绿。
2. **E2E 长期假绿 — 折叠区顺序错误**：`ActFourDebugSection` 默认折叠（`useState(false)`），按钮只在展开后渲染；而 `actFourState` 新建战役即非 null，所以区块一直存在。此前 spec 先点按钮后展开，每个用例都卡满 180 s test timeout。**Phase 10C 的 spec 存在同一缺陷、其九个场景从未真正跑绿**（曾被误判为"dev server 僵死"），本次一并修复，10C 现 9/9 通过；`phase10a-debug-panel-smoke` 中长期被 `test.skip` 跳过的冒烟 3/4/5 也恢复为真实执行并通过。
3. **§32.8 无法另起一局**：第一段推进到终局并落盘后，首页"新建战役"被"覆盖现有存档？"确认框拦住。改为先 `localStorage.removeItem('dd-web-prototype-save-v1')` 再重建。
4. **硬编码版本号**：`mammoth-cyst.test.ts` 3 处 `toBe(14)` 在升版后变红，改为引用 `SAVE_VERSION` 常量断言，避免后续升版反复返工。

---

## 阶段收尾

Phase 10D 全部开发、测试、修复与本地提交已完成，四项验证（tsc / vitest / playwright / build）全绿。
**按约定停止，不进入 Phase 10E。** 推送到 GitHub 需用户确认后执行。
