# C1C18 Damage Stone: Wound / Hero-Takes-Damage source contract

Verdict: **C1C18-DAMAGE-STONE-WOUND-CONTRACT-SOURCE-EXHAUSTED-STILL-UNRESOLVED**.

This is a source/feasibility gate, with primitive Outcome C. Several Wound facts are proven, especially Death's Door and the one-roll rule, but the complete `suffer-wounds` modifier contract and exact `hero-takes-damage` timing are not proven. No Damage Stone runtime adapter, UI, selector change or single-side promotion is authorized by this evidence.

Level 1 remains **7/14**, Level 2 **4/11**, Level 3 **4/12**; completeForRandomDraw remains false. Level-1 Ready: Accuracy Stone, Archer's Ring, Critical Stone, Sage's Book, Survival Guide, Warrior's Bracer and Warrior's Cap.

## Frozen sources and baseline

Baseline HEAD: `d7bd56c65db32ef0cb8aa2a2c365c27f1df95b18`; C1C17R implementation: `e7f4b4a94940ebc714301912a93f7fc9a173fd93`; implementation tree: `041f20ad33911f73e68eee6d5799a9d0ac733ff9`. C1C17 and all earlier Complete Edition data/reports are frozen byte-for-byte. Production source remains unchanged.

Official source: `docs/DD_EN_COREBOX_RULES.pdf`, SHA-256 `9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae`. The PDF is locally bundled but Git-ignored; its hash is independently bound to the committed C1A rulebook evidence at the exact baseline. Verification requires this local source, not a generated transcript alone.

All 44 PDF pages were extracted directly with pdfplumber. Full-page and column text, page numbers, column bounding boxes in PDF points, search hits and the source hash are saved in `c1c18-rulebook-extracted-evidence.json`. Relevant pages 19, 20, 21, 26, 27, 28 and 29 were rendered and visually inspected. Text extraction can omit pictograms and corrupt apostrophes; card tokens come from the frozen visual/literal source rather than OCR guesses. Exact phrase searches may have zero hits because the book uses inflections, pictograms or numbers between words; all Wound and Damage hits and relevant neighboring sections were examined. Pages 37 (PvP) and 40-42 do not supply a general Damage Stone timing or modifier-equivalence rule.

## Official facts and what they establish

| Page / region | Source semantic fact | Contract consequence |
| --- | --- | --- |
| 19 / right column, Accuracy | Successful skill Damage applies an equal number of Wound tokens; healing removes tokens. | Damage converts to Wounds. This does not prove all Wound instructions are Damage transactions. |
| 20 / right column; 21 / left column | Conditions apply Wounds simultaneously; Bleed applies the token's indicated Wounds and Blight uses the same form. | Periodic Wounds are a source grammar beyond attacks. |
| 20 / right column, Bleed example | The current injury is called three Wounds; the next-round injury is called two Damage. | Wound and Damage prose overlap in this example. Printed token distinction alone does not prove mechanically different resolution, and this example does not establish universal pipeline equivalence. |
| 21 / right column, Protection | Protection halves Damage from attacks, rounding up. Resistance/immunity describes Conditions. | No blanket rule makes all naked `suffer-wounds` instructions pass through attack Protection, damage modifiers or condition resistance. |
| 26 / left column, Trinkets | Trinkets require active declaration, resolution and flipping; once per turn in battle. | A passive damage event cannot automatically consume the Negative. |
| 27 / left column, On Guard | The same takes-Damage wording introduces a reduction of the damage amount. | The wording alone cannot establish an after-commit opportunity. |
| 28 / left column, Syphilis | Taking Damage can lead to a separate Wound-per-level consequence. | Printed Damage and Wound grammar remain distinct; recursion and trinket ordering are not specified. |
| 29 / lower left, Death's Door | At Life Wounds a hero enters Death's Door; Wounds cannot exceed Life. At that state suffering any amount instead rolls the Deathblow die. | A single `suffer 2 Wounds` instruction at Death's Door rolls once, not twice. A skull kills, otherwise survive. |
| 29 / upper right continuation | Simultaneous Bleed and Blight cause one roll; removing at least one Wound leaves Death's Door. | One-roll simultaneous batch rule is source-backed; separate transactions must not be silently merged. |

Machine-checkable facts store page, region, bounding box, required extracted text, exact semantic proposition and PDF hash. The verifier checks these facts against a fresh direct extraction of the actual PDF.

## Q1-Q6

