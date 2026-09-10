# Antha Complete Edition community-reference snapshot

This is a derived, repository-local provenance snapshot for the audited Tabletop
Simulator workshop `3657612854`.  It is reference data only: it never enters an
official pool and does not establish official retail verification or runtime
readiness.

The original TTS JSON and Core Rulebook PDF are intentionally not vendored.
Their hashes, source references, and the exact field coverage contract are in
the adjacent JSON files.  The typed representation lives in
`src/data/darkest-dungeon/community-reference`.

Five values are deliberately unresolved: `pitExitRule`, Absolute Nothingness
`stance`, Gestating Heart `lethalWoundTimingRuling`, Come Unto Your Maker
`definition`, and monster-deck `drawPolicy`.  No default or prototype fallback
is permitted for them.
