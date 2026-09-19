| Category | Source Physical | Source Logical¹ | Extracted² | Normalized² | Registry³ | Production³ | UI³ | Source-blocked objects |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Heroes | 36 | 18 | 0 | 0 | 0 | 0 | 0 | 36 |
| Hero Skills | 126 | 126 | 0 | 0 | 0 | 0 | 0 | 378 |
| Hero Level / Upgrade Cards | 37 | 37 | 0 | 0 | 0 | 0 | 0 | 37 |
| Hero Accessories | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Standard Quests | 75 | 75 | 0 | 0 | 0 | 0 | 0 | 75 |
| Boss Quests | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Threat Cards | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DD Quests | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 0 |
| Monsters | 179 | 170 | 0 | 0 | 0 | 0 | 0 | 179 |
| Monster Battle Cards | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Monster Ability Cards | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Bosses | 231 | 231 | 0 | 0 | 0 | 0 | 0 | 231 |
| Guardian Cards | 16 | 16 | 7 | 7 | 7 | 7 | 7 | 10 |
| Final Encounter Cards | 14 | 14 | 8 | 8 | 8 | 4 | 4 | 6 |
| DD Monsters | 26 | 9 | 1 | 9 | 9 | 9 | 9 | 26 |
| Dungeon Tiles | 16 | 0 | 3 | 3 | 2 | 2 | 2 | 0 |
| Room Cards | 125 | 125 | 4 | 4 | 4 | 4 | 4 | 122 |
| Corridor / Room Content | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 3 |
| Curios | 98 | 98 | 0 | 0 | 0 | 0 | 0 | 98 |
| Traps | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Rubble | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Hunger | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Encounter / Event Content | 16 | 16 | 0 | 0 | 0 | 0 | 0 | 16 |
| Trinkets | 49 | 49 | 0 | 0 | 0 | 0 | 0 | 49 |
| Provisions | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Loot / Rewards | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Quirks | 35 | 35 | 0 | 0 | 0 | 0 | 0 | 35 |
| Diseases | 11 | 11 | 0 | 0 | 0 | 0 | 0 | 11 |
| Virtues | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 5 |
| Afflictions | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 5 |
| Hamlet | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| Building Levels / Effects | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| Caretaker | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Other | 1544 | 43 | 0 | 0 | 0 | 0 | 0 | 153 |

# Complete Edition — C0 content coverage audit

**STOP after C0. No gameplay, registry, UI, save or draw behavior changed.**

Base: `3fcbde52e3d164cb753b2a801aa4b2488276a281`. Source SHA-256: `d2fe21a6aa294f80fb47e56677c3a74090c3dc131361d798dfde709f6a3a64a2`. Implementation fingerprint: `70a20c24805f4a1108e0956d29c80be57c21c862967deaad9d8e0308f85df19f`. Gate: **PASS**.

## Counting contract and limits

1. Source Physical = serialized non-state, non-infinite-template objects in that category; containers/models remain in Other. Source Logical = named hero classes and skill families (upgrade states grouped), independently bound DD monster definitions, otherwise unique scoped face/back/cell identities for cards. Untranscribed visual identities are **provisional logical candidates, not confirmed semantic definitions**. A zero for a subtype such as Threat/Monster Ability means no separately identified cards, not proof the mechanic is absent. Skills printed inside monster/boss mats still require leaf extraction.
2. Extracted = existing intake requirement packages (may be partial). Normalized = those packages, except DD Monsters uses actual composition definitions. Dungeon Tiles uses geometry packages in Normalized and layouts in Registry: these units cannot be compared by subtraction. Metadata extraction alone does not count as printed-field extraction.
3. Registry/Production/UI measure **Community source-backed definitions only**, not legacy/prototype pools. Production/UI are static reachable catalogue counts, not a new playtest. Final Encounter production/UI count four main forms; auxiliary actor/skill execution is not claimed by that number. Existing Act IV acceptance has unresolved source rules.

This is a complete structural inventory with explicit semantic blockers, not full semantic normalization or proof that all discovered content is playable. Unclassified=0 is achieved by retaining unconfirmed objects as source-blocked, never deleting them. No videogame wiki, guessed values or prototype promotion is used.

## Structural totals

