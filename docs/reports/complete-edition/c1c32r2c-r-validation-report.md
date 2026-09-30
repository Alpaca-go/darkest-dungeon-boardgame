# C1C32R2C-R validation

Focused: 85/85 PASS; no skips.

Full regression: 2595/2597 PASS; 2 unchanged historical C1C27/C1C28 scope guards; unexpectedFailures=0. Their source blobs match baseline 182b9f351e6115daa678fb36dc2fa6196f15e6cf.

Required prior phase tests/verifiers and the final isolated foundation E2E all passed. Earlier browser attempts overlapped normalization or full regression and were rerun; all attempts remain recorded. The baseline raw report included an untracked debug room9 topology test absent from its Git tree. Initial audit-script TypeScript diagnostics were fixed before the final typecheck/build.

Build: BUILD_ACCEPTANCE_UNVERIFIED. Known Windows repeated CSS hash/path ENOENT after Vite transformation. Build acceptance remains unverified; bundler infrastructure was not changed.

Machine evidence: c1c32r2c-r-regression-results.json, c1c32r2c-r-test-results.json, c1c32r2c-r-full-test-classification.json, c1c32r2c-r-runtime-dependency-matrix.json. The audit verifier checks current runtime/test hashes and immutable baseline blobs.

Final audit and verifier: PASS (`npm run audit:complete-edition-c1c32r2c-r`, `npm run verify:complete-edition-c1c32r2c-r`). See c1c32r2c-r-audit-results.json. Unrelated historical audit timestamp changes were restored; the pre-existing .gitignore edit was preserved.
