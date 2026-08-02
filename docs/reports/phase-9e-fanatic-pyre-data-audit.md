# Phase 9E — Fanatic / Pyre 数据审计报告 v1.0

> 审计对象：`docs/data/fanatic/`
> 规则来源：`docs/DD_EN_COREBOX_RULES.pdf`（第 39 页 — Fanatic Room：Aggressive Fanatic / Ranged Pyre / 3+1 Initiative / 强制抓取前置）
> 生成时间：2026-08-01
> 审计口径：`verified | partial | prototype | unavailable`
> **硬规则：缺失数据一律标记 `unavailable`，不猜测、不推算、不使用电子游戏数值、不把 Prototype 数值写入正式 ID。**

---

## 1. 审计输入

`docs/data/fanatic/` 下共 4 份模板文件：

| 文件 | 说明 |
|---|---|
| `fanatic-data-manifest.template.json` | 资产清单与状态声明（11 项资产） |
| `fanatic-definition.template.json` | Fanatic Level I Boss 定义骨架 |
| `fanatic-room.template.json` | Fanatic Room / Fanatic 落位 / Pyre 落位 / Area 容量骨架 |
| `pyre-definition.template.json` | Pyre Level I 关联实体（boss-minion）骨架 |

四份文件均为**模板骨架**：关键数值字段为 `null`、`[]` 或空字符串，尚未填入正式卡面数据。

---

## 2. 逐项审计结论

### 2.1 文档 §3 要求的必审项

| # | 审计项 | 状态 | 依据 | 说明 |
|---|---|---|---|---|
| 1 | Fanatic Battle Card **Level I** | `unavailable` | manifest `fanatic-battle-level-1`；definition 模板 | `stats: null`、`skills: []` —— 无 HP / Dodge / 抗性 / 普通 Skill 表 |
| 2 | Fanatic Battle Card **Level II** | `unavailable` | 无任何文件 | 不得从 Level I 推算 |
| 3 | Fanatic Battle Card **Level III** | `unavailable` | 无任何文件 | 不得从 Level I 推算 |
| 4 | Fanatic Threat **Level I** | `unavailable` | manifest `fanatic-threat-level-1` | Threat 两面文本均缺失 |
| 5 | Fanatic Threat **Level II** | `unavailable` | 无任何文件 | — |
| 6 | Fanatic Threat **Level III** | `unavailable` | 无任何文件 | — |
| 7 | Fanatic **Room Card** | `unavailable` | manifest `fanatic-room-card` | 房间效果与布局未知；`fanaticPlacement.areaId` 为空串 |
| 8 | Fanatic **Room Tile** | `unavailable` | manifest `fanatic-room-tile` | Tile 区域未知 |
| 9 | **Pyre Card Level I** | `unavailable` | manifest `pyre-card-level-1`；pyre 模板 | `stats: null`、`skills: []`、`captiveEffectDefinitionId: ""` |
| 10 | Pyre Card **Level II** | `unavailable` | 无任何文件 | — |
| 11 | Pyre Card **Level III** | `unavailable` | 无任何文件 | — |
| 12 | **Fanatic 前置移动最大步数** | `unavailable` | 文档 §3 明确"规则书正文未明确" | 不能默认 1 步或无限；缺规则则 official 禁用 |
| 13 | **Fanatic 精确到达判定** | `unavailable` | 文档 §15「正式判定必须来自卡牌或 Room Rule」 | 正式到达规则缺失；Prototype 仅用「同一 Area」 |
| 14 | **Hero 被投入 Pyre 后的效果** | `unavailable` | 文档 §3 明确缺失 | 伤害 / Stress / Condition / 行动限制均未知 |
| 15 | **Hero 如何离开 Pyre / 释放规则** | `unavailable` | 文档 §3 明确缺失 | 资料不足不自行规定 |
| 16 | **Pyre 对 Hero 的 Damage / Stress / Condition** | `unavailable` | 同上 | 未核对数值绝不写入 |
| 17 | **Room 的具体 Area ID** | `unavailable` | `fanatic-room.template.json` | `fanaticPlacement.areaId: ""`、`validAreaIds: []`、`areaCapacities: {}` |
| 18 | **Captive / Pyre Captive Effect Definition** | `unavailable` | `pyre-definition.template.json` | `captiveEffectDefinitionId: ""` |
| 19 | 各等级差异（Level II/III） | `unavailable` | 无任何 Level II/III 文件 | 不推算 |

### 2.2 已核对的规则语义（来自 PDF p39 + 文档 §2）