- Objects discovered/classified: **2996/2996**; unknown: **0**.
- Card records: **1405**; physical card objects: **1131**; alternate card states: **272**; infinite-bag card templates: **2**; scoped visual identities: **1377**.
- CustomDeck declarations: **1409**; CustomImage declarations: **759**. All declarations retained, including unused atlas definitions. Unused atlas cells are NOT presumed physical cards.
- Reused GUID groups: **168**; reused Deck IDs with differing definitions: **36**. Full paths and scoped deck lookup are mandatory.
- Source-blocked object records: **1492**. Each raw record records the reason; this is not a count of unique missing gameplay definitions.

## P0 findings

- Trinkets: shared table level decks contain 14 + 12 + 12 = **38** physical cards; Color of Madness adds **11**. Total **49** physical / **49** visual definitions, independently scanned. Existing official runtime pool is **1**; Community trinket registry is **0**. Core expected 38 is not used as the Complete Edition total.
- Standard quests: five source region quest groups each contain 15 cards, **75** in total. A separately named Boss Quest contributes **1**; DD quests remain **3**. Existing ordinary Quest Select uses 2 standard + 1 boss prototype definitions. The 75 source cards still need objectives/rewards/room counts transcribed.
- Heroes: **18 named classes**, with **36 hero mats**, **37 level cards**, **126 physical skill objects / 378 skill forms**. Existing 8 heroes include 4 explicit placeholders. None has a full Complete Edition source-leaf skill binding.
- Ordinary monster container cards: **179** physical / **170** visual variants. Monster family and embedded skill totals are **source-blocked**, not inferred from card quantities. Existing runtime has 3 simplified monsters / 7 prototype skills.
- DD monster pool: **26** physical / **9** bound logical definitions; this is separate from ordinary monsters.

## Existing repository and production consumers

Counts below are imported from actual registries, not copied from the task baseline. These are not credited to Complete Edition coverage without source bindings.

| Category | Existing registry | Authority / gap | Consumer |
| --- | ---: | --- | --- |
| Heroes | 8 | prototype; last four explicitly placeholder | `src/pages/CampaignSetupPage.tsx` |
| Hero Skills | 28 | prototype; no Complete Edition leaf binding | `src/pages/BattlePage.tsx` |
| Standard Quests | 2 | prototype | `src/pages/QuestSelectPage.tsx` |
| Boss Quests | 1 | prototype | `src/pages/QuestSelectPage.tsx` |
| Monsters | 3 | prototype simplified | `src/data/battle-encounters.ts` |
| Monster Ability Cards | 7 | prototype skill definitions, not physical cards | `src/pages/BattlePage.tsx` |
| Quirks | 35 | prototype simplified | `src/game-engine/quirks.ts` |
| Diseases | 11 | rulebook backed; TTS face/effect equality not yet audited | `src/game-engine/diseases/acquire-disease.ts` |
| Virtues | 5 | existing rules; TTS binding unverified | `src/game-engine` |
| Afflictions | 5 | existing rules; TTS binding unverified | `src/game-engine` |
| Curios | 4 | existing simplified pool; TTS binding unverified | `src/game-engine/diseases/curio.ts` |
| Hamlet | 5 | simplified building definitions | `src/pages/HamletPage.tsx` |
| Encounter / Event Content | 3 | mock Hamlet events | `src/game-engine/hamlet.ts` |
| Trinkets | 1 | formal verified pool; not a Community registry | `src/game-engine/trinkets/draw-trinket.ts` |

Prototype trinkets: 6. Full definition IDs and source-import edges with line numbers are in coverage JSON. QuestSelectPage imports QUESTS; CampaignSetupPage imports HEROES; battle-encounters imports MONSTERS. These are future C1–C5 seams, unchanged here.

## Hero source count by class

