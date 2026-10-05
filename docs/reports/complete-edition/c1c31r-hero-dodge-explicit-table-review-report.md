# C1C31R Hero Dodge Explicit Table Review

Verdict: **C1C31-HERO-DODGE-EXPLICIT-TABLE-REVIEW-ACCEPTED**.

The selected design is **B_CLASS_BASELINE**, frozen as `C1C31-DIGITAL-DEFAULT-v2`, inheriting `C1C28-DIGITAL-DEFAULT-v1`. Coverage is 24/24: three official pairs, 21 explicit noncanonical project rulings, zero missing pairs. This closes the known Hero Dodge table rule blocker. Necromancer foundation engineering remains incomplete; C1C32 Foundation Finalization is selected, followed by C1C33 Integration & Production Proof.

Baseline: `02d18d00ece61c9136ac0821ee5ce30ada038191`, branch `codex/phase-11a4-c1c31-necromancer-runtime-foundation-closure`. Work branch: `codex/phase-11a4-c1c31r-hero-dodge-explicit-table-review`.

## Final digital table

| Hero | I | II | III |
| --- | --- | --- | --- |
| Crusader | 0 official | 0 ruling | 0 ruling |
| Vestal | 1 ruling | 1 ruling | 1 ruling |
| Highwayman | 1 official | 1 ruling | 1 ruling |
| Hellion | 1 official | 1 ruling | 1 ruling |
| Leper | 1 ruling | 1 ruling | 1 ruling |
| Occultist | 1 ruling | 1 ruling | 1 ruling |
| Plague Doctor | 1 ruling | 1 ruling | 1 ruling |
| Grave Robber | 1 ruling | 1 ruling | 1 ruling |

The actual artifact contains 24 independent rows, not a runtime formula. Every unresolved pair has its own `C1C31R-DODGE-<HERO>-L<LEVEL>` ID, reason, high combat-balance risk metadata, save/replay impact and migration policy. These rows remain `canonicalSourceStatus = SOURCE_UNRESOLVED`, `authority = PROJECT_RULING`, `canonical = false`. Only the three frozen official Level I rows retain `OFFICIAL_SOURCE`, `canonical = true`, original hash-bound source references and no ruling ID.

Unknown classes all receive the same smallest nonzero value, 1, which is also the modal value among the three known Level I anchors. This is a transparent design choice based on bounded numerical consequences and fewer exceptions, not evidence about those classes' real printed stats. No class fantasy, Speed, prototype percentage resistance, videogame value or independent class ranking determines these numbers. Equality across levels is explicitly ruled for each higher-level row; the resolver never derives a higher-level value from Level I.

## Current attack mathematics and exact impact

The foundation code uses `roll <= Accuracy - Dodge` for hit and applies printed critical damage only when the hit also satisfies `roll <= printed Crit`. Ten d10 faces are enumerated exactly; no random samples or complete campaign simulation are needed. Crit is not subtracted by Dodge, but the current executor still requires a successful hit before applying critical damage. This review measures that existing implementation and does not introduce or repair a critical rule.

| Accuracy | Dodge 0 | Dodge 1 | Dodge 2 | Dodge 3 |
| --- | --- | --- | --- | --- |
| 3 | 30% | 20% | 10% | 0% |
| 4 | 40% | 30% | 20% | 10% |
| 5 | 50% | 40% | 30% | 20% |
| 6 | 60% | 50% | 40% | 30% |
| 7 | 70% | 60% | 50% | 40% |

The model clips at 0%/100% by counting actual faces. An extra point of Dodge removes ten percentage points only outside saturation. For example, Accuracy 10 versus Dodge 1 hits 90%, while Accuracy 11/12 versus Dodge 1 remains 100%. The final table therefore does not reduce higher-level Boss accuracy below its already saturated threshold. It cannot claim a Dodge benefit against those high-Accuracy attacks without additional modifiers.

The impact artifact also enumerates all nine Necromancer Skills and eight reviewed Bone Skills. Actual Accuracy bands are 5/7/8/9/10/11/12. For the selected 0–1 table, the least accurate real attack still hits every supported pair at least 40% of the time. No supported class becomes immune to these attacks because of base Dodge. Crit probabilities for the numeric real Skill thresholds remain unchanged under the selected table; their hit thresholds stay above their printed critical thresholds. Non-damaging Skills whose printed Crit is not numeric are explicitly marked `printedCritApplicable = false`; this analysis does not invent a printed Crit stat.

Incoming Trinket Dodge modifiers are accumulated in the current generic reaction bridge before hit resolution; damage scaling and forced-critical transformations occur after hit resolution. Locked condition arithmetic changes Accuracy for Mark and Crit for Buff/Debuff, rather than redefining base Dodge. The matrix includes separate +1 Dodge, +1 Accuracy and +1 Crit sensitivity rows. These are numerical scenarios, not claims that a particular Trinket/condition is legal or that the Boss incoming bridge already works.

