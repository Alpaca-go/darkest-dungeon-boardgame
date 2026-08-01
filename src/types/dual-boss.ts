// Phase 10B §7 / §11 / §21：Dual Boss Encounter 通用类型契约。
//
// 硬约束对照：
// - 不为 Templars 建立第二套 Battle / Initiative / Dungeon 状态机（§0）；
// - 两名 Boss 必须是**独立 BattleActor**，禁止建立第三个「Templars Group Actor」（§10）；
// - Victory Condition 必须 **Definition 驱动**；正式卡面未确认前
//   `victoryCondition = 'definition-driven'` 且 official 禁用（§7 / §21）。

import type { DataCredibility } from './progression';

export type DualBossDataStatus = DataCredibility;

// ---------------------------------------------------------------------------
// §7 Dual Boss Member
// ---------------------------------------------------------------------------

export type TemplarRole = 'impaler' | 'warlord';

export interface DualBossMemberDefinition {
  actorDefinitionId: string;

  role: TemplarRole;

  /** 规则书 p.39 明确：Impaler = Aggressive、Warlord = Ranged。 */
  requiredStance: 'aggressive' | 'ranged';
  /** Room Tile 上的固定 Area；正式资料缺失时为空串 → 驱动 Data Gate 失败。 */
  requiredAreaId: string;

  /** 规则书明确：Initiative Deck 加入 4 张卡（2 + 2）。 */
  initiativeCardsPerRound: 2;
}

// ---------------------------------------------------------------------------
// §7 Dual Boss Encounter Definition
// ---------------------------------------------------------------------------

export interface DualBossEncounterDefinition {
  id: string;
  guardianFamilyId: 'templars';

  bossMembers: [DualBossMemberDefinition, DualBossMemberDefinition];

  roomDefinitionId: string;

  /**
   * 引擎支持 'all-boss-members-defeated'，
   * 但正式 Templars 卡面未确认 Encounter 完成条件前必须留在 'definition-driven'（§7）。
   */
  victoryCondition: 'all-boss-members-defeated' | 'definition-driven';

  failureCondition: 'party-defeated';

  officialDataStatus: DualBossDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

// ---------------------------------------------------------------------------
// §21 Victory Rule
// ---------------------------------------------------------------------------

export interface DualBossVictoryRule {
  type: 'all-listed-boss-actors-defeated' | 'any-listed-boss-actor-defeated' | 'custom';

  requiredActorDefinitionIds: string[];
  customResolverId?: string;
}

/** Victory 评估结果（不修改状态，纯查询）。 */
export interface DualBossVictoryEvaluation {
  satisfied: boolean;
  ruleType: DualBossVictoryRule['type'] | null;
  /** 规则要求击败但仍存活的 Actor Definition id。 */
  remainingActorDefinitionIds: string[];
  defeatedActorDefinitionIds: string[];
  /** 无法评估的原因（例如 Victory Rule 缺失）。 */
  reason: string | null;
}
