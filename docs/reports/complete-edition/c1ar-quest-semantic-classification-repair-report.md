# C1A-R — Quest Semantic Classification Repair

Status: semantic repair complete; independent audit pending. STOP at C1A-R. C1B Production Integration is not authorized by this report.

Branch: `phase-11a4-c1ar-quest-semantic-classification-repair`. Frozen base: `300c0a84ed1e5bd2025128fd4e35eeed0b600a06`.

## Coverage

| Metric | Count |
| --- | ---: |
| Quest definitions | 76 |
| With Special Rules | 66 |
| Without Special Rules | 10 |
| Source-supported | 75 |
| Source-blocked | 1 |
| Registry Standard / Boss | 74 / 1 |

All 66 printed panels were reviewed against the frozen literal observations. Each presently contains one printed rule paragraph. Panels are split into individually classified semantic rules with `sourceRuleIndex: 0`; new unreviewed panels fail generation. There is no default Special Rule → objective mapping.

| Special-rule Quest / printed panel class (exclusive) | Count |
| --- | ---: |
| objective-affecting only | 0 |
| non-objective only | 49 |
| mixed | 16 |
| source-blocked | 1 |

Across all panels, 16 Quests have objective-affecting rules (including mixed). Of 152 normalized semantic rules, 22 affect objective qualification/completion/minimum eligibility and 130 do not. Source-blocked panels are counted separately above; their classified, unresolved leaves remain in the totals below.

| Semantic category | Rules |
| --- | ---: |
| quest-setup | 7 |
| dungeon-setup | 3 |
| room-setup | 23 |
| room-selection | 14 |
| room-clear-rule | 1 |
| monster-spawn | 22 |
| monster-pool | 9 |
| monster-stat-modifier | 9 |
| battle-start | 7 |
| battle-round | 0 |
| battle-end | 2 |
| initiative | 3 |
| hero-condition | 7 |
| hero-stress | 2 |
| hero-damage | 0 |
| exploration | 2 |
| scouting | 1 |
| provision | 3 |
| curio | 4 |
| loot | 4 |
| reward-modifier | 4 |
| campaign-rule | 2 |
| objective-qualification | 14 |
| objective-completion | 8 |
| other | 1 |

## Objective and source architecture

`objective.targetCount` and `xpUnit` express the printed XP qualification unit. Ordinary Quest XP remains normally 0–3 under S4:p14,p29; no XP rate becomes an invented mandatory quest threshold. `qualificationRules` and `completionRules` only reference explicitly bound rules. Non-objective rules always have `affectsObjectiveCompletion: false` and `objectiveBinding: null`.

Fundraiser has an explicit minimum of one Lair; its 10 Gold reward and 20 Gold → 1 XP exchange are reward rules. Take ’Em Back has a one-Objective-Room minimum for the Trinket return XP exchange; its scope is exchange eligibility, not a new generic quest success condition. All other `minimumQuestGoal` values are null.

Mixed panels retain separate room selection/setup, provision grants, monster policies, battle/initiative, exploration, loot, campaign and objective rules. In particular, Carrion Infestation separately binds the printed room-secured condition while preserving its battle-end rule; Ringleaders’ battle-end policy is not an additional kill-objective qualification. Tainted Trinkets keeps the Hamlet consequence separate from the in-room objective action. Lost and Found’s Valuable chest replacement is loot, not a room completion requirement.

No Other Way retains the action, Torch, red Area, prohibited round 4 ignition and next-round burn resolution in objective rules. Refilling empty Stances at the end of the ignition round remains an independent monster-spawn rule. Null trigger means no additional timing was inferred. No once-per-round or pre-initiative timing was added.

Dem Bones now uses `collect`, removing the old unsupported `collect-and-return` label because its reward says Bone collected. The repair also retains previously omitted set-aside clauses for Test the Waters / The Deep Ones and the chest-bearing room restriction for Take ’Em Back. Literal evidence was not changed.

