# Phase 10C — Mammoth Cyst / White Cell Stalk / Teleportation 数据审计

> 阶段：**Mammoth Cyst、White Cell Stalk 与 Teleportation 系统**
> 审计对象：`docs/data/darkest-dungeon/mammoth-cyst/`
> 规则来源：`docs/DD_EN_COREBOX_RULES.pdf` p.31（Summoning / Teleportation 通用规则）、p.39（Mammoth Cyst 设置流程）
> 审计时间：2026-08-01
> **结论：official Mammoth Cyst Encounter 禁用。** 六类关键数据（Cyst Battle Card、Stalk Battle Card、Room Card/Tile、Teleportation d10→Area Map、Area Capacity Policy、Victory/Cleanup 正式文本）全部 `unavailable` 或 `partial`，触发开发文档 §3 / §20 的硬性门槛。Phase 10C 仅实现「规则书已确认的 Setup / Conditional Summon / Dynamic Initiative / Teleportation 框架 + Data Gate + `prototype-mammoth-cyst-guardian-harness`」。

---

## 1. 状态定义

沿用项目既有四态（`DataCredibility`）：

| 状态 | 含义 | 是否可进 official 池 |
| --- | --- | --- |
| `verified` | 规则书/卡面已核实，数据完整 | 是 |
| `partial` | 规则已确认但数值/表格不完整 | 否 |
| `prototype` | 仅开发 harness 用，绝不进 official | 否 |
| `unavailable` | 卡面/模板缺失 | 否 |

---

## 2. 目录实况

`docs/data/darkest-dungeon/mammoth-cyst/` 共 5 个模板文件，**全部为空壳 stub**（关键数值字段为 `null` / `""` / `[]` / `{}`）：

| 文件 | 顶层 `officialDataStatus` | 判定 |
| --- | --- | --- |
| `mammoth-cyst-data-manifest.template.json` | —（清单，逐资产标状态） | 见 §4 |
| `mammoth-cyst-guardian.template.json` | `partial` | **partial** |
| `mammoth-cyst-actor-definitions.template.json` | `partial` ×2（Cyst / Stalk） | **partial** |
| `mammoth-cyst-room-teleportation-map.template.json` | `unavailable` | **unavailable** |
| `white-cell-stalk-teleportation.template.json` | `partial` | **partial** |

---

## 3. 逐文件字段级审计

### 3.1 `mammoth-cyst-guardian.template.json` → **partial**

| 字段 | 实际值 | 状态 | 备注 |
| --- | --- | --- | --- |
| `id` | `mammoth-cyst-guardian-level-3` | `verified` | 与开发文档 §6 建议 ID 一致 |
| `guardianFamilyId` | `mammoth-cyst` | `verified` | 已在 `guardian-registry.ts` 注册（Phase 10A 起） |
| `bossActorDefinitionId` | `mammoth-cyst-level-3` | `verified` | |
| `linkedActorDefinitionId` | `white-cell-stalk-level-3` | `verified` | 规则书 p.39 明确 Stalk 为 Cyst 关联实体 |
| `roomDefinitionId` | `mammoth-cyst-room-level-3` | `verified` | |
| `conditionalSummonDefinitionId` | `mammoth-cyst-summon-white-cell-stalk` | `partial` | ID 已定，**Definition 本体缺失** |
| `victoryCondition` | **`definition-driven`** | **`unavailable`** | 正式胜利判定文本未核对 |
| `cleanupPolicy` | **`definition-driven`** | **`unavailable`** | Boss 胜利后 Stalk 清理文本未核对 |
| `enabledInOfficialPool` | `false` | — | 与本审计一致 |

### 3.2 `mammoth-cyst-actor-definitions.template.json` → **partial**

**Mammoth Cyst**