**Q1:** Wound tokens record injury up to Life. `HP = Life - Wounds` is a convenient representation inference, not a universal equivalence statement. At Death's Door Wounds cease to increase and the instruction causes a die roll, even though the HP delta is zero.

**Q2:** Applying Wounds is not unconditional `wounds += N`. Normal injury is bounded by Life; already at Death's Door, a suffering instruction is replaced by a Deathblow roll. The book does not authorize normalizing every Wound instruction into the repository's fully modified Damage pipeline.

**Q3:** Protection is explicitly described for Damage from attacks; resistance/immunity concerns Conditions. No explicit general rule states how all Damage-taken modifiers apply to a naked `suffer 2 Wounds`. Keep protectionApplies, damageModifiersApply, damageResistanceApplies and equivalentToDamage null. This is uncertainty about the complete primitive, not uncertainty about the proven p29 rule.

**Q4:** Proven: one roll when already at Death's Door and suffering any amount, including two Wounds. Multiple Wounds are not multiple rolls. Simultaneous conditions also cause one roll.

**Q5:** A permanently dead hero is ineligible for active declaration. Fail closed and offer no Damage Stone opportunity. This is the active living-subject policy; no card-specific posthumous exception is inferred.

**Q6:** No explicit zero-final-Damage take-Damage definition was located. A hit is not evidence that Damage was taken. requiresPositiveAppliedAmount remains null; zero-final-Damage applicability fails closed.

## Timing and death ordering

Negative source trigger status: **SOURCE_UNRESOLVED**. Existing runtime scope status: **RUNTIME_SCOPE_PARTIAL**. firesAfterCommit and firesBeforeCommit both remain null with `SOURCE_TIMING_UNRESOLVED`.

The card is not an incoming-damage prevention instruction. `before-incoming-damage-applied` binds to `hero-hit-by-attack`, not `hero-takes-damage`, so Protective Padlock's window is not exact for this card. The On Guard rule shows that takes-Damage language also appears in amount-changing effects; the general active-Trinket paragraph does not order this Negative relative to HP commit, Death's Door entry, passive consequences or original Deathblow. Neither pre-commit nor post-commit ordering is promoted to source fact.

`damage-stone-deaths-door-contract` records four cases:

| Original damage outcome | Proven Wound behavior if a distinct instruction occurs afterward | Damage Stone eligibility now |
| --- | --- | --- |
| Still HP > 0 | Injury tokens bounded by Life | Fail closed: exact timing/modifier semantics missing |
| Newly enters Death's Door | A subsequent two-Wound instruction at Death's Door would roll once | Fail closed: cannot assume commit precedes declaration |
| Already at Death's Door, original Deathblow safe | A distinct later two-Wound instruction would roll once | Fail closed: taking-Damage applicability and ordering missing |
| Already at Death's Door, original damage permanently kills hero | Dead subject cannot declare | Ineligible |

Any future staging contract must preserve original continuation, open an active opportunity, accept Use/Decline and resume exactly once. It needs a stable rootEventId with heroId, sourceType, sourceActorId, sourceSkillId, originalAmount, finalAppliedAmount, previousHp, nextHp and damageEventId. These are future requirements, not implemented fields.

## Complete printed Wound grammar inventory

The normalized trinket registry contains two `suffer-wounds` cards, both inventoried with literal text, normalized sides, source references, visual region and current asset hash:

| Card | Source grammar |
| --- | --- |
| Damage Stone (`community-trinket-core-damage-stone`) | `hero-takes-damage -> equipped-hero -> suffer-wounds 2` |
| Thirsting Blade (`community-trinket-color-of-madness-thirsting-blade`) | `hero-attack-misses -> suffer-wounds 3` |
| Book of Sanity (contrast) | `Suffer [damage]6` |

Damage Stone's source is `c1a-source:tts-path:/ObjectStates/59/ContainedObjects/7`; image `src/assets/community-reference/complete-edition/trinkets/core/level-1/453-6.front.png`, SHA-256 `41f3f9bb8852c83e5403a9f153a74305fbba9bb13a2b575271838763738a7c9b`. Its positive literal is `[damage]+3`; Negative uses the Wound token. Source-supported and empty unresolvedFields describe card recognition only. No token is rewritten, and the expansion card is not implemented.

## Runtime surface audit

`c1c18-damage-runtime-surface.json` enumerates all 17 production calls to the two primitives, discovered from TypeScript call expressions rather than matching comments. Sixteen can damage heroes; the final-encounter ancestor-Wounds call targets a monster and is explicitly excluded. Every row includes actual caller/line, pipeline, source hash, amount observability, identity, pause/resume, persistence, Death's Door and passive-event coverage.

