// Phase 9A §8.2：Face the Threat（Boss Quest）定义。
//
// 数据可信度说明（§8.2 明确要求，不允许 OCR 猜值）：
// 项目现有 Quest Card 数据中没有经过核对的 Boss Quest `roomCount` / `firewood`，
// 因此这里使用**显式配置的原型值**并标记 officialDataStatus = 'prototype'：
//   - roomCount = 6：与现有地牢图（start + A-E 共 6 个节点）一致，保证 Edge Room 放置可用；
//   - firewood  = 2：占位值，仅用于跑通营地/补给相关流程。
// 拿到正式卡面后只需改这两个数字并把状态改成 'verified'，引擎无需改动。

import type { QuestDefinition } from '../../types';
import type { BossQuestDefinition } from '../../types/bosses';

/** Boss Quest id（全局唯一，引擎据此识别 Face the Threat）。 */
export const FACE_THE_THREAT_QUEST_ID = 'face-the-threat';

/** Face the Threat 的 Boss Quest 定义（§8.2）。 */
export const FACE_THE_THREAT_QUEST_DEFINITION: BossQuestDefinition = {
  id: FACE_THE_THREAT_QUEST_ID,
  questType: 'face-the-threat',

  name: 'Face the Threat',
  description:
    '迫近的威胁已无法回避。深入地牢边缘，找出它的巢穴并将其终结 —— 此行没有退路。',

  // §16.1：Boss Quest 固定 3 XP，与 Objective 完成数无关。
  xpReward: 3,

  // §8.5 / §17：不可撤退；失败即战役结束。
  canRetreat: false,
  campaignFailureOnFailure: true,

  roomCount: 6,
  firewood: 2,

  // §9：Objective Room 必须放在 Edge Room 上。
  useBossEdgeRoomPlacement: true,

  officialDataStatus: 'prototype',
};

/**
 * 适配现有 Quest 管线的 QuestDefinition 视图。
 *
 * 现有地牢生成 / 结算流程都以 QuestDefinition 为输入，这里做一层适配，
 * 避免为 Boss Quest 复制一整套平行管线。Boss 专属规则（固定 XP、不可撤退、
 * Edge Room 放置、失败即战役结束）由 BossQuestDefinition 与引擎负责，
 * 不塞进这个通用结构里。
 */
export const FACE_THE_THREAT_QUEST: QuestDefinition = {
  id: FACE_THE_THREAT_QUEST_ID,
  name: FACE_THE_THREAT_QUEST_DEFINITION.name,
  type: '讨伐',
  description: FACE_THE_THREAT_QUEST_DEFINITION.description,
  dungeonLevel: 1,
  roomCount: FACE_THE_THREAT_QUEST_DEFINITION.roomCount,
  objective: '找到并击败迫近威胁的源头。',
  reward: '战役推进',
  difficulty: 'hard',
  objectives: [
    {
      id: 'face-the-threat-defeat-boss',
      description: '击败 Boss',
      type: 'complete-objective-room',
      target: 1,
      required: true,
    },
  ],
};
