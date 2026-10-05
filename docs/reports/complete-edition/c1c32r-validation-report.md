# C1C32R validation

Verdict: **C1C32R-NECROMANCER-RUNTIME-FOUNDATION-NOT-FINALIZED**.
The following validation does not authorize C1C33.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tmp/c1c32r-typecheck.log` |
| `test:necromancer-foundation` | 72/72 PASS | `tmp/c1c32r-foundation.log` |
| `test:necromancer-finalization` | 9/9 PASS | `tmp/c1c32r-finalization.log` |
| `test:necromancer-threat-bridge` | 16/16 PASS | `tmp/c1c32r-unit.log`; Room ownership, failure transactions, import tampering and pending-choice archival only |
| C1C29 / C1C30 / C1C31 / C1C31R / C1C32 verifiers | PASS | `tmp/c1c32r-verify-c1c29.log` through `tmp/c1c32r-verify-c1c32.log`; historical hashes unchanged |
| C1C32R audit / verifier | Evidence integrity PASS | Actual storage replay/hash reproduction and local PDF hashes; foundation acceptance remains false |
| C1C32R strict acceptance mode | REJECTED | `--require-accepted`; ordinary Threat, Large contract and Graveyard gates not satisfied |
| Browser ordinary Threat gate | PRODUCT_FAILURE | `tmp/c1c32r-browser.log`; real selector/migration/dungeon clicks did not start a guarded source-bound THREAT Battle |
| Browser leave guard/reload | PASS, scoped | `tmp/c1c32r-browser-scoped.log`; no combat acceptance claim |
| Scenario C | NOT_PROVEN | Required combat hashes remain null; no fixture substitution |
| Build | BUILD_ACCEPTANCE_UNVERIFIED / KNOWN_TOOLING_BLOCKER | tsc PASS, 15,051 modules transformed, then existing repeated CSS hash/path ENOENT; `tmp/c1c32r-build.log` |
| Final full Vitest | 2468 PASS; 2 expected historical failures; 157 files | `tmp/c1c32r-full-vitest-stable.log`; 497.31 seconds |
| Unexpected Vitest failures | **0** | Only unchanged C1C27/C1C28 historical scope conflicts remain; tests were not suppressed |
| `git diff --check` | PASS | Whitespace checked after preserving original file line endings |

The initial full run had 2467 passes and three failures: the two unchanged C1C27/C1C28
historical scope guards and CLI-01's 60-second child-process timeout. The first browser
leave/reload case also timed out under competing heavy processes. Build and browser work
then completed, and the scoped browser rerun passed with a 600-second test budget.
The final full Vitest run is isolated from build/browser work. CLI-01 passed in 11.004 seconds.
The two remaining failures are the accepted `EXPECTED_HISTORICAL_SCOPE_CONFLICT` guards
which reject later-phase gameplay/AGENTS changes against the old source-only scope.
Consequently the full command still exits 1; its failures were not hidden or reclassified as passes.

The newly introduced defeat-state control is limited to terminal ownership testing. It does
not damage Monsters, produce Boss victory or certify ordinary Threat combat. Production
acceptance has not been relaxed, and the new strict browser gate intentionally reports a
failure while the actual product dependency remains unavailable.

The local source manifest records six PDFs from the required corpus without committing
the PDFs. C1C28 rulings, C1C31 v2/Hero Dodge bindings, Bone stance tables and historical
proof JSON were not regenerated or changed. Test-generated timestamps in core-campaign
audit manifests are restored only after confirming that no other content changed.
