# C1C32R production Threat domain review

Verdict: **C1C32R-NECROMANCER-RUNTIME-FOUNDATION-NOT-FINALIZED**.
`foundationAccepted=false`, `allCapabilityGatesImplemented=false`, `productionReady=0`.
C1C33 promotion remains prohibited.

## Implemented and verified scope

The shared Quest-result boundary now returns a reserved/in-play physical Boss Room when
the Quest terminates unsuccessfully. Campaign Over also returns it before clearing BattleState.
The receipt keeps campaign/Quest/encounter identity, the pinned rule version, the original
Room card/tile, prior lifecycle, and an unmodified encounter snapshot. Failure is not written
as Boss victory or successful cleanup. The existing campaign transaction helper owns the
idempotence key. Save import checks the receipt, transaction and locked definition.

Production Face the Threat cannot voluntarily leave before Boss victory, and the ABILITY
Boss encounter cannot voluntarily retreat.
The selector's ordinary leave button is disabled across reload. A defeated production
Boss Quest follows the existing failure transaction and Campaign Over without advancing
the campaign Level. Failure settlement uses the saved encounter's deterministic sources.
Legacy encounters without production Room storage retain their historical paths.

Three deterministic command proofs cover RESERVED, IN_PLAY and RETURNED saves at all
three Levels. The IN_PLAY terminal state is an explicit defeat fault injection, used solely
to test physical ownership release. These proofs are **ROOM_TERMINATION_COMMAND_ISOLATION**;
they are not ordinary combat, Captain, Reanimation, victory, or full product acceptance.

## Local source review

The required local corpus was accessible and recursively searched. Rulebook and printed
Room, Monster and Boss PDFs were read locally. File paths, names, SHA256 hashes, pages,
locations and component identities are recorded in
`docs/data/complete-edition/c1c32r-local-official-source-manifest.json`.
No PDFs or raw TTS corpus were added. No external sources were acquired.

The local printed Captain remains Large with Life 33. The Level II Threat calls for the
Captain as the first Monster in the first Battle; Level III Reanimation remains THREAT-side.
The Graveyard text confirms a Virtue for the next Quest and death at the next Stress 10.
No fee, healing value, extra duration or bonus was invented. The local rulebook is a different
binary from the locked repository rulebook; it does not replace any historical source binding.
No conflicting frozen component value was applied and no frozen ruling was changed.

## Required executable dependency review

**PRODUCTION_THREAT_DOMAIN_BRIDGE remains BLOCKED.** The ordinary engine still builds
prototype encounters. The production Bone adapter resolves only the four accepted Bone
dependencies. This does not define the ordinary location's physical Monster deck, its
non-Bone combat definitions, or ordinary Room card draws, exclusions, tile geometry,
Stance starting Areas and printed Room effects. Their printed sources exist locally; their
full executable adapters have not been implemented in this change. A Bone-only draw pool
or the Room 10 board would be an invented substitute. The guarded-Room entry guard remains.

**Large full-Area movement remains SOURCE_UNRESOLVED at the executable boundary.** Printed
p24 permits a Large character to end in a fully occupied Area and instructs displacement
of one other character, excluding its Target. The frozen model counts a Large character
as two slots. A capacity-4 Area with four normal occupants, followed by Large entry and
one normal displacement, has five occupied slots. The accepted contracts do not represent
that overcapacity exception or prescribe a second displacement. No new PROJECT_RULING,
Captain-specific hack, or silent change to the frozen capacity model was introduced.
This counterexample is a contract review finding, not a claim that the printed rule is absent.

**Preparation Day → Graveyard remains BLOCKED.** The selected Hero persists already, but
there is no production Graveyard building transaction or next-Quest Virtue lifecycle.
The frozen Level II may-use / Level III cannot-use distinction remains intact.

## Acceptance evidence

Scenario C remains NOT_PROVEN with null combat hashes. The new storage hashes are actual
command/save/reload outputs and do not replace Scenario C. Captain injection, crowded
movement, THREAT Reanimation and the requested browser route are not certified.
The new browser gate fails unless the normal selector and actual room clicks reach a
source-bound guarded THREAT Battle; detecting the blocker cannot produce a passing result.

`verify:complete-edition-c1c32r` verifies truthful evidence and deterministic storage replay.
It explicitly reports NOT_FINALIZED. Its `--require-accepted` mode rejects promotion.
An evidence-integrity PASS is not foundation acceptance.

Next work remains **C1C32R executable dependency / contract closure**, followed by all the
requested normal-path proofs. C1C33 is not authorized by this partial engineering result.
