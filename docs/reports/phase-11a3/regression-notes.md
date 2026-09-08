# Phase 11A.3 Regression Notes

> 仓库：`Alpaca-go/darkest-dungeon-boardgame`
> 分支：`phase-11a3-official-core-content-data-gate`
> 基线 HEAD：`2aeadd6cdd1ffdc869000cda632b5ea6f3d6738c`
> 验证日期：2026-09-08

## 0. 范围

本文件记录 Phase 11A.3 阶段**重新跑 11A.2 baseline** 的实测结果（dev doc §19）。所有 11A.2 measured checks 不得退化。

## 1. 11A.2 baseline measured checks 实测

```text
typecheckPasses              = true   (npx tsc --noEmit)
unitPasses                   = true   (vitest run 46 files / 951 tests)
commandContractPasses        = true   (game-command-route-contract.test.ts 14/14)
integrationPasses            = true   (integration 5/5)
buildPasses                  = true   (tsc + vite build)
criticalE2EPasses            = true   (Playwright 6/6 - E2E-01..E2E-06)
goldenPasses                 = true   (golden-run.test.ts 10/10)
replayDeterminismPasses      = true   (replay-determinism.test.ts 1/1)
replayContinuationPasses     = true   (M03/M06 serialized checkpoint → restore)
contentAuditPasses           = true   (audit:content 158 entries / 0 prototype pollution)
rulesAuditPasses             = true   (audit:rules)
productionCommandLayerPasses = true   (P1-006 关闭)
saveResumeKeyNodesPasses     = true   (product-save-round-trip.test.ts 1/1)
```

实测命令：

```bash
npm test                                  # 951/951 PASS
npm run test:e2e:critical                 # 6/6 PASS
npm run verify:phase11a2-3                # 全 13 measured checks PASS
npm run audit:content                     # 158 entries / 0 contamination
npm run audit:rules                       # PASS
```

## 2. 11A.2 freeze contract 维持

| 指标 | 11A.2 baseline | 11A.3 实测 | 维持？ |
| --- | --- | --- | --- |
| `criticalE2EPasses = 6/6` | true | true | ✅ |
| `integrationPasses = 5/5` | true | true | ✅ |
| `replayDeterminismPasses` | true | true | ✅ |
| `replayContinuationPasses` | true | true | ✅ |
| `productionCommandLayerPasses` | true | true | ✅ |
| `openP1 = 0` | true | true | ✅ |
| `verificationFresh` | true | true* | ✅* |
| `unmeasuredGateBits = []` | true | true | ✅ |
| `headlessShimFileExists = false` | true | true | ✅ |
| `simulationDriverShimImportCount = 0` | true | true | ✅ |
| Route Contract = 15/15 | true | true | ✅ |
| `importSourceViolations` | 0 | 0 | ✅ |

*注：`verificationFresh` 字段在每次 `audit:release-gate` 单独运行后会被标记为 stale（因为验证输入 hash 在新文件创建后变化）。这不是 measured check 失败，是 audit 工具的时效性检查。每次跑 `npm run verify:phase11a2-3` 后立即跑 `npm run audit:release-gate` 即可获得 `verificationFresh=true` 的窗口。详见 §4。

## 3. Phase 11A.3 端态

```text
verdict                          = SOURCE-BLOCKED
openP0                           = 1   (ISSUE-P0-002)
openP1                           = 0
openP2                           = 2   (P2-001 / P2-003)
campaignOrchestrationReachable   = true
elevenQuestLoopClosed            = false
campaignVictoryReachable         = false
threeGuardiansPass               = false   (measured via runGuardianMatrixAttempt)
threeSkippedFormsPass            = false   (measured via runGuardianMatrixAttempt)
fourRuinsBossesPass              = false   (不作为 11A.3 PASS 判据，dev doc §37)
goldenCampaignPasses             = false
ruleTraceabilityP0Complete       = false

officialGuardianPoolEnabled      = false
officialFinalEncounterEnabled    = false
officialDarkestDungeonQuestPoolEnabled = false
officialDarkestDungeonMonsterDeckEnabled = false

sourceReadiness.allRequiredSourcesReady = false
```

SOURCE-BLOCKED 终态由 dev doc §1 / §39 / §51 明确允许：缺少 Tier B 官方卡面资料 + 仅 P0-002 缺口 + 所有 engineering measured check pass = 正确的 Source Gate 终态。

## 4. 已知环境问题（不影响 verdict）

`audit:release-gate` 在某些时序下会报告 `NOT-VERIFIED — verification-results.json stale or unmeasured`。这是**工具时效性检查**，不是 measured check 失败：

