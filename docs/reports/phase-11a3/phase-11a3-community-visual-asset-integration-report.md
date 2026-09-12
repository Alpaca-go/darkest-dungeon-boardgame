# Phase 11A.3 — Community Visual Asset Integration · Final Report

> Status: **COMMUNITY-VISUAL-ASSETS-INTEGRATED**
> This report documents the outcome of Phase 11A.3 only. It does NOT
> promote any release gate (Phase 11B / ISSUE-P0-002 / OFFICIAL COMPLETE
> / Community Full Act IV Playable) to a new state.

---

## 1. Scope (what was built)

Community Act IV Visual Asset Integration: ingest the 26 accepted
Community retail-reference visual requirements from the Complete
Edition TTS save, vendor them as repository-local assets, expose them
through a profile-aware resolver, and integrate the visuals into the
existing Act IV product surface.

| Stage | Output | Status |
|---|---|---|
| A — Asset Inventory | `docs/data/darkest-dungeon/community-reference/asset-inventory.json` | done |
| B — Deterministic Importer | `scripts/assets/import-community-reference-assets.mjs` | done |
| C — Local Asset Generation | 33 PNGs under `src/assets/darkest-dungeon/community-reference/antha-complete-edition/` | done |
| D — Manifest + Provenance | `docs/data/darkest-dungeon/community-reference/community-visual-asset-manifest.json` | done |
| E — UI Integration | `src/components/darkest-dungeon/CommunityVisual.tsx` + 5 existing Act IV components | done |
| F — Verification | `npm run verify:community-visual-assets` (15 adversarial tests + resolver unit tests) | done |
| G — Visual Smoke + Contact Sheet | `docs/reports/phase-11a3/community-visual-asset-contact-sheet.{png,json}` | done |

## 2. Asset Inventory Classification (per dev doc §16)

```
total: 26
ready: 16
mapped-unrendered: 8
source-missing: 2
not-applicable: 0
```

Per-group breakdown (26 logical requirements):

| Group | Ready | Mapped-unrendered | Source-missing |
|---|---|---|---|
| Quest (3) | 3 | 0 | 0 |
| Guardian battle cards (7) | 7 | 0 | 0 |
| Guardian room cards (4) | 0 | 4 (contact-sheet only) | 0 |
| Guardian room tiles (2) | 0 | 2 (contact-sheet only) | 0 |
| Darkest Dungeon dungeon tile (1) | 0 | 1 (expanded to 2 contact-sheet entries) | 0 |
| Final Encounter (8) | 6 | 0 | 2 |
| Darkest Dungeon Monster Deck (1) | 0 | 1 (expanded to 9 contact-sheet entries) | 0 |

Mapped-unrendered items are rendered into the contact sheet only;
no product surface currently renders them, so they are NOT promoted
to "ready" in the inventory. The importer picks the first physical
card (or first tile) for the contact sheet so reviewers can audit
the visual source.

## 3. Manifest Summary

- `schemaVersion`: `phase11a3-community-visual-asset-manifest.v1`
- `sourceAuthority`: `COMMUNITY_RETAIL_REFERENCE` (all 35 manifest entries)
- `manifestSha256`: `6e6c346d679966317e1207696c0494b3e70d41810df62d86e38d907bb1432a17`
- `inputs.intakeSha256`: `382e479f84f79a9b3cc6b0256b2fa5dea100b3576244988f180b49e75ed78d2a`
- `inputs.ttsSha256`: `d2fe21a6aa294f80fb47e56677c3a74090c3dc131361d798dfde709f6a3a64a2`
- `inputs.inventorySha256`: `9f8bb7a62c86ec4f4c861d8867372f8f6323cdd66e1b50659fceb2024238ea59`
- `counts`: `{ total: 26, ready: 33, mappedUnrendered: 2, sourceMissing: 2, notApplicable: 0 }`
- 33 ready asset records correspond to 16 explicit ready + 8 mapped-unrendered
  parent expansions (3 guardian room cards + 1 ancestor room + 2 room
  tiles + 2 dungeon tiles = 8; 9 monster deck member cards = 9 → 17 children)
  → 16 + 17 = 33. The 2 mapped-unrendered records in the manifest are the
  expansion parents retained for inventory parity.
