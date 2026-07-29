import type { QuestDefinition } from '../types';

// 第一阶段固定提供 2 个任务。
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
  },
];

export function getQuestById(id: string): QuestDefinition | undefined {
  return QUESTS.find((q) => q.id === id);
}
