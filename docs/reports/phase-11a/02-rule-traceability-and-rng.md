# Phase 11A — Rule Traceability / RNG 决定性 / 状态机迁移审计

> 由 `npm run audit:rules` 自动生成，请勿手改。

## 1. 规则追溯矩阵（P0）

- P0 规则总数：**15**
- implemented-and-tested：**7**
- implemented-not-tested：**5**
- data-missing：**3**
- implementation-missing：**0**
- **P0 全覆盖：❌ 否**

| 规则 ID | 域 | 状态 | 实现文件 | 测试 | 备注 |
| --- | --- | --- | --- | --- | --- |
| R-ACT-STRUCTURE | Campaign Structure | implemented-not-tested | `src/game-engine/campaign.ts`<br>`src/game-engine/campaign/campaign-progress.ts` | `tests/audit/content-manifest.test.ts`<br>`src/game-engine/campaign/campaign-progress.test.ts` | campaign-progress.ts 状态机存在但未被 finishQuest/selectQuest 调用（见 ISSUE-ACT-FLOW）。 |
| R-BOSS-FAIL-OVER | Fail Path | implemented-not-tested | `src/game-engine/campaign/act-four/guardian-quest.ts`<br>`src/store/useGameStore.ts` | `e2e/campaign-failure.spec.ts` | — |
| R-GUARDIAN-FAIL-OVER | Fail Path | implemented-not-tested | `src/game-engine/campaign/act-four/guardian-quest.ts` | `e2e/guardian-matrix.spec.ts` | — |
| R-FINAL-FAIL-OVER | Fail Path | implemented-not-tested | `src/game-engine/campaign/act-four/final-form-sequence.ts` | `e2e/final-form-matrix.spec.ts` | — |
| R-STAGECOACH-EXHAUSTION | Fail Path | implemented-and-tested | `src/game-engine/stagecoach.ts`<br>`src/game-engine/replacement.ts` | `src/game-engine/phase8d-replacement.test.ts`<br>`e2e/campaign-failure.spec.ts` | — |
| R-HEART-VICTORY | Victory | implemented-and-tested | `src/game-engine/campaign/act-four/transition-final-form.ts`<br>`src/game-engine/campaign/act-four/resolve-campaign-victory.ts` | `src/game-engine/campaign/act-four/final-forms.test.ts`<br>`e2e/phase10e-final-encounter.spec.ts` | — |
| R-ACT4-LEVEL | Campaign Structure | implemented-and-tested | `src/game-engine/campaign/campaign-progress.ts` | `src/game-engine/campaign/campaign-progress.test.ts` | campaignLevelForAct(4) === 3 由单测保证。 |
| R-FORM-SEQ | Final Encounter | implemented-and-tested | `src/game-engine/campaign/act-four/prepare-final-encounter.ts` | `src/game-engine/campaign/act-four/final-forms.test.ts` | — |
| R-PARTY-4 | Party | implemented-and-tested | `src/game-engine/campaign.ts`<br>`src/game-engine/replacement.ts` | `src/game-engine/phase2.test.ts`<br>`src/game-engine/phase8d-replacement.test.ts` | — |
| R-QUEST-RESULT | Dungeon | implemented-and-tested | `src/game-engine/quest-result.ts`<br>`src/game-engine/hamlet.ts` | `src/game-engine/phase4.test.ts` | — |
| R-OFFICIAL-GUARDIAN-DATA | Content | data-missing | `src/data/darkest-dungeon/guardian-registry.ts` | — | isDarkestDungeonOfficialGuardianPoolEnabled() === false；官方 Guardian 资料 unavailable。 |
| R-OFFICIAL-FINAL-DATA | Content | data-missing | `src/data/darkest-dungeon/final-form-registry.ts` | — | isFinalEncounterOfficialEnabled() === false；OFFICIAL_FINAL_FORMS 全 unavailable。 |
| R-OFFICIAL-CORE-CARDS | Content | data-missing | `src/data/heroes.ts`<br>`src/data/skills.ts`<br>`src/data/quests.ts`<br>`src/data/monsters.ts`<br>`src/data/rooms.ts` | — | 核心内容均无 sourceReference 字段，无法判定 verified。 |
| R-DETERMINISTIC-RNG | Engine | implemented-not-tested | `src/game-engine/random.ts`<br>`src/game-engine/campaign/act-four/rng.ts` | `tests/audit/rng-audit.test.ts` | createId() 在 random.ts:29 直接调用 Math.random()，golden-run 哈希漂移（见 ISSUE-RNG-DETERMINISM）。 |
| R-PROTOTYPE-ISOLATION | Content | implemented-and-tested | `src/audit/core-campaign/prototype-scan.ts` | `tests/audit/prototype-scan.test.ts` | — |

