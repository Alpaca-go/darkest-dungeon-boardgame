# Phase 9D — Collector 数据审计报告 v1.0

> 审计对象：`docs/data/collector/`
> 规则来源：`docs/DD_EN_COREBOX_RULES.pdf`（Collector Room：3 Loot Chests / Aggressive Stance / Collected Reserve / Conditional Summon）
> 生成时间：2026-07-31
> 审计口径：`verified | partial | prototype | unavailable`
> **硬规则：缺失数据一律标记 `unavailable`，不猜测、不推算、不使用电子游戏数值、不复用玩家 Hero 技能推导 Collected。**

---

## 1. 审计输入

`docs/data/collector/` 下共 4 份模板文件：

| 文件 | 说明 |
|---|---|
| `collector-data-manifest.template.json` | 资产清单与状态声明 |
| `collector-definition.template.json` | Collector Level I Boss 定义骨架 |
| `collected-heroes.template.json` | 三个 Collected（Man-at-Arms / Highwayman / Vestal）骨架 |
| `collector-room.template.json` | Collector Room / 3 Loot Chest / 固定 Area 骨架 |

四份文件均为**模板骨架**：关键数值字段为 `null`、`[]` 或空字符串，尚未填入正式卡面数据。

---

## 2. 逐项审计结论

### 2.1 文档 §4 要求的必审项

| # | 审计项 | 状态 | 依据 | 说明 |
|---|---|---|---|---|
| 1 | Collector Battle Card **Level I** | `unavailable` | manifest `collector-battle-level-1`；definition 模板 | 仅有结构性字段（如 `actionsPerRound`），**`stats: null`、`skills: []`** —— 无 HP / Dodge / 抗性 / 普通 Skill 表 |
| 2 | Collector Battle Card **Level II** | `unavailable` | 无任何文件 | 不得从 Level I 推算 |
| 3 | Collector Battle Card **Level III** | `unavailable` | 无任何文件 | 不得从 Level I 推算 |
| 4 | Collector Threat **Level I** | `unavailable` | manifest 显式声明 | Threat 两面文本均缺失 |
| 5 | Collector Threat **Level II** | `unavailable` | 无任何文件 | — |
| 6 | Collector Threat **Level III** | `unavailable` | 无任何文件 | — |
| 7 | Collector **Room Card** | `unavailable` | manifest 显式声明 | 房间效果与布局未知；`bossPlacement.areaId` 为空串 |
| 8 | Collector **Room Tile** | `unavailable` | manifest 显式声明 | Tile 区域未知 |
| 9 | **Collected Man-at-Arms** 完整卡 | `unavailable` | manifest `collected-man-at-arms` | `stats: null`、`skills: []` |
| 10 | **Collected Highwayman** 完整卡 | `unavailable` | manifest `collected-highwayman` | `stats: null`、`skills: []` |
| 11 | **Collected Vestal** 完整卡 | `unavailable` | manifest `collected-vestal` | `stats: null`、`skills: []` |
| 12 | **3 个 Loot Chest Area** | `unavailable` | room 模板 | `lootChestPlacements[].areaId` 全空串；`validAreaIds: []` |
| 13 | **Collector / 3 Collected / 3 Chest 的 Area** | `unavailable` | room 模板 | 全部 `areaId: ""` |
| 14 | **各等级差异** | `unavailable` | 无任何 Level II/III 文件 | 不推算 |

### 2.2 已核对的规则语义（来自 PDF Collector Room + 文档 §3）

以下**行为规则**已核对，可直接实现（与数值无关，不受资料缺口影响）：

| # | 规则 | 状态 |
|---|---|---|
| 1 | Collector Room 中放置 **3 个 Loot Chests** | `verified` |
| 2 | Collector 部署于 **Aggressive Stance** 与对应 Area | `verified` |
| 3 | Initiative Deck 加入 **1 张** Collector Initiative Card | `verified` |
| 4 | 初始 Collected（Man-at-Arms / Highwayman / Vestal）放在 **Reserve** | `verified` |
| 5 | Collector 行动时若**没有任何 Collected**，召唤**替代**普通 Skill | `verified` |
| 6 | 同时召唤 **Man-at-Arms + Highwayman + Vestal** | `verified` |
| 7 | Man-at-Arms → **Defensive** Stance 与对应 Area | `verified` |
| 8 | Highwayman → **Ranged** Stance 与对应 Area | `verified` |
| 9 | Vestal → **Support** Stance 与对应 Area | `verified` |
| 10 | 立即加入 **3 张** Collected Initiative Card | `verified` |
| 11 | Collector 死亡后**移除所有剩余 Collected** | `verified` |

> 补充核验（§3 核心条件）：`aliveCollectedCount = 0 → 本次行动被 Summon 完全替代`；`aliveCollectedCount > 0 → 正常运行 Skill Table`。不是"缺谁补谁"。

---

## 3. Data Gate 判定

`validateCollectorRoom(COLLECTOR_OFFICIAL_ROOM_LEVEL_1)` 必然失败：

- `collectorPlacement.areaId = ""` → `missing: collector-area:(empty)`
- 3 个 `collectedPlacements[].areaId = ""` → `missing: collected-area:*`
- 3 个 `lootChestPlacements[].areaId = ""` → `missing: chest-area:*`
- `validAreaIds = []` → 所有 Area 校验不通过

因此：

```text
isCollectorOfficialBattleEnabled() === false
getCollectorDefinition(1, 'formal') === undefined
getCollectorThreat(1) === undefined
getCollectedDefinition(role, 1)?.officialDataStatus !== 'verified'
```

**结论：Collector 正式战斗全禁，仅 `prototype-collector-level-1-harness` 供开发模式使用。**

---

## 4. 资料缺口清单（official battle 禁用根因）

- `collector-battle-level-1`（Battle Card 缺失）
- `collector-threat-level-1`（Threat 缺失）
- `collector-room-card`（Room Card / Tile / Area 缺失）
- `collected-man-at-arms` / `collected-highwayman` / `collected-vestal`（三个 Collected 完整数值缺失）
- Collector 普通 Skill d10 Table 缺失

---

## 5. 开发策略（资料不足分支，文档 §26）

- 完成 **verified Room Setup 框架**（Prototype Room 自洽，含 3 Chest / 固定 Area / 固定 Stance）；
- 完成 **Linked Summon Group 原子三单位召唤框架**（固定 Stance / Area、新 Generation 新 ID、冲突整组回滚）；
- `collector-level-*` **保持 official 禁用**；
- 开发模式使用 `prototype-collector-level-1-harness` + 三个 `prototype-collected-*` 定义；
- **不把 prototype 数值写入任何正式 Definition**；
- 最终报告明确缺口。

---

## 6. 结论

```text
Phase 9D verified Collector group-summon framework complete;
official Collector combat content pending source data.
```

Audit 生成于 2026-07-31，与代码 `src/data/bosses/collector-family.ts` + `src/game-engine/collector/runtime.ts` 的 Data Gate 逻辑一致。
