# C1C32R3 validation — entry slice

**R3 full-path acceptance: NOT ACCEPTED. C1C33: unauthorized.**

## Passed checks

- Final `npm run typecheck`: PASS.
- New scoped entry suite: 22/22 PASS.
- After moving physical resumption into its own bridge: new entry plus existing Boss foundation command tests, 28/28 PASS.
- Normal player UI selection/reload: 1/1 PASS, no fixture state injection. This test ends at Quest Select and does not prove a Face the Threat run.
- All eight required named Necromancer/Ruins unit suites: PASS, including final runtime blockers, 85/85 PASS.
- `verify:complete-edition-c1c29`, `c1c30`, `c1c31`, `c1c31r`, `c1c32`, `c1c32r`, `c1c32r2`, `c1c32r2a`, `c1c32r2b`: PASS.
- Final `verify:complete-edition-c1c32r2c-r`: PASS after the frozen physical helper and package were restored. All frozen V6 evidence hashes match.
- `git diff --check`: PASS.

## Full regression

`npx vitest run --maxWorkers=2 --minWorkers=2`: 2617/2619 tests PASS, 168/170 files PASS. The only failures are the two historical C1C27/C1C28 scope guards, both reporting `.gitattributes` outside their earlier phase scopes. Their test and contract blobs are byte-identical to `052e623c0bc98560c9baae5e9522d2e88c0bf435`; unexpected test failures = 0. Machine blob evidence is in `c1c32r3-historical-preservation.json`.

The full run preceded the final relocation of the physical checkpoint extension. The final relocation was checked with 28 relevant tests and TypeScript; the full suite was not repeated afterward. This validation is not a final release acceptance run.

## Historical verifier discrepancy

`verify:complete-edition-c1c32r2c` fails with `C1C32R2C runtime and evidence blockers differ`. Its frozen matrix contains the three earlier V5 blockers, while the imported current V6 runtime has zero blockers. Both the matrix and the imported runtime file are unchanged from the requested baseline. This prior-phase verifier was not weakened or its evidence overwritten. The accepted R2C-R successor verifier passes. Detailed review: `c1c32r3-contract-review.json`.

The first R2C-R verifier attempt reported stale hashes for `physical-supply.ts` and `package.json`. Both are restored; the final attempt passes. Existing initial binding remains frozen; the new settled-checkpoint bridge consumes its ledger validators.

## Build

`npm run build`: TypeScript PASS and Vite transform PASS (18,365 modules). Chunk output fails with the known repeated `index-C6s6nAC9-…css` hash/path `ENOENT` on Windows.

Classification: `BUILD_ACCEPTANCE_UNVERIFIED`, `KNOWN_TOOLING_BLOCKER`. Bundler tooling was not changed.

## Unproven required gates

Production guarded Lair/Treasure/Curio Threat entry, Captain injection, ordinary Reanimation, Level I permanent removal, atomic/idempotent Threat settlement, Scenario C hashes, complete Preparation Day/Graveyard reachability, Boss victory UI routes and the full saved-checkpoint replay matrix remain unimplemented or unproven. The required full-path test, R3 audit/verifier and full-path browser suites have not been created or passed. No partial suite is named or promoted as full-path acceptance.

Detailed local logs: `tmp/c1c32r3/validation-results.json`, `full-regression.log`, `build.log`, and `verify-complete-edition-c1c32r2c-r-final.log`.
