# Phase 11A.4-C1C-20 — Core Trinket terminal source-gated closure

Baseline: `phase-11a4-c1c19-hero-caused-condition-source-contract`, HEAD `78d2899c4b6a9ee7a5343e4ce2131dc4b0d8068d`, tree `0c2f6a142155f22c92a781157efaf1f54712d562`.

Verdict: **C1C20-CORE-TRINKET-TERMINAL-BLOCKER-CONSOLIDATION-ACCEPTED-SOURCE-GATED-15-OF-37**.

Under the currently locked authoritative source set, Core Trinket runtime-safe whole-card promotion is exhausted. Immediate source-safe Core whole-card candidates = **0**; immediate runtime-only Ready gain = **0**. This closes the Core Trinket workstream of Phase 11A.4 under that source set. It does not assert permanent impossibility or closure of every other Complete Edition workstream.

## Current completion and exact Ready inventory

| Level | Source definitions | Production Ready | Not Ready | Full-deck completeForRandomDraw |
|---|---:|---:|---:|---|
| 1 | 14 | 7 | 7 | false |
| 2 | 11 | 4 | 7 | false |
| 3 | 12 | 4 | 8 | false |
| Total | 37 | 15 | 22 | false for every level |

Ready subset drawing stays enabled. Exact IDs are machine-locked, not just counts:

- Level 1: `community-trinket-core-accuracy-stone`, `community-trinket-core-archers-ring`, `community-trinket-core-critical-stone`, `community-trinket-core-sages-book`, `community-trinket-core-survival-guide`, `community-trinket-core-warriors-bracer`, `community-trinket-core-warriors-cap`.
- Level 2: `community-trinket-core-camouflage-cloak`, `community-trinket-core-campers-helmet`, `community-trinket-core-dark-bracer`, `community-trinket-core-solar-bracer`.
- Level 3: `community-trinket-core-defenders-ring`, `community-trinket-core-scholars-ring`, `community-trinket-core-snipers-ring`, `community-trinket-core-warriors-ring`.

Production Ready continues to require whole-card semantic closure, adapter, runtime, production/save/replay proof, selector reachability and production UI E2E. Implemented side counts, available consumers, an adapter or engine capability cannot replace those obligations.

## Why completion stops at 15/37

Every remaining card has exactly one upstream root source family. Movement, choose-one, gain-action, virtue-chance and other consumers are downstream work, not source closure. The graph computes an optimistic counterfactual in which **every** downstream runtime obligation is completed while the current source gates remain unresolved. The resulting Ready count is still **15**. Each blocked card contributes zero runtime-only whole-card gain.

| Root family | Level 1 | Level 2 | Level 3 | Total | Frozen contract |
|---|---:|---:|---:|---:|---|
| VOLUNTARY_DECLARATION | 2 | 6 | 8 | 16 | C1C7 and C1C14 |
| HERO_CAUSED_CONDITION | 4 | 0 | 0 | 4 | C1C19 |
| DAMAGE_WOUND | 1 | 0 | 0 | 1 | C1C18 |
| HEALING_TRIGGER_SCOPE | 0 | 1 | 0 | 1 | C1C5R and C1C14 |

The exact blocked partition is:

| Level | Card | Root source family | Live fully implemented sides |
|---|---|---|---|
| 1 | Bleed Charm | HERO_CAUSED_CONDITION | none |
| 1 | Blight Charm | HERO_CAUSED_CONDITION | none |
| 1 | Caution Cloak | VOLUNTARY_DECLARATION | none |
| 1 | Damage Stone | DAMAGE_WOUND | none |
| 1 | Debuff Charm | HERO_CAUSED_CONDITION | none |
| 1 | Speed Stone | VOLUNTARY_DECLARATION | none |
| 1 | Stun Charm | HERO_CAUSED_CONDITION | none |
| 2 | Bloodthirst Ring | VOLUNTARY_DECLARATION | negative |
| 2 | Book of Constitution | VOLUNTARY_DECLARATION | positive |
| 2 | Book of Holiness | VOLUNTARY_DECLARATION | negative |
| 2 | Book of Relaxation | VOLUNTARY_DECLARATION | none |
| 2 | Chirurgeon's Charm | HEALING_TRIGGER_SCOPE | neither whole side; both PARTIAL battle slices |
| 2 | Fortunate Armlet | VOLUNTARY_DECLARATION | positive |
| 2 | Protective Padlock | VOLUNTARY_DECLARATION | positive |
| 3 | Berserk Charm | VOLUNTARY_DECLARATION | none |
| 3 | Book of Sanity | VOLUNTARY_DECLARATION | none |
| 3 | Candle of Life | VOLUNTARY_DECLARATION | none |
| 3 | Cleansing Crystal | VOLUNTARY_DECLARATION | none |
| 3 | Dark Crown | VOLUNTARY_DECLARATION | none |
| 3 | Fasting Seal | VOLUNTARY_DECLARATION | none |
| 3 | Recovery Charm | VOLUNTARY_DECLARATION | none |
| 3 | Solar Crown | VOLUNTARY_DECLARATION | none |