Each semantic leaf has card source identity, literal field, crop/hash and rulebook references where relevant in `leafProvenance`. Splitting a panel no longer turns the normalized array index into a printed source index. Objective bindings trace through the referenced rule. Boss objective context uses S4:p30,p35; generic XP evidence does not substitute for Boss semantics.

## Before / after evidence

| Quest | Before | After |
| --- | --- | --- |
| Creeping Darkness | Stress panel → requiredConditions[0] | hero-stress; null binding; room count 2 is one XP unit |
| The Threat is Real | Level restriction → requiredConditions[0] | monster-pool; no Level 1 in Lairs; null binding |
| Patrol the Woods | Initiative panel → requiredConditions[0] | initiative at battle-start; null binding; room count 2 unchanged |
| Dem Bones | Entire setup/collection/clear panel → requiredConditions[0] | Separate room setup; Green Area + 2 actions qualify bones; collection binds room completion |
| Purify the Fountains | Potion grant, setup and purification all required | Setup/grant independent; 2 actions + Potion qualify purification; purified fountain binds room completion |
| No Other Way | Room setup, ignition, reinforcement and clear policy all required | Setup/spawn independent; ignition/wait and burned-oak completion explicitly bound |
| Fundraiser | Entire minimum/reward panel required | Only explicit 1 Lair minimum bound; Gold award and exchange unbound |
| Face the Threat! | Boss setup and no-return both requiredConditions | Boss defeat objective; setup and campaign no-return rules unbound |

## Full Quest audit ledger

This ledger covers all 76 definitions, including ten without Special Rules. Category counts are semantic leaves, not extra cards or new registry definitions.

