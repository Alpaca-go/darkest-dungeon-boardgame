# C1C-6 Dark & Solar Bracer Attack Resolution Closure

Verdict contract: **C1C6-DARK-SOLAR-ATTACK-RESOLUTION-ACCEPTED**

Evidence is bound to implementation commit `c0fbd79d61670e165fd2531ef59676c54f5d1524` and tree `5574a0572db6efce6f0563e6576918485b0dffd2`. The independent command `npm run verify:complete-edition-c1c6` must re-prove this snapshot; the committed evidence does not contain synthetic command results.

Dark Bracer and Solar Bracer use one staged attack pipeline. Attack roll, hit, crit, and base damage are frozen before the pre-damage decision. Their negative sides set final damage to zero without rewriting the hit or suppressing on-hit effects. Level 2 readiness is **2 / 11**; the incomplete deck and Family Trinkets remain fail closed.
