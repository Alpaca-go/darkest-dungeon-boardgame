# C1C30 validation report

Final verdict: **C1C30-NECROMANCER-RUNTIME-FOUNDATION-PARTIAL-NOT-ACCEPTED**. C1C31 is not selected. Hard dependency gates and full production save/replay proof remain blocked.

Validation date: 2026-09-29 (Asia/Shanghai). Baseline: `4c01f006324b38f4233803bc34c4259cd69f4ced`.

| Check | Final result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | `c1c30-validation/typecheck-final.log` |
| `npm run test:necromancer-continuation` | PASS, 25/25 | `c1c30-validation/continuation-tests.log` |
| `npm run test:necromancer-foundation` | PASS, 72/72 | `c1c30-validation/foundation-tests.log` |
| `npm run verify:complete-edition-c1c29` | PASS | `c1c30-validation/c1c29-verifier-final.log` |
| `npm run verify:complete-edition-c1c30` | PASS for artifact/source/frozen-baseline verification; production acceptance BLOCKED | `c1c30-validation/c1c30-verifier.log` |
| Final full Vitest | 2,383 passed / 2,385 total; 151 passed files / 153 files; two expected historical scope conflicts; **0 unexpected failures** | `c1c30-validation/full-vitest-final.json`, `full-vitest-final.log` |
| Scoped browser E2E | One gate test passed, one full production path skipped due to dependency blockers | `c1c30-validation/e2e.log` |
| `npm run build` | Failed: existing Windows repeated CSS hash/path-length ENOENT; **BUILD_ACCEPTANCE_UNVERIFIED** | `c1c30-validation/build.log` |
| `git diff --check` | PASS | No whitespace diagnostics |

## Historical assertions

These exact tests are classified **EXPECTED_HISTORICAL_SCOPE_CONFLICT**:

1. `C1C27 authoritative source closure rejects gameplay, other-family, tooling and prior-phase changes` — `src/audit/c1c27-necromancer-source-closure.test.ts`.
2. `C1C28 canonical source and digital ruling separation C1C28 scope guard freezes gameplay, canonical history, other families and tooling` — `src/audit/c1c28-necromancer-project-rulings.test.ts`.

Both assert source-only workspace scope from their historical baselines and reject later-phase gameplay changes (the diagnostic starts at C1C29's `AGENTS.md`). They remain unchanged. Historical scope assertions are excluded from later-phase workspace acceptance; the raw suite still exits nonzero. All remaining tests pass. The C1C30 verifier independently freezes C1C20–29 evidence and the C1C29 core foundation/fixture/adapter against the exact requested baseline.

The final full suite was rerun after implementation and setup corrections. This is not a report based on the earlier incomplete run. The pre-existing untracked `src/.tmp-geom-check.test.ts` was included in the full run and passed; it was not edited. Full-suite source audit side effects changed only the `generatedAt` fields in two unrelated core-campaign artifacts; those test-generated timestamp changes were restored to the original tracked content.

## Setup correction and early run

The checkout initially contained only `main` and the new C1C30 branch. The frozen C1C29 verifier referenced missing `codex/phase-11a4-c1c28-necromancer-digital-rulings`, although its documented commit existed. The exact local reference was restored at `b6fa9180b44cd4a33f9fd4ceed97f179e64fbd0f`, and the requested C1C29 baseline reference was created at `4c01f006324b38f4233803bc34c4259cd69f4ced`. No historical code or assertion was altered. The final C1C29 verifier and its six audit tests pass.

An initial typecheck found `String.replaceAll` outside the repository's TypeScript target in the new audit script. It was replaced with the existing-compatible regular-expression form; no compiler configuration was changed. The final typecheck and the TypeScript stage of build pass. Earlier logs are retained for transparency but do not determine final acceptance.

## Browser scope and build classification

`test:e2e:necromancer-continuation` uses the existing production campaign/store/selector and dependency gate. It imports no foundation combat fixture and verifies that unresolved Bone/hero data cannot enter gameplay, including after reload. It passed in 59.7 seconds. The normal Room 10 → summon real Bone → kill/Reanimation → save/reload → cleanup scenario is explicitly skipped because no complete production Bone activation definition is available. This is **PRODUCT_DEPENDENCY_BLOCKED**, not `TEST_INFRA_FAILURE`, and not a successful production runtime E2E proof. No OOM, worker crash or navigation timeout occurred in this scoped run.

Build transformed 13,553 modules, then failed while writing the repeated `index-C6s6nAC9-...css` path under `dist/assets`. This reproduces the separate known Windows build tooling issue. It did not block the Vite dev server or scoped browser test. No Vite, Rollup, CSS or build configuration was changed and no build tooling workstream was started.

## Proof limits

The source-bound numeric/Skill review covers all four requested Bone identities but promotes zero executable definitions because Stance selection dependencies remain unresolved. Dodge bindings cover three Level I class/level pairs; missing pairs never default to zero. Tests verify independent hit/miss results from a shared attack roll and retain `SPAWN_DEFINITION_UNBOUND` without consuming a token.

Checkpoint, pending-Hero-choice and core replay tests pass under explicit unit isolation using standard campaign/BattleState/save helpers. They retain prototype Hero HP and do not include a successful real Bone turn. Their artifacts are marked outside production acceptance. Real Bone summon/reanimation, full incoming Trinket reaction replay, authoritative physical Room/card/tile cleanup and full production deterministic final-hash proofs remain blocked. The capability matrix and next-workstream decision preserve those limits.
