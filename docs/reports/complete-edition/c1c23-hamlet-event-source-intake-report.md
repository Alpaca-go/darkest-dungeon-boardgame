# C1C23 Hamlet Event Printed-Definition Intake

Verdict: C1C23-HAMLET-EVENT-SOURCE-INTAKE-ACCEPTED

Next: NEXT-NO-IMMEDIATE-SOURCE-SAFE-CANDIDATE

This is source extraction, semantic normalization and capability auditing. No gameplay, UI, draw logic or save/replay implementation changed. Baseline: a6f29f9543f017c454724bbeade445c94d0c63f2 (C1C22).

## A. Physical source binding

All 16 C1C22 physical identities have exact front and back source bindings. Two original 2950 x 4900 JPEG sheets, acquisition receipts, MIME/byte metadata and SHA-256 sidecars are retained under source-assets/c1c23. Each of the 16 front/back crop pairs is 590 x 980 and regenerates from its original 5 x 5 cell. uniqueBack=true is honored: each back uses its own cell, even though the printed back label is uniformly HAMLET EVENT with no gameplay semantics. No nickname, mock Event or runtime rule is source evidence.

All 16 original front crops were independently read in cell order; rules and flavor were transcribed. Bracketed tokens denote original pictograms, not supplied words. The source manifest records the token convention; unresolved glyph scope is retained for Town Fair. Back art was inspected on the original sheet. Visual transcription remains a human-reviewable extraction, not a claim that hashes alone prove text recognition.

## B. Capability counts

| Total | literalComplete | semanticComplete (card-local) | sourceGated (including deck) | runtimeBlocked | productionReady |
|---:|---:|---:|---:|---:|---:|
| 16 | 16 | 5 | 16 | 16 | 0 |

semanticComplete measures unresolved card-local contract leaves; it excludes unresolved shared deck lifecycle. sourceGated includes both. Therefore a clear single-card contract is not a complete production contract. Costs, optional choices, selected Heroes, delayed triggers and permanent removal are separated.

| Card | Card-local semantics complete | Source gates |
|---|---|---:|
| Guild Training | false | 7 |
| In Good Spirits | false | 7 |
| General Repairs | true | 6 |
| Caregivers Convention | false | 7 |
| Medical Breakthrough | false | 7 |
| The Feast | false | 7 |
| Gypsy Trail | false | 7 |
| Traveling Merchants | false | 8 |
| Town Fair | false | 7 |
| Labor Force | false | 8 |
| Uneventful Week | true | 6 |
| Lost Shipment | true | 6 |
| Unsettling Darkness | true | 6 |
| Busy Week | true | 6 |
| Supply Run | false | 7 |
| Militia Training | false | 9 |

Specific gaps include Supply Run's gains-versus-roll ordering; Town Fair's four-helmet target glyph; Labor Force removal on decline; Traveling Merchants' dice attribution after pooling; Gypsy Trail duration; optional-choice reversal after commitment; Medical Breakthrough with no eligible disease; In Good Spirits with existing Virtue/Affliction; and Militia Training mixed participation and unspecified upgrade costs. These are source gaps, not engine deficiencies. Clear effects without Event adapters are separately ENGINE_BINDING_MISSING.

## C. Deck lifecycle

Not fully determined. The unchanged, previously locked C1A S4 core PDF supplies core setup (p10-11), 16 component count (p5), one Event as the first Hamlet step and following instructions then shuffling back (p32), preparation-day legend and permanent campaign discard exceptions (p33), and general saving (p35). The glyph/related-rule pages are also extracted with the original PDF hash. Core rules do not prove Complete Edition expansion membership or simultaneous use of every cell. Separate reveal timing, exhausted-deck behavior, campaign copy policy and exact Event save-state fields remain SOURCE_UNRESOLVED. No default discard-pile reshuffle was inserted. Labor Force and Guild Training have explicit permanent-removal clauses; Labor Force's declined branch remains open.

## D/E. Runtime family and whole-Event ROI

No immediate source-safe Event runtime family is selected. All six audited family bundles yield 0 complete Event Ready gain while deck source gates remain. Even Uneventful Week requires a formal source-bound consumer, preparation-day integration, deck lifecycle, selector, UI and save/replay proof. Existing 3 mock Hamlet Events are not the formal 16-card consumer; generic healing, progression or Quirk helpers do not establish Event adapters. The matrix lists every candidate, full primitive bundle, remaining source gates and required proof. Primitive frequency is never counted as Ready gain, and no hypothetical source closure is assumed.

## F. Next workstream

C1C24: Boss source intake with Threat / Battle / Ability subtype classification, as allowed by the C1C23 decision rule. Event runtime remains gated until the enumerated deck/card ambiguities have authoritative closure.

## Verification and regression boundary

Run import:complete-edition-c1c23 to reproduce crops, audit:complete-edition-c1c23 to regenerate data/report, and verify:complete-edition-c1c23 for byte-level crop provenance, generated-artifact consistency, decision rebuilding and adversarial audit tests. extract-c1c23-rulebook.py --verify independently re-extracts the locked PDF. The verifier preserves baseline gameplay and every C1C20/C1C21/C1C22 tracked artifact; Core Trinket 15/37, Standard Quest 3/75, Boss/Encounter inventory, Act IV and prior source gates/hashes remain frozen.

C1C21 full verification remains historically unaccepted: C1C13/12/11 reload retry exhaustion and C1C3 selector click timeout are not fixed or cleared here. No entire Complete Edition E2E pass is claimed. C1C23 validation is recorded separately in the validation report.
