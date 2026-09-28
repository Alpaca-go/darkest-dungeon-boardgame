# C1C26 Necromancer Source Closure

Baseline: 2ba8942bbd080b49260f9cba117729a000ebcddf. Verdict: C1C26-NECROMANCER-SOURCE-CLOSURE-ACCEPTED means source classification accepted, not gameplay/build/E2E acceptance.

75 baseline leaf usages before and after, 9 categories before and after; closed 0, still bounded 75, terminal 0. Refined contract fields are separately enumerated (45) and are not additional baseline blockers. Physical 9; literal 9/9; local semantic 3/9; family semantic 0/9; source-gated 9/9; runtime eligible 0/9; Ready 0/9.

| Category | Remaining baseline usages | Resolution status |
| --- | ---: | --- |
| BONE_IDENTITY_UNRESOLVED | 3 | BOUNDED_STILL_UNRESOLVED |
| CLEANUP_DESTINATION_UNRESOLVED | 2 | BOUNDED_STILL_UNRESOLVED |
| EFFECT_ORDER_UNRESOLVED | 1 | BOUNDED_STILL_UNRESOLVED |
| LOWEST_ROLL_HERO_TIE_UNRESOLVED | 13 | BOUNDED_STILL_UNRESOLVED |
| ROOM_CAPACITY_INTERACTION_UNRESOLVED | 3 | BOUNDED_STILL_UNRESOLVED |
| SOURCE_PRECEDENCE_UNRESOLVED | 15 | BOUNDED_STILL_UNRESOLVED |
| SUMMON_COPY_POLICY_UNRESOLVED | 28 | BOUNDED_STILL_UNRESOLVED |
| SUMMON_COUNT_UNRESOLVED | 6 | BOUNDED_STILL_UNRESOLVED |
| TARGET_TIE_UNRESOLVED | 4 | BOUNDED_STILL_UNRESOLVED |

## Ten required answers

| Question | Answer | Source status / consequence |
| --- | --- | --- |
| Lowest-roll Hero tie resolved? | UNRESOLVED | SOURCE_BLOCKED; only Level II/III Hamlet tie effects, not static Room descriptors |
| Crowded Area tie resolved? | UNRESOLVED | SOURCE_BLOCKED; p24 character priority and movement choice do not settle Area ties |
| Every Skill summon count resolved? | UNRESOLVED | SOURCE_BLOCKED; nine level/Skill rows distinguish one Area from multiple Hero hits |
| Finite Bone copy policy resolved? | UNRESOLVED | SOURCE_BLOCKED; 3 Rabble/Soldier/Spearman miniatures observed, not reuse/exhaustion rules |
| Rabble / Rubble precedence resolved? | UNRESOLVED | SOURCE_BLOCKED; preserve both literals; no alias/erratum invented |
| Reanimation casualty ordering resolved? | UNRESOLVED | SOURCE_BLOCKED; threshold/removal facts known, immediate respawn integration unknown |
| Room capacity fallback resolved? | UNRESOLVED | SOURCE_BLOCKED; nearest ties and nowhere-available fallback unknown |
| Boss trio cleanup destinations resolved? | UNRESOLVED | SOURCE_BLOCKED; Room discard then Hamlet deck return is newly explicit, not Boss trio storage |
| Any terminal source blocker? | NO | Designer FAQ/later corpus unexamined; access failures do not prove exhaustion |
| C1C27 Runtime Foundation allowed? | NO | NECROMANCER_SOURCE_CLOSURE_CONTINUATION; no complete source-safe gameplay slice proven |

## Evidence and narrowing

The locked core rulebook pages 6/7 distinguish finite miniature component quantities from supply policy. Captain has one named miniature entry; full Large combat card 46600 and narrow artwork 46111 remain separate physical components. The p17 two-slot rule supports Large combat use but does not explicitly associate these digital representations or resolve the combined copy instruction gap. Captain is a Level II Dungeon Threat dependency, never a normal Bone Skill summon.

