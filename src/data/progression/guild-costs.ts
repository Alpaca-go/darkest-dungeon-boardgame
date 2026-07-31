import type { GuildUpgradeCostTable, QuestXpPolicy } from '../../types/progression';

// ---------------------------------------------------------------------------
// Phase 8D：成长系统成本 / 策略常量（data-driven，禁止在组件与引擎中硬编码）
// ---------------------------------------------------------------------------

/** Guild 升级成本：Hero Level +1 = 4 XP + 2 Gold；Skill Level +1 = 2 XP + 1 Gold。 */
export const GUILD_UPGRADE_COSTS: GuildUpgradeCostTable = {
  heroLevel: { xp: 4, gold: 2 },
  skillLevel: { xp: 2, gold: 1 },
};

/** 每次 Guild Visit 最多可执行的升级次数。 */
export const MAX_UPGRADES_PER_GUILD_VISIT = 2;

/** Stagecoach Replacement 每名替补最多可执行的升级次数（免 Gold）。 */
export const MAX_UPGRADES_PER_REPLACEMENT = 2;

/** Quest XP 策略：每完成 1 个 Objective 得 1 XP，单次任务上限 3。 */
export const QUEST_XP_POLICY: QuestXpPolicy = {
  maxXpPerQuest: 3,
  xpPerObjective: 1,
};
