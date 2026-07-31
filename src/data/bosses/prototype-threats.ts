// Phase 9A §6.1 / §27.2：Prototype Imminent Threat 数据。
//
// 两条效果全部以**通用被动声明**表达（modifier / reaction），由既有 Rule Event 引擎执行；
// 引擎与组件中不得出现 `if (threatId === 'prototype-threat')` 之类的硬编码（§6.4）。
//
//   Hamlet ：本次 Hamlet 访问中「第一个」Stress Recovery Action 的恢复量 -1
//            → stress-recovered 的前置 modifier + oncePerHamletVisit
//   Dungeon：每次进入未探索 Room 后，当前 Lead Hero +1 Stress
//            → room-entered 的后置 reaction + appliesTo: 'lead-hero'
//
// 同样是占位数据：不绑定任何正式 Boss 名称，不进入正式池（§27.2）。

import type { BossThreatDefinition } from '../../types/bosses';
import { PROTOTYPE_BOSS_FAMILY_ID, PROTOTYPE_BOSS_ID } from './prototype-bosses';

/** Prototype Threat 定义 id。 */
export const PROTOTYPE_THREAT_ID = 'prototype-threat-gathering-bones';

/** 一次性 Hamlet 效果的稳定 key（消耗记录写入 ActiveThreatRuntime.consumedOnceKeys）。 */
export const PROTOTYPE_THREAT_HAMLET_KEY = 'prototype-threat/hamlet-first-stress-recovery';

/** Dungeon 效果 key。 */
export const PROTOTYPE_THREAT_DUNGEON_KEY = 'prototype-threat/unexplored-room-lead-stress';

/** Prototype Threat（§27.2）。 */
export const PROTOTYPE_THREAT: BossThreatDefinition = {
  id: PROTOTYPE_THREAT_ID,

  bossFamilyId: PROTOTYPE_BOSS_FAMILY_ID,
  bossDefinitionId: PROTOTYPE_BOSS_ID,

  campaignLevel: 1,

  name: 'Prototype Threat：白骨渐聚（测试数据）',
  description:
    '测试用迫近威胁：村庄中本次访问的第一次压力恢复效果 -1；地牢中每进入一个未探索房间，领队英雄 +1 压力。进入 Boss 房间后停止。',

  hamletEffects: {
    modifiers: [
      {
        key: PROTOTYPE_THREAT_HAMLET_KEY,
        eventType: 'stress-recovered',
        // 恢复量 -1（引擎侧统一钳制到 >= 0）。
        flatDelta: -1,
        appliesTo: 'all-heroes',
        oncePerHamletVisit: true,
      },
    ],
    reactions: [],
  },

  dungeonEffects: {
    modifiers: [],
    reactions: [
      {
        key: PROTOTYPE_THREAT_DUNGEON_KEY,
        eventType: 'room-entered',
        appliesTo: 'lead-hero',
        effects: [{ type: 'stress-self', amount: 1 }],
      },
    ],
  },

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
  priority: 30,
};

/** 全部 Prototype Threat。 */
export const PROTOTYPE_THREATS: BossThreatDefinition[] = [PROTOTYPE_THREAT];