| Hero | Mats | Level cards | Physical skills | Skill forms | Normalized / production source-backed skills |
| --- | ---: | ---: | ---: | ---: | --- |
| Shieldbreaker | 2 | 2 | 7 | 21 | 0 / 0 |
| Flagellant | 2 | 2 | 7 | 21 | 0 / 0 |
| Plague Doctor | 2 | 2 | 7 | 21 | 0 / 0 |
| Crusader | 2 | 2 | 7 | 21 | 0 / 0 |
| Abomination | 2 | 3 | 7 | 21 | 0 / 0 |
| Jester | 2 | 2 | 7 | 21 | 0 / 0 |
| Musketeer | 2 | 2 | 7 | 21 | 0 / 0 |
| Occultist | 2 | 2 | 7 | 21 | 0 / 0 |
| Highwayman | 2 | 2 | 7 | 21 | 0 / 0 |
| Arbalest | 2 | 2 | 7 | 21 | 0 / 0 |
| Hound Master | 2 | 2 | 7 | 21 | 0 / 0 |
| Vestal | 2 | 2 | 7 | 21 | 0 / 0 |
| Grave Robber | 2 | 2 | 7 | 21 | 0 / 0 |
| Man-At-Arms | 2 | 2 | 7 | 21 | 0 / 0 |
| Bounty Hunter | 2 | 2 | 7 | 21 | 0 / 0 |
| Leper | 2 | 2 | 7 | 21 | 0 / 0 |
| Hellion | 2 | 2 | 7 | 21 | 0 / 0 |
| Antiquarian | 2 | 2 | 7 | 21 | 0 / 0 |

## Card containers (includes expansion content)

Expansion roots are preserved in sourceCategory, not excluded. States are not extra physical copies.

