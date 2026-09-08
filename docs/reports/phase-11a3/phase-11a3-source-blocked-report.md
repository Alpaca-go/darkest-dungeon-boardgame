# Phase 11A.3 — Source-Blocked Report (v2)

> 仓库：`Alpaca-go/darkest-dungeon-boardgame`
> 分支：`phase-11a3-source-gate-integrity-repair`
> 上一轮基线：`5fb1bf4` (phase-11a3-official-core-content-data-gate)
> 报告日期：2026-09-08

> **Report Truth Contract (Phase 11A.3 Source-Gate Integrity Repair §35-37)**：
> 本报告只读 5 个 final 产物。生成前做 consistency check。
> ```
> final verification-results.json
> final release-gate.json
> final source-readiness.json
> final official-source-summary.json
> final issue-ledger.json
> ```
> **不**重新自己计算另一套结论。

---

## 0. 终态

| 字段 | 值 | 来源 |
| --- | --- | --- |
| **Engineering Regression** | PASS | `verification-results.json` |
| **Source Audit** | PASS | `official-source-summary.json` |
| **Source Missing** | YES | `source-readiness.json.gates.allRequiredSourcesReady === false` |
| **Formal Release Gate** | **SOURCE-BLOCKED** | `release-gate.json.verdict` |
| `phase11A3Status` | **SOURCE-BLOCKED** | `release-gate.json.phase11A3Status` |
| `canCloseP0_002` | false | `release-gate.json.canCloseP0_002` |
| `canEnterPhase11B` | false | `release-gate.json.canEnterPhase11B` |
| `goldenTestPasses` | true | `release-gate.json.goldenTestPasses` |
| `productionCommandLayerPasses` | true | `release-gate.json.productionCommandLayerPasses` |
| `unmeasuredGateBits` | [] | `release-gate.json.unmeasuredGateBits` |
| `verificationFresh` | true | `release-gate.json` derived from `verification-results.json.verificationFresh && hash match` |
| `openP0` | 1 | `issue-ledger.json.openP0` |
| `openP1` | 0 | `issue-ledger.json.openP1` |
| `onlyOpenP0` | ISSUE-P0-002 | `release-gate.json.onlyOpenP0` |
| `officialActFourMissingSourceReferences` | 10 | `release-gate.json.officialActFourMissingSourceReferences` |

> **结论**：Source-Gate Verified 终态。Phase 11A.3 工程闭环（engineering regression = PASS + Source Audit = PASS），资料缺失（source missing = YES），因此 verdict = SOURCE-BLOCKED。等待用户补 Tier B/C 官方资料。

---

## 1. 11A.2 Freeze Contract 维持

| 指标 | 状态 |
| --- | --- |
| `typecheckPasses` | true |
| `unitPasses` | true |
| `commandContractPasses` | true |
| `integrationPasses` | true |
| `buildPasses` | true |
| `criticalE2EPasses` | true (6/6) |
| `goldenTestPasses` | true（11A.3 canonical field；verify-phase11a2-3 同时写 legacy alias `goldenPasses`） |
| `replayDeterminismPasses` | true |
| `replayContinuationPasses` | true |
| `productionCommandLayerPasses` | true |
| `openP1` | 0 |
| `headlessShimFileExists` | false |
| `simulationDriverShimImportCount` | 0 |
| Route Contract | 15/15 |
| `importSourceViolations` | 0 |

---

## 2. Source Manifest / Checklist / Summary 一致性

**Source Truth 单一入口**（dev doc §11）：

| 产物 | 路径 | 生成命令 |
| --- | --- | --- |
| Canonical Requirements | `src/audit/core-campaign/official-source-requirements.ts` | 手工维护（unique source of truth） |
| Manifest | `docs/data/core-campaign/official-source-manifest.json` | `npm run audit:official-source` |
| Checklist | `docs/data/core-campaign/official-source-acquisition-checklist.md` | 同上 |
| Source Readiness | `docs/data/core-campaign/source-readiness.json` | 同上 |
| Summary | `docs/data/core-campaign/official-source-summary.json` | 同上 |

```text
total requirements   : 28
Tier A (rulebook)    : 1 (available)
Tier B (cards/tile)  : 26 (全部 missing)
Tier C (errata)      : 1 (optional, missing)
available            : 1
partial              : 0
missing              : 27
auditPasses          : true
outcome              : source-blocked
allRequiredSourcesReady : false
```

**Consistency check（dev doc §36）**：

```text
manifest.summary.totalRequirements === summary.totalRequirements  ✓
source-readiness.gates.* === release-gate.sourceReadiness.*  ✓（6 子 gate 全部对齐）
release-gate.verdict === phase11A3Status  ✓
issue-ledger.openP0 === release-gate.openP0  ✓
consistencyErrors = []
```

---

## 3. Field Provenance（机器真值）

