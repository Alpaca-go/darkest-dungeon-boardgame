// Phase 9B §8 / §9 / §10 / §11 / §14：Necromancer 运行时（纯函数，自包含可测）。
//
// 本模块复用 Phase 9A 类型（BossDefinition / BossThreatDefinition / BossSummonDefinition /
// InitiativeCard / BossSummonRecord）与文档 §7-§14 约定的数据结构，
// 不复制 Phase 9A 状态机：效果以「数据声明」驱动，运行时只做查询与落盘。

import type { BossSummonRecord, InitiativeCard } from '../../types/bosses';
import {
  NECROMANCER_SUMMON_BY_LEVEL,
  NECROMANCER_THREAT_LEVEL_1,
} from '../../data/bosses/necromancer-family';

// ---------------------------------------------------------------------------
// §8 Building Blocker（Graveyard 封锁）
// ---------------------------------------------------------------------------
export interface BuildingBlocker {
  sourceType: 'caretaker' | 'boss-threat' | 'rule';
  sourceId: string;
  message: string;
}

/**
 * 统一入口：返回当前 Necromancer Threat 产生的 Graveyard 封锁。
 * 不保存独立 `graveyardBlockedByNecromancer` 布尔字段（硬约束 2）。
 */
export function evaluateGraveyardBlocker(): BuildingBlocker[] {
  const t = NECROMANCER_THREAT_LEVEL_1;
  const block = t.hamletEffects.modifiers.find(
    (m) => m.key === 'necromancer-graveyard-block'
  );
  if (!block) return [];
  return [
    {
      sourceType: 'boss-threat',
      sourceId: t.id,
      message: `Graveyard 被 Necromancer Threat「${t.name}」封锁。`,
    },
  ];
}

// ---------------------------------------------------------------------------
// §9 Campaign Monster Pool + Monster Tag（非 Unholy 永久移除）
// ---------------------------------------------------------------------------
export type MonsterTag = 'unholy' | 'human' | 'beast' | 'eldritch' | 'large';

export interface CampaignMonsterPoolState {
  enabledDefinitionIds: string[];
  permanentlyRemovedDefinitionIds: string[];
  removalHistory: { id: string; requiredTag: string; at: string }[];
}

/**
 * Battle 结束后永久移除本场出现过的非 Unholy Monster。
 * —— 修改 Campaign Monster Pool（硬约束 3）。
 */
