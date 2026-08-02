# Phase 10D — Shuffling Horror 数据审计报告

- **审计对象**：`docs/data/darkest-dungeon/shuffling-horror/` 下全部 6 个 JSON
- **审计日期**：2026-08-02
- **规则书来源**：`DD_EN_COREBOX_RULES.pdf` p30–31（Monster Initiative Priority）、p40（Shuffling Horror / Echoing Disassembly / Undulations）
- **原则**：缺失数据一律标记为 `unavailable` / `partial`，**绝不猜测**；正式（official）Shuffling Horror 在数据不齐备时保持禁用，开发走 `prototype-shuffling-horror-guardian-harness`。

## 状态图例

| 标记 | 含义 |
|------|------|
| `verified` | 规则书明确、可直接落地 |
| `partial` | 规则书有描述但数值/序列缺失，仅能搭骨架 |
| `prototype` | 本项目为验证链路自造的 harness 数值（不写入正式 Definition） |
| `unavailable` | 规则书未提供 / 无法核对，正式链路禁用 |

## 逐项审计

### 1. `manifest.json` — 资产清单
- `shuffling-horror-battle-card`：**partial**
- `cultist-priest-battle-card`：**partial**
- `malignant-growth-battle-card`：**partial**
- `shuffling-horror-room-card`：**unavailable**
- `shuffling-horror-room-tile`：**unavailable**
- `echoing-disassembly`：**partial**
- `undulations`：**partial**
- `monster-initiative-priority-rule`：**verified**
- `guardian-victory-cleanup`：**partial**

### 2. `shuffling-horror-guardian.json` — Guardian 定义
- `officialDataStatus`: **partial**；`enabledInOfficialPool`: **false**
- `bossActorDefinitionId`: `shuffling-horror-level-3`（存在但 stats/skills 缺失 → partial）
- `reserveActorDefinitionIds`: `[cultist-priest-level-3, malignant-growth-level-3]`（Priest → Growth 顺序，规则书明确，✅）
- `roomDefinitionId`: `shuffling-horror-room-level-3`（room 数据 unavailable，见 §3）
- `initiativeAllocationPolicyId`: `stance-priority-action-budget`（对应 §4 verified）
- `summonOverrideDefinitionId`: `shuffling-horror-echoing-disassembly`（partial，见 §6）
- `victoryCondition` / `cleanupPolicy`: `definition-driven`（资料不足 → official 禁用，硬约束 28）

### 3. `shuffling-horror-room.json` — Room 定义
- `validAreaIds`: **空**；`stanceToAreaMap`: **空**（Area 占位 / 区域映射数据缺失）
- `officialDataStatus`: **unavailable**
- 结论：正式 Room 区域数据**不可用**。Prototype 用合成 Room（4 Stance × 对应 Area 占位），Area 满时复用正式 Space Resolution（硬约束 15）。

### 4. `initiative-policy.json` — Monster Initiative Priority Rule ✅ VERIFIED
- `cardType`: `monster-initiative-opportunity`（不绑定 Actor）
- `stancePriority`: `[aggressive, defensive, ranged, support]`（规则书明确，✅）
- `eligibility`: `[actor-alive, actor-in-stance-tracker, remaining-actions-greater-than-zero]`（规则书明确，✅）
- `excessPolicy`: `remove-when-drawn-if-no-eligible-actor`（规则书明确，✅）
- `resolveAtDrawTime`: `true`（规则书明确：抽卡时按当前 Stance + 剩余行动解析，✅）
- 这是整个 Phase 10D 的**核心已验证规则**，直接驱动 Stance Priority Resolver 与 Excess Initiative。

### 5. `actor-definitions.json` — Actor 定义
- `shuffling-horror-level-3`：stats / skills **缺失**（partial）；已知：`requiredStance=aggressive`、`actionsPerRound=2`（规则书明确）
- `cultist-priest-level-3`：stats / skills **缺失**（partial）；已知：初始 Reserve、`actionsPerRound=1`
- `malignant-growth-level-3`：stats / skills **缺失**（partial）；已知：初始 Reserve、`actionsPerRound=1`
- 结论：正式战斗数值**不可用**，official 禁用；Prototype 用合成数值（独立 ID，不写正式 Definition）。

### 6. `echoing-disassembly` 相关（manifest 标记 partial）
- 召唤顺序 `cultist-priest → malignant-growth` 规则书明确（✅）
- 每名召唤物立即 `+1 Monster Initiative Opportunity` 规则书明确（✅）
- 具体召唤数值 / 技能效果序列**缺失**（partial）→ official 禁用，Prototype 用合成序列。

### 7. `undulations.json` — Undulations Skill
- `effectSequence`: **空**（具体效果序列缺失）
- `stanceShuffleEffect`:
  - `type`: `shuffle-all-hero-stances`（规则书明确，✅）
  - `policyId`: `random-permutation-aggressive-to-support`（规则书明确：从 Aggressive 到 Support 放回，✅）
  - `preserveHeroAreas`: `true`（规则书明确：只改 Stance 不改 Area，✅）
  - `preserveRoundActionBudgets`: `true`（规则书明确：已行动 Hero 不重复、未行动不丢失，✅）
  - `rngPersistenceRequired`: `true`（RNG 先保存后展示，✅）
- 结论：行为语义 fully verified；具体伤害/效果数值序列 partial（official 禁用），Prototype 仅做 Stance 排列。

## 资料缺口汇总（gaps）

1. Shuffling Horror / Priest / Growth 三者的 **HP / 抗性 / 速度 / 技能数值**（卡面未核对）。
2. **Room 区域数据**（Area 占位、Stance→Area 映射、Room Tile）全部 unavailable。
3. **Echoing Disassembly 具体数值 / 效果序列**缺失（仅召唤顺序与 +1 Opportunity 规则明确）。
4. **Undulations 具体伤害 / 效果序列**缺失（仅 Stance 排列语义明确）。
5. **Guardian Victory Cleanup** 数值缺失（仅 `definition-driven` 标记）。
6. Monster 在 Stance Tracker 中**每个 Stance 的承载上限**（capacityPerStance）规则书未显式给出 → Prototype 采用 `1`（每 Stance 一名 Monster）。

## 开发决策

- **official Shuffling Horror 全程禁用**（`isShufflingHorrorOfficialEnabled()` 恒返回 `false`）。
- **Prototype harness**：`prototype-shuffling-horror-guardian-harness` 及相关 `prototype-` 前缀 ID，仅验证「Setup / Initiative Priority / Action Budget / Echoing 召唤 / Hero Stance Shuffle / Data Gate」链路。
- 所有合成数值放在独立 prototype Definition 中，**绝不写入正式 ID 的 Definition**（硬约束 29）。
- 最终报告将明确标注上述缺口，不臆造平衡性数值。
