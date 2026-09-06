import type { QuestDefinition } from '../types';
import { FACE_THE_THREAT_QUEST } from './quests/face-the-threat';

// ---------------------------------------------------------------------------
// Phase 8D：每个 Standard Quest 附带最多 3 条结构化 Objective，
//          完成数量决定 0-3 Quest XP。
// Phase 9A §8.2：FACE_THE_THREAT_QUEST 单独定义在 quests/face-the-threat.ts，
//                本文件只做「Quest Registry」的统一入口，不再复制 Definition。
// Phase 11A.1：明确区分 STANDARD_QUESTS（Standard）与 QUESTS（全部，含 Boss），
//               引擎与 UI 都通过 getQuestById() 取数据，Boss Quest 不再零引用。
// ---------------------------------------------------------------------------

const scoutAhead: QuestDefinition = {
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
};

const recoverRelic: QuestDefinition = {
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
};

/** Standard Quest（用于 canSelectStandardQuest 门控 / Standard Quest 完成计数）。 */
export const STANDARD_QUESTS: QuestDefinition[] = [scoutAhead, recoverRelic];

/** 全部 Quest（含 Standard + Boss Quest）。 */
export const QUESTS: QuestDefinition[] = [
  ...STANDARD_QUESTS,
  FACE_THE_THREAT_QUEST,
];

/** Quest id 集合（用于 Quest Selection 校验）。 */
export const QUEST_IDS = {
  scoutAhead: scoutAhead.id,
  recoverRelic: recoverRelic.id,
  faceTheThreat: FACE_THE_THREAT_QUEST.id,
} as const;

/** 按 id 取 Quest（Phase 11A.1：现在能取到 Boss Quest）。 */
export function getQuestById(id: string): QuestDefinition | undefined {
  return QUESTS.find((q) => q.id === id);
}

/** 判定一个 Quest id 是否属于 Standard Quest。 */
export function isStandardQuestId(id: string): boolean {
  return STANDARD_QUESTS.some((q) => q.id === id);
}

/** 判定一个 Quest id 是否属于 Boss Quest（Phase 9A §8：仅 face-the-threat）。 */
export function isBossQuestId(id: string): boolean {
  return id === FACE_THE_THREAT_QUEST.id;
}
