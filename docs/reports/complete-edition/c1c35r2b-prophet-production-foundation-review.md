# C1C35R2B — Prophet production foundation dependency review

Outcome: **PROPHET_PRODUCTION_FOUNDATION_BLOCKED**.

The prescribed baseline is `007712ab6aec2c814fa31e06cf5fe05b21a30879` on branch
`codex/phase-11a4-c1c35r2b-prophet-production-foundation-implementation`.
The user's existing `.gitignore` edit is outside this change.

## Exact dependency

`PROPHET_FOUNDATION_BLOCKED_ON_HERO_ENTRY_PLACEMENT`.

The accepted Levels I–III definition adapter sets `heroStartArea: null` in
`src/game-engine/prophet/production-definition.ts`. The accepted shared setup and
`ENTER_BOSS_ROOM` paths in `src/game-engine/bosses/foundation.ts` assign every Hero
from `definition.heroStartArea`. Therefore the shared production entry API requires
a bound Hero starting Area to enter a live Prophet encounter.

The generic ordinary Room contract
`docs/data/complete-edition/c1c32r2-ordinary-threat-encounter-draw-contract.json`
specifies that Hero starting Areas follow the Tile by selected Stance. Its executable
Tile registry, `c1c32r2a-ruins-tile-area-definitions.json`, binds only Tiles 1–9.
It contains no Tile 11 Hero starting Stance mapping. The accepted Prophet Tile
contract binds Prophet placement in `ruins-tile-11:C`, Area topology and printed
Pew rolls; it supplies no Hero entry coordinate. Neither that Boss coordinate nor
the Pew roll map can supply the missing Hero placement rule.

This is a missing accepted executable binding, not a claim that no official rule
could ever resolve Hero deployment. No source acquisition was performed. No
Necromancer coordinate, prototype assumption, caller-supplied coordinate, or
implicit project ruling was substituted.

The phase request explicitly requires this failure in section 10 and a blocked
outcome in section 51. A source/generic Room-entry contract binding Tile 11 Hero
deployment must be accepted before continuing R2B. If a required executable rule
remains canonically unresolved, it needs an explicit versioned `PROJECT_RULING`,
`canonical = false`, under the existing source policy.

## Changes and evidence boundary

- Registered `C1C35R2A-R` at the prescribed commit in the immutable baseline system.
  Its unchanged original dispatch verifier runs in a detached accepted checkout.
  Both R2A and R2A-R evidence families are compared with their raw accepted Git blobs.
- Shared Boss bind and Room-entry commands fail with the exact dependency code
  before state mutation or RNG consumption. They read the accepted definition,
  so a forged caller coordinate cannot open the gate.
- Added tests for Levels I–III, bind/entry rejection, forged coordinates, state/RNG
  preservation, immutable predecessor artifacts and blocked capability decisions.
- Added the thirteen requested deterministic artifacts. Unexecuted gameplay proofs
  explicitly report `BLOCKED` and zero production gameplay tests.
- Added the R2B verifier to the Production release gate. The artifact audit can
  succeed when it faithfully records this blocker; production foundation acceptance
  must exit nonzero. No blocked result is presented as a green release.

`productionFoundation = false`, `productionAccepted = false`,
`controlledFoundationRouteAllowed = false`, `unrestrictedSelectorAllowed = false`,
`c1c36Allowed = false`. Prophet remains registered with `gameplayEnabled = false`.
No Pew/action/Threat gameplay was promoted or represented as tested production behavior.

## Validation

The complete requested command list is exercised by
`scripts/audit/run-c1c35r2b-validation.mjs`. Its actual command exit codes and
regression counts are saved under `c1c35r2b-validation/`. A nonzero R2B acceptance
exit is required while Hero entry remains unresolved. Other failures, if present,
are recorded independently; they do not resolve or replace this blocker.

Actual local results:

| Check | Result |
| --- | --- |
| npm ci | Exit 0 |
| typecheck | Exit 0 |
| HEAD regression | 2695 passed, 501 suites; 0 failed / pending / todo |
| build | Exit 0 |
| C1C27 / C1C28 historical baseline validation | Exit 0 |
| Immutable C1C33–C1C35R2 and C1C35R2A-R checkouts | Exit 0 |
| Necromancer successor compatibility | Exit 0 |
| Prophet Gate A | Exit 0; 22/22 |
| R2A shared dispatch | Exit 0; 5/5 probes, prototype reachability 0 |
| R2B artifact audit | Exit 0; deterministic blocked artifacts match |
| R2B production foundation acceptance | Exit 1; Hero entry dependency unresolved |

Five new tests were added; no new tests were excluded. The 43 accepted R2A/R2A-R
artifacts remain byte-identical. The full validation runner exits 1 because production
foundation acceptance is blocked. This is not an all-green release.

No remote release run was initiated for this blocked foundation, and no successful
remote release is claimed. C1C36 is not authorized.
