# C1C27 Necromancer Source Closure

Baseline: 8db6c64334a7c5ca95e75ef4de201329251cc634, branch codex/phase-11a4-c1c26-necromancer-source-closure. Acceptance verdict: C1C27-NECROMANCER-SOURCE-CLOSURE-ACCEPTED. This accepts source acquisition/classification and its verifier; build and browser acceptance remain separately unverified.

Physical 9; literal 9/9; card-local semantic 3/9; family semantic 0/9; source gated 9/9; runtime eligible 0/9; Production Ready 0/9. All 75 inherited leaf usages retain exact identity and category. Closed 0; terminal 0; blocked on unretrieved authority 75. No gameplay implementation or semantic promotion.

| Category | C1C26 usages | C1C27 remaining | Closed | Terminal | Blocked on inaccessible authority | C1C27 status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| BONE_IDENTITY_UNRESOLVED | 3 | 3 | 0 | 0 | 3 | BLOCKED_ON_UNRETRIEVED_AUTHORITY |
| CLEANUP_DESTINATION_UNRESOLVED | 2 | 2 | 0 | 0 | 2 | BLOCKED_ON_UNRETRIEVED_AUTHORITY |
| EFFECT_ORDER_UNRESOLVED | 1 | 1 | 0 | 0 | 1 | BLOCKED_ON_UNRETRIEVED_AUTHORITY |
| LOWEST_ROLL_HERO_TIE_UNRESOLVED | 13 | 13 | 0 | 0 | 13 | BLOCKED_ON_UNRETRIEVED_AUTHORITY |
| ROOM_CAPACITY_INTERACTION_UNRESOLVED | 3 | 3 | 0 | 0 | 3 | BLOCKED_ON_UNRETRIEVED_AUTHORITY |
| SOURCE_PRECEDENCE_UNRESOLVED | 15 | 15 | 0 | 0 | 15 | BLOCKED_ON_UNRETRIEVED_AUTHORITY |
| SUMMON_COPY_POLICY_UNRESOLVED | 28 | 28 | 0 | 0 | 28 | BLOCKED_ON_UNRETRIEVED_AUTHORITY |
| SUMMON_COUNT_UNRESOLVED | 6 | 6 | 0 | 0 | 6 | BLOCKED_ON_UNRETRIEVED_AUTHORITY |
| TARGET_TIE_UNRESOLVED | 4 | 4 | 0 | 0 | 4 | BLOCKED_ON_UNRETRIEVED_AUTHORITY |

## Twelve required answers

| Question | Answer | Consequence |
| --- | --- | --- |
| 1. Designer FAQ acquired and authenticated? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | BGG title/uploader listing known; original PDF filename, version, date/hash unknown |
| 2. Other later official clarification obtained? | NO | Later production ZIP/TTS/Drive leads discovered, no authenticated corrective rule content |
| 3. Lowest-roll Hero tie resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Structured participants retained; authority and all tie-break fields remain null |
| 4. Crowded Area tie resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Character Stance priority cannot resolve Area occupancy ties |
| 5. Each Level summon count resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Levels I/II/III and all nine Skills retained; count and basis remain null |
| 6. Finite supply / reuse resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Miniatures/cards/spawn/logical/campaign/Battle dimensions remain distinct |
| 7. Bone Rabble / Rubble resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Both literals retained, no alias; Captain narrow/full association independently blocked |
| 8. Reanimation ordering resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Eight key ordering fields independently blocked; generic casualty facts retained |
| 9. Room capacity fallback resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Full Area displacement bound; nearest tie and entire Room full independently blocked |
| 10. Boss trio cleanup destination resolved? | BLOCKED_ON_UNRETRIEVED_AUTHORITY | Identity, Threat/Ability, Battle destination and reset separate; inherited Room sequence retained |
| 11. Any blocker formally terminal? | NO | Exhaustion gate fails while original FAQ/later corpus remain unexamined |
| 12. C1C28 runtime allowed? | NO | NECROMANCER_SOURCE_CLOSURE_CONTINUATION; no complete independent gameplay slice proved |

## Acquisition and authentication

