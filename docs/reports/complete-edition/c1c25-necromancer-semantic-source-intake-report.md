# C1C25 Necromancer semantic source intake

Verdict: C1C25-NECROMANCER-SEMANTIC-SOURCE-INTAKE-ACCEPTED

Baseline: 179bc367299952d693e9adb81ddd311b42a475b0, codex/phase-11a4-c1c24-boss-source-intake. This accepts the reproducible intake and source gaps, not completed execution semantics.

## Nine locked core cards

Physical 9; literalComplete 9; semanticComplete 0; sourceGated 9; runtimeCandidate 0; Production Ready 0. Three narrative identity cards have card-local selection semantics; family execution dependencies prevent promoting them. No external component changes the C1C24 census.

| Level | Identity card | Threat / Ability physical card | Battle card | Printed Life | Named summon / printed monster level |
|---|---:|---:|---:|---:|---|
| I | 42000 | 42003 | 46037 | 77 | Bone Rabble / I |
| II | 42001 | 42004 | 46038 | 103 | Bone Soldier / I |
| III | 42002 | 42005 | 46039 | 144 | Bone Spearman / II |

Level links have printed, same-container and core p11/p30 evidence. Core composition is source-bound at every level; full encounter composition remains gated on finite summon copy/exhaustion policy. Stats are on Battle cards, not narrative Identity cards. No campaign-level default is applied to Bone cards.

## Threat and Ability

Core p11/p30 and printed clauses bind Hamlet/Dungeon triggers. Both passives cease immediately when the physical card flips to Ability upon entering the Boss Objective Room. This is an explicitly sourced physical flip; Threat and Ability are not simultaneous. One action per round is printed, with no Boss flee round limit (p30). Level I permanently removed monsters remain removed after passive expiry. Level II Army of the Dead is a first-Battle Bone Captain spawn; Level III Reanimation is immediate first non-large death per Battle with no-space suppression. The latter still needs casualty/initiative ordering clarification. Threat trigger and expiry are closed; no fabricated round-end expiry or battle Threat draw deck.

## Targeting and Skill effects

All three Skills use Crowded Area targeting, with target counts 2 / 2 / 4. Range is 1 / 2 / 2; skill D10 table is 1-3 / 4-6 / 7-10 in all Stances. Core p19/p20/p24 bind one attack roll with per-Hero Dodge comparisons, Self Push 1 after the roll even on a miss, then damage and successful Target effects. Multi-target summon count remains unresolved. p24 Stance priority is retained for monster character targeting; tied Crowded Areas need an explicit Area rule.

Haunted Graveyard / The Restless Dead lowest-roll Hero ties remain LOWEST_ROLL_HERO_TIE_UNRESOLVED. Monster targeting text does not establish a Hamlet die tie rule. No random, active-Hero, first-player or player-choice fallback is adopted.

## Bone identities and discrepancy

Original source sheets/cells independently bind Bone Rabble, Soldier, Spearman, Courtier, Defender and Captain. Only Rabble / Soldier / Spearman are named by Boss Skills; Courtier / Defender are not added to the summon roster. Bone Captain is a separate Level II Dungeon Threat dependency; its full Large combat card and narrow artwork component are not merged as copies. Bone Rubble is not found as a printed monster name in this acquired set. Printed Bone Rabble versus core p38 Bone Rubble remains UNRESOLVED / SOURCE_PRECEDENCE_UNRESOLVED; TTS naming agreement is corroboration, not erratum authority. Candidate component counts are observations, not infinite summon supply or invented reuse rules.

## Full Stance, Room and setup

Full-Stance precedence is closed by explicit scope: the printed Boss Ability suppresses summoning when all Stances are occupied, p38 uses first empty Stance, p31 displaces miniatures for Room Area space, and p17 handles a large-Monster initial draw. No generic full-Stance replacement is inferred. Nearest-available-Area tie / nowhere-available fallback remains a source gap.

Room Card 44709 is 10—Necromancer Room. Exact tile object 51494f (10-11) uses ImageSecondaryURL, which visibly prints 10; the primary side prints 11 and is not the Necromancer side. Eight visually annotated Areas have capacities 3 / 4 / 3 / 4 / 2 / 2 / 2 / 4. All Hero Stances start in the lower central Area; Boss Aggressive starts in the upper central high-ground Area. Named summons go to the Skill Target Area. Room identity, layout and starting locations are bound for all levels; no Room-specific functional text is printed beyond BOSS. Setup contracts use p16/p30/p38, and cleanup ends the Battle, removes summons and advances Campaign Level / Act. Exact post-defeat destinations of the Boss trio remain unresolved.

## Capability and C1C26

External dependencies BOUND 5/10 (one Quest dependency remains explicitly OUT_OF_SCOPE). 75 unresolved usages across 9 execution source topics are registered with null values and evidence. All nine cards remain family source gated. Existing Necromancer prototype and position-based AI are audited as insufficient consumers of these contracts; no gameplay code is changed. Whole-family ROI yields NECROMANCER_SOURCE_CLOSURE_CONTINUATION / NEXT-NECROMANCER-SOURCE-CLOSURE-CONTINUATION. C1C26 Necromancer Runtime Foundation is NOT allowed.

The next closure targets are: BONE_IDENTITY_UNRESOLVED, CLEANUP_DESTINATION_UNRESOLVED, EFFECT_ORDER_UNRESOLVED, LOWEST_ROLL_HERO_TIE_UNRESOLVED, ROOM_CAPACITY_INTERACTION_UNRESOLVED, SOURCE_PRECEDENCE_UNRESOLVED, SUMMON_COPY_POLICY_UNRESOLVED, SUMMON_COUNT_UNRESOLVED, TARGET_TIE_UNRESOLVED. They are bounded questions; failure to access the designer FAQ is not proof of terminal source impossibility, so no other family is selected. The search evidence records exact queries, the [designer FAQ listing](https://boardgamegeek.com/boardgame/317321/darkest-dungeon-the-board-game/files), inaccessible authoritative content and rejected secondary candidates; no online community mechanics become rules.

## Frozen regressions and validation

C1C20 Core Trinket 15/37 Ready; C1C21 Standard Quest 3/75; C1C22 census 278; C1C23 Hamlet Event 16 literal / 5 card-local semantic / 0 Ready; C1C24 ordinary Boss 231 / 20 families and Battle 114 / Threat 51 / exclusive Ability 12 / Identity 54 remain byte-frozen. Other Boss families, Battle engine, UI, selector, save/replay and Act IV are unchanged.

C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout remain open. Complete Edition browser E2E is not fully accepted. See c1c25-validation-report.md for actual verification results.
