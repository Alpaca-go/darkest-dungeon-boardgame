# C1C15 Level 3 stance Ring runtime

Verdict: **C1C15-LEVEL3-STANCE-RING-RUNTIME-ACCEPTED-READY-4-OF-12**

Level 3 Core has 12 source-supported definitions. Live runtime evaluation promotes 4: Defender's Ring, Scholar's Ring, Sniper's Ring, and Warrior's Ring. Both sides are semantically exact and have definition-bound runtime, selector, save/replay, and production UI proofs.

The shared stance predicate reads the current BattleUnit while battle is active. It preserves source negation as == or !=. The family reuses the existing post-roll hero-skill-resolution window and accuracy/crit consumers. Use/Skip remains a player decision; +4 Crit and -2 Accuracy affect only the current frozen attack roll, with no reroll or automatic effect.

The normalized historical diagnosis remains untouched. Live Level 3 evaluation consults the current window bindings and condition/modifier/effect registries. Historical timing-unavailable and missing-stance messages therefore do not block the four Rings after implementation.

## Remaining blockers

Berserk Charm, Book of Sanity, Candle of Life, Cleansing Crystal, Fasting Seal, and Recovery Charm remain behind the voluntary declaration source gate and their additional effect/target consumers. Dark Crown and Solar Crown also have voluntary positives; their negative virtue-chance -2 slices may be assessed independently later, but either slice alone has whole-card Ready gain 0. Evaluate primitive reuse and cross-card value before choosing that work. No voluntary timing is inferred.

Level 2 stays 4/11 source-gated. Level 3 stays 4/12. Random draw is locked for both levels. C1C5 through C1C14 historical evidence is frozen, including the C1C14 source-gap freeze.

Implementation anchor: `f2908df4e6dcd68672d6b816ee278c04da26ec8a`, tree `9406c715e6d5caefdc66da36de72d3e054ee4744`. Run `npm run verify:complete-edition-c1c15` for evidence binding, historical E2E, full tests, typecheck, and build.