字段级 provenance 来源 `docs/data/core-campaign/official-field-provenance.json`：
- Tier A（规则书 p35-41）：所有 structural fields verified
- Tier B/C（卡面 / Room / Tile / Monster Deck）：27 个 requirement 全部 source-required

详见 `official-field-provenance.json` 100+ 字段。

---

## 4. 已成功 officialized 的 partial fields

按 dev doc §17（rulebook-backed partial officialization）：

| 字段 | rulebook source | 状态 |
| --- | --- | --- |
| `OFFICIAL_DARKEST_DUNGEON_QUESTS[].roomCount = 16` | p35 | partial |
| `OFFICIAL_DARKEST_DUNGEON_QUESTS[].xpReward = 3` | p35 | partial |
| `OFFICIAL_DARKEST_DUNGEON_QUESTS[].questType = 'darkest-dungeon-guardian'` | p35 | partial |
| `OFFICIAL_DARKEST_DUNGEON_QUESTS[].sourceReference = 'DD_EN_COREBOX_RULES.pdf:p35'` | p35 | partial |
| `OFFICIAL_FINAL_FORMS[].sourceReference` | p40-41（per form） | partial |
| `OFFICIAL_FINAL_ENCOUNTER_ROOM.sourceReference` | p36 | partial |
| `OFFICIAL_GUARDIAN_ASSEMBLY[].sourceReference` | p39-40（per family） | partial |

状态保持 `unavailable` / `partial` + `enabledInOfficialPool = false`（**不**拷 prototype 数值，dev doc §18）。

---

## 5. Family Validators 状态

| Family | Validator Ready | Reason |
| --- | --- | --- |
| Templars | false | `validateTemplarsGuardian('formal').isComplete === false`（Battle Cards / Room Card / Pit Map 缺） |
| Mammoth Cyst | false | `validateMammothCystGuardian('formal').isComplete === false`（Cyst / Stalk Battle Card / Teleport Map / Room 缺） |
| Shuffling Horror | false | `getShufflingHorrorOfficialReadiness().ready === false`（Horror / Priest / Growth Battle Card / Room 缺） |

**关键修复**（dev doc §19, Finding D）：assembly 现在 `enabledInOfficialPool = ready`（当 data complete 时自动 enable），不再永久 false。Synthetic contract test 在 `src/testing/contracts/official-guardian-assembly-contract.test.ts` 保证未来 source 补完后 Pool 能自动打开。

---

## 6. Guardian Matrix 状态

dev doc §22-25：matrix 真实状态显式表达，**不**伪称 3×3 pass。

```text
status                              : SOURCE-BLOCKED
officialGuardianMatrixStatus        : SOURCE-BLOCKED
officialSkippedFormMatrixStatus     : SOURCE-BLOCKED
threeGuardiansPass                  : false（formal 3×3 未跑，资料缺失）
threeSkippedFormsPass               : false
prototypeMatrix.threeGuardiansPass  : false（保留为辅助信号，不作为 PASS 判据）
prototypeMatrix.threeSkippedFormsPass : false
details[9]                         : 全部 passed=false, note='SOURCE-BLOCKED: formal matrix not run'
```

未来 source 齐备后：
- `isTemplarsOfficialEncounterEnabled()` / `isMammothCystOfficialEncounterEnabled()` / `isShufflingHorrorOfficialEncounterEnabled()` 全部 true → family validator data complete
- 真正跑 9 个 formal 组合（Quest → Guardian → Skipped Form → Final Encounter）→ matrix status = READY
- threeGuardiansPass / threeSkippedFormsPass 才会从 measured evidence 推导为 true

---

## 7. Provenance Scope

dev doc §27-29：Act IV scope 来自 canonical source requirements，**不**依赖 category allowlist。

```text
globalMissingSourceReferences               : 147（保留 P2-001 旧语义）
officialActFourMissingSourceReferences    : 10（Act IV scope，仅 Phase 11A.3 关心的 quest / guardian / finalForm）
officialPathMissingSourceReferences       : 147（legacy 字段；与 11A.3 上一轮契约兼容）
```

`officialActFourMissingSourceReferences` 是 Phase 11A.3 PASS 硬门槛。当前 = 10（资料齐备后 = 0）。

---

## 8. Phase 11A.3 状态机

dev doc §31-33：phase11A3Status 5 态：

```text
NOT-VERIFIED              = 任何 NOT-VERIFIED verdict 或 audit pipeline 自身未跑
SOURCE-BLOCKED            = SOURCE-BLOCKED verdict + onlyOpenP0 === ISSUE-P0-002
READY-FOR-OFFICIAL-IMPORT = source 全部 ready + 11 Quest 没闭环
IMPLEMENTATION-FAIL       = any FAIL（11A.3 阶段 implementation 自身错）
COMPLETE                  = PASS verdict
```

当前：`phase11A3Status = SOURCE-BLOCKED`

