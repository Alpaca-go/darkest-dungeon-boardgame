# Phase 11A.4-C1C32R2C — Ruins Production Runtime Executor Closure

## Verdict

`C1C32R2C-RUINS-PRODUCTION-RUNTIME-DEPENDENCIES-NOT-CLOSED`

`PRODUCTION_THREAT_RUNTIME_INTEGRATION_NOT_READY`

The production ordinary-Battle entry remains gated. C1C32R3 and C1C33 are not authorized. This work does not create C1C32R2D. The pinned ruleset remains `C1C32R2B-DIGITAL-DEFAULT-v5`; no v6 or historical ruling edits were made.

Baseline: `6c8dd14b855dd8996d2f01fc5591c9f27db58d67`. Branch: `codex/phase-11a4-c1c32r2c-ruins-production-runtime-executor-closure`.

## Implemented runtime

- Ordinary Battle initialization binds the actual drawn card copies, printed source definitions, four Heroes, printed Stances, Tile Areas, inherited Large v3 occupancy and drawn initiative. It does not generate a second encounter or use prototype Monsters. Heroes retain the explicit v2 Dodge binding.
- Source Monster turns select typed Skills from the locked Stance/d10 table. Target priority, Guard, marked-first selection, exact graph distance, Speed movement and tied destination choices are executable. If exact Range cannot be reached, available movement approaches that Range before skipping the attack.
- A printed attack uses one persisted roll for all targets. Self effects run after that roll and before target resolution. Each target enters the existing incoming reaction window, freezes the result, commits damage and continues without rerolling. Printed accuracy, Crit, marked damage and Buff/Debuff modifiers use a shared attack primitive.
- Typed effects cover independently timed condition stacks, removal, Stress/Light, healing, Disease acquisition and Area plus Stance Shuffle. Guard, Riposte and printed Protection use the ordinary combat path. Riposte calculates from incoming damage before the defender's Protection; reflected damage also respects its recipient's printed Protection. Party effects and non-targeted critical Area Stress are not duplicated for each target.
- Room dispatch consumes typed source rules and hooks into end turn, end round, passive, interaction, Shuffle and the last living Monster's movement. Direct healing/status calls honor Room passives. Interactions enforce AP, Area, no-Monster requirements and source usage flags. The Room Trinket reward invokes the existing source-complete draw/acquisition gate and fails atomically when its deck is incomplete.
- Ordinary movement uses the existing Large displacement contract. Saved choices preserve candidates, target exclusions, parent events, remaining effects and attack continuation. The inherited one-space overflow remains validated by the frozen v3 module. The auxiliary normal-character movement lives in this phase's module; the historical module is unchanged.
- Card copies and miniature copies have separate finite ledgers. Printed inventory is Rabble 3, Soldier 3, Spearman 3, Captain 1. New Necromancer summons reserve both a source card and miniature, as official p38 requires. Reanimation reuses the same physical pair. Ordinary ownership remains intact, cleanup returns only its owner's reservations, and saves reject duplicated or forged bindings.
- The real Graveyard receipt proceeds through actual Quest selection into saved `ACTIVE_QUEST`, then a legal Standard Quest end command into saved `EXPIRED`. A separate reload test raises Stress from 9 to 10 through the existing Stress/death pipeline and proves the fatal Graveyard outcome without another Resolve Test.

## Exact remaining blockers

### 1. Initial draw with mixed two-Large layout

`INITIAL_DRAW_MIXED_TWO_LARGE_LAYOUT_POLICY_ABSENT`

Code: `src/game-engine/ruins/encounter-draw.ts`, initial placement binding. Reproduction: Level III, seed **147**, Room 2. The leading cards are Bloodletter Large, Raider Normal, Captain Large. The first two cards occupy three Stance slots; the next Large cannot bind the remaining slot. The command throws `Official initial placement could not bind` without mutating the input.

The accepted official p17 extract and R2B review describe replacing the last non-Large after **three Monsters**. The v5 ruling adds discard return timing for that reviewed branch. Neither pins treatment of this prefix containing only two Monster cards. No discard, return or reordering policy was inferred at runtime. This is a newly exposed executable contract omission, retained as `SOURCE_UNRESOLVED`.

### 2. Stance Shuffle intersecting a two-slot Large card

