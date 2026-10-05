# Rule sources and Complete Edition runtime

From C1C29 onward, use `docs/data/complete-edition/rule-source-policy.json`
(`RULEBOOK_ONLY_SOURCE_POLICY_V1`) for new Boss, Event and Quest work.

- Rules authority is limited to locked official rulebooks, their existing hash-bound
  page extracts, and locked official printed cards/components. A printed image's
  transport or storage provenance is not a rules authority.
- Do not acquire FAQ, BGG/forum/Reddit/Wiki/video/community/TTS-script/videogame
  clarifications. Do not return to source-closure acquisition unless an omitted
  locked official rulebook page is found or the user changes this policy.
- Preserve missing canonical rules as `SOURCE_UNRESOLVED`. Executable missing
  behavior needs an explicit, versioned `PROJECT_RULING`, `canonical = false`.
  Never label project decisions as official rules or guess from card text at runtime.
- Necromancer foundation consumes the C1C28 executable semantic contract and
  pins `C1C28-DIGITAL-DEFAULT-v1`. Do not silently edit that ruling set or C1C25–28
  canonical evidence. Record a contract/ruling review and stop affected promotion
  if a required executable dependency is absent or inconsistent.
- Freeze C1C20 Trinket 15/37, C1C21 Quest 3/75, C1C22 census 278, C1C23 Hamlet
  Events and C1C24 Boss census 231/20 families. Keep synthetic combat fixtures and
  prototype definitions separate from production acceptance.
- Reuse BattleState, damage, seeded runtime/initiative and campaign transaction
  helpers. Preserve PendingChoice candidates, causal events and rule version in saves.
- The known Windows Vite repeated CSS hash/path-length build failure belongs to a
  separate tooling workstream unless it blocks runtime testing.

For C1C29 changes, relevant checks are `npm run typecheck`,
`npm run test:necromancer-foundation`, `npm run verify:complete-edition-c1c29`, and
`npm run test:e2e:necromancer-foundation`. Broaden regression checks as appropriate.

From C3A onward, ordinary Monster development uses CONTENT-FIRST / FAST-GATE.
During C3A–C3D, run targeted phase tests, typecheck and build; preserve frozen
workstreams and defer non-blocking semantic uncertainty. Do not routinely run
the complete historical regression or full Playwright acceptance. Full regression
and historical acceptance belong to explicit production freeze or release phases
such as C3E.
