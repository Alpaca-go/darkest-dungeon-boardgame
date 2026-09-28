# C1C28 Necromancer Terminal Blockers and Digital Rulings

Baseline aaedb2d30b1e5d90bf8d41e7dbced9f93288f73a; C1C28-NECROMANCER-TERMINAL-BLOCKER-AND-DIGITAL-RULING-CONTRACT-ACCEPTED. NEXT-NECROMANCER-RUNTIME-FOUNDATION-SELECTED. No gameplay runtime is implemented in this phase.

## Project-scoped source freeze

The explicit C1C28 user decision adopts the premise that no additional authoritative material beyond the rulebook and official physical components can be acquired. Under that development policy, all 75 usages in nine categories are frozen as SOURCE_EXHAUSTED_STILL_UNRESOLVED **within the project's currently available corpus**. This is not proof of worldwide exhaustion, FAQ nonexistence or authenticated permanent unavailability. C1C27 recorded pending acquisition leads and did not prove global exhaustion; its files, statuses and verifier remain unchanged. The user-directed C1C28 development gate supersedes waiting for those leads, without changing historical facts. Future acquired authority can reopen audit. No new network retries were performed.

| Category | Inherited usages | Canonical status | Digital ruling IDs | Risk |
| --- | ---: | --- | --- | --- |
| BONE_IDENTITY_UNRESOLVED | 3 | SOURCE_EXHAUSTED_STILL_UNRESOLVED | NECRO_CAPTAIN_PROJECT_COMPONENT_BINDING | HIGH_GAMEPLAY_IMPACT |
| CLEANUP_DESTINATION_UNRESOLVED | 2 | SOURCE_EXHAUSTED_STILL_UNRESOLVED | NECRO_BOSS_TRIO_ENCOUNTER_STORAGE_RESET | LOW_RISK_DETERMINISM |
| EFFECT_ORDER_UNRESOLVED | 1 | SOURCE_EXHAUSTED_STILL_UNRESOLVED | NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER, NECRO_SIMULTANEOUS_FIRST_DEATH_PLAYER_CHOICE | HIGH_GAMEPLAY_IMPACT |
| LOWEST_ROLL_HERO_TIE_UNRESOLVED | 13 | SOURCE_EXHAUSTED_STILL_UNRESOLVED | NECRO_LOWEST_ROLL_TIE_PLAYER_CHOICE | LOW_RISK_DETERMINISM |
| ROOM_CAPACITY_INTERACTION_UNRESOLVED | 3 | SOURCE_EXHAUSTED_STILL_UNRESOLVED | NECRO_ROOM_CAPACITY_DISPLACEMENT_OR_SUPPRESS | MEDIUM_RULE_INTERPRETATION |
| SOURCE_PRECEDENCE_UNRESOLVED | 15 | SOURCE_EXHAUSTED_STILL_UNRESOLVED | NECRO_RUBBLE_REFERS_TO_PRINTED_RABBLE | HIGH_GAMEPLAY_IMPACT |
| SUMMON_COPY_POLICY_UNRESOLVED | 28 | SOURCE_EXHAUSTED_STILL_UNRESOLVED | NECRO_FINITE_BATTLE_SUPPLY_NO_DEATH_REFUND | HIGH_GAMEPLAY_IMPACT |
| SUMMON_COUNT_UNRESOLVED | 6 | SOURCE_EXHAUSTED_STILL_UNRESOLVED | NECRO_SUMMON_COUNT_LEVEL_1_ONCE_PER_ACTIVATION, NECRO_SUMMON_COUNT_LEVEL_2_ONCE_PER_ACTIVATION, NECRO_SUMMON_COUNT_LEVEL_3_ONCE_PER_ACTIVATION | HIGH_GAMEPLAY_IMPACT |
| TARGET_TIE_UNRESOLVED | 4 | SOURCE_EXHAUSTED_STILL_UNRESOLVED | NECRO_CROWDED_AREA_TIE_PLAYER_CHOICE | LOW_RISK_DETERMINISM |

Before: 75 authority-blocked usages, 0 closed, 0 terminal. After: 75 project-scoped terminal source usages, 0 officially closed, 75 covered by project ruling. All 45 C1C26 refined fields are separately covered and are not added to the 75 baseline count.

## Sixteen required answers

