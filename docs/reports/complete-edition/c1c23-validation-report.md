# C1C23 validation record

Validated on 2026-09-28 against C1C22 baseline `a6f29f9543f017c454724bbeade445c94d0c63f2`.

- Original front/back acquisition and repeat importer: passed. Both receipts retain the original acquisition timestamps; repeat import regenerated identical crop bytes without fetching replacement sources.
- C1C23 verifier: passed. Four audit suites (C1C20, C1C21, C1C22 and C1C23), 64 tests passed, including 18 C1C23 tests. All 32 front/back PNGs regenerate from the locked sheet cells. Adversarial checks reject foreign evidence, wrong cell bounds, reused crop paths, source-gap erasure, false Ready claims and ROI/decision drift.
- Locked rulebook re-extraction with `extract-c1c23-rulebook.py --verify`: passed. PDF SHA-256 remains the C1A S4 hash.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite reported a large-chunk warning. No bundling/runtime changes were made in this audit.
- Scope verifier preserves baseline gameplay and upstream tracked C1C20/C1C21/C1C22 artifacts; no source blockers were converted to implemented.

The first provenance test rerun, while the build was running, exceeded Vitest's default five-second timeout. Only this test's budget was increased to 20 seconds because it re-encodes all 32 crops; the successful rerun took about 2.8 seconds. The full byte checks and adversarial assertions were retained. Initial local type and Windows UTF-8/newline handling errors were corrected before acceptance.

C1C21's historical C1C13/12/11 reload exhaustion and C1C3 selector timeout remain unaccepted and open. Complete Edition browser E2E was not rerun; this record does not claim an entire Complete Edition E2E pass.
