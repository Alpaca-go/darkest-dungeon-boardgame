# C1C14 Level 2 blocker consolidation

Verdict: **C1C14-LEVEL2-BLOCKER-CONSOLIDATION-ACCEPTED-READY-4-OF-11-SOURCE-GATED**

Under the currently locked authoritative source set, Level 2 production readiness is source-gated at **4 / 11**. 7 cards remain unready; random draw stays locked. Readiness invariants: 0.

## Dependency and development decision

Generic voluntary declaration timing affects six of the seven remaining cards: Bloodthirst Ring, Book of Constitution, Book of Holiness, Book of Relaxation, Fortunate Armlet, and Protective Padlock. The C1C7 timing contract remains unresolved. It blocks a generic runtime window, which in turn blocks voluntary effects and context-specific consumers. Movement affects Constitution and Padlock but its isolated implementation promotes **0** cards. Book of Relaxation's Dodge modifier cannot borrow the incoming-attack-only Camouflage consumer.

Chirurgeon's Charm is independent. Both sides have implemented battle-healing slices and proofs; the source still does not establish whether their triggers cover other healing surfaces. A complete scope ruling could allow re-evaluation, including a proof-only promotion if battle-only is established. Expanding healing to Rest, Hamlet, Provisions, or Trinkets now would assert an unsupported rule.

Five cards have an implemented side and a source-blocked sibling: Bloodthirst, Constitution, Holiness, Fortunate, and Protective. Chirurgeon has two battle-complete but scope-incomplete sides. Relaxation remains largely unimplemented behind timing.

The source delta compares tracked source documents and card normalization at the C1C7 and C1C5R anchors with the current tree. No relevant tracked source changed. The local rulebook was not tracked at those anchors, so historical PDF bytes are not comparable; its named source was already assessed in both prior contracts. The designer FAQ remains unavailable as rule text. The result preserves the prior fail-closed decisions.

## Reopening criteria

New authoritative evidence must define generic declaration contexts, insertion points, usage epoch, ordering, and save/replay semantics before C1C15 Generic Voluntary Declaration Runtime. A complete healing trigger-scope ruling can instead open C1C15 Chirurgeon Scope Closure. Until then, stop Level 2 speculative runtime work and move to source-complete work elsewhere.

Implementation anchor: `c8549da7b87e45022259226756366970846817e2` (tree `be442a2dd2f1c02898b272fac44eae7b58b37bff`).
