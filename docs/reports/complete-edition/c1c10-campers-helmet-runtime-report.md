# C1C-10 Camper's Helmet Runtime

Verdict: **C1C10-CAMPERS-HELMET-CAMPING-SCOUT-CLOSURE-ACCEPTED**

The Camper's Helmet now uses exact, independent Camping and Scout windows. Camping freezes a validated Rest allocation, rolls two source-defined d6 Provision Dice through the shared RNG abstraction, persists Wild choices, updates the common pool up to its 16-die limit, flips the card, and commits Rest exactly once. Scout resolves the negative +1 Stress through the shared Stress pipeline before the original party Scout stress.

Both sides are exact in the semantic comparator and are exercised through production UI controls. Level 2 readiness is **4 / 11**; random draw remains locked. Evidence is bound to implementation commit `66ba2a3ffe46004f0daf853ab29bbaf20997557b` and tree `60fce317a7b8e26273fa4e022dc138a4647730e5`.
