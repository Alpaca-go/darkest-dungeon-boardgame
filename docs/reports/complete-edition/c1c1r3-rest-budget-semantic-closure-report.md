# C1C-1R3 Rest Budget Semantic Closure

Verification scope: **LOCAL MEASURED VERIFICATION**

Measured implementation HEAD `6b4ba1b7f43782331059b27cb07bf24cf36405a0` and tree `892c9798b1505c5fbfd3c2b270cd5aa3b8c87601`.

## Source outcome

Core rules plus the attributed designer clarification explicitly require spending all supplied Resting Points. Voluntary partial and zero-point Rest are rejected. The sources do not define what happens when total recoverable Life plus Stress is below the printed budget, so `QUEST_REST_ALLOCATION_SEMANTICS` remains fail-closed.

## Measured readiness

Quest Production Ready is **2 / 75**, measured without a target-count assertion. The five Firewood Quests are blocked by the unresolved interaction primitive; the two 0/0 Quests remain Ready. Trinket Production Ready remains **2 / 48**.

Ready Quest IDs:

- `community-quest-warrens-lvl1-explore-the-sewers`
- `community-quest-warrens-lvl2-mapping-the-sewers`

## Browser proof

The Rest E2E allocates the complete 8-point budget through eight player clicks, rejects a partial draft, consumes Firewood, and verifies reload. It proves the implemented UI/command path but does not override the unresolved insufficient-capacity rule. The existing Explore the Sewers gameplay/XP E2E remains green.

## Measured commands

- historicalSemanticFreeze: exit 0
- restBudgetSourceEvidence: exit 0
- semanticContractValidation: exit 0
- restRuntimeSourceGuard: exit 0
- restE2eInjectionGuard: exit 0
- restBudgetAndQuestProofs: exit 0
- questAndRestPlaywright: exit 0
- fullRegression: exit 0
- build: exit 0

C1C-2 is outside this verification scope.
