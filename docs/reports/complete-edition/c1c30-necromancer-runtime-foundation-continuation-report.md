# C1C30 Necromancer Runtime Foundation Continuation

Verdict: **C1C30-NECROMANCER-RUNTIME-FOUNDATION-PARTIAL-NOT-ACCEPTED**.

Baseline: `4c01f006324b38f4233803bc34c4259cd69f4ced`. Work branch: `codex/phase-11a4-c1c30-necromancer-runtime-foundation-continuation`.

C1C31 is not selected. The requested five hard gates have not passed. No production acceptance proof uses synthetic Bone or Hero Dodge values; production acceptance is explicitly blocked rather than replaced with a fixture proof.

## Changes and source review

The new `bone-combat-adapter.ts` consumes an explicit, hash-bound review of existing locked C1C25 printed component crops. It exposes reviewed Life, Speed, Dodge, size, two printed Skills, targeting, range, critical/normal damage, Self/Target effects, visible Stance selections, initiative references, conditions and source references. Life values are Rabble 6, Soldier 7, Spearman 15, Captain 33. Captain uses the full-size combat card 46600 rather than the miniature/reference card 46111, remains Large, and is excluded from the ordinary summon ID list.

`resolveProductionMonsterDefinition()` refuses every incomplete candidate. No Phase 3 simplified Monster registry, prototype registry, parsed card text, cloned fixture or default Skill is used as fallback. The C1C29 `SPAWN_DEFINITION_UNBOUND` executor gate remains unchanged. No Bone is promoted merely because Life is known.

Several locked crops have Stance icons without an executable selection number. The reviewed fields identify each affected Stance explicitly, including Rabble/Soldier Aggressive and Defensive, Spearman Aggressive and Ranged, and Captain Defensive/Ranged. A missing selection is preserved as `SOURCE_UNRESOLVED`. The core rulebook p21 says Skill selection is indicated on the Monster Card; p16's illustrated Soldier setup was inspected as well. Neither a default Skill nor the meaning of an unmarked icon is guessed. This is an unresolved dependency review, not a claim that official components can never provide the missing behavior. A complete Stance contract must be reviewed before promotion.

The standard Hero Level registry now exposes `getHeroCombatDefinition()` and an independently source-bound combat field snapshot. Reviewed Level I Dodge values are Crusader 0 (locked rulebook p10 anatomy), Highwayman 1 (p20 printed card example), and Hellion 1 (p22 explicit attack example). Missing class/level pairs return `undefined`. Other Hero fields retain their existing prototype credibility; binding Dodge does not certify prototype HP, Speed, slots or percentages. No Level I value is extrapolated to Levels II/III. Vestal and the remaining unreviewed combinations remain blocked.

No external sources were acquired. The PDF skill was used read-only to render the existing locked official core rulebook. The printed components' transport is only provenance. C1C28 rulings remain `C1C28-DIGITAL-DEFAULT-v1`; no new ruling was introduced.

## Checkpoint bridge

C1C30 command-created checkpoints contain schema version, encounter and battle identity, campaign/quest linkage, definition version, Threat ID, consumed-once keys, and the explicitly bound Hero Dodge snapshot. The existing encounter already contains family, level, Threat card/side, stored Hero choice, PendingChoice candidates, causal events, definitions, token ledger and seeded runtime cursors.

`resumeBossFoundation()` validates the checkpoint before rebuilding BattleState around the saved encounter. It does not call `bindBossEncounter()`, create another setup event, regenerate identity or reset RNG. It preserves the previous Threat checkpoint while entering the existing Threat-to-Ability transition. An active battle prevents a second resume. The selected campaign/family/version/card/definition/linkage must match; malformed events, missing Hero Dodge and unsettled active summon states are rejected. `resolveBossThreatCheckpointChoice()` resolves a saved Preparation Day tie using its original candidates and causal event chain before Room entry. New initialization continues to reject an existing checkpoint.

Save validation calls the same checkpoint validator for the new schema. Legacy C1C29 checkpoints without bridge metadata remain readable under the old save contract; resumption requires an explicit migration rather than silently supplying missing metadata. Historical replay artifacts and the C1C29 foundation/fixture/contract adapter are frozen by the new verifier.

These are command and save unit-isolation results. They do not certify a production Room/card/tile lifecycle, complete incoming-attack reaction bridge or source-complete Bone turn. The proof artifact declares prototype Hero HP and zero complete Bone definitions explicitly.

## Production promotion gates

| Capability | Status | Evidence / remaining work |
| --- | --- | --- |
| coreBossDefinitions | IMPLEMENTED | Frozen 9/9 C1C29 bindings |
| BoneCombatDefinitions | PARTIAL | Four numeric/Skill reviews; zero complete executable definitions |
| HeroDodgeBinding | PARTIAL | Three reviewed Level I pairs; missing pairs fail closed |
| BoneSkillExecutor | BLOCKED | Source-complete Stance activation and Area execution required |
| NormalSelectorEntry | BLOCKED | Shared gate applied to selector UI, quest command, Room command and direct movement commit |
| ThreatCheckpointResume | PARTIAL | Deterministic validated bridge passes isolation; production Room entry gated |
| HamletEffectBridge | BLOCKED | Stored forcedHeroId survives; Graveyard transaction dispatch still absent |
| IncomingAttackReaction | BLOCKED | Existing Boss damage path lacks complete per-Hero Trinket windows |
| RoomStorage | BLOCKED | Room 10 binding exists; authoritative card/tile storage lifecycle absent |
| BossResistanceIntegration | PARTIAL | Existing immunities retained; Debuff/Shuffle resistance incomplete |
| SaveReplayProduction | BLOCKED | Successful real summon/turn/reanimation/reaction/cleanup proof unavailable |

The browser suite attempts the production selector gate without synthetic combat dependencies and explicitly skips the successful encounter path because its prerequisites do not pass. Gate coverage cannot be described as a playable-path E2E pass. Validation outcomes are recorded separately in `c1c30-validation-report.md`.

## Artifact and verification contract

Six requested C1C30 binding/capability/runtime/save/review/decision artifacts were generated, alongside the explicit printed dependency review. The generator is deterministic and offline. The verifier checks actual local source hashes, generated artifact equality, and C1C20–29 JSON content plus the C1C29 source policy, core foundation, fixture and contract adapter against the requested Git baseline. It rejects later artifact drift and retains zero Production Ready.

The required next workstream remains `NECROMANCER_RUNTIME_FOUNDATION_CONTINUATION`. Review the missing activation and Hero fields only against already locked official evidence, then close ordinary Monster execution, Room/Threat/Hamlet/reaction/resistance/storage bridges. Do not return to source acquisition, silently modify ruling v1, or label isolated checkpoint results as production proof.