### 1.1 被阻断的 P0 规则

- `R-OFFICIAL-GUARDIAN-DATA`
- `R-OFFICIAL-FINAL-DATA`
- `R-OFFICIAL-CORE-CARDS`

## 2. RNG 决定性审计

- 全库 `Math.random()` 命中：**0**
- **官方路径（game-engine / data / store / components）`Math.random()` 泄漏：0**
- 时间源（`Date.now()` / `new Date()`）命中：**10**
- Definition Hash 稳定：**✅**
- 判定：**✅ PASS**

| file | line | code |
| --- | --- | --- |
| _(无)_ | | |



## 3. 状态机迁移合法性

- 合法迁移条目：**20**
- 非法迁移条目（负样本）：**12**
- 迁移表自洽：**✅**

### 3.1 合法迁移

| from | event | to |
| --- | --- | --- |
| `new-campaign` | `standard-quest-complete` | `act-1` |
| `act-1` | `standard-quest-complete` | `act-1` |
| `act-1` | `boss-quest-victory` | `act-2` |
| `act-2` | `standard-quest-complete` | `act-2` |
| `act-2` | `boss-quest-victory` | `act-3` |
| `act-3` | `standard-quest-complete` | `act-3` |
| `act-3` | `boss-quest-victory` | `post-third-threat-hamlet` |
| `post-third-threat-hamlet` | `darkest-dungeon-unlock` | `act-4-guardian` |
| `act-4-guardian` | `guardian-victory` | `final-hamlet` |
| `final-hamlet` | `final-hamlet-days-complete` | `final-encounter` |
| `final-encounter` | `form-defeated` | `final-encounter` |
| `final-encounter` | `heart-defeated` | `campaign-victory` |
| `act-1` | `boss-quest-failure` | `campaign-over` |
| `act-2` | `boss-quest-failure` | `campaign-over` |
| `act-3` | `boss-quest-failure` | `campaign-over` |
| `act-4-guardian` | `guardian-failure` | `campaign-over` |
| `final-encounter` | `party-wiped` | `campaign-over` |
| `act-1` | `stagecoach-exhausted` | `campaign-over` |
| `act-2` | `stagecoach-exhausted` | `campaign-over` |
| `act-3` | `stagecoach-exhausted` | `campaign-over` |

### 3.2 明确禁止的迁移

| from | event | to |
| --- | --- | --- |
| `act-1` | `boss-quest-failure` | `hamlet` |
| `act-2` | `boss-quest-failure` | `hamlet` |
| `act-3` | `boss-quest-failure` | `hamlet` |
| `act-4-guardian` | `guardian-failure` | `hamlet` |
| `final-encounter` | `party-wiped` | `hamlet` |
| `final-encounter` | `party-wiped` | `final-hamlet` |
| `final-hamlet` | `hamlet-event-draw` | `final-hamlet` |
| `final-encounter` | `dungeon-explore` | `final-encounter` |
| `final-encounter` | `skipped-form-redraw` | `final-encounter` |
| `campaign-victory` | `standard-quest-complete` | `act-1` |
| `post-third-threat-hamlet` | `threat-draw` | `post-third-threat-hamlet` |
| `post-third-threat-hamlet` | `standard-quest-grant` | `act-4-guardian` |
