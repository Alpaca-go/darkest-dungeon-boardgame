# C1C32 Necromancer runtime foundation engineering review

Verdict: **C1C32-NECROMANCER-RUNTIME-FOUNDATION-NOT-FINALIZED**.
Decision: **NECROMANCER_RUNTIME_ENGINEERING_BLOCKER_REVIEW**.
`allCapabilityGatesImplemented = false`; foundation accepted = false; production ready = 0.

Baseline: `e0158c0af8c1e84a0c861f74ca67c436b6f5ae67`, accepted C1C31R.
Branch: `codex/phase-11a4-c1c32-necromancer-runtime-foundation-finalization`.

## Implemented engineering

The v2 adapter materializes all four frozen C1C31 Bone definitions (Life 6/7/15/33), including the Captain Stun immunity and Ground Pound Stun 2t corrections. Captain remains outside the ordinary summon pool. v1 retains its historical unbound definition gate. No prototype or synthetic registry supplies production Bone definitions.

Boss and Bone attacks consume the frozen Hero Dodge resolver, including all 24 class/level pairs and their authority/ruling metadata. An encounter pins its version and bindings. Explicit migration is exposed before selection and rejected once a Battle or Threat checkpoint exists. Import validates saved bindings against that resolver.

The generic Monster pipeline consumes printed stance selection, seeded split selection, target priority, Area movement, range, self/target effects and staged incoming reactions. A Boss Skill shares one roll while each Hero has a separate reaction cursor. Saves retain resolved/remaining Heroes, modifiers, frozen source Skill, causal event and rule version. Continuing Hero 2 cannot recommit Hero 1 or repeat the summon. Captain Large movement is still an affected promotion limit, described below.

The normal selector uses the existing locked printed Face the Threat composition and reserves one encounter/checkpoint and campaign-owned Room 10 card/tile reference. The Room command consumes that saved identity and RNG rather than binding a fresh encounter. Storage validates ownership, card/tile and lifecycle; victory uses existing campaign transactions and marks the storage returned with cleanup provenance. General Room deck integration remains unaccepted.

Stun, Debuff and Shuffle integration uses the generic resistance resolver. No scattered Necromancer/Captain condition special cases were introduced.

## Remaining engineering boundary

The remaining workstream is `PRODUCTION_THREAT_DOMAIN_BRIDGE`. This is an umbrella engineering boundary with the following concrete missing dependencies; it must not be mistaken for one completed bridge or an additional Dodge/stance rule review:

1. The ordinary Dungeon Threat Battle has no source-bound production encounter command. Existing ordinary encounter generation uses prototype combat definitions. Guarded Rooms with the new production checkpoint therefore fail closed with `necromancer-threat-domain-bridge-unbound`, before RNG or campaign mutation, and the exploration UI explains the block.
2. Level II Captain injection, occupied Large movement and the THREAT-side death/Reanimation lifecycle require that command. The generic executor currently considers free-capacity movement destinations; it does not close the printed Large displacement exception. Scenario C is **NOT_PROVEN** with null hashes. Reanimation was not moved to ABILITY to manufacture a passing proof.
3. Preparation Day records the lowest-roll candidates, choice event and forced Hero and preserves them through save/reload. The existing Hamlet domain has no Graveyard command/campaign transaction that consumes this result. The Boss runtime does not substitute a raw campaign/UI edit or invent a fee/effect.
4. Full normal-path replay, Room lifecycle and browser acceptance depend on those integrations. Aborted/failed quest storage lifecycle and general Room deck integration are not accepted by the isolated Boss-victory proof.

Affected promotion stops here. C1C33 is not promoted. Frozen rule semantics are not silently changed to work around missing executable domain dependencies.

## Evidence limits

Nine new JSON artifacts distinguish component binding from production acceptance. A/B/D/E use real definitions, campaign commands, production snapshots and deterministic continuation, with explicit actor/initiative controls for combat isolation. B asserts an actual incoming reaction exists before saving; D checks post-resolution save and cleanup idempotence. These are **REAL_COMPONENT_COMMAND_INTEGRATION_ISOLATION**, not complete normal-path production proofs. E records explicit migration provenance. Synthetic combat definition dependencies are zero, but that fact alone does not grant acceptance.

The browser spec clicks explicit migration and the normal selector, attempts the actual dungeon route and reports its engineering boundary as **PRODUCT_FAILURE**. Its second scoped case exercises a saved lowest-roll PendingChoice through UI → Store → runtime → autosave/reload. Preparation rolls are supplied in that scoped case; it does not prove a Hamlet transaction or full reaction/combat route.

The historical C1C30/C1C31/C1C31R generators describe their accepted runtime snapshots for explicitly superseded files. C1C30 pins only its old foundation implementation; C1C31/C1C31R pin the three named runtime files and the changed historical generator they reference. Their canonical JSON, source and ruling hashes remain strict. The accepted mathematical review references stay pinned to the accepted pre-C1C32 commit. C1C30's original checkpoint and resumed-state hashes continue to be checked against current v1 execution: a new explicit false field was removed from v1 resumes to retain those hashes. The C1C32 verifier separately freezes all C1C20–31R JSON, source policy, rulebook extract and C1C28 contract adapter against the accepted baseline and verifies printed source hashes.

## Rule policy

`RULEBOOK_ONLY_SOURCE_POLICY_V1` is unchanged. No external acquisition, new ruling, Dodge value change, stance reinterpretation, C1C25–28 canonical edit or frozen census change occurred. Missing canonical rules remain `SOURCE_UNRESOLVED`; this review does not declare any missing Hamlet behavior official. Existing v1 and v2 rule sets remain byte-identical after newline normalization.

Validation outcomes are recorded in `c1c32-validation-report.md`. The known Windows CSS path-length build failure remains a separate tooling workstream.
