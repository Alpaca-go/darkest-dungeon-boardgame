# C1C32R2 — Necromancer Threat Dependency Contract Closure

Verdict: **C1C32R2-NECROMANCER-THREAT-DEPENDENCY-CONTRACTS-NOT-CLOSED**.

Branch: `codex/phase-11a4-c1c32r2-necromancer-threat-dependency-contract-closure`.
Baseline: `35a42ac46ba97b07ed941bca078dc53fb5fab1bb`.
Policy: `RULEBOOK_ONLY_SOURCE_POLICY_V1`.

The generic Large movement dependency and the Graveyard campaign command are implemented and independently tested. Ordinary encounter dependencies remain incomplete. Production Threat runtime integration is not ready; C1C32R3 and C1C33 are not promoted. Scenario C remains `NOT_PROVEN` with null combat hashes. The existing browser `PRODUCT_FAILURE` sentinel is unchanged.

## Local official source intake

The mandatory local root `C:/Users/kyrie/Desktop/新建文件夹/DARKEST DUNGEON EN_FILES` was recursively inventoried. The new manifest binds 24 relevant PDFs by relative path, file name, SHA256, page and component location. Core Room cards, tiles, medium/large Monsters, initiative, Monster Stance cards, Hamlet, player aids, setup inserts, rulebooks, Necromancer abilities and the five Virtue cards were included. Relevant printed faces and tile layouts were rendered and inspected. Source PDFs remain outside the repository.

TTS inventory supplied identity/CardID crosswalks only. Printed component values and official rules supplied game data. No prototype Monster values, community clarifications or web substitutes were used.

The physical ordinary Ruins inventory contains **24 identities and 62 copies**, including Ruins and Common Monsters, four Large identities and three Small identities. Eligible cumulative copy counts are 42/53/62 for Levels I/II/III. Large medium-format proxy cards are not counted as extra physical Monster copies. Boss-only and summon-only components are separated from ordinary eligibility.

Structured intake exists for all 24 identities. It is not a complete executable production dataset: 23 identities have explicit definition blockers. The genuine existing Bone Captain definition is referenced without duplicating its accepted skills. Unreviewed printed stance groups remain null and flagged; missing executable effects are not supplied from prototype files.

## Frozen-source conflicts

The new official medium Monster printing conflicts with six frozen fields:

| Component | Field | Frozen value | Official printed value | PDF page |
| --- | --- | --- | --- | --- |
| Bone Soldier | Speed | 0 | 1 | 1 |
| Bone Soldier | Dodge | 1 | 0 | 1 |
| Bone Spearman | Speed | 1 | 2 | 13 |
| Bone Spearman | Dodge | 2 | 1 | 13 |
| Bone Rabble | Speed | 0 | 1 | 40 |
| Bone Rabble | Dodge | 1 | 0 | 40 |

The source is `DD_EN_COREBOX_CARDS_70_120_monsters_medium_FRONT.pdf`, SHA256 `ee35632cfec351ed176f9dd09d9d21adc3f357a5dfb632519514325d9635b09c`. Each conflict records component identity, page/location, old/new values and affected v1/v2 rulesets in `c1c32r2-ruins-monster-definitions.json`. The accepted Bone adapter, ruling sets and historical saves were not silently patched. A successor source-contract review is required before affected production promotion.

## Room and draw dependencies

Ruins Room cards 1–13 are inventoried. The proposed ordinary pool is Rooms 1–9; reserved Necromancer Room 10 remains excluded, and other printed Boss Rooms are separately identified. The complete ordinary exclusion policy still requires rule binding. Room identity/tile front-back correspondence is bound for all nine proposed ordinary Rooms.

Room effects, tile Area topology, capacities and printed starting stance Areas are not fully transcribed and reviewed. These fields remain null with explicit blockers. No placeholder layout or Room 10 geometry is used.

The ordinary draw artifact specifies seeded shuffle boundaries, physical copy ownership, Large initial draw replacement, player-selected Hero stances, initiative creation and an atomic stored result. It is `SPECIFIED_NOT_EXECUTABLE`: there is no production ordinary draw implementation or replay proof. Its no-redraw statement is a required contract, not evidence that an ordinary production encounter already runs.

## Generic Large movement

