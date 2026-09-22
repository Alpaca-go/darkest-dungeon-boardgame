# C1C-11 Bloodthirst Ring Runtime

Verdict: **C1C11-BLOODTHIRST-HIT-BLEED-SLICE-ACCEPTED-CARD-NOT-PROMOTED**

The negative side now opens only after a staged incoming monster attack is confirmed as a hit. Using it applies Bleed 3 for two turns to the equipped hero through the shared condition consumer, then flips the physical card. Resistance, save/replay idempotency, decline/resume, two-trinket coexistence, two periodic ticks, and Death's Door deathblow behavior are covered.

The positive Food/Heal side remains deliberately fail-closed because its exact voluntary-declaration timing is unresolved. Therefore the whole card is **not production ready**, Level 2 readiness remains **4 / 11**, and random draw remains locked. Evidence is bound to implementation commit `1dbf947185331ea1ddbe4cc45aef5366ccce2705` and tree `1fb16535ff221004f0d41e245bf21b95e9085085`.