---

## 9. False Green Guard 验证

| 检查项 | 状态 |
| --- | --- |
| `officialDataStatus='verified'` 但无 `sourceReference` | 0 处违规 |
| `enabledInOfficialPool=true` 但 validator incomplete | 0 处违规（fix Finding D：assembly `enabledInOfficialPool = ready`） |
| prototype HP / damage / skill 复制到 official | 0 处违规 |
| prototype 数组 index 推 Quest mapping | 0 处违规 |
| 电子游戏补 Heart / Come Unto Your Maker | 0 处违规 |
| source-required 字段填 0 / '' 后标 verified | 0 处违规 |
| P0-002 手工改 closed | 0 处违规（仍 open） |
| generic registry 与 family registry 两套数据 | 0 处违规（fix Finding A：generic registry 现消费 OFFICIAL_GUARDIAN_ASSEMBLY） |
| Official Golden Run 出现 `prototype-*` ID | 0 处违规（data gates 全部 closed） |
| M15 debug victory | 0 处违规（simulation driver 禁用 debug skip） |
| `threeGuardiansPass` / `threeSkippedFormsPass` hardcode true | 0 处违规（fix Finding E：matrix 改 SOURCE-BLOCKED status，不再伪称 pass） |
| `fourRuinsBossesPass` hardcode | 0 处违规（明确从 11A.3 PASS 判定中移除） |
| `runGuardianMatrixAttempt` 伪称实测 3×3 | 0 处违规（fix Finding E：明确 SOURCE-BLOCKED 状态） |
| `source-readiness` 缺失默认真相 = SOURCE-BLOCKED | 0 处违规（fix Finding C：改为派生 audit，缺失 / 损坏 → NOT-VERIFIED / SOURCE-AUDIT-ERROR） |
| Manifest / Checklist 数量不一致 | 0 处违规（fix Finding B：全部从 canonical requirements 派生） |
| Manifest 17 / available=0 vs rulebook available | 0 处违规（fix Finding B：tier 显式分开统计） |
| `officialPathMissingSourceReferences` 混入 121 条 unrelated | 0 处违规（fix Finding F：新增 `officialActFourMissingSourceReferences`，scope 来自 requirements） |
| Guardian Assembly 永远 `enabledInOfficialPool=false` | 0 处违规（fix Finding D：assembly `enabledInOfficialPool = ready`） |
| Report 声称 machine-generated 但没有 generator | 0 处违规（fix Finding I：新增 `audit:official-source` + `verify:phase11a3-source-gate`） |
| Report 与 Formal Gate verdict 不一致 | 0 处违规（fix Finding H：Report 只读 5 final 产物 + 一致性 check） |
| `goldenPasses` / `goldenTestPasses` schema 不匹配 | 0 处违规（fix Finding A：verify 写 canonical 字段 goldenTestPasses，release-gate 读该字段） |

---

## 10. Issue Ledger

| ID | severity | status | title |
| --- | --- | --- | --- |
| `ISSUE-P0-002` | P0 | **open** | Act IV 官方卡面数据缺失，官方池被 Data Gate 关闭 |
| `ISSUE-P2-001` | P2 | open | 全局内容条目缺少 sourceReference（已拆分 global / officialPath） |
| `ISSUE-P2-003` | P2 | open | HamletState 未保存「本段总准备天数」（dev doc §4：默认不处理） |

`openP0 = 1, openP1 = 0, onlyOpenP0 = ISSUE-P0-002`。

---

## 11. 已知环境问题

`audit:release-gate` 与 `verify:phase11a3-source-gate` 之间若再修改 `src/` / `scripts/` / `package.json` 等 git-tracked 文件，input hash 漂移 → `verificationFresh = false` → `verdict = NOT-VERIFIED`（"verification-results.json stale"）。

**这是工具时效性检查**，不是 measured check 失败。正确做法：每次 `npm run verify:phase11a3-source-gate` 完成后立即跑 `npm run audit:release-gate`，input hash 窗口对齐 → `verificationFresh = true` → `verdict = SOURCE-BLOCKED`（terminal）。

---

## 12. 提交计划

```text
phase-11a3-source-gate-integrity-repair

Commit 1: audit(source): add canonical official source requirements and generator
Commit 2: fix(audit): make source-blocked a verified derived state
Commit 3: fix(act4): make guardian assembly future-ready and separate matrix evidence
Commit 4: audit(content): scope provenance gate to official Act IV
Commit 5: audit(phase11a3): add self-contained source-gate verification
```

---

## 13. STOP

**Phase 11A.3 Source-Gate Infrastructure = Accepted**
**Phase 11A.3 Status = SOURCE-BLOCKED**

本修复包完成后停止。等待独立远程审计。

通过后：等待用户提供 Tier B/C official source assets。
不要进入 11A.3 Official Data Import、11B、11A.3.1、11A.3R。
