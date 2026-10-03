# Phase 11A.5 C2A — Hero Official Source Census

Outcome: **HERO_SOURCE_CENSUS_PARTIAL**. All 18 Hero groups and all 199 transport owners are accounted. The printed identities of 36 PvP boards and 126 front Skill families, including all 378 Skill Level fronts, are bound to locked official print pages. The 37 transport Profile owners remain unresolved. No runtime implementation, prototype promotion, numerical Skill transcription, or C2B authorization occurs.

Baseline: `7f4001b956cac441778dbb457cc33041f9057ad5` (C1C38R1, `THING_OFFICIAL_SOURCE_INTAKE_PARTIAL`). Branch: `codex/phase-11a5-c2a-hero-official-source-census`. Policy: `RULEBOOK_ONLY_SOURCE_POLICY_V1`.

## Accounting and the official print correction

| Ledger | PvP Hero boards | Profile cards | Skill cards/owners | Total |
|---|---:|---:|---:|---:|
| Raw TTS owners, excluding additional States | 36 | 37 | 126 | 199 |
| Official print slots in the reviewed print edition | 36 | 37 | 378 | 451 |

The official **The Darkest Heroes** box, page 2, lists **34 Hero PvP Cards, 35 Hero Cards, and 357 Hero Skill Cards** for the 17 alternate-art classes. It explicitly excludes the Musketeer promo. The locked Musketeer print PDFs contain 2 PvP, 2 Profile and 21 Skill front/back page pairs. Together these give 451 distinct print slots. Therefore the expected 199 is a transport-owner count, not a retail printed-card count. The extra 252 printed Skill slots correspond to the two additional Level cards virtualized as TTS States. This does not turn a Level State into an extra TTS owner or an extra logical Skill.

This is a count-basis correction grounded in the official component list and distinct print pages. It does not change frozen C1C22 discovery evidence, claim an additional 252 logical Skills, decide retail supply across original and alternate-art copies, or guess that the art editions have identical numerical mechanics.

The exact class set is Abomination, Antiquarian, Arbalest, Bounty Hunter, Crusader, Flagellant, Grave Robber, Hellion, Highwayman, Houndmaster, Jester, Leper, Man-at-Arms, Musketeer, Occultist, Plague Doctor, Shieldbreaker and Vestal. Discovery's `Hound Master` is retained as a locator alias; the reviewed printed class title is `HOUNDMASTER`.

Each class has two PvP owners, seven Skill owners and 21 Skill Level fronts. Ordinary classes have two Profile owners. Abomination has three: Human I / Beast I, Human II / Beast II and Human III / Beast III. All three are retained. Ordinary Profile print pairs show I / II on the first card and III / an illustrated back on the second card.

## Source and visual evidence

The new source asset directory contains twelve complete official print PDFs and five single-page official context extracts. Full originals were located through C1C38R1's frozen repository source inventory and checked against its original SHA-256 receipts. The manifest records original locator/hash, vendored path/hash, page range, supported classes and authority classification. The official Core rulebook page 6 and Warrens/Cove/Weald box page 2 establish the core and expansion class groupings. The Darkest Heroes box establishes the alternate-art print family and Musketeer exclusion.

Authority comes from the locked publisher print content. Local archive paths and Steam image hosting identify storage/transport only. No FAQ, forum, Wiki, video, videogame or TTS script clarification was acquired or used.

All official Skill fronts and backs, all official Profile fronts and backs, and all official PvP fronts and backs were rendered and directly reviewed. Per-Hero atlases and scoped transport crops are hash locked. The separate `reviewed-transport-bindings.json` records the observed printed name, Roman marker, official document/page and image hash for every available front. Audits look up these observations by object path; TTS State keys and similarity scores are not Level authority. The similarity navigation file is explicitly non-authoritative and is not used to choose Skill identities.

| Binding scope | Bound | Unresolved |
|---|---:|---:|
| Hero class printed identities | 18 | 0 |
| Transport owner front identities | 162 | 37 |
| Full owner front/back pairs | 128 | 71 |
| Skill Level fronts | 378 | 0 |
| Skill Level backs correlated to transport | 276 | 102 |

The 36 PvP front/back pairs and 276 available Skill backs were directly correlated. Four of 86 unique transport URLs remained unavailable after retries: the shared Profile front and back sheets and two Skill back sheets. The 82 successful downloads have receipts. Original transport downloads remain a recoverable ignored local cache; the reviewed crops, atlases and receipts are checked in. They remain `DISCOVERY_TRANSPORT_ONLY`.

