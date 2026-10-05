# C1C35R1 validation

Completed local validation on 2026-10-01. Dependency installation (`npm ci`) completed
separately with exit 0 and retained the existing dependency lock. The validation runner
records commands and logs in `c1c35r1-validation/`.

| Command | Result |
| --- | --- |
| npm ci | PASS |
| npm run typecheck | PASS |
| npm test | PASS: 175 files, 2712 tests; 0 failed, 0 pending, 0 todo |
| npm run build | PASS |
| npm run historical-baseline-validation | PASS |
| npm run verify:complete-edition-c1c33 | PASS |
| npm run verify:complete-edition-c1c34 | PASS |
| npm run verify:complete-edition-c1c35 | PASS |
| npm run audit:complete-edition-c1c35r1 | PASS |
| npm run verify:complete-edition-c1c35r1 | PASS |

The final regression includes all 29 new residual-contract tests. An adversarial test
initially exposed a shared mutable save-field array in the new audit code. It was fixed
using an immutable reference list and independent artifact copies; a dedicated isolation
regression was added. Both focused tests and the full global rerun passed after that fix.
No predecessor test, frozen source observation, printed d10 map, Prophet v1 ruling or
production gameplay file changed.

The audit validates contracts, frozen-source integrity and synthetic adversarial
transaction/reload transcripts. It does not implement or accept a production executor,
production save schema, real RNG continuation, or a browser path.

Result: **PROPHET_GATE_A_BLOCKED_ON_AREA_C_CAPACITY**, with 21 of 22 execution contracts
closed. Numeric Area C capacity remains absent and unauthorized. The existing remote
release gate retains every step and appends C1C35R1 verification. Remote status must be
checked against the pushed committed HEAD; the local runner does not claim that result.