| 字段 | 实际值 | 状态 | 备注 |
| --- | --- | --- | --- |
| `id` / `actorType` / `campaignLevel` | `mammoth-cyst-level-3` / `boss` / `3` | `verified` | Darkest Dungeon Monster 恒 Level III |
| `tags` | `mammoth-cyst,guardian,boss` | `verified` | |
| `requiredStance` | `aggressive` | **`verified`** | 规则书 p.39 明确：Cyst 放入 Aggressive Stance |
| `actionsPerRound` | `2` | **`verified`** | 规则书 p.39 明确：初始向 Initiative Deck 加入 **2 张** Cyst Initiative |
| `stats` | **`null`** | **`unavailable`** | HP / Dodge / Speed / Resistance / Immunity / Size 全缺 |
| `skills` | **`[]`** | **`unavailable`** | 完整 d10 Skill Table 全缺（含「无 Stalk 时被 Summon 覆盖」之外的普通攻击数值） |

**White Cell Stalk**

| 字段 | 实际值 | 状态 | 备注 |
| --- | --- | --- | --- |
| `id` / `actorType` / `campaignLevel` | `white-cell-stalk-level-3` / `boss-minion` / `3` | `verified` | `boss-minion` → 不进普通 Monster Deck（硬约束 2） |
| `tags` | `white-cell-stalk,mammoth-cyst-linked-entity` | `verified` | `white-cell-stalk` tag 即 Conditional Summon 的存活判定依据 |
| `requiredStance` | **`null`** | **`partial`** | 规则书未给 Stalk 固定 Stance；由 Spawn Policy 决定（通用规则：第一处空 Stance），**Spawn Policy 本体缺失** |
| `actionsPerRound` | `2` | **`verified`** | 规则书 p.39 明确：Stalk 入场时**立即**加入 2 张 Initiative |
| `stats` | **`null`** | **`unavailable`** | 同上 |
| `skills` | **`[]`** | **`unavailable`** | 含 Teleportation Skill 的 Accuracy / Damage / Target / d10 区间全缺 |

### 3.3 `mammoth-cyst-room-teleportation-map.template.json` → **unavailable**

| 字段 | 实际值 | 状态 | 备注 |
| --- | --- | --- | --- |
| `id` / `guardianFamilyId` | `mammoth-cyst-room-level-3` / `mammoth-cyst` | `verified` | |
| `mammothCystPlacement.stance` | `aggressive` | `verified` | 与 3.2 一致 |
| `mammothCystPlacement.areaId` | **`""`** | **`unavailable`** | Cyst 固定 Room Area 未知（Room Tile 缺失） |
| `whiteCellStalkSpawn.stancePolicy` | **`definition-driven`** | **`partial`** | 通用规则可兜底（第一空 Stance），但 Boss 是否另有规定未确认 |
| `whiteCellStalkSpawn.specifiedStance` | **`null`** | **`unavailable`** | |
| `whiteCellStalkSpawn.areaPolicy` | **`definition-driven`** | **`partial`** | 同上（通用规则：对应 Stance 的 Area） |
| `whiteCellStalkSpawn.specifiedAreaId` | **`null`** | **`unavailable`** | |
| `validAreaIds` | **`[]`** | **`unavailable`** | Room Area 图缺失 |
| `areaCapacities` | **`{}`** | **`unavailable`** | Area 容量策略缺失 → 传送目标满员时的处理无从判定 |
| `teleportationD10Map` | **`1—10 全为 `""``** | **`unavailable`** | **d10 → Area 映射完全缺失；严禁按 Area 数量平均分配（硬约束 15）** |
| `roomEntryEffects` | **`{}`** | **`unavailable`** | Room Entry Effect 缺失 |
| `sourceReference` | **`""`** | **`unavailable`** | 无来源引用 |

> 该文件是本阶段**最严重的数据缺口**：Teleportation 的落点表、Area 图、容量三者全空，官方 Teleportation 在数据层完全无法执行。

### 3.4 `white-cell-stalk-teleportation.template.json` → **partial**

