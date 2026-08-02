# Phase 10B — The Templars / Spiked Pit 数据审计

> 阶段：**The Templars、Dual Boss Encounter 与 Spiked Pit / Pit Toss 系统**
> 审计对象：`docs/data/darkest-dungeon/templars/`
> 规则来源：`docs/DD_EN_COREBOX_RULES.pdf` p.39（Templars 设置流程）
> 审计时间：2026-08-01
> **结论：official Templars Encounter 禁用**。四类关键数据（Boss Battle Card、Room d10→Pit Map、Pit Effect、Victory Condition）全部缺失，触发开发文档 §3 的硬性门槛。Phase 10B 仅实现「规则书已确认的框架 + Data Gate + `prototype-templars-guardian-harness`」。

---

## 1. 状态定义

沿用项目既有四态（`OfficialDataStatus`）：

| 状态 | 含义 | 是否可进 official 池 |
| --- | --- | --- |
| `verified` | 规则书/卡面已核实，数据完整 | 是 |
| `partial` | 规则已确认但数值/表格不完整 | 否 |
| `prototype` | 仅开发 harness 用，绝不进 official | 否 |
| `unavailable` | 卡面/模板缺失 | 否 |

---

## 2. 目录实况

`docs/data/darkest-dungeon/templars/` 共 4 个模板文件，**全部为空壳 stub**（关键数值字段为 `null` / `""` / `[]` / `{}`）：

| 文件 | 大小 | 顶层 `officialDataStatus` | 判定 |
| --- | --- | --- | --- |
| `templar-definitions.template.json` | 685 B | `partial` ×2（Impaler / Warlord） | **partial** |
| `templars-encounter.template.json` | 690 B | `partial` | **partial** |
| `templars-room-spiked-pits.template.json` | 543 B | `unavailable` | **unavailable** |
| `templars-data-manifest.template.json` | 1010 B | —（清单，逐资产标状态） | 见 §4 |

---

## 3. 逐文件字段级审计

### 3.1 `templar-definitions.template.json` → **partial**

| 字段 | 实际值 | 状态 | 备注 |
| --- | --- | --- | --- |
| `id` | `templar-impaler-level-3` / `templar-warlord-level-3` | `verified` | 与文档 §6 建议 ID 一致 |
| `role` | `impaler` / `warlord` | `verified` | 规则书 p.39 明确两名 Templar |
| `actorType` | `boss` ×2 | `verified` | 两者均为独立 Boss Actor |
| `campaignLevel` | `3` ×2 | `verified` | Darkest Dungeon Monster 恒 Level III |
| `requiredStance` | `aggressive`（Impaler）/ `ranged`（Warlord） | `verified` | 规则书 p.39 明确 |
| `actionsPerRound` | `2` ×2 | `verified` | 由「Initiative Deck 加入 4 张卡，Impaler 2 + Warlord 2」推出 |
| `stats` | **`null`** ×2 | **`unavailable`** | HP / Dodge / Resistance / Immunity 全缺 |
| `skills` | **`[]`** ×2 | **`unavailable`** | 完整 d10 Skill Table 全缺（含 `Body Slam` 的 Accuracy/Crit/Damage/Target） |
| `sourceReference` | `DD_EN_COREBOX_RULES.pdf:p39` | — | 仅覆盖设置流程，不含数值 |
| `enabledInOfficialPool` | `false` ×2 | — | 与本审计一致 |

> 结论：**结构与站位规则 verified，战斗数值 unavailable** → 整体 `partial`，不可进 official。

### 3.2 `templars-encounter.template.json` → **partial**

| 字段 | 实际值 | 状态 | 备注 |
| --- | --- | --- | --- |
| `id` | `templars-guardian-level-3` | `verified` | |
| `guardianFamilyId` | `templars` | `verified` | |
| `bossMembers[].actorDefinitionId` | 指向上述两个 Definition | `verified` | Dual Boss 成员结构成立 |
| `bossMembers[].requiredStance` | `aggressive` / `ranged` | `verified` | |
| `bossMembers[].requiredAreaId` | **`""` ×2** | **`unavailable`** | Room Tile 上的具体 Area 未知 |
| `bossMembers[].initiativeCardsPerRound` | `2` ×2 | `verified` | |
| `roomDefinitionId` | `templars-room-level-3` | `verified`（引用） | 但被引用的 Room 本身 unavailable |
| `victoryCondition` | `definition-driven` | **`unavailable`** | 「是否必须击败两名 Templar」**无来源**，禁止假定 |
| `enabledInOfficialPool` | `false` | — | |

### 3.3 `templars-room-spiked-pits.template.json` → **unavailable**

