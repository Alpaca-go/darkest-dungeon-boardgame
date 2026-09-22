# C1C-7 Voluntary Declaration Timing & Fortunate Armlet

Verdict contract: **C1C7-VOLUNTARY-DECLARATION-SOURCE-UNRESOLVED-FORTUNATE-NOT-PROMOTED**

The Core Rulebook defines applicability, declaration, resolution, flipping, and a battle once-per-turn limit, but does not define a complete legal timing domain across battle, exploration, rest, and Hamlet contexts. The source search is exhausted and still unresolved, so no generic manual declaration runtime was added.

Fortunate Armlet's positive Accuracy +1 / Crit +1 post-roll slice is exact and proven through production UI, save/replay, and runtime tests. Its negative side remains blocked by `TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED`; the card is not promoted. Book of Relaxation additionally exposes `TRINKET_MODIFIER_CONSUMER_MISSING` for dodge. Level 2 readiness remains **2 / 11**.

Evidence is bound to implementation commit `600eacdfee1ce3ebd8f8afad4137c268c37bc052` and tree `903043d272ff5854020557207bc5f0b8f11d27a7`. The independent verifier re-runs the commands; the committed evidence contains no synthetic PASS results.