Core rulebook page 24 and related setup/movement/Area sections were reviewed. The printed Large footprint and singular displacement do not resolve the capacity-four arithmetic or all destination edge cases. The review compares strict capacity, counting Large as one, and a bounded overflow exception.

Selected ruling: `C1C32R2-LARGE-SINGLE-DISPLACEMENT-OVERFLOW-v1`, authority `PROJECT_RULING`, `canonical = false`, dependency version `C1C32R2-DIGITAL-DEFAULT-v3`, inheriting accepted v2 semantics. Large retains two occupied spaces. One eligible non-Target character moves to a legal adjacent Area. A recorded grant permits at most one excess space; further entry is blocked until normal capacity is restored. If no displacement destination is legal, movement is blocked without placement changes.

The generic command uses BattleState, explicit supplied topology and footprint data. It stores all sorted character/destination candidates, causal events and version during a pending choice. Continuation consumes no RNG and survives the campaign save validator and restore path. Binding is explicit and permitted only before encounter initialization. Historical Boss encounters cannot acquire the successor contract. Tests use clearly marked synthetic command-isolation boards and do not contribute production combat hashes. Path/Speed/Range validation remains the caller's responsibility; ordinary production movement integration is not implemented.

## Graveyard campaign transaction

`applyNecromancerPreparationDayGraveyard` consumes the settled checkpoint's forced Hero with lowest-roll and tie-choice evidence, campaign/Quest/encounter identity and pinned rule version. A persistent receipt, shared transaction ledger and campaign log prevent duplicate application. The selected Hero performs mandatory first-day guard duty. Level II may use the Graveyard effect; Level III may not. There is no new fee, healing or reward.

When Level II uses the effect, one of the five locally source-bound official Virtue cards is drawn once with the checkpoint's seeded source and saved in the receipt. These IDs are separate from the prototype Virtue pool. The effect activates after the existing next-Quest mental reset, applies for that Quest, and expires at Quest end. Reaching Stress 10 uses the existing campaign death pipeline instead of a new Resolve Test. Card turn effects use existing stress, healing and effect helpers.

Three command-isolation proofs cover Level II use, Level II decline and Level III guard-only behavior, with deterministic save/resume hashes. Dedicated tests cover forced selection, eligibility, prohibited use, duplicate transactions, the real next-Quest activation hook, fatal Stress 10, expiry and all five source-bound Virtue effects.

The current UI creates the Threat checkpoint at Quest selection. The isolated transaction proofs deliberately prepare Hamlet state; they do not prove a normal Preparation Day UI checkpoint bridge. `PREPARATION_DAY_CHECKPOINT_DOMAIN_BRIDGE` remains a blocker for the production path.

## Gates and exact remaining blockers

| Gate | Result |
| --- | --- |
| ordinaryRuinsMonsterDeckComplete | false; composition accounted, executable closure incomplete |
| drawableProductionMonsterDefinitionsMissing | 23 |
| prototypeMonsterDependencies | 0 |
| roomDeckContractComplete | false |
| room10ExclusionBound | true |
| tileAreaContractsComplete | false |
| ordinaryEncounterDrawContractComplete | false |
| largeMovementExecutableContractComplete | true; independent dependency command |
| graveyardCampaignTransactionImplemented | true; independent campaign command |
| historicalRulesetsPreserved | true |
| explicitProjectRulingCreated | true; canonical false |

Remaining blockers are `FROZEN_BONE_SOURCE_MISMATCH_REVIEW`, `ORDINARY_MONSTER_EFFECT_ADAPTER_NOT_BOUND`, `PRINTED_STANCE_GROUPING_REVIEW`, `ORDINARY_TILE_AREA_TRANSCRIPTION_AND_GLYPH_REVIEW`, `ORDINARY_ROOM_EFFECT_GLYPH_BINDING`, and `PREPARATION_DAY_CHECKPOINT_DOMAIN_BRIDGE`. The dependent ordinary draw is blocked by these contracts. Source intake is not substituted for executable completeness.

The integrity verifier checks local PDF hashes and 142 frozen historical JSON artifacts. C1C32R Room termination/storage behavior and v1/v2 proofs remain intact. Validation details are in [c1c32r2-validation-report.md](c1c32r2-validation-report.md). The dependency matrix and next-workstream decision enforce NOT-CLOSED; acceptance-required verification intentionally rejects promotion.
