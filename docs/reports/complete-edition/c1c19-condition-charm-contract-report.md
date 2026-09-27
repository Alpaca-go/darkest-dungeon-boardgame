# C1C19 Condition Charm Family: Hero-Caused-Condition Contract

Verdict: **C1C19-HERO-CAUSED-CONDITION-SOURCE-EXHAUSTED-STILL-UNRESOLVED** (Outcome C).

The four cards have exact literal payloads, independent Positive magnitude/duration, and explicit targets. Official stack and categorical resistance rules are recoverable. However, the book does not close the active `hero-causes-condition` insertion point, resistance/immunity ordering, resisted-condition applicability, or zero-duration declaration lifecycle. No staged Condition transaction or Charm adapter is implemented. Ready gain is **0**.

Level 1 remains **7/14**, Level 2 **4/11**, Level 3 **4/12**. The exact Level-1 subset remains Accuracy Stone, Archer's Ring, Critical Stone, Sage's Book, Survival Guide, Warrior's Bracer and Warrior's Cap. Full-deck completeForRandomDraw remains false at every level.

## Baseline and source freeze

C1C18 HEAD: `73da3ae9d0fae07b35fcde23daa6856acdbc514a`; tree: `57525fad7e2897cfcb321c013112fdc6d99a6251`. C1C17R implementation anchor remains `e7f4b4a94940ebc714301912a93f7fc9a173fd93`. All C1C18 and earlier Complete Edition data/reports, normalized trinket data, literal records and Charm images are frozen. No production source, gameplay type, UI, adapter or selector is changed.

Official source is the bundled `docs/DD_EN_COREBOX_RULES.pdf`, SHA-256 `9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae`. A fresh direct extraction of all 44 pages is saved separately as `c1c19-rulebook-extracted-evidence.json`; C1C18 extraction is not rewritten. Page/column, PDF-point bounding boxes, required extracted text, semantic facts and hash bind the contracts to the actual PDF. Pages 20, 21 and 26 were rendered and visually inspected along with all four card fronts. All Condition/duration/stack/resistance/immunity/additional/causing hits and relevant neighboring turn, skill and passive-effect paragraphs were examined. Text extraction can lose pictograms and corrupt apostrophes; literal tokens remain bound to the frozen card observations.

Historical JSON and image hashes are byte-exact. Source TypeScript hashes against the baseline use Git's LF form because some unchanged Windows checkout files contain CRLF; independently recorded live source hashes bind their exact working bytes. The verifier also rejects any production diff, regardless of hashes.

## Exact four-card payloads

| Definition | TTS source suffix under /ObjectStates/59 | Positive, on hero-skill-hits / skill-target | Negative |
| --- | --- | --- | --- |
| community-trinket-core-bleed-charm | ContainedObjects/12 | Bleed, amount 2, turns 2 | hero-causes-condition / condition-being-caused / duration -1 |
| community-trinket-core-blight-charm | ContainedObjects/10 | Blight, amount 2, turns 2 | Same |
| community-trinket-core-debuff-charm | ContainedObjects/6 | Debuff, amount null, turns 2 | Same |
| community-trinket-core-stun-charm | ContainedObjects/3 | Stun, amount null, turns 1 | Same |

All sourceStatus values remain source-supported and unresolvedFields remain empty. This confirms recognition, not timing or production readiness. The four identical Negatives refer to a Condition the declaring Hero is causing; none has a same-named-condition restriction. A Use modifies the duration of a singular Condition, not potency, Damage, every Skill effect, or a Condition on the equipped Hero by default.

Source amount null stays null for Stun and Debuff. C1C9's consumer auxiliary amount=1 is a runtime representation precedent, not a new source magnitude and not a way to derive duration. Bleed/Blight remain potency 2 with duration 2, not two independent one-turn stacks.

## Official facts versus missing card timing

