# C1C31 validation report

Verdict: **NECROMANCER_RUNTIME_FOUNDATION_BLOCKED_BY_EXPLICIT_DIGITAL_RULING_REVIEW**. Foundation and C1C32 integration are not accepted. Production Ready remains 0.

Baseline: `2ab674d7d8c15dbbd7367bb3b2011243facb5517`. Validation date: 2026-09-29, Asia/Shanghai.

| Check | Result | Evidence under `c1c31-validation/` |
| --- | --- | --- |
| `npm run typecheck` | PASS | `typecheck-final.log` |
| `npm run test:necromancer-closure` | PASS, 10/10 | `closure-tests-final.log` |
| `npm run test:necromancer-foundation` | PASS, 72/72 | `foundation-tests.log` |
| `npm run test:necromancer-continuation` | PASS, 25/25 | `continuation-tests.log` |
| `npm run verify:complete-edition-c1c29` | PASS | `c1c29-verifier.log` |
| `npm run verify:complete-edition-c1c30` | PASS for historical contract preservation; production remains blocked | `c1c30-verifier.log` |
| `npm run audit:complete-edition-c1c31` / `verify:complete-edition-c1c31` | PASS for deterministic source/baseline/artifact verification; not gameplay acceptance | `generate-final.log`, `verifier-final.log` |
| Stable final full Vitest rerun | 2,393/2,395 PASS; two expected historical scope conflicts; **0 unexpected failures** | `full-vitest-final.json`, `full-vitest-final.log` |
| Browser production attempt | **TEST_INFRA_FAILURE** at reload; observed production entry **PRODUCT_FAILURE** | `e2e.log`, `e2e-initial.log` |
| `npm run build` | Existing repeated CSS hash/path ENOENT; **BUILD_ACCEPTANCE_UNVERIFIED** | `build.log` |
| `git diff --check` | PASS | No whitespace diagnostics |

## Historical conflicts and stable rerun

The first full run had 2,393 passing tests out of 2,395. Its only failures were these unchanged historical scope guards, classified **EXPECTED_HISTORICAL_SCOPE_CONFLICT**:

1. `src/audit/c1c27-necromancer-source-closure.test.ts`: `C1C27 authoritative source closure rejects gameplay, other-family, tooling and prior-phase changes`.
2. `src/audit/c1c28-necromancer-project-rulings.test.ts`: `C1C28 canonical source and digital ruling separation C1C28 scope guard freezes gameplay, canonical history, other families and tooling`.

Both fail on the historical `AGENTS.md` workspace scope assertion already documented in C1C30. Neither is edited or weakened. The raw Vitest command exits 1 even when these are the only two failures. C1C31's separate verifier freezes the C1C30 baseline, C1C20–30 JSON, hash-bound rulebook extract, v1/core/adapter sources and the historical guards. The original full log/result are retained. The stable full rerun was completed after review tests and artifact inputs were finalized; it confirms the same two named failures and zero unexpected failures. Test-generated changes to the two unrelated core-campaign `generatedAt` timestamps were inspected and restored to their original tracked content. The pre-existing user scratch test was included and not edited.

## Browser classification

The scenario uses actual campaign/store/save/quest command and normal selector UI. It uses no synthetic combat fixture. It attempts production entry and verifies the atomic prerequisite failure; subsequent gameplay transitions are unreachable. Successful assertions of the blocked entry are gate coverage, **not** successful production E2E proof. The product result is **PRODUCT_FAILURE**, at `NORMAL_SELECTOR_DEPENDENCY_VALIDATION`; no PendingChoice production UI/commit/replay or reaction/save/reanimation/cleanup acceptance is asserted.

The initial browser run reached entry rejection and the displayed gate, but timed out during page reload while build/full regression were running. That browser run is **TEST_INFRA_FAILURE** for completion of its assertions, independently of the observed product dependency failure. It is preserved in `e2e-initial.log`. The final isolated run was performed after build/full regression completed and failed at the same reload boundary after 180 seconds. Its `e2e.log` contains the observed command error, unchanged campaign and unreachable downstream transitions. The isolated failure shows that concurrency alone does not explain this reload timeout; the underlying browser/dev-server issue is unverified. Neither browser run is reported as PASS, and no full production E2E acceptance is granted.

## Build and proof limits

Build's TypeScript stage succeeded. Vite transformed 13,824 modules, then failed opening the repeated `index-C6s6nAC9-...css` path under `dist/assets`. This is the pre-existing separate Windows build issue; bundler/CSS configuration is unchanged. It does not turn the failing production dependency path into an infrastructure failure.

Source review closes all four Bone Stance tables and corrects Captain's Stun fields. It does not promote executable definitions. Required Hero coverage is 3/24. The remaining 21 numeric drafts are explicitly noncanonical and inactive. The actual seeded command attempt records equal before/after campaign hashes and its error. Production save/replay scenarios A–D contain unavailable hash fields and do not claim state-equivalence success.

No external evidence was acquired, no v2 was activated, and no migration was performed. Current runtime bridges remain incomplete as listed in the capability matrix and closure report. The explicit ruling review outcome is not a claim of implementation completion.