| Question | Answer |
| --- | --- |
| 1. Which rules are OFFICIAL_SOURCE? | Printed stats, triggers, Self/damage/Target ordering and successful-hit gating; Threat flip/expiry; setup/Room layout; first-empty Stance and full-Stance suppression; generic displacement; death threshold/removal; generic new-spawn initiative; Boss defeat/progression and Room/Monster cleanup. The field catalogue cites exact canonical paths and evidence. |
| 2. Which rules are source terminal? | All nine categories above, under the explicit available-corpus project freeze; no official rule becomes resolved. |
| 3. Does every unresolved have a PROJECT_RULING? | YES. 75/75 exact baseline usages plus all refined fields map to ruling IDs; 12 rulings, canonical=false and futureOverrideAllowed=true. |
| 4. Lowest-roll Hero tie? | Player chooses one tied lowest-roll Hero. Await input, validate candidates, record choice; no extra RNG or array-first selection. II may use Graveyard, III may not, unchanged. |
| 5. Crowded Area tie? | Player chooses among equal-highest-occupancy official Target candidates, then preserve official range/movement handling. Character targeting priority remains separate. |
| 6. Summon count each Level? | I/II/III each execute one printed instruction per Skill activation if at least one Hero hit succeeds. All miss: zero. Full Stances: suppress. Hit count never multiplies summon count. |
| 7. Supply exhaustion/reset? | Project finite battle limits: Rabble 3, Soldier 3, Spearman 3; Captain 1 for Level II Dungeon Threat only. Active physical copies occupy tokens, casualties remain spent this Battle, exhaustion suppresses, failed placement spends nothing. Battle end resets non-permanently-removed tokens; campaign removal remains. Component quantities themselves are observations, not canonical limits. |
| 8. Rubble maps to Rabble? | YES, solely through NECRO_RUBBLE_REFERS_TO_PRINTED_RABBLE; original Rubble/Rabble literals and SOURCE_CONFLICT persist. Captain narrow/full association is PROJECT_COMPONENT_BINDING for one Large unit, never a canonical component merge or ordinary Skill summon. |
| 9. Reanimation complete order? | Snapshot atomic deaths and pre-compaction corresponding Areas; resolve mandatory dying-instance effects; remove old miniature/card/initiative; choose and consume first eligible non-large death; check corresponding Area; respawn immediately as fresh full-Life instance; shuffle one new initiative; resume suspended effects. Old activation/wounds/conditions do not carry. Unordered dying effects require explicit player input. Nested death groups cannot steal the locked first window. |
| 10. Simultaneous first death? | Player chooses among captured eligible deaths. Choice is recorded and validated; one-per-Battle window is consumed even if no-space skips respawn. |
| 11. Full Room Area fallback? | Retain p31 miniature displacement; choose an eligible Hero, or a Monster if no Hero, with a feasible destination. Nearest destination uses source-bound adjacency distance and enough capacity for unit size; ties require player choice. No replacement or Stance eviction. |
| 12. No legal placement? | Ordinary summon suppresses atomically without spending supply or initiative. Reanimation separately follows its printed corresponding-Area no-space ignore, with no displacement. |
| 13. Boss cards after Battle? | Identity, Threat/Ability and Battle go to Boss encounter storage. Threat/Ability resets to Threat; clear markers/instance state/pending choices/initiative. Preserve official Room/Monster return, campaign progression and permanent removal; reset digital supply ledger. |
| 14. Canonical semantic complete? | 0/9; canonical source gating persists. |
| 15. Executable semantic complete? | 9/9 for the explicit family contract graph; runtime/UI and production proof are still pending. |
| 16. C1C29 Runtime Foundation allowed? | YES: C1C29 Necromancer Runtime Foundation. Eligibility is for foundation implementation, not Production Ready acceptance. |

## Field provenance, risk and reachability

OFFICIAL_SOURCE and PROJECT_RULING bindings are separate. Bound composite values are decomposed so a missing policy cannot hide inside an official parent. Each digital field cites an immutable canonical path and ruling ID. The runtime catalogue contains 1415 bindings; all reachable values are non-null or explicit pending-choice branches. Graph roots cover nine physical cards and family setup/lifecycle, including Hamlet/Dungeon Threat effects and external Bone dependencies. No hidden engine iteration order is allowed. Independent quest/rest reward-return runtime is outside this Boss foundation scope and remains gated.

Summon count/supply, identity interpretation/Captain binding and Reanimation/action economy are HIGH_GAMEPLAY_IMPACT; placement is MEDIUM_RULE_INTERPRETATION; selection/reset are LOW_RISK_DETERMINISM. Dedicated audit scenarios test contract obligations; no balance tuning or gameplay acceptance is claimed. Player choice makes behavior deterministic given validated recorded input, not autonomous without input. The audit-only oracles are confined to scripts/audit and are not Boss runtime.

C1C29 must implement visible pending choices, atomic placement, causal death windows, fresh instance identity, generic seeded initiative insertion, finite token accounting and versioned save/replay metadata. Canonical completeness is not an entry requirement for DIGITAL_DEFAULT; source provenance and public digital decisions are. Production Ready remains 0/9. Strict Source/Custom/optional house-rule schemas are reserved, not implemented.

## Future authority and frozen validation

Campaign/replay must pin C1C28-DIGITAL-DEFAULT-v1 and retain choice/event provenance. Newly obtained official clarification requires scoped re-audit, historical ruling preservation and migration review; it cannot silently change live campaign state.

All C1C25–27 literals, source contracts, source gaps and precedence histories remain frozen, along with gameplay, AI, UI, selectors, save/replay, other families and bundler configuration. Upstream counts remain Trinket 15/37, Quest 3/75, census 278, Hamlet Event 16 literal / 5 local semantic / 0 Ready, Boss 231 / 20 families, Battle 114 / Threat 51 / Ability 12 / Identity 54. Build remains BUILD_ACCEPTANCE_UNVERIFIED due to the recorded Windows repeated-hash/path-length failure; no tooling repair is included. Historical C1C13/C1C12/C1C11 reload retry exhaustion and C1C3 selector click timeout remain open; Complete Edition browser E2E is not fully accepted. Actual commands/results are in c1c28-validation-report.md.