The machine register also stores exact definition IDs, live per-side semantic mismatches, source references, missing consumers, adapter/proof gaps and upstream links. `implementedSides` means the live obligation is IMPLEMENTED; PARTIAL slices remain explicit in `obligations` and `unimplementedSides`.

## Source delta and inherited freezes

`sourceDelta = NONE` within the current locally available source set. The scan compares C1C19 Git blobs with current normalized source, literal observations, card evidence, source review lock, raw extraction inventory and all Core card asset bytes. It also searches local docs for PDF/FAQ/errata/clarification/reference candidates, source cache candidates and an explicitly supplied COMPLETE_EDITION_TTS. Both local rulebook copies have the frozen SHA-256 `9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae`.

Original S1/S2/S3 raw files were not reacquired in this workspace. Their frozen input hashes and normalized TTS extraction remain unchanged; this does not pretend those raw bytes were freshly read. The designer FAQ remains `LOCATED_ACCESS_UNAVAILABLE`; its contents/binary have not been acquired. No new local rulebook, acquired FAQ, errata, reference card, TTS rule object or official clarification was found. This is a local delta scan, not an assertion that no publication exists anywhere online. Any newly discovered candidate forces REVIEW_REQUIRED and stops generation of the terminal accepted verdict.

Historical C1C19 and earlier data/reports, scripts and audit code are frozen. Evidence remains byte-exact; audit code LF/CRLF is canonicalized for Windows checkout comparison. No historical contract is rewritten or reinterpreted.

- **Voluntary:** `SOURCE_EXHAUSTED_STILL_UNRESOLVED`. No Hero Turn Start/End, between-actions, any-time, before-attack, after-action or Dungeon free-action domain is invented.
- **Condition:** C1C19 Outcome C remains exact. Positive skill-target hit timing, hero-causes-condition declaration, resistance/immunity order, fully resisted applicability, zero lifecycle, multi-condition selection and cross-copy ordering remain unresolved. The four legacy duration gaps (`crusader-holy-lance`, `highwayman-wicked-slice`, `highwayman-open-vein`, `hellion-bash`) stay SOURCE_DURATION_UNRESOLVED. Duration must never be copied from amount. Ordinary Debuff duration is SOURCE_BOUND, while bookkeeping, turn tick, expiry and Debuff resistance consumer remain missing. Those ordinary source facts do not make Charm runtime ready.
- **Damage/Wound:** Damage Stone Positive stays READY_FOR_IMPLEMENTATION, Negative SOURCE_SEMANTICS_UNRESOLVED, whole card not Ready. Death's Door any amount of Wounds -> one Deathblow roll is source-bound; suffer-wounds equals an ordinary Damage transaction is not. Modifier semantics, hero-takes-damage timing, zero-final-Damage, equivalence and full trigger surfaces remain gated.
- **Healing:** Chirurgeon's battle Skill slices stay PARTIAL. Neither battle-only nor all-healing scope is proven. Rest, Provision, Hamlet, other Trinkets and campaign healing are not added to the trigger.

## Runtime ROI and priorities

| Work | Affected cards | Current whole-card gain | Priority / disposition |
|---|---:|---:|---|
| New generic voluntary declaration source closure | up to 16 reopened | 0 until new evidence and full evaluation | P0 |
| New hero-caused-condition timing closure | 4 reopened | 0 until new evidence and full evaluation | P0 |
| New Chirurgeon scope closure | 1 reopened | 0 currently; highest isolated unlock | P1 |
| New Damage/Wound source closure | 1 reopened | 0 currently | P1 |
| Movement consumer (Book of Constitution, Protective Padlock, Speed Stone choose-one option) | 3 | 0 | P3, behind voluntary |
| Choose-one consumer | Speed Stone | 0 | P3, behind voluntary |
| Gain-action consumer | Berserk Charm | 0 | P3, behind voluntary |
| Dodge contextual consumer, including Speed Stone nested options | 3 | 0 | P3, behind voluntary |
| Remove-all-condition-stacks / gain-quirk consumers | Cleansing Crystal | 0 | P3, behind voluntary |
| Virtue-chance consumer / resolve-test-result window | Dark Crown, Solar Crown | 0 | P3, behind voluntary whole-card gate |
| Crown Negative alone | 2 | 0 | P4 DEFERRED_PARTIAL_SLICE |
| Damage Stone Positive alone | 1 | 0 | P4 DEFERRED_PARTIAL_SLICE |
| Caution Cloak Scout prevent-Stress Positive alone | 1 | 0 | P4 DEFERRED_PARTIAL_SLICE |
| Condition Charm Positive / skill-target condition consumer alone | 4 | 0 | P4, source timing still unresolved |
| Condition duration/resistance transaction, independent duration restoration, Debuff bookkeeping/tick/expiry/resistance | 4 / Debuff-specific 1 | 0 | P3, behind Condition source gate |

