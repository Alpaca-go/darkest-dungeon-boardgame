# Phase 10A — Darkest Dungeon Act IV 数据审计

> 阶段：Darkest Dungeon Act IV 通用框架
> 审计对象：`docs/data/darkest-dungeon/`
> 审计时间：2026-08-01
> 结论：**所有官方 Act IV 数据均 `unavailable`，official Act IV 禁用**；开发模式仅可通过 `prototype-*` harness 验证框架。

## 1. 审计范围与状态定义

状态枚举（沿用项目既有四态）：

| 状态 | 含义 |
| --- | --- |
| `verified` | 数据已核实，可进入官方池 |
| `partial` | 部分可用，但有缺口 |
| `prototype` | 仅开发原型，绝不进官方池 |
| `unavailable` | 模板/卡面缺失，官方禁用 |

## 2. 目录实况

`docs/data/darkest-dungeon/` 下仅有 4 个模板文件，全部为空壳：

| 文件 | 关键字段 | 状态 |
| --- | --- | --- |
| `darkest-dungeon-act-four.template.json` | `unlocked:false`, `stage:"locked"`, `officialDataStatus:"unavailable"` | **unavailable** |
| `darkest-dungeon-quest.template.json` | `id:""`, `guardianDefinitionId:""`, `skippedFinalFormId:""`, `officialDataStatus:"unavailable"`, `enabledInOfficialPool:false` | **unavailable** |
| `darkest-dungeon-layout.template.json` | `roomSlotIds:[]`, `bossSlotIds:["","",""]`, `officialDataStatus:"unavailable"` | **unavailable** |
| `final-encounter-sequence.template.json` | `orderedFormIds` 有 4 个占位 id，`skippedFormId:""`, `officialDataStatus:"partial"` | **partial（实为不可用：skippedFormId 为空、无 Form 数值/技能）** |

## 3. 逐项审计（文档 §4 要求范围）

| # | 数据项 | 期望 | 实际 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 3 × Darkest Dungeon Quest Cards | 3 张完整 Quest（roomCount=16, xpReward=3, guardian, skippedForm） | 0 张（仅空模板） | **unavailable** |
| 2 | 2 × Darkest Dungeon Layout Tiles | 2 张红边 Layout（16 slot + 3 boss slot） | 0 张（仅空模板） | **unavailable** |
| 3 | Darkest Dungeon Room Cards | 专属 Room Card 集 | 无 | **unavailable** |
| 4 | Darkest Dungeon Room Tiles | 专属 Room Tile 集 | 无 | **unavailable** |
| 5 | Darkest Dungeon Monster Cards | 专属 Monster（全部 Level III） | 无 | **unavailable** |
| 6 | 3 × Excavation Site Room 配置 | 3 个 Empty→Excavation 配置 | 无 | **unavailable** |
| 7 | Templars Room / Cards | Guardian 之一 | 无 | **unavailable** |
| 8 | Mammoth Cyst Room / Cards | Guardian 之一 | 无 | **unavailable** |
| 9 | Shuffling Horror Room / Cards | Guardian 之一 | 无 | **unavailable** |
| 10 | Ancestor Room / Cards | Final Encounter 容器 | 无 | **unavailable** |
| 11 | 4 × Final Boss Form | Ancestor1/2、Gestating Heart、Heart of Darkness | 0 张（仅占位 id，无数值/技能） | **unavailable** |
| 12 | Quest → Skipped Form 映射 | 三张 Quest 各自对应跳过哪个 Form | **无来源数据，禁止推测**（硬约束 22） | **unavailable** |

## 4. Data Gate 结论

- `isDarkestDungeonOfficialEnabled()` = **false**（所有官方 Definition 缺失/空）。
- 因数据缺口，Phase 10A 仅构建 **Act IV 通用框架 + Prototype Harness**：
  - Quest / Layout / Guardian / Final Form 均提供 `prototype-*` 开发用定义；
  - 所有 `prototype-*` 定义 `enabledInOfficialPool = false`，且正式 ID 一律留空/不可用；
  - 不将任何 Prototype 数值写入正式 Definition；
  - 不实现 Templars / Mammoth Cyst / Shuffling Horror / Final Forms 的正式技能（Phase 10B–10E）。

## 5. 资料缺口清单（最终报告引用）

1. 三张 Darkest Dungeon Quest Card（id / guardian / skippedForm 全部缺失）
2. 两张红边 Darkest Dungeon Layout Tile（slot 图、boss slot 坐标缺失）
3. Darkest Dungeon 专属 Room Card / Tile 集
4. Darkest Dungeon 专属 Monster Deck（全 Level III）
5. 三处 Excavation Site Room 配置
6. Templars / Mammoth Cyst / Shuffling Horror 家族 Room 与技能
7. Ancestor Forms 与 Heart of Darkness 的 Room / 技能 / 数值
8. **Quest → Skipped Form 映射（明确无数据，禁止二次随机 / 禁止按名称推测）**

## 6. 对实现的影响（与开发文档 §1/§3 一致）

- Act IV 状态机、Stage 顺序、Quest/Layout 抽取、16 Room、Boss Slot、Excavation、Guardian 容器、Final Encounter 多 Form 容器、Save Migration 等框架全部可实现；
- 所有随机结果先保存、刷新不重抽（幂等 key）；
- Objective 位置 UI 不泄露；
- Heart of Darkness 不可被跳过；
- `skippedFinalFormId` 只能来自 Quest 数据（Prototype 中由 harness 注入，不二次随机）；
- official Act IV 全程禁用，仅 Prototype 验证。

> 本审计报告与 `src/data/darkest-dungeon/*` 的 `getDarkestDungeonDataGaps()` / `isDarkestDungeonOfficialEnabled()` 运行时自检保持一致。