| Official page / region | Bound fact | Limit |
| --- | --- | --- |
| p20 / left, Target Effects | Printed Skill Target Effects occur after other Skill effects and only on a hit. | Does not explicitly order a Trinket's additional Condition or its active declaration. |
| p20 / left, Self Effects | Printed Skill Self Effects occur before other effects, regardless of hit/miss, and ignore resistance/immunity. | Cannot be generalized to Charm skill-target conditions. |
| p20 / right, Stacking | Turn duration sets the token count. Applying the same Condition again creates a separate stack. At the affected character's turn start remove each stack's top token. | Does not define resistance-versus-Trinket ordering or zero-duration Use/blocked records. |
| p20 / right | Bleed and Blight Wounds occur simultaneously. | Does not prove all Condition creation and declaration opportunities are one batch. |
| p21 / left | Bleed potency and duration are distinct; Blight follows Bleed. Stun, Buff, Debuff and Mark have timed stacks. | Legacy amount-only skill objects are not authoritative duration data. |
| p21 / right | Categorical resistance shortens a Condition by one turn; immunity negates it. | No Charm insertion point or percentage-roll ordering follows from this rule. |
| p26 / left | Trinkets are active declarations, resolve/flip, once per turn in battle. | Not passive auto-triggers; different physical copies' ordering is not specified here. |

The current percentage resistance implementation is a runtime fact: d100 for Bleed/Blight/Stun, full block on successful resistance. Hero-level data explicitly labels these percentage values prototype. The official categorical rule cannot prove that d100 is a source rule or where a Charm declaration belongs around it.

## Positive target and timing contract

The Positive source target is **skill-target**, with immutable actual targetUnitId. Existing before-damage-applied binds hero-skill-hits to **skill** for Dark/Solar Bracer damage overrides. That binding is not an exact target-aware Charm window, even though the trigger matches. The existing Trinket effect target union also lacks skill-target, and the condition consumer resolves only equipped-hero.

The alternatives were examined explicitly: hit-confirmed before Damage, after Damage before normal Skill conditions, same creation batch as normal Skill conditions, or another source-bound point. No alternative is selected. `exactInsertionPoint`, `damageConditionOrdering`, `normalSkillConditionBatchMembership` and `deadTargetApplicable` remain null / SOURCE_UNRESOLVED.

For a Skill hit that kills its target, existing heroUseSkill skips normal conditions and applyStatusEffectEvent rejects a dead/unavailable target. That is runtime behavior, not evidence for an official Charm survive-only rule. The unresolved dead-target case fails closed. No Positive opportunity may arise from a miss, or from UI guesses about an attack result.

## Negative timing, resistance and zero duration

The effect is duration -1 on the exact Condition being caused, with sourceHeroId, source Skill/other cause, target and child effect identity retained. It must not change amount or limit itself by the Charm's name.

The book does not distinguish an active Negative declaration before versus after categorical resistance, percentage resistance or immunity. A fully resisted/immune Condition's status as "caused" is not resolved. These fields remain null. The fact that two accepted duration reductions can produce the same number does not close applicability, logs, blocked records, Use Records or cancellation order.

Conditional arithmetic is commutative: **if** both are independently accepted -1 duration operations with a zero floor, either order yields max(0, baseDuration-2). The zero floor and full declaration lifecycle are not inferred from this equation.

Arithmetic 1t - 1t = 0t is clear. p20's token-count rule suggests no lasting stack with zero tokens, but does not explicitly define no-application versus immediate expiry, or whether a declaration can occur after a resistance cancellation and still produce a Use Record. `zeroDurationApplication`, `minimumDuration` and `sourceFloorRule` remain null. The future technical invariant forbids effectiveDuration < 0; the candidate clamp max(0, baseDuration-1) is documented as unproven and unimplemented. Existing categorical code skips at zero while direct applyEffectToUnit can add potency with duration 0; neither code convention becomes the Charm source rule.

The generic Negative cannot be restricted to Bleed/Blight/Stun/Debuff. Mark and Buff are timed Conditions too. Riposte, Guard and Protection are also in the official timed catalogue and lack an ordinary ActiveEffect representation. Immediate stress/shuffle effects are not given an invented turn duration. Missing runtime kinds, missing independent duration and unresolved attribution fail closed.

## Debuff 2t: source resolved, runtime incomplete

