# C1C24 validation report

Date: 2026-09-28. Branch: `codex/phase-11a4-c1c24-boss-source-intake`.
Baseline: `877f14bff74a4dd9dfd18ea3fff3e1d8acc0f549` (accepted C1C23).

## Scope and results

- Existing ordinary Boss census: all 231 identities, 20 source families; family/subtype unresolved 0. Excluded Boss Quest 1, Hamlet Event 16, Act IV Guardian 16 and Final Encounter 14 remain separate.
- Exclusive physical subtypes: Battle 114, Threat 51, Ability 12, Boss identity 54, Phase 0, other 0. The 51 duplex Threat cards have Ability fronts; the overlapping Ability-side total is 63, not an extra census.
- Exact original assets: 34 sheets and 462 two-sided crops. SHA-256, Steam URL content SHA-1, decoded MIME/size/dimensions, acquisition receipts, deck grids, physical paths and cell bounds validated. All 462 crops rebuilt byte-for-byte from original sheets.
- Printed intake: 56 both-sided literal complete, 175 partial, 0 not extracted. All 462 OCR rows remain unreviewed drafts, excluded from completion authority.
- Semantic complete 0; source gated 231; runtime candidate / production Ready / Ready gain 0. Every unresolved field is registered, and family/matrix/ROI/decision artifacts reproduce from source.
- C1C25 selects Necromancer source-semantic intake: 9/9 literals, exact three-level structure and core p38 setup; no runtime foundation selected.

## Commands executed

| Command / selection | Result |
|---|---|
| `npm run audit:complete-edition-c1c24` | PASS; deterministic JSON and source report regenerated after final observations / decision corrections |
| `npm run verify:complete-edition-c1c24` | PASS; all original assets, 462 byte-rebuilt crops, artifacts, source gates and baseline Git scope |
| `npm run typecheck` | PASS |
| `npx vitest run src/audit/c1c21-standard-quest-live-rebaseline.test.ts src/audit/c1c22-boss-encounter-live-inventory.test.ts src/audit/c1c23-hamlet-event-source-intake.test.ts src/audit/c1c24-boss-source-intake.test.ts` | PASS; 4 files / 68 tests, including the full 462-crop reconstruction |
| `npx vitest run src/audit/c1c20-core-terminal-blockers.test.ts` | PASS; 1 file / 17 tests |
| `npx vitest run src/audit/c1c24-boss-source-intake.test.ts -t 'partitions families'` | PASS; final ROI counterfactual, 1 selected test / 20 skipped |
| `git diff --check` and `git diff --cached --check` | PASS |

The regression total is 85 distinct passing tests across C1C20-C1C24. The final decision-only rerun additionally proves that making Necromancer ineligible selects Prophet and does not attach Necromancer-specific Bone / Graveyard gaps to that family. The first combined test invocation included a nonexistent C1C20 filename; Vitest selected only the other four files. C1C20 was then explicitly run using its actual filename above.

## Corrections and limits

An initial regression run passed 84/85 tests and failed an assertion that treated same-name/level components as identical crop-byte copies. Original-resolution review confirmed different white/black circular header glyphs in eight Frozen Farmhand / Shambler Tentacle cards. The final contract preserves four candidate pairs, each physical identity and each observed glyph, rejects printed-duplicate equivalence, and registers unresolved variant/copy meanings. This was a source correction, not relaxation of hash verification. The repaired 21 C1C24 tests pass; exact crop-byte groups remain independently recorded.

Lower-half Threat title review also corrected low-resolution readings (including Visions of a Bleak Future, Uneasy Times, and Parasite Spread). The original Shambler wording “Win the lowest number of days” and printed Bone Rabble versus rulebook Bone Rubble are preserved without silent editorial repair. Six initial asset transmission failures remain in acquisition history; all URLs were eventually acquired, with zero final unavailable sheets. Three front sheets were copied from exact-content verified original cache bytes.

No app bundle build or browser E2E rerun was performed for this source-only phase. Existing C1C21 historical failures remain open: C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout. This report does not claim Complete Edition E2E fully accepted.

## Frozen boundaries

C1C20 remains 15/37 Ready; C1C21 remains 3/75 Ready; C1C22 locked census remains 278. C1C23 remains 16 literal / 5 card-local semantic / 16 source-gated / 0 Ready; its accepted hashes and assets are frozen. Face the Threat! retains REST_INSUFFICIENT_RECOVERY_CAPACITY. Act IV accepted code, ordinary gameplay, engines, selectors, UI, save/replay and Hamlet runtime have no changes. The verifier rejects any tracked baseline diff outside the explicit C1C24 audit/data/assets/report paths and three package scripts. Pre-existing untracked work and temporary review outputs were preserved and excluded from the commit.
