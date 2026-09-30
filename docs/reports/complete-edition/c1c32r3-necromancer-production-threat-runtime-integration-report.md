# C1C32R3 — implementation status

Baseline: `052e623c0bc98560c9baae5e9522d2e88c0bf435`.

**Incomplete; full-path acceptance has not passed. C1C33 remains unauthorized.**

The product now exposes explicit Ruins v6 selection at Quest Select before Threat initialization. `selectProductionRuinsV6` composes the existing v4/v5/v6 authorities atomically, validates existing migration provenance, and rejects active Battle, draw state, checkpoint, Threat runtime, pending Preparation Day and unsafe phase boundaries. It does not rewrite historical replay records. Existing v6 selection is validation/idempotency, not a new migration.

The normal Store Face the Threat selection checks Complete Edition, Core, Ruins, Necromancer, explicit Hero Dodge v2 and explicit Ruins v6 before calling the existing Quest command. Rejected selection no longer navigates to Dungeon. The UI displays an actionable prerequisite error. Historical programmatic Quest commands retain their existing behavior.

The frozen initial physical binding requires `eventSequence === 1`. A new `checkpoint-physical-bridge.ts` handles settled production checkpoints with Preparation Day events, using the existing Threat checkpoint and physical ledger validators. It requires no pending choice, Boss actor, active summon, queued death or Battle monster, and all summon tokens available or permanently removed. Initial binding still delegates to the frozen helper. The existing foundation executor still owns the THREAT → ABILITY transition. Boss Room entry also rejects unreturned ordinary physical encounters and pending exploration transactions. The frozen Ruins runtime and package script hashes are unchanged.

The 22 new unit tests are scoped command tests. Their campaign-progress setup and deliberate invalid inputs are not player-route acceptance evidence. The new browser test starts a fresh Complete Edition campaign, selects its party and default skills through player UI, explicitly selects v2/v6, and reloads. It performs no fixture state injection, but proves selection only.

The Dungeon `necromancer-threat-domain-bridge-unbound` guard remains. No production ordinary Threat command, Captain bridge, Reanimation bridge or settlement bridge is claimed by this change. Scenario C remains unproven. The required complete Quest Select → Boss victory routes, save/replay proofs and capability matrix cannot be promoted from the entry test.

No source acquisition, broad PDF audit, new ruling version, Trinket effect implementation or historical evidence rewrite was performed. The pre-existing `.gitignore` modification is user-owned and was left untouched.
