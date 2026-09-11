# Phase 11A.3 Community Reference Data Binding

Baseline: `ae2051acd07ce551f95db48752f4583631486855` on
`phase-11a3-infrastructure-freeze-publication`.
Verified implementation commit: `42b869db66995dbabbd6a24b820e38f2f939291c`.
Evidence publication: this report's commit, whose direct parent is the verified
implementation commit above.

This branch introduces only a community-reference provenance/data binding
namespace.  It does not change the Official Source Gate, official requirement
semantics, Formal Matrix, `ISSUE-P0-002`, or any official runtime pool.

## Inputs and coverage

| Input | SHA-256 |
| --- | --- |
| Complete Edition intake package | `382e479f84f79a9b3cc6b0256b2fa5dea100b3576244988f180b49e75ed78d2a` |
| Workshop JSON `3657612854` | `d2fe21a6aa294f80fb47e56677c3a74090c3dc131361d798dfde709f6a3a64a2` |
| Core Rulebook | `9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae` |

The reviewed intake contract is 26 unique requirements, 131 required fields,
126 eligible evidence-backed fields, and 5 unresolved fields.  The source
authority is exclusively `COMMUNITY_RETAIL_REFERENCE`.

Bindings are title/printed-identity based: the three quests have unique
title-based community IDs; Room 9–12 are explicit; two source-local dungeon
tile graphs expose 16 room slots and three boss candidates each; and the
monster deck preserves a 26-card physical count and nine logical identities.
No source-local binding targets a prototype identifier. Unbound IDs: none.

## Deliberately blocked values

- `tierB-templars-room.pitExitRule`
- `tierB-absolute-nothingness.stance`
- `tierB-gestating-heart.lethalWoundTimingRuling`
- `tierB-come-unto-your-maker.definition`
- `tierB-darkest-dungeon-monster-deck.drawPolicy`

All five are represented as `null`/`unresolved`; no defaults, videogame rules,
or DeckIDs ordering were used.

## Verification

Completion measurement: `npm run verify:community-reference-binding -- --input
<canonical-intake>` passed with run ID
`6c795187-aa78-4d51-88ea-db31e5d6eb48`. Deterministic regeneration parity
passed; 26 requirements, 131 field entries, 126 eligible, 5 unresolved, and
108/108 source references were measured. The independent binding comparison
measured 228 expected and 228 actual unique bindings, with zero unbound and
zero unexpected IDs. Typed projections measured 3 Quests, 7 Guardians,
4 Rooms, 2 Dungeon Tiles, 10 Final Encounter records, 26 physical Monster
cards, and 9 logical Monster identities. The required adversarial suite passed
22/22 and targeted typecheck passed.

The fresh full `verify:phase11a3-source-gate` run
`64f22f90-98bd-4846-a620-7f721949589c` completed successfully and
its measured official truth remains `SOURCE-BLOCKED`,
`requiredMissing=26`, `optionalMissing=1`, `openP0=1`, `openP1=0`, only
`ISSUE-P0-002`, Formal Matrix `0/9`, `canCloseP0_002=false`, and
`canEnterPhase11B=false`.

Terminal intent: `COMMUNITY-REFERENCE-DATA-BOUND`; this is not an official
Phase 11A.3 completion claim and does not enable runtime behavior.

Verification Environment: LOCAL MEASURED VERIFICATION. GitHub CI/status
checks: none observed.