| Cell | Printed name | Panel class | Objective-bound / total rules | Categories |
| --- | --- | --- | ---: | --- |
| 445-18 | Face the Threat! | non-objective only | 0 / 2 | quest-setup, campaign-rule |
| 445-21 | Deep Horrors | non-objective only | 0 / 1 | monster-spawn |
| 445-20 | Deep Waters | non-objective only | 0 / 1 | battle-start |
| 445-23 | Purify the Eldritch Signs | mixed | 1 / 4 | room-setup, room-selection, quest-setup, objective-qualification |
| 445-19 | Test the Waters | mixed | 1 / 3 | room-setup, room-selection, objective-qualification |
| 445-22 | Unclean Waters | non-objective only | 0 / 1 | hero-condition |
| 445-26 | Deep Horrors 2 | non-objective only | 0 / 1 | monster-spawn |
| 445-24 | Deep Waters 2 | non-objective only | 0 / 1 | battle-start |
| 445-28 | Eldritch Purging | non-objective only | 0 / 2 | battle-start, curio |
| 445-27 | The Deep Ones | non-objective only | 0 / 3 | room-setup, room-selection, monster-pool |
| 445-25 | Unclean Waters 2 | non-objective only | 0 / 1 | hero-condition |
| 445-29 | Deep Waters 3 | non-objective only | 0 / 2 | battle-start, curio |
| 445-33 | Tainted Trinkets | mixed | 1 / 4 | room-setup, quest-setup, objective-qualification, campaign-rule |
| 445-31 | The Deep Ones 2 | non-objective only | 0 / 4 | room-setup, room-selection, monster-spawn, monster-pool |
| 445-32 | The Shipwrecks | mixed | 1 / 2 | room-setup, objective-qualification |
| 445-30 | Unclean Waters 3 | non-objective only | 0 / 1 | hero-condition |
| 444-1 | Deep in the Swamp | no special rules | 0 / 0 | — |
| 444-0 | Lost and Found | non-objective only | 0 / 2 | room-selection, loot |
| 444-3 | Rest in Rubble | non-objective only | 0 / 2 | room-clear-rule, curio |
| 444-2 | Rivers Run Red | mixed | 2 / 4 | room-setup, room-selection, objective-qualification, objective-completion |
| 444-4 | They Are Swarm | non-objective only | 0 / 1 | monster-pool |
| 444-7 | Deeper into the Swamp | no special rules | 0 / 0 | — |
| 444-5 | Lurkers | non-objective only | 0 / 1 | monster-spawn |
| 444-6 | Pest Control | no special rules | 0 / 0 | — |
| 444-8 | Ruin the Party | non-objective only | 0 / 3 | room-setup, room-selection, monster-pool |
| 444-9 | Take 'Em Back | mixed | 2 / 6 | room-selection, monster-stat-modifier, loot, objective-qualification, reward-modifier, objective-completion |
| 444-13 | Breeders | non-objective only | 0 / 3 | room-setup, room-selection, monster-spawn |
| 444-11 | Cut the Buzz | non-objective only | 0 / 2 | hero-condition, monster-stat-modifier |
| 444-14 | Rest in Rubble III | source-blocked | 0 / 3 | battle-start, other, curio |
| 444-12 | The Endless Marsh | non-objective only | 0 / 2 | dungeon-setup, exploration |
| 444-10 | Uninvited | non-objective only | 0 / 2 | room-setup, monster-spawn |
| 445-3 | Dem Bones | mixed | 2 / 3 | room-setup, objective-qualification, objective-completion |
| 445-2 | Fundraiser | mixed | 1 / 3 | objective-completion, reward-modifier |
| 445-4 | Rising Threat | non-objective only | 0 / 2 | battle-start, monster-spawn |
| 445-0 | Scout Ahead | no special rules | 0 / 0 | — |
| 445-1 | Wipe 'Em Out | no special rules | 0 / 0 | — |
| 445-8 | Break Them | non-objective only | 0 / 1 | monster-spawn |
| 445-6 | Clear the Path | no special rules | 0 / 0 | — |
| 445-5 | Disruption | non-objective only | 0 / 2 | room-setup, room-selection |
| 445-9 | Purify the Fountains | mixed | 2 / 5 | room-setup, quest-setup, objective-qualification, objective-completion |
| 445-7 | Reduce to Rubble | no special rules | 0 / 0 | — |
| 445-13 | Creeping Darkness | non-objective only | 0 / 1 | hero-stress |
| 445-11 | Forward Camps | mixed | 1 / 2 | objective-qualification, dungeon-setup |
| 445-14 | The Threat is Real | non-objective only | 0 / 1 | monster-pool |
| 445-12 | They Are Back | non-objective only | 0 / 2 | monster-spawn, monster-stat-modifier |
| 445-10 | Warm Up the Halls | mixed | 2 / 4 | provision, objective-qualification, objective-completion |
| 444-19 | Disarm Them | non-objective only | 0 / 2 | room-setup, monster-pool |
| 444-16 | Explore the Sewers | no special rules | 0 / 0 | — |
| 444-17 | Family Trinkets | mixed | 1 / 3 | room-selection, loot, objective-qualification |
| 444-15 | Pork Chop | no special rules | 0 / 0 | — |
| 444-18 | Worm Squash | non-objective only | 0 / 2 | room-setup, monster-spawn |
| 444-24 | A New Breed | non-objective only | 0 / 1 | monster-stat-modifier |
| 444-22 | Bait Them Out | non-objective only | 0 / 3 | quest-setup, battle-start, monster-spawn |
| 444-21 | Carrion Infestation | mixed | 1 / 4 | monster-spawn, battle-end, objective-completion |
| 444-23 | Mapping the Sewers | no special rules | 0 / 0 | — |
| 444-20 | Ringleaders | non-objective only | 0 / 3 | room-setup, monster-spawn, battle-end |
| 444-26 | Alpha Swine | non-objective only | 0 / 2 | monster-spawn, monster-stat-modifier |
| 444-25 | Deep in the Warrens | non-objective only | 0 / 1 | provision |
| 444-29 | Drums of Doom | non-objective only | 0 / 4 | monster-spawn, monster-stat-modifier |
| 444-27 | Foul Arsenal | non-objective only | 0 / 2 | room-setup, hero-condition |
| 444-28 | Infighting | non-objective only | 0 / 4 | monster-spawn, scouting, exploration, initiative |
| 444-31 | Circle of Witches | non-objective only | 0 / 2 | room-setup, monster-spawn |
| 444-32 | Disinfection | mixed | 1 / 3 | room-setup, quest-setup, objective-qualification |
| 444-30 | Fungal Research | mixed | 1 / 3 | room-setup, room-selection, objective-qualification |
| 444-34 | Patrol the Woods | non-objective only | 0 / 1 | initiative |
| 444-33 | Purge the Woods | non-objective only | 0 / 1 | monster-pool |
| 444-38 | Hounds of the Woods | non-objective only | 0 / 3 | room-setup, room-selection, monster-spawn |
| 444-39 | Lost Supplies | non-objective only | 0 / 4 | quest-setup, room-selection, loot, reward-modifier |
| 444-36 | Lost Treasures | non-objective only | 0 / 1 | monster-pool |
| 444-37 | Searching in the Dark | non-objective only | 0 / 2 | dungeon-setup, monster-pool |
| 444-35 | Spreaders of Miasma | non-objective only | 0 / 1 | monster-spawn |
| 444-42 | Final Swipe | non-objective only | 0 / 1 | hero-condition |
| 444-41 | Great Unclean Ones | non-objective only | 0 / 3 | monster-spawn, monster-stat-modifier, initiative |
| 444-40 | No Other Way | mixed | 2 / 4 | room-setup, objective-qualification, monster-spawn, objective-completion |
| 444-43 | The Infected | non-objective only | 0 / 1 | hero-condition |
| 444-44 | Whispering Woods | non-objective only | 0 / 1 | hero-stress |