Core p19 selects one Target Area and rolls once against each Hero; p20 gates Target effects on successful hits. Core p38 singular placement prose does not explicitly choose between one summon per Skill and per successful Hero. No engine defaults are accepted. Core p24 death threshold/removal and p17 initiative removal are documented separately from the immediate Level III Reanimation clause; initiative retention/new spawn, other on-death and simultaneous-first ordering remain null.

Core p25 Room discard and p32 Hamlet return close the Room Card destination sequence. This refines a subfield, closing none of the baseline Boss-trio destination usages. Generic Monster deck return and permanent non-unholy removal remain scoped facts; no within-Battle summon reuse or reserved pool reset is inferred. Core p31 miniature displacement, p38 first empty Stance and printed all-Stances suppression remain separate rules. Room 10 layout and starts are unchanged.

The source precedence artifact retains C1C25 hierarchy and compares five topics. Core p30 explicit Fighting-a-Boss physical flip/expiry is preserved despite p35 campaign summary until-kill wording; this is the existing specific timing interpretation, not a newly reversed authority hierarchy. Rabble/Rubble remains an unresolved literal conflict.

Direct retrieval receipts record exact URL, HTTP or transport failure, time, known listing identity and query. The [designer FAQ filepage](https://boardgamegeek.com/filepage/250715/darkest-dungeon-board-game-faq-by-the-designers) and file list returned 403 during the recorded curl attempts. The publisher FAQ lead had DNS failure without an HTTP response; a later official production-file lead returned 404. Earlier web-tool failures supplied no HTTP code. These do not prove permanent unavailability. The [designer file listing](https://boardgamegeek.com/boardgame/317321/darkest-dungeon-the-board-game/files) identifies a designer-uploaded candidate; its PDF filename/version/download ID/hash remain unknown. The [Scribd mirror](https://es.scribd.com/document/686825056/DD-FAQ-EN), [house-rule thread](https://boardgamegeek.com/thread/3008011/house-rules-and-clarifications-suggested-rulebook) and [later-file news lead](https://www.wargamer.com/darkest-dungeon-board-game/files) are search leads only, with no rule authority. No later production corpus or official revision has been authenticated and examined. Terminal checks therefore fail for all nine topics.

## Partial readiness and next action

It is not necessary for all nine cards to close before any future static primitive can be considered. Four source-complete/runtime-missing primitive scopes are identified: setup descriptors, Threat physical flip/expiry, Room layout/starts and full-Stance suppression predicate. Full Threat lifecycle also executes blocked Hamlet/Captain/Reanimation effects; basic Skills include unresolved summons. No complete independently validated gameplay slice or implemented non-reachable dispatch gate is proven. A proposal to stop at descriptors would bring Ready gain 0 and currently lacks the required full-slice proof; partial runtime is not selected.

Next action: C1C27 Necromancer Source Closure Continuation. Acquire authenticated FAQ/correction or later official file contents; answer the bounded per-topic questions in the exhaustion register. Other families are not selected while these remain bounded. Implementation is prohibited in C1C26.

## Frozen scope and validation limitations

All baseline tracked files except the three allowed package script additions are checked against C1C25 Git objects with line-ending-only differences tolerated; frozen upstream source metadata also receives exact-byte SHA256 checks, covering upstream sources/assets, C1C20–25 contracts, gameplay, AI, UI, selector, save/replay, Act IV and other families. Upstream counts remain Trinket 15/37, Quest 3/75, census 278, Hamlet Event 16 literal/5 local semantic/0 Ready, ordinary Boss 231/20 families, Battle114/Threat51/exclusive Ability12/Identity54.

C1C25 Windows CSS repeated-hash/path-length build failure remains BUILD_ACCEPTANCE_UNVERIFIED. C1C26 does not modify bundler tooling. Historical C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout remain open; browser E2E is not fully accepted. Actual validation commands and outcomes are recorded in c1c26-validation-report.md.
