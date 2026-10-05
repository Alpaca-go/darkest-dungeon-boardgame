# C4A Standard Quest production rebaseline

Base main: `ed84d1359907268736b7d163b68c5b359c4d71fd`.
Policy: `RULEBOOK_ONLY_SOURCE_POLICY_V1`. Audit only; no gameplay changes,
new rulings, external acquisition, browser testing or full regression.

The current printed evidence and normalized corpus contain **76 identities**:
75 standard-tagged Quests plus Face the Threat. The frozen runtime source
catalog and C1C21 census contain 75. The extra source identity is
`community-quest-crimson-court-lvl3-rest-in-rubble-iii`; its normalized
`specialRules.1.parameters.onClear` remains unresolved. C4A includes it without
altering historical evidence or integrating it into gameplay.

| Current readiness | Count |
| --- | ---: |
| PRODUCTION_READY_EXISTING | 3 |
| ADAPTER_READY | 0 |
| RUNTIME_PRIMITIVE_BLOCKED | 0 |
| SOURCE_BLOCKED | 65 |
| DEFERRED_SEMANTIC | 0 |
| MULTI_BLOCKED | 8 |

All 73 non-ready identities retain at least one source gate; 72 overlap the
historical source-gated set. The same three Warrens Quests remain bound to
production adapters, selector and proofs. There are **zero newly unblocked
whole Quests**. The top-level categories are exclusive; inclusive source,
primitive and deferred lists are supplied separately in the status comparison.

Current C3E definitions independently reproduce 71 identities, 77 forms,
175 actions, 168 runtime-ready and 7 deferred actions, with 24 automatic
Ruins forms and 53 other explicit-manifest forms. Named profile instantiation,
action executability and physical random-deck eligibility are distinct
obligations. Squiffy Ghast and Courtesan remain deferred where specifically
required. Explicit manifests remove the old assumption that automatic
exclusion means runtime inability, but do not establish random regional decks.

C2E and shared runtime pipelines express printed Hero timed conditions,
Stress and Disease acquisition. Quest kill/spawn/hit/round/Death Door routing
still requires adapters. Monster overrides, encounter/result policies and
first-round initiative ordering likewise reuse existing primitives. Additional
activation cards, generic changing rosters, regenerated room identity,
delayed round objectives and tainted-Trinket lifecycle need saved capabilities.
Frozen Boss summon patterns are reuse evidence, not transferable rulings.

Rest recovery-capacity behavior remains `SOURCE_UNRESOLVED`. The old contract's
full-budget/partial-spend restriction also cites a community clarification;
its historical `SOURCE_EXPLICIT` label is not accepted official authority under
the current policy. C4A records this separately and leaves the contract intact.

The complete physical Trinket deck now has 37 identities (14/11/12 by level).
Accepted source-bound draws persist ownership, including pending rewards.
Only 15 effects are production-ready. Level 2/3 literal deck completeness does
not close frozen effect timing/source gates or enable arbitrary equipment.
Family Trinkets, Tainted Trinkets and Take 'Em Back receive separate source,
draw, effect, acquisition/provenance and return obligations.

The seven JSON artifacts contain the full census, atom classifications,
hash-bound evidence references, historical blocker review, source gaps,
deduplicated backlog and current ROI. Shared evidence and rationales in the
capability matrix use IDs to avoid repeated evidence packages.

Exactly one successor is selected: **REST_OFFICIAL_CONTRACT_REVIEW**, a source
and evidence successor for C4B rather than a gameplay implementation batch.
Its immediate coverage gain is **0**. Eight existing simple adapters are
conditional candidates only after official source closure and renewed binding
and proof checks. Existing locked pages may be reviewed; acquisition may reopen
only for an identified omitted locked official page or a changed user policy.
Otherwise retain unresolved status and wait. No project ruling is introduced.

Validation commands are `npm ci`, `npm run typecheck`,
`npm run verify:complete-edition-c3e`, `npm run test:complete-edition-c4a`,
`npm run verify:complete-edition-c4a` and `npm run build`. C3E verification was
run on the unchanged authoritative base before successor files were added.
Its global fingerprint includes successor audit files and package scripts;
C4A therefore preserves its receipt and independently verifies every frozen
tracked file against the exact base. Tests reject missing identities/atoms,
invented readiness/gain and conflated Monster/Hero/Trinket source gates.
All required development commands passed: 11 C4A tests, C4A artifact verifier,
typecheck and production build; npm ci and the C3E development verifier also
passed. The frozen-input check covers 4,754 base files outside the C4A allowlist.

C4A stops here. No C4B gameplay or release gate is started.