## Blockers and C1B migration list

- `444-14 Rest in Rubble III`: the printed “causes Heroes to a tomb” is missing an action verb. Its `onClear` stays null and SOURCE_UNRESOLVED, with source-blocked provenance. No behavior is copied from Rest in Rubble I. It is excluded from the registry.
- `CURRENT_CRITICAL_STONE_TIMING_MISMATCH`: Production `src/data/trinkets/verified-trinkets.ts` uses `before-attack-roll`, while S4:p26 explicitly allows declaring Critical Stone Crit +2 after seeing the roll. C1B must repair/migrate and test this timing. No Production Trinket change is made here.
- `RUNTIME_PRIMITIVE_UNSUPPORTED` is not permission to integrate. C1B still needs deliberate runtime mappings, Community runtime profile, expansion filtering, rewards, persistence and Production/E2E checks.
- Boss setup/no-return/rulebook mechanics remain separate from the defeat objective. Boss Association remains source-domain metadata. No Boss runtime work is part of this repair.

## Verification and frozen baseline

`npm run generate:complete-edition-c1ar` writes only Quest normalized definitions and registry data. `npm run verify:complete-edition-c1ar` audits all 76 definitions, explicit boolean/binding reciprocity, panel conservation, leaf provenance, XP units, minima, source-blocker conservation, deterministic generation, all 250 existing asset hashes, original C1A bundle invariants and exported immutable registries. QR-01…QR-08 cover the required counterexamples; 12 semantic mutations and 8 inherited C1A mutations must be rejected.

The verifier compares all tracked changes to the exact C1A HEAD using an allowlist. C0 identities/inventory, literal observations/evidence, vendored assets, 49 physical / 48 registry / 1 blocked Trinkets, Production quest pool, QuestSelectPage, Campaign store/commands/save, Runtime Profile, Act IV and Final Encounter remain frozen. It additionally scans for Production imports of the Community Quest/Trinket registries. Existing user-owned untracked temporary files are not edited or removed.

Historical C1A report, verification log and source-review lock are preserved. C1A-R has a separate authored semantic input lock, with the original Quest semantics hash checked against the C1A base. Use the C1A-R verifier for this branch: the historical C1A CLI intentionally retains its original review-lock contract and is not relabeled as current evidence.

Validation commands: `npm run verify:complete-edition-c1ar`, `npm run typecheck`, `npm run build`. Results are recorded in `c1ar-verification.log`. This is source-domain interpretation and integrity verification against existing reviewed evidence, not a new independent visual/source audit. Independent audit remains required before C1B.

**STOP: C1A-R complete; do not enter C1B.**
