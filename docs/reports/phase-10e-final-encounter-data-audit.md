# Phase 10E — Final Encounter 数据审计报告

> 审计对象：`docs/data/darkest-dungeon/final-encounter/`（7 个文件）
> 参照来源：`DD_EN_COREBOX_RULES.pdf`（manifest 声明已核验页 36 / 40 / 41）
> 审计日期：2026-08-02
> 审计原则：**缺失数据一律标记 `unavailable`，绝不猜测、绝不使用电子游戏数值补全。**

---

## 0. 可信度分级定义

| 标记 | 含义 | 处置方式 |
| --- | --- | --- |
| `verified` | 规则书明确给出，可直接进入正式 Definition | 正式启用 |
| `partial` | 结构/机制已确认，但关键数值或子字段缺失 | 结构进正式 Definition，缺失字段留空并驱动 Data Gate 失败 |
| `prototype` | 官方无数据，仅为开发用替身 | 仅存在于 `prototype-` 前缀 ID，禁止写入正式 ID |
| `unavailable` | 官方数据完全缺失 | 正式池禁用，运行时拒绝，不得实现 |

---

## 1. 审计总览

| # | 审计条目 | manifest 标记 | 实际 JSON 结构 | 判定 | 阻断正式启用 |
| --- | --- | --- | --- | --- | --- |
| 1 | Ancestor Room Card | `unavailable` | `ancestor-room.json` 全空 | **unavailable** | 是 |
| 2 | Ancestor Room Tile | `unavailable` | 无 tile 资产 | **unavailable** | 是 |
| 3 | Ancestor 1st Form Battle Card | `unavailable` | 无 HP / 无 Skill | **unavailable** | 是 |
| 4 | Perfect Reflection Card | `unavailable` | 仅有数量 2 | **partial（结构）/ unavailable（卡面）** | 是 |
| 5 | Imperfect Reflection Card | `unavailable` | 仅有数量 1 + 死亡反应 | **partial（结构）/ unavailable（卡面）** | 是 |
| 6 | Time Heals All | `partial` | 仅 skillId 引用 | **partial** | 是 |
| 7 | Ancestor 2nd Form Battle Card | `unavailable` | 无 HP / 无 Skill | **unavailable** | 是 |
| 8 | Absolute Nothingness ×3 | `verified` | 3 条完整 | **verified（机制）/ partial（areaId）** | 否（机制可实现） |
| 9 | Gestating Heart Battle Card | `unavailable` | 无 HP / 无 Skill | **unavailable** | 是 |
| 10 | Sispersion | `partial` | 召唤策略完整、被召唤池缺失 | **partial** | 是 |
| 11 | Darkest Dungeon Monster Deck | 未列入 manifest | 仅有 deckId 字符串 | **unavailable** | 是 |
| 12 | Heart of Darkness Battle Card | `unavailable` | 无 HP，`skills: []` | **unavailable** | 是 |
| 13 | Impending Doom d10 映射 | `unavailable` | 10 键全空字符串 | **unavailable** | 是 |
| 14 | Come Unto Your Maker | `unavailable` | `definition: null` | **unavailable** | 是 |
| 15 | Quest → skipped Form 映射 ×3 | `unavailable` | Quest 模板 `skippedFinalFormId: ""` | **unavailable** | 是 |

**结论：15 个审计条目中，`verified` 仅 1 项（Absolute Nothingness 机制），`partial` 3 项，`unavailable` 11 项。**

---

## 2. 逐项审计明细

### 2.1 Ancestor Room（`ancestor-room.json`）— unavailable

```json
"stanceAreaMap": { "aggressive": "", "defensive": "", "ranged": "", "support": "" },
"validAreaIds": [], "areaCapacities": {}, "roomEffects": [],
"officialDataStatus": "unavailable", "sourceReference": ""
```

