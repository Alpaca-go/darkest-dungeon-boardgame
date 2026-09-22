# C1C-8 Incoming Attack Runtime

Verdict: **C1C8-INCOMING-ATTACK-PROTECTIVE-AND-CAMOUFLAGE-SLICES-ACCEPTED-CARDS-NOT-PROMOTED**

Ordinary monster attacks now pause at two separate persisted reaction stages: incoming attack before hit determination, and hero hit before damage and consequences commit. Attack, damage, and attack-owned disease rolls are frozen before the relevant decision, so save/reload and Trinket choices cannot reroll them.

Protective Padlock's positive side exactly scales incoming damage by one half with ceiling rounding. Camouflage Cloak's positive side feeds +2 Dodge into the rulebook-defined Accuracy-minus-Dodge consumer. Their opposite sides remain blocked by voluntary movement and condition-duration support, so neither card is promoted. Book of Holiness critical conversion and Bloodthirst/Camouflage duration effects remain fail-closed.

Level 2 readiness remains **2 / 11**. Evidence is bound to implementation commit `2f08f325ef694438f58e6a996f76514d7f7f8633` and tree `aa789da00e9721895a072a761bc343b3b0e1158b`; the verifier supplies measured test outcomes rather than storing synthetic PASS claims.
