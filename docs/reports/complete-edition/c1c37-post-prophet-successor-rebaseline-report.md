# C1C37 — Post-Prophet successor rebaseline and next family selection

C1C37 starts at `87f123b881fbbc44d79c312fe1aebb34eadea240` on
`codex/phase-11a4-c1c37-post-prophet-successor-rebaseline`. This phase changes
successor infrastructure and selects a source-closure workstream. It implements
no next-Boss gameplay and promotes no additional family.

## Historical acceptance and current compatibility

C1C36 remains an immutable historical checkpoint: 2745 tests passed, zero
failed/pending/todo, browser Levels I–III passed, and the exact accepted commit
passed [remote release gate 36921892599](https://github.com/Alpaca-go/darkest-dungeon-boardgame/actions/runs/36921892599).
The historical verifier checks ancestry and all committed C1C36 artifact bytes,
including scripts, tests and browser evidence. It checks acceptance identity and
the production decision without rerunning the long historical browser campaigns.

`C1C37-BOSS-SUCCESSOR-COMPATIBILITY-v1` independently checks current behavior.
The complete C1C35R2A Necromancer suite and its accepted capture origin remain
unchanged. Prophet compatibility executes existing source-bound production
fixtures and current player-entry/cross-Quest transactions. It compares definition,
stance, occupancy, physical Pew, action, choice, Rubble, Threat, Tavern, save,
cleanup and progression outputs against a capture made in detached C1C36.
The capture-origin command independently reproduces these expectations from the
accepted commit. No evolving shared runtime file hashes are frozen.

Node compatibility proofs are controlled behavioral tests. Historical C1C36
browser evidence remains the full production gameplay acceptance evidence.
The new built browser smoke is explicitly smaller and establishes bundle parity.
No existing C1C36 test or original historical incompatible assertion is weakened.

## Production dispatch and dependencies

Live dispatch no longer imports the C1C36 acceptance report. Production
configuration declares only Necromancer's accepted versions and Prophet's
`C1C35R2-PROPHET-DIGITAL-DEFAULT-v1`. Promotion is checked against an independent
family/version recognition table and executed compatibility suites. Unknown
families and versions fail closed in the selector and player-entry gate.

The shared printed `PRODUCTION_FACE_THE_THREAT_QUEST` remains the player route.
Per-family `selectRuleSetVersion(campaign)` and `dependencies(version)` keep
selection and dependency identities explicit. Prophet's Hero Dodge dependency
remains `C1C31-DIGITAL-DEFAULT-v2`, separately from its Boss ruleset and capacity
ruling. Legacy Necromancer equality remains an explicit family binding.

Shared state, damage, RNG, initiative, ownership, choices, causal events and
campaign transactions are reusable. Core/Ruins eligibility, three campaign
Levels, a reserved objective Room, persistent Threat hooks and Face the Threat
are contracts of the accepted routes. They are not assumptions about expansion
or roaming encounters. The capability artifact records the relevant API review.

## Built production application

Run `npm run build`, then `npm run test:e2e:built-bundle-successor`. Playwright
starts `vite preview` against the existing dist and never rebuilds with test
controls. It creates a Complete Edition campaign through player controls, selects
a source-backed Standard Quest and reloads its save. It then loads a valid,
transaction-constructed accepted pre-Quest Prophet prerequisite, uses the visible
Face the Threat selector to reserve Room 11/Tile 11 and verifies exact reload.

The smoke records external requests, page errors, source-module requests and raw
rulebook requests. Isolation follows every reachable emitted JS chunk, including
dynamic imports and preload dependency tables, and rejects the forbidden debug
patterns. A child-chunk adversarial test protects this scan. Per-build hashes bind
the fresh browser observation to the current dist; they are not a permanent
successor runtime hash gate.

## Refreshed locked-source survey

The survey recomputes all 18 remaining families from individual locked physical
definitions and hash-verifies every front/back crop. Necromancer and Prophet are
excluded from ranking. It records literal/semantic completeness, source gaps,
components, prototype architecture reuse, shared primitive reuse and projected
save/UI/Battle work. C1C24 census and C1C34 ranking bytes remain unchanged.

Offline reconnaissance also hash-verifies and searches all 24 PDFs in the current
locked official manifest. Its receipt is committed. No selected-family, Star
Thing, Crystalline Aberration, Farmstead or Colour/Color of Madness text hits
were found. Text search is neither rules authority nor proof that a rule is absent.
No external acquisition, community clarification or prototype semantics was used.

| Candidate | Physical cards | Complete literals | Partial definitions | Source gaps | Planning cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Thing from the Stars | 3 | 2 | 1 | 52 | 16 |
| Collector | 18 | 6 | 12 | 315 | 41 |
| Hag | 15 | 6 | 9 | 255 | 44 |

Costs are explicit project estimates. Collector's existing summon/ownership
architecture does not close its larger printed source surface. Hag's Cauldron,
captive Hero and attached-unit lifecycle add save/UI/Battle work. Thing remains
the smallest source surface, so exactly one candidate is selected:
`thing-from-the-stars`, `SOURCE_CLOSURE_CANDIDATE`, production ready false,
runtime implementation authorized false.

## C1C38 development boundary

C1C38 is **Thing from the Stars Official Source Closure & Production Feasibility**.
Start with source review: recover the remaining Battle literal; bind the Battle,
Ability and identity cards; establish encounter/Quest eligibility, content set,
Threat model, Room/tile requirements and campaign Level availability; bind
stats/skills/effects and summon components; identify explicit versioned project
rulings; and produce a Gate A executable field matrix.

Battle's printed Level I does not fill the absent Ability/identity Levels or
authorize three campaign Levels. Identity flavor does not establish a roaming
trigger. Having no physical Threat card in this three-card inventory does not
prove a Threat model. Missing fields remain `SOURCE_UNRESOLVED`; serialization
and unresolved ordering decisions are separately `PROJECT_RULING_REQUIRED`.
No gameplay implementation or production registry promotion begins before the
source/feasibility gate closes. `RULEBOOK_ONLY_SOURCE_POLICY_V1` remains in force.

## Reproduction and release gate

Local current regression: **2757 passed, 0 failed, 0 pending, 0 todo**. The
focused successor/Prophet run passed all 95 tests, including the unchanged 16
C1C36 integration tests and 67 Prophet production tests. Typecheck, production
build, accepted capture-origin reproduction and the built-browser smoke passed.

The workflow runs npm ci, typecheck, full tests, build, historical baseline
validation, immutable phase baselines, both current successor compatibility suites,
Prophet Gate A, original R2A and R2B-R1 historical boundaries, C1C36 immutable
acceptance, built-browser smoke and the C1C37 verifier.

Generate local artifacts with `npm run audit:complete-edition-c1c37` only after
the full test report and fresh built smoke exist. Verify with
`npm run verify:complete-edition-c1c37`. The resulting
`c1c37-successor-acceptance.json` records local test counts and outcome.
An exact-commit remote run remains independent; its actual URL and result are
reported separately so local evidence cannot assert remote success.