`LARGE_STANCE_SHUFFLE_SLOT_COLLISION_CONTRACT_ABSENT`

Code: `src/game-engine/ruins/printed-effect-runtime.ts`, Stance Shuffle. A source Captain at Aggressive and source Rabble at Ranged reproduces the collision when the Rabble's self Pull moves one Stance. The interpreter rejects `SOURCE_UNRESOLVED: LARGE_STANCE_SHUFFLE_SLOT_COLLISION` atomically.

Official p17 specifies two Stance slots for a Large card; p21 specifies Shuffle by spaces and shifting other characters. The inherited v3 contract resolves spatial Area displacement/overflow. It does not provide the missing Stance permutation when a one-space Shuffle intersects a two-slot card. An explicit successor project ruling review is required before this case can execute. No change to v1–v5 was made.

The two contract reviews, source hash and reproduction are preserved in `docs/data/complete-edition/c1c32r2c-required-contract-review.json`.

### 3. Room reward cannot draw from the frozen incomplete Trinket corpus

`ROOM_TRINKET_SOURCE_COMPLETE_DRAW_UNAVAILABLE`

Code: `src/game-engine/ruins/room-runtime.ts` calls `drawSourceCompleteTrinket` in `src/game-engine/trinkets/draw-trinket.ts`. Its existing coverage gate rejects the frozen incomplete source corpus. A successful source-complete reward and acquisition cannot be accepted. Failed interaction leaves AP, use receipts and inventory unchanged.

C1C20 remains frozen at 15/37. No invented Trinket, partial random pool or silent reward replacement was introduced. This is an inherited executable dependency, not a new rules ambiguity to resolve by creating v6.

## Coverage and acceptance are distinct

The focused suite passes **72/72 tests across 9 files**. All 24 source Monster identities participate in Stance/d10 and typed Skill traversal; the 56 Skills participate in printed attack/effect checks. All 9 Rooms and 14 source rules participate in dispatch checks. These tests also include saved choices, physical ownership, multi-target critical Stress and the real Graveyard lifecycle.

However, source fixture searches explicitly skip the omitted initial Large layouts. Monster traversal explicitly accepts only the named Large Stance rejection as a blocked case. The Room reward test accepts only the existing source-complete deck rejection, without claiming reward success. Therefore these tests do **not** prove 24/24 production Monsters or 9/9 fully executable Rooms.

| Gate | Actual state |
|---|---|
| Source Monster candidates / typed Skills | 24 / 56 |
| Missing source-bound drawable definitions | 0 |
| Accepted production Monsters | 0; promotion withheld |
| Accepted complete Rooms / rules | 0 / 0; promotion withheld |
| Monster adapter / extended interpreter complete | false; blocked Large Stance case |
| Room executor complete | false; blocked source-complete reward |
| Ordinary draw / initialization complete for production | false; mixed Large initial layout |
| Inherited Tile final visual validation | true; frozen R2B evidence retained |
| v5 reviewed replacement return policy | true; unchanged |
| Card/figure reconciliation and ownership domain proof | true |
| Graveyard `ACTIVE_QUEST`, `EXPIRED`, fatal Stress after reload | true |
| Historical v1–v5 preservation | true |
| Remaining identified dependency blockers | 3 |

The machine-readable acceptance matrix is `docs/data/complete-edition/c1c32r2c-runtime-dependency-matrix.json`. The audit validates it against the actual runtime blocker list and hash-bound test evidence. `--verify` returns nonzero while dependencies remain open.

## Source policy and limits

Only the existing locked official rulebook extract and printed component definitions were consumed. The narrow review used Core Rules p17, p20–21, p24–25 and p38, with source hash `9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae`. There was no broad PDF intake, FAQ/community lookup or runtime text parsing.

The physical summon proofs use the existing source v2 Boss domain alongside v5 ordinary draw ownership. They do not claim a full v5 Boss product route. Hero commands continue using the established Hero engine; general Hero combat conversion and UI navigation are not proven by these source Monster fixtures. The full Preparation Day path, Scenario C, Captain/Reanimation product route and Boss Room victory browser proof remain R3 integration work, subject to dependency closure. No new choice UI was introduced, so no new UI route acceptance is claimed.

The detailed command results and build classification are in `c1c32r2c-validation-report.md`.