Campaign callers: exploration hunger/trap/rubble, trap-room entry, room hazards, quirk self damage, quirk/disease scaled self damage, active-trinket self damage and Mammoth Cyst attacks. Quirk/disease damage is derived and deliberately suppresses passive re-emission. Trinket self damage synchronizes campaign vitals back to BattleUnit after resolution. Room hazards and Mammoth Cyst have upstream transaction identifiers, but continue downstream consequences synchronously.

Battle callers: ordinary hero skill target damage, staged and legacy monster attacks, combined Bleed/Blight batch, mental self damage, guardian pit entry, guardian special attack, final encounter attack and additional leaf damage. Bleed/Blight are one batched primitive transaction after independent modifier calculations. Upstream ids do not create a damage-wide active continuation.

The hp/wounds write audit also examined creation/load, healing, upgrade clamping, battle-to-campaign settlement, permanent death, linked-monster removal and stress Heart Attack. These do not add a hero take-Damage transaction. No independent threat direct-HP damage caller was found; actual quest/boss/hazard callers are listed rather than assuming every requested category is a separate implemented route.

`resolveDamage` deduplicates command.eventId (last 200 persisted ids), commits vitals, and only then emits passive damage-resolved for eligible non-derived survivors. Dead subjects and duplicates short-circuit. Ordinary modifier-zero damage returns early, but its Death's Door branch can still roll and emit after zero modification. The event has only type/hero identity: no final damage amount, source transaction payload or saved active continuation. HP delta alone cannot detect positive damage at Death's Door.

`applyBattleUnitDamage` has no passive event or event id. Caller-local applied amounts are observable but are not preserved as unified root events. Saving vitals and existing attack checkpoints does not preserve a damage-wide Use/Decline checkpoint. Battle/campaign synchronization is state synchronization, not trigger equivalence. Consequently damage-resolved is at most a partial detection candidate; it is not the exact active window.

## Positive feasibility and whole-card readiness

Positive is **READY_FOR_IMPLEMENTATION**, with source `hero-skill-resolution -> skill -> damage +3`. Existing `RUNTIME_WINDOW_BINDINGS` maps after-attack-roll-before-hit-resolution to that exact trigger/target. `resolveTrinketOpportunity` accumulates damage modifiers into PendingBattleAction.damageBonus, `getPendingTrinketBonuses` returns it and hero rawDamage consumes it. The window/consumer exists; Damage Stone's adapter does not.

Positive remains NOT_IMPLEMENTED. Negative remains SOURCE_SUPPORTED / SOURCE_SEMANTICS_UNRESOLVED. Whole-card productionReady=false. Both original blockers remain: `NO_EXACT_ACTIVE_TRINKET_PRIMITIVE_SUFFER_WOUNDS` and `TRINKET_TRIGGER_WINDOW_MISSING:hero-takes-damage`. No equivalence reuse or exact Wound consumer is claimed.

Bleed, Blight, Debuff and Stun Charms remain deferred for `hero-caused-condition-source-contract`. Under Outcome C, C1C19 should research that contract instead of implementing Damage Stone.

## Verification

`npm run audit:complete-edition-c1c18` generates five deterministic source/feasibility/surface/matrix JSON artifacts from the direct extraction and live registry. It does not modify historical evidence or gameplay. To regenerate PDF research, run `scripts/audit/extract-c1c18-rulebook.py` using Python with pdfplumber installed.

`npm run verify:complete-edition-c1c18` checks exact baseline lineage/tree, frozen historical/literal/normalized/PDF hashes, live normalized sides, all suffer-Wounds cards, all primitive call sites, live capability matrix, readiness counts and exact selector subset. It rejects gameplay/history changes and false contract promotion. Eleven mutation cases reject false resolution/equivalence, incorrect Deathblow count, altered extraction/region, removed grammar/caller, scope promotion, pre-commit assumptions and readiness drift.

The full verifier freshly re-extracts the PDF, directly runs C1C17, C1C16, C1C15, C1C13, C1C12, C1C11, C1C10, C1C9, C1C8, C1C7, C1C6 and C1C5 E2E commands, then npm test, typecheck and build. It preserves the two historical volatile official-source audit files, rechecks contract invariants afterward, and writes per-command logs/hashes and exact HEAD/tree receipt under `tmp/c1c18-verification`. `--contract-only` runs the contract/mutation checks without claiming regression acceptance. No production-diff requirement is used.