The JSON matrix enumerates every live missing primitive, nested choose-one modifier gap, side semantic adapter/proof obligation and whole-card integration requirement. Historical `runtimeSupport.missingCapabilities` is retained only as diagnosis; it is not used to manufacture current blockers.

`cardsPromotedIfImplementedAlone` is an exact computed list under current source gates: empty for every row. `cardsPromotedIfSourceGateClosed` is also empty as a **confirmed** promotion list, with an explicit NOT_ESTABLISHED counterfactual status. A new source closure has unknown content and cannot itself supply future semantic bindings, consumers or proofs. `maximumCardsReopenedForEvaluation` records opportunity separately. In particular, a battle-Skill-only authoritative Chirurgeon scope could nearly promote without new runtime; a broader scope would need new consumers. Neither outcome is asserted in advance.

## Reopen and phase exit decision

STOP speculative Core Trinket runtime work until new authoritative source evidence appears. Do not implement Crown Negative, Damage Stone Positive, Caution Cloak Positive, Condition Charm Positive or Movement solely to increase implemented side counts.

Reopen only when new authoritative evidence closes the named gap and binds the relevant declaration contexts/targets/order/lifecycle. Voluntary can reopen up to 16 cards. Condition can reopen four and potentially raise Level 1 from 7/14 to 11/14 after independent data, implementation and proofs. Chirurgeon is the highest isolated one-card source unlock. Damage/Wound reopens Damage Stone with its Positive already ready for implementation. Every reopening still requires whole-card re-evaluation and production acceptance.

C1C21 should choose another source-complete Complete Edition workstream after inspecting the remaining inventory: non-Core Trinket sets, Quest/Boss/Encounter, deck/profile integration or release acceptance. This phase does not select or implement that next workstream and does not create repetitive gap-research phases without new evidence.

## Artifacts and verification

- `c1c20-core-trinket-coverage.json`: all 37 live cards, exact ready IDs, selectors, invariant results, optimistic runtime completion simulation and historical hashes.
- `c1c20-core-trinket-terminal-blocker-register.json`: 22 exact blocked cards with one upstream root each.
- `c1c20-core-source-gap-register.json`: four inherited roots and authoritative reopen criteria.
- `c1c20-core-runtime-roi-matrix.json`: source closure opportunity, downstream primitives and deferred partial slices.
- `c1c20-core-source-delta.json`: baseline/current source bytes, scan scope and acquisition limitations.

`npm run audit:complete-edition-c1c20` regenerates these deterministic artifacts. `npm run verify:complete-edition-c1c20 -- --contract-only` checks exact C1C19 lineage/tree, frozen history, package/path allowlist, live coverage/selector/ROI invariants, source delta and adversarial mutations. It invokes the original C1C18 and C1C19 **validateArtifacts** source/semantic gates against their reconstructed live expectations. Their old phase-only package/path allowlists cannot accept later phases; C1C20 enforces the new aggregate package/path/history guards without modifying those old files.

The new unit suite checks exact inventory, partition, current versus historical diagnosis and downstream upstream links. Fifteen independent mutations reject Ready 16, Not Ready 21, runtime-only Damage Stone, implementable Charm Positive, Movement immediate gain, Crown/Caution partial promotion, Chirurgeon voluntary classification, omitted/duplicate assignments, full-deck completeness, root-blocked Ready, missing upstream links, substituted exact Ready IDs and optimistic 37-card runtime promotion.

Full verification runs C1C17, C1C16, C1C15, C1C13, C1C12, C1C11, C1C10, C1C9, C1C8, C1C7, C1C6, C1C5 E2E, npm test, typecheck and build. It restores two known volatile audit files, reruns the source/contract/invariant gates and writes exact HEAD/tree plus output hashes to `tmp/c1c20-verification/receipt.json`. Contract-only mode is not full-regression acceptance. No gameplay runtime, type, store, component or production adapter changes are made.

An initial full run stopped on C1C11's single `page.reload` 60-second timeout before fixture import. The verifier now permits at most one retry only for exactly one failed E2E with that reload-timeout signature, and no expect assertion failure. It saves the complete failed-attempt output and its hash, records the retry in the receipt, and requires the retry to pass. Other failures, assertion failures and a second timeout stop verification. Historical tests and their timeouts remain unchanged; retries are not presented as a clean first attempt.
