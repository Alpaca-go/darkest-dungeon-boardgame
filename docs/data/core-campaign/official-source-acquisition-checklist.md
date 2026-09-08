# Official Source Acquisition Checklist (Phase 11A.3)

> 仓库：`Alpaca-go/darkest-dungeon-boardgame`
> 阶段：Phase 11A.3 — Official Core Content Source-Gated Completion & Data Gate Closure
> 状态：**SOURCE-BLOCKED**
> 关联产物：
> - [`official-source-manifest.json`](./official-source-manifest.json) — 每个资产的机器清单
> - [`official-field-provenance.json`](./official-field-provenance.json) — 字段级 provenance
> - [`source-readiness.json`](./source-readiness.json) — Source Gate 0 主真值源

## 0. 原则

Phase 11A.3 是 **Source-Gated** 阶段。所有 Darkest Dungeon Act IV 官方数据必须来自下列 tier，**禁止**用：

- 电子游戏 Wiki / Fandom / Reddit / Steam
- Prototype harness 数值（如 `PROTOTYPE_FORM_HP.ancestor-first-form = 20`）
- 视觉估算 / 相邻 Boss 数据 / 另一版桌游
- AI 推测 / 自行编造 / prototype 数组 index 推断 Quest→Guardian 映射

**唯一可接受来源**：

| Tier | 类型 | 例 | 用途 |
| --- | --- | --- | --- |
| A | 规则书 | `docs/DD_EN_COREBOX_RULES.pdf`（p35-41） | 数量 / 顺序 / 时机 / 触发 / 大范围 d10 |
| B | 官方卡面 / Room Card / Tile | Battle Card / Quest Card / Room Card / Dungeon Tile / Monster Card | 精确数值 / 技能定义 / Room 几何 |
| C | 官方勘误 / 数字资料 | 官方 FAQ / Errata PDF | 规则争议的权威 ruling |

仓库当前 **只持有 Tier A 资料**。Tier B / C 全部 `missing`。

## 1. 必需的官方资产清单

### 1.1 Darkest Dungeon Quest（3 张）

| # | 资产 ID | 必填字段 | 当前状态 |
| --- | --- | --- | --- |
| 1 | `darkest-dungeon-quest-1` | name / guardianDefinitionId / skippedFinalFormId / firewoodCount / provisionPolicyId.cardSpecific | **missing** |
| 2 | `darkest-dungeon-quest-2` | 同上 | **missing** |
| 3 | `darkest-dungeon-quest-3` | 同上 | **missing** |

**为什么不能推断**：
- 硬约束 22 禁止从 prototype 数组 index 推 Quest→Guardian / Quest→Skipped Form 映射
- 实体桌游规则未公开三张 Quest Card 的具体对应关系
- 必须从卡面读取

**用户需提供**：
- 三张 Quest Card 的扫描或照片（建议 PNG / PDF），或
- 三张 Quest Card 的结构化 JSON（schema 见 `docs/data/darkest-dungeon/official/quests/quest-*.json`）

### 1.2 Darkest Dungeon Dungeon Tile（2 张）

| 资产 ID | 必填字段 | 当前状态 |
| --- | --- | --- |
| `darkest-dungeon-dungeon-tile-A` | tileGeometry / bossSlotPositions | **missing** |
| `darkest-dungeon-dungeon-tile-B` | 同上 | **missing** |

规则书 p36 已确认「2 张 Tile 随机抽 1 张 + 3 个 Boss Slot」，但 tile 几何 / Boss Slot 位置 / Excavation Site 位置必须从 Tile 扫描补。

### 1.3 Templars（2 张 Battle Card + 1 张 Room Card + Room Tile）

| 资产 ID | 必填字段 | 当前状态 |
| --- | --- | --- |
| `templar-impaler`（Battle Card） | maxHp / dodge / speed / resistances / accuracy / damage / crit / skillIds / d10SkillTable | **missing** |
| `templar-warlord`（Battle Card） | 同上 | **missing** |
| `templars-room`（Room Card） | areaIds / areaCapacities / spikedPitPositions / pitD10Map / pitEntryEffects / pitExitRule / victoryCondition | **missing** |
| `templars-room-tile` | tileGeometry | **missing** |

规则书 p39 已锁 Impaler/Warlord stance + initiative count + Body Slam→Pit Toss 触发；但 Pit d10 映射 / Pit 效果 / Room 几何必须从 Room Card + Tile 补。

### 1.4 Mammoth Cyst（2 张 Battle Card + 1 张 Room Card）

| 资产 ID | 必填字段 | 当前状态 |
| --- | --- | --- |
| `mammoth-cyst`（Battle Card） | maxHp / dodge / speed / resistances / accuracy / damage / crit / skillIds / d10SkillTable | **missing** |
| `white-cell-stalk`（Battle Card） | 同上 + teleportationD10Map | **missing** |
| `mammoth-cyst-room`（Room Card） | areaIds / areaCapacities / victoryCondition | **missing** |

规则书 p39 已锁 Cyst 触发条件 + Stalk summon 时机 + Teleportation 触发；但战斗卡 / Room 缺。

### 1.5 Shuffling Horror（3 张 Battle Card + 1 张 Room Card）

| 资产 ID | 必填字段 | 当前状态 |
| --- | --- | --- |
| `shuffling-horror`（Battle Card） | maxHp / dodge / speed / resistances / accuracy / damage / crit / skillIds / d10SkillTable | **missing** |
| `cultist-priest`（Battle Card） | 同上 | **missing** |
| `malignant-growth`（Battle Card） | 同上 | **missing** |
| `shuffling-horror-room`（Room Card） | areaIds / areaCapacities / victoryCondition | **missing** |

