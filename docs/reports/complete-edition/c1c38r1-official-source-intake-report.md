# C1C38R1 official source intake

Baseline: `dcf017cb2065440251caad8d31075b99bc6355e0` (accepted C1C38, `THING_SOURCE_CLOSURE_BLOCKED`). Branch: `codex/phase-11a4-c1c38r1-thing-official-source-intake`. Intake date: 2026-10-02.

Outcome: **THING_OFFICIAL_SOURCE_INTAKE_PARTIAL**. Gate A remains false. Thing runtime implementation, C1C39 and premature C1C38R2 ruling closure remain unauthorized.

## Source accounting

| Classification | C1C38 | C1C38R1 |
| --- | ---: | ---: |
| OFFICIAL_SOURCE | 86 | 107 |
| SOURCE_UNRESOLVED | 46 | 24 |
| PROJECT_RULING_REQUIRED | 23 | 24 |
| PROJECT_RULING | 0 | 0 |
| Total fields | 155 | 155 |

Twenty-one source fields close. One source field, equally Crowded Area selection, becomes an explicitly unapproved digital candidate after review of the applicable official targeting rules. No field disappears, no field becomes execution-irrelevant, and none of the original 23 digital candidates is approved or rewritten. Every original unresolved field has an individual transition record, reason and source/review references in the R1 matrix.

## Inventory and source binding

The local publisher print archive contains 245 files, including 243 PDFs and 4334 PDF pages. Of those PDFs, 219 were outside the C1C38 locked manifest. The repository media inventory covers 1401 files, including source caches and `.bin` sheets, and 224 source metadata/manifest/definition documents with term-navigation results. Dependency, build, test-output, scratch and assistant-state directories are explicitly excluded as non-source work products. Every listed archive/media/metadata file has a SHA-256 and a non-authoritative inventory classification. Forbidden FAQ provenance entries are hash-only and excluded from navigation. All 243 archive PDFs received text navigation searches; this is neither visual review of all 4334 pages nor proof of rule absence from search misses.

The newly indexed Color of Madness rulebook, packaging and print pages provide official evidence. The acceptance manifest records publisher, title, original archive path/hash, committed file/hash, page count, relevant page or component, date, authority, applicability and supported fields. Direct page review is recorded separately, with locked PDF and rendered-page hashes. Archive names, TTS records, and community asset grouping do not establish applicability or supply.

Canonical findings are bound to actual official content:

- Color of Madness is a standalone session outside the main campaign (rules p2; box p2). It follows Onslaught, Resting and Boss Fight phases (rules p4, p7).
- Thing is an `EXPANSION_SPECIAL_ENCOUNTER` final Boss. Its setup expressly uses crystal-emblem Room 3, Aggressive Stance, the corresponding tile Area and two Initiative Cards (rules p8; tile front p2).
- Defeating Thing ends the fight and makes the party victorious; surviving summons do not add a kill-all requirement (rules p8). A Hero death ends the session in defeat (rules p4), while full escape/retreat handling remains unresolved.
- Main-campaign Face the Threat, active Threat lifecycle, campaign-level Boss scaling and campaign Quest progression are not imported into the standalone route. The source-bound Thing Battle Level remains I; no II/III cards are synthesized.
- Sacrificial Stab and Abyssal Artillery I–III print +1/+2/+3 Damage versus Eldritch. These specific board-game Hero interactions close the tag field; no universal or videogame tag behavior is added.
- Crystalline Aberration I has a complete source-only definition from the official card print. Both skills target All Heroes. Their self effect remains 10 Wounds after the action finishes. Unprinted stats retain `PRINTED_ABSENT`. Content-set binding is official; supply and digital interruption/save representation remain separate.

The three Thing cards and six source-bound sides, all existing Battle stats and effects, two normal actions, the free pre-first-action Skill 3 trigger, self 5 Wounds and target Stress +2 remain byte-frozen C1C38 facts. New print pages corroborate these sources without replacing the historical artifacts.

## Remaining blockers and source review

The official rules list **two Crystalline Aberration miniatures**, and the official print has one Level I stat-card slot and one Level II slot. Those observations do not establish two simultaneous Level I physical combat copies or a Level-specific ownership/return ledger. Counts of other named miniatures are recorded independently of summon eligibility. Thing has one officially listed miniature. The core borrowing instruction supplies four Hero and four Monster Initiative Cards; Thing setup uses two Monster entries.

Two source-scope discrepancies are recorded and halt affected promotion:

1. The Thing rulebook section (p8) says it spawns a Level I Aberration. The frozen Ability and official Ability print say to summon as many Monsters as possible, including at least one Aberration I. The minimum member is compatible, but neither establishes the exhaustive remaining pool, count/selection algorithm or precedence. R1 does not replace the Ability with an exactly-one algorithm.
2. The rulebook component list totals 99 tokens (44 Shards, 22 Healing Crystals, 8 Focus Point/Aberration, 10 Curio, 1 Light, 14 Buff). The packaging aggregate says 33 Tokens. Both are recorded; no total or scope is silently selected.

The 24 hard source gaps are: 14 summon-pool/count/selection/supply/return fields; two Aberration membership/supply fields; three physical census fields; terminal reward, escape/failure and cleanup; omitted-resistance defaults; and Return trigger exclusivity. The official two-Shard Monster-kill reward, immediate Thing victory and Hero-death defeat are partial facts, not a substitute for complete terminal reward/retreat/component-return instructions.

Requests are grouped into three actual source needs in `c1c38r1-missing-official-source-request.json`: Thing summon and shared physical supply; standalone ending/escape/reward/cleanup; and generic combat defaults/trigger boundaries. Each group lists exactly covered fields, sources already reviewed and why a project ruling cannot replace missing canonical physical content.

Official external navigation recovered no usable additional board-game file. No community, FAQ, forum, Wiki, videogame, TTS-script or prototype semantics were accepted. The failed official navigation is recorded with date/location and authority NONE. Repository print evidence supplies all new canonical bindings.

## Guards and validation

Production registry/capabilities still exclude `thing-from-the-stars`, and its player route is false. Source-only definition data lives under audit artifacts; no Thing gameplay, adapter, selector, dispatcher, reservation or UI is created. Prototype production reachability remains zero. Existing runtime source bytes remain unchanged.

The C1C38 checkpoint is registered in the immutable-baseline verifier, covering all committed C1C38 artifacts, sources, scripts, tests and reports. C1C37 and existing Boss successor compatibility remain required. The R1 verifier is in the Production release gate. Twenty-three adversarial mutations plus three positive checks test canonical source boundaries, physical-supply separation and production guards.

Local execution receipts are under `c1c38r1-validation/`. Final branch HEAD requires its own completed/success Production release gate; that run is reported in the chat after the final commit rather than by making a recursive post-run evidence commit.

Local results: dependency install, typecheck, full tests (2795 passed; 0 failed/pending/todo), production build and all requested historical/immutable/successor/C1C37/C1C38/R1 commands passed. The immutable verifier also reran the old Prophet foundation suite in its accepted checkout (2729 passed; 0 failed/pending/todo). The R1 suite passed 26 checks. No runtime semantics changed.