- **缺失**：四个 Stance 到 Area 的映射、合法 Area ID 列表、每个 Area 的容量、Room 效果、来源页引用。
- **影响**：Absolute Nothingness 的 `areaId`、Sispersion 的 `next-available-stance`、Teleport 的落点解析全部依赖该 Room。官方 Room 缺失 → 四个 Form 的正式版本均无法定位。
- **处置**：`ancestor-room` 保持 unavailable；开发使用 `prototype-ancestor-room`（Phase 10A 已建立 `PROTOTYPE_FINAL_ENCOUNTER_ROOM`）。
- **不猜测声明**：不臆造 Area 数量与容量。

### 2.2 Ancestor 1st Form（`ancestor-first-form.json`）— partial

已确认（结构可信）：

| 字段 | 值 | 判定 |
| --- | --- | --- |
| `requiredStance` | `aggressive` | partial（结构确认） |
| `initialReflections.perfectCount` | `2` | partial |
| `initialReflections.imperfectCount` | `1` | partial |
| `randomizeAcrossStances` | `[defensive, ranged, support]` | partial |
| `initiativePolicy.cardCountPerRound` | `4` | partial |
| `allocationPolicy` | `reflection-first-then-ancestor` | partial |
| `preserveCardCountAfterReflectionDeath` | `true` | partial |
| `guardPolicy` | `reflections-always-guard-ancestor` | partial |
| `imperfectDeathReaction` | `deal-wounds-to-ancestor / 10` | partial |
| `fullStanceSkillId` | `ancestor-time-heals-all` | partial（**仅 ID，无 Skill 本体**） |
| `vacantStanceResolverId` | `ancestor-fill-reflection-stances` | partial（**仅 ID，无解析规则细节**） |

缺失：

- Ancestor 1st Form **本体 HP / 防御 / Skill 列表**（`ancestor-first-form-card` = unavailable）。
- Perfect / Imperfect Reflection 的 **HP、Skill、是否可行动**（两张卡面均 unavailable）。
- `ancestor-time-heals-all` 的**实际效果数值**（治疗量 / 目标 / 触发时机细节）。
- `ancestor-fill-reflection-stances` 的**补位来源**（补 Perfect 还是 Imperfect？是否有上限？）。

**处置**：结构（数量、随机分配、4 张 Initiative、GUARD、10 Wounds 反应）作为 Definition 驱动的机制实现；所有数值字段留空并触发 Data Gate 失败；`prototype-ancestor-first-form` 提供替身数值。

### 2.3 Ancestor 2nd Form（`ancestor-second-form.json`）— partial（含唯一 verified 条目）

| 字段 | 值 | 判定 |
| --- | --- | --- |
| `initiativeCardsPerRound` | `2` | partial |
| `absoluteNothingness` | 3 条：`defensive` / `ranged` / `support`，均 `targetable:false`、`occupiesAreaSpace:true` | **verified（机制与数量）** |
| `absoluteNothingness[].areaId` | 全部 `""` | **unavailable**（依赖 Room） |
| `actionEndTeleportMap` | 1-3→defensive，4-6→ranged，7-9→support，10→none | **verified（映射完整）** |
| `capacityPolicy` | `definition-driven` | partial |

缺失：

- Ancestor 2nd Form 本体 HP / Skill（`ancestor-second-form-card` = unavailable）。
- Absolute Nothingness 落位的具体 `areaId`（Room 缺失导致）。
- 传送与 Hero 占位冲突时的裁决细节（`capacityPolicy` 只给了"由 Definition 驱动"这一策略名，未给容量数值）。

**处置**：`absoluteNothingness` 的"非 BattleActor / 不可 Target / 占 Area Space"三性质与 d10 传送表按 verified 实现；`areaId` 在 prototype Room 中解析。

### 2.4 Gestating Heart（`gestating-heart.json`）— partial

