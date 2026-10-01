# C1C35R2A-R — Successor infrastructure remote release gate

Baseline: `c40af8deb4e1ecf683ae78414dd5313c943d2393`.
Branch: `codex/phase-11a4-c1c35r2a-r-release-gate-closure`.

The Production release gate now executes npm ci, typecheck, HEAD tests, build,
historical-baseline-validation, immutable phase baselines, Necromancer successor
compatibility, Prophet Gate A, and C1C35R2A shared dispatch verification in that
order. The aggregate immutable verifier replaces five redundant individual
historical steps. Existing package scripts already supply the required wiring.

The compatibility command retains both `--verify-immutable-origin` and
`--verify-compatibility`. Expected outputs are reproduced with accepted C1C35R2
runtime bytes; actual outputs use successor HEAD. No compatibility expectation
was regenerated in this phase.

Historical checkpoints C1C33, C1C34, C1C35, C1C35R1 and C1C35R2 remain immutable.
Their original verifiers execute in detached accepted checkouts, and current
evidence is compared against accepted Git blobs. C1C33's 383 runtime hashes
continue to describe its accepted checkout. No successor runtime byte freeze
is restored.

The four historical audit suites remain unchanged and excluded from HEAD
collection only because `successor-historical-boundary.test.ts` executes them
in the accepted R2 checkout. HEAD regression and predecessor test results are
recorded separately in the acceptance artifact. No test exclusion was added.

Prophet Levels I, II and III remain registered through the production family
registry, with gameplay disabled. Shared save proofs remain
`INFRASTRUCTURE_CONTRACT_FIXTURE_NOT_GAMEPLAY_ACCEPTANCE`. Prophet production
foundation and gameplay acceptance remain false.

Validation results and the inspected remote job steps are recorded in
`c1c35r2a-r-release-gate-acceptance.json` and `c1c35r2a-r-validation/`.
The existing local `.gitignore` edit is outside this phase and is not committed.

All nine local commands exited zero. HEAD regression remains 2690 passed with
zero failed, pending or todo. The immutable R2 suites separately passed 72
tests with zero failed, pending or todo, confirmed in the remote job logs.
All five dependency probes pass, production prototype reachability is zero,
and the three Prophet shared-save infrastructure checks pass.

The implementation commit `9ffeb7e15c88d8a33fea1c383380a41533b37974` passed
[Production release gate run 36825359910](https://github.com/Alpaca-go/darkest-dungeon-boardgame/actions/runs/36825359910).
The inspected job contains all nine required successful command steps. The
acceptance artifact records this committed, remotely verified implementation
SHA and run. The subsequent evidence-only commit must also pass the same remote
workflow; its final SHA and run are reported in the completion response. Recording
an already completed run avoids pretending that a commit can contain its own
future Actions result or its own Git hash.

Outcome: `C1C35R2A_SUCCESSOR_INFRASTRUCTURE_ACCEPTED`. Freeze the C1C35R2A
infrastructure. C1C35R2B — Prophet Production Foundation Implementation is the
next authorized phase, covering ordinal 1/four physical Wooden Pews/shared RNG,
ordinal 2/Crowded/PendingChoice, ordinal 3/Rubble/per-Pew cursor, Threat Levels
I–III, Room 11 lifecycle, shared save/reload/tamper validation, and victory
cleanup. R2B gameplay is not implemented here. C1C36 remains blocked until R2B
production-foundation acceptance.
