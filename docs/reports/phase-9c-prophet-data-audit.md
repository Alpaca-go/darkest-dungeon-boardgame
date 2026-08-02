# Phase 9C — Prophet 数据审计报告 v1.0

> 审计对象：`docs/data/prophet/`
> 规则来源：`docs/DD_EN_COREBOX_RULES.pdf` 第 38—39 页
> 生成时间：2026-07-31
> 审计口径：`verified | partial | prototype | unavailable`
> **硬规则：缺失数据一律标记 `unavailable`，不猜测、不推算、不使用电子游戏数值。**

---

## 1. 审计输入

`docs/data/prophet/` 下共 3 份模板文件：

| 文件 | 说明 |
|---|---|
| `prophet-data-manifest.template.json` | 资产清单与状态声明 |
| `prophet-definition.template.json` | Prophet Level I Boss 定义骨架 |
| `prophet-room-map.template.json` | Prophet Room / d10 → Area 映射骨架 |

三份文件均为**模板骨架**：关键数值字段为 `null`、`[]` 或空字符串，尚未填入正式卡面数据。

---

## 2. 逐项审计结论

### 2.1 文档 §4 要求的必审项

| # | 审计项 | 状态 | 依据 | 说明 |
|---|---|---|---|---|
| 1 | Prophet Battle Card **Level I** | `partial` | manifest `prophet-battle-level-1`；definition 模板 | 仅有结构性字段（`actionsPerRound: 3`、`actionOverrides`），**`stats: null`、`skills: []`** —— 无 HP / Dodge / 抗性 / 技能表 |
| 2 | Prophet Battle Card **Level II** | `unavailable` | 无任何文件 | 不得从 Level I 推算 |
| 3 | Prophet Battle Card **Level III** | `unavailable` | 无任何文件 | 不得从 Level I 推算 |
| 4 | Prophet Threat **Level I** | `unavailable` | manifest 显式声明 | 两面 Threat 文本均缺失 |
| 5 | Prophet Threat **Level II** | `unavailable` | 无任何文件 | — |
| 6 | Prophet Threat **Level III** | `unavailable` | 无任何文件 | — |
| 7 | Prophet **Room Card** | `unavailable` | manifest 显式声明 | 房间效果与布局未知 |
| 8 | Prophet **Room Tile** | `unavailable` | manifest 显式声明 | `bossPlacement.tileAreaId` 为空串 |
| 9 | **d10 → Area 映射** | `unavailable` | room-map 模板 | 1—10 **全部为空串**；`validAreaIds: []` |
| 10 | **Rubble of Ruin** 完整数值 | `unavailable` | manifest 显式声明 | 命中 / 伤害 / 压力 / 状态效果全部未知 |
| 11 | **第二行动 Skill Table** | `unavailable` | definition 模板 `skills: []` | 普通 Boss Skill d10 表缺失 |
| 12 | **Wooden Pews 组件** | `verified` | manifest `count: 4`；PDF p38—39 | 数量固定 4 个，规则语义明确 |

### 2.2 已核对的规则语义（来自 PDF p38—39）

以下**行为规则**已核对，可直接实现（与数值无关，因此不受资料缺口影响）：

| # | 规则 | 状态 |
|---|---|---|
| 1 | Prophet 部署于 Aggressive Stance | `verified` |
| 2 | Initiative Deck 加入 **3 张** Prophet Initiative Card | `verified` |
| 3 | 准备 **4 个** Wooden Pews | `verified` |
| 4 | 第 1 次行动：掷 **4 个 d10** 放置 Pews（不使用普通 Skill） | `verified` |
| 5 | 第 2 次行动：运行普通 Skill Table | `verified` |
| 6 | 第 3 次行动：固定使用 `Rubble of Ruin` | `verified` |
| 7 | 每个 Pew **分别独立**攻击其所在 Area | `verified` |
| 8 | 同一 Area 有 2 个 Pews → 该 Area 被攻击 **2 次** | `verified` |
| 9 | Pews **不占用** Area 空间 | `verified` |
| 10 | Pews **不能**成为攻击目标 | `verified` |
| 11 | Prophet 被击败时**移除所有** Pews | `verified` |

> 由此得出每轮固定语义：`ordinal 1 = Place Wooden Pews` → `ordinal 2 = Normal Skill Table` → `ordinal 3 = Rubble of Ruin`。

