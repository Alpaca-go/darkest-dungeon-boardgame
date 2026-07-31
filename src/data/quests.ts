import type { QuestDefinition } from '../types';

// ---------------------------------------------------------------------------
// 第一阶段固定提供 2 个任务。
//
// Phase 8D：每个任务附带最多 3 条结构化 Objective，完成数量决定 0-3 Quest XP。
// Objective 的判定条件全部可由 CampaignState 推导（房间清除数 / Objective 房间 /
// 无人阵亡），不引入新的运行时状态。这些 Objective 是原型级设计（prototype），
// 尚未与官方卡面逐条比对，替换为 verified 数据时只需改本文件。
// ---------------------------------------------------------------------------
export const QUESTS: QuestDefinition[] = [
  {
    id: 'scout-ahead',
    name: 'Scout Ahead',
    type: '探索',
    description: '深入废墟外围，清剿出一条安全的侦察通道。',
    dungeonLevel: 1,
    roomCount: 6,
    objective: '清除 3 个房间。',
    reward: '30 Gold',
    difficulty: 'easy',
    objectives: [
      {
        id: 'scout-ahead-clear-3',
        description: '清除 3 个房间',
        type: 'clear-room-count',
        target: 3,
        required: true,
      },
      {
        id: 'scout-ahead-clear-5',
        description: '清除 5 个房间（额外目标）',
        type: 'clear-room-count',
        target: 5,
        required: false,
      },
      {
        id: 'scout-ahead-no-death',
        description: '全队无人阵亡',
        type: 'survive',
        target: 1,
        required: false,
      },
    ],
  },
  {
    id: 'recover-relic',
    name: 'Recover the Relic',
    type: '寻物',
    description: '传说遗物深埋于地牢核心，护送小队取回它。',
    dungeonLevel: 1,
    roomCount: 6,
    objective: '到达并清除 Objective 房间。',
    reward: '50 Gold',
    difficulty: 'normal',
    objectives: [
      {
        id: 'recover-relic-objective-room',
        description: '到达并清除 Objective 房间',
        type: 'complete-objective-room',
        target: 1,
        required: true,
      },
      {
        id: 'recover-relic-clear-4',
        description: '清除 4 个房间（额外目标）',
        type: 'clear-room-count',
        target: 4,
        required: false,
      },
      {
        id: 'recover-relic-no-death',
        description: '全队无人阵亡',
        type: 'survive',
        target: 1,
        required: false,
      },
    ],
  },
];

export function getQuestById(id: string): QuestDefinition | undefined {
  return QUESTS.find((q) => q.id === id);
}
