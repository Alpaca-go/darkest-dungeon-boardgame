# Phase 9B — Necromancer 资料审计

> 阶段：Necromancer 正式 Boss、Threat 与召唤接入
> 前置：Phase 1—9A 已通过验收
> 规则参考：`docs/DD_EN_COREBOX_RULES.pdf` 第 11 / 30 / 38 页

## 硬规则执行结果

- 不使用电子游戏资料补桌游数值：✅ 全部 Monster / Skill 数值来自原型 harness 显式标注。
- 不从 Level I 推算 Level II / III：`getNecromancerDefinition(2/3)` 返回 `undefined`。
- 不把看不清的图标当成确定数值：✅ 无图标解析。
- 正式 ID 不混入 Prototype Skill：`necromancer-level-1` 保持 `enabledInOfficialPool = false`。
- 未完整核对的 Boss Definition 不得 `enabledInOfficialPool = true`：Level I Boss 为 `prototype`，禁用。

## 数据状态标记

| 条目 | 状态 | 备注 |
|------|------|------|
| necromancer-level-1 (Boss) | **prototype** | 完整 Battle / Room 卡面缺失，禁用；仅原型 harness 可用 |
| necromancer-level-2 | **unavailable** | 数据缺失，不复制 Level I |
| necromancer-level-3 | **unavailable** | 数据缺失，不复制 Level I |
| necromancer-threat-level-1 | **verified** | PDF p11 核对；`enabledInOfficialPool = true` |
| necromancer-summon (by level) | **verified** | 复用 Phase 9A：`bone-rubble` / `bone-soldier` / `bone-spearman` |
| graveyard-blocker | **verified** | 通用 Hamlet Building 入口计算 |
| 非 Unholy 永久移除 | **verified** | 修改 Campaign Monster Pool |
| boss-room / aggressive-stance | **prototype** | 仅 Prototype 布局 |
| skill d10 结果 | **prototype** | 先保存，UI 不重掷 |
| victory 事务 | **verified** | `necromancer-victory:{bossBattleId}` 幂等 |
| save migration | **verified** | `SAVE_VERSION + 1` |

## 资料缺口（文档 §4）

PDF 未完整列出：
- Necromancer Level I—III 全部 Stats；
- 完整 Skill d10 表；
- Accuracy / Crit / Damage / Target / Condition；
- Level II / III Threat 两面；
- Room Card 完整效果；
- Bone Rubble 完整卡；
- Bone Soldier / Spearman 对应版本。

→ 因此 `necromancer-level-1` 保持禁用，最终状态为：

> **Phase 9B verified framework complete; official Level I combat content pending source data.**

## 不实现内容（明确排除）

Prophet / Wooden Pews / Collector / Fanatic / Darkest Dungeon / 未核对 Necromancer Skill / 未核对 Level II·III Threat / 正式美术 —— 均不在本阶段范围。

## 已落地（Phase 9A 复用）

- Family Registry（`getNecromancerDefinition` / `getNecromancerThreat` / `validateNecromancerFamily`）
- Level I verified Threat（`NECROMANCER_THREAT_LEVEL_1`）
- Graveyard 封锁（`evaluateGraveyardBlocker`）
- 非 Unholy 永久移除（`removeNonUnholyAfterBattle`）
- Summon Mapping + First Empty Stance（`getNecromancerSummonMonster` / `getFirstEmptyMonsterStance` / `performSummon`）
- Boss Room / Aggressive Stance / Level I Initiative（`getNecromancerBossRoom`）
- Victory（`resolveNecromancerVictory`）
- Save Migration（`migrateNecromancerSave`）

## 校验清单（文档 §18 / §20 完成定义）

1. Family Registry ✅
2. Level I Threat ✅
3. Gravey讲ard 封锁 ✅
4. 非 Unholy 永久移除 ✅
5. Monster Tag 与 Campaign Pool ✅
6. Boss Room 接入 ✅
7. Aggressive Stance ✅
8. Level I 一张 Initiative ✅
9. 三级 Summon Mapping ✅
10. First Empty Stance ✅
11. Target Area ✅
12. Summon Initiative ✅
13. Stance 满失败 ✅
14. Boss Victory ✅
15. Family 去重 ✅
16. Data Audit ✅
17. Verified / Prototype 隔离 ✅
18. Save Migration ✅
19. Unit / E2E / Build 通过 ✅
20. 不包含 Prophet ✅
21. 不包含未核对数值 ✅

---

*生成于 Phase 9B 开发收尾；未进入 Phase 9C。*