| Container | Physical | Alternate states | Visual identities |
| --- | ---: | ---: | ---: |
| Afflictions | 5 | 0 | 5 |
| Diseases | 11 | 0 | 11 |
| Positive Quirks | 17 | 0 | 17 |
| Trinkets Lvl 3 | 12 | 0 | 12 |
| Virtues | 5 | 0 | 5 |
| Negative Quirks | 18 | 0 | 18 |
| (unlabelled table/deck) | 26 | 20 | 32 |
| Darkest Dungeon > Stygian Room Cards (Darkest Dungeon) | 8 | 0 | 8 |
| Darkest Dungeon > Room Cards (Darkest Dungeon) | 12 | 0 | 12 |
| Darkest Dungeon > Stygian Room Cards (Ruin) | 9 | 0 | 9 |
| Darkest Dungeon > Room Cards (Ruin) | 13 | 0 | 13 |
| Darkest Dungeon > Quests > Lvl 2 | 5 | 0 | 5 |
| Darkest Dungeon > Quests > Lvl 1 | 5 | 0 | 5 |
| Darkest Dungeon > Quests > Darkest dungeon | 3 | 0 | 3 |
| Darkest Dungeon > Quests > Lvl 3 | 5 | 0 | 5 |
| Darkest Dungeon > Monsters Cards > Darkest Dungeon Monsters | 26 | 0 | 26 |
| Darkest Dungeon > Monsters Cards > Common Monsters | 48 | 0 | 48 |
| Darkest Dungeon > Monsters Cards > Ruins Monsters | 18 | 0 | 9 |
| Darkest Dungeon > Boss Cards &  Figurines > Ruins > Necromancer | 9 | 0 | 9 |
| Darkest Dungeon > Boss Cards &  Figurines > Ruins > Collector | 18 | 0 | 18 |
| Darkest Dungeon > Boss Cards &  Figurines > Ruins > Prophet | 9 | 0 | 9 |
| Darkest Dungeon > Boss Cards &  Figurines > Ruins > Fanatic | 12 | 0 | 12 |
| Darkest Dungeon > Boss Cards &  Figurines > Darkest Dungeon > Heart of darkness | 4 | 0 | 4 |
| Darkest Dungeon > Boss Cards &  Figurines > Darkest Dungeon > Mammoth Cyst | 7 | 0 | 7 |
| Darkest Dungeon > Boss Cards &  Figurines > Darkest Dungeon > Shuffling Horror | 3 | 0 | 3 |
| Darkest Dungeon > Boss Cards &  Figurines > Darkest Dungeon > Templar Warlord/Impaler | 6 | 0 | 6 |
| Darkest Dungeon > Boss Cards &  Figurines > Darkest Dungeon > Ancestor | 10 | 0 | 10 |
| The Color of Madness > Trinkets | 11 | 0 | 11 |
| The Color of Madness > Curio Spawn | 3 | 0 | 3 |
| The Color of Madness > Curio | 10 | 0 | 10 |
| The Color of Madness > Monster Card | 23 | 0 | 23 |
| The Color of Madness > Boss Cards & Figurines > Thing from the stars | 3 | 0 | 3 |
| The Color of Madness > Boss Cards & Figurines > The Miller | 5 | 0 | 5 |
| The Color of Madness > Boss Cards & Figurines > The Sleeper | 4 | 0 | 4 |
| The Darkest Heroes > Shieldbreaker | 11 | 14 | 25 |
| The Darkest Heroes > Flagellant | 11 | 14 | 25 |
| The Darkest Heroes > Plague Doctor | 11 | 14 | 25 |
| The Darkest Heroes > Crusader | 11 | 14 | 25 |
| The Darkest Heroes > Abomination | 12 | 14 | 26 |
| The Darkest Heroes > Jester | 11 | 14 | 25 |
| The Darkest Heroes > Musketeer | 11 | 14 | 25 |
| The Darkest Heroes > Occultist | 11 | 14 | 25 |
| The Darkest Heroes > Highwayman | 11 | 14 | 25 |
| The Darkest Heroes > Arbalest | 11 | 14 | 25 |
| The Darkest Heroes > Hound Master | 11 | 14 | 25 |
| The Darkest Heroes > Vestal | 11 | 14 | 25 |
| The Darkest Heroes > Grave Robber | 11 | 14 | 25 |
| The Darkest Heroes > Man-At-Arms | 11 | 14 | 25 |
| The Darkest Heroes > Bounty Hunter | 11 | 14 | 25 |
| The Darkest Heroes > Leper | 11 | 14 | 25 |
| The Darkest Heroes > Hellion | 11 | 14 | 25 |
| The Darkest Heroes > Antiquarian | 11 | 14 | 25 |
| The Strongbox > Conditions/Rooms (Aid Cards) | 0 | 0 | 1 |
| The Strongbox > Exploration/Provision (Aid Cards) | 0 | 0 | 1 |
| The Strongbox > Master Webber DLC | 9 | 0 | 9 |
| The Strongbox > The Butcher's Circus - PVP mode | 2 | 0 | 1 |
| The Strongbox > Regles | 4 | 0 | 2 |
| The Crimson Court > Boss Room Cards | 4 | 0 | 4 |
| The Crimson Court > Room Cards | 8 | 0 | 8 |
| The Crimson Court > Stygian Room Cards | 8 | 0 | 8 |
| The Crimson Court > Curio | 16 | 0 | 16 |
| The Crimson Court > Quests > lvl 1 | 5 | 0 | 5 |
| The Crimson Court > Quests > lvl 2 | 5 | 0 | 5 |
| The Crimson Court > Quests > lvl 3 | 5 | 0 | 5 |
| The Crimson Court > Monsters Cards | 23 | 0 | 23 |
| The Crimson Court > Boss Cards & Figurines > Viscount | 18 | 0 | 18 |
| The Crimson Court > Boss Cards & Figurines > Baron | 9 | 0 | 9 |
| The Crimson Court > Boss Cards & Figurines > Countess | 9 | 0 | 9 |
| The Crimson Court > Boss Cards & Figurines > Garden Guardian | 21 | 0 | 21 |
| The Warrens > Boss Room Cards | 3 | 0 | 3 |
| The Warrens > Room Cards | 9 | 0 | 9 |
| The Warrens > Stygian Room Cards | 9 | 0 | 9 |
| The Warrens > Curio | 16 | 0 | 16 |
| The Warrens > Quests > lvl 3 | 5 | 0 | 5 |
| The Warrens > Quests > lvl 1 | 5 | 0 | 5 |
| The Warrens > Quests > lvl 2 | 5 | 0 | 5 |
| The Warrens > Monster Cards | 21 | 0 | 21 |
| The Warrens > Boss Cards & Figurines > Brigand Vvulf | 9 | 0 | 9 |
| The Warrens > Boss Cards & Figurines > The Flesh | 18 | 0 | 18 |
| The Warrens > Boss Cards & Figurines > Swine Prince | 12 | 0 | 12 |
| The Cove > Stygian Room Cards | 9 | 0 | 9 |
| The Cove > Boss Room Cards | 3 | 0 | 3 |
| The Cove > Room Cards | 9 | 0 | 9 |
| The Cove > Curio | 16 | 0 | 16 |
| The Cove > Quests > lvl 3 | 5 | 0 | 5 |
| The Cove > Quests > lvl 1 | 5 | 0 | 5 |
| The Cove > Quests > lvl 2 | 5 | 0 | 5 |
| The Cove > Monster Card | 24 | 0 | 24 |
| The Cove > Boss Cards & Figurines > Siren | 9 | 0 | 9 |
| The Cove > Boss Cards & Figurines > Shambler | 15 | 0 | 15 |
| The Cove > Boss Cards & Figurines > Drowned Crew | 12 | 0 | 12 |
| The Weald > Curio | 16 | 0 | 16 |
| The Weald > Stygian Room Cards | 9 | 0 | 9 |
| The Weald > Boss Room Cards | 3 | 0 | 3 |
| The Weald > Room Cards | 9 | 0 | 9 |
| The Weald > Quests > lvl 3 | 5 | 0 | 5 |
| The Weald > Quests > lvl 1 | 5 | 0 | 5 |
| The Weald > Quests > lvl 2 | 5 | 0 | 5 |
| The Weald > Monster Card | 22 | 0 | 22 |
| The Weald > Boss Cards & Figurines > Shrieker | 12 | 0 | 12 |
| The Weald > Boss Cards & Figurines > Hag | 15 | 0 | 15 |
| The Weald > Boss Cards & Figurines > Brigand Pounder | 12 | 0 | 12 |
| Trinkets Lvl 1 | 14 | 0 | 14 |
| Trinkets Lvl 2 | 12 | 0 | 12 |
| Hamlet Event | 16 | 0 | 16 |
| Curio Cards | 24 | 0 | 24 |

