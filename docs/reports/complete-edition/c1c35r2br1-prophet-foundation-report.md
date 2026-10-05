# C1C35R2B-R1 Prophet production foundation

The previous Hero entry blocker was invalid. The accepted Tile 11 contract already binds aggressive → NE, defensive → S, ranged → S and support → W with `OFFICIAL_SOURCE` authority. Its null legacy `heroStartArea` identified a runtime model gap, not missing source. No source acquisition or new project ruling was required.

The shared Boss definition now supports `heroStartingStanceAreas`, and initial binding and Boss Room entry call the same resolver. Necromancer retains its existing single-Area deployment. Hero identity, Stance and source-resolved Area survive the shared save importer; forged bindings reject.

The controlled route constructs real source-bound Levels I–III encounters, Room 11 reservation and entry, one Large Prophet Actor, shared occupancy, three Boss initiative entries and four stable physical Pew markers. Pews have no HP, initiative or Actor capacity cost. The scheduler uses the shared initiative lifecycle and records its continuations for replay.

Ordinal 1 commits four independent shared D10 placements from the locked printed map. Ordinal 2 selects the printed Eye on You/Fulminate rows and uses a persisted Crowded PendingChoice for ties. Ordinal 3 executes physical Pew ordinals 1–4, freezes all living Heroes in each Area in Stance/ID order, stores independent rolls even for empty Areas, and resolves targets through the shared staged damage, condition, stress and Death Door pipeline.

Threat I uses Dungeon entry, Threat II the shared scouting command, and Threat III actual source-bound Ruins Monster spawn commits. Spawn eligibility is resolved from the official Monster definition, rather than caller-supplied tags. Shared campaign receipts prevent repeat Stress, including after reload. The printed Tavern modifiers are bound separately by Level.

Termination and victory return all four Pews and Room/Tile ownership once, cancel pending choices/attacks and preserve causal history. Victory uses the existing campaign finalization and progression transactions. Its post-combat RNG, clock and ID advancement has a separate before/after receipt; combat replay is validated against the combat checkpoint.

## Evidence and historical boundaries

The 13 previous `c1c35r2b-*` blocked artifacts and their failed report remain audit history at `4bc8dd9a16f13f9f24eff0cf90ea0e14c9e9a45b`. They do not establish missing source or govern the resumed phase. The new `c1c35r2br1-prophet-hero-entry-contract.json` records `INVALID_BLOCKER_RUNTIME_MODEL_GAP`, `sourceWasAvailable=true` and `newProjectRulingRequired=false`.

The other 13 `c1c35r2br1-prophet-*` artifacts contain executed source-bound campaign traces, per-Level attack/save checkpoints, ownership returns, Threat receipts, tamper rejection and the current capability/acceptance decision. The phase verifier rebuilds these traces and compares deterministic bytes. It returns exit code 0 for accepted foundation evidence.

R2A/R2A-R artifacts and original infrastructure test bytes remain immutable at `007712ab6aec2c814fa31e06cf5fe05b21a30879`. The original infrastructure-only test that requires Prophet gameplay rejection cannot describe the extended runtime. Its entire 32-test suite and original verifier execute in that accepted detached checkout, including from the HEAD historical boundary test and the retained release step. It is the only new HEAD exclusion; no test assertions were weakened or rewritten. Current Prophet behavior is independently exercised by the R1 production suite. Necromancer compatibility still compares against captured predecessor outputs.

## Acceptance boundary

`productionFoundation=true`, `productionAccepted=false`, `controlledFoundationRouteAllowed=true`, `unrestrictedSelectorAllowed=false`. This authorizes C1C36 full production path and browser save/replay work after the real final-commit release gate succeeds; it does not claim browser acceptance.

Local command results and regression counts are in `c1c35r2br1-validation/`. Remote acceptance must come from an actual completed successful GitHub Actions Production release gate whose `head_sha` equals final HEAD. The final delivery supplies that run URL and SHA; local logs are not remote evidence.

Local validation: all 11 required commands returned 0. The final full regression passed 2729 tests with 0 failed, pending or todo; the final Prophet suite passed 67 tests. Final build and deterministic foundation verification also returned 0. Gate A remains 22/22, Necromancer compatibility remains PASS, and prototype production reachability remains 0.

The user's pre-existing `.gitignore` modification remains outside the phase commit.
