// Phase 10D §24：Undulations Skill（Hero Stance Shuffle）。
// 行为语义 fully verified（规则书 p40）；具体伤害/效果序列 partial → official 禁用。

import { PROTOTYPE_UNDULATIONS_ID } from './ids';

export interface ShufflingHorrorUndulationsDefinition {
  id: string;
  sourceActorRole: 'horror';
  /** 具体效果序列资料缺失 → 空数组（硬约束 24：official 禁用）。 */
  effectSequence: [];
  stanceShuffleEffect: {
    type: 'shuffle-all-hero-stances';
    policyId: 'random-permutation-aggressive-to-support';
    /** 硬约束 20：只改 Stance 不改 Area。 */
    preserveHeroAreas: true;
    /** 硬约束 22/23：已行动不重复、未行动不丢失。 */
    preserveRoundActionBudgets: true;
    /** 硬约束 21：RNG 先保存后展示。 */
    rngPersistenceRequired: true;
  };
  officialDataStatus: 'partial';
}

export const SHUFFLING_HORROR_UNDULATIONS: ShufflingHorrorUndulationsDefinition = {
  id: PROTOTYPE_UNDULATIONS_ID,
  sourceActorRole: 'horror',
  effectSequence: [],
  stanceShuffleEffect: {
    type: 'shuffle-all-hero-stances',
    policyId: 'random-permutation-aggressive-to-support',
    preserveHeroAreas: true,
    preserveRoundActionBudgets: true,
    rngPersistenceRequired: true,
  },
  officialDataStatus: 'partial',
};
