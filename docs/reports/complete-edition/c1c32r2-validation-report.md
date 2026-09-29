# C1C32R2 validation

Branch: `codex/phase-11a4-c1c32r2-necromancer-threat-dependency-contract-closure`.
Baseline: `35a42ac46ba97b07ed941bca078dc53fb5fab1bb`.
Dependency acceptance: **NOT-CLOSED**. A passing integrity check does not mean dependency closure.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS after fixing callback narrowing of the saved preparation rolls |
| `npm run test:necromancer-foundation` | PASS, 72 tests |
| `npm run test:necromancer-finalization` | PASS, 9 tests |
| `npm run test:necromancer-threat-bridge` | PASS, 16 tests |
| `npm run test:necromancer-threat-dependencies` | PASS, 22 tests |
| `npm run verify:complete-edition-c1c29` | PASS |
| `npm run verify:complete-edition-c1c30` | PASS |
| `npm run verify:complete-edition-c1c31` | PASS |
| `npm run verify:complete-edition-c1c31r` | PASS |
| `npm run verify:complete-edition-c1c32` | PASS |
| `npm run verify:complete-edition-c1c32r` | PASS |
| `npm run audit:complete-edition-c1c32r2` | PASS; generates NOT-CLOSED evidence and deterministic Graveyard command proofs |
| `npm run verify:complete-edition-c1c32r2` | PASS; evidence integrity only |
| `npx vite-node scripts/audit/verify-complete-edition-c1c32r2.ts --require-accepted` | Expected rejection; unresolved dependency gates prevent promotion |

Full regression command: `npx vitest run --maxWorkers=2 --minWorkers=2`.
Actual result: 2488 passed, 2 failed, 2490 total; 156 passed files and 2 failed files; duration 497.34 seconds. Exit code 1 is retained. The two failures are the accepted historical C1C27/C1C28 `AGENTS.md` scope guards. Unexpected failures: **0**.

That full run contained the earlier 20-test dependency suite. Two additional save/migration tests and selection-evidence hardening were subsequently checked in the final 22-test dedicated run, alongside the foundation/finalization/bridge checks and typecheck. The full-suite total is reported as actually observed; it is not inflated to include tests added later.

Generated timestamps in two historical core-campaign manifests were restored only after comparing all other parsed fields with HEAD and confirming exact equality. Frozen C1C20–C1C32R JSON hashes are checked by the new verifier. Source PDFs and existing user scratch files are not part of the task changes.

The 22 dedicated checks exercise physical copy accounting, source blockers, no prototype leakage, Room/tile identity and Room 10 exclusion, draw specification boundaries, generic Large movement/versioning, displacement candidate serialization, actual campaign save/reload, illegal displacement and migration rejection, Graveyard eligibility/idempotence/lifecycle/death and source-bound Virtue effects. Ordinary production draw and full Room geometry are explicitly unproven; these tests do not certify them.

Browser acceptance was not rerun or weakened. The existing production sentinel remains `PRODUCT_FAILURE`. Scenario C remains `NOT_PROVEN`, combat hashes null. No guarded ordinary production Threat Battle is claimed.

`npm run build`: TypeScript passed and Vite transformed **15,700 modules**, then failed while writing the CSS asset with repeated `C6s6nAC9` hashes in its Windows path. Exit code 1. This matches the known repeated CSS hash/path-length `ENOENT` tooling blocker. Status: **BUILD_ACCEPTANCE_UNVERIFIED / KNOWN_TOOLING_BLOCKER**. No bundler configuration changes were made.