The Phase 3/legacy `resolveAttackFromRoll` path forces natural 10 to hit and crit. Its staged incoming path subtracts Trinket Dodge modifiers but does not consume the source-bound base Hero Dodge table. It is reviewed as existing behavior only and is not used as a production substitute, official authority or basis for a new Dodge value. No combat equation or reaction pipeline was modified here.

## Candidate comparison and selection

All three candidate tables preserve the same three official anchors and provide 24 explicit comparison rows:

| Candidate | Unknown design | Main consequence |
| --- | --- | --- |
| A — Zero Fill | All 21 unknown pairs explicitly 0 | Simplest comparison baseline; removes the known nonzero class benefit at higher levels and shifts unknown classes toward more hits. |
| B — Class Baseline | Crusader 0; other classes 1; fixed across levels | Smallest nonzero common value, no invented progression bonus and only the existing Crusader anchor exception. Selected. |
| C — Level Progression | Crusader 0/1/2; other classes 1/2/3 | Adds 10–20 percentage points of evasion after upgrades and overlaps existing HP/slot/resistance growth. Not selected. |

Across uniformly weighted required pairs, Accuracy 5 has mean hit probabilities A 49.166667%, B 41.25%, C 31.25%. For Accuracy 10 the corresponding means are 99.166667%, 91.25%, 81.25%. These uniform-pair means are diagnostic comparisons, not estimates of campaign difficulty or actual roster frequency. The artifact separately records means per Hero level and individual pair results.

At matching Boss/Hero levels, Candidate C lowers Level II/III Boss mean hit probability to 91.25%, while B leaves both at 100%; B and C both average 91.25% against Level I Accuracy 10 with Level I Heroes. Candidate C's extra benefit is therefore an invented upgrade mechanic, rather than a requirement to preserve the official anchors. Its Dodge 3 also reaches zero hits against the requested low-Accuracy 3 sensitivity case, although the real reviewed minimum Accuracy 5 still hits at least 20%. There is no evidence here justifying that stronger progression.

B changes each affected unsaturated pair by at most ten percentage points versus zero fill, matching the known Dodge-1 anchor's scale and minimizing new exceptions. It is accepted as the explicit digital default. All 21 rulings still carry `HIGH_COMBAT_BALANCE`: bounded arithmetic does not prove complete-game balance, and missing official values remain missing. Future authoritative data must be introduced through a new version and explicit migration rather than changing frozen v2 rows in place.

## Resolver, save metadata and explicit migration

`resolveHeroDodge({ heroId, level, ruleSetVersion })` returns value, authority, canonical/source status, ruling ID, source references and the requested version. Unknown class/level or rule version is a hard error. v1 resolves only its original three official pairs; unsupported v1 pairs remain hard errors. v2 resolves all 24 rows. The existing source-only Hero registry remains unchanged, so loading the v2 resolver cannot contaminate v1 or silently promote gameplay.

`explicitlyMigrateHeroDodgeToV2(campaign, migrationId)` is a metadata-only immutable command. It requires a nonempty explicit ID and refuses any current Battle or Threat checkpoint, including a settled pre-Room checkpoint. The same completed ID is idempotent; a different ID cannot replace migration provenance. The command does not rebind an encounter, touch progression/rewards, draw RNG, mutate UI state or change an old replay record.

Save schema remains v22 with additive optional `heroDodgeRuleSetSelection` and `heroDodgeReplayRecords`. Legacy absence means v1 and stays absent through load/migration/sanitation. Save validation and direct snapshot restoration reject unsupported versions, missing explicit migration provenance, mismatched active encounter pins and tampered rule-only replay bindings. Existing encounter/checkpoint fields retain v1 and their original events/cursors.

Rule-only records preserve each resolved pair with its recorded version and provenance. A pre-encounter campaign may contain both a historical v1 record and a new v2 record; replay always validates against the record's own frozen version. Tests roundtrip these records through the existing `createSaveSnapshot`/`restoreSaveSnapshot` helpers. These traces prove rule resolution and save metadata only, not attack, Room, summon or production encounter replay.

## Preservation and next engineering scope

The deterministic offline generator emits the six requested artifacts: candidate tables, exact impact matrix, final table, v2 project ruling overlay, migration policy and next-workstream decision. The verifier freezes C1C20–31 JSON, v1/core adapter, C1C31 Bone Stance/Captain Stun evidence and historical C1C27/C1C28 scope guards against the exact baseline. No external acquisition was performed and no previous artifact was rewritten.

No Bone activation/executor, selector enablement, Room/Threat/Graveyard bridge, incoming Boss Trinket reaction, Boss resistance, UI polish, build repair or gameplay browser E2E was implemented. Production Ready remains 0. C1C32 must complete those engineering tasks with the frozen table before C1C33 production integration proof. Validation evidence is recorded separately in `c1c31r-validation-report.md`.