The [designer listing](https://boardgamegeek.com/boardgame/317321/darkest-dungeon-the-board-game/files) identifies the FAQ and uploader apoxwrhthrio1980. Public direct/index requests and an ordinary retry were attempted; no original designer PDF was authenticated. The [Scribd preview](https://www.scribd.com/document/686825056/DD-FAQ-EN) is readable through the web tool, uploaded by LilG. It is an unauthenticated transport lead, not proof of byte identity with designer filepage 250715. Preview mechanics and suggested house-rule precedence cannot close fields.

New [Warrens production](https://boardgamegeek.com/filepage/315734/darkest-dungeon-the-board-game-the-warrens-printin) and [Color of Madness production](https://boardgamegeek.com/filepage/315735/darkest-dungeon-the-board-game-the-color-of-madnes) listings identify community uploader yoyoboy170 and January/February 2026 ZIP names. Distribution permission for Red Hook IP does not prove these bytes are original production revisions. Public community-linked Drive folders were attempted; original distribution receipt/manifest remains needed. Inspection scope is cross-cutting clarification only, not other Boss implementation.

The [secondary distribution article](https://www.wargamer.com/darkest-dungeon-board-game/files) links the same historical official notice; official URL and site-search retry did not recover the corpus. Current mythicgames.net responds with unrelated gambling content; its HTTP 200 body is REJECTED as publisher authority. A successful HTTP response is not evidence of current publisher ownership.

A retailer core PDF path was tried with a longer ordinary retry. Only exact complete-byte equality with the locked rulebook can authenticate it as duplicate transport; a timeout/partial body cannot. Source authentication currently records 0 verified duplicate mirrors and zero new authoritative corrections. No existing core rulebook parsing was repeated. Official TTS and later revisions remain acquisition/provenance work, not nickname/script rule authority.

Raw response bytes, headers and per-attempt receipts are under source-assets/c1c27. Failure classes distinguish access denial, missing links, DNS, TLS/transport and timeout; partial HTTP 200 bodies retain failure status. The acquisition script runs explicitly and is separate from the deterministic network-free generator. Indexed discovery observations are recorded with queries/URLs; they are not represented as HTTP receipts or original PDFs.

| Candidate | HTTP | curl exit | Classification | Received bytes |
| --- | ---: | ---: | --- | ---: |
| designer-faq | none | 56 | TRANSPORT_ERROR | 0 |
| designer-file-list | 403 | 0 | ACCESS_DENIED_403 | 5588 |
| designer-faq-retry | 403 | 0 | ACCESS_DENIED_403 | 5618 |
| historical-faq-index | none | 28 | TRANSPORT_TIMEOUT | 0 |
| publisher-faq | none | 6 | DNS_FAILURE | 0 |
| publisher-root | 200 | 0 | RESPONSE_RECEIVED_NOT_AUTHENTICATED | 306270 |
| kickstarter-updates | 403 | 0 | ACCESS_DENIED_403 | 5620 |
| redhook-distribution | 404 | 0 | MISSING_404 | 3495 |
| redhook-search | 200 | 0 | RESPONSE_RECEIVED_NOT_AUTHENTICATED | 216106 |
| faq-mirror-en | none | 28 | TRANSPORT_TIMEOUT | 0 |
| faq-mirror-es | none | 28 | TRANSPORT_TIMEOUT | 0 |
| production-warrens | 403 | 0 | ACCESS_DENIED_403 | 5648 |
| production-com | 403 | 0 | ACCESS_DENIED_403 | 5648 |
| production-drive-a | none | 28 | TRANSPORT_TIMEOUT | 0 |
| production-drive-b | none | 28 | TRANSPORT_TIMEOUT | 0 |
| rulebook-mirror-gamershq | 200 | 28 | TRANSPORT_TIMEOUT | 343795 |
| rulebook-mirror-gamershq-retry | 200 | 28 | TRANSPORT_TIMEOUT | 1048307 |
| rulebook-mirror-tesera | 403 | 0 | ACCESS_DENIED_403 | 902 |
| house-rule-lead | 403 | 0 | ACCESS_DENIED_403 | 5685 |
| wargamer-distribution | 403 | 28 | TRANSPORT_TIMEOUT | 3314 |
| tts-discovery | none | 28 | TRANSPORT_TIMEOUT | 0 |
| tts-official-corebox | none | 28 | TRANSPORT_TIMEOUT | 0 |
| tts-community-complete | none | 28 | TRANSPORT_TIMEOUT | 0 |

## Closure, precedence and exhaustion

C1C26 source-bound values/references are inherited unchanged. New per-topic files add statuses and missing structured fields without inventing values. The frozen precedence contract requires an authenticated scoped correction and explicit supersession relationship; no blanket printed-card/FAQ rule is introduced. Rabble/Rubble conflict remains unresolved. All nine categories are BLOCKED_ON_UNRETRIEVED_AUTHORITY, rather than claiming exhaustion from access failures. Exhaustion evidence IDs remain empty because no exhaustion claim passes the full corpus gate.

## Reachability and next workstream

Setup descriptors, Room starts, Threat flip/expiry and full-Stance suppression remain source-complete primitives. They do not form an independently complete playable slice: encounter supply, effect dispatch or completion still reaches blocked fields. No positive Ready gain or production proof exists; descriptor storage cannot select partial runtime. Matrix-derived decision: C1C28 Necromancer Source Closure Continuation; NEXT-NECROMANCER-SOURCE-CLOSURE-CONTINUATION. Other families remain unselected; further source progress is executable through original FAQ authentication, original backer manifests and official TTS provenance.

## Frozen regression and validation limits

Baseline tracked content is checked against C1C26 Git objects, allowing only line-ending differences. Only three package script additions are allowed. Frozen counts: Core Trinket 15/37; Standard Quest 3/75; census 278; Hamlet Event 16 literal / 5 local semantic / 0 Ready; Boss census 231 / 20 families; Battle 114; Threat 51; exclusive Ability 12; Identity 54. C1C25 nine literal / zero family semantic and C1C26 75 unresolved / nine categories / zero terminal remain frozen. Build results are recorded separately in c1c27-validation-report.md; no bundler/Vite config changes. Historical C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector timeout remain open. Complete Edition browser E2E is not fully accepted.