规则书 p40 已锁 Horror stance + initiative + Echoing Disassembly 召唤顺序 + Undulations 时机；但所有战斗卡 / Room 缺。

### 1.6 Final Encounter（1 Room Card / Tile + 4 Form Battle Card + 3 Reflection Card + 1 DD Monster Deck）

| 资产 ID | 必填字段 | 当前状态 |
| --- | --- | --- |
| `ancestor-room`（Room Card） | areaIds / areaCapacities / roomEffects / formAreaPlacement | **missing** |
| `ancestor-room-tile` | tileGeometry | **missing** |
| `ancestor-first-form`（Battle Card） | ancestor.maxHp / ancestor.skillIds / timeHealsAll.effect / vacantStanceFillSource | **missing** |
| `perfect-reflection`（Card） | maxHp / skillIds | **missing** |
| `imperfect-reflection`（Card） | maxHp / skillIds | **missing** |
| `ancestor-second-form`（Battle Card） | ancestor.maxHp / ancestor.skillIds / absoluteNothingness.areaIds | **missing** |
| `absolute-nothingness`（Card ×3） | 战斗卡字段（如有独立组件） | **missing** |
| `gestating-heart`（Battle Card） | maxHp / skillIds / d10SkillTable / lethalWoundTimingRuling | **missing** |
| `heart-of-darkness`（Battle Card） | maxHp / skillIds / impendingDoomD10SkillMap | **missing** |
| `come-unto-your-maker`（Card） | definition | **missing** |
| `darkest-dungeon-monster-deck`（Component） | deckComposition / monsterDefinitionIds / drawPolicy | **missing** |

**特别注意**：
- **绝对禁止**从 Darkest Dungeon **电子游戏**的 Come Unto Your Maker 机制照搬（dev doc §29、§45）
- **绝对禁止**用 prototype `PROTOTYPE_FORM_HP.ancestor-first-form = 20` 反推 ancestor.maxHp
- 致死 Wound 后 woundedReaction 是否触发，需要官方 errata / FAQ 权威 ruling

## 2. 用户提供方式

### 2.1 优先：结构化 JSON

```text
docs/data/darkest-dungeon/official/
  source-manifest.json
  quests/
    quest-1.json
    quest-2.json
    quest-3.json
  guardians/
    templars/
      impaler.json
      warlord.json
      room.json
    mammoth-cyst/
      cyst.json
      stalk.json
      room.json
    shuffling-horror/
      horror.json
      cultist-priest.json
      malignant-growth.json
      room.json
  final-encounter/
    room.json
    ancestor-first-form.json
    ancestor-second-form.json
    gestating-heart.json
    heart-of-darkness.json
  monster-deck.json
```

每个 JSON 必须包含：
```json
{
  "sourceReference": "DD_EN_COREBOX_RULES.pdf:p39 或官方卡面扫描引用",
  "sourceAssetId": "<唯一资产 ID>",
  "officialDataStatus": "verified"
}
```

### 2.2 次选：扫描 / 照片

如果用户只提供卡面扫描，可只存：
- `sourceAssetId`
- `checksum`（可选）
- 由 Codex 抽取的结构化数据 + field provenance

原始图片的长期存储由用户决定，**不要主动 commit 图片进仓库**（dev doc §48）。

## 3. 收到资料后

1. 把资产文件放到 `docs/data/darkest-dungeon/official/` 目录
2. 重新生成 `source-readiness.json`（手工或用 helper 脚本）
3. 重跑 `npm run audit:content`
4. 重跑 `npm run verify:phase11a2-3`
5. 重新评估 Release Gate — 只有 `allRequiredSourcesReady=true` 才能走 COMPLETE 路径
6. 重新评估 `canEnterPhase11B` — 必须 SOURCE-BLOCKED → COMPLETE 后才允许

## 4. 当前 SOURCE-BLOCKED 影响

```text
verdict                          = SOURCE-BLOCKED
ISSUE-P0-002                     = open
canEnterPhase11B                 = false
canCloseP0_002                   = false
officialGuardianPoolEnabled      = false
officialFinalEncounterEnabled    = false
officialDarkestDungeonQuestPoolEnabled = false
officialDarkestDungeonMonsterDeckEnabled = false
elevenQuestLoopClosed            = false
campaignVictoryReachable         = false
threeGuardiansPass               = false
threeSkippedFormsPass            = false
goldenCampaignPasses             = false
ruleTraceabilityP0Complete       = false
```

以上字段不得手填。Codex / CI 必须从 `source-readiness.json` + `audit:content` + 真实 Golden Run 结果读取。

## 5. 后续

- 用户补全 Tier B 资料 → 重新走 WP-D / WP-E / WP-F / WP-G / WP-H / WP-I
- WP-C（rulebook-backed partial officialization）已就绪：可立即把规则书已确认的结构字段写入 official definition，状态保持 `partial`、`enabledInOfficialPool=false`
- WP-B（registry convergence）+ WP-J（release gate duplicate / source governance）已就绪
- 等资料齐备后再执行 WP-K（official 11-Quest Golden Run）

**Phase 11A.3 在资料齐备前必须保持 SOURCE-BLOCKED。这是正确的 Source Gate，不是开发失败。**