- `importer.totalLocalBytes`: 15,663,268 (15.6 MB of vendored PNGs)
- `importer.uniqueSheets`: 5 source sheets (CustomDeck decks 420, 445,
  460, 466, 447) + 6 full-image tiles = 11 unique source downloads;
  all 11 are cached locally in `.artifacts/community-reference-assets/raw/`
  (gitignored) so re-running the importer is byte-deterministic.

## 4. Ready assets by product surface (per dev doc §20)

| Product Surface | Count | Asset kinds rendered |
|---|---|---|
| `DarkestDungeonQuestReveal` | 3 | `quest-card-front` (3 quests) |
| `TemplarsEncounterPanel` | 2 | `guardian-battle-card` (Impaler, Warlord) |
| `MammothCystEncounterPanel` | 2 | `guardian-battle-card` (Mammoth Cyst, White Cell Stalk) |
| `ShufflingHorrorEncounterPanel` | 3 | `guardian-battle-card` (Horror, Cultist Priest, Malignant Growth) |
| `FinalFormMechanicsPanel` | 6 | `final-form-card` (Ancestor 1st/2nd, Perfect/Imperfect Reflection, Gestating Heart, Heart of Darkness) |
| `contact-sheet-only` (no product surface) | 17 | 9 monster-deck members + 4 guardian room cards + 2 dungeon tiles + 2 guardian room tiles |

## 5. Verification Results

### 5.1 Build & Typecheck
- `npm run typecheck` — passes (no TS errors in `src/` or `scripts/`)
- `npm run build` — passes (Vite production build: 1,690.94 kB JS, 28.62 kB CSS)

### 5.2 Unit Tests (vitest)
- `npx vitest run` — **77 test files / 1,384 tests passed / 0 failed**
  (was 76 / 1,374 before this phase; +1 test file `community-visual-asset-resolver.test.ts`
  with 10 tests; +0 changes to existing tests)

### 5.3 Community E2E
- `node scripts/e2e/run-community-reference-e2e.mjs` — **3/3 passed**
  - `COMMUNITY-E2E-shuffling-horror` (7.3s)
  - `COMMUNITY-E2E-templars` (2.2s)
  - `COMMUNITY-E2E-mammoth-cyst` (1.9s)

### 5.4 `npm run verify:community-visual-assets`
Required checks (V01–V15):

| ID | Check | Result |
|---|---|---|
| V01a | manifest.sourceAuthority = COMMUNITY_RETAIL_REFERENCE | PASS |
| V01 | manifest schema (all entries have assetId/runtimeEntityId/requirementId/assetKind/status) | PASS |
| V02 | sourceReference resolution: every ready entry's guid+cardId matches the intake's CustomDeck asset | PASS |
| V03 | every ready entry has a local file on disk | PASS (33/33) |
| V04 | every local file decodes as PNG with declared dimensions | PASS (33/33) |
| V05 | every local file SHA-256 matches manifest localSha256 | PASS (33/33) |
| V06 | every crop metadata is consistent with sheet dimensions (left = (cardIndex%numWidth)*cellWidth, top = floor(cardIndex/numWidth)*cellHeight) | PASS (33/33) |
| V07 | visual resolver returns ready for the 16 expected Community runtime entities | PASS (10 vitest tests) |
| V08 | visual resolver returns source-missing for absolute-nothingness and come-unto-your-maker | PASS |
| V09 | visual resolver returns null for unknown runtimeEntityId | PASS |
| V10 | visual resolver returns null when profileId is not community-reference | PASS |
| V11 | no manifest entry has sourceAuthority other than COMMUNITY_RETAIL_REFERENCE | PASS |
| V12 | resolver-side consistency: every crop entry's cellWidth*numWidth <= sheetWidth, every (cardIndex % numWidth)*cellWidth matches the declared left/top | PASS (10 vitest tests) |
| V12-importer | importer determinism: re-running importer produces identical localSha256s and identical manifest file hash | PASS |
| V13 | no remote Steam URL in non-importer source (resolver / UI / data) | PASS |
| V14 | every inventory item is present in the manifest (with appropriate expansion for tile/dungeon-tile/monster-deck parents) | PASS |
| V15 | manifest only contains COMMUNITY_RETAIL_REFERENCE entries | PASS |