## Blocker disposition and missing work

- Visually reviewed Hamlet board 72a96b identifies **9 building headings**: Survivalist, Tavern, Sanitarium, Abbey, Graveyard, Guild, Blacksmith, Stagecoach, Nomad Wagon. These are embedded board definitions, not nine physical cards. Separate Graveyard board and 14 upgrade components are retained; costs/effects are not normalized.
- P0: Trinket sides/timing/modifiers; ordinary quest objectives/rewards/special rules; hero stats/level differences/skill effects; monster families/levels/d10/embedded skills require source-card transcription and evidence binding. The source image exists; semantic extraction is missing. This is distinct from missing source imagery.
- P1: Quirks require effect equality checks, even when names match; 11 existing diseases require TTS alignment; virtues/afflictions need trigger/result evidence; Curios need text/effect extraction; Hamlet board/building costs and effects need board and rulebook evidence.
- Rule-only Trap/Rubble/Hunger/Provision/building mechanics are not inferred from token counts. Unnamed boards/cards are explicitly source-blocked in raw inventory; all remain addressable by path.
- Known DD source-level blockers: `TEMPLARS_PIT_EXIT_RULE_UNRESOLVED`, `GESTATING_HEART_LETHAL_TIMING_UNRESOLVED`, `COME_UNTO_YOUR_MAKER_UNRESOLVED`.
- Source assets from earlier intake are SHA checked (35 ready records). Existing requirement-to-path/GUID bindings are checked separately from runtime definitions. Source completeness is not asserted merely because a normalized package exists.
- Complete semantic totals for embedded monster/boss skills and unnamed board effects remain source-blocked. C1 must resolve relevant leaves before release; the structural audit must not be described as full content acceptance.

## Reproduction / gates

Run `npm run audit:complete-edition-content -- --tts <3657612854.json>`, then `npm run verify:complete-edition-content-coverage -- --tts <3657612854.json>`. S2/S3/S4 files must be adjacent, or use `--source-dir`. Alternatively set COMPLETE_EDITION_TTS.

Verify regenerates in memory and compares every byte of committed outputs; checks classification conservation, card crop indexes, deck membership multiplicities, state ownership, source paths/GUIDs and existing asset SHA. Inputs and implementation are fingerprinted; no self-referential publication commit hash. Deleting an object, changing a source/registry, or tampering with outputs fails. The later normalized=registry and production-pool semantic gates are not claimed by this C0 gate.

Audit errors: none.
