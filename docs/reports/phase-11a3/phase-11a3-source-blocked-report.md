# Phase 11A.3 — Source-Blocked Report

> 仓库：`Alpaca-go/darkest-dungeon-boardgame`
> 分支：`phase-11a3-official-core-content-data-gate`
> 基线分支：`phase-11a2-final-acceptance-closure`
> 基线 HEAD：`2aeadd6cdd1ffdc869000cda632b5ea6f3d6738c`
> 状态：**SOURCE-BLOCKED**
> 报告日期：2026-09-08

---

## 0. 阶段定位

Phase 11A.3 的唯一目标是处理 `ISSUE-P0-002`（Act IV 官方卡面数据缺失）。**核心原则是 Source-Gated** —— 没有权威来源（Tier B 官方卡面 / Tier C 官方勘误）的数据不猜、不补、不从电子游戏迁移、不从 Prototype 反推。

本阶段已停止在 **SOURCE-BLOCKED** 终态。**这不是开发失败，而是正确的 Source Gate**（dev doc §1 / §51）。

---

## 1. 终态判定

```text
status                           = SOURCE-BLOCKED
verdict                          = SOURCE-BLOCKED
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

以上字段全部从机器可读的 Source Gate 信号推导（`docs/data/core-campaign/source-readiness.json` + `audit:content` + 真实 Golden Run + family validators），**不**存在手填。

---

## 2. 已确认的 Rulebook facts（Tier A）

Phase 11A.3 dev doc §6 / §25-29 已锁定的规则书事实，已经以 `sourceReference: 'DD_EN_COREBOX_RULES.pdf:pXX'` 形式写入对应 official Definition：

### 2.1 p35 — Darkest Dungeon Quest

```text
count                = 3
roomCount            = 16
xpReward             = 3
questType            = 'darkest-dungeon-guardian'
draw one of 3
Quest reward: 3 XP + cancel one Final Boss form
```

写入 `src/data/darkest-dungeon/quest-registry.ts:OFFICIAL_DARKEST_DUNGEON_QUESTS`，每个 Quest 的 `sourceReference` 字段已含 p35 provenance。

### 2.2 p36 — Darkest Dungeon Dungeon + Final Encounter

```text
2 DD Dungeon Tiles random 1
3 Boss slots
Excavation Site Room: each Hero roll 1 Provision die, +1 free Rest Action (8 Resting Points), no Firewood
Final Hamlet: 4 preparation days, no Hamlet Event
Final Encounter: no Exploration, still Roll for Provisions
4 forms / fight 3 / fixed order
Ancestor 1st → Ancestor 2nd → Gestating Heart → Heart of Darkness
Heart of Darkness 永不跳过
Form 切换：same Room / no Rest / no Life-Stress recovery / no Stance adjustment / new Initiative + Round
```

写入 `src/data/darkest-dungeon/final-form-registry.ts:OFFICIAL_FINAL_ENCOUNTER_ROOM.sourceReference` + `rulebookFormSourceReference(formId)`。

### 2.3 p39 — Templars / Mammoth Cyst

```text
Templar Impaler Aggressive + 2 Initiative + Body Slam → Pit Toss (d10)
Templar Warlord Ranged + 2 Initiative
Mammoth Cyst Aggressive + 2 Initiative
White Cell Stalk: 初始 Reserve / Cyst turn 时场上无 Stalk → 不使用 Skill + summon Stalk
Stalk 入场后 2 Initiative Cards
Stalk Teleportation: roll d10 → 对应 Area
```

p39 结构字段已存在于 `templars/templars-registry.ts` 和 `mammoth-cyst/mammoth-cyst-registry.ts` 的 `validateTemplarActor` / `validateMammothCystGuardian` 中作为 `requiredStance` / `initiativeCardsPerRound` 校验；这些字段的 `expectedStance` 与规则书一致。

### 2.4 p40 — Shuffling Horror / Ancestor 1st

```text
Shuffling Horror Aggressive + 2 Initiative
Cultist Priest + Malignant Growth kept aside
Horror 使用 Echoing Disassembly 时依次召唤 Cultist Priest → Malignant Growth
每次 summon 后 +1 Initiative
Undulations: shuffle all Hero Stance Tokens
Ancestor 1st Aggressive + 2 Perfect + 1 Imperfect Reflection
Monster Initiative Cards = 4
Reflections always Guard Ancestor
Imperfect Reflection 死亡 → Ancestor 10 Wounds
Reflection 死亡不减少 Initiative
```

p40 结构已存在于 `shuffling-horror/registry.ts:OFFICIAL_SHUFFLING_HORROR_GUARDIAN` 的注释、`initiative-policy.ts`、`undulations.ts`，并在 `validateShufflingHorrorRegistry` 中作为 structural 校验。

### 2.5 p41 — Ancestor 2nd / Gestating Heart / Heart of Darkness

```text
Ancestor 2nd 2 Initiative + 3 Absolute Nothingness (Defensive/Ranged/Support, untargetable, occupies Area)
Ancestor d10 teleport map: 1-3 Defensive, 4-6 Ranged, 7-9 Support, 10 no teleport
Gestating Heart Aggressive + 1 Initiative
Sispersion: 抽 1 DD Monster 放入 next available Stance + 1 Initiative
Wounded reaction: Blight 2/3 turns + Heal 2
Heart of Darkness Aggressive + 2 Initiative
Impending Doom: roll d10 at Battle Start + after completed action
Impending Doom 决定下一回合 Skill
Heart 胜利 = Campaign Victory
```

p41 结构已存在于 `final-encounter/ancestor-second-form.ts`（Absolute Nothingness / d10 map）、`gestating-heart.ts`（Sispersion / wounded reaction）、`heart-of-darkness.ts`（Impending Doom lifecycle / victory = campaign victory），通过 Phase 10E 数据审计确认。

---

## 3. 已成功 officialized 的 partial fields

下列字段已经按 dev doc §17（rulebook-backed partial officialization）从 rulebook 写入 official Definition，状态保持 `unavailable` / `partial` + `enabledInOfficialPool = false`：

| 字段 | 位置 | 状态 |
| --- | --- | --- |
| `darkest-dungeon-quest.roomCount = 16` | `quest-registry.ts:OFFICIAL_DARKEST_DUNGEON_QUESTS[].roomCount` | partial（其余字段 source-required） |
| `darkest-dungeon-quest.xpReward = 3` | `quest-registry.ts` | partial |
| `darkest-dungeon-quest.questType` | `quest-registry.ts` | partial |
| `templar-impaler.requiredStance = 'aggressive'` | `templars/templar-impaler.ts`（已被 `validateTemplarActor.expectedStance` 验证） | verified 结构 |
| `templar-warlord.requiredStance = 'ranged'` | 同上 | verified 结构 |
| `templar-*.actionsPerRound = 2` | 同上 | verified 结构 |
| `mammoth-cyst.requiredStance = 'aggressive'` | `mammoth-cyst/mammoth-cyst-actors.ts` | verified 结构 |
| `mammoth-cyst.initiativeCardCount = 2` | 同上 | verified 结构 |
| `shuffling-horror.requiredStance = 'aggressive'` | `shuffling-horror/registry.ts:SHUFFLING_HORROR_PROTOTYPE_ACTORS[horror].requiredStance` | verified 结构 |
| `shuffling-horror.initiativeCardCount = 2` | 同上 | verified 结构 |
| `ancestor-first-form.requiredStance = 'aggressive'` | `final-encounter/ancestor-first-form.ts` | verified 结构 |
| `ancestor-second-form.teleportD10Map` | `final-encounter/ancestor-second-form.ts` | verified 结构（d10 映射完整） |
| `gestating-heart.woundedReaction.blightTurns = 2-or-3` | `final-encounter/gestating-heart.ts` | verified 结构 |
| `gestating-heart.woundedReaction.healAmount = 2` | 同上 | verified 结构 |
| `heart-of-darkness.defeatTriggersCampaignVictory = true` | `final-encounter/heart-of-darkness.ts` | verified 结构 |
| `heart-of-darkness.impendingDoom.*` | 同上 | verified 结构（lifecycle） |
| Final Form order | `final-form-registry.ts:FINAL_FORM_ORDER` | verified（类型层锁） |

每个 `sourceReference: 'DD_EN_COREBOX_RULES.pdf:pXX'` 都已经写到对应 Definition（`OFFICIAL_DARKEST_DUNGEON_QUESTS` / `OFFICIAL_FINAL_FORMS` / `OFFICIAL_FINAL_ENCOUNTER_ROOM` / `OFFICIAL_GUARDIAN_ASSEMBLY`）。

---

## 4. 缺失的官方资料（Tier B / C）

### 4.1 Darkest Dungeon Quest Cards × 3

缺失：每张 Quest Card 的

- `name`（官方名称）
- `guardianDefinitionId`（指向哪个 Guardian）
- `skippedFinalFormId`（取消哪个 Final Form）
- `firewoodCount`（Firewood 数量）
- `provisionPolicyId.cardSpecific`（卡面特有的 provision policy）

**为什么不能推断**：硬约束 22 禁止从 prototype 数组 index 推 Quest→Guardian / Quest→Skipped Form 映射。实体桌游规则未公开三张 Quest Card 的具体对应关系。

### 4.2 Darkest Dungeon Dungeon Tiles × 2

缺失：`tileGeometry` + `bossSlotPositions`

规则书 p36 已确认「2 张 Tile 随机抽 1 张 + 3 个 Boss Slot」，但 tile 几何 / Boss Slot 位置 / Excavation Site 位置必须从 Tile 扫描补。

### 4.3 Templars

| 缺失资产 | 缺失字段 |
| --- | --- |
| `templar-impaler`（Battle Card） | maxHp / dodge / speed / resistances / accuracy / damage / crit / skillIds / d10SkillTable |
| `templar-warlord`（Battle Card） | 同上 |
| `templars-room`（Room Card） | areaIds / areaCapacities / spikedPitPositions / pitD10Map / pitEntryEffects / pitExitRule / victoryCondition |
| `templars-room-tile`（Tile） | tileGeometry |

### 4.4 Mammoth Cyst

| 缺失资产 | 缺失字段 |
| --- | --- |
| `mammoth-cyst`（Battle Card） | maxHp / dodge / speed / resistances / accuracy / damage / crit / skillIds / d10SkillTable |
| `white-cell-stalk`（Battle Card） | 同上 + teleportationD10Map |
| `mammoth-cyst-room`（Room Card） | areaIds / areaCapacities / victoryCondition |

### 4.5 Shuffling Horror

| 缺失资产 | 缺失字段 |
| --- | --- |
| `shuffling-horror`（Battle Card） | maxHp / dodge / speed / resistances / accuracy / damage / crit / skillIds / d10SkillTable |
| `cultist-priest`（Battle Card） | 同上 |
| `malignant-growth`（Battle Card） | 同上 |
| `shuffling-horror-room`（Room Card） | areaIds / areaCapacities / victoryCondition |

### 4.6 Final Encounter

| 缺失资产 | 缺失字段 |
| --- | --- |
| `ancestor-room`（Room Card） | areaIds / areaCapacities / roomEffects / formAreaPlacement |
| `ancestor-room-tile`（Tile） | tileGeometry |
| `ancestor-first-form`（Battle Card） | ancestor.maxHp / ancestor.skillIds |
| `perfect-reflection`（Card） | maxHp / skillIds |
| `imperfect-reflection`（Card） | maxHp / skillIds |
| `ancestor-second-form`（Battle Card） | ancestor.maxHp / ancestor.skillIds / absoluteNothingness.areaIds |
| `absolute-nothingness`（Card ×3） | 战斗卡字段 |
| `gestating-heart`（Battle Card） | maxHp / skillIds / d10SkillTable / lethalWoundTimingRuling |
| `heart-of-darkness`（Battle Card） | maxHp / skillIds / impendingDoomD10SkillMap |
| `come-unto-your-maker`（Card） | definition |
| `darkest-dungeon-monster-deck`（Component） | deckComposition / monsterDefinitionIds / drawPolicy |

### 4.7 特别警告

**绝对禁止**用以下来源填补 4.1-4.6 任何字段：

- Darkest Dungeon **电子游戏** Wiki / Fandom / Reddit / Steam
- `PROTOTYPE_FORM_HP.ancestor-first-form = 20` 等 prototype harness 数值
- 视觉估算 / 相邻 Boss 数据 / 另一版桌游
- AI 推测 / 自行编造 / 从 prototype 数组 index 推断 Quest→Guardian 映射
- **绝对禁止**从电子游戏 Darkest Dungeon 的 Come Unto Your Maker 机制照搬（dev doc §29、§45）

---

## 5. 为什么这些字段不能推断

| 字段 | 不可推断原因 |
| --- | --- |
| HP / Dodge / Speed / Resistance / Accuracy / Damage / Crit | 数值范围跨多版桌游，**没有可推算的公式**。三个 Templar Boss、Mammoth Cyst、Shuffling Horror、四个 Final Form 各自不同 |
| 完整 d10 Skill Table | d10 映射是卡面 / Room Card 决定，**没有规则**可以从 boss name 推 d10 table |
| Room geometry | Tile 几何由卡背 / 实体板件决定，**没有规则**可以从 boss name 推 area 数 |
| Spiked Pit d10 映射 | 完全由 Templars Room Card 决定（dev doc §7） |
| Pit 伤害 / 状态效果 / Pit Exit Rule | 完全由 Room Card 决定 |
| Quest→Guardian / Quest→Skipped Form 映射 | 实体桌游规则**没有公开**这个对应关系（dev doc §7 / §20） |
| Quest 名称 / Firewood 详情 | 卡面决定 |
| Impending Doom d10 → Skill 映射 | 完全由 Heart of Darkness 战斗卡 / Impending Doom 副卡决定 |
| Come Unto Your Maker | 独立卡面决定（**电子游戏的同名机制不能照搬**） |
| Darkest Dungeon Monster Deck 组成 | Gestating Heart Sispersion 抽牌源，无 source 不能定 deck |
| 致死 Wound 后 woundedReaction 是否触发 | 需要官方 errata / FAQ 权威 ruling |

---

## 6. 需要用户提供什么

完整列表见 [`docs/data/core-campaign/official-source-acquisition-checklist.md`](../../data/core-campaign/official-source-acquisition-checklist.md)。

最简形式：3 张 Quest Card + 7 张 Battle Card + 4 张 Room Card + 2 张 Dungeon Tile + Darkest Dungeon Monster Deck + Come Unto Your Maker 卡的扫描 / 照片 / 结构化 JSON。

提供方式：

1. **结构化 JSON**（推荐）：按 `docs/data/darkest-dungeon/official/` 目录组织，每个 JSON 含 `sourceReference` / `sourceAssetId` / `officialDataStatus: 'verified'`
2. **卡面扫描 / 照片**：Codex 抽取字段 + 写 field provenance（**不要主动 commit 图片进仓库**，dev doc §48）

---

## 7. WP-A / WP-B / WP-C / WP-J 已交付

### 7.1 WP-A — Source Manifest / Field Provenance / Readiness

- `docs/data/core-campaign/official-source-manifest.json` — 20 个资产清单（1 rulebook + 19 card/tile/deck）
- `docs/data/core-campaign/official-field-provenance.json` — 100+ 字段 provenance
- `docs/data/core-campaign/source-readiness.json` — 机器可读 6 个子 gate
- `docs/data/core-campaign/official-source-acquisition-checklist.md` — 人类可读 checklist

### 7.2 WP-B — Registry Convergence

- `src/data/darkest-dungeon/official-guardian-assembly.ts` — 新建。从 family-specific registry 组装三个 official Guardian。
- `src/data/darkest-dungeon/guardian-registry.ts:OFFICIAL_DARKEST_DUNGEON_GUARDIANS` — 改消费 `OFFICIAL_GUARDIAN_ASSEMBLY`，**禁止**手填 stub。
- `isDarkestDungeonOfficialGuardianPoolEnabled()` — 改调用 `isAllGuardianFamiliesReady()`，**禁止**只看 name / roomDefinitionId / actor IDs 三字段。
- `getDarkestDungeonGuardianDataGaps()` — 整合 `getAllGuardianFamilyGaps()` 真实根因。
- `shuffling-horror/registry.ts:isShufflingHorrorOfficialEncounterEnabled()` — **不再 hardcoded `return false`**，改为 `getShufflingHorrorOfficialReadiness().ready` 真实 source validator（6 项：source complete / official verified / room complete / battle cards complete / initiative policy valid / victory rule complete）。
- `getShufflingHorrorOfficialReadiness()` — 公开结构化 readiness 报告。

### 7.3 WP-C — Rulebook-Backed Partial Officialization

- `OFFICIAL_FINAL_FORMS[].sourceReference` — 每个 Form 写上 p40-41 verified 结构 provenance
- `OFFICIAL_FINAL_ENCOUNTER_ROOM.sourceReference` — p36 verified 结构 provenance
- `OFFICIAL_DARKEST_DUNGEON_QUESTS[].sourceReference` — 每张 Quest 写上 p35 verified 结构 provenance
- `OFFICIAL_GUARDIAN_ASSEMBLY[].sourceReference` — 每个 Guardian 写上对应页 verified 结构 provenance

状态保持 `unavailable` / `partial` + `enabledInOfficialPool = false`，**不**拷 prototype 数值（dev doc §18）。

### 7.4 WP-J — Release Gate 改造

- 修复 `run-audit.ts` 重复分支（`else if (!elevenQuestLoopClosed)` 两个，第二个不可达 → 删除）
- `threeGuardiansPass` / `threeSkippedFormsPass` — **不再 hardcoded false**，改由 `runGuardianMatrixAttempt()` 测量 evidence（基于 family validators）
- `fourRuinsBossesPass` — 明确**不**作为 11A.3 PASS 判定依据（dev doc §37 后半段）；字段保留以保持向后兼容
- 新增 `sourceReadiness` 字段（7 个子 gate：allRequiredSourcesReady / questCardsReady / templarsReady / mammothCystReady / shufflingHorrorReady / finalEncounterReady / darkestDungeonMonsterDeckReady）
- 新增 `globalMissingSourceReferences` / `officialPathMissingSourceReferences` 字段（P2-001 split，dev doc §42）
- 新增 `SOURCE-BLOCKED` 终态：source-readiness allReady=false + 仅 P0-002 缺口 → SOURCE-BLOCKED（dev doc §1 / §39 / §51）
- `canEnterPhase11A3` 语义：verdict ∈ {SOURCE-BLOCKED, CONDITIONAL} && onlyOpenP0 === 'ISSUE-P0-002' && openP1 === 0
- `content-manifest.ts:summarizeManifest` 新增 `globalMissingSourceReferences` + `officialPathMissingSourceReferences` 字段（按 OFFICIAL_PATH_CATEGORIES 过滤）
- 旧字段 `missingSourceReference` 保留为 `globalMissingSourceReferences` 别名（向后兼容）

---

## 8. 11A.2 Freeze Contract 维持

| 指标 | 状态 |
| --- | --- |
| `criticalE2EPasses = 6/6` | 维持 |
| `integrationPasses = 5/5` | 维持 |
| `replayDeterminismPasses` | 维持 |
| `replayContinuationPasses` | 维持 |
| `productionCommandLayerPasses` | 维持 |
| `openP1 = 0` | 维持 |
| `verificationFresh` | 维持 |
| `unmeasuredGateBits = []` | 维持 |
| `headlessShimFileExists = false` | 维持 |
| `simulationDriverShimImportCount = 0` | 维持 |
| Route Contract = 15/15 | 维持 |

`importSourceViolations` 维持 0。

---

## 9. False Green Guard 验证

| 检查项 | 状态 |
| --- | --- |
| `officialDataStatus='verified'` 但无 `sourceReference` | **0 处违规**（所有 verified 字段都从 rulebook p35-41 引用） |
| `enabledInOfficialPool=true` 但 validator incomplete | **0 处违规**（所有 official 字段 `enabledInOfficialPool=false`） |
| 把 prototype HP / damage / skill 复制进 official | **0 处违规**（OFFICIAL_* 字段全部为 null / [] / ''） |
| 用 prototype 数组 index 推 Quest mapping | **0 处违规**（OFFICIAL_DARKEST_DUNGEON_QUESTS.guardianDefinitionId = '' 全部空） |
| 用电子游戏补 Heart / Come Unto Your Maker | **0 处违规**（heart-of-darkness.comingUntoYourMaker = null） |
| 把 source-required 字段写成 0 / '' / guessed value 后标 verified | **0 处违规**（所有 partial 都带 sourceReference 注明「未补」） |
| P0-002 手工改 closed | **0 处违规**（ISSUE-P0-002 仍 open，issue-ledger.json 未改） |
| generic registry 与 family-specific registry 出现两套矛盾数据 | **0 处违规**（generic registry 现消费 `OFFICIAL_GUARDIAN_ASSEMBLY`，唯一组装入口） |
| Official Golden Run 出现 `prototype-*` ID | **0 处违规**（data gates 全部 closed，Official Golden Run 不可启动） |
| M15 通过 debug / scenario injection 直接设 victory | **0 处违规**（simulation driver 禁用 debug skip，硬约束 4） |
| `threeGuardiansPass` / `threeSkippedFormsPass` hardcode true | **0 处违规**（改为 measured evidence from family validators） |
| Source-BLOCKED 却生成 COMPLETE 报告 | **0 处违规**（生成的是 `phase-11a3-source-blocked-report.md`） |

---

## 10. 11A.2 E2E / Build / Typecheck 维持

11A.2 baseline 的所有 measured checks 必须在 Phase 11A.3 阶段**不退化**。具体验证步骤见 `docs/reports/phase-11a3/regression-notes.md`（与本报告一同生成）。

---

## 11. STOP

Phase 11A.3 在 SOURCE-BLOCKED 状态停止。

**不要**：

- 关闭 `ISSUE-P0-002`
- 启用 `officialGuardianPoolEnabled` / `officialFinalEncounterEnabled` / `officialDarkestDungeonQuestPoolEnabled` / `officialDarkestDungeonMonsterDeckEnabled`
- 创建 `Phase 11A.3.1` / `Phase 11A.3R` / 任何 sub-phase
- 手动把 `threeGuardiansPass` / `threeSkippedFormsPass` / `elevenQuestLoopClosed` / `campaignVictoryReachable` 改为 true
- 把 prototype HP / damage / skill 复制到 official
- 跳过 Source Gate

**需要**：用户补全 §4 列出的所有官方 Battle Card / Room Card / Dungeon Tile / Monster Deck 资料后，重跑 `npm run audit:content` + `npm run verify:phase11a2-3`，Source Gate 0 自然翻为 READY，verdict 才能从 SOURCE-BLOCKED 走到 CONDITIONAL → PASS。

**Phase 11B（UX / Onboarding / Accessibility / Full Product Playability）必须等 SOURCE-BLOCKED → COMPLETE 后才能进入。**
