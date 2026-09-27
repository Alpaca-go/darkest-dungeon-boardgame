# C1C22 Boss / Encounter Live Inventory

This is an inventory/source-contract audit; no gameplay implementation or new Ready promotion.

| Category | Card objects | Physical cards | Unbound printed definitions | Live Quest bound | Act4 references |
|---|---:|---:|---:|---:|---:|
| Bosses | 231 | 231 | 231 | 0 | 0 |
| Boss Quests | 1 | 1 | 0 | 1 | 0 |
| Threat Cards | 0 | 0 | 0 | 0 | 0 |
| Encounter / Event Content | 16 | 16 | 16 | 0 | 0 |
| Guardian Cards | 16 | 16 | 0 | 0 | 16 |
| Final Encounter Cards | 14 | 14 | 0 | 0 | 14 |

The locked census contains 278 card objects. 247 ordinary Boss/Event cards lack source definitions; 1 Boss Quest is already source-bound but blocked by Rest; 30 Guardian/Final cards are references into the existing Act4 workstream and are not reclassified as new Ready cards.

Face the Threat! is present in the 75-card C1C21 census and current Quest source data. Its historical raw-inventory not-extracted tag is superseded by the live source binding; its Firewood 1 / Resting Points 12 retains the unresolved Rest gate. Do not double-count it as new content.

Zero Threat Cards rows is a classification limitation, not absence of printed threat cards. The 231 ordinary Boss cards have unclassified battle/threat/ability subtypes. Visual identities and container names are not confirmed semantic definitions. Requirement asset citations may reference supporting components; the audit exposes references without treating them as runtime/proof coverage. Normalized partial labels do not supersede later independent Act4 acceptance.

Immediate implementation target: none. Runtime-only whole-content Ready gain: 0. Select the 16-card Hamlet Event deck for bounded source intake because it is smaller and has a single explicit source container. This is an extraction priority, not a claim that Events have the largest gameplay ROI. Mock Hamlet events and prototype bosses are not source evidence.

Next action: C1C23 Hamlet Event printed-definition intake. The register supplies exact TTS paths, GUIDs, card/deck/cell IDs, grid dimensions, front/back URLs and required semantic fields. Acquire and hash original sheets; crop and independently transcribe all front/back rules; close timing, choices and deck lifecycle; rerun ROI before gameplay.

C1C20 Core Trinket and C1C21 Quest freezes remain intact (15/37 and 3/75). C1C21 full verification was not accepted: C1C13/12/11 exhausted their permitted reload retry, and C1C3 failed selecting gated Quest cards. These are retained upstream failures, not silently cleared by this audit.

Validation of this audit is recorded separately; no blanket historical E2E success is claimed.
