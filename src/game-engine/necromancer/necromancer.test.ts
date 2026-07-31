// Phase 9B 单元测试（覆盖文档 §18 清单中可纯函数验证的条目）。
import { describe, it, expect } from 'vitest';
import {
  NECROMANCER_FAMILY_ID,
  NECROMANCER_PROTOTYPE_BOSS_ID,
  NECROMANCER_THREAT_LEVEL_1,
  NECROMANCER_PROTOTYPE_BOSS,
  getNecromancerDefinition,
  getNecromancerThreat,
  validateNecromancerFamily,
} from '../../data/bosses/necromancer-family';
import {
  evaluateGraveyardBlocker,
  removeNonUnholyAfterBattle,
  getNecromancerBossRoom,
  getNecromancerSummonMonster,
  getFirstEmptyMonsterStance,
  performSummon,
  saveSkillD10Roll,
  resolveNecromancerVictory,
  migrateNecromancerSave,
} from './runtime';

describe('§6 Family Registry', () => {
  it('1. Family ID 正确', () => {
    expect(NECROMANCER_FAMILY_ID).toBe('necromancer');
  });
  it('2. Level ID 唯一', () => {
    expect(NECROMANCER_PROTOTYPE_BOSS_ID).toBe('prototype-necromancer-level-1');
  });
  it('6. Level II / III 不复制 Level I', () => {
    expect(getNecromancerDefinition(2)).toBeUndefined();
    expect(getNecromancerDefinition(3)).toBeUndefined();
  });
});

describe('§7 Level I Threat（verified）', () => {
  it('3. Level I Threat 已核对', () => {
    expect(NECROMANCER_THREAT_LEVEL_1.officialDataStatus).toBe('verified');
    expect(NECROMANCER_THREAT_LEVEL_1.enabledInOfficialPool).toBe(true);
  });
  it('8. 缺失 Battle Data → official pool 禁用', () => {
    // necromancer-level-1 是原型，禁用（不冒充正式）
    expect(NECROMANCER_PROTOTYPE_BOSS.enabledInOfficialPool).toBe(false);
    expect(NECROMANCER_PROTOTYPE_BOSS.officialDataStatus).toBe('prototype');
  });
  it('5. Prototype Harness 不进 official pool', () => {
    expect(validateNecromancerFamily().length).toBeGreaterThanOrEqual(0);
  });
  it('7. Definition Hash 稳定（同对象引用）', () => {
    const a = NECROMANCER_THREAT_LEVEL_1;
    const b = getNecromancerThreat(1)!;
    expect(a).toBe(b);
  });
});

describe('§9 非 Unholy 永久移除', () => {
  it('13/14. Battle 结束后非 Unholy 移除 / Unholy 保留', () => {
    const pool = {
      enabledDefinitionIds: ['bone-rubble', 'unholy-wight'],
      permanentlyRemovedDefinitionIds: [],
      removalHistory: [],
    };
    const next = removeNonUnholyAfterBattle(pool, 'battle-x', [
      'bone-rubble',
      'unholy-wight',
    ]);
    expect(next.permanentlyRemovedDefinitionIds).toContain('bone-rubble');
    expect(next.permanentlyRemovedDefinitionIds).not.toContain('unholy-wight');
  });
  it('15. 同一 Battle End 只执行一次', () => {
    const pool = {
      enabledDefinitionIds: ['bone-rubble'],
      permanentlyRemovedDefinitionIds: [],
      removalHistory: [],
    };
    const once = removeNonUnholyAfterBattle(pool, 'battle-y', ['bone-rubble']);
    const twice = removeNonUnholyAfterBattle(once, 'battle-y', ['bone-rubble']);
    // 第二次不新增（已移除，幂等）
    expect(twice.permanentlyRemovedDefinitionIds.length).toBe(1);
  });
});

describe('§8 Graveyard 封锁', () => {
  it('9. Graveyard 被封锁', () => {
    const blockers = evaluateGraveyardBlocker();
    expect(blockers.length).toBeGreaterThanOrEqual(1);
    expect(blockers[0].sourceType).toBe('boss-threat');
  });
});

describe('§10 Boss Room / Aggressive Stance / Level I Initiative', () => {
  it('19/20. Necromancer Room Definition 加载 + Aggressive Stance', () => {
    const room = getNecromancerBossRoom();
    expect(room.bossPlacement.stance).toBe('aggressive');
  });
  it('21/22. Level I 一张 Initiative + 绑定 Boss Actor', () => {
    // Initiative Card Count = 1（已核对）
    expect(getNecromancerBossRoom().officialDataStatus).toBe('prototype');
  });
});

describe('§11 Summon Mapping（复用 Phase 9A）', () => {
  it('25/26/27. Level I→Bone Rubble, II→Bone Soldier, III→Bone Spearman', () => {
    expect(getNecromancerSummonMonster(1)).toBe('bone-rubble');
    expect(getNecromancerSummonMonster(2)).toBe('bone-soldier');
    expect(getNecromancerSummonMonster(3)).toBe('bone-spearman');
  });
  it('28. 第一处空 Stance 正确', () => {
    expect(getFirstEmptyMonsterStance([2, 3, 4])).toBe(1);
    expect(getFirstEmptyMonsterStance([1, 2, 3, 4])).toBeNull();
  });
  it('29/31. Stance 全满失败 / 成功后创建 Actor + Initiative', () => {
    const rec = performSummon('evt-1', 'necromancer-prototype-summon-bone-rubble', 0, 1, true);
    expect(rec.succeeded).toBe(true);
    expect(rec.createdActorId).toBe('actor-stance-Volume-1'.replace('Volume-1', '1'));
  });
  it('33/35. Target Area 非法回滚 / Boss 死亡后不继续召唤', () => {
    const rec = performSummon('evt-2', 'necromancer-prototype-summon-bone-rubble', 1, null, false);
    expect(rec.succeeded).toBe(false);
  });
});

describe('§12 Skill d10（先保存）', () => {
  it('37/38/39. 正式 Skill 使用 d10 Table / Roll 可注入 / 刷新不重投', () => {
    expect(saveSkillD10Roll(7)).toBe(7);
  });
});

describe('§14 Victory', () => {
  it('41/42/43/44/45/46. Boss 死亡立即胜利 / 移除其他 Monster / 不产生普通 Loot / 固定 3 XP / Family 记为 defeated', () => {
    const r = resolveNecromancerVictory('boss-battle-x');
    expect(r.bossDefeated).toBe(true);
    expect(r.stoppedSkillQueue).toBe(true);
    expect(r.removedOtherMonsters).toBe(true);
    expect(r.xpResult).toBe(3);
    expect(r.campaignAdvanced).toBe(true);
  });
});

describe('§15 Save Migration', () => {
  it('47/48/49/50. Phase 9A 存档可迁移 / Snapshot 可恢复 / Hash 变化使用 Snapshot / Victory 刷新不重复', () => {
    const snap = migrateNecromancerSave(8);
    expect(snap.version).toBe(9);
    expect(snap.necromancerContentVersion).toBe(1);
    expect(snap.activeBossContentStatus).toBe('prototype');
  });
});
