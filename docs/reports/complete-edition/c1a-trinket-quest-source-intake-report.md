# C1A — Complete Edition Trinket & Quest Source Intake

Status: source intake delivered with two explicit source-semantic blockers; ready for independent audit, not Production integration.

Branch: `phase-11a4-c1a-trinket-quest-source-intake`. Frozen C0 base: `d571a323bf7d865f9c4def440e7e5621fdebe595`.

S1: `3657612854.json`, SHA-256 `d2fe21a6aa294f80fb47e56677c3a74090c3dc131361d798dfde709f6a3a64a2`. S2/S3 provenance remains in the frozen C0 inventory; neither supplies replacement card values. S4 is the unchanged `docs/DD_EN_COREBOX_RULES.pdf` (SHA-256 `9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae`).

## Coverage

“Transcribed” means all readable names, rule panels, and printed symbols; Quest flavor text is also retained. “Normalized records” includes explicit unresolved leaves; “Normalized complete” and Registry count only independently source-supported definitions. Runtime unsupported is a whole-definition classification, excludes source-blocked definitions, and includes missing exact timing/adapters as well as missing effects. It does not mean the existing engine has no useful primitives.

| Metric | Core | Color of Madness | Total |
| --- | ---: | ---: | ---: |
| Physical | 38 | 11 | 49 |
| Logical | 38 | 11 | 49 |
| Both assets bound | 38 | 11 | 49 |
| Transcribed (both effect panels) | 38 | 11 | 49 |
| Normalized records | 38 | 11 | 49 |
| Normalized complete | 37 | 11 | 48 |
| Registry | 37 | 11 | 48 |
| Source-blocked | 1 | 0 | 1 |
| Runtime unsupported | 37 | 11 | 48 |

| Metric | Standard | Boss |
| --- | ---: | ---: |
| Physical | 75 | 1 |
| Logical | 75 | 1 |
| Both assets bound | 75 | 1 |
| Transcribed | 75 | 1 |
| Normalized records | 75 | 1 |
| Normalized complete | 74 | 1 |
| Registry | 74 | 1 |
| Source-blocked | 1 | 0 |
| Runtime unsupported | 74 | 1 |

250 local PNGs are bound to 125 original physical identities. All have actual front and indexed UniqueBack images; no generic image is substituted. Core Trinket levels are 14 / 12 / 12. COM cards have no printed level and retain `null`; they are not silently assigned Core levels.

| Standard Quest source root | contentSet / region | Level I | Level II | Level III | Total | Registry |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Darkest Dungeon | core / ruins | 5 | 5 | 5 | 15 | 15 |
| The Crimson Court | crimson-court / crimson-court | 5 | 5 | 5 | 15 | 14 |
| The Warrens | warrens / warrens | 5 | 5 | 5 | 15 | 15 |
| The Cove | cove / cove | 5 | 5 | 5 | 15 | 15 |
| The Weald | weald / weald | 5 | 5 | 5 | 15 | 15 |

Core ordinary quests are under the TTS `Darkest Dungeon > Quests > Lvl n` hierarchy; “ruins” identifies this base-region group, cross-checked by its arch emblem and text. They are not the three separately handled DD quests. Expansion selection defaults are intentionally undefined.

## Source architecture and review limits

1. [Asset manifest](../../data/complete-edition/c1a-asset-manifest.json): frozen C0 physical identity → inherited TTS CustomDeck → row-major atlas cell → actual crop → SHA-256. Source atlas hashes and exact pixel boxes are retained.
2. [Literal review](../../data/complete-edition/c1a-literal-review.json) and `literal-observations*.json`: manually read card wording, before semantic mapping; no OCR is source truth. Pictograms use bracket tokens, whitespace and typography are normalized, spelling and printed grammatical errors are retained.
3. [Trinket literal evidence](../../data/complete-edition/trinkets/community-trinket-source-evidence.json) / [Quest literal evidence](../../data/complete-edition/quests/community-quest-source-evidence.json): field references specify actual image, hash, region and rotation. Positive/negative Trinket effects occupy the front upper/lower halves, not TTS FaceURL/BackURL respectively. Back images are artwork with printed deck/level labels.
4. [Trinket normalized definitions](../../data/complete-edition/trinkets/community-trinket-normalized.json) / [Quest normalized definitions](../../data/complete-edition/quests/community-quest-normalized.json): source-domain semantic IR, not executable Runtime effects. Every semantic leaf has a literal-field reference; rules and engine classification are kept distinct. Actual printed null/absence and unresolved meanings are distinct.
5. [Trinket Registry](../../../src/data/community-reference/trinkets/index.ts) / [Quest Registries](../../../src/data/community-reference/quests/index.ts): immutable, source-supported data only. Pure getters allow level/content-set filtering. These modules have no Production consumers.

[Review lock](../../data/complete-edition/c1a-source-review-lock.json) pins authored observations, independent support review, semantic interpretations, rulebook evidence and asset manifest. Generation never rewrites this lock. These integrity tests detect drift and prove reproducible transformation; they cannot prove that the same agent read or interpreted an image correctly. Independent C1B audit must inspect original images, especially icon placement, wording ambiguities and timing. No Runtime implementation or gameplay test is used as source proof.

## Explicit blockers

- **Bloodcourse Medallion (Core II, 453-22):** positive “When healed, receive [heal]4” has no explicit plus sign. Amount 4 is transcribed; additional-versus-replacement operation stays `null`. Negative Bleed 1 for 3t is fully retained. Excluded from Registry.
- **Rest in Rubble III (Crimson Court III, 444-14):** printed “Clearing Curio Rooms causes Heroes to a tomb.” lacks a verb. The missing action stays `null`; mandatory Curio battles, negative-only effects, and no Torch counter are retained. Excluded from Registry. The Level I card is not a fallback.

## Runtime primitive assessment

Reviewed C0 files: `src/types/trinkets.ts`, `trinket-opportunities.ts`, `use-trinket.ts`, `battle-trinket-bridge.ts`, `src/types/index.ts` RuleEventType, `src/data/quests.ts`, and `progression/quest-objectives.ts`.

- TrinketUseWindow declares many timings but WIRED_WINDOWS has only `before-attack-roll`, `hero-turn-start`, `room-entered`. P26 explicitly permits Critical Stone after the roll; a before-roll-only implementation is not complete source semantics.
- Accuracy, Crit, damage, healing and Dodge have modifier candidates; self-heal, stress, light and provision consumption have existing effect candidates. `canUse` only provides battle/acting-hero/light predicates, not stance conditions. Independent condition magnitude/duration, arbitrary targeting, next-skill storage, action gain, disease/quirk changes, exploration dice and crystal resources need additional primitives or adapters.
- All 48 source-supported whole Trinket definitions have at least one missing exact capability. Heretical Passage’s explicitly before-roll positive panel is classified `NEEDS_COMPOSITE_EXISTING_PRIMITIVES`; its crystal-discard negative panel prevents certifying the whole card. Each side lists actual existing candidates and concrete gaps.
- Ordinary QuestDefinition lacks the full printed room-token setup, resting supply setup, repeatable XP qualifications and special policies. Room-clear counters are existing candidates, but a matching counter alone does not certify a complete quest. All 75 admitted ordinary Quest definitions remain `RUNTIME_PRIMITIVE_UNSUPPORTED` as complete definitions.