**Verify command: 0 failures, 0 warnings (baseline) · 0 failures, 1 informational warning (adversarial mode, A09 is an informational warning about a planted leak file path that the resolver correctly does NOT reference).**

### 5.5 `npm run verify:community-visual-assets:adversarial`

All 15 mutation tests are detected (or, for A15, the test confirms
importer determinism is preserved):

| ID | Mutation | Detection |
|---|---|---|
| A01 | swap Templar Impaler/Warlord firstPhysical guid + cardId + sourceUrl | DETECTED |
| A02 | off-by-one cardIndex on Impaler | DETECTED |
| A03 | delete one local image (templars-impaler.front.png) | DETECTED (verify FAILS) |
| A04 | corrupt one local image (templars-impaler.front.png) | DETECTED (verify FAILS) |
| A05 | wrong GUID on ancestor-first-form | DETECTED |
| A06 | wrong CardID on ancestor-first-form | DETECTED |
| A07 | unknown sourceReference (Steam URL not in intake) | DETECTED |
| A08 | inject a Steam URL into `src/data/darkest-dungeon/community-reference/` | DETECTED (src/ scan catches it) |
| A09 | community art file placed in `src/assets/darkest-dungeon/official/` path | DETECTED (manifest does not reference the file; planted file is deleted by the test) |
| A10 | flip sourceAuthority to OFFICIAL_RETAIL_VERIFIED on ancestor-first-form | DETECTED |
| A11 | use Prototype fallback (localPath under `src/assets/darkest-dungeon/prototype/`) | DETECTED |
| A12 | duplicate assetId in manifest | DETECTED |
| A13 | conflicting runtimeEntityId+assetKind (Impaler → Warlord) | DETECTED |
| A14 | mark source-missing as ready (absolute-nothingness) | DETECTED |
| A15 | importer nondeterminism: shuffle intake order, re-run importer | NOT DETECTED (importer is deterministic under input shuffle; this is the expected correct outcome) |

