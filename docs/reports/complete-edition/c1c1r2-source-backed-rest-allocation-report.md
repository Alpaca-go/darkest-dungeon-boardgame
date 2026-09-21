# C1C-1R2 Source-backed Rest Allocation

Verification scope: **LOCAL MEASURED VERIFICATION**

The verifier measured implementation HEAD `c21876b6ce2776e19118651a0d346fcced9c7f9a` and Git index tree `c48f90be8e54e53694b840c7066630a1f5ccf33c`. The evidence publication commit is intentionally not self-recorded; use the branch HEAD in the handoff.

## Source rule

Core Rulebook pages 11 and 15 are bound by SHA-256 `9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae`. The rules explicitly give the party the printed Resting Point amount, require a cleared Room and party agreement, let players distribute points, convert each spent point into 1 Life or 1 Stress, and discard Firewood after Rest.

## Outcome

Automatic target selection, stress-first recovery, and round-robin allocation are removed. Players edit an unpersisted draft, Cancel without mutation, or atomically commit a validated allocation. Invalid entries leave Heroes, Firewood, and Rest counters unchanged.

Quest Production Ready remains **7 / 75**; Trinket Production Ready remains **2 / 48**. No special-rule Quest became ready.

## Browser proof

`C1C1R2-E2E-REST-ALLOCATION` is primitive-scoped to `QUEST_FIREWOOD_RESTING_POINT_SETUP` and executes `community-quest-ruins-lvl1-scout-ahead` through production UI. It creates recoverable Stress through Scout, clears a real Room, proves Cancel unchanged, commits exactly one selected recovery, observes Firewood 1 → 0, and verifies save/reload. The existing Explore the Sewers Quest/XP E2E also remains green.

## Measured commands

- frozenSourceTruth: exit 0
- sourceEvidenceContract: exit 0
- restSourceGuard: exit 0
- restE2eSourceGuard: exit 0
- restAllocationAndQuestProofs: exit 0
- questAndRestPlaywright: exit 0
- fullRegression: exit 0
- build: exit 0

C1C-2 is outside this verification scope.