Debuff is a Condition, represented by an independent duration-token stack. 2t creates two Debuff tokens. At the affected unit's turn start each stack loses its top token. Reapplying Debuff creates another independent stack, not refresh/merge. The p21 per-stack Crit effect exists while the stack remains; removing an empty stack at exhaustion follows the explicit token/per-stack model. This derivation is labelled as such, and does not resolve zero-turn Charm creation or declaration ordering.

This gives **SOURCE_BOUND** ordinary Debuff duration semantics. It does not give an implemented runtime:

- StatusEffectType, conditionDurations and categoricalResistances have no Debuff key, although ActiveEffect.type permits debuff.
- applyEffectToUnit appends debuffs[] and expressly skips its duration bookkeeping.
- RESIST_KEY_BY_EFFECT omits Debuff, even though HeroResistanceProfile has debuff resistance.
- No Debuff/Buff turn tick or expiry removal exists; stored duration in encounter helper arrays is not consumption.
- Shared Bleed/Blight/Stun duration state sums magnitude and retains a per-type maximum duration, rather than modelling independent source stacks. This is also a generic-scope gap.

Debuff ordinary duration is not falsely labelled source-unresolved simply because the engine cannot consume it. Its Charm modifier/resistance lifecycle remains SOURCE_UNRESOLVED, separately from NOT_IMPLEMENTED runtime duration and resistance consumers.

## Hero Skill and Condition producer census

All **28** current Hero Skill definitions were inventoried, including those with no conditions. getSkillById reads SKILLS for every content profile; normalizeHeroSkill supplies ordinary targeting defaults. The skill-level registry supplies damage/heal increments, not independent condition durations. Its "verified" Level-I label has no authoritative card/page binding and does not restore a missing duration.

There are **4** applyEffects condition entries and **4** legacy duration gaps:

| Skill | Hero | Condition | amount | durationTurns / sourceDuration |
| --- | --- | --- | --- | --- |
| crusader-holy-lance | Crusader | Bleed | 1 | null / null |
| highwayman-wicked-slice | Highwayman | Bleed | 1 | null / null |
| highwayman-open-vein | Highwayman | Bleed | 2 | null / null |
| hellion-bash | Hellion | Stun | 1 | null / null |

All target enemies through frozen skill target identity. All lack sourceReference. sourceDuration remains null and status SOURCE_DURATION_UNRESOLVED; no duration restoration is performed. Existing layer decay, Stun skip counters and categorical amount fallback are recorded as legacy code behavior, never as source duration. There are no current ordinary Hero Skill Blight, Debuff, Mark or Buff applyEffects entries; absence is not a Negative scope restriction. No ordinary Skill currently has multiple effects, but normal Skill plus Charm additions can still form multiple child Conditions.

The surface file also inventories **30** calls to shared condition/layer/array APIs via TypeScript call expressions. It records actual containing functions, arguments, caller locations and source hashes, distinguishes Hero Skill, self Trinket, passive-derived, enemy and encounter reaction routes, and explicitly excludes a hostile reactive Condition from being automatically attributed to its Hero recipient. Live runtime Trinket condition producers and passive condition-self definitions are enumerated as further attribution candidates; the 22 normalized trinket condition-effect sides and all four hero-causes-condition grammar cards are inventoried separately.

Important runtime differences remain explicit:

- Enemy-target heroUseSkill: hit, Damage commit, living-target gate, applyStatusEffectEvent, resistance. Completed events preserve effects and blocked outcomes with replay payload checks; no active Condition interruption exists.
- Self/ally heroUseSkill: heal/stress then direct applyEffects, currently no SKILLS applyEffects on that route. It cannot be treated as shared resistance/event coverage.
- Trinket apply-condition-stack: independent source fields exist for C1C9's equipped-hero Stun slice; skill-target and condition-being-caused consumers do not.
- applyConditionToHero: passive before-apply event and summed layers; duration is logged, not persisted. This is not the active causing-Hero window.
- Guardian/final/Mammoth encounter effects include independent duration inputs and private Debuff arrays, but these enemy/encounter paths do not repair Hero Skill source durations or provide Charm timing.