以下**行为规则**已核对，可直接实现（与数值无关，不受资料缺口影响）：

| # | 规则 | 状态 |
|---|---|---|
| 1 | 加载 Fanatic Room Card 与对应 Room Tile | `verified` |
| 2 | Fanatic 部署于 **Aggressive Stance** 与对应 Room Area | `verified` |
| 3 | Pyre 部署于 **Ranged Stance** 与对应 Room Area | `verified` |
| 4 | Initiative Deck 加入 **3 张 Fanatic + 1 张 Pyre** | `verified` |
| 5 | 每次 Fanatic 行动时，若 **Pyre 仍在场且 Pyre Area 有空间**，Fanatic 先向最近 Hero 移动 | `verified` |
| 6 | Fanatic **到达**该 Hero 后，将其投入 Pyre，Hero Miniature 移到 Pyre Area | `verified` |
| 7 | Fanatic 被击败时，若 Pyre 仍在场，则**移除 Pyre** | `verified` |

> 关键边界（§5/§11/§15）：前置移动是**行动前置规则**而非普通 Skill；每次 Fanatic 行动都评估 Prelude；Pyre 不在场或 Area 无空间时跳过；强制移动步数必须从 verified Definition 读取（缺则禁用）。

---

## 3. Data Gate 判定

`validateFanaticRoom(FANATIC_OFFICIAL_ROOM_LEVEL_1)` 必然失败：

- `fanaticPlacement.areaId = ""` → `missing: fanatic-area:(empty)`
- `pyrePlacement.areaId = ""` → `missing: pyre-area:(empty)`
- `validAreaIds = []` → 所有 Area 校验不通过
- `areaCapacities = {}` → Pyre Area 容量缺失
- `officialDataStatus = 'unavailable'` → official battle 禁用

因此：

```text
isFanaticOfficialBattleEnabled() === false
getFanaticDefinition(1, 'formal') === undefined
getFanaticThreat(1) === undefined
getPyreDefinition(1, 'formal') === undefined
getFanaticRoomDefinition(1, 'formal') !== null 但 validateFanaticRoom(...).isComplete === false
```

**结论：Fanatic 正式战斗全禁，仅 `prototype-fanatic-level-1-harness` 供开发模式使用。**

---

## 4. 资料缺口清单（official battle 禁用根因）

- `fanatic-battle-level-1`（Battle Card 缺失）
- `fanatic-threat-level-1`（Threat 缺失）
- `fanatic-room-card` / `fanatic-room-tile`（Room Card / Tile / Area 缺失）
- `pyre-card-level-1`（Pyre 卡牌缺失）
- `pyre-captive-effect`（Captive / 释放规则缺失）
- Fanatic 普通 Skill d10 Table 缺失
- Fanatic 前置移动最大步数缺失
- Fanatic 精确到达判定缺失
- Hero 在 Pyre 中的效果（伤害 / Stress / 行动限制 / 释放）缺失

---

## 5. 开发策略（资料不足分支，文档 §3 / §22）

- 完成 **verified Room Setup 框架**（Prototype Room 自洽，含 Fanatic Aggressive Area + Pyre Ranged Area + 固定 Area 容量）；
- 完成 **3 + 1 Initiative**（3 张 Fanatic + 1 张 Pyre）；
- 完成 **Turn Prelude 框架**（每张 Fanatic Card 评估；Pyre 在 play 且 Area 有空间 → 选最近 Hero → 移动 → 到达 → 投入 Pyre）；
- 完成 **Closest Hero Selector**（Room Path Distance + 统一 Tie-break，结果先保存）；
- 完成 **Throw Into Pyre 原子事务**（Hero 移动 + Captive State，失败回滚）；
- 完成 **Captive State 框架**（可配置字段由 Definition 驱动，不自行规定行为）；
- 完成 **Pyre 独立 Turn / Death 清理框架**；
- `fanatic-level-*` **保持 official 禁用**；
- 开发模式使用 `prototype-fanatic-level-1-harness` + `prototype-pyre-level-1` + `prototype-pyre-captive-effect`；
- **不把 prototype 数值写入任何正式 Definition**；
- 最终报告明确缺口。

---

## 6. 结论

```text
Phase 9E verified Fanatic/Pyre framework complete;
official Fanatic combat content pending source data.
```

Audit 生成于 2026-08-01，与代码 `src/data/bosses/fanatic-family.ts` + `src/game-engine/fanatic/runtime.ts` 的 Data Gate 逻辑一致。
