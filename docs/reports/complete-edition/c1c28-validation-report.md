# C1C28 validation

Baseline commit: `aaedb2d30b1e5d90bf8d41e7dbced9f93288f73a`.
Working branch: `codex/phase-11a4-c1c28-necromancer-digital-rulings`.
Validation date: 2026-09-28.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| `npm run audit:complete-edition-c1c28` | PASS | Seven JSON artifacts and deterministic report, generated offline from immutable source contracts. Final regeneration includes per-category official-known-fact summaries and direct/family-dependent card identities. |
| `npm run typecheck` | PASS | TypeScript exit 0; no compiler/configuration changes. |
| C1C28 Vitest | PASS | 39 tests, 10.31 seconds. Exact baseline/refined coverage; canonical/ruling separation; choice permutation/invalid-input checks; per-Level mixed-hit counts; finite supply, death, placement failure and reset; identity conflict/Captain binding; Reanimation order/fresh instance/initiative and simultaneous selection; nearest/full Room capacity; cleanup; risk/migration; matrix derivation and frozen scope. |
| C1C20–26 Vitest | PASS | Seven files / 149 tests, 57.23 seconds. All 462 C1C24 Boss crops and original C1C25 Bone/Room crops rebuilt and verified; upstream counts and contracts preserved. |
| C1C27 Vitest historical contract regression | PASS with one intentionally excluded historical workspace-scope test | 23 passed / 1 skipped, 4.98 seconds. C1C27 source classification, authentication, exhaustion, semantic counts and deterministic stored artifacts all pass unchanged. Its test named “rejects gameplay, other-family, tooling and prior-phase changes” calls the old whole-workspace verifier, which intentionally permits only C1C27 additions and three C1C27 package scripts; it cannot accept a later phase. The new C1C28 scope test/verifier instead freezes **all** C1C27 baseline files and permits only C1C28 additions and two package scripts. The historical test file was not edited or weakened. |
| Combined regression | PASS within stated scope | Nine files / 211 passed / 1 historical scope test skipped. No browser or production runtime acceptance is inferred. |
| `npm run verify:complete-edition-c1c28` | PASS | Baseline ancestry/all tracked content freeze, exact package delta/new-file scope, byte-preserved C1C27 response/header hashes, C1C25 original/crop checks, exact generated artifact equality, report equality. Official completeness 0/9, executable contract 9/9, Ready 0/9. |
| `git diff --check` | PASS | No whitespace errors. |
| Build | NOT RERUN / BUILD_ACCEPTANCE_UNVERIFIED | The C1C27 build transformed 12,737 modules and failed with the recorded Windows Vite repeated-hash CSS output/path-length ENOENT. C1C28 changes only audit contracts/tests/reports and package scripts; no bundler/Vite config repair. Build success is not claimed. |
| Browser E2E | NOT RERUN / NOT FULLY ACCEPTED | C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout remain open. |

Regression commands:

```powershell
npx vitest run src/audit/c1c28-necromancer-project-rulings.test.ts
npx vitest run src/audit/c1c20-core-terminal-blockers.test.ts src/audit/c1c21-standard-quest-live-rebaseline.test.ts src/audit/c1c22-boss-encounter-live-inventory.test.ts src/audit/c1c23-hamlet-event-source-intake.test.ts src/audit/c1c24-boss-source-intake.test.ts src/audit/c1c25-necromancer-semantic-source-intake.test.ts src/audit/c1c26-necromancer-source-closure.test.ts
npx vitest run src/audit/c1c27-necromancer-source-closure.test.ts -t '^(?!.*rejects gameplay, other-family, tooling and prior-phase changes).*'
```

The initial generator guard correctly rejected nine existing `null` values for the Six Feet Under Skill's absent Crit/CritDamage/direct damage fields. These exact source-bound printed-absence paths now become explicit `PRINTED_ABSENT` / `NO_CRITICAL_BRANCH` / `NO_DIRECT_DAMAGE` descriptors in the overlay, without modifying canonical data or substituting arbitrary numeric defaults. All other executable nulls remain rejected. The first C1C28 test run had two metadata-check false positives (a generated per-Level test name, and a comment mentioning game-engine); the checks were narrowed to generated test names and actual imports. The corrected final 39-test suite passed.

The catalogue has 1,415 bindings: 1,295 OFFICIAL_SOURCE leaves and 120 PROJECT_RULING fields. Those 120 cover exactly 75 inherited usages plus 45 C1C26 refined usages, not 120 new canonical blockers. Bound composite source values are decomposed before official attribution, so unresolved policies cannot hide inside an official parent. Each official leaf retains its original value/evidence or explicit printed-absence representation; every project field points back to a still-unresolved canonical node and an explicit ruling ID.

Source terminal status is explicitly **project-scoped**, under `C1C28_USER_AVAILABLE_CORPUS_FREEZE`. It is not a claim that the designer FAQ does not exist or that access failures prove permanent unavailability. No acquisition was attempted. C1C27 pending authority history and all prior source-status/precedence files remain unchanged. The user-directed project development gate permits explicit rulings while preserving source truth.

Twelve default project rulings are versioned `C1C28-DIGITAL-DEFAULT-v1`; every ruling is `authority=PROJECT_RULING`, `canonical=false`, and overridable after migration review. Summon count/supply, identity interpretation/Captain association and Reanimation are HIGH_GAMEPLAY_IMPACT, placement is MEDIUM_RULE_INTERPRETATION, and choices/cleanup are LOW_RISK_DETERMINISM. Dedicated scenario obligations and future save/replay/UI requirements are recorded. Balance validation is not claimed. Pure audit oracles exercise the contract; no Boss runtime APIs were added to production.

The source freeze verifier compares all baseline tracked content with EOL-only tolerance for historical text and exact byte hashes for acquired evidence. Gameplay, Battle/Threat/summon engines, Boss AI/UI, selectors, Room runtime, save/replay, other families, source assets and C1C25–27 canonical contracts remain untouched. Existing user temporary files are preserved and excluded from newly introduced file accounting. Only C1C28 audit files/data/reports and two package scripts are added.

Result: `C1C28-NECROMANCER-TERMINAL-BLOCKER-AND-DIGITAL-RULING-CONTRACT-ACCEPTED`. Canonical semantic complete 0/9; executable semantic complete 9/9; foundation-eligible 9/9; implemented/Production Ready 0/9. Next: `NEXT-NECROMANCER-RUNTIME-FOUNDATION-SELECTED`, for **C1C29**. Runtime must implement the versioned public rulings, explicit choices, finite resource ledger and causal event/initiative model; production proof is still required.