| 字段 | 实际值 | 状态 | 备注 |
| --- | --- | --- | --- |
| `id` / `sourceActorDefinitionId` | `white-cell-stalk-teleportation` / `white-cell-stalk-level-3` | `verified` | |
| `roomMapId` | `mammoth-cyst-teleportation-map` | `partial` | 指向的 Map 本体为空（见 3.3） |
| `triggerRoomEntryEffects` | `true` | **`verified`** | 规则书 p.31 通用规则：进入 Area 后结算 Entry Effect |
| `rollPolicy` | **`definition-driven`** | **`unavailable`** | 多目标时「每目标各掷一次」还是「共享一次 d10」未确认 |
| `targetRule` | **`null`** | **`unavailable`** | 目标选择规则未确认 |
| `requiresHit` | **`null`** | **`unavailable`** | 是否需要命中判定未确认 |
| `effectSequence` | **`[]`** | **`unavailable`** | 效果结算顺序未确认 |
| `capacityPolicy` | **`definition-driven`** | **`unavailable`** | 目标 Area 满员时的处理未确认（**不得重掷、不得换 Area**，硬约束 17） |

### 3.5 `mammoth-cyst-data-manifest.template.json` → 清单

`sourceRulebook` = `DD_EN_COREBOX_RULES.pdf`，`verifiedPages` = `[31, 39]`。9 项资产全部无 `path`（未落盘）。

---

## 4. 资产清单逐项判定

| # | 资产 ID | 清单声明 | 本审计判定 | 缺口说明 |
| --- | --- | --- | --- | --- |
| 1 | `mammoth-cyst-battle-card` | `unavailable` | **`unavailable`** | HP / Dodge / Resistance / Immunity / d10 Skill Table 全缺 |
| 2 | `white-cell-stalk-battle-card` | `unavailable` | **`unavailable`** | 同上（含 Teleportation Skill 数值） |
| 3 | `mammoth-cyst-room-card` | `unavailable` | **`unavailable`** | Area 图 / 容量 / Entry Effect 全缺 |
| 4 | `mammoth-cyst-room-tile` | `unavailable` | **`unavailable`** | Cyst 固定 Area、Stalk 落位 Area 未知 |
| 5 | `white-cell-stalk-spawn-policy` | `partial` | **`partial`** | 通用召唤规则 verified（第一空 Stance + 对应 Area、可当前 Round 行动），但 Boss 专属覆盖未知 |
| 6 | `white-cell-stalk-teleportation` | `partial` | **`partial`** | 「掷 1d10 → 按结果把 Hero 放入 Area」verified；掷骰策略 / 命中 / 效果顺序 unavailable |
| 7 | `teleportation-d10-area-map` | `unavailable` | **`unavailable`** | **1—10 映射全空** |
| 8 | `teleportation-capacity-policy` | `unavailable` | **`unavailable`** | Area 满员处理未知 |
| 9 | `guardian-victory-cleanup` | `partial` | **`partial`** | Cyst 是 Guardian 主体 verified；正式 Victory / Cleanup 文本未核对 |

---

## 5. 规则书已确认（verified）的机制

以下 9 条**已由规则书 p.31 / p.39 确认**，构成 Phase 10C 可实现的框架，与卡面数值无关：

| # | 机制 | 来源 |
| --- | --- | --- |
| 1 | Mammoth Cyst 放入 **Aggressive Stance** | p.39 |
| 2 | White Cell Stalk **初始在 Reserve**，不入场 | p.39 |
| 3 | 初始向 Initiative Deck 加入 **2 张 Cyst Initiative** | p.39 |
| 4 | Cyst 行动时**若场上无 Stalk** → 该次行动**改为召唤 Stalk**（完全替代普通 Skill） | p.39 |
| 5 | Stalk 入场：**Card → Stance Tracker，Model → Room Area** | p.39 |
| 6 | Stalk 入场时**立即**加入 **2 张 Stalk Initiative** | p.39 |
| 7 | Stalk 的 Teleportation：**掷 1d10 → 按结果把 Hero 放入对应 Area** | p.39 |
| 8 | 通用召唤规则：进入**第一处空 Stance + 对应 Area**，除非 Boss 另有说明 | p.31 |
| 9 | 被召唤单位**可在当前 Round 行动**（其 Initiative 卡仍在牌堆中时） | p.31 |

**未确认（不得实现为 official）**：所有战斗数值、d10 Skill 区间、d10→Area 映射、Area 容量与满员处理、掷骰策略、命中判定、效果顺序、正式 Victory / Cleanup 文本、Stalk 是否有 Boss 专属 Spawn 覆盖。

