# C1C29 Validation Report

日期：2026-09-29。分支：`codex/phase-11a4-c1c29-necromancer-runtime-foundation`。
最终结论：**部分完成，未通过 C1C29 foundation 验收；Production Ready 0/9。**

| 检查 | 结果 | 证明边界 |
| --- | --- | --- |
| `npm run typecheck` | PASS | 修复新增 ActiveThreatRuntime 测试夹具的 consumedOnceKeys 后完成 |
| `npm run test:necromancer-foundation` | PASS，3 files / 72 tests | 60 foundation、6 command/save、6 audit；显式合成 combat dependencies |
| 受影响既有 regression | PASS，10 files / 194 tests | phase2/3/4/5、phase8d-save、campaign-orchestrator、runtime-sources、旧 necromancer、incoming-attack、product-save-round-trip |
| `npm run audit:complete-edition-c1c29` | PASS | 从真实 executor 重新生成 evidence |
| `npm run verify:complete-edition-c1c29` | PASS | 重算 traces 与 replay hashes；验证 C1C20–28 JSON 相对冻结基线无改动 |
| C1C27/28 冻结语义 audit | PASS，61 passed / 2 skipped | 仅排除两个历史工作区 phase scope guard；未修改历史测试 |
| 全量 Vitest | FAIL，2354 total / 2351 passed / 3 failed | 两个历史 phase scope guard 与一次并行编辑期间的 stale evidence；详见下文 |
| `npm run build` | FAIL | TypeScript 阶段通过，Vite transform 13016 modules；已知 Windows 重复 CSS hash/path length ENOENT |
| scoped browser E2E | 未验证成功 | 第一次 page navigation timeout；调整 waitUntil 后独立重试 worker code 134 / V8 Zone Allocation OOM |

Focused suite 覆盖三个 Level setup、共享攻击骰/多目标召唤门控、Self Push、有限 supply、
placement rollback/no-space、Captain 独立路径、Reanimation fresh identity、同时死亡/嵌套锁/必需死亡效果顺序、
Boss death 优先级、幂等 cleanup、真实 campaign progression，以及存档版本/definition tamper 拒绝。
四类 tie（Hero、Area、death、placement）从相同初态和输入重放，与 pending-save reload 后的最终完整状态 SHA-256 相同。

受影响既有 regression 命令：

```text
npx vitest run src/game-engine/phase2.test.ts src/game-engine/phase3.test.ts src/game-engine/phase4.test.ts src/game-engine/phase5.test.ts src/game-engine/phase8d-save.test.ts src/game-engine/campaign/campaign-orchestrator.test.ts src/game-engine/runtime-sources.test.ts src/game-engine/necromancer/necromancer.test.ts src/game-engine/c1c8-incoming-attack.test.ts src/audit/core-campaign/product-save-round-trip.test.ts --maxWorkers=3 --minWorkers=1
```

## 全量测试失败的处理

运行 `npx vitest run --maxWorkers=3 --minWorkers=1 --reporter=json --outputFile=tmp/c1c29-vitest-results.json`，结果为 2351 PASS / 3 FAIL。
C1C27 的 `rejects gameplay, other-family, tooling and prior-phase changes` 和 C1C28 的
`scope guard freezes gameplay, canonical history, other families and tooling` 是过去 source-only phase 的工作区范围门禁，
会拒绝本次授权的新 runtime 修改；保留这些历史测试，未放宽它们来制造全绿。
第三个失败是 C1C29 evidence 在源文件和 artifact 仍并行更新时的内容不一致；
文件稳定后重新生成，最终 focused audit 和 verify 都通过。全量 suite 未在最终状态再次运行，不能声称全量 PASS。

另外运行 C1C27/28 的冻结语义 audit，使用 `--testNamePattern '^(?!.*(?:rejects gameplay, other-family|scope guard)).*$'`
仅排除上述两个历史范围断言，结果 61 PASS / 2 SKIPPED。其余 source/ruling 语义检查全部通过。

全量 audit 曾仅更新时间戳的两个 core-campaign manifest，检查 diff 后恢复了这两个非任务改动。
未删除或覆盖原有 untracked 临时文件。

## 构建与浏览器限制

build 重现 `dist/assets/index-C6s6nAC9-...css` 中反复追加 hash 导致的 Windows ENOENT。
按任务要求不修改 bundler；该问题留给独立 build-tooling workstream。

新增 `e2e/c1c29-necromancer-foundation.spec.ts` 使用真实 Store/UI/save/engine 和显式合成依赖，
计划验证最低 roll choice、Reanimation choice、Skill Area choice、召唤、reload、victory/cleanup。
第一次导航超时；将导航/reload 调整为 domcontentloaded 后，独立重试因 worker 内存分配失败退出。
没有浏览器成功 evidence，不推定 UI、scoped production path 或正式 selector 已验收。
未重跑历史 E2E，也未声称修复既有历史 E2E 缺陷。

## 后续门禁

数值 Bone/Hero dependency 与剩余 engine/Room bridges 仍需完成；browser proof 和 build acceptance 未解决。
决策为 `NECROMANCER_RUNTIME_FOUNDATION_CONTINUATION`，不是 integration selected 或 recommended accepted verdict。
继续使用锁定正式资料和显式 ruling review；不获取新的外部规则解释。