| 字段 | 值 | 判定 |
| --- | --- | --- |
| `initiativeCardsPerRound` | `1` | partial |
| `monsterDeckId` | `darkest-dungeon-monsters` | **unavailable**（仅 ID，牌堆内容不存在） |
| `sispersion.summonCount` | `1` | partial |
| `sispersion.selectionPolicy` | `random` | partial |
| `sispersion.stancePolicy` | `next-available-stance` | partial |
| `sispersion.initiativeCardsToAdd` | `1` | partial |
| `woundedReaction.trigger` | `hero-attack-applied-wounds` | partial |
| `woundedReaction.blightPotency / DurationTurns / heal` | `2 / 3 / 2` | partial |
| `reactionAfterLethalWound` | `definition-driven` | **unavailable**（策略名而非规则） |

缺失：

- Gestating Heart 本体 HP / Skill。
- **Darkest Dungeon Monster Deck 的实际组成**（全代码库检索确认：`darkest-dungeon-monsters` 只在本 JSON 出现一次，无任何牌堆数据）。
- 致死伤害后 Wounded Reaction 是否仍触发的确切裁决。

**处置**：Sispersion 管线按结构实现，但抽取源在正式模式下为空 → Data Gate 失败；prototype 使用 `prototype-darkest-dungeon-monsters` 替身牌堆。

### 2.5 Heart of Darkness（`heart-of-darkness.json`）— unavailable（机制骨架 partial）

| 字段 | 值 | 判定 |
| --- | --- | --- |
| `initiativeCardsPerRound` | `2` | partial |
| `cannotBeSkipped` | `true` | **verified**（与规则书总规则一致） |
| `impendingDoom.triggerAtBattleStart` | `true` | partial |
| `impendingDoom.triggerAfterCompletedAction` | `true` | partial |
| `impendingDoom.forecastVisibleToPlayers` | `true` | partial |
| `impendingDoom.consumeForecastOnTurn` | `true` | partial |
| `impendingDoom.d10SkillMap` | 10 键**全为空字符串** | **unavailable** |
| `skills` | `[]` | **unavailable** |
| `comeUntoYourMaker.definition` | `null` | **unavailable** |
| `victoryPolicy` | `campaign-victory` | verified |

**关键缺口**：Impending Doom 的 d10→Skill 映射是 Heart of Darkness 回合的唯一驱动，10 个槽位全空意味着**正式 Heart 无法执行任何行动**。

**处置**：Forecast 生命周期（Battle Start 先掷 → Turn 消费不重掷 → Action 完成后生成下一次 → 对玩家可见）作为机制实现；映射表在正式模式为空 → Data Gate 失败；prototype 提供 `prototype-impending-doom-map`。
**Come Unto Your Maker 明确禁用**，不按电子游戏版本实现。

### 2.6 Encounter Definition（`final-encounter-definition.json`）— partial

```json
"orderedFormIds": [ancestor-first-form, ancestor-second-form, gestating-heart, heart-of-darkness],
"skippableFormIds": [前三个],
"requiredFinalFormId": "heart-of-darkness",
"transitionPolicyId": "final-encounter-no-recovery",
"failurePolicy": "campaign-over",
"victoryPolicy": "campaign-victory",
"officialDataStatus": "partial",
"enabledInOfficialPool": false
```

- **verified**：固定四形态顺序、可跳过集合（前三）、Heart 不可跳过、切换不恢复、失败→Campaign Over、胜利→Campaign Victory。这些与规则书总规则完全吻合。
- **partial**：`transitionPolicyId` 只给了策略名，具体保留项由 Phase 10A `DEFAULT_FORM_TRANSITION_POLICY` 承担（preserve Life / Stress / Stance 均为字面量 `true`）。
- **处置**：`enabledInOfficialPool: false` 与本次审计一致，保持禁用。

### 2.7 Quest → skipped Form 映射 — unavailable