---

## 6. Data Gate 判定

`isMammothCystOfficialEncounterEnabled()` 的判定链（`src/data/darkest-dungeon/mammoth-cyst/mammoth-cyst-registry.ts`）：

```
guardian.enabledInOfficialPool          → false   ✗ 直接短路
guardian.officialDataStatus === verified→ partial ✗
cyst.stats / cyst.skills                → null/[] ✗
stalk.stats / stalk.skills              → null/[] ✗
room.officialDataStatus === verified    → unavailable ✗
getMammothCystSummonDefinition('formal')→ null    ✗
validateMammothCystGuardian('formal')   → 不通过  ✗
```

→ **`isMammothCystOfficialEncounterEnabled() === false`（恒定）**。

`getMammothCystDataGaps()` 在运行时列出的根因（Debug Panel 可见）：

1. `mammoth-cyst-battle-card`（HP / Dodge / Resistance / Immunity 缺失）
2. `mammoth-cyst-skills`（d10 Skill Table 缺失，含普通攻击数值）
3. `white-cell-stalk-battle-card`（HP / Dodge / Resistance 缺失）
4. `white-cell-stalk-skills`（d10 Skill Table 缺失，含 Teleportation 数值）
5. `mammoth-cyst-room-card`（Area 图 / 容量缺失）
6. `teleportation-d10-area-map`（d10 → Area 映射缺失）
7. `mammoth-cyst-room-tile`（Cyst 固定 Area 缺失）
8. `white-cell-stalk-spawn-policy`（Conditional Summon 定义缺失）
9. `guardian-victory-cleanup`（正式胜利条件缺失）

---

## 7. 本阶段处理方式

| 层 | 正式（official） | 原型（prototype harness） |
| --- | --- | --- |
| Guardian | `mammoth-cyst-guardian-level-3`：`victoryCondition`/`cleanupPolicy` = `definition-driven`，`enabledInOfficialPool=false` | `prototype-mammoth-cyst-guardian-harness`：`boss-defeated` + `remove-linked-actors-on-boss-victory` |
| Conditional Summon | **`null`**（禁止推测） | `prototype-mammoth-cyst-summon-white-cell-stalk`（`maxAlive=1`、`initiativeCardsToAdd=2`、`replacesNormalSkill=true`） |
| Cyst Actor | `stats=null` / `skills=[]` | `prototype-mammoth-cyst-level-3`（含 `prototype-mammoth-cyst-smash`） |
| Stalk Actor | `stats=null` / `skills=[]` | `prototype-white-cell-stalk-level-3`（含 `prototype-white-cell-stalk-teleportation`） |
| Room | 全空 / `unavailable` | `prototype-mammoth-cyst-room-level-3`（4 个 Hero Area，d10 映射按 **3/2/3/2 非均匀**分布，刻意证明「不按 Area 数量平均分配」） |

**红线**：以上 prototype 数值**只挂在 `prototype-` 前缀 ID 上**，绝不写入正式 Definition；正式资料补齐后只需替换正式常量并把状态改为 `verified`，Data Gate 自动放行，无需改动 runtime。

---

## 8. 补齐正式数据所需清单

1. Mammoth Cyst Battle Card 扫描（HP / Dodge / Speed / Resistance / Immunity / Size / d10 Skill Table）。
2. White Cell Stalk Battle Card 扫描（同上 + Teleportation Skill 的 Accuracy / Damage / Target / d10 区间 / 是否需命中）。
3. Mammoth Cyst Room Card + Room Tile（Area 列表、Area 图连通关系、每 Area 容量、Entry Effect）。
4. Teleportation d10 → Area 映射表（1—10 全覆盖）。
5. Area 满员时的正式处理条款（不重掷、不换 Area 前提下的替代规则）。
6. Guardian 正式 Victory Condition 与 Cleanup 条款原文。
7. Stalk 是否存在 Boss 专属 Spawn Stance / Area 覆盖（若无，则通用规则 p.31 生效，可将 `stancePolicy` 置为 `first-empty-stance`）。