## Boss and Threat findings

`445-18` / GUID `bb495d` at `/ObjectStates/79` is visually **Face the Threat!**. It prints 12 Resting Points, 3 XP, eight room tokens (Objective 1, Empty 1, Dark 2, Curio 1, Treasure 1, Lair 1, Trap 1), boss setup and no return before boss defeat. It has its own Community ID. Matching the prototype’s name does not import prototype values.

S4 p30 and p35 bind its generic boss association to the current Imminent Threat after two ordinary quests in Acts I–III. P30 defines edge-room placement, current boss room, no retreat, no normal round limit, immediate victory/removal of other monsters on boss death, and campaign loss on failure. No specific boss identity is invented.

S4 p11/p30 explicitly illustrates/describes Threat rules on Boss card sides. C0’s zero **separately identified** Threat Cards is not absence of Threat mechanics. The precise TTS threat-face pool remains `source-blocked` in [rulebook evidence](../../data/complete-edition/c1a-rulebook-evidence.json); C1A does not reclassify the C0 boss inventory.

## Duplicate / identity review

125 physical cards → 125 logical definitions. Zero exact front-image duplicates and zero identical printed names. Eight shared-back hash groups are documented; same back is not merge evidence. Same level-independent XP rate does not merge different titles, room composition or special rules. No merge or split was performed. COM reprints are not presumed from artwork or GUIDs. See [logical identity review](../../data/complete-edition/c1a-logical-identities.json).

Semantic IDs use printed name + content scope (and Quest level), not GUID/CardID/array index. Physical IDs remain exactly the C0 `tts-path:...` identities. No source field falls back to a prototype.

## Reproduction and gates

```powershell
$env:COMPLETE_EDITION_TTS = "<path to 3657612854.json>"
npm run import:complete-edition-c1a -- --tts $env:COMPLETE_EDITION_TTS --tts-images "<TTS Mods/Images directory>"
npm run generate:complete-edition-c1a
npm run verify:complete-edition-c1a
npm run typecheck
```

Raw atlases are cached under `.artifacts/c1a/atlases/<SHA256-of-exact-source-URL>.bin`; the verifier accepts `--atlas-cache`. Import may download exact C0 URLs using curl; local TTS cache is matched by exact URL-derived filename. Reproducing the image proof needs those frozen original bytes. No current remote content is fetched by the browser/game. Missing source data fails verification rather than inventing a replacement.

The verification command checks unchanged S1 SHA and frozen C0 inventory; raw inherited deck metadata; all physical identities; every asset hash and crop box; re-extraction of all 250 PNGs from original atlas bytes; leaf binding; source/normalized/Registry equality; no unexplained merges/splits; no prototype IDs; actual TypeScript exports/getters; byte-identical generated outputs; and unchanged baseline Production/DD files.

| Tamper | Required outcome |
| --- | --- |
| T1 delete Trinket evidence | FAIL |
| T2 alter cardIndex | FAIL |
| T3 exchange Trinket front assets | FAIL |
| T4 alter Quest title | FAIL |
| T5 inject prototype Quest | FAIL |
| T6 give blocked semantic leaf a value | FAIL |
| T7 conflate Core / COM | FAIL |
| T8 logical merge without evidence | FAIL |

Execution evidence: `npm run verify:complete-edition-c1a` passed all eight rejection cases and 250 independent re-crops; `npm run typecheck` and actual Registry/getter verification passed. See [verification log](c1a-verification.log). No gameplay E2E was run, because C1A does not change gameplay.

## Trinket audit index

Bracket tokens are printed pictograms, not Runtime values. Every row links its actual front (both effect panels). Physical backs and per-leaf evidence are in the manifest/literal JSON.

