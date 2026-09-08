# Official Source Acquisition Checklist (Phase 11A.3 Source-Gate Final Acceptance)

> 单一真值：`src/audit/core-campaign/official-source-requirements.ts`
> 生成命令：`npm run audit:official-source`
> 关联产物：
> - `official-source-manifest.json`
> - `source-readiness.json`
> - `official-source-summary.json`
> - `official-source-acquisition-checklist.md`（本文件）

## 0. 原则

Source-Gated：所有 Darkest Dungeon Act IV 官方数据必须来自下列 tier。

| Tier | 来源 |
| --- | --- |
| A | `docs/DD_EN_COREBOX_RULES.pdf`（p35-41）|
| B | 官方 Battle / Quest / Room Card / Dungeon Tile / Monster Card |
| C | 官方勘误 / 数字资料 |

**禁止**：电子游戏 Wiki / Fandom / Prototype harness / 视觉估算 / AI 推测。

## 1. Darkest Dungeon Quest (3 张 Quest Card)

| requirementId | componentId | quantity | required | status | missing |
| --- | --- | --- | --- | --- | --- |
| tierB-quest-1 | darkest-dungeon-quest-1 | 1 | Y | missing | name, guardianDefinitionId, skippedFinalFormId, firewoodCount, provisionPolicyId.cardSpecific |
| tierB-quest-2 | darkest-dungeon-quest-2 | 1 | Y | missing | name, guardianDefinitionId, skippedFinalFormId, firewoodCount, provisionPolicyId.cardSpecific |
| tierB-quest-3 | darkest-dungeon-quest-3 | 1 | Y | missing | name, guardianDefinitionId, skippedFinalFormId, firewoodCount, provisionPolicyId.cardSpecific |

## 2. Darkest Dungeon Dungeon Tiles (2 张)

| requirementId | componentId | quantity | required | status | missing |
| --- | --- | --- | --- | --- | --- |
| tierB-dd-dungeon-tile | darkest-dungeon-dungeon-tile | 2 | Y | missing | tileGeometry, bossSlotPositions |

## 3. Templars (Battle Cards + Room Card + Tile)

| requirementId | componentId | quantity | required | status | missing |
| --- | --- | --- | --- | --- | --- |
| tierB-templars-impaler | templar-impaler | 1 | Y | missing | maxHp, dodge, speed, resistances, accuracy, damage, crit, skillIds, d10SkillTable |
| tierB-templars-warlord | templar-warlord | 1 | Y | missing | maxHp, dodge, speed, resistances, accuracy, damage, crit, skillIds, d10SkillTable |
| tierB-templars-room | templars-room | 1 | Y | missing | areaIds, areaCapacities, spikedPitPositions, pitD10Map, pitEntryEffects, pitExitRule, victoryCondition |
| tierB-templars-room-tile | templars-room-tile | 1 | Y | missing | tileGeometry |

## 4. Mammoth Cyst (Battle Cards + Room Card)

| requirementId | componentId | quantity | required | status | missing |
| --- | --- | --- | --- | --- | --- |
| tierB-mammoth-cyst | mammoth-cyst | 1 | Y | missing | maxHp, dodge, speed, resistances, accuracy, damage, crit, skillIds, d10SkillTable |
| tierB-white-cell-stalk | white-cell-stalk | 1 | Y | missing | maxHp, dodge, speed, resistances, accuracy, damage, crit, skillIds, d10SkillTable, teleportationD10Map |
| tierB-mammoth-cyst-room | mammoth-cyst-room | 1 | Y | missing | areaIds, areaCapacities, teleportationD10Map, spawnStancePolicy, spawnAreaPolicy, victoryCondition |

## 5. Shuffling Horror (Battle Cards + Room Card)

| requirementId | componentId | quantity | required | status | missing |
| --- | --- | --- | --- | --- | --- |
| tierB-shuffling-horror | shuffling-horror | 1 | Y | missing | maxHp, dodge, speed, resistances, accuracy, damage, crit, skillIds, d10SkillTable |
| tierB-cultist-priest | cultist-priest | 1 | Y | missing | maxHp, dodge, speed, resistances, accuracy, damage, crit, skillIds, d10SkillTable |
| tierB-malignant-growth | malignant-growth | 1 | Y | missing | maxHp, dodge, speed, resistances, accuracy, damage, crit, skillIds, d10SkillTable |
| tierB-shuffling-horror-room | shuffling-horror-room | 1 | Y | missing | areaIds, areaCapacities, victoryCondition |

## 6. Final Encounter (Room + Tile + 4 Form + Reflections + Absolute Nothingness + Come Unto Your Maker)

| requirementId | componentId | quantity | required | status | missing |
| --- | --- | --- | --- | --- | --- |
| tierB-ancestor-room | ancestor-room | 1 | Y | missing | areaIds, areaCapacities, roomEffects, formAreaPlacement |
| tierB-ancestor-room-tile | ancestor-room-tile | 1 | Y | missing | tileGeometry |
| tierB-ancestor-first-form | ancestor-first-form | 1 | Y | missing | ancestor.maxHp, ancestor.skillIds, perfectReflection.maxHp, perfectReflection.skillIds, imperfectReflection.maxHp, imperfectReflection.skillIds, timeHealsAll.effect, vacantStanceFillSource |
| tierB-perfect-reflection | perfect-reflection | 2 | Y | missing | maxHp, skillIds |
| tierB-imperfect-reflection | imperfect-reflection | 1 | Y | missing | maxHp, skillIds |
| tierB-ancestor-second-form | ancestor-second-form | 1 | Y | missing | ancestor.maxHp, ancestor.skillIds, absoluteNothingness.areaIds |
| tierB-absolute-nothingness | absolute-nothingness | 3 | Y | missing | stance, areaId |
| tierB-gestating-heart | gestating-heart | 1 | Y | missing | maxHp, skillIds, d10SkillTable, lethalWoundTimingRuling |
| tierB-heart-of-darkness | heart-of-darkness | 1 | Y | missing | maxHp, skillIds, impendingDoomD10SkillMap |
| tierB-come-unto-your-maker | come-unto-your-maker | 1 | Y | missing | definition |

## 7. Darkest Dungeon Monster Deck

| requirementId | componentId | quantity | required | status | missing |
| --- | --- | --- | --- | --- | --- |
| tierB-darkest-dungeon-monster-deck | darkest-dungeon-monster-deck | 1 | Y | missing | deckComposition, monsterDefinitionIds, drawPolicy |

## 8. Official Errata (optional)

| requirementId | componentId | quantity | required | status | missing |
| --- | --- | --- | --- | --- | --- |
| tierC-official-errata | official-errata | 1 | N | missing | — |

## 收到资料后

1. 把结构化 JSON 放到 `docs/data/darkest-dungeon/official/` 对应目录（schema 见 `src/audit/core-campaign/official-source-audit.ts:OfficialSourceDocument`）
2. 跑 `npm run audit:official-source`
3. 跑 `npm run verify:phase11a3-source-gate`
4. 跑 `npm run audit:release-gate`