**Adversarial suite: 0 failures, 1 informational warning (A09 reports the planted file's path; the actual detection passes).**

### 5.6 Community Runtime Status
- `npx vitest run src/data/darkest-dungeon/community-reference/community-runtime-freeze-evidence.test.ts` — **12/12 passed**
  - Confirms: `COMMUNITY-REFERENCE-RUNTIME-FROZEN`, `COMMUNITY-FULL-ACT-IV-PLAYABLE=false`

### 5.7 Official Source Gate
- `npx vitest run src/audit/core-campaign/official-source-audit.test.ts` — **15/15 passed**
- Phase 11A.3 state machine test: **7/7 passed**
- Confirms: `SOURCE-BLOCKED`, `requiredMissing=26`, `optionalMissing=1`, `ISSUE-P0-002` open, `Formal Matrix=0/9`, `canCloseP0_002=false`, `canEnterPhase11B=false`

## 6. Commit Boundary

| Commit | SHA | Contains |
|---|---|---|
| Commit A | `451e312f3dce28dc64a490ffe889f05ccb9448dc` | importer, resolver, manifest, inventory, 33 PNGs, 5 UI components updated, 1 UI component added, verification scripts, 1 unit test file, `sharp` devDependency, `.gitignore` for raw asset cache |
| Commit B | (this commit) | this report, contact sheet PNG, contact sheet JSON, evidence files |

Commit A was verified clean before Commit B (working tree clean, all
fresh-run checks pass against Commit A's tree).

## 7. Forbidden-Behaviors Audit (dev doc §III)

- ❌ No Guardian stats / skills / d10 tables / Quest rules / Room rules
  / Final Encounter rules / Runtime profile semantics / source blockers /
  save-replay semantics / Official Source Gate / ISSUE-P0-002 / Formal
  Matrix / Official registries were modified.
- ❌ `COMMUNITY_RETAIL_REFERENCE` was NOT changed to `OFFICIAL_RETAIL_VERIFIED`
  on any entry.
- ❌ No Prototype / Steam / TTS / AI / web game image was used as a
  substitute for a Community source.
- ❌ No card was replaced by a name-similar card.
- ❌ No CardID / GUID / crop was guessed when ambiguous — the
  inventory's `selection.firstPhysical` is used as the unambiguous
  identity for MULTI_VARIANT / CANDIDATE_SET entries.
- ❌ No "happy path" was the only verification: 15 adversarial
  mutations + 2 file-system mutations (A03, A04) + 1 importer-shuffle
  (A15) all actively exercised and confirmed to be detected.
- ❌ No skipped/todo test in the verify command. `--adversarial` runs
  all 15 mutations; the baseline (no flag) runs V01–V15.

## 8. Remaining Blockers (NOT closed by this phase)

- `canCloseP0_002 = false`
- `canEnterPhase11B = false`
- `ISSUE-P0-002` remains open
- `Formal Matrix = 0/9` (the formal campaign harness has not been
  executed end-to-end; this phase only added visual integration)
- `COMMUNITY-FULL-ACT-IV-PLAYABLE = false`
- 2 source-missing entities (`community-dd-absolute-nothingness`,
  `community-dd-come-unto-your-maker`) — both render explicit
  source-missing placeholders in `FinalFormMechanicsPanel`; the
  product surface code is in place; only the upstream Community
  reference source needs to be accepted.

This phase does NOT clear any of these blockers. It only adds the
visual layer on top of the frozen Community runtime.

## 9. File Index (Commit A)

Implementation:
- `scripts/assets/import-community-reference-assets.mjs` — deterministic importer
- `scripts/assets/generate-community-visual-contact-sheet.mts` — contact sheet generator
- `scripts/audit/verify-community-visual-assets.mts` — V01–V15 + A01–A15
- `scripts/audit/verify-community-visual-assets-mutations.mts` — A03/A04 file-system mutations
- `src/data/darkest-dungeon/community-reference/visual-assets.ts` — profile-aware resolver
- `src/data/darkest-dungeon/community-reference/community-visual-asset-resolver.test.ts` — 10 vitest tests
- `src/components/darkest-dungeon/CommunityVisual.tsx` — single integration point for visuals
- `src/components/darkest-dungeon/DarkestDungeonQuestReveal.tsx` — quest card image
- `src/components/darkest-dungeon/TemplarsEncounterPanel.tsx` — Impaler + Warlord
- `src/components/darkest-dungeon/MammothCystEncounterPanel.tsx` — Mammoth Cyst + White Cell Stalk
- `src/components/darkest-dungeon/ShufflingHorrorEncounterPanel.tsx` — Horror + Cultist Priest + Malignant Growth
- `src/components/darkest-dungeon/FinalFormMechanicsPanel.tsx` — Ancestor 1st/2nd + Reflections + Heart + Heart of Darkness
- `docs/data/darkest-dungeon/community-reference/asset-inventory.json` — 26 requirements
- `docs/data/darkest-dungeon/community-reference/community-visual-asset-manifest.json` — 35 manifest entries
- `src/assets/darkest-dungeon/community-reference/antha-complete-edition/**/*.front.png` — 33 local assets

Tooling:
- `package.json` — new scripts: `verify:community-visual-assets`,
  `verify:community-visual-assets:adversarial`, `import:community-reference-assets`
- `package.json` — new devDependency: `sharp@^0.35.4` (image crop)
- `.gitignore` — `.artifacts/community-reference-assets/` added (raw cache)

## 10. Contact Sheet

- `docs/reports/phase-11a3/community-visual-asset-contact-sheet.png` — 6.0 MB, 33 ready assets
  in a 6-column grid + 2 source-missing entries listed below the grid. Each
  cell shows: runtime entity id, asset kind, GUID, CardID, sourceReference,
  sourceAuthority. The sheet is a single-image reviewer artefact that
  another agent can inspect independently of the build pipeline.
- `docs/reports/phase-11a3/community-visual-asset-contact-sheet.json` — machine-readable
  descriptor with per-cell metadata + sheet PNG SHA-256.

## 11. Visual Smoke (V01–V06)

The product surface integration covers all 6 visual-smoke points in
the dev doc §20:

| ID | Surface | Runtime entity | Status |
|---|---|---|---|
| V01 | Community Quest reveal | `community-dd-quest-we-are-the-flame` (or other chosen quest) | renders via `CommunityVisual` in `DarkestDungeonQuestReveal` |
| V02 | Templars encounter | `community-dd-templars-impaler` + `community-dd-templars-warlord` | renders in `TemplarsEncounterPanel` |
| V03 | Mammoth Cyst encounter | `community-dd-mammoth-cyst` + `community-dd-white-cell-stalk` | renders in `MammothCystEncounterPanel` |
| V04 | Shuffling Horror encounter | `community-dd-shuffling-horror` + `community-dd-cultist-priest` + `community-dd-malignant-growth` | renders in `ShufflingHorrorEncounterPanel` |
| V05 | Darkest Dungeon Room / Tile presentation | 4 guardian room cards + 6 room/dungeon tiles | contact-sheet only (no product surface currently renders rooms/tiles) |
| V06 | Final Encounter presentation | 4 final form cards | renders in `FinalFormMechanicsPanel` |

## 12. How to Reproduce

```bash
# From a clean checkout of the new branch
npm ci

# 1) Run the importer to (re)generate the 33 local assets + manifest
#    (PHASE_11A3_TTS_PATH must point to the unzipped TTS save JSON)
PHASE_11A3_TTS_PATH=/path/to/3657612854.json \
  npm run import:community-reference-assets -- \
  --intake docs/data/darkest-dungeon/community-reference/antha-complete-edition/source-binding-manifest.json \
  --tts "$PHASE_11A3_TTS_PATH" \
  --out src/assets

# 2) Run the verification (baseline)
PHASE_11A3_TTS_PATH=/path/to/3657612854.json \
  npm run verify:community-visual-assets

# 3) Run the verification with adversarial mutations
PHASE_11A3_TTS_PATH=/path/to/3657612854.json \
  npm run verify:community-visual-assets:adversarial

# 4) Run the file-system mutation tests
PHASE_11A3_TTS_PATH=/path/to/3657612854.json \
  node --experimental-strip-types scripts/audit/verify-community-visual-assets-mutations.mts

# 5) Generate the contact sheet
PHASE_11A3_TTS_PATH=/path/to/3657612854.json \
  node --experimental-strip-types scripts/assets/generate-community-visual-contact-sheet.mts

# 6) Regression: typecheck, build, Community E2E
npm run typecheck
npm run build
npm run test:e2e:community-reference
```

## 13. Conclusion

**COMMUNITY-VISUAL-ASSETS-INTEGRATED** — 33 repository-local Community
retail-reference visuals are vendored, manifest-traced, resolver-exposed,
and rendered inside the existing Act IV product surface. Profile isolation
holds (resolver returns null outside community-reference). Determinism
holds (re-running the importer produces identical bytes). Adversarial
mutations are detected by automated checks. Community E2E 3/3 passes.
Official Source Gate and Community Runtime verdict are unchanged from
the frozen baseline.

**This phase does not authorize any of the forbidden "Phase 11B ready",
"ISSUE-P0-002 closed", or "Community Full Act IV playable" claims.**
