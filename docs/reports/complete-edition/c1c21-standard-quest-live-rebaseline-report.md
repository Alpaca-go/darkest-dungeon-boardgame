# C1C21 Standard Quest Live Rebaseline

Ready 3/75; not ready 72. Source-gated 72; runtime/binding-only blocked 0; proof-only 0.

Ready IDs:

- community-quest-warrens-lvl1-explore-the-sewers
- community-quest-warrens-lvl2-mapping-the-sewers
- community-quest-warrens-lvl3-deep-in-the-warrens

Rest remains fail closed: insufficientRecoveryCapacity is SOURCE_UNRESOLVED. Live data has eight simple-adapter firewood cards (including Pork Chop), not the requested seven. All 70 firewood cards remain source-gated; Family and Tainted provide the remaining two source gates. The locked 75-card source set includes Face the Threat! with questType=boss; filtering questType=standard would incorrectly omit it.

Family: Level 2 4/11; Tainted: Level 3 4/12. Both require complete source decks. Tainted evaluator omits its Level 3 dependency; audit records MISSING_READINESS_DEPENDENCY and excludes promotion. Ready-subset substitution is forbidden.

Core Trinket freeze: 15/37, levels 7/14, 4/11, 4/12. C1C20-CORE-TRINKET-TERMINAL-BLOCKER-CONSOLIDATION-ACCEPTED-SOURCE-GATED-15-OF-37.

The primitive frequency table is derived from live missing primitives plus semantic obligations, deduplicated per Quest. Unbound semantic categories are retained separately rather than guessed as implemented consumers. Condition, disease, exploration and Trinket consumers do not automatically establish Quest timing/target bindings.

Every primitive has zero immediate whole-Quest gain under current bindings, exact adapters and production proofs. This is a conservative primitive-only counterfactual, not a prediction that a complete family implementation with new adapters/proofs cannot promote cards. No family currently has a precisely specified, machine-bound positive promotion set; C1C22 must first audit Boss/Encounter inventory or close Quest consumer contracts. All 72 blocked cards have external source gates; most also have downstream runtime binding gaps. Their literal source rules are not thereby unknown.

Selected family: NO_IMMEDIATE_SOURCE_SAFE_CANDIDATE. Expected immediate Ready gain: 0.

Existing C1C1/C1C1R/C1C1R2/C1C2/C1C3 proofs are reused by ID and registry scope; primitive Rest E2E is not source-semantic closure. No gameplay changes or new E2E fixtures.

C1C4 is comparison-only. Report does not assert full verification; see exact command logs and receipt in tmp/c1c21-verification.

Verdict: C1C21-STANDARD-QUEST-LIVE-REBASELINE-ACCEPTED-READY-3-OF-75-NEXT-NO_IMMEDIATE_SOURCE_SAFE_CANDIDATE
