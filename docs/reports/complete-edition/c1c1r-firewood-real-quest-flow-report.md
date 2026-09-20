# C1C-1R Firewood Setup & Real Quest Flow Acceptance

Verification scope: **LOCAL MEASURED VERIFICATION**

Generated from implementation HEAD `97ad2f89f3b9ebe0772aee6f7cee8913946bffd2` (tree `8a7c645d72eac522477e3972a03964423dcff160`).

## Measured capability layers

- Engine-capable: **10 / 75**
- Adapter-complete: **7 / 75**
- Proof-complete: **7 / 75**
- Production Ready: **7 / 75**

These layers are intentionally distinct: an implemented engine primitive does not by itself publish a Quest.

## Outcome

Quest Production Ready remeasures from **7 / 75** before the repair to **7 / 75** after it. Trinket Production Ready remains **2 / 48**.

The compound source blocker now yields separate room-composition and firewood/resting-point primitives. All seven simple adapters preserve source firewood setup exactly, initialize save-backed runtime counters, and expose a legal camp-rest consumption command and UI seam.

## Ready quests

- `community-quest-ruins-lvl1-scout-ahead`
- `community-quest-ruins-lvl1-wipe-em-out`
- `community-quest-ruins-lvl2-clear-the-path`
- `community-quest-ruins-lvl2-reduce-to-rubble`
- `community-quest-warrens-lvl1-explore-the-sewers`
- `community-quest-warrens-lvl1-pork-chop`
- `community-quest-warrens-lvl2-mapping-the-sewers`

## Real browser coverage and proof scope

The browser acceptance path fully traverses `community-quest-warrens-lvl1-explore-the-sewers` through production UI. It clears two rooms with a reload between them, earns one XP unit, leaves through the UI with an incomplete result, and applies +1 XP on return to Hamlet. The shared E2E registration is explicitly adapter-scoped to `c1c1-simple-community-quest-v1`; it is not represented as seven definition-level browser runs.

## Room-token behavior

All six source tokens have explicit runtime and qualification behavior: `empty`, `dark`, `curio`, `treasure`, `lair`, and `trap`. Dark and trap cannot qualify as cleared; Curio qualifies only after interaction; Treasure and Lair qualify after victory.

## Deferred scope

68 Quest definitions remain non-ready. Special-rule Quests stay engine-blocked, and the three simple Crimson Court Quests remain adapter-required. C1C-2 is not included.
