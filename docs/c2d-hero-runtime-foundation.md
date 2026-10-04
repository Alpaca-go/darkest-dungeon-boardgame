# C2D Hero production runtime foundation

Baseline: C2C `e1e9f27c882000bee59cec115ec0d1b3f7fcb5de`.

The controlled engine entry is `beginProductionHeroSession` followed by
`applyProductionHeroInput`. Construct the party explicitly with
`createProductionHero` and `makeProductionHeroUnit`, select
`PRODUCTION_HERO_SELECTION`, and provide the shared Area topology and active
actor. Normal campaign creation retains `LEGACY_HERO_RUNTIME_V1`; C2D adds no
Stagecoach, Guild, selector or Battle UI rollout.

## Definitions and execution

The build consumes mechanically generated `runtime-profiles.ts` and
`runtime-skills.ts`: 54 Profile levels and 378 Skill levels covering 18 Heroes.
Exact resolvers enforce ownership, level and Abomination form. No prototype
fallback or level formula supplies printed values. Binding IDs, printed absence,
target groups, both card faces and deferred semantic clauses survive projection.
Source literals, provenance records and Hamlet abilities stay in the audit path.

Actions advance through activation validation, explicit target selection, one
stored roll, Self effects, frozen target outcomes and effects, reactions and
commit. Multi-option movement retains an explicit PendingChoice. Shared damage,
healing, stress, conditions, Area movement and seeded runtime helpers perform
their existing work. Source-backed Profile Dodge is also used by shared incoming
Boss attacks; legacy Boss Dodge retains its historical ruling.

The eight C2C ambiguity groups remain deferred. A localized skipped-clause event
records the stable action, field, target, deferred ID and versions without RNG.
Independent clear effects continue. Transform records the proposed form change
without committing the deferred transition. Conditional modifiers and ignored
defenses retain their structured operands without inventing the unresolved
modifier phase. Hamlet execution remains outside C2D.

## Saves and replay

Version 23 adds explicit runtime/definition selection. Version 22 migration keeps
legacy Hero and Skill identities, including prototype-only IDs, and adds legacy
selection metadata. Existing legacy repair behavior remains available.

Production saves retain the session origin and input journal, RNG/clock/ID
cursors, selected and frozen targets, rolls and outcomes, effect cursor and
receipts, PendingChoice candidates, and staged form transition. Validation
replays the controlled inputs and compares the complete gameplay checkpoint;
restore rejects mismatches rather than repairing production state. This is a
deterministic consistency contract, not a cryptographic signature on save files.

The checkpoint encoding and controlled deployment contracts are versioned
`PROJECT_RULING` records with `canonical = false`, documented in
`docs/data/complete-edition/c2d-hero-runtime-contract.json`.

## Verification

The C2D audit and verifier generate and compare the required executable evidence
under `docs/data/complete-edition/c2d-*.json`. Focused suites cover the projection,
all Hero levels, all Skill plans, per-Hero execution, semantic outcomes, replay,
tampering, legacy saves and malicious module graphs. The bundle proof uses the
actual emitted Rollup module graph and a clean build at the exact C2C baseline.

Original C2C definitions, policy and acceptance files remain frozen. Original
historical suites execute in their accepted checkouts; current successor
compatibility checks continue to compare gameplay and real save/reload behavior.
Historical v22 snapshot hashes retain their original envelope version.

The release workflow runs the full regression suite, build, historical and Boss
compatibility checks, C2A/B/C checks, C2D audit/verifier and built-bundle browser
acceptance. Final release acceptance requires the remote **Production release
gate** to complete successfully with `head_sha` equal to the final C2D commit.
That exact-commit receipt is external to the commit itself.

C2E owns the full player path and any decision to retire legacy Heroes.
