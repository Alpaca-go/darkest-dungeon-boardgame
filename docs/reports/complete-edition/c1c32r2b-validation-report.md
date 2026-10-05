# C1C32R2B validation report

Outcome: **evidence and the implemented v5 domain changes pass; production executable dependencies remain open**. The acceptance verdict is `C1C32R2B-RUINS-PRODUCTION-EXECUTABLE-DEPENDENCIES-NOT-CLOSED`.

| Check | Result | Scope |
|---|---|---|
| `npm run typecheck` | PASS | TypeScript after v5 selection, draw ownership, intent module and audit additions. |
| `npm run test:necromancer-foundation` | PASS | 72 tests. |
| `npm run test:necromancer-finalization` | PASS | 9 tests. |
| `npm run test:necromancer-threat-bridge` | PASS | 16 tests. |
| `npm run test:necromancer-threat-dependencies` | PASS | 22 tests. |
| `npm run test:ruins-executable-dependencies` | PASS | 16 historical successor tests, including unchanged v4 unresolved discard behavior. |
| `npm run test:ruins-production-runtime` | PASS | 5 tests for v5 migration, Large replacement/return, save tampering, and source-bound Monster intent. This is scoped domain validation, not full production runtime acceptance. |
| `npm run verify:complete-edition-c1c29` through `c1c32r2b` | PASS | All nine historical/successor evidence verifiers. The R2B verifier explicitly rejects `--require-accepted`. |
| `npx vitest run --maxWorkers=2 --minWorkers=2` | PASS within historical exceptions | 158/160 files and 2511/2513 tests pass. The only failures are the existing C1C27/C1C28 scope guards, which reject the already committed `.gitattributes`; unexpected failures: 0. |
| Scoped browser Preparation Day | UNVERIFIED | All 3 existing C1C32R2A browser cases timed out after 180 seconds: two on Hamlet reload and one on Result navigation. No new full product browser proof is claimed. |
| `npm run build` | `BUILD_ACCEPTANCE_UNVERIFIED` / `KNOWN_TOOLING_BLOCKER` | TypeScript and 16,926 Vite module transforms passed; output failed at the previously known repeated CSS hash/path `ENOENT` write boundary. |

The 9/9 Tile proof comes from direct inspection of the locked official Tile front/back pages, then structural checks of Area IDs, capacity, adjacency and starting maps. The official Large replacement return timing remains canonically unresolved; v5 records a noncanonical Project Ruling rather than changing the official interpretation or rewriting v4.

The machine-readable [runtime dependency matrix](../../data/complete-edition/c1c32r2b-runtime-dependency-matrix.json) lists six actual executable blockers. Full Threat navigation, Scenario C hashes, Captain/Reanimation, and Boss Room victory remain C1C32R3 work only after these dependencies close.
