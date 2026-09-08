# Phase 11A — Core Campaign Content Manifest / 内容审计

> 由 `npm run audit:content` 自动生成，请勿手改。
> Manifest Hash: `469d91eb`

## 1. 总览

- 内容条目总数：**158**
- 官方就绪（official-ready）：**1**
- 被阻断（blocked）：**10**
- prototype 状态条目：**30**
- 官方资料 unavailable：**10**
- 缺少 `sourceReference`：**157 / 158**

### 1.1 四态分布

| officialDataStatus | 数量 |
| --- | --- |
| partial | 117 |
| prototype | 30 |
| verified | 1 |
| unavailable | 10 |

| runtimeReadiness | 数量 |
| --- | --- |
| framework-only | 147 |
| official-ready | 1 |
| blocked | 10 |

## 2. 分类明细

| category | 合计 | verified | partial | prototype | unavailable | official-ready | framework-only | blocked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quirks | 35 | 0 | 35 | 0 | 0 | 0 | 35 | 0 |
| heroSkills | 28 | 0 | 28 | 0 | 0 | 0 | 28 | 0 |
| diseases | 11 | 0 | 11 | 0 | 0 | 0 | 11 | 0 |
| heroes | 8 | 0 | 8 | 0 | 0 | 0 | 8 | 0 |
| finalForms | 8 | 0 | 0 | 4 | 4 | 0 | 4 | 4 |
| threats | 7 | 0 | 0 | 7 | 0 | 0 | 7 | 0 |
| bosses | 7 | 0 | 0 | 7 | 0 | 0 | 7 | 0 |
| trinkets | 7 | 1 | 0 | 6 | 0 | 1 | 6 | 0 |
| rooms | 6 | 0 | 6 | 0 | 0 | 0 | 6 | 0 |
| darkestDungeonQuests | 6 | 0 | 0 | 3 | 3 | 0 | 3 | 3 |
| guardians | 6 | 0 | 0 | 3 | 3 | 0 | 3 | 3 |
| afflictions | 5 | 0 | 5 | 0 | 0 | 0 | 5 | 0 |
| virtues | 5 | 0 | 5 | 0 | 0 | 0 | 5 | 0 |
| buildings | 5 | 0 | 5 | 0 | 0 | 0 | 5 | 0 |
| curios | 4 | 0 | 4 | 0 | 0 | 0 | 4 | 0 |
| quests | 3 | 0 | 3 | 0 | 0 | 0 | 3 | 0 |
| monsters | 3 | 0 | 3 | 0 | 0 | 0 | 3 | 0 |
| hamletEvents | 3 | 0 | 3 | 0 | 0 | 0 | 3 | 0 |
| provisions | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 0 |

> ⚠️ 以下分类在当前代码库中**没有任何实现条目**（spec §6 要求的槽位存在但内容为空）：
> `roomTiles`、`lootChests`、`buildingUpgrades`


## 3. Prototype 污染扫描

官方路径 prototype 引用数：**0**

| surface | id | detail |
| --- | --- | --- |
| _(无)_ | | |

## 4. 引用完整性校验

- error：**0**
- warning：**0**

| severity | code | message |
| --- | --- | --- |
| _(无)_ | | |


## 5. Golden Seed 矩阵

- 可运行：**2**
- 被阻断：**11**

| seedId | mode | expectedOutcome | runnable | blockedReason |
| --- | --- | --- | --- | --- |
| golden-normal-success-01 | normal | campaign-victory | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-save-resume-01 | save-resume | campaign-victory | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-hero-death-replacement-01 | hero-death | campaign-victory | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-stagecoach-exhaustion-01 | stagecoach-exhaustion | campaign-over | ✅ | — |
| golden-boss-failure-01 | boss-failure | campaign-over | ✅ | — |
| golden-guardian-failure-01 | guardian-failure | campaign-over | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-final-failure-01 | final-failure | campaign-over | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-templars-guardian | guardian | campaign-victory | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-mammoth-cyst-guardian | guardian | campaign-victory | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-shuffling-horror-guardian | guardian | campaign-victory | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-skip-ancestor-first | skipped-form | campaign-victory | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-skip-ancestor-second | skipped-form | campaign-victory | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |
| golden-skip-gestating-heart | skipped-form | campaign-victory | ❌ | ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked |

## 6. 结论

有 1 条内容达到 official-ready。

Act IV（Guardian / Final Encounter / Darkest Dungeon Quest）的官方卡面数据为 `unavailable`，
由 Data Gate 主动关闭官方池，**属设计内行为**，不得猜测补全（硬约束 22）。