| 字段 | 实际值 | 状态 |
| --- | --- | --- |
| `impalerPlacement.stance` | `aggressive` | `verified` |
| `impalerPlacement.areaId` | **`""`** | **`unavailable`** |
| `warlordPlacement.stance` | `ranged` | `verified` |
| `warlordPlacement.areaId` | **`""`** | **`unavailable`** |
| `validAreaIds` | **`[]`** | **`unavailable`** |
| `areaCapacities` | **`{}`** | **`unavailable`** |
| `pitTossD10Map` | **`{"1":"" … "10":""}` 十项全空** | **`unavailable`** |
| `spikedPits` | **`[]`** | **`unavailable`** |
| `victoryCondition` | `definition-driven` | **`unavailable`** |
| `sourceReference` | **`""`** | — |

> Room Tile 的 Area 图、Pit 位置、d10 映射、Pit 效果、容量与进出规则**全部缺失**。

### 3.4 `templars-data-manifest.template.json`（资产清单）

| 资产 ID | 清单声明状态 | 本次复核 | 说明 |
| --- | --- | --- | --- |
| `templar-impaler-battle-card` | `unavailable` | **unavailable** | `path` 为空，无卡面 |
| `templar-warlord-battle-card` | `unavailable` | **unavailable** | `path` 为空，无卡面 |
| `templars-room-card` | `unavailable` | **unavailable** | Pit 效果文本的唯一权威来源，缺失 |
| `templars-room-tile` | `unavailable` | **unavailable** | Area 图 / Pit 位置的唯一来源，缺失 |
| `body-slam` | `partial` | **partial** | 仅知「命中 Hero 时触发 Pit Toss」；Accuracy/Crit/Damage/Target/效果顺序未知 |
| `pit-toss` | `verified` | **verified（仅流程）** | 规则书 p.39 明确：掷 1 个 d10 → 放入对应 Spiked Pit → 承受 Room Card 标注效果。**流程 verified，但其两个输入（d10 映射表、Pit 效果）均 unavailable** |
| `spiked-pit-map` | `unavailable` | **unavailable** | d10 → Pit 映射 |
| `spiked-pit-effects` | `unavailable` | **unavailable** | 每个 Pit 的 Entry / End Turn / 条件效果 |
| `templars-victory-condition` | `unavailable` | **unavailable** | 正式胜利条件 |

---

## 4. 开发文档 §3 缺口清单逐项核销

| # | 文档列出的缺口 | 核销结果 |
| --- | --- | --- |
| 1 | Impaler 的 HP / Dodge / Resistance / Immunity | **unavailable**（`stats:null`） |
| 2 | Warlord 的 HP / Dodge / Resistance / Immunity | **unavailable**（`stats:null`） |
| 3 | 两名 Templar 的完整 Skill d10 Table | **unavailable**（`skills:[]`） |
| 4 | `Body Slam` 的 Accuracy / Crit / Damage / Target 及其他效果 | **partial**（仅知触发关系） |
| 5 | Pit Toss 与 Body Slam 其他效果的精确先后顺序 | **unavailable** |
| 6 | Templars Room Card 的 d10 → Pit 映射 | **unavailable**（十项全空） |
| 7 | 每个 Spiked Pit 的完整效果 | **unavailable**（`spikedPits:[]`） |
| 8 | Pit 是否影响 Hero / Monster 的移动和行动 | **unavailable** |
| 9 | Pit Area 的容量规则 | **unavailable**（`areaCapacities:{}`） |
| 10 | Hero 如何离开 Pit | **unavailable**（禁止自创 Pit Escape） |
| 11 | 一名 Templar 死亡后的特殊规则 | **unavailable** |
| 12 | 正式 Victory Condition 是否必须击败两名 Templar | **unavailable** |
| 13 | Templars Quest 与 skipped Final Form 的绑定关系 | **unavailable**（沿用 Phase 10A 审计结论） |

**13 项中：0 项 verified、1 项 partial（#4）、12 项 unavailable。**

---

## 5. 规则书已确认、可直接实现的部分（verified）

以下来自 `DD_EN_COREBOX_RULES.pdf` p.39，属确认事实，Phase 10B 据此实现框架：

1. 加载 Templars Room Card 与对应 Room Tile；
2. 准备两名 Templar：Templar Impaler、Templar Warlord；
3. Impaler → **Aggressive Stance**，模型放到 Room Tile 对应 Area；
4. Warlord → **Ranged Stance**，模型放到 Room Tile 对应 Area；
5. Initiative Deck 加入 **4 张 Templar Initiative Card**：Impaler 2 张、Warlord 2 张（→ 各 `actionsPerRound = 2`）；
6. Impaler 使用 `Body Slam` **并命中 Hero** 时：`Pit Toss` 激活 → 掷 **1 个 d10** → 将目标 Hero 放入骰点对应的 **Spiked Pit** → Hero 承受 **Templars Room Card 标明的效果**。