## Future ConditionTransaction design, without production types

`c1c19-hero-caused-condition-contract.json` defines an unimplemented, source-gated design with rootEventId, conditionEventId, sourceHeroId, sourceBattleUnitId, sourceSkillId, targetUnitId, conditionType, baseMagnitude, baseDuration, effectiveMagnitude, effectiveDuration, resistanceOutcome and sourceEventId.

Conditional proposed granularity is one causing-action root with one child per actual target/Condition. It does not authorize child opportunity ordering. A Use binds one selected Condition, never the entire Skill's effect list. Actual target, source values and child identity are frozen. Already rolled resistance values must persist; reload must never reroll. UI reads authoritative pending state and does not infer applicability. The declaration stage remains null, so no speculative staging window is added.

p26's once-per-turn limit conclusively prevents the same physical Trinket from using its just-flipped Negative after its own Positive in that turn. usedTurnId already consumes this limit. A shared persisted processedTrinketInstanceIds root policy is a proposed safeguard, not timing proof. Decline is not a turn Use; eligibility for a later different child after Decline remains unresolved. Different physical copies retain distinct identities; their active ordering, cross-copy additional-condition applicability and dynamic re-evaluation point remain source-gated.

## Per-side feasibility and outcome

Every Positive has sourceComplete, targetComplete and independent source duration, but timing, runtime target consumption and the complete consumer/resistance slice are incomplete. Every Negative has exact source payload/target but unresolved timing, zero/resistance lifecycle, legacy input gaps, missing duration consumer and partial generic condition scope. Every implementationPossibleNow=false, productionReady=false and productionReadyGain=0.

This is **Outcome C**, not B (three cards fully closed with only Debuff unresolved), and not D (source timing fully resolved but only input data incomplete). RUNTIME_INPUT_DATA_INCOMPLETE is a separate true finding; it does not override SOURCE_UNRESOLVED timing. C1C20 must not implement the family or its Positives speculatively. New authoritative timing evidence and independent source duration restoration are distinct prerequisites.

Damage Stone stays frozen exactly as C1C18: Positive READY_FOR_IMPLEMENTATION, Negative SOURCE_SEMANTICS_UNRESOLVED, productionReady=false. C1C19 does not revisit its rules.

## Verification and acceptance

`npm run audit:complete-edition-c1c19` generates eight deterministic source/transaction/duration/Debuff/surface/gap/feasibility/matrix JSON artifacts. `npm run verify:complete-edition-c1c19 -- --contract-only` checks exact C1C18 lineage/tree, source/literal/visual bindings, complete live skill and condition caller census, duration gaps, Debuff source/runtime classification, existing capability state, selectors and frozen historical hashes.

Twenty-one adversarial cases reject duration=amount, same-named-only Negative scope, Negative target equipped-hero, Positive target skill, invented categorical/percentage/immunity ordering, definitely-caused resisted effects, false Debuff implementation, invented zero/floor behavior, physical recursion, one Use affecting all Conditions, Ready drift, omitted gaps/callers, altered official extraction/region, Positive-only promotion, null Stun source magnitude rewriting and speculative Positive timing. Semantic cases also mutate the comparison mirror, requiring independent source/invariant checks rather than merely JSON inequality.

The full verifier requires a clean tracked contract commit, freshly re-extracts all official PDF pages, and directly runs C1C17, C1C16, C1C15, C1C13, C1C12, C1C11, C1C10, C1C9, C1C8, C1C7, C1C6 and C1C5 E2E, npm test, typecheck and build. It restores the two known volatile official-source audit files, rechecks all contract invariants afterward, and saves exact HEAD/tree receipt plus command logs/hashes in tmp/c1c19-verification. Contract-only mode never claims full-regression acceptance. No C1C19 production E2E or gameplay diff is required.

The acceptance outcome is a complete audit with explicitly unresolved fields, not an unsupported runtime-ready contract. Source payloads, target distinction, independent fields, generic scope, once-per-turn physical policy, ordinary Debuff stacks and all legacy gaps are recorded; every missing timing/order/zero/cross-copy decision remains fail-closed.
