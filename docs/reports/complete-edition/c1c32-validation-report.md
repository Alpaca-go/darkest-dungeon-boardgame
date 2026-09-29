# C1C32 validation

Verdict: **foundation NOT_FINALIZED**; `allCapabilityGatesImplemented=false`.
Production route classification: **PRODUCT_FAILURE — PRODUCTION_THREAT_DOMAIN_BRIDGE**.

| Check | Final result | Evidence / limit |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tmp/c1c32-typecheck-stable.log` |
| Full Vitest, final runtime state | 2452 passed; 2 failed; 156 files | `npx vitest run --maxWorkers=2 --minWorkers=2`; `tmp/c1c32-full-vitest-stable.log`; 529.86s |
| Expected historical failures | 2 | Only C1C27 source-only scope guard and C1C28 source-only scope guard; `EXPECTED_HISTORICAL_SCOPE_CONFLICT`; test code preserved |
| Unexpected Vitest failures | **0** | Full run still exits 1 because the two historical guards are not suppressed |
| New C1C32 tests | **9/9 PASS** | Production components/commands, v1/v2 pins, 24 bound Hero pairs, per-Hero reaction save, seeded Bone selection, resistance, fail-closed ordinary Room entry and import tampering |
| `npm run test:necromancer-foundation` | **72/72 PASS** | `tmp/c1c32-final-checks.log`; the same foundation suites also pass in the final full run |
| C1C29 verifier | PASS | Current executor traces, replay hashes, frozen baselines and source policy |
| C1C30 verifier | PASS | Original v1 checkpoint/resumption hashes match current v1 execution; historical foundation implementation hash is pinned |
| C1C31 verifier | PASS | Frozen data/evidence and historical runtime snapshots |
| C1C31R verifier | PASS | 24 pairs, 21 explicit rulings, v1 preservation and unchanged impact evidence |
| C1C32 generate + offline verifier | PASS | Nine artifacts reproduced exactly; locked printed source hashes and C1C20–31R inputs verified; explicit non-finalized status |
| C1C32 Playwright | **2 passed** | `tmp/c1c32-browser-final.log`; one real normal-route failure-boundary test, one scoped checkpoint choice UI/Store/reload proof |
| Historical Playwright | **3 passed, 1 existing skip** | `tmp/c1c32-historical-browser-final.log`; C1C29 fixture isolation, C1C30 v1 gate, C1C31 v1 failure boundary; the skipped historical full-path case remains unaccepted |
| Full production browser route | **PRODUCT_FAILURE** | Real migration → selector → dungeon movement stops at guarded Room Threat bridge; downstream Captain/Reanimation/reaction/victory route is not certified |
| Production save/replay A–E | **NOT ACCEPTED** | A/B/D/E real-component command isolation passed, with explicit controls and deterministic hashes; C THREAT Reanimation NOT_PROVEN with null hashes |
| `npm run build` | **BUILD_ACCEPTANCE_UNVERIFIED** | `tmp/c1c32-build.log`; tsc completed, Vite transformed 14287 modules, then the known repeated CSS hash/path `ENOENT` after 4m48s; bundler untouched |
| `git diff --check` | PASS | No whitespace errors |

## Test scopes and actual failures

The first full run under overlapping heavy work had a CLI-01 spawn timeout in addition to the two historical scope failures. Subsequent stable runs pass the actual CLI exit suite. The final runtime run has exactly the two permitted historical failures and no unexpected failures.

The initial historical browser attempt timed out at its original 180-second budget during cold module loading and was stopped. The actual rerun with a 600-second test budget completed with three passes and one pre-existing skip. That initial loading timeout is **TEST_INFRA_FAILURE**, superseded by the completed rerun; it is separate from the C1C32 normal route's demonstrated **PRODUCT_FAILURE**.

C1C30 verification initially exposed both an obsolete runtime-file freeze and a real v1 serialization drift. Historical runtime-file hashes now refer to their accepted snapshots, while canonical/source JSON remains strict. The new `stagedIncomingAttacks` field is emitted only for v2, restoring C1C30's original resumed-state hashes. C1C30, C1C31 and C1C31R artifacts were not regenerated or altered.

The C1C32 browser failure-boundary test passes because it correctly detects the product dependency block. It does **not** pass the requested full production path. The checkpoint UI case supplies Preparation Day rolls and validates retained candidates, committed choice event, forced Hero and pinned v2 version after reload. It does **not** replace a Hamlet Graveyard transaction proof.

The isolated A/B/D/E proofs use real component definitions and production save validation. Combat cases explicitly prepare actor/initiative state; A supplies Boss roll inputs, B grants a locked reaction Trinket to the selected target, and D injects Boss damage to test the real victory transaction. Post-resolution snapshots are also validated and restored; cleanup is checked for idempotence. These controls are recorded in the artifacts. No synthetic combat definition contributes to C1C32 acceptance, and no isolation proof grants complete production acceptance.

## Final preservation checks

No external source acquisition or rule review was restarted. C1C28 v1, C1C31 v2, the Hero Dodge table, C1C20–31R canonical/evidence JSON and the C1C28 semantic adapter remain unchanged. The final C1C32 verifier checks them against `e0158c0af8c1e84a0c861f74ca67c436b6f5ae67` and validates printed source hashes.

Existing user scratch files were preserved. Test-generated timestamps in the two core-campaign source audit manifests were restored only after confirming their remaining contents matched the original baseline. The known CSS path failure was not addressed in this runtime workstream.

Required next workstream: **NECROMANCER_RUNTIME_ENGINEERING_BLOCKER_REVIEW / PRODUCTION_THREAT_DOMAIN_BRIDGE**. The concrete dependencies and capability statuses are in the finalization report and capability matrix. Foundation acceptance and C1C33 promotion remain stopped.
