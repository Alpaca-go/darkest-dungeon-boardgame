# C1C16 Level 1 stance accuracy runtime

Verdict: **C1C16-LEVEL1-STANCE-ACCURACY-RUNTIME-ACCEPTED-READY-6-OF-14**

Level 1 Core has 14 source definitions. Current runtime, semantic comparison and definition-bound proofs recognize 6 Ready cards: Accuracy Stone, Critical Stone, Archer's Ring, Sage's Book, Warrior's Bracer, and Warrior's Cap. Existing C1BR stone adapters and proofs are reused.

The four new cards use the existing post-roll window: positive Accuracy +2 with matching BattleUnit stance, negative Accuracy -1 without any stance predicate. Warrior's Bracer has one +2 modifier; duplicate printed Acc is retained only in source evidence. The frozen attack die is never rerolled; ordinary hit damage uses the existing separate damage RNG. Use/Decline, physical instances, one use per turn, and save/replay remain unchanged. No gameplay primitive was introduced.

## Remaining Level 1 blocker ROI

All eight remaining cards are listed with their exact source contracts in runtime evidence. Bleed Charm, Blight Charm, Debuff Charm and Stun Charm form the strongest next family candidate (potential whole-card gain 4 after both sides close). C1C8 pre-damage hit staging and C1C9 condition magnitude/duration can be reused, but the positive skill-target must bind to the enemy rather than self. Their negative hero-causes-condition / condition-being-caused window and modify-condition-duration -1 consumer need an exact contract before implementation. Debuff/Stun source amounts are null: preserve their source semantics and resolve how the existing status representation handles categorical conditions. Do not copy the self-condition consumer onto an enemy target.

Caution Cloak's scout positive may reuse C1C10 staging, but its voluntary light -1 negative remains source-gated; positive-only gain 0. Speed Stone is voluntary-gated on both choose-one sides. Damage Stone's +3 slice can reuse existing damage accumulation, but hero-takes-damage / suffer-wounds needs a separate contract; positive-only gain 0. Survival Guide requires exploration-die ignore/replace result contracts. These are deferred; no remaining card is promoted by this phase.

Level 1 stays 6/14; Level 2 stays 4/11 source-gated; Level 3 stays 4/12 with the C1C15 Ring IDs unchanged. Random draw is locked at all three levels. C1C5 through C1C15 evidence/report hashes and normalized source are frozen.

Implementation anchor: `130f1cc868adc3e27eb3ac5a2087f8da4e2f4e86`, tree `7cb92fbdf5e8492dde6cdfa9f9869b89b8354f6b`. Run `npm run verify:complete-edition-c1c16` for all eleven E2E suites, full tests, typecheck and build.
