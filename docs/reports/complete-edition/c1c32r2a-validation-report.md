# C1C32R2A validation report

Outcome: **evidence integrity passes; production dependency acceptance fails**. The definitive verdict is `C1C32R2A-RUINS-EXECUTABLE-DEPENDENCIES-NOT-CLOSED`.

| Check | Outcome | Evidence / limit |
|---|---|---|
| `npm run typecheck` | PASS | TypeScript successor code and existing modules typecheck. |
| `npm run test:necromancer-foundation` | PASS | 72 tests. |
| `npm run test:necromancer-finalization` | PASS | 9 tests. |
| `npm run test:necromancer-threat-bridge` | PASS | 16 tests. |
| `npm run test:necromancer-threat-dependencies` | PASS | 22 tests. |
| `npm run verify:complete-edition-c1c29` through `c1c32r2` | PASS | All seven historical verification commands passed. |
| `npm run audit:complete-edition-c1c32r2a` | PASS | Reproduces successor evidence and explicit blocked decision. |
| `npm run verify:complete-edition-c1c32r2a` | PASS (integrity only) | Checks official local PDF hashes, frozen files, deterministic draw hashes, candidate status and blocked promotion. `--require-accepted` must reject. |
| `npm run test:ruins-executable-dependencies` | PASS | 16 tests covering source census/stance, Bone successor, draw ownership, save/reload, unresolved Large replacement, scoped Preparation Day decisions and save tampering. |
| `npx vitest run --maxWorkers=2 --minWorkers=2` | PASS within allowed exceptions | 157/159 files passed; 2506/2508 tests passed. The only failures are the two allowed historical C1C27/C1C28 scope guards. Unexpected failures: 0. |
| Browser tests | FAIL | Initial 4-test Playwright run: two scoped Preparation Day cases passed; existing C1C29 and Level II use-effect case timed out on page reload. A 360-second retry reproduced reload timeouts for the first two cases and was stopped before rerunning the two passing cases. This does not establish full UI acceptance. |
| `npm run build` | `BUILD_ACCEPTANCE_UNVERIFIED` | TypeScript and Vite module transformation passed; output failed at known Windows repeated CSS hash/path `ENOENT` write boundary. Classified `KNOWN_TOOLING_BLOCKER`. |

An earlier full run had one additional C1C23 failure from the Hamlet source’s working-tree line ending. The frozen C1C23 evidence requires CRLF SHA256 `1808d25ec4c55061791f4861bef7b8f617d8007084e939326910cbc1f96551ca`, while the baseline Git blob stores LF SHA256 `e4930fdc2a79a76751447f17cc274bfd4614142287e2b544ed76858641736556`. The source was restored without content changes. A single-file `.gitattributes` rule now checks out CRLF deterministically; the indexed Hamlet blob and the frozen artifact are unchanged. C1C23’s own 18 tests and the final full run pass this check.

The two browser timeouts are at navigation/reload waits. The scoped Level II decline and Level III guard-only flows did pass in the initial browser run, but the use-effect path did not. The browser fixture cancels a Boss reservation through a domain command that the normal Boss Quest UI deliberately does not expose; even fully passing scoped browser cases would not certify the requested normal product journey.

The official source corpus, historical save/replay hashes and C1C20–C1C32 files are unchanged. No raw official PDF, temporary rendered image, TTS corpus, synthetic Monster definition or fabricated Scenario C hash is included. The exact eight remaining executable dependency blockers are listed in `c1c32r2a-runtime-dependency-matrix.json` and the closure report. R3 and C1C33 remain unauthorized.
