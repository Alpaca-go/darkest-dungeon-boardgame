// Phase 10D §4—§41：Shuffling Horror / 动态怪物行动优先级 / Echoing Disassembly 召唤 /
// Hero Stance Shuffle 类型契约。
//
// 硬约束对照（文档硬约束清单）：
// - 1. 不创建第二套 Battle / Dungeon / Initiative 状态机 → 复用既有 BattleState；
//   本模块只保存 Shuffling Horror 域的 *附加* 运行时（Monster Opportunity 卡组、Stance
//   Priority Tracker、Monster/Hero Action Budget、Hero Stance 排列）。
// - 2. Shuffling Horror Encounter 不能只使用永久 Actor-bound Monster Initiative →
//   `MonsterInitiativeOpportunityCard` 不绑定 Actor，抽卡时按 Stance Priority 动态解析（§3 verified）。
// - 3. Monster Opportunity 在抽取时按当前 Stance 与 remainingActions 解析 Actor。
// - 4. Horror 每轮最多行动 2 次；Priest/Growth 各 1 次（独立 Budget）。
// - 5. Priest/Growth 使用独立 Action Budget。
// - 6. Stance 变化必须影响下一张未解析 Opportunity。
// - 7. 无 Eligible Actor 时 Opportunity 标记 Excess。
// - 8. Tracker 未满时 Horror 强制 Echoing Disassembly。
// - 9. 召唤顺序固定 Priest → Growth。
// - 10. 只召唤当前不在场的 Role。
// - 11. 两名召唤建议原子提交。
// - 12. 每名召唤物 +1 Monster Opportunity。
// - 13. Opportunity 不是永久绑定召唤物。
// - 14. Spawn 用第一空 Stance + 对应 Area，除非正式资料另有说明。
// - 15. Area 满时复用正式 Space Resolution。
// - 16. Priest/Growth 死亡不立即重生。
// - 17. 下一次 Horror 行动重召唤缺失 Role。
// - 18. Undulations 必须生成合法 Hero 排列。
// - 19. 每名 Hero 恰好一次，不重复、不丢失。
// - 20. Shuffle 只改变 Hero Stance，不改变 Room Area。
// - 21. RNG 先保存，UI 后展示。
// - 22. 已行动 Hero 不能因 Shuffle 再次行动。
// - 23. 尚未行动 Hero 不能丢失行动。
// - 24. Undulations 完整 Effect Sequence 由 Definition 驱动（资料不足 → official 禁用）。
// - 25. Horror 死亡立即停止 Queue 并清理 linked actors。
// - 26. Guardian Failure 进入 Campaign Over。
// - 27. XP 与 Final Hamlet 复用 Phase 10A / 8D。
// - 28. Missing Skill / Room / Initiative Policy / Victory 时 official 禁用。
// - 29. Prototype 使用 prototype ID。
// - 30. 不使用电子游戏数据。
// - 31. 不提前实现 Final Encounter。

import type { DataCredibility } from './progression';

export type ShufflingHorrorDataStatus = DataCredibility;

/** Monster / Hero Stance（与 Room Spawn Policy 一致）。 */
export type MonsterStance = 'aggressive' | 'defensive' | 'ranged' | 'support';

/** Shuffling Horror 家族下的三种角色。 */
export type ShufflingHorrorRole = 'horror' | 'cultist-priest' | 'malignant-growth';

/**
 * Monster Initiative Opportunity Card（§3 / §12 verified）。
 * **不绑定**任何具体 Actor：抽卡时按当前 Stance Priority + 剩余行动次数动态解析出
 * 真正行动的 Monster（resolveAtDrawTime）。这是硬约束 2/3 的核心。
 */
export interface MonsterInitiativeOpportunityCard {
  id: string;
  cardType: 'monster-initiative-opportunity';
  /** 家族归属（恒为 shuffling-horror）。 */
  owner: 'shuffling-horror';
  /** 该卡被创建（加入牌堆）时的轮次，用于审计。 */
  roundCreated: number;
  /**
   * 抽卡时解析出的「当前最靠前 Stance」（快照，写入存档便于刷新恢复）。
   * 非绑定：仅记录抽卡瞬间的 Stance，不绑定 Actor 实例。
   */
  stanceAtDraw: MonsterStance | null;
  /** 抽卡时解析出的 Actor Role（快照）。 */
  resolvedActorRole: ShufflingHorrorRole | null;
  /** 抽卡时解析出的 Actor 实例 id（快照）；Excess 时为 null。 */
  resolvedActorId: string | null;
  /** 抽卡时无 Eligible Actor → 标记 Excess（抽卡即移除，硬约束 7）。 */
  isExcess: boolean;
  excessReason: string | null;
  /** 是否已被消费（抽走或判定 Excess 移除）。 */
  invalidated: boolean;
}

