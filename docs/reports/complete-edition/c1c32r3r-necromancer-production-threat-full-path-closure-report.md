# Phase 11A.4-C1C32R3R — Necromancer production Threat integration

Baseline: `fd2ba4d12ecf16b24ed0c5d502eb7ee566893c24`.

The human clarification supersedes the earlier requirement to share a Quest identity between Preparation Day and Face the Threat. The active Threat belongs to the Act. Every Standard Quest and Face the Threat has its own checkpoint, `questRunId`, and `encounterId`.

## Product paths

1. Standard Quest under the active Necromancer Threat → completed return → Hamlet → Preparation Day / Graveyard (Levels II and III). The settled Standard checkpoint is archived independently of Boss encounter history. Level I still blocks Graveyard. The next Quest binds a new checkpoint to the same active Threat.
2. Face the Threat → guarded ordinary Room → source Ruins v6 battle → settled checkpoint → Boss Room 10 → THREAT to ABILITY → Boss victory → formal campaign transaction deactivates the Threat. Leaving an unfinished Face the Threat remains forbidden.

The ordinary Battle contains a schema-2 Ruins context and an encounter cross-link. The only mutable Threat state is `campaign.bossEncounterCheckpoint`; the ordinary Battle does not contain a duplicate Boss encounter. Damage, initiative, seeded sources, spatial movement, physical inventory and campaign transactions reuse the existing executors.

## Death and inventory boundaries

An atomic death event preserves the complete dead instance before removing it from the active spatial and initiative ledgers. Retired snapshots retain unit identity, definition, physical copy, generation, predecessor, original corresponding Area and causal death event. Level III freezes its first eligible window, persists simultaneous candidates, and constructs a fresh unit from the real source definition. It retains the same card and finite Bone figure. Remaining initiative is shuffled using checkpoint RNG. Historical actor references remain valid through the retired-instance ledger.

Level II consumes its first-battle flag before selecting the actual available Captain card and finite figure. The Captain is the first initial draw, uses two slots, and consumes no extra RNG. Unavailable/unplaceable Captain suppression does not draw a substitute. Level I uses the shared non-Unholy classifier and permanently excludes every physical copy of each appeared non-Unholy definition after cards and figures return. The settlement transaction and per-battle Reanimation reset are idempotent.

Every new Quest creates its own seeded draw state after previous physical encounters settle. Standard archives retain the old draw history. Act-wide permanent exclusions are copied to the new checkpoint and applied to all copies in the new deck. A formal Stagecoach replacement records the new Hero's pinned Dodge binding without resetting encounter events or RNG.

## Source and historical policy

No new rulebook, component, FAQ, community or videogame source was acquired. The existing locked Core rulebook page 14 establishes that normal Standard Quest return is not Quest failure, while page 29 determines XP. This is applied only to the explicitly selected production Necromancer route and source Standard Quests whose canonical minimum goal is null; XP still comes from actual completed objectives. The frozen Quest census and adapters remain unchanged.

C1C28 rules, historical schema-1 saves, v4/v5 semantics, official evidence and printed-component censuses remain frozen. New ordinary contexts opt into schema 2; historical active Battles are not silently upgraded. Historical current-runtime fingerprints are checked separately from historical artifact integrity. Expected successor SHA divergence is recorded without changing an old verifier or rewriting old evidence.

## Proof scope

The Level I browser route starts a new Complete Edition campaign using visible party, loadout, v2 and v6 controls. It earns 2/2 Standard Quest progression through real player commands and reaches Boss victory without localStorage fixture injection. Level II/III supplementary browser cases supply only the campaign Act prerequisite; they do not inject a Quest, checkpoint, Battle, monster, draw, death or choice. All subsequent mutations use visible player controls. Scenario C must observe a real source monster killed by player skills, a fresh instance, save/reload continuity, the same physical copy/figure and non-null hashes.

The executable acceptance gate is `npm run verify:complete-edition-c1c32r3r`. The final verdict is owned by the versioned `c1c32r3r-next-workstream-decision.json` artifact and is generated only after browser and regression checks succeed.

Final verdict: **C1C32R3-NECROMANCER-PRODUCTION-THREAT-FULL-PATH-ACCEPTED**. Decision: **NECROMANCER_RUNTIME_INTEGRATION_COMPLETE**. C1C33 is authorized as the next workstream; it is not started here.