> 注意第 6 条的三个 verified 要点是**流程**：触发条件（命中才触发）、骰子类型（d10）、效果来源（Room Card）。骰点→Pit 的**映射内容**与 Pit 的**效果内容**不在其中。

---

## 6. Data Gate 判定

按开发文档 §6 的正式池条件：

```ts
enabledInOfficialPool === true
  && officialDataStatus === 'verified'
  && validation.isComplete === true
```

| 检查项 | 结果 |
| --- | --- |
| Templar Impaler Definition | ✗ `partial`、`stats:null`、`skills:[]` |
| Templar Warlord Definition | ✗ `partial`、`stats:null`、`skills:[]` |
| Templars Room Definition | ✗ `unavailable`、Area/Pit/d10 Map 全空 |
| Templars Dual Boss Encounter | ✗ `partial`、`requiredAreaId` 为空、Victory 未知 |
| Boss Battle Card 资产 | ✗ 两张均 `unavailable` |
| Room Map（d10→Pit） | ✗ `unavailable` |
| Pit Effect | ✗ `unavailable` |
| Victory Condition | ✗ `unavailable` |

→ **`isTemplarsOfficialEncounterEnabled()` 恒为 `false`**，且触发文档 §3 的强制门槛：

> 「缺失任一 Boss Card、Room Map、Pit Effect 或 Victory Condition 时，official Templars Encounter 禁用。」

四项**全部**缺失。

---

## 7. 本阶段采用的开发路径（资料不足预案）

依据开发文档「资料不足时」条款：

1. 完成**规则书已确认**的 Dual Boss Setup / 4 张 Actor-specific Initiative / Body Slam→Pit Toss 触发链 / 强制位移 / Room Hazard 框架与 Data Gate；
2. official Templars Guardian **保持禁用**；
3. 开发与测试使用 `prototype-templars-guardian-harness`；
4. Prototype 的 Pit Effect 使用**独立 prototype ID**，不写入正式 Definition；
5. 正式 Definition 的数值字段保持空缺，由校验函数驱动 Data Gate 失败。

允许的开发测试 ID（文档 §3 白名单）：

```text
prototype-templars-guardian-harness
prototype-templar-impaler
prototype-templar-warlord
prototype-body-slam
prototype-spiked-pit-effect
```

---

## 8. 明令禁止的推测（本审计据此拒绝填充任何数值）

- ✗ 使用电子游戏（Darkest Dungeon 视频游戏）的 Templar 数值；
- ✗ 依据角色造型推断 Skill；
- ✗ 依据 Room Tile 视觉猜测 d10 → Pit 映射；
- ✗ 把通用 Room Card 示例的 Pit 数值复制到 Templars Room；
- ✗ 按 Pit 数量把 d10 平均分配（如 5 个 Pit 各占 2 点）；
- ✗ 自行规定 Hero 离开 Pit 的方式；
- ✗ 自行规定「只杀 Impaler 或 Warlord 即可胜利」；
- ✗ 从一名 Templar 的数据推算另一名。

---

## 9. 资料缺口清单（供最终报告引用）

1. Templar Impaler Battle Card（HP / Dodge / Resistance / Immunity / d10 Skill Table）
2. Templar Warlord Battle Card（同上）
3. `Body Slam` 完整卡面（Accuracy / Crit / Damage / Target / 效果结算顺序）
4. Templars Room Card 的 **d10 → Spiked Pit 映射表**（10 项）
5. 每个 Spiked Pit 的**效果文本**（Entry / End Turn / 条件触发）
6. Templars Room Tile 的 **Area 图**（`validAreaIds` / `areaCapacities` / 邻接关系）
7. Impaler / Warlord 的**固定 Area ID**
8. Pit 对移动与行动的影响、Pit Area 容量规则
9. **Hero 离开 Pit 的规则**（Exit Rule）
10. 一名 Templar 死亡后的特殊规则
11. Templars Encounter 的**正式 Victory Condition**
12. Templars Quest ↔ skipped Final Form 的绑定关系（延续 Phase 10A 缺口）

---

> 本审计报告与 `src/data/darkest-dungeon/templars/*` 的 `validateTemplarsGuardian()` / `getTemplarsDataGaps()` / `isTemplarsOfficialEncounterEnabled()` 运行时自检保持一致；任一方变更时必须同步更新。
