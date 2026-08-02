// Phase 10D §24：Undulations —— 全 Hero Stance 原子随机排列。
//
// 硬约束对照（规则书 p40 + 硬约束清单）：
// - 18. 必须生成**合法** Hero 排列（每名 Hero 恰好出现一次）；
// - 19. 每名 Hero 恰好一次，不重复、不丢失；
// - 20. Shuffle 只改变 Hero Stance，**不改变** Room Area；
// - 21. RNG 先保存，UI 后展示（rng 在调用时注入并消费一次）；
// - 22. 已行动 Hero 不重复行动（preserveBudgets：hasActedThisRound 保留）；
// - 23. 尚未行动 Hero 不丢失行动（hasActedThisRound 保留）；
// - 24. 完整 Effect Sequence 由 Definition 驱动（数值序列 partial → official 禁用，
//        此处仅实现已 verified 的 Stance 排列语义）。

import type { HeroStanceAssignment, ShufflingHorrorEncounterState } from '../../../types/shuffling-horror';
import { SHUFFLING_HORROR_STANCE_PRIORITY } from '../../../data/darkest-dungeon/shuffling-horror/ids';
import { shuffleWithRng } from '../../campaign/act-four/rng';

export interface UndulationsResult {
  ok: boolean;
  state: ShufflingHorrorEncounterState;
  /** Shuffle 前：heroId → stance。 */
  before: Record<string, string>;
  /** Shuffle 后：heroId → stance。 */
  after: Record<string, string>;
  /** 排列后的 Hero 顺序（shuffled[0] 分到 aggressive）。 */
  shuffledHeroIds: string[];
  reason: string | null;
}

/**
 * 取下全部 Hero Stance Token → 洗混 → 从 Aggressive 到 Support 随机放回。
 *
 * 实现：heroIds 经 rng 洗牌（Fisher-Yates），第 i 个洗出 Hero 落到 stancePriority[i]。
 * 每人恰好一次（排列），areaId / hasActedThisRound 原样保留（硬约束 20/22/23）。
 */
export function resolveUndulationsHeroStanceShuffle(
  state: ShufflingHorrorEncounterState,
  rng: () => number,
): UndulationsResult {
  const assignments = state.heroStanceAssignments;
  if (assignments.length === 0) {
    return {
      ok: false,
      state,
      before: {},
      after: {},
      shuffledHeroIds: [],
      reason: '没有可排列的 Hero',
    };
  }

  const before: Record<string, string> = {};
  for (const a of assignments) before[a.heroId] = a.stance;

  // RNG 先保存：洗牌本身即消费 rng（一次），结果被写入 state（UI 之后渲染，硬约束 21）。
  const heroIds = assignments.map((a) => a.heroId);
  const shuffled = shuffleWithRng(rng, heroIds);

  const nextAssignments: HeroStanceAssignment[] = assignments.map((a) => {
    const idx = shuffled.indexOf(a.heroId);
    const newStance = SHUFFLING_HORROR_STANCE_PRIORITY[idx % SHUFFLING_HORROR_STANCE_PRIORITY.length];
    return {
      ...a,
      stance: newStance,
      // areaId 不变（硬约束 20）；hasActedThisRound 不变（硬约束 22/23）
    };
  });

  const after: Record<string, string> = {};
  for (const a of nextAssignments) after[a.heroId] = a.stance;

  const nextState: ShufflingHorrorEncounterState = {
    ...state,
    heroStanceAssignments: nextAssignments,
    lastActionLog: [
      ...state.lastActionLog,
      `Undulations：取下全部 Hero Stance Token，洗混后从 Aggressive 到 Support 重新放回。`,
    ],
  };

  return { ok: true, state: nextState, before, after, shuffledHeroIds: shuffled, reason: null };
}
