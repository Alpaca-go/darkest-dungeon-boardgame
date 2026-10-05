# C4B Rest official contract review

Base: `8ac3de01c53dc23b47a9549cb8e219d4c93ff968` (accepted C4A).
Outcome: **REST_OFFICIAL_CONTRACT_UNRESOLVED**.

The locked official corpus does not establish how a standard Rest completes when
the party cannot recover the printed budget. It also does not explicitly establish
mandatory full-budget spending, prohibit partial completion, or decide zero-point
completion. No Quest source gate is removed and no implementation batch is selected.

The source map inventories ten locked files: the existing 44-page core rulebook,
the locked 44-page print version, both eight-page Old Road tutorials, the Court,
Warrens, Cove and Weald rules, Color of Madness, and Master Webber rules. All pages
were checked for Rest and recovery context. Existing hash-bound extracts and all
76 printed Quest observations/bindings were reviewed without acquiring sources.
The source map records file hashes, page-text hashes, sections, support strength,
and source scope; it reuses existing evidence rather than copying full page text.

Core pages 11 and 15 provide the main contract. Page 25 confirms Rest after a won
Battle clears a Room. Page 30 illustrates Boss Quest Firewood. Page 36 supplies a
scoped eight-point Excavation Site exception, not an excess-point rule. Recovery
context on pages 12, 19–21, 27–29 and 32–35 does not settle completion. Page 40's
final-encounter recovery restriction is also scoped. Old Road p4 is a scripted
allocation example; p1 explicitly says it is not a rulebook. Color of Madness
pp4 and 7 use a separate Campsite phase, not standard Quest Resting Points.
Weald p3 prohibits Healing while Necrotic Fungi remain; that restriction does not
supply an excess-point or Rest-completion rule. Non-Rest Quest gates remain frozen.

| Required field | Current official status | Production usable |
| --- | --- | --- |
| firewoodUse | OFFICIAL_EXPLICIT | Yes |
| sessionBudget | OFFICIAL_EXPLICIT | Yes |
| restingPointAllocation | OFFICIAL_EXPLICIT | Yes |
| pointConversion | OFFICIAL_EXPLICIT | Yes |
| multiplePointsPerHero | OFFICIAL_DERIVED | Yes |
| onePurposePerPoint | OFFICIAL_DERIVED | Yes |
| budgetConsumption | OFFICIAL_INSUFFICIENT | No |
| partialSpend | OFFICIAL_INSUFFICIENT | No |
| zeroPointRest | OFFICIAL_INSUFFICIENT | No |
| insufficientRecoveryCapacity | SOURCE_UNRESOLVED | No |
| roomGate | OFFICIAL_EXPLICIT | Yes |
| recoveryCap | OFFICIAL_INSUFFICIENT | No |

The historical `C1C1R3:S2:ARGYRIS-ALL-POINTS` claim is reviewed as inadmissible
history, never successor authority. Designer credits do not make forum content
a printed rule. The historical Rest file remains byte-for-byte unchanged.

`recoveryCap` needs special care. Removing Wounds and decreasing the Stress track
bound **actual recovery**. That does not prove the historical model's stricter
instruction to reject allocations exceeding recovery need. This allocation-legality
claim remains insufficient; C4B neither implements a clamp nor chooses waste-point,
discard, partial-completion or cannot-Rest behavior. Base point conversion does not
re-review frozen Hero recovery modifiers.

The 71 Firewood Quests retain their 142 Rest source-gate obligations. Successor
readiness remains 3 production-ready, 0 adapter-ready, 0 primitive-blocked,
65 source-blocked, 0 deferred-semantic, and 8 multi-blocked. Only Rest gates were
re-evaluated. All non-Rest obligation IDs still refer to the frozen C4A matrix.
Potential readiness after hypothetical Rest closure is explicitly hypothetical.

All eight conditional simple-adapter candidates retain an existing historical
adapter and a saved-choice/transaction binding obligation. They have no current
production-bound save/replay proof and are not selector-reachable. Their remaining
source gates are Rest gates; **none is currently implementation-eligible**.
Historical adapter proof manifests are present and their test IDs are retained in
the impact artifact; they are not new C4B executions or automatic proof inheritance.

Exactly one next decision is recorded: **REST_SOURCE_POLICY_DECISION_REQUIRED**.
The locked official corpus is exhausted for this question under the current policy.
Further Rest progress requires either explicit user authorization for a versioned,
non-canonical project ruling, or identification of an omitted locked official page.
No ruling, adapter, Rest behavior, or subsequent workstream is started automatically.

Validation is limited to npm ci, typecheck, targeted C4B tests/verifier, build, and
C4A verification at its exact accepted checkout. The Fast Gate preserves C3 and
C4A paths, gives C4B that exact-base check, and rejects unsupported C4 phases
instead of applying frozen C3 verifiers to successors. No full regression,
Playwright, C2E validation, or Production release gate is run.
