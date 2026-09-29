# Phase 11A.4-C1C32R2A — Ruins executable dependency review

**Verdict: `C1C32R2A-RUINS-EXECUTABLE-DEPENDENCIES-NOT-CLOSED`.**

Baseline: `624a2b5c20b9f40ee9e87ac103780cb9eb3c2053`.
Branch: `codex/phase-11a4-c1c32r2a-ruins-executable-dependency-final-closure`.
R3 remains **NOT_AUTHORIZED**; C1C33 is not authorized. Scenario C is **NOT_PROVEN** and has no combat hashes.

## Source review

The mandatory official local root was searched recursively, independently of historical transport provenance. The search found 243 PDFs. Production Core PDFs were hash-bound and rendered at 3× using PyMuPDF. The actual artwork for all 24 ordinary Monster identities, all ordinary Tiles 1–9, Room fronts 1–9 and relevant official rulebook pages was inspected. No community, FAQ, videogame or TTS-script clarification was acquired. Production PDFs and temporary rendered pages are not part of this change.

The successor candidate corpus preserves 24 identities / 62 physical copies and eligibility counts 42 / 53 / 62. Every Stance has an explicit Skill table or an explicit inheritance relation. The offline authoring script converts reviewed historical intake tokens into discriminated objects; production domain modules do not interpret arbitrary effect strings.

The review corrected these values in successor data only:

| Component | Successor correction |
|---|---|
| Bone Soldier | Speed 1 / Dodge 0 |
| Bone Spearman | Speed 2 / Dodge 1 |
| Bone Rabble | Speed 1 / Dodge 0 |
| Spitter, Spit | Damage 4 / critical Damage 6 |
| Madman, Accusation | Stress 2 |
| Brigand Hunter, Rushed Shot | Accuracy 9 |
| Adder, Adder’s Fang | Range 2; Aggressive/Defensive share the printed table |
| Even ordinary Tiles | BACK pages 2–5; BACK page 1 is Old Road Tile 0 |
| Room 8 | Party Stress +2, rather than a Light effect |
| Disease glyph | Official p27 describes Disease acquisition from its deck; no additional infection probability is printed |

The v4 source resolver is separate from the historical Bone resolver. v1/v2/v3 source artifacts, the accepted Graveyard campaign transaction, Large movement contract, Room storage implementation and browser production sentinel remain unchanged. The preservation manifest checks original Git blobs and current bytes of all C1C20–C1C32 evidence/report files plus explicitly frozen runtime files.

**Source-bound typed candidates are not executable production definitions.** All 24 successor entries retain `SOURCE_BOUND_TYPED_CANDIDATE`, `executable = false`. The historical v2 Captain remains accepted in its own version; it does not count as an executable v4 component. Consequently the v4 missing-definition count is 24, while the unchanged historical baseline count is 23.

## Implemented domain work

`src/game-engine/ruins/encounter-draw.ts` provides a deterministic draw transaction with physical copy ownership, front/back starting Stance priority, initial Large replacement, Tile/Area references, player-selected Hero Stances and generic Hero/Monster Initiative cards. Results and RNG cursors are serializable. An existing encounter identity returns the stored result without drawing again; conflicting identities or layouts reject. Duplicate copies, invalid placement/initiative and orphan ownership reject during save validation. A copy reserved in a summon pool cannot also be drawn from the deck.

Official p25 binds return and shuffle of Monster cards used in Battle and retention of the discarded Room card through the Dungeon run. The post-Battle disposition of the ordinary Monster discarded during initial Large replacement is **SOURCE_UNRESOLVED**. Its printed discard fact is retained. Subsequent encounter initialization rejects while this unresolved discard is outstanding. No unversioned return policy is inferred. Exhausted decks also reject atomically.