| Card | Set / level | Positive printed text | Negative printed text | Status |
| --- | --- | --- | --- | --- |
| [Ashen Distillation](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-0.front.png) | color-of-madness / not printed | Self: [heal]20 | Discard a [crystal] | source-supported |
| [Broken Key](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-1.front.png) | color-of-madness / not printed | When you hit with a Skill, cause in addition [stun] 2t | [stress] +2 | source-supported |
| [Coat of Many Colors](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-2.front.png) | color-of-madness / not printed | [buff] 3t, [buff] 2t, [buff] 1t | [hero][hero][hero][hero]: [stress] +2 | source-supported |
| [Heretical Passage](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-3.front.png) | color-of-madness / not printed | Before you roll for a Skill, give it Crit+6, [damage]+6, Self: [heal]6 | Discard a [crystal] | source-supported |
| [Mask of the Timeless](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-4.front.png) | color-of-madness / not printed | Gain an additional action | Discard a [crystal] | source-supported |
| [Miller's Pipe](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-5.front.png) | color-of-madness / not printed | Remove [blight], [bleed], [mark] | [debuff] 1t | source-supported |
| [Petrified Amulet](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-6.front.png) | color-of-madness / not printed | [armor] 3t | 1[bleed] 3t | source-supported |
| [Petrified Skull](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-7.front.png) | color-of-madness / not printed | [armor] 2t, [guard] 2t | [stress] +2 | source-supported |
| [Smoking Skull](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-8.front.png) | color-of-madness / not printed | When targeted by an attack, gain [dodge] +3 | Give your next Skill Acc-1 | source-supported |
| [Thirsting Blade](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-9.front.png) | color-of-madness / not printed | Crit+2 | When you miss with an attack, the Hero suffers 3 [wound] | source-supported |
| [Topshelf Tonic](../../../src/assets/community-reference/complete-edition/trinkets/color-of-madness/466-10.front.png) | color-of-madness / not printed | [stress] -9 | 2[blight] 3t | source-supported |
| [Accuracy Stone](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-0.front.png) | core / 1 | Acc+1 | Acc-1 | source-supported |
| [Archer's Ring](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-1.front.png) | core / 1 | Acc+2 when in [arrows-stance] | Acc-1 | source-supported |
| [Berserk Charm](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-26.front.png) | core / 3 | Gain +1 Action | [stress] +1 | source-supported |
| [Bleed Charm](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-2.front.png) | core / 1 | When you hit with a Skill inflict an additional 2[bleed] 2t | -1t to a Condition you are causing | source-supported |
| [Blight Charm](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-3.front.png) | core / 1 | When you hit with a Skill inflict an additional 2[blight] 2t | -1t to a Condition you are causing | source-supported |
| [Bloodcourse Medallion](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-22.front.png) | core / 2 | When healed, receive [heal]4 | When hit: Suffer 1[bleed] 3t | source-blocked |
| [Bloodthirst Ring](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-14.front.png) | core / 2 | Consume one [food] and [heal]10 | When hit: Suffer 3[bleed] 2t | source-supported |
| [Book of Constitution](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-15.front.png) | core / 2 | When you suffer a [disease] discard it immediately | - [movement][movement] | source-supported |
| [Book of Holiness](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-16.front.png) | core / 2 | [stress] -3 | Turn a hit against you into a Crit. | source-supported |
| [Book of Relaxation](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-17.front.png) | core / 2 | [stress] -2 | [dodge] -2 | source-supported |
| [Book of Sanity](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-35.front.png) | core / 3 | [stress] -4 | Suffer [damage]6 | source-supported |
| [Camouflage Cloak](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-18.front.png) | core / 2 | [dodge] +2 if [light] is [greater-or-equal] 3 | When hit: Suffer [stun] 1t | source-supported |
| [Camper's Helmet](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-23.front.png) | core / 2 | When Camping, roll 2 [provision-die] | [stress] +1 when Scouting | source-supported |
| [Candle of Life](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-36.front.png) | core / 3 | You and every Hero in the same Area [heal]6 | [light] -2 | source-supported |
| [Caution Cloak](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-4.front.png) | core / 1 | Scout without suffering any [stress] | [light]-1 | source-supported |
| [Chirurgeon's Charm](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-19.front.png) | core / 2 | When healing: heal [heal]+2 | When healed: recieve [heal]-4 | source-supported |
| [Cleansing Crystal](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-37.front.png) | core / 3 | Remove all [bleed], [blight], [debuff], [stun], [mark] from all Heroes | Gain a [negative-quirk-card] | source-supported |
| [Critical Stone](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-5.front.png) | core / 1 | Crit+2 | Acc-2 | source-supported |
| [Damage Stone](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-6.front.png) | core / 1 | [damage]+3 | When you take Damage: suffer 2 [wound] | source-supported |
| [Dark Bracer](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-20.front.png) | core / 2 | Crit+2 if [light] [less-or-equal] 3 | When a Skill Hits the Target: if [light] [greater-or-equal] 3 Deal no [damage]. | source-supported |
| [Dark Crown](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-27.front.png) | core / 3 | [stress] -9 if [light] [less-or-equal] 3 | When the result is determined, -2 Virtue Chance if [light] [less-or-equal] 3 | source-supported |
| [Debuff Charm](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-7.front.png) | core / 1 | When you hit with a Skill inflict an additional [debuff] 2t | -1t to a Condition you are causing | source-supported |
| [Defender's Ring](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-32.front.png) | core / 3 | Crit+4 if in [shield-stance] | Acc-2 if not in [shield-stance] | source-supported |
| [Fasting Seal](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-28.front.png) | core / 3 | [dodge] +5 | Consume a [food] gaining no effect | source-supported |
| [Fortunate Armlet](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-24.front.png) | core / 2 | Acc+1 and Crit+1 | [stress] +1 | source-supported |
| [Protective Padlock](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-21.front.png) | core / 2 | When hit: Suffer half the [damage]X rounded up | - [movement] | source-supported |
| [Recovery Charm](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-29.front.png) | core / 3 | [heal]9 | [stress] +2 | source-supported |
| [Sage's Book](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-8.front.png) | core / 1 | Acc+2 when in [banner-stance] | Acc-1 | source-supported |
| [Scholar's Ring](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-33.front.png) | core / 3 | Crit+4 if in [banner-stance] | Acc-2 if not in [banner-stance] | source-supported |
| [Sniper's Ring](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-30.front.png) | core / 3 | Crit+4 if in [arrows-stance] | Acc-2 if not in [arrows-stance] | source-supported |
| [Solar Bracer](../../../src/assets/community-reference/complete-edition/trinkets/core/level-2/453-25.front.png) | core / 2 | Crit+2 if [light] [greater-or-equal] 3 | When a Skill Hits the Target: if [light] [less-or-equal] 3 Deal no [damage]. | source-supported |
| [Solar Crown](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-34.front.png) | core / 3 | [stress] -3 if [light] [greater-or-equal] 3 | When the result is determined, -2 Virtue Chance if [light] [greater-or-equal] 3 | source-supported |
| [Speed Stone](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-9.front.png) | core / 1 | + [movement] or [dodge] +1 | - [movement] or [dodge] -1 | source-supported |
| [Stun Charm](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-10.front.png) | core / 1 | When you hit with a skill inflict an additional [stun] 1t | -1t to a Condition you are causing | source-supported |
| [Survival Guide](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-11.front.png) | core / 1 | When exploring: ignore a [trap] or [hunger] | When exploring, turn an Exploration Die that is not a [trap], to [trap] | source-supported |
| [Warrior's Bracer](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-12.front.png) | core / 1 | Acc+2 Acc when in [sword-stance] | Acc-1 | source-supported |
| [Warrior's Cap](../../../src/assets/community-reference/complete-edition/trinkets/core/level-1/453-13.front.png) | core / 1 | Acc+2 when in [shield-stance] | Acc-1 | source-supported |
| [Warrior's Ring](../../../src/assets/community-reference/complete-edition/trinkets/core/level-3/453-31.front.png) | core / 3 | Crit+4 if in [sword-stance] | Acc-2 if not in [sword-stance] | source-supported |

## All ordinary Quest definitions

Bottom composition is transcribed room tokens; `?` means printed random remainder, not an estimated count. Printed special rules below are normative and retained in addition to structured parameters.

| Card | Region / level | Rest points | XP / reward panel | Room tokens | Source status |
| --- | --- | ---: | --- | --- | --- |
| [Face the Threat!](../../../src/assets/community-reference/complete-edition/quests/boss/445-18.front.png) | boss / not printed | 12 | 3 Xp | {"objective":1,"empty":1,"dark":2,"curio":1,"treasure":1,"lair":1,"trap":1} | source-supported |
| [Deep Horrors](../../../src/assets/community-reference/complete-edition/quests/cove/level-1/445-21.front.png) | cove / 1 | 12 | 1 Xp/ Uca Major killed. | {"objective":3,"empty":3,"dark":1,"trap":1} | source-supported |
| [Deep Waters](../../../src/assets/community-reference/complete-edition/quests/cove/level-1/445-20.front.png) | cove / 1 | 8 | 1 Xp/ 2 Rooms cleared. | {"empty":1,"dark":1,"curio":2,"treasure":1,"lair":2,"trap":1} | source-supported |
| [Purify the Eldritch Signs](../../../src/assets/community-reference/complete-edition/quests/cove/level-1/445-23.front.png) | cove / 1 | 12 | 1 Xp/ Eldritch Sign purified. | {"objective":3,"empty":1,"dark":2,"treasure":1,"trap":1} | source-supported |
| [Test the Waters](../../../src/assets/community-reference/complete-edition/quests/cove/level-1/445-19.front.png) | cove / 1 | 12 | 1 Xp/ 2 samples. | {"objective":2,"empty":1,"dark":1,"curio":1,"treasure":1,"trap":2} | source-supported |
| [Unclean Waters](../../../src/assets/community-reference/complete-edition/quests/cove/level-1/445-22.front.png) | cove / 1 | 12 | 1 Xp/ Lair cleared. | {"empty":1,"dark":1,"curio":1,"treasure":1,"lair":3,"trap":1} | source-supported |
| [Deep Horrors 2](../../../src/assets/community-reference/complete-edition/quests/cove/level-2/445-26.front.png) | cove / 2 | 12 | 1 Xp/ Uca Major killed. | {"objective":3,"empty":3,"dark":1,"trap":1} | source-supported |
| [Deep Waters 2](../../../src/assets/community-reference/complete-edition/quests/cove/level-2/445-24.front.png) | cove / 2 | 8 | 1 Xp/ 2 Rooms cleared. | {"dark":1,"curio":2,"treasure":1,"lair":3,"trap":1} | source-supported |
| [Eldritch Purging](../../../src/assets/community-reference/complete-edition/quests/cove/level-2/445-28.front.png) | cove / 2 | 12 | 1 Xp/ Curio Room cleared. | {"dark":1,"curio":3,"treasure":2,"lair":1,"trap":1} | source-supported |
| [The Deep Ones](../../../src/assets/community-reference/complete-edition/quests/cove/level-2/445-27.front.png) | cove / 2 | 8 | 1 Xp/ Objective Rooms cleared. | {"objective":3,"empty":2,"dark":2,"trap":1} | source-supported |
| [Unclean Waters 2](../../../src/assets/community-reference/complete-edition/quests/cove/level-2/445-25.front.png) | cove / 2 | 12 | 1 Xp/ Lair cleared. | {"dark":1,"curio":1,"treasure":1,"lair":3,"trap":2} | source-supported |
| [Deep Waters 3](../../../src/assets/community-reference/complete-edition/quests/cove/level-3/445-29.front.png) | cove / 3 | 8 | 1 Xp/ 2 Rooms cleared. | {"dark":1,"curio":2,"treasure":1,"lair":3,"trap":1} | source-supported |
| [Tainted Trinkets](../../../src/assets/community-reference/complete-edition/quests/cove/level-3/445-33.front.png) | cove / 3 | - | 1 Xp/ Cleansed Trinket. | {"objective":3,"empty":1,"dark":2,"curio":1,"trap":1} | source-supported |
| [The Deep Ones 2](../../../src/assets/community-reference/complete-edition/quests/cove/level-3/445-31.front.png) | cove / 3 | 8 | 1 Xp/ Objective Rooms cleared. | {"objective":3,"empty":1,"dark":2,"trap":2} | source-supported |
| [The Shipwrecks](../../../src/assets/community-reference/complete-edition/quests/cove/level-3/445-32.front.png) | cove / 3 | 4 | 1 Xp/ Per Idol found. | {"objective":3,"empty":2,"curio":2,"treasure":1} | source-supported |
| [Unclean Waters 3](../../../src/assets/community-reference/complete-edition/quests/cove/level-3/445-30.front.png) | cove / 3 | 12 | 1 Xp/ Lair cleared. | {"dark":1,"curio":1,"treasure":1,"lair":3,"trap":2} | source-supported |
| [Deep in the Swamp](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-1/444-1.front.png) | crimson-court / 1 | 12 | 1 Xp/ Two Rooms cleared. | {"empty":1,"dark":1,"curio":2,"treasure":1,"lair":2,"trap":1} | source-supported |
| [Lost and Found](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-1/444-0.front.png) | crimson-court / 1 | 8 | 1 Xp/ Valuable returned. | {"objective":3,"empty":1,"dark":2,"curio":1,"lair":1} | source-supported |
| [Rest in Rubble](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-1/444-3.front.png) | crimson-court / 1 | 8 | 1 Xp/ Curio Room cleared. | {"empty":1,"dark":1,"curio":3,"treasure":1,"lair":2} | source-supported |
| [Rivers Run Red](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-1/444-2.front.png) | crimson-court / 1 | 12 | 1 Xp/ Vial returned. | {"objective":3,"curio":1,"treasure":2,"trap":2} | source-supported |
| [They Are Swarm](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-1/444-4.front.png) | crimson-court / 1 | 12 | 1 Xp/ Lair cleared. | {"dark":3,"treasure":1,"lair":3,"trap":1} | source-supported |
| [Deeper into the Swamp](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-2/444-7.front.png) | crimson-court / 2 | 8 | 1 Xp/ 2 Rooms cleared. | {"empty":1,"dark":1,"curio":2,"lair":3,"trap":1} | source-supported |
| [Lurkers](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-2/444-5.front.png) | crimson-court / 2 | 12 | 1 Xp/ Lair cleared. | {"dark":2,"curio":2,"treasure":1,"lair":3} | source-supported |
| [Pest Control](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-2/444-6.front.png) | crimson-court / 2 | 12 | 1 Xp/ Lair cleared. | {"dark":2,"lair":3,"trap":3} | source-supported |
| [Ruin the Party](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-2/444-8.front.png) | crimson-court / 2 | 12 | 1 Xp/ Objective Room cleared. | {"objective":3,"dark":1,"curio":1,"treasure":1,"trap":2} | source-supported |
| [Take 'Em Back](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-2/444-9.front.png) | crimson-court / 2 | 12 | 1 Xp/ Level 2 Trinket returned. | {"objective":3,"dark":1,"curio":2,"lair":1,"trap":1} | source-supported |
| [Breeders](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-3/444-13.front.png) | crimson-court / 3 | 12 | 1 Xp/ Objective Room cleared. | {"objective":3,"empty":1,"dark":2,"treasure":1,"lair":1} | source-supported |
| [Cut the Buzz](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-3/444-11.front.png) | crimson-court / 3 | 12 | 1 Xp/ Lair cleared. | {"empty":1,"curio":2,"lair":3,"trap":2} | source-supported |
| [Rest in Rubble III](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-3/444-14.front.png) | crimson-court / 3 | 12 | 1 Xp/ Curio Room cleared. | {"empty":1,"dark":2,"curio":3,"treasure":1,"trap":1} | source-blocked |
| [The Endless Marsh](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-3/444-12.front.png) | crimson-court / 3 | 8 | 1 Xp/ 2 Rooms cleared (maximum 6 Rooms). | {"empty":"?","dark":"?","curio":"?","treasure":"?","lair":"?","trap":"?"} | source-supported |
| [Uninvited](../../../src/assets/community-reference/complete-edition/quests/crimson-court/level-3/444-10.front.png) | crimson-court / 3 | 12 | 1 Xp/ Objective Room cleared. | {"objective":3,"curio":1,"treasure":1,"trap":3} | source-supported |
| [Dem Bones](../../../src/assets/community-reference/complete-edition/quests/ruins/level-1/445-3.front.png) | ruins / 1 | 8 | 1 Xp/ Bone collected. | {"objective":3,"empty":1,"curio":1,"treasure":1,"lair":1,"trap":1} | source-supported |
| [Fundraiser](../../../src/assets/community-reference/complete-edition/quests/ruins/level-1/445-2.front.png) | ruins / 1 | 8 | After the Quest is over, you can give any amount of Gold to the Heir, gaining 1 Xp/20[gold] given. | {"empty":1,"curio":2,"treasure":1,"lair":2,"trap":2} | source-supported |
| [Rising Threat](../../../src/assets/community-reference/complete-edition/quests/ruins/level-1/445-4.front.png) | ruins / 1 | 12 | 1 Xp/ Curio Room cleared. | {"empty":2,"dark":1,"curio":3,"treasure":1,"trap":1} | source-supported |
| [Scout Ahead](../../../src/assets/community-reference/complete-edition/quests/ruins/level-1/445-0.front.png) | ruins / 1 | 8 | 1 Xp/ 2 Rooms cleared. | {"empty":2,"dark":1,"curio":2,"lair":2,"trap":1} | source-supported |
| [Wipe 'Em Out](../../../src/assets/community-reference/complete-edition/quests/ruins/level-1/445-1.front.png) | ruins / 1 | 12 | 1 Xp/ Lair cleared. | {"empty":2,"dark":1,"lair":3,"trap":2} | source-supported |
| [Break Them](../../../src/assets/community-reference/complete-edition/quests/ruins/level-2/445-8.front.png) | ruins / 2 | 8 | 1 Xp/ Objective Room cleared. | {"objective":3,"empty":2,"curio":1,"trap":2} | source-supported |
| [Clear the Path](../../../src/assets/community-reference/complete-edition/quests/ruins/level-2/445-6.front.png) | ruins / 2 | 8 | 1 Xp/ 2 Rooms cleared. | {"dark":1,"curio":2,"treasure":2,"lair":2,"trap":1} | source-supported |
| [Disruption](../../../src/assets/community-reference/complete-edition/quests/ruins/level-2/445-5.front.png) | ruins / 2 | 12 | 1 Xp/ Objective Room cleared. | {"objective":3,"dark":2,"curio":2,"lair":1} | source-supported |
| [Purify the Fountains](../../../src/assets/community-reference/complete-edition/quests/ruins/level-2/445-9.front.png) | ruins / 2 | 12 | 1 Xp/ Fountain Purified. | {"objective":3,"dark":2,"curio":1,"treasure":1,"trap":1} | source-supported |
| [Reduce to Rubble](../../../src/assets/community-reference/complete-edition/quests/ruins/level-2/445-7.front.png) | ruins / 2 | 12 | 1 Xp/ Lair Room cleared. | {"dark":1,"curio":2,"lair":3,"trap":2} | source-supported |
| [Creeping Darkness](../../../src/assets/community-reference/complete-edition/quests/ruins/level-3/445-13.front.png) | ruins / 3 | 8 | 1 Xp/ 2 Rooms cleared. | {"empty":1,"dark":1,"curio":2,"treasure":1,"lair":2,"trap":1} | source-supported |
| [Forward Camps](../../../src/assets/community-reference/complete-edition/quests/ruins/level-3/445-11.front.png) | ruins / 3 | 8 | 1 Xp/ Set up camp. | {"empty":3,"dark":"?","curio":"?","treasure":"?","lair":"?","trap":"?"} | source-supported |
| [The Threat is Real](../../../src/assets/community-reference/complete-edition/quests/ruins/level-3/445-14.front.png) | ruins / 3 | 8 | 1 Xp/ Lair cleared. | {"dark":2,"treasure":1,"lair":3,"trap":2} | source-supported |
| [They Are Back](../../../src/assets/community-reference/complete-edition/quests/ruins/level-3/445-12.front.png) | ruins / 3 | 8 | 1 Xp/ Objective Room cleared. | {"objective":3,"empty":1,"dark":1,"curio":1,"trap":2} | source-supported |
| [Warm Up the Halls](../../../src/assets/community-reference/complete-edition/quests/ruins/level-3/445-10.front.png) | ruins / 3 | 4 | 1 Xp/ Dark Room Illuminated. | {"dark":3,"curio":2,"lair":2,"trap":1} | source-supported |
| [Disarm Them](../../../src/assets/community-reference/complete-edition/quests/warrens/level-1/444-19.front.png) | warrens / 1 | 12 | 1 Xp/ Objective Room Cleared. | {"objective":3,"dark":1,"treasure":1,"trap":3} | source-supported |
| [Explore the Sewers](../../../src/assets/community-reference/complete-edition/quests/warrens/level-1/444-16.front.png) | warrens / 1 | - | 1 Xp/ 2 Rooms cleared. | {"empty":2,"dark":1,"curio":2,"treasure":1,"lair":1,"trap":1} | source-supported |
| [Family Trinkets](../../../src/assets/community-reference/complete-edition/quests/warrens/level-1/444-17.front.png) | warrens / 1 | - | 1 Xp/ LvL 2 Trinket returned. | {"empty":1,"dark":1,"curio":2,"lair":3,"trap":1} | source-supported |
| [Pork Chop](../../../src/assets/community-reference/complete-edition/quests/warrens/level-1/444-15.front.png) | warrens / 1 | 8 | 1 Xp/ Lair cleared. | {"empty":1,"dark":2,"treasure":1,"lair":3,"trap":1} | source-supported |
| [Worm Squash](../../../src/assets/community-reference/complete-edition/quests/warrens/level-1/444-18.front.png) | warrens / 1 | 12 | 1 Xp/ Large Carrion Eater slain. | {"objective":3,"dark":1,"treasure":1,"trap":3} | source-supported |
| [A New Breed](../../../src/assets/community-reference/complete-edition/quests/warrens/level-2/444-24.front.png) | warrens / 2 | 8 | 1 Xp/ Lair cleared | {"empty":1,"dark":1,"curio":1,"lair":3,"trap":2} | source-supported |
| [Bait Them Out](../../../src/assets/community-reference/complete-edition/quests/warrens/level-2/444-22.front.png) | warrens / 2 | 12 | 1 Xp/ Swine Skiver killed. | {"empty":3,"curio":1,"treasure":1,"lair":1,"trap":2} | source-supported |
| [Carrion Infestation](../../../src/assets/community-reference/complete-edition/quests/warrens/level-2/444-21.front.png) | warrens / 2 | 4 | 1 Xp/ Objective Room cleared. | {"objective":3,"empty":1,"dark":2,"trap":2} | source-supported |
| [Mapping the Sewers](../../../src/assets/community-reference/complete-edition/quests/warrens/level-2/444-23.front.png) | warrens / 2 | - | 1 Xp/ 2 Rooms cleared. | {"empty":1,"dark":1,"curio":1,"treasure":2,"lair":2,"trap":1} | source-supported |
| [Ringleaders](../../../src/assets/community-reference/complete-edition/quests/warrens/level-2/444-20.front.png) | warrens / 2 | 12 | 1 Xp/ Swine Skiver Slain. | {"objective":3,"empty":1,"dark":1,"treasure":2,"trap":1} | source-supported |
| [Alpha Swine](../../../src/assets/community-reference/complete-edition/quests/warrens/level-3/444-26.front.png) | warrens / 3 | 8 | 1 Xp/ Lair cleared. | {"dark":2,"curio":1,"lair":3,"trap":2} | source-supported |
| [Deep in the Warrens](../../../src/assets/community-reference/complete-edition/quests/warrens/level-3/444-25.front.png) | warrens / 3 | - | 1 Xp/ 2 Rooms cleared. | {"curio":2,"treasure":2,"lair":2,"trap":2} | source-supported |
| [Drums of Doom](../../../src/assets/community-reference/complete-edition/quests/warrens/level-3/444-29.front.png) | warrens / 3 | 8 | 1 Xp/ Lair cleared. | {"dark":1,"curio":2,"lair":3,"trap":2} | source-supported |
| [Foul Arsenal](../../../src/assets/community-reference/complete-edition/quests/warrens/level-3/444-27.front.png) | warrens / 3 | 12 | 1 Xp/ Objective Room cleared. | {"objective":3,"empty":2,"dark":1,"treasure":1,"trap":1} | source-supported |
| [Infighting](../../../src/assets/community-reference/complete-edition/quests/warrens/level-3/444-28.front.png) | warrens / 3 | 8 | 1 Xp/ Lair cleared. | {"empty":2,"treasure":1,"lair":3,"trap":2} | source-supported |
| [Circle of Witches](../../../src/assets/community-reference/complete-edition/quests/weald/level-1/444-31.front.png) | weald / 1 | 12 | 1 Xp/ Crone killed. | {"objective":3,"empty":1,"dark":1,"curio":1,"treasure":1,"trap":1} | source-supported |
| [Disinfection](../../../src/assets/community-reference/complete-edition/quests/weald/level-1/444-32.front.png) | weald / 1 | 8 | 1 Xp/ Oak disinfected. | {"objective":3,"empty":1,"dark":2,"curio":1,"lair":1} | source-supported |
| [Fungal Research](../../../src/assets/community-reference/complete-edition/quests/weald/level-1/444-30.front.png) | weald / 1 | 8 | 1 Xp/ Necrotic Fungus brought back. | {"objective":3,"empty":1,"dark":1,"curio":1,"trap":2} | source-supported |
| [Patrol the Woods](../../../src/assets/community-reference/complete-edition/quests/weald/level-1/444-34.front.png) | weald / 1 | 8 | 1 Xp/ 2 Rooms cleared. | {"empty":1,"curio":2,"treasure":1,"lair":2,"trap":2} | source-supported |
| [Purge the Woods](../../../src/assets/community-reference/complete-edition/quests/weald/level-1/444-33.front.png) | weald / 1 | 4 | 1 Xp/ Lair cleared. | {"dark":3,"lair":3,"trap":2} | source-supported |
| [Hounds of the Woods](../../../src/assets/community-reference/complete-edition/quests/weald/level-2/444-38.front.png) | weald / 2 | 8 | 1 Xp/ Objective Room cleared. | {"objective":3,"empty":1,"dark":2,"curio":1,"lair":1} | source-supported |
| [Lost Supplies](../../../src/assets/community-reference/complete-edition/quests/weald/level-2/444-39.front.png) | weald / 2 | 12 | 1 Xp/ 2 [provision-die] returned. | {"empty":1,"dark":1,"treasure":2,"lair":2,"trap":2} | source-supported |
| [Lost Treasures](../../../src/assets/community-reference/complete-edition/quests/weald/level-2/444-36.front.png) | weald / 2 | 12 | 1 Xp/ Treasure Room cleared. | {"dark":2,"treasure":3,"lair":1,"trap":2} | source-supported |
| [Searching in the Dark](../../../src/assets/community-reference/complete-edition/quests/weald/level-2/444-37.front.png) | weald / 2 | 12 | 1 Xp/ Lair cleared. | {"empty":"?","dark":"?","curio":"?","treasure":"?","lair":3,"trap":"?"} | source-supported |
| [Spreaders of Miasma](../../../src/assets/community-reference/complete-edition/quests/weald/level-2/444-35.front.png) | weald / 2 | 12 | 1 Xp/ Hateful Virago killed. | {"objective":3,"empty":1,"dark":1,"curio":1,"lair":1,"trap":1} | source-supported |
| [Final Swipe](../../../src/assets/community-reference/complete-edition/quests/weald/level-3/444-42.front.png) | weald / 3 | 12 | 1 Xp/ 2 Rooms cleared. | {"dark":1,"curio":2,"treasure":2,"lair":2,"trap":1} | source-supported |
| [Great Unclean Ones](../../../src/assets/community-reference/complete-edition/quests/weald/level-3/444-41.front.png) | weald / 3 | 12 | 1 Xp/ Objective Room cleared. | {"objective":3,"empty":2,"curio":1,"treasure":1,"lair":1} | source-supported |
| [No Other Way](../../../src/assets/community-reference/complete-edition/quests/weald/level-3/444-40.front.png) | weald / 3 | 8 | 1 Xp/ Infected Oak burnt max. 3. | {"objective":3,"dark":2,"lair":2,"trap":1} | source-supported |
| [The Infected](../../../src/assets/community-reference/complete-edition/quests/weald/level-3/444-43.front.png) | weald / 3 | 8 | 1 Xp/ Lair cleared. | {"dark":2,"curio":1,"lair":3,"trap":2} | source-supported |
| [Whispering Woods](../../../src/assets/community-reference/complete-edition/quests/weald/level-3/444-44.front.png) | weald / 3 | 8 | 1 Xp/ Lair cleared. | {"empty":1,"dark":1,"curio":1,"treasure":1,"lair":3,"trap":1} | source-supported |

### Quest special rules, objective qualifications and exchanges

- **Face the Threat!** (boss, Boss): Set up this Dungeon according to the Boss Quest rules. You can't return to the Hamlet before you defeat the Boss!
- **Deep Horrors** (cove, 1): Objective Rooms always spawn 1 Uca Major first and then the rest of the Monsters from the Monster Deck as normal.
- **Deep Waters** (cove, 1): Always initiate battle in Curio Rooms.
- **Purify the Eldritch Signs** (cove, 1): Set aside Room Cards [cove]1 and [cove]9. When entering an Objective Room, draw one of those cards at random and at the end of the encounter set it aside again. At the start of the Quest you can turn any Provision to [potion]. Once per battle, when a Hero is in an Area [red-area] of an Objective Room they can discard a Potion to purify the Eldritch Sign.
- **Test the Waters** (cove, 1): Set aside Room Cards [cove]2, [cove]5, and [cove]8, when entering an Objective Room, draw one of those cards at random. When a Hero is in an Area [A] of an Objective Room, they can spend 2 actions to gather a sample. Keep track of the samples by placing Wounds on the Quest Card. The Quest Card can not have more than 6 [wound].
- **Unclean Waters** (cove, 1): When a Hero kills a Cove Monster they suffer 2[blight] 3t.
- **Deep Horrors 2** (cove, 2): Objective Rooms always spawn 1 Uca Major and 1 Squiffy Ghast first and then 1 more Monster from the Monster Deck.
- **Deep Waters 2** (cove, 2): Always initiate battle in Curio Rooms.
- **Eldritch Purging** (cove, 2): Always initiate battle in Curio Rooms. After clearing a Curio Room, suffer only the negative effects of a Curio Card.
- **The Deep Ones** (cove, 2): Objective Rooms are Rooms [cove]2, [cove]5, [cove]6 & [cove]8. Set these Rooms aside at the Dungeon start, and pick one of them at random each time you enter an Objective Room. Spawn only Cove Monsters in Objective Rooms.
- **Unclean Waters 2** (cove, 2): When a Hero kills a Cove Monster they suffer 3[blight] 3t.
- **Deep Waters 3** (cove, 3): Always initiate battle in Curio Rooms. After clearing a Curio Room suffer only the negative effects of a Curio Card.
- **Tainted Trinkets** (cove, 3): Objective Rooms are: [cove]1, [cove]5, [cove]9. Each Hero gets 1 level 3 Trinket at random, those Trinkets are considered tainted. If a Hero can't get a Trinket, they choose one of theirs to become tainted. When in an Objective Room, a Hero can spend one action in Area [red-area] (this can be done only once per Room) to cleanse the Trinket and score one objective. Upon returning to Hamlet, each Hero with a tainted Trinket can suffer 2 negative Quirks and cleanse it, or remove it and shuffle it back into its respective deck.
- **The Deep Ones 2** (cove, 3): Objective Rooms are Rooms [cove]2, [cove]5, [cove]6 & [cove]8. Set these Rooms aside at the Dungeon start, and pick one of them at random each time you enter an Objective Room. Spawn 1 Squiffy Ghast and only Cove Monsters in Objective Rooms.
- **The Shipwrecks** (cove, 3): Room [cove]7 is the Objective Room. When searching in [green-area] Areas, rolling 4-8 will give you an idol in place of the provision of your choice. Only one idol can be found per shipwreck.
- **Unclean Waters 3** (cove, 3): When a Hero kills a Cove Monster they suffer 3[blight] 4t.
- **Deep in the Swamp** (crimson-court, 1): No printed Special Rules panel. Use the printed XP qualification above.
- **Lost and Found** (crimson-court, 1): The first Loot Chest in each Objective Room contains a Valuable instead of the normal boon. Spawn only Rooms with loot as Objective Rooms.
- **Rest in Rubble** (crimson-court, 1): Clearing Curio Rooms causes Heroes to desecrate a tomb. Curios from these Rooms only ever have negative effects which cannot be countered by a Torch.
- **Rivers Run Red** (crimson-court, 1): Objective Rooms are Rooms [court]2, [court]3 & [court]4. When you enter choose one at random and discard it when cleared. When in Area A [red-area] of these Rooms, a Hero must spend 2 actions to fill up a vial with blood. Rooms are cleared only if a vial is filled up.
- **They Are Swarm** (crimson-court, 1): Spawn only [court] Monsters in Lairs.
- **Deeper into the Swamp** (crimson-court, 2): No printed Special Rules panel. Use the printed XP qualification above.
- **Lurkers** (crimson-court, 2): In Lairs, Spawn 1 Crocodilian (Level III)
- **Pest Control** (crimson-court, 2): No printed Special Rules panel. Use the printed XP qualification above.
- **Ruin the Party** (crimson-court, 2): Objective Rooms are Rooms [court]5, [court]6 & [court]7. When you enter choose one at random and discard it when cleared. Spawn only [court] Monsters in Objective Rooms.
- **Take 'Em Back** (crimson-court, 2): Courtyard Monsters in Objective Rooms have +7 Life. For the objective pieces, only draw from chests, as the first chest looted always grants a Level 2 Trinket card. Upon returning to the Hamlet, you can give any LvL 2 Trinkets to the Heir of your choice to gain the Xp (Maximum 3, and you lose those Trinkets). One Objective Room must be cleared as a minimum to do so.
- **Breeders** (crimson-court, 3): Objective Rooms are Rooms [court]4, [court]5 & [court]9. When entering, choose one at random and discard it when cleared. Always spawn 1 Crocodilian and 1 Adder there.
- **Cut the Buzz** (crimson-court, 3): Courtyard Monsters deal an additional [on-hit] 3[bleed] 3t and Self [heal]4 when they hit you.
- **Rest in Rubble III** (crimson-court, 3): Curio Rooms always have Battle. Clearing Curio Rooms causes Heroes to a tomb. Curios there have only negative effects that cannot be countered with a Torch.
- **The Endless Marsh** (crimson-court, 3): Setup the Dungeon with random Rooms. Each time the party moves away from a cleared Room, replace the Room with a random Room Token (face-down). This Room is considered as though you haven't passed through it.
- **Uninvited** (crimson-court, 3): Objective Rooms are [court]6, [court]7, [court]8. Always spawn 2 Courtesans and 2 Chevaliers there.
- **Dem Bones** (ruins, 1): Objective Rooms are [ruins]7. A Hero must spend 2 actions in the [green-area] Area to recover the bones. Set aside the room [ruins]7 at the start of the quest; you will not use it in other meetings. Objective Rooms are cleared only if the bones have been collected.
- **Fundraiser** (ruins, 1): One Lair Room must be cleared as the minimum Quest goal. Clearing Lairs awards 10[gold].
- **Rising Threat** (ruins, 1): Curio Rooms always have Battles. When spawning Monsters in Curio Rooms, draw 1 Level 2 Monster.
- **Scout Ahead** (ruins, 1): No printed Special Rules panel. Use the printed XP qualification above.
- **Wipe 'Em Out** (ruins, 1): No printed Special Rules panel. Use the printed XP qualification above.
- **Break Them** (ruins, 2): In Objective Rooms, spawn 1 Bone Bearer (Level III)
- **Clear the Path** (ruins, 2): No printed Special Rules panel. Use the printed XP qualification above.
- **Disruption** (ruins, 2): Objective Rooms are Rooms [ruins]4 & [ruins]8. Pick one at random each time you enter. Set them aside when you start the Quest; you won't use them during other encounters.
- **Purify the Fountains** (ruins, 2): Objective Rooms are [ruins]3. Add 3 [potion] to your starting Provisions if possible. When in an Objective Room, the Healing Fountain does not function unless a Hero spends 2 actions and 1 [potion] when there to purify it. Objective Rooms are cleared only if the Healing Fountain has been purified. Set aside the room [ruins]3 at the start of the quest; you will not use it in other meetings.
- **Reduce to Rubble** (ruins, 2): No printed Special Rules panel. Use the printed XP qualification above.
- **Creeping Darkness** (ruins, 3): Whenever an Unholy Monster is spawned, Heroes suffer [stress]+1 each.
- **Forward Camps** (ruins, 3): Use a [torch] or a [tool] in Empty Rooms to set up forwards camps. To set up this Dungeon, use 3 Empty Rooms and randomize non-Objective rooms for the rest.
- **The Threat is Real** (ruins, 3): Do not spawn any Level 1 Monsters in Lairs
- **They Are Back** (ruins, 3): In Objective Room spawn a Bone Captain who has +20 Life and +2 Dodge
- **Warm Up the Halls** (ruins, 3): After rolling for Provisions, each Hero may turn one of them into a [torch]. Use a [torch] in Dark Rooms to light them up (in addition to its standard effect) and clear them.
- **Disarm Them** (warrens, 1): Objective Room is always Room [warrens]6. Spawn only [warrens] Monsters there.
- **Explore the Sewers** (warrens, 1): No printed Special Rules panel. Use the printed XP qualification above.
- **Family Trinkets** (warrens, 1): Spawn only Rooms with Loot Chests in Lairs. The first chest you Loot in each Lair contains a Level 2 Trinket. Returning to the Hamlet, you may return any trinkets of level 2 acquired in the dungeon (up to a maximum of 3 trinkets).
- **Pork Chop** (warrens, 1): No printed Special Rules panel. Use the printed XP qualification above.
- **Worm Squash** (warrens, 1): Objective Room is always Room [warrens]8. Spawn a Large Carrion Eater (LvL 2) when starting a battle there.
- **A New Breed** (warrens, 2): Warrens Monsters are immune to Conditions.
- **Bait Them Out** (warrens, 2): Before entering the Dungeon, gain 3 additional [food]. When in an empty Room, you may spend a [food] to bait a Swine Skiver (LvL 3). Start battle immediately in a random Room with a Swine Skiver, then roll a [d10]: 1-4 spawn 2 additional monsters of normal or small size, 5-8 spawn 3 additional monsters of normal or small size, 9-10 nothing.
- **Carrion Infestation** (warrens, 2): In Objective Rooms, spawn one Large Carrion Eater and two Carrion Eaters. When a Large Carrion Eater dies, replace it immediately with a Carrion Eater. When a Carrion Eater dies, replace it immediately with a Maggot. The fight ceases and the room is secured as soon as there are only Maggots left in play.
- **Mapping the Sewers** (warrens, 2): No printed Special Rules panel. Use the printed XP qualification above.
- **Ringleaders** (warrens, 2): Objective Room is always Room [warrens]9. Spawn a Swine Skiver (LvL 3) and a Large Carrion Eater there, plus a random monster of normal or small size to fill the Stances. The Battle ends immediately once the Swine Skiver is killed.
- **Alpha Swine** (warrens, 3): In Lairs, always spawn a Swinetaur. [warrens] Monsters in Lairs have +1 Crit
- **Deep in the Warrens** (warrens, 3): After you leave a Room, choose and discard a Provision.
- **Drums of Doom** (warrens, 3): Always spawn a Swine Drummer in Lairs. The first Monster you spawn after this gains [guard]4t. When it dies, the remaining [guard] goes to the next Monster in Stance priority order. When a Swine Drummer is activated in Lairs, all Monsters gain [buff]2t, [buff]2t.
- **Foul Arsenal** (warrens, 3): Objective Room is always Room [warrens]6. When a Hero is dropped to Death's Door when fighting there, they suffer [disease].
- **Infighting** (warrens, 3): Always spawn a Swine Skiver in Lairs. You cannot Scout in this Quest. Instead, before advancing to a Room, you can reveal one adjacent. If you move towards a revealed Lair, move there without exploring. For the first round in each Lair, place all Hero Initiative Cards on top of the deck.
- **Circle of Witches** (weald, 1): Objective Room is always room [weald]9. Spawn a Crone (LvL 2) when Battle starts there.
- **Disinfection** (weald, 1): Objective Room is always room [weald]5. Start this Quest with 3 additional [potion] Provisions. A Hero must spend one action and a [potion] when in Area [red-area] of the Objective Room to disinfect the oak.
- **Fungal Research** (weald, 1): Objective Rooms are rooms [weald]3, [weald]6 & [weald]8. Upon entering, randomly choose one and discard it once secured. Win Battles there with at least one unsmashed Necrotic Fungus to gain the objective.
- **Patrol the Woods** (weald, 1): When Battle starts, roll a [d10]. If you rolled over your [light] Level, place all Monster Initiative Cards on top of the deck for the first round of Battle.
- **Purge the Woods** (weald, 1): Spawn only [weald] Monsters in Lairs.
- **Hounds of the Woods** (weald, 2): Objective Rooms are Rooms [weald]1, [weald]3 & [weald]6. Upon entering, randomly choose one and discard it once secured. Spawn 3 Rabid Gnashers there.
- **Lost Supplies** (weald, 2): Do not roll for Provisions for this Quest other than those gained by the Survivalist or other Skills. Use only Rooms with Loot Chests for this Quest. When looting a Chest, roll for two random Provisions instead of their normal Loot. When returning to the Hamlet and gaining Xp for the Provisions you brought back, you'll also gain the 1[gold] per Provision as normal.
- **Lost Treasures** (weald, 2): In Treasure Rooms, spawn only Level 2 Monsters.
- **Searching in the Dark** (weald, 2): Fill the rest of the Room slots with random Rooms. Spawn only [weald] Monsters in Lairs.
- **Spreaders of Miasma** (weald, 2): In Objective Rooms spawn a Hateful Virago (LvL 3).
- **Final Swipe** (weald, 3): When you spawn a [weald] Monster in Battle, all Heroes suffer 1[blight] 2t.
- **Great Unclean Ones** (weald, 3): In Objective Rooms, spawn an Unclean Giant. These elder giants have 2 actions per round, so shuffle an additional Initiative Card in the Initiative Deck for them.
- **No Other Way** (weald, 3): Objective Room is always room [weald]5. A Hero must spend an action and a [torch] when in Area [red-area] to set the oak ablaze. Heroes must wait until the end of the next round for the oak to burn. This means it cannot be done during round 4. At the end of the round that the Heroes set the oak on fire, fill all empty Stance slots with new Monsters. If the oak burns, the objective is cleared even if there are still Monsters at the end of round 4.
- **The Infected** (weald, 3): When a Monster in a Lair is killed, all Heroes suffer 2[blight] 2t, 2[blight] 2t.
- **Whispering Woods** (weald, 3): At the start of each Battle round, Heroes suffer [stress] +1.

## STOP

Production remains unchanged: ordinary Quest selection continues to use its original three definitions; Trinket draw/Nomad Wagon continues its prior behavior. No QuestSelectPage, NomadWagonPanel, drawTrinket, routing, store command, save schema, gameplay flow, DD Quest, Final Encounter, R2B or R3 changes. C1B integration is not authorized by this report. Stop after delivery and wait for independent audit.
