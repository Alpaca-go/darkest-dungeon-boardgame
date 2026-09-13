# Community engine capability final acceptance — preflight

Local measured verification; the prior closure report is a claim under review.

- Base branch: `phase-11a3-community-source-backed-engine-closure`
- Base HEAD: `8a3f7b2dbbadfb1b921287fb6c23c36e3d4d644f`
- Parent implementation: `c51b53d264438fa5b7470e01e54be5c3dfb39c5d`
- `git status`: clean before any modifications.
- New branch: `phase-11a3-community-engine-capability-final-acceptance`
- Read in full: user request, Final Acceptance Gate Dev Doc v1.0, Independent Audit v12.0, blocker triage, previous machine closure evidence, runtime profile, runtime field coverage, capability helpers, current closure/adversarial suites.

| Claimed closure | Observed production wiring before corrections | Missing acceptance proof |
| --- | --- | --- |
| Guardian resistance | All three family setup routes populate BattleUnits; heroUseSkill calls the shared resistance pipeline | Actual skill effects for every family, duration persistence/replay; shuffle movement bypasses categorical policy |
| Guardian critical | executeMammothCystAction calls the printed resolver and saves hit/critical/damage; Templars skill roll has no equivalent attack route; Shuffling normal skill is currently log-only | Mammoth full SaveFile round trip and target-bound idempotence; exact unsupported family/skill leaves |
| Quest provision | drawDarkestDungeonQuest rolls two dice per living Hero, commits pool and die records | Dedicated SaveFile round trip, invalid Wild choice validation, isolation proof |
| Final skill table | Individual Final action wrappers exist; prior test manually changes activeFormId | No demonstrated complete Community prepare/start/action route; normalized Final semantic matrix and precise retained blockers |
| Final transition | Existing transitionToNextFinalForm implements state transaction and battle rebuild | Previous closure only asserts a constant. Community prepareFinalEncounter is blocked by unresolved Final provision policy; no injected final-state success is admissible |
| Guardian victory | Three family victory functions call resolveGuardianVictory | Actual defeat paths, linked actor cleanup in both battle and encounter state, whole-save replay and progression exactly once |

All six claimed closures reference the absent `community-engine-capability-save-replay.test.ts`. Additional names (`quest-provision`, `final-skill`, `final-transition`, `guardian-victory`, `no-space`) do not resolve in their cited files. Final verifier must resolve actual executable test names, not text substrings.

Preserved areas: all five normalized source blockers (Templar Pit exit, Absolute Nothingness stance, Gestating Heart lethal timing, Come Unto Your Maker, Monster Deck draw policy), and all six triaged runtime source gaps (Excavation provision die, Final provision policy, Guardian special skill semantics, Templar adjacency, Shuffling initial area, Mammoth Stalk no-space resolution). Official source semantics, source intake, normalized source records, visual assets and Phase 11B are outside the implementation scope. No new source-gap research or videogame inference.

The supplied execution contract governs this acceptance work. Its suggestion to begin a later source-resolution phase does not override the user's explicit STOP instruction.