Tile data contains stable Area IDs, normalized face polygons, symmetric adjacency, explicit capacities/elevations/glyphs and both starting maps. Structural tests pass. Final visual topology acceptance remains false; these polygons are not advertised as accepted production geometry. Rooms 1–9 have typed glyph transcriptions, including passive, turn-end, shuffle-entry, interaction and round-end effects. The ordinary pool is classified as Rooms 1–9; Rooms 10–13 are Boss-only/excluded, with Room 10 reserved for Necromancer. Room effect execution is not bound.

The Preparation Day bridge carries a settled saved checkpoint into a separate Hamlet visit snapshot. It preserves lowest-roll evidence and saved tie candidates. An already-consumed selection is never rerolled. An unconsumed checkpoint uses its persisted seeded sources once. Pending Level II use/decline choices retain explicit candidates, their causal event and rule version. The original `applyNecromancerPreparationDayGraveyard` remains the sole transaction owner for day consumption and the Virtue draw.

Store actions and the Hamlet page expose tie selection, the forced visit, Level II use/decline and Level III guard-only behavior. Commands block the selected Hero from skipping or visiting other buildings and block day completion while unresolved. Advanced building services and Nomad Wagon apply the same pending guard. The original Hamlet Event consumer is preserved; guard behavior resides in additive command wrappers.

Scoped proofs use real `finishQuest`, authoritative Room return, `commitReturnToHamlet`, save/restore and Graveyard commands after initial fixture setup. They cover pending tie, pending visit, pending Level II choice, committed transaction and pending next-Quest/guard-only receipts. The fixture cancels a Boss reservation through the domain engine. The normal product UI forbids voluntary exit from that Boss Quest, so this **does not certify a normal complete product journey**. Real next-Quest `ACTIVE_QUEST` and `EXPIRED` save proofs remain absent. Existing isolated lifecycle proofs are preserved and are not relabelled as product acceptance.

## Exact remaining dependencies

1. `ORDINARY_MONSTER_EFFECT_ADAPTER_NOT_BOUND`
2. `EXTENDED_PRINTED_EFFECT_INTERPRETER_NOT_BOUND`
3. `ORDINARY_TILE_AREA_FINAL_VISUAL_TOPOLOGY_VALIDATION`
4. `ORDINARY_ROOM_EFFECT_EXECUTOR_NOT_BOUND`
5. `ORDINARY_ENCOUNTER_EXECUTABLE_COMPONENT_ACCEPTANCE`
6. `NORMAL_PRODUCT_THREAT_PREPARATION_ENTRY_PROOF`
7. `ACTIVE_QUEST_AND_EXPIRED_REAL_COMMAND_SAVE_PROOF`
8. `INITIAL_LARGE_REPLACEMENT_DISCARD_RETURN_SOURCE_UNRESOLVED`

The schema and transcription are present; the generic attack/status/shuffle execution and Room interpreter required to reduce the production missing-definition count to zero have not been implemented. No test substitutes metadata completeness for execution. This phase has not achieved the requested final closure.

## Validation and preservation limits

The dedicated source/draw/Preparation Day suite and C1C29–C1C32R2 verification commands pass. Passing the new integrity verifier means the blocked decision and evidence are internally consistent, not that production acceptance passes. `--require-accepted` rejects promotion.

An initial full run exposed a C1C23 negative-runtime byte-hash mismatch caused by line-ending conversion in the Hamlet source. Its frozen evidence requires the original CRLF working-tree bytes; no gameplay lines changed. A single-file `.gitattributes` rule now restores those bytes on checkout, while the indexed source remains the baseline LF blob. The C1C23 suite passes without rewriting its evidence. The final full run has 0 unexpected failures; only the two listed C1C27/C1C28 historical scope guards remain.

The build passed TypeScript and Vite module transformation, then failed at the known Windows repeated CSS hash/path ENOENT write boundary. Classification: `BUILD_ACCEPTANCE_UNVERIFIED`, `KNOWN_TOOLING_BLOCKER`. Bundler configuration is unchanged.

See the validation report for exact command outcomes. R3 promotion remains stopped.
