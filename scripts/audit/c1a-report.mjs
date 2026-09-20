const base='docs/data/complete-edition';
const escape=s=>String(s??'—').replaceAll('|','\\|').replaceAll('\n',' ');
export function buildReport(output){
 const evidence=kind=>output[`${base}/${kind}/community-${kind==='trinkets'?'trinket':'quest'}-source-evidence.json`].records;
 const definitions=kind=>output[`${base}/${kind}/community-${kind==='trinkets'?'trinket':'quest'}-normalized.json`].definitions;
 const t=evidence('trinkets'),q=evidence('quests'),tn=definitions('trinkets'),qn=definitions('quests');
 const lines=[
 '# C1A — Complete Edition Trinket & Quest Source Intake',
 '',
 'Status: source intake delivered with two explicit source-semantic blockers; ready for independent audit, not Production integration.',
 '',
 'Branch: `phase-11a4-c1a-trinket-quest-source-intake`. Frozen C0 base: `d571a323bf7d865f9c4def440e7e5621fdebe595`.',
 '',
 'S1: `3657612854.json`, SHA-256 `d2fe21a6aa294f80fb47e56677c3a74090c3dc131361d798dfde709f6a3a64a2`. S2/S3 provenance remains in the frozen C0 inventory; neither supplies replacement card values. S4 is the unchanged `docs/DD_EN_COREBOX_RULES.pdf` (SHA-256 `9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae`).',
 '',
 '## Coverage',
 '',
 '“Transcribed” means all readable names, rule panels, and printed symbols; Quest flavor text is also retained. “Normalized records” includes explicit unresolved leaves; “Normalized complete” and Registry count only independently source-supported definitions. Runtime unsupported is a whole-definition classification, excludes source-blocked definitions, and includes missing exact timing/adapters as well as missing effects. It does not mean the existing engine has no useful primitives.',
 '',
 '| Metric | Core | Color of Madness | Total |',
 '| --- | ---: | ---: | ---: |'
 ];
 const tk=(label,predicate)=>lines.push(`| ${label} | ${tn.filter(n=>n.contentSet==='core'&&predicate(n)).length} | ${tn.filter(n=>n.contentSet==='color-of-madness'&&predicate(n)).length} | ${tn.filter(predicate).length} |`);
 for(const label of ['Physical','Logical','Both assets bound','Transcribed (both effect panels)','Normalized records'])tk(label,()=>true);
 tk('Normalized complete',n=>n.sourceStatus==='source-supported');tk('Registry',n=>n.sourceStatus==='source-supported');tk('Source-blocked',n=>n.sourceStatus==='source-blocked');tk('Runtime unsupported',n=>n.runtimeSupport.classification==='RUNTIME_PRIMITIVE_UNSUPPORTED');
 lines.push('','| Metric | Standard | Boss |','| --- | ---: | ---: |');
 const qk=(label,predicate)=>lines.push(`| ${label} | ${qn.filter(n=>n.questType==='standard'&&predicate(n)).length} | ${qn.filter(n=>n.questType==='boss'&&predicate(n)).length} |`);
 for(const label of ['Physical','Logical','Both assets bound','Transcribed','Normalized records'])qk(label,()=>true);
 qk('Normalized complete',n=>n.sourceStatus==='source-supported');qk('Registry',n=>n.sourceStatus==='source-supported');qk('Source-blocked',n=>n.sourceStatus==='source-blocked');qk('Runtime unsupported',n=>n.runtimeSupport.classification==='RUNTIME_PRIMITIVE_UNSUPPORTED');
 lines.push('','250 local PNGs are bound to 125 original physical identities. All have actual front and indexed UniqueBack images; no generic image is substituted. Core Trinket levels are 14 / 12 / 12. COM cards have no printed level and retain `null`; they are not silently assigned Core levels.','','| Standard Quest source root | contentSet / region | Level I | Level II | Level III | Total | Registry |','| --- | --- | ---: | ---: | ---: | ---: | ---: |');
 for(const set of ['core','crimson-court','warrens','cove','weald']){
  const es=q.filter(e=>e.contentSet===set&&e.region!=='boss');
  lines.push(`| ${es[0].sourceExpansion} | ${set} / ${es[0].region} | ${es.filter(e=>e.level===1).length} | ${es.filter(e=>e.level===2).length} | ${es.filter(e=>e.level===3).length} | ${es.length} | ${es.filter(e=>e.sourceSupportStatus==='source-supported').length} |`);
 }
 lines.push('',
 'Core ordinary quests are under the TTS `Darkest Dungeon > Quests > Lvl n` hierarchy; “ruins” identifies this base-region group, cross-checked by its arch emblem and text. They are not the three separately handled DD quests. Expansion selection defaults are intentionally undefined.',
 '', '## Source architecture and review limits', '',
 '1. [Asset manifest](../../data/complete-edition/c1a-asset-manifest.json): frozen C0 physical identity → inherited TTS CustomDeck → row-major atlas cell → actual crop → SHA-256. Source atlas hashes and exact pixel boxes are retained.',
 '2. [Literal review](../../data/complete-edition/c1a-literal-review.json) and `literal-observations*.json`: manually read card wording, before semantic mapping; no OCR is source truth. Pictograms use bracket tokens, whitespace and typography are normalized, spelling and printed grammatical errors are retained.',
 '3. [Trinket literal evidence](../../data/complete-edition/trinkets/community-trinket-source-evidence.json) / [Quest literal evidence](../../data/complete-edition/quests/community-quest-source-evidence.json): field references specify actual image, hash, region and rotation. Positive/negative Trinket effects occupy the front upper/lower halves, not TTS FaceURL/BackURL respectively. Back images are artwork with printed deck/level labels.',
 '4. [Trinket normalized definitions](../../data/complete-edition/trinkets/community-trinket-normalized.json) / [Quest normalized definitions](../../data/complete-edition/quests/community-quest-normalized.json): source-domain semantic IR, not executable Runtime effects. Every semantic leaf has a literal-field reference; rules and engine classification are kept distinct. Actual printed null/absence and unresolved meanings are distinct.',
 '5. [Trinket Registry](../../../src/data/community-reference/trinkets/index.ts) / [Quest Registries](../../../src/data/community-reference/quests/index.ts): immutable, source-supported data only. Pure getters allow level/content-set filtering. These modules have no Production consumers.',
 '',
 '[Review lock](../../data/complete-edition/c1a-source-review-lock.json) pins authored observations, independent support review, semantic interpretations, rulebook evidence and asset manifest. Generation never rewrites this lock. These integrity tests detect drift and prove reproducible transformation; they cannot prove that the same agent read or interpreted an image correctly. Independent C1B audit must inspect original images, especially icon placement, wording ambiguities and timing. No Runtime implementation or gameplay test is used as source proof.',
 '', '## Explicit blockers', '',
 '- **Bloodcourse Medallion (Core II, 453-22):** positive “When healed, receive [heal]4” has no explicit plus sign. Amount 4 is transcribed; additional-versus-replacement operation stays `null`. Negative Bleed 1 for 3t is fully retained. Excluded from Registry.',
 '- **Rest in Rubble III (Crimson Court III, 444-14):** printed “Clearing Curio Rooms causes Heroes to a tomb.” lacks a verb. The missing action stays `null`; mandatory Curio battles, negative-only effects, and no Torch counter are retained. Excluded from Registry. The Level I card is not a fallback.',
 '', '## Runtime primitive assessment', '',
 'Reviewed C0 files: `src/types/trinkets.ts`, `trinket-opportunities.ts`, `use-trinket.ts`, `battle-trinket-bridge.ts`, `src/types/index.ts` RuleEventType, `src/data/quests.ts`, and `progression/quest-objectives.ts`.',
 '',
 '- TrinketUseWindow declares many timings but WIRED_WINDOWS has only `before-attack-roll`, `hero-turn-start`, `room-entered`. P26 explicitly permits Critical Stone after the roll; a before-roll-only implementation is not complete source semantics.',
 '- Accuracy, Crit, damage, healing and Dodge have modifier candidates; self-heal, stress, light and provision consumption have existing effect candidates. `canUse` only provides battle/acting-hero/light predicates, not stance conditions. Independent condition magnitude/duration, arbitrary targeting, next-skill storage, action gain, disease/quirk changes, exploration dice and crystal resources need additional primitives or adapters.',
 '- All 48 source-supported whole Trinket definitions have at least one missing exact capability. Heretical Passage’s explicitly before-roll positive panel is classified `NEEDS_COMPOSITE_EXISTING_PRIMITIVES`; its crystal-discard negative panel prevents certifying the whole card. Each side lists actual existing candidates and concrete gaps.',
 '- Ordinary QuestDefinition lacks the full printed room-token setup, resting supply setup, repeatable XP qualifications and special policies. Room-clear counters are existing candidates, but a matching counter alone does not certify a complete quest. All 75 admitted ordinary Quest definitions remain `RUNTIME_PRIMITIVE_UNSUPPORTED` as complete definitions.',
 '', '## Boss and Threat findings', '',
 '`445-18` / GUID `bb495d` at `/ObjectStates/79` is visually **Face the Threat!**. It prints 12 Resting Points, 3 XP, eight room tokens (Objective 1, Empty 1, Dark 2, Curio 1, Treasure 1, Lair 1, Trap 1), boss setup and no return before boss defeat. It has its own Community ID. Matching the prototype’s name does not import prototype values.',
 '',
 'S4 p30 and p35 bind its generic boss association to the current Imminent Threat after two ordinary quests in Acts I–III. P30 defines edge-room placement, current boss room, no retreat, no normal round limit, immediate victory/removal of other monsters on boss death, and campaign loss on failure. No specific boss identity is invented.',
 '',
 'S4 p11/p30 explicitly illustrates/describes Threat rules on Boss card sides. C0’s zero **separately identified** Threat Cards is not absence of Threat mechanics. The precise TTS threat-face pool remains `source-blocked` in [rulebook evidence](../../data/complete-edition/c1a-rulebook-evidence.json); C1A does not reclassify the C0 boss inventory.',
 '', '## Duplicate / identity review', '',
 '125 physical cards → 125 logical definitions. Zero exact front-image duplicates and zero identical printed names. Eight shared-back hash groups are documented; same back is not merge evidence. Same level-independent XP rate does not merge different titles, room composition or special rules. No merge or split was performed. COM reprints are not presumed from artwork or GUIDs. See [logical identity review](../../data/complete-edition/c1a-logical-identities.json).',
 '', 'Semantic IDs use printed name + content scope (and Quest level), not GUID/CardID/array index. Physical IDs remain exactly the C0 `tts-path:...` identities. No source field falls back to a prototype.',
 '', '## Reproduction and gates', '',
 '```powershell',
 '$env:COMPLETE_EDITION_TTS = "<path to 3657612854.json>"',
 'npm run import:complete-edition-c1a -- --tts $env:COMPLETE_EDITION_TTS --tts-images "<TTS Mods/Images directory>"',
 'npm run generate:complete-edition-c1a',
 'npm run verify:complete-edition-c1a',
 'npm run typecheck',
 '```', '',
 'Raw atlases are cached under `.artifacts/c1a/atlases/<SHA256-of-exact-source-URL>.bin`; the verifier accepts `--atlas-cache`. Import may download exact C0 URLs using curl; local TTS cache is matched by exact URL-derived filename. Reproducing the image proof needs those frozen original bytes. No current remote content is fetched by the browser/game. Missing source data fails verification rather than inventing a replacement.',
 '',
 'The verification command checks unchanged S1 SHA and frozen C0 inventory; raw inherited deck metadata; all physical identities; every asset hash and crop box; re-extraction of all 250 PNGs from original atlas bytes; leaf binding; source/normalized/Registry equality; no unexplained merges/splits; no prototype IDs; actual TypeScript exports/getters; byte-identical generated outputs; and unchanged baseline Production/DD files.',
 '',
 '| Tamper | Required outcome |', '| --- | --- |',
 '| T1 delete Trinket evidence | FAIL |','| T2 alter cardIndex | FAIL |','| T3 exchange Trinket front assets | FAIL |','| T4 alter Quest title | FAIL |','| T5 inject prototype Quest | FAIL |','| T6 give blocked semantic leaf a value | FAIL |','| T7 conflate Core / COM | FAIL |','| T8 logical merge without evidence | FAIL |',
 '',
 'Execution evidence: `npm run verify:complete-edition-c1a` passed all eight rejection cases and 250 independent re-crops; `npm run typecheck` and actual Registry/getter verification passed. See [verification log](c1a-verification.log). No gameplay E2E was run, because C1A does not change gameplay.',
 '', '## Trinket audit index', '',
 'Bracket tokens are printed pictograms, not Runtime values. Every row links its actual front (both effect panels). Physical backs and per-leaf evidence are in the manifest/literal JSON.',
 '', '| Card | Set / level | Positive printed text | Negative printed text | Status |','| --- | --- | --- | --- | --- |'
 );
 for(const e of t)lines.push(`| [${e.printedName}](../../../${e.frontAssetPath}) | ${e.contentSet} / ${e.level??'not printed'} | ${escape(e.positiveSide.printedText)} | ${escape(e.negativeSide.printedText)} | ${e.sourceSupportStatus} |`);
 lines.push('','## All ordinary Quest definitions','','Bottom composition is transcribed room tokens; `?` means printed random remainder, not an estimated count. Printed special rules below are normative and retained in addition to structured parameters.','','| Card | Region / level | Rest points | XP / reward panel | Room tokens | Source status |','| --- | --- | ---: | --- | --- | --- |');
 for(const e of q)lines.push(`| [${e.printedTitle}](../../../${e.frontAssetPath}) | ${e.region} / ${e.level??'not printed'} | ${e.printedRestingPoints} | ${escape(e.printedReward)} | ${escape(JSON.stringify(e.printedRoomRequirement))} | ${e.sourceSupportStatus} |`);
 lines.push('','### Quest special rules, objective qualifications and exchanges','');
 for(const e of q){
  lines.push(`- **${e.printedTitle}** (${e.region}, ${e.level??'Boss'}): ${e.printedSpecialRules.length?e.printedSpecialRules.join(' '):'No printed Special Rules panel. Use the printed XP qualification above.'}`);
 }
 lines.push('','## STOP','',
 'Production remains unchanged: ordinary Quest selection continues to use its original three definitions; Trinket draw/Nomad Wagon continues its prior behavior. No QuestSelectPage, NomadWagonPanel, drawTrinket, routing, store command, save schema, gameplay flow, DD Quest, Final Encounter, R2B or R3 changes. C1B integration is not authorized by this report. Stop after delivery and wait for independent audit.','');
 return lines.join('\n');
}
