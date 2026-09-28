# C1C26 validation

Baseline commit: `2ba8942bbd080b49260f9cba117729a000ebcddf`.
Working branch: `codex/phase-11a4-c1c26-necromancer-source-closure`.
Validation date: 2026-09-28.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| `npm run import:complete-edition-c1c26` (equivalent direct `node scripts/audit/acquire-c1c26-sources.mjs` was executed) | Acquisition recorded | Four HTTPS receipts: BGG filepage/list 403; publisher DNS failure with no HTTP response; later official page 404. No authoritative FAQ file acquired. |
| `npm run audit:complete-edition-c1c26` | PASS | Deterministic contracts, 75 inherited usage statuses, 45 refined null-field usages, readiness, ROI, decision and report generated from locked inputs and saved receipts. |
| `npm run typecheck` | PASS | Exit 0 after replacing unsupported ES2021 `replaceAll` with ES2020-compatible replacement. No compiler/tooling configuration changes. |
| C1C26 Vitest suite | PASS | 27 tests; positive and adversarial checks for identity, immutable setup/lifecycle, ties/count/supply, precedence, cleanup, terminal evidence, promotion, decision and scope. |
| C1C20–C1C26 Vitest regression | PASS | 7 files, 149 tests; includes all 122 existing C1C20–25 tests plus 27 C1C26 tests. 77.23 seconds. All 462 C1C24 exact crops and C1C25 Bone/Room crops rebuilt and verified. |
| `npm run verify:complete-edition-c1c26` | PASS | Baseline ancestry/content, permitted Git scope, exact package delta, source response hashes, C1C25 source assets, upstream frozen metadata hashes, deterministic JSON and report equality. |
| `git diff --check` | PASS | No whitespace errors. |
| `npm run build` | NOT RERUN | C1C25 CSS output repeated-hash/path-length failure remains `BUILD_ACCEPTANCE_UNVERIFIED`; no bundler repair attempted. |
| Browser E2E | NOT RERUN / NOT FULLY ACCEPTED | C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout remain open. |

The regression command was:

```powershell
npm run test -- src/audit/c1c20-core-terminal-blockers.test.ts src/audit/c1c21-standard-quest-live-rebaseline.test.ts src/audit/c1c22-boss-encounter-live-inventory.test.ts src/audit/c1c23-hamlet-event-source-intake.test.ts src/audit/c1c24-boss-source-intake.test.ts src/audit/c1c25-necromancer-semantic-source-intake.test.ts src/audit/c1c26-necromancer-source-closure.test.ts
```

The initial all-file object-hash check exposed pre-existing mixed CRLF/LF content in a clean tracked E2E file. The verifier now compares Git objects first and permits only CRLF/LF differences when a text object differs. Binary changes and different text still fail; frozen upstream source metadata additionally uses exact-byte SHA256 checks. No baseline file was rewritten to address that checkout condition.

The generator performs no network requests or clock reads. Acquisition is a separate explicit command; rerunning it intentionally produces a new retrieval record and requires regenerating dependent artifacts. Saved response hashes identify HTTP bodies, not an authenticated FAQ PDF. Empty/failed downloads cannot become rule authority or terminal evidence.

Scope includes audit scripts/test, C1C26 data and source receipts, reports, and exactly three package script additions. Existing user temporary files are preserved and excluded from scope accounting. All gameplay, UI, selector, save/replay, Act IV, other Boss family and previous-phase files are preserved.

Result: `C1C26-NECROMANCER-SOURCE-CLOSURE-ACCEPTED` for rigorous source classification. Before/after: 75/75 unresolved inherited leaf usages across 9/9 categories; closed 0, bounded 75, terminal 0. Family semantic 0/9, runtime eligible 0/9, Ready 0/9. No runtime implementation is accepted or performed. Next: `NECROMANCER_SOURCE_CLOSURE_CONTINUATION` for C1C27.
