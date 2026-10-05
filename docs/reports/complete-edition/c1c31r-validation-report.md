# C1C31R validation report

Verdict: **C1C31-HERO-DODGE-EXPLICIT-TABLE-REVIEW-ACCEPTED**. The known Hero Dodge rule blocker is closed; Necromancer foundation and production integration are not accepted.

Validation date: 2026-09-29, Asia/Shanghai. Baseline: `02d18d00ece61c9136ac0821ee5ce30ada038191`.

| Check | Result | Evidence under `c1c31r-validation/` |
| --- | --- | --- |
| `npm run typecheck` | PASS | `typecheck.log` |
| `npm run test:hero-dodge-review` | PASS, 50/50 | `dodge-review-tests.log` |
| Existing save/replay/incoming/v1 foundation regression selection | PASS, 131/131 across 10 files | `save-replay-regressions.log` |
| `npm run verify:complete-edition-c1c31r` | PASS | `verifier.log` |
| C1C31 and C1C29 preservation verifiers | PASS | `c1c31-verifier.log`, `c1c29-verifier.log` |
| Full Vitest | 2443/2445 PASS; 2 EXPECTED_HISTORICAL_SCOPE_CONFLICT, raw exit 1 | `full-vitest.json`, `full-vitest.log` |
| `git diff --check` | PASS | No whitespace diagnostics |

The 50 new tests cover 24 unique pairs, exact values, official authority preservation and no project override, 21 unique ruling IDs with noncanonical unresolved status and risk metadata, v2 inheritance, v1 isolation, unknown input failures, three candidate comparisons, exact d10 probability/critical arithmetic, explicit pre-encounter migration, Battle/checkpoint rejection, no RNG/progression mutation, idempotent migration, legacy load preservation, mixed v1/v2 recorded replay pins and deterministic real SaveFile roundtrip. Tampered binding/value/authority/source/ruling/version or duplicated pair is rejected during validation and direct restoration.

The full suite completed with 2445 tests: 2443 passed, 2 failed, 0 skipped. Both failures are the unchanged C1C27/C1C28 scope guards, which reject later-phase workspace changes from their historical baselines (`scope violation: AGENTS…`). The raw command exited 1; it is not reported as a green full-suite run. These exact failures are classified as **EXPECTED_HISTORICAL_SCOPE_CONFLICT**:

1. `src/audit/c1c27-necromancer-source-closure.test.ts`: `C1C27 authoritative source closure rejects gameplay, other-family, tooling and prior-phase changes`.
2. `src/audit/c1c28-necromancer-project-rulings.test.ts`: `C1C28 canonical source and digital ruling separation C1C28 scope guard freezes gameplay, canonical history, other families and tooling`.

No historical guard was weakened. The new verifier independently checks normalized baseline content, official source hashes and deterministic expected artifacts. A verifier PASS proves the rule-table review contract and preservation; it does not enable a blocked production selector.

No gameplay browser E2E or build run is required for this rule-only phase, and neither is claimed as passing. The prior C1C31 browser/build failures remain preserved and outside this phase's scope. No bundler, Room, Hamlet, Bone, incoming-reaction or resistance engineering was changed. The pre-existing user scratch files remain untouched.