---

## 3. 资料缺口汇总

**阻断正式战斗的关键缺口（共 4 类）：**

1. **d10 → Area 映射完全缺失** —— 这是 Prophet 机制的核心。文档 §4 明令「不按 Area 数量平均分配 1—10」，因此**无法用任何算法补全**，必须等正式 Room Card。
2. **Rubble of Ruin 数值缺失** —— 无命中率 / 伤害区间 / 压力 / 状态效果，无法结算正式攻击。
3. **第二行动 Skill Table 缺失** —— `skills: []`，普通 Boss 行动无表可查。
4. **Prophet Stats 缺失** —— `stats: null`，无 HP 则 Boss 无法被击败判定。

**次级缺口：**

5. Prophet Threat Level I—III 全部缺失（Face the Threat 无法挂载 Prophet Threat）。
6. Room Card / Room Tile 缺失（`tileAreaId` 为空，Boss 无法定位到具体 Area）。
7. Level II / III 全维度缺失。

---

## 4. 数据门槛（Data Gate）判定

文档 §6 正式池准入条件：

```ts
enabledInOfficialPool === true
&& officialDataStatus === 'verified'
&& validation.isComplete === true
```

逐条核验：

| 条件 | 实际 | 通过 |
|---|---|---|
| Room Map 覆盖 1—10 | 10 项全为空串 | ❌ |
| 结果只指向合法 Area | `validAreaIds` 为空 | ❌ |
| Rubble Definition 存在 | 缺失 | ❌ |
| 第二行动 Skill Table 完整 | `skills: []` | ❌ |
| verified 数据有 sourceReference | Battle 有 `p38-39`，其余无 | ❌ |
| `actionsPerRound === 3` | 3 | ✅ |

**判定结果：`prophet-level-1` / `-2` / `-3` 全部 `enabledInOfficialPool = false`，official battle 禁用。**

---

## 5. 本阶段采取的隔离策略

依据文档 §4「开发模式允许」与 §23「资料不足时最终状态」：

| 用途 | ID | 数据状态 | 入正式池 |
|---|---|---|---|
| 正式 Level I | `prophet-level-1` | `partial` | **否** |
| 正式 Level II | `prophet-level-2` | `unavailable` | 否（定义不存在） |
| 正式 Level III | `prophet-level-3` | `unavailable` | 否（定义不存在） |
| 开发 Harness | `prototype-prophet-level-1-harness` | `prototype` | **否** |
| 开发 Room Map | `prototype-prophet-room-map` | `prototype` | **否** |
| 开发 Rubble | `prototype-rubble-of-ruin` | `prototype` | **否** |

**隔离保证：**

- Prototype 数值**绝不**写入正式 `prophet-level-*` ID；
- Prototype Room Map 的 1—10 映射仅供 Harness 验证机制，**不冒充**正式 Room Card；
- 正式 ID 保留 `officialDataStatus`，拿到卡面后只需填数值并翻 `enabledInOfficialPool`，引擎与 UI 无需改动。

---

## 6. 最终状态

```text
Phase 9C verified Wooden Pews framework complete;
official Prophet combat content pending source data.
```

**已完成（不依赖缺失数值）：** Wooden Pews 延迟区域攻击框架、Action Ordinal 语义、4d10 放置事务、Pew 不占位 / 不可 Target、逐 Pew 独立结算、Lifecycle、Victory 清理、Save Migration、Data Gate。

**待补充资料后方可启用：** 正式 d10 Area Map、Rubble of Ruin 数值、第二行动 Skill Table、Prophet Stats、Prophet Threat I—III、Level II / III 全部数据。

---

## 7. 补齐资料后的操作清单

1. 将正式卡面填入 `docs/data/prophet/prophet-room-map.template.json` 的 `d10AreaMap`（10 项）与 `validAreaIds`；
2. 填入 `prophet-definition.template.json` 的 `stats` 与 `skills`；
3. 新增 `rubble-of-ruin-level-1` 完整数值定义；
4. 新增 `prophet-threat-level-1` 两面文本；
5. 在 `src/data/bosses/prophet-family.ts` 中把对应条目的 `officialDataStatus` 改为 `verified`、`enabledInOfficialPool` 改为 `true`；
6. 运行 `validateProphetFamily()`，确认 `issues.length === 0`；
7. 重跑 Unit / E2E / Build。