/** Shuffling Horror 域 Actor 运行时状态。 */
export interface ShufflingHorrorActorState {
  actorId: string;
  role: ShufflingHorrorRole;
  owner: 'shuffling-horror';
  alive: boolean;
  /** 第几次被召唤（死亡重生递增，硬约束 17）。 */
  generation: number;
  /** 当前占据的 Stance（在 Tracker 中；Reserve 时为 []）。 */
  stances: MonsterStance[];
  /** 当前所在 Area（Spawn 决定；Reserve 时为 null）。 */
  areaId: string | null;
  /** 初始在 Reserve（Priest/Growth），不占 Stance、不加入 Tracker。 */
  inReserve: boolean;
  /** 本轮已用行动次数（独立 Budget，硬约束 5）。 */
  actionBudgetUsedThisRound: number;
  /** 本轮最大行动次数（Horror=2，Priest/Growth=1）。 */
  actionBudgetMaxThisRound: number;
}

/**
 * Stance Priority Tracker（§12 verified）。
 * 记录每个 Stance 当前被哪个 Actor 占据；Tracker 是否已满决定 Horror 是否强制 Echoing。
 */
export interface StancePriorityTracker {
  /** 固定顺序 [aggressive, defensive, ranged, support]。 */
  stancePriority: MonsterStance[];
  /** 每个 Stance 的占据者 Actor id（null = 空）。 */
  stanceOccupant: Record<MonsterStance, string | null>;
  /** 每个 Stance 的承载上限（资料未给出 → prototype 固定 1）。 */
  capacityPerStance: number;
  /** 被占据的 Stance 数量是否达到容量上限。 */
  isFull: boolean;
}

/** Monster 轮次行动预算（硬约束 4/5）。 */
export interface MonsterRoundActionBudget {
  round: number;
  perRoleMax: Record<ShufflingHorrorRole, number>;
  perRoleUsed: Record<ShufflingHorrorRole, number>;
}

/** Hero 轮次行动预算（硬约束 22/23）。 */
export interface HeroRoundActionBudget {
  round: number;
  /** heroId → 本轮最大行动次数（恒 1）。 */
  perHeroMax: Record<string, number>;
  /** heroId → 本轮已用行动次数。 */
  perHeroUsed: Record<string, number>;
}

/** Hero Stance 排列（Undulations 产物，硬约束 18/19/20）。 */
export interface HeroStanceAssignment {
  heroId: string;
  /** 该 Hero 当前所处的 Stance 位置（每名 Hero 恰好一个）。 */
  stance: MonsterStance;
  /** 该 Hero 所在的 Room Area（Undulations 不改，硬约束 20）。 */
  areaId: string;
  /** 该 Hero 本轮是否已行动（Shuffle 后不重复，硬约束 22）。 */
  hasActedThisRound: boolean;
}

/** 存档快照（Definition Hash，用于 Data Gate 审计）。 */
export interface ShufflingHorrorSnapshot {
  guardianHash: string;
  roomHash: string;
  actorsHash: string;
  initiativePolicyHash: string;
  undulationsHash: string;
}

/** 顶层容器：Shuffling Horror 遭遇运行时（挂在 ActFourState 下）。 */
export interface ShufflingHorrorEncounterState {
  family: 'shuffling-horror';
  guardianBattleId: string;
  mode: 'prototype' | 'formal' | 'community-reference';
  round: number;

  actors: ShufflingHorrorActorState[];

  /** Monster Opportunity 抽牌堆（未绑定 Actor）。 */
  initiativeDrawPile: MonsterInitiativeOpportunityCard[];
  /** 已消费（抽走 / Excess 移除）的卡。 */
  initiativeDiscardPile: MonsterInitiativeOpportunityCard[];

  stancePriority: StancePriorityTracker;
  monsterBudget: MonsterRoundActionBudget;
  heroBudget: HeroRoundActionBudget;
  heroStanceAssignments: HeroStanceAssignment[];

  /** 本轮已召唤过的角色（用于 Priest→Growth 顺序的幂等）。 */
  summonedRolesThisEncounter: ShufflingHorrorRole[];
  /** 各角色当前 generation（重生递增）。 */
  generationByRole: Record<ShufflingHorrorRole, number>;

  /** 最近若干条行动日志（UI / Debug 展示，先保存后展示，硬约束 21）。 */
  lastActionLog: string[];
  transactionId: string;
  snapshot: ShufflingHorrorSnapshot;
  /** 已提交的事务 id（幂等；保留最近 200 条）。 */
  processedTransactionIds: string[];
}
