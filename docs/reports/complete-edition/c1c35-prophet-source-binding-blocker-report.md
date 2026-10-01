# C1C35 Prophet official binding: blocked foundation

Baseline: `051c2c400d391543f5c436cbaa141a54bdf19ac1`.
Branch: `codex/phase-11a4-c1c35-prophet-official-binding-production-foundation`.
Predecessor: `C1C34-SUCCESSOR-BINDING-v1`.
Necromancer freeze: `e1fcfac0692eb91c5710552ac93e3bacb25f0240`.

Outcome: **PROPHET_PRODUCTION_FOUNDATION_BLOCKED**.
Primary stop: **PROPHET_FOUNDATION_BLOCKED_ON_SPATIAL_SOURCE**.
Additional stop: **PROPHET_FOUNDATION_BLOCKED_ON_SEMANTIC_SOURCE**.
Gate A fails; Gate B was not started. No production gameplay, selector, save schema,
Threat hook, definition or browser route is changed. C1C36 full-path work is not authorized
by this result. A passing audit verifies correct blocking, not playable acceptance.

## Locked corpus review

The existing C1C32R2 recursive local official manifest was audited, including the actual
hash-matched Corebox Tile front/back PDFs, Room front PDF and Corebox rulebook.
No new external source, community clarification or transport script was acquired.
Tile front **PDF page 6** depicts printed **Ruins Tile 11**; PDF page 14 depicts a
different biome's printed Tile 11 and must not be substituted. Room front page 11
depicts the corresponding Prophet Room. The front/back PDFs each contain 14 pages;
their print-slot page number is not their printed Room number.

`c1c35-locked-page-review.json` binds the new local rendered page extracts to the
pre-existing PDF identity, hash and page. The verifier pins the review receipt hash,
checks every extract's bytes and original manifest entry, and checks predecessor inputs
against the exact baseline commit. The local PDFs remain in their existing location;
portable review PNGs are committed under `source-assets/c1c35`.

## Spatial result

Eight printed regions were reviewed independently of Phase 9C. Area IDs below are
project labels for these observed regions, not prototype geometry. They use the
existing `ruins-tile-11` naming convention.

| Region | Printed d10 results | Printed capacity dots |
| --- | --- | --- |
| NW | 1, 2 | 4 |
| N | 3 | 3 |
| NE | 4 | 3 |
| W | 5 | 3 |
| C | 6 | absent; SOURCE_UNRESOLVED |
| E | 7, 8 | 4 |
| SW | 9 | 3 |
| S | 10 | 3 |

Tile 11 has recoverable identity, region identities, shared boundaries, Hero Stance
positions, red Aggressive Monster placement and Pew eligibility. The black inset and
black lower-right region are not invented playable Areas. Each reviewed geometry
field carries the locked Tile page hash/reference. Room 11 provides a second printed
image of the same arrangement.

**Blocking field: `areas.ruins-tile-11:C.capacity`.** The red Aggressive start position
and printed d10 6 are in a region without visible capacity dots. Locked rulebook p18
identifies the occupancy number/icon and movement constraints, but does not give a
numeric default for an unmarked region. Neither the Tile nor the smaller Room artwork
provides that number. The existing hash-bound rulebook extraction was searched for
capacity, occupancy and missing-space defaults; no default binding was recovered.

No value of zero, four, infinity, or a prototype capacity is supplied. The user has not
defined a non-canonical digital board representation; this phase does not invent one.
The aggregate Tile contract therefore remains `SOURCE_UNRESOLVED` and non-executable.
This is an executable-contract gap despite recovery of the printed Tile image.

The d10 map is independently closed as printed evidence, with exactly ten explicit
entries. Its `executable` flag remains false because it cannot bypass the incomplete
Tile contract. Verification rejects missing/malformed/duplicate results, invalid or
prototype Areas, altered map representations and topology source/page mismatch.

## Semantics and project rulings

Reviewed rulebook pages 19-21 and 24 bind Crowded, exact range, Hero target icons,
hit-only target effects, Stress, Stun, Blight, immunity negation, Large occupancy and
critical/damage interpretation. The numeric Level I/II/III values continue to come from
their independent C1C34 printed observations. Unholy remains a printed classification.
These are source contracts with candidate shared primitives, not runtime integration.

**Blocking field: `Rubble special target.targetScope`.** The Battle cards print Special
without a Hero count or range. Pages 38-39 require attacks on Pew Areas and a separate
roll per Pew, including multiple attacks on the same Area. They do not explicitly state
the number of Heroes affected per Pew. The contract retains that field as
`SOURCE_UNRESOLVED`; an all-Hero interpretation is not silently treated as official.
An explicit additional Prophet ruling could close this semantic gap before execution.

`C1C35-PROPHET-DIGITAL-DEFAULT-v1` contains two distinct non-canonical, contract-only
rulings. They do not inherit or alter C1C28:

- Crowded ties use persisted PendingChoice candidates and occupancy snapshots,
  explicit player selection, stable display ordering, no RNG, and forged/stale selection rejection.
- Pew ordering uses explicit physical-copy ordinals 1-4, independent same-Area attacks,
  shared damage/death/condition windows, persisted pending attack phases and cursor,
  causal transaction journals, stored rolls, resume rules, round ownership reset and victory cleanup.

These rulings have no production executor in C1C35. Save/reload equivalence, physical
ownership, Threat lifecycle and three-ordinal production behavior are deferred Gate B
acceptance obligations, not claimed passing tests.

## C1C34 field accounting

All **22** required fields are retained: 15 level-specific Battle/stats/Skill Table/Rubble/
Threat rows, plus Room, Tile, d10 map, Wooden Pews, Crowded tie, Pew attack order/save,
and target/effect glyph binding. Of the five predecessor blockers:

| Previous blocker | C1C35 result |
| --- | --- |
| tile | SOURCE_UNRESOLVED: central Area capacity |
| d10-area-mapping | OFFICIAL_SOURCE: exact locked printed mapping; execution disabled |
| crowded-area-tie | PROJECT_RULING: Prophet v1, non-canonical, contract only |
| pew-attack-order-and-save | PROJECT_RULING: Prophet v1, non-canonical, contract only |
| target-effect-glyph-binding | SOURCE_UNRESOLVED: Rubble target scope |

All ten requested phase artifacts are deterministic. Production definitions explicitly
contain an empty production list and separate source-review candidates. Foundation/save
proof artifacts explicitly record no implementation, replay proof or browser acceptance.
Tests cover source determinism, required-field coverage, map adversaries, contract
tampering, cross-level substitution, false acceptance and mandatory-stop enforcement.
Runtime-only tests are deferred in the capability matrix because Gate B is prohibited.

## Successor conditions

1. Supply an existing allowed official capacity binding, or explicitly define and authorize
   a versioned non-canonical digital board representation for the unresolved Area.
2. Close Rubble target scope with allowed official evidence or an explicit Prophet ruling.
3. Re-run Gate A; only a complete contract permits production foundation implementation.
4. After foundation acceptance, C1C36 can perform Level I-III real-player save/replay paths.

Validation results are recorded separately in `c1c35-validation/results.json` and the
validation report. The existing release-gate steps remain intact; C1C35 verification is
added after C1C34. A remote workflow result must match the committed C1C35 HEAD before
it can be described as green.