- `darkest-dungeon-quest.template.json` 中 `skippedFinalFormId: ""`、`officialDataStatus: "unavailable"`。
- 代码侧（`src/data/darkest-dungeon/quest-registry.ts`）已按 Phase 10A 约定：正式三张 Quest 的 `skippedFinalFormId = null` 并驱动 `missing.push('skipped-final-form:...')`；prototype 三张覆盖前三个可跳过 Form。
- **缺失**：三张正式 Darkest Dungeon Quest 分别跳过哪一个 Form 的对应关系。
- **不猜测声明**：不为正式 Quest 臆造跳过映射。

---

## 3. Data Gate 判定结论

| 判定项 | 结果 |
| --- | --- |
| `isFinalEncounterOfficialEnabled()` | **false**（保持 Phase 10A 现状） |
| 正式 Final Encounter 可运行？ | **否** |
| 阻断原因数量 | 11 项 unavailable + 3 项 partial 关键数值缺失 |
| 开发路径 | 仅 `prototype-final-encounter-harness` |
| prototype ID 前缀 | `prototype-`（Room / 四 Form / Monster Deck / Impending Doom Map 全部独立命名） |
| prototype 数值是否写入正式 Definition | **否**（硬约束） |

---

## 4. 本 Phase 可实现 vs 必须禁用

### 4.1 可实现（结构/机制已确认，Definition 驱动）

1. 固定四形态顺序与 effective sequence（跳过一个 → 实际面对 3 个）。
2. Heart of Darkness 不可跳过的编译期与运行时双重保证。
3. 共用同一 Ancestor Room 的运行时约束。
4. Form 切换：不恢复 Life/Stress、不 Rest、不改 Hero Stance、新 Initiative Deck、Round 重置为 1。
5. Ancestor 1st：2 Perfect + 1 Imperfect 随机分配到三个 Stance、固定 4 张 Initiative、Reflection 死亡不减少 Card、GUARD 保护、Imperfect 死亡触发**一次** 10 Wounds、Stance 全满→Time Heals All / 有空位→Fill 补位（均 Definition 驱动）。
6. Ancestor 2nd：3 张 Absolute Nothingness（非 BattleActor、占 Area Space、不可 Target）、每 Action 后 d10 传送（10 = 不传送）、容量 Definition 驱动、2 张 Initiative。
7. Gestating Heart：Sispersion 只抽 DD Monster、召唤与 +1 Initiative 原子、Wounded Reaction 仅在实际造成 Wounds 时触发、1 张 Initiative。
8. Heart of Darkness：Impending Doom Forecast 生命周期（Battle Start 先生成 → Turn 消费不重掷 → Action 完成后生成下一次 → 玩家可见）、2 张 Initiative。
9. Final Failure → Campaign Over；Heart 死亡 → Campaign Victory。

### 4.2 必须禁用（数据缺失）

1. 全部四个 Form 的**正式 HP / 防御 / Skill 列表**。
2. **正式 Ancestor Room** 的 Area 布局与容量。
3. `ancestor-time-heals-all` 的实际效果数值。
4. `ancestor-fill-reflection-stances` 的补位来源细则。
5. **Darkest Dungeon Monster Deck** 的实际组成。
6. **Impending Doom d10 → Skill 映射**（10 槽全空）。
7. **Come Unto Your Maker**（`definition: null`，明确不按电子游戏实现）。
8. 三张正式 Quest 的 **skipped Form 对应关系**。
9. Perfect / Imperfect Reflection 的**卡面数值**。
10. Absolute Nothingness 的**正式 areaId 落点**。
11. 致死伤害后 Wounded Reaction 的确切裁决。

---

## 5. 审计签署

- 未向任何 `unavailable` 字段填充推测值。
- 未引用《暗黑地牢》电子游戏的任何数值、技能名或平衡参数。
- 所有 partial 条目仅取"机制结构"，数值一律留空并驱动 Data Gate 失败。
- 正式 Final Encounter 在本 Phase 结束后**仍为禁用状态**，待官方卡面数据补齐后方可开启。
