# C1C25 validation report

Date: 2026-09-28. Branch: `codex/phase-11a4-c1c25-necromancer-semantic-source-intake`.
Baseline: `179bc367299952d693e9adb81ddd311b42a475b0`, accepted C1C24 Boss source intake.

## Source results

The same nine Necromancer physical identities retain both complete C1C24 literals. The three core level sets are reconstructable from printed, exact-container and core p11/p30 evidence. Narrative Identity cards have three card-local semantic contracts; family execution gates leave semanticComplete 0/9, sourceGated 9/9, runtimeCandidate 0/9 and Production Ready 0/9.

Six exact original external sheets bind 17 physical external cards, with 34 two-sided crops. These are 16 Bone candidate components and one Necromancer Room Card; none are added to the nine-card core census. Repeated source GUIDs are preserved by exact physical path and crops use physical-path hashes to avoid filename collisions. Original URL SHA-1, SHA-256, geometry, receipts, cell bounds and byte-rebuilt crops pass. Tile object 51494f uses its secondary image: printed Room 10; primary image prints Room 11 and is not bound as the Necromancer tile. Tile bytes, exact original TTS path/side and original core crop hashes pass.

Threat activation/expiry, explicit physical flip, printed combat stats, skill selection, Self/Target effect windows, core composition, Room Card/Tile layout and full-Stance suppression precedence are bound. Five of ten external dependency rows are BOUND, four PARTIAL, and one Quest reward/return dependency OUT_OF_SCOPE. Full encounter composition remains incomplete due to summon copy policy. No mock/videogame rule or generic engine default resolves a source gap.

There are 75 unresolved leaf usages across nine execution source topics (usages are not unique-rule counts): summon copy policy 28; lowest-roll Hamlet tie 13; Bone Captain component association 3; Rabble/Rubble source precedence 15; Crowded Area tie 4; summon count 6; Reanimation casualty/initiative order 1; Room capacity fallback 3; Boss component cleanup destination 2. Each unresolved leaf has an explicit null value, category and source references, and is registered by artifact plus field path. The designer FAQ listing was located, but opening the authoritative file listing returned 403; FAQ contents were not acquired. This is not proof of terminal unavailability.

The machine-derived next outcome is `NECROMANCER_SOURCE_CLOSURE_CONTINUATION`, with `NEXT-NECROMANCER-SOURCE-CLOSURE-CONTINUATION`. C1C26 Necromancer Runtime Foundation is not allowed. The intake verdict accepts reproducible source contracts and honest gaps, not a semantically complete family or playable Boss.

## Commands and observed outcomes

| Check | Outcome |
|---|---|
| `node scripts/audit/acquire-c1c25-sources.mjs` | PASS; six original sheets, 17 exact external physical bindings and Room 10 tile |
| `npm run audit:complete-edition-c1c25` | PASS; deterministic JSON, family matrix, ROI, decision and report |
| `npm run verify:complete-edition-c1c25` | PASS; original TTS/URL bytes, external crop reconstruction, artifacts/gaps/report, upstream hashes and audit-only scope |
| `npm run typecheck` | PASS after removing an unused local variable found during implementation |
| `npx vitest run src/audit/c1c25-necromancer-semantic-source-intake.test.ts` | PASS; 37 tests |
| Combined C1C20–C1C25 audit test selection | PASS; six test files, 122 tests, 59.59 seconds; includes the existing complete 462-crop C1C24 reconstruction |
| `git diff --check` | PASS |
| `npm run build` | FAIL at Vite CSS asset emission after TypeScript compilation and 12,141 modules transformed; repeated hash in output filename exceeds Windows path limits |

The combined regression command was:

```text
npx vitest run src/audit/c1c20-core-terminal-blockers.test.ts src/audit/c1c21-standard-quest-live-rebaseline.test.ts src/audit/c1c22-boss-encounter-live-inventory.test.ts src/audit/c1c23-hamlet-event-source-intake.test.ts src/audit/c1c24-boss-source-intake.test.ts src/audit/c1c25-necromancer-semantic-source-intake.test.ts
```

The 37 C1C25 tests cover census/literal equality, unique source-supported level composition, Threat/Ability physical flip, expiry, null tie status and denied semantic promotion, exact printed combat fields, independently bound Bone identities and printed monster Levels, preserved discrepancy, full-Stance precedence, Room side/layout, dependency/capability gates, complete gap registration, source authority exclusions, frozen totals, decision reconstruction, actual crop rebuilding, and adversarial mutations. Explicit scope tests reject gameplay engine, Boss definitions, Boss selector/UI, Act IV and C1C24 artifact changes.

The build failure is recorded rather than treated as acceptance. The emitted CSS name starts `dist/assets/index-C6s6nAC9-C6s6nAC9-...` and repeats the same hash until the file cannot be opened (`ENOENT`). Application source and `vite.config.ts` are unchanged relative to C1C24; the new source contracts are only consumed by audit scripts/tests. This phase has not proven a clean baseline build reproduction or changed build configuration to fix the bundler problem. Build acceptance remains unverified.

## Frozen boundaries

C1C20 remains 15/37 Ready; C1C21 remains 3/75 Ready; C1C22 remains 278 locked objects; C1C23 remains 16 literal / 5 card-local semantic / 0 Ready. C1C24 remains 231 ordinary Boss objects / 20 families, Battle 114 / Threat 51 / exclusive Ability 12 / Boss Identity 54, with 56 literal complete and 175 partial. The accepted upstream artifacts are compared against baseline Git blob hashes, and the Git scope guard rejects tracked or new out-of-scope changes. Pre-existing untracked `.tmp-*`, `.tmp-crops/`, `src/.tmp-geom-check.test.ts` and `tmp/` review work is preserved.

No Battle engine, Necromancer AI, attack/Threat/summon runtime, monster replacement, selector, Boss UI, save/replay or Act IV code is changed. No other ordinary Boss family, Hamlet Event, Standard Quest or Trinket is changed. `Face the Threat!` retains `REST_INSUFFICIENT_RECOVERY_CAPACITY` outside this intake.

C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout remain open. Browser E2E was not rerun for this source-only phase. Complete Edition browser E2E is not fully accepted.