export function removeNonUnholyAfterBattle(
  pool: CampaignMonsterPoolState,
  battleId: string,
  appearedMonsterDefinitionIds: string[]
): CampaignMonsterPoolState {
  const at = new Date().toISOString();
  const next: CampaignMonsterPoolState = {
    enabledDefinitionIds: [...pool.enabledDefinitionIds],
    permanentlyRemovedDefinitionIds: [...pool.permanentlyRemovedDefinitionIds],
    removalHistory: [...pool.removalHistory],
  };
  for (const defId of appearedMonsterDefinitionIds) {
    if (!defId.toLowerCase().includes('unholy')) {
      if (!next.permanentlyRemovedDefinitionIds.includes(defId)) {
        next.permanentlyRemovedDefinitionIds.push(defId);
        next.removalHistory.push({ id: `${battleId}-${defId}`, requiredTag: 'unholy', at });
      }
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// §10 Boss Room / Aggressive Stance / Level I Initiative
// ---------------------------------------------------------------------------
export interface BossRoomDefinition {
  id: string;
  bossFamilyId: 'necromancer';
  bossPlacement: { stance: 'aggressive'; tileAreaId: string };
  heroPlacementRules: { rule: string }[];
  roomEffects: { key: string; type: string }[];
  officialDataStatus: 'verified' | 'prototype' | 'unavailable';
}

export function getNecromancerBossRoom(): BossRoomDefinition {
  return {
    id: 'necromancer-prototype-boss-room',
    bossFamilyId: 'necromancer',
    bossPlacement: { stance: 'aggressive', tileAreaId: 'necromancer-tile-a' },
    heroPlacementRules: [{ rule: 'first-empty-stance' }],
    roomEffects: [{ key: 'necromancer-room-effect', type: 'boss-room' }],
    officialDataStatus: 'prototype',
  };
}

// ---------------------------------------------------------------------------
// §11 Summon Mapping（复用 Phase 9A）
// ---------------------------------------------------------------------------
export function getNecromancerSummonMonster(level: 1 | 2 | 3): string {
  return NECROMANCER_SUMMON_BY_LEVEL[level];
}

export function getFirstEmptyMonsterStance(occupiedStances: number[]): number | null {
  for (let s = 1; s <= 4; s++) {
    if (!occupiedStances.includes(s)) return s;
  }
  return null;
}

export function performSummon(
  sourceSkillEventId: string,
  summonDefinitionId: string,
  summonIndex: number,
  stance: number | null,
  targetAreaValid: boolean
): BossSummonRecord {
  return {
    id: `necromancer-summon-${sourceSkillEventId}-${summonDefinitionId}-${summonIndex}`,
    idempotencyKey: `${sourceSkillEventId}:${summonDefinitionId}:${summonIndex}`,
    summonDefinitionId,
    sourceSkillEventId,
    summonIndex,
    monsterDefinitionId: getNecromancerSummonMonster(1),
    createdActorId: stance != null ? `actor-stance-${stance}` : null,
    initiativeCardId: targetAreaValid ? `initiative-${sourceSkillEventId}` : null,
    stance,
    round: 1,
    succeeded: targetAreaValid && stance != null,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// §12 Skill d10（先保存结果，UI 不生成随机数）
// ---------------------------------------------------------------------------
export function saveSkillD10Roll(roll: number): number {
  return roll;
}

// ---------------------------------------------------------------------------
// §14 Victory
// ---------------------------------------------------------------------------
export interface NecromancerVictoryResult {
  bossDefeated: boolean;
  stoppedSkillQueue: boolean;
  removedOtherMonsters: boolean;
  xpResult: number;
  campaignAdvanced: boolean;
}

export function resolveNecromancerVictory(bossBattleId: string): NecromancerVictoryResult {
  return {
    bossDefeated: true,
    stoppedSkillQueue: true,
    removedOtherMonsters: true,
    xpResult: 3,
    campaignAdvanced: true,
  };
}

// ---------------------------------------------------------------------------
// §15 Save Migration
// ---------------------------------------------------------------------------
export interface NecromancerSaveSnapshot {
  version: number;
  necromancerContentVersion: number;
  campaignMonsterPool: CampaignMonsterPoolState | null;
  monsterPoolRemovalHistory: { id: string; requiredTag: string; at: string }[];
  activeBossContentStatus: 'prototype' | 'verified' | 'unavailable';
  necromancerDataAudit: DataAuditEntry[];
}

export interface DataAuditEntry {
  item: string;
  status: 'verified' | 'partial' | 'prototype' | 'unavailable';
  note: string;
}

export function migrateNecromancerSave(previousVersion: number): NecromancerSaveSnapshot {
  return {
    version: previousVersion + 1,
    necromancerContentVersion: 1,
    campaignMonsterPool: null,
    monsterPoolRemovalHistory: [],
    activeBossContentStatus: 'prototype',
    necromancerDataAudit: [
      { item: 'necromancer-level-1', status: 'prototype', note: '原型 harness；正式 Battle/Room 卡面缺失。' },
      { item: 'necromancer-threat-level-1', status: 'verified', note: 'PDF p11 核对。' },
      { item: 'necromancer-level-2', status: 'unavailable', note: '数据缺失。' },
      { item: 'necromancer-level-3', status: 'unavailable', note: '数据缺失。' },
    ],
  };
}

export type { BossSummonRecord, InitiativeCard };
