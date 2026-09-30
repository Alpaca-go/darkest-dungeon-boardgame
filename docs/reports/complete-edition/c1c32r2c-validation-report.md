# C1C32R2C validation report

Production verdict: `C1C32R2C-RUINS-PRODUCTION-RUNTIME-DEPENDENCIES-NOT-CLOSED`.

## Focused and historical checks

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:necromancer-foundation` | PASS |
| `npm run test:necromancer-finalization` | PASS |
| `npm run test:necromancer-threat-bridge` | PASS |
| `npm run test:necromancer-threat-dependencies` | PASS |
| `npm run test:ruins-executable-dependencies` | PASS |
| `npm run test:ruins-production-runtime` | PASS |
| `verify:complete-edition-c1c29`, `c1c30`, `c1c31`, `c1c31r`, `c1c32`, `c1c32r`, `c1c32r2`, `c1c32r2a`, `c1c32r2b` | All PASS |
| `npm run test:ruins-production-executor` | PASS, 72/72 tests across 9 files; also preserved with JSON reporter |
| `npm run audit:complete-edition-c1c32r2c` | PASS; reports 3 blockers |
| `npm run verify:complete-edition-c1c32r2c` | NOT-CLOSED, exit 1; explicit production acceptance rejection |

Command logs and exit codes are preserved in `docs/data/complete-edition/c1c32r2c-regression-results.json` and `c1c32r2c-audit-results.json`. The focused JSON reporter result and test source hashes are linked from each refreshed proof artifact.

An intermediate historical R2A verifier rejected the modified frozen Large contract module. The auxiliary normal-character movement function was relocated into the new ordinary runtime; the frozen file was restored byte-for-byte. The final R2A verifier passes. Intermediate failing movement test fixtures were corrected to use legal printed Area capacity; final focused results contain no failures.

## Full regression

The initial full run had 2581/2584 passing tests. In addition to the two historical exceptions, A13 failed because the Room immunity integration moved its exact resistance mutation anchor. The integration now preserves the shared `applyEffectsWithResistance(target, effects)` call. A13 passes its real bypass detection, both in the isolated repair check and in the final full run.

Final full result: **2583/2585 tests and 167/169 files pass**, duration **665.83 seconds**, exit code **1**. The only failures are the unchanged C1C27/C1C28 `.gitattributes` scope rejections. Unexpected failures: **0**. The complete JSON result is `docs/data/complete-edition/c1c32r2c-full-test-results.json`; classification and exact failure identity evidence are recorded in `c1c32r2c-full-test-classification.json` and `tmp/c1c32r2c-full-vitest.log`.

The historical C1C27/C1C28 scope tests already failed at baseline on committed `.gitattributes`, as recorded by the R2B validation report (2511/2513 passing). Both tests and `.gitattributes` remain unchanged. No new expected failure was introduced. Audit-generated changes to two Core campaign `generatedAt` timestamps were inspected and restored; historical gameplay/evidence was not changed.

## Build

`npm run build` returns exit **1**. TypeScript passes and Vite successfully transforms **17,734 modules**. Output then fails at the same known Windows repeated CSS hash/path write boundary: `dist/assets/index-C-k7N9Cq-C-k7N9Cq-...css`, `ENOENT`. Duration before failure: **2m 19s**.

Classification: **`BUILD_ACCEPTANCE_UNVERIFIED` / `KNOWN_TOOLING_BLOCKER`**. The bundler was not changed in this phase. Exact output and command exit code are preserved in `tmp/c1c32r2c-build.log` and `docs/data/complete-edition/c1c32r2c-build-command.json`; classification is in `c1c32r2c-build-classification.json`.

## Acceptance limits

The passing matrix includes explicit blocked-case tests and conditional traversal. It is domain evidence, not successful execution of every source layout or reward. Production entry is gated by the three named dependencies. R3 and C1C33 remain unauthorized; no new browser product route or complete Boss navigation is claimed.