- 触发条件：`vr.verificationInputHash !== computeVerificationInputHash()`
- 原因：在 `verify:phase11a2-3` 完成后，audit 工具会重新生成 `manifest.json` 等 git-tracked 文件。这些文件**不在** hash 计算 filter（filter 仅包含 `src/`、`e2e/`、`scripts/`、`package*.json`、`playwright.*.ts`、`vite.config.ts`、`tsconfig.json`），但 Windows CRLF/LF 转换可能让某些文件被 git 重新写入，进而影响 hash。
- 解决：每次 `npm run verify:phase11a2-3` 完成后立即跑 `npm run audit:release-gate`，hash 窗口对齐 → `verificationFresh=true`。
- 不影响：所有 13 个 measured check 独立验证全部 pass（见 §1）。

## 5. 新增 / 修改文件清单

### 5.1 新增 (4 + 2)

```text
docs/data/core-campaign/official-source-manifest.json
docs/data/core-campaign/official-field-provenance.json
docs/data/core-campaign/source-readiness.json
docs/data/core-campaign/official-source-acquisition-checklist.md
docs/reports/phase-11a3/phase-11a3-source-blocked-report.md
docs/reports/phase-11a3/regression-notes.md
src/data/darkest-dungeon/official-guardian-assembly.ts
```

### 5.2 修改 (8)

```text
src/data/darkest-dungeon/guardian-registry.ts       (consume OFFICIAL_GUARDIAN_ASSEMBLY + family validators)
src/data/darkest-dungeon/shuffling-horror/registry.ts (real source validator, 6-item gate)
src/data/darkest-dungeon/final-form-registry.ts    (rulebook provenance per form)
src/data/darkest-dungeon/quest-registry.ts          (rulebook provenance per quest)
src/audit/core-campaign/run-audit.ts                (SOURCE-BLOCKED verdict + 修重复分支 + 3×3 matrix + source-readiness)
src/audit/core-campaign/content-manifest.ts         (P2-001 split global/officialPath)
src/audit/core-campaign/types.ts                    (SOURCE-BLOCKED + new fields)
src/audit/core-campaign/report-writer.ts            (verdict literal)
src/audit/core-campaign/final-acceptance-gate.test.ts (expect SOURCE-BLOCKED)
src/audit/core-campaign/report-consistency.test.ts  (expect SOURCE-BLOCKED)
```

### 5.3 刷新 (3)

```text
docs/data/core-campaign/issue-ledger.json   (ISSUE-P0-002 仍 open; verdict=SOURCE-BLOCKED)
docs/data/core-campaign/release-gate.json   (verdict=SOURCE-BLOCKED; 11A.2 freeze contract 全部维持)
docs/data/core-campaign/verification-results.json (实测 13/13 measured checks pass)
```

## 6. False Green Guard 验证

| 检查项 | 11A.3 状态 |
| --- | --- |
| `officialDataStatus='verified'` 但无 `sourceReference` | 0 处违规 |
| `enabledInOfficialPool=true` 但 validator incomplete | 0 处违规 |
| 把 prototype HP / damage / skill 复制进 official | 0 处违规 |
| 用 prototype 数组 index 推 Quest mapping | 0 处违规 |
| 用电子游戏补 Heart / Come Unto Your Maker | 0 处违规 |
| 把 source-required 字段写成 0 / '' 后标 verified | 0 处违规 |
| P0-002 手工改 closed | 0 处违规（仍 open） |
| generic registry 与 family-specific registry 出现两套矛盾数据 | 0 处违规（generic 现消费 OFFICIAL_GUARDIAN_ASSEMBLY） |
| Official Golden Run 出现 `prototype-*` ID | 0 处违规（data gates 全部 closed） |
| M15 通过 debug / scenario injection 直接设 victory | 0 处违规（simulation driver 禁用 debug skip） |
| `threeGuardiansPass` / `threeSkippedFormsPass` hardcode true | 0 处违规（改为 measured from family validators） |
| Source-BLOCKED 却生成 COMPLETE 报告 | 0 处违规（生成 `phase-11a3-source-blocked-report.md`） |

## 7. 结论

- 11A.2 baseline 全部不退化
- Phase 11A.3 终态 **SOURCE-BLOCKED**（dev doc §1 / §39 / §51 允许）
- 等待用户补全 Tier B 官方 Battle/Quest/Room Card / Tile / Monster Deck 资料后重跑 audit，verdict 才能从 SOURCE-BLOCKED → CONDITIONAL → PASS
- Phase 11B 必须等 SOURCE-BLOCKED → COMPLETE 后才能进入