The source-gap register records 37 Profile correlations and 102 Skill back correlations individually, while the request groups them into Profile transport recovery and the two Skill-back transport sheets. **No official front print document is missing.** Recovering these transport associations is still necessary for a complete GUID/CardID-to-print census. Existing official Profile pages are listed as candidates, never silently assigned by CardID, DeckID or container position. All 18 per-Hero contracts remain `CENSUS_PARTIAL`; no fully complete Hero subset is claimed.

## Special structures and prototype comparison

Abomination's transformation family has `Transform to Beast` on the front and `Transform to Human` on the back at each Level. Future schema work must preserve the two action identities, form restrictions, transition and all-allies targeting. The census retains seven front Skill families; it does not erase the paired back action. Flagellant's printed conditional clauses, separate self effects and condition transfer, and Shieldbreaker's visible per-Level range/ignore-icon variations are recorded as future schema gaps. Their numerical and timing semantics are deferred to literal closure.

The comparison covers all eight current Hero definitions, 28 current Skills, eight Hero Level profiles and `SKILL_LEVEL_BONUS`. Exact names support identity matches only; abbreviated names are partial candidates, and absent or placeholder names remain explicit. All runtime values and hand-authored profiles remain prototype-only. In particular, matching `Smite`, `Hew` or `Noxious Blast` does not make the current HP, damage or Level scaling official. The generic bonus table is prohibited as future production authority.

C1C19 condition evidence and gaps, C1C31 required-Hero combat coverage, and the C1C31R Dodge table are reused without reclassification or editing. `C1C31-DIGITAL-DEFAULT-v2` remains a preserved project ruling; the newly acquired official Profile pages can trigger a future C2C rebaseline review, but do not alter current precedence. The existing C1C38R1 Occultist source evidence is linked separately.

## Freeze and validation

C1C38R1 is registered in the immutable historical baseline list. Thing remains on `SOURCE_ACQUISITION_HOLD`, with Gate A false, runtime unauthorized, no production capability and all existing source contracts, unresolved counts and ruling candidates unchanged. The C2A verifier checks every baseline `src/` and Complete Edition data file against the accepted Git content and rejects live candidate imports. Text hash locks normalize only CRLF to LF for reproducible Windows/Linux checkouts; PDFs and PNGs use raw-byte hashes.

Twenty-seven targeted tests cover the complete class set, independent category accounting, all per-Hero counts, Abomination, unchanged runtime registries, preserved Thing/rulings, and 18 adversarial mutations. They reject prototype values, generic bonuses, transport names/state keys, community/videogame authority, duplicate logical/physical counts, discarded profiles, ignored unselectable classes, missing hashes/pages/gaps and premature promotion. The verifier also compares all generated contracts with the source-derived contracts, catching inconsistent per-Hero copies and added unapproved numerical fields even when counts stay unchanged.

Reproducible commands:

```text
npm run audit:complete-edition-c2a
npm run verify:complete-edition-c2a
npm run test:complete-edition-c2a
node scripts/audit/run-c2a-validation.mjs
```

Local command results and logs are in `c2a-validation/validation-results.json`. The runner requires zero failed, pending or todo tests and executes the requested dependency/type/test/build/historical/immutable/Boss/C1C38R1/C2A chain plus the current built-bundle successor browser smoke. `verify:complete-edition-c2a` is also added to **Production release gate**. Final remote evidence must report `head_sha` equal to the final C2A commit and `status=completed`, `conclusion=success`; an earlier green commit does not qualify.

Local completion on 2026-10-03: all 13 commands passed. The successor regression has **2822 passed, 0 failed, 0 pending, 0 todo**; all 27 C2A targeted/adversarial tests also pass after the final observation-table refinement. Typecheck, build, historical and immutable baselines (including the original C1C35R2B-R1 regression), all three Boss compatibility gates, C1C38R1, C2A generation/verification and the built-bundle successor smoke passed. The CI test-report step additionally rejects missing targeted cases, an incomplete regression set, and nonzero failed/pending/todo counters.

Remote final-HEAD evidence is recorded separately in the final delivery and the ignored local `tmp/c2a-final-head-release-gate.json`, avoiding a self-referential commit of its own CI result. GitHub's installed connector returned 403 for draft-PR creation; branch push and public Actions verification remain available.

## Next decision

Continue **C2A Profile transport and back binding closure**. `identityCensusComplete=false`, `sourceProvenanceComplete=false`, `runtimeProductionReady=false`, `C2BAllowed=false`, and `sourceCompleteHeroSubsets=[]`. Once source binding is accepted, the next phase is C2B Hero Skill & Level Literal Closure, followed by C2C definitions, C2D runtime/save/replay and C2E browser acceptance. Common + Ruins Monsters and then Ruins Room/Tile/Dungeon production data follow the Hero line. This change does not authorize any of those later phases.
