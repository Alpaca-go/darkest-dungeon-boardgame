# Phase 11A.5-C2B — Hero Skill & Level Literal Closure

Outcome: **HERO_LITERAL_CLOSURE_BLOCKED**. All accepted print forms have a complete literal transcription; conflicting official evidence prevents promotion. C2C is unauthorized.

Baseline: `173ca67adf0e9a1fa2af18693c0fc3bc42973217`, accepted `HERO_SOURCE_CENSUS_ACCEPTED`. Branch: `codex/phase-11a5-c2b-hero-skill-level-literal-closure`.

| Source accounting | Expected | Literal complete |
| --- | ---: | ---: |
| Heroes | 18 | 18 |
| Logical campaign Profiles | 54 | 54 |
| Logical Skill identities | 126 | 126 |
| Skill Level forms, both faces | 378 | 378 |
| Master matrix forms | 432 | 432 |

Abomination contributes six gameplay Profile faces within three logical Levels, giving 57 physical gameplay Profile faces overall. Illustrated ordinary Profile backs are excluded from the Level count. The transformation Skill retains Transform to Beast on its front and Transform to Human on its back. Musketeer uses its independent official print corpus.

## Official-source blockers

1. **Crusader / Zealous Speech / Level I / Preparation Days.** The locked Core rulebook page 10 board example prints `Preparation Days -1`. The accepted official Profile I omits this clause. The II/III Profile literals are retained independently; the shared Hamlet action cannot be promoted by choosing a source precedence. Both sources, page hashes, visible clauses and affected forms appear in `c2b-hero-source-conflicts.json`.
2. **Self Shuffle / roll ordering.** The Core rulebook page 20 says Self effects occur after the roll. Page 22's Monster-turn example performs Self Pull before the roll. No ordering is silently selected for Hero Self movement.

Missing precedence or omitted official clarification remains `SOURCE_UNRESOLVED`; no FAQ, community, TTS-script or videogame clarification was acquired. No project ruling was approved.

## Literal and semantic boundaries

Each level uses an independent, visually reviewed print transcription. The manual review tables are hash-locked; the extraction navigation spans never grant acceptance. The official PDF and page references, frozen identity pairs, review atlases and Profile crops remain the evidence. A second visual numeric review corrected twelve initially misread numeric fields; the retained `numeric-second-review.png` witnesses those corrections. The split embedded `Acc 1` text on Collect Bounty II is a navigation defect: its visibly printed value is `Acc 10`.

Every absent printed scalar stays absent. In particular, omitted Crit is not zero. Omitted Accuracy remains an absent literal, with the separate official page 19 rule that such a Skill requires no roll. Area range and printed usable Stances are distinct; no targetable Stance restrictions are invented. Profile boot counts are **Hero Movement**, as labelled on page 10, rather than a printed initiative Speed number.

All combat and Hamlet glyphs are retained. Skill pictograms remain illustrative, with unresolved executable meaning and `executionRequired = false`. Wounds (black heart with red outline) are officially bound and are distinct from Damage (red lightning). Bleed, Blight, durations, Self/Target arrows and conditions are separately inventoried. Flagellant's adjacent Bleed/Blight predicate glyphs retain their printed adjacency without inventing AND/OR. Transfer-stack handling, transformation timing, modifier phases and movement ordering remain grouped semantic gaps.

Semantic accounting: 51 forms have complete source and candidate semantics; 381 remain partial. Of those, 378 require a future versioned digital serialization contract review and 123 also have unresolved source semantics. These categories overlap. The executable-field matrix records authority, canonical status, explicit absence, literal status and semantic status separately. This is preparation for C2C, never runtime registration.

The Dodge comparison covers all 54 Hero/Level pairs against `C1C31-DIGITAL-DEFAULT-v2`; it does not overwrite that ruling. The C1C19 successor links preserve the historical artifacts and identify the stronger printed evidence: Holy Lance and Wicked Slice print no Bleed, while Open Vein and Barbaric Yawp supply independent durations.

## Deliverables and checks

The fourteen requested master artifacts, the predecessor freeze manifest and all thirty-six per-Hero Profile/Skill files are under `docs/data/complete-edition/`. `c2b-hero-literal-closure-acceptance.json` and `c2b-next-workstream-decision.json` preserve the blocked decision. The predecessor evidence and historical C1C19 files are unchanged. Runtime changes and prototype promotion are both false. Thing from the Stars remains `SOURCE_ACQUISITION_HOLD`, with runtime unauthorized.

`npm run audit:complete-edition-c2b` regenerates successor artifacts. `npm run verify:complete-edition-c2b` checks deterministic saved data, reviewed-input locks, source hashes, all form counts, official conflicts, predecessor evidence and the exact C2A-R1 runtime boundary. A passing integrity verifier does **not** convert the blocked content decision into acceptance.

`node scripts/audit/run-c2b-validation.mjs` runs the requested validation commands and writes local command receipts to `c2b-validation/validation-results.json`. The C2B adversarial suite covers prototype/videogame authority, copied or formula-derived Levels, absent-value defaults, flattened forms, Musketeer substitution, PvP authority, omitted glyphs, silent conflict resolution, missing faces and premature runtime/C2C promotion.

The Production release workflow includes the C2B verifier. Its release receipt must identify the final C2B HEAD exactly; an accepted predecessor run is not a successor receipt. Local command logs and the exact-head remote receipt are execution evidence, separate from this source decision.
