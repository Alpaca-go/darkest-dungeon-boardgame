# C1C27 validation

Baseline commit: `8db6c64334a7c5ca95e75ef4de201329251cc634`.
Working branch: `codex/phase-11a4-c1c27-necromancer-source-closure`.
Validation date: 2026-09-28.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Explicit source acquisition | RECORDED | Acquisition script initially ran 18 public candidates, then three historical/longer retry paths and two newly discovered TTS paths using candidate filters. 23 distinct attempt receipts with raw response/header hashes and sidecars. No authenticated designer PDF or later corrective rule file acquired. |
| Public indexed-source inspection | RECORDED | BGG designer title/uploader, Scribd two-page preview, 2026 production ZIP identities, public community Drive links, official-claimed 2023 TTS and community Complete Edition 2026 listing. Queries, URLs, scope and authentication limits in c1c27-source-discovery-review.json. Indexed access and curl outcomes are distinguished. |
| `npm run audit:complete-edition-c1c27` | PASS | Offline deterministic generation, all 75 usage identities retained, nine category statuses, topic contracts, semantic/readiness matrices, authentication and C1C28 decision/report. Repeated after final exhaustion-evidence validation change. |
| `npm run typecheck` | PASS | TypeScript exit 0. No compiler configuration changes. |
| C1C25–27 Vitest | PASS | Three files, 88 tests (37 + 27 + 24); 22.68 seconds. Existing Bone/Room crops verified. New suite covers authority/mirror promotion, failure-versus-exhaustion, structured ties, count/supply/order/cleanup, matrix derivation and frozen scope. |
| C1C20–24 Vitest | PASS | Five files, 85 tests; 89.40 seconds. All 462 C1C24 Boss crops rebuilt and checked. Combined C1C20–27 coverage is eight files / 173 distinct tests. |
| Final C1C27 Vitest rerun | PASS | 24 tests after strengthening exhaustion proof to require verified evidence records, complete coverage and non-transport proof types. |
| `npm run verify:complete-edition-c1c27` | PASS | C1C26 ancestry/all tracked content freeze with EOL-only tolerance, exact three package additions, allowed new-file scope, receipt sidecar/header/body hashes, original source/crop verification, deterministic JSON/report equality. Repeated after final generator change. |
| `git diff --check` / `git diff --cached --check` | PASS | No whitespace errors. Acquisition `.headers` and `.response` files have scoped binary Git attributes to preserve exact transport bytes and CRLF; the staged check passes without rewriting source evidence. |
| `npm run build` | FAILED / BUILD_ACCEPTANCE_UNVERIFIED | TypeScript stage passed. Vite 5.4.21 transformed 12,737 modules, then failed after 1m21s rendering CSS: ENOENT opening dist/assets/index-C6s6nAC9-C6s6nAC9-… .css with a repeatedly extended hash/path. Same frozen Windows repeated-hash/path-length failure; no bundler/Vite config repair. |
| Browser E2E | NOT RERUN / NOT FULLY ACCEPTED | C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout remain open. |

Commands for regression:

```powershell
npx vitest run src/audit/c1c25-necromancer-semantic-source-intake.test.ts src/audit/c1c26-necromancer-source-closure.test.ts src/audit/c1c27-necromancer-source-closure.test.ts
npx vitest run src/audit/c1c20-core-terminal-blockers.test.ts src/audit/c1c21-standard-quest-live-rebaseline.test.ts src/audit/c1c22-boss-encounter-live-inventory.test.ts src/audit/c1c23-hamlet-event-source-intake.test.ts src/audit/c1c24-boss-source-intake.test.ts
```

The acquisition command is separate from generation; only acquisition reads the clock/network. Filtered acquisitions merge existing attempt receipts, preserve earlier separately named retry evidence and regenerate dependent deterministic artifacts afterward. The current source corpus contains only transport responses for new candidates. Retailer PDF retries returned HTTP 200 but timed out with partial bodies (343,795 and 1,048,307 of 27,763,159 bytes); they have response hashes, not authenticated content hashes. Failed downloads and previews never receive original-PDF authentication. The publisher-root HTTP 200 response was inspected and rejected because it contains unrelated gambling content. No anti-bot bypass, login, guessed download IDs, or messaging was used.

Source exhaustion requires all corpus coverage flags plus verified evidence records covering each flag; 403, 404, DNS/TLS/transport/timeout records cannot supply that proof. All currently unexamined original authority leads remain visible. The positive terminal fixture in tests is synthetic and does not describe the real corpus. The real register has zero exhaustion proof IDs and zero terminal categories.

The scope verifier checks all baseline tracked file content, including gameplay, AI, UI, selector, save/replay, tooling, previous phases and other Boss families. Only audit scripts/test, C1C27 data/assets/reports and three package scripts are added. Existing user temporary files were preserved. No runtime implementation was performed.

Result: `C1C27-NECROMANCER-SOURCE-CLOSURE-ACCEPTED` for acquisition/authentication/classification validation. Before/after: 75/75 unresolved inherited usages, nine/nine categories; closed 0, terminal 0, blocked on unretrieved authority 75. Physical/literal 9/9, card-local semantic 3/9, family semantic 0/9, runtime eligible 0/9, Ready 0/9. Next: `NEXT-NECROMANCER-SOURCE-CLOSURE-CONTINUATION` for C1C28. Runtime and terminal consolidation are both denied.
