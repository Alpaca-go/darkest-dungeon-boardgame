import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CampaignState } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource } from './random';
import { finishQuest } from './quest-result';
import { startHamletPhase, skipHeroAction, endHamletDay, visitHamletBuilding } from './hamlet';
import { initBattle, resolveVictory } from './battle';
import {
  STORAGE_KEY,
  SAVE_VERSION,
  createSaveSnapshot,
  validateSaveFile,
  migrateSaveFile,
  sanitizeSaveFile,
  saveCampaign,
  loadCampaign,
  loadSaveDetailed,
  clearCampaign,
  exportSaveString,
  importSaveString,
} from './save';
import { routeForPhase, nearestLegalPath, checkRouteAccess } from '../app/route-guards';
import { visitBlacksmith, getActiveSkillFormOverrides } from './hamlet/blacksmith';
import { getEffectiveSkillLevel } from './progression/upgrade-core';

const FOUR_HEROES = ['crusader', 'vestal', 'highwayman', 'hellion'];

/** 进入地牢探索阶段的新战役。 */
function freshCampaign(questId = 'scout-ahead'): CampaignState {
  return selectQuest(
    applyDefaultLoadout(selectParty(createNewCampaign(), FOUR_HEROES)),
    questId
  );
}

/** 标记 Objective 完成。 */
function withObjective(c: CampaignState): CampaignState {
  return { ...c, dungeon: { ...c.dungeon!, objectiveComplete: true, roomsCleared: 2 } };
}

/** 处于 battle 阶段（战斗刚初始化）的战役。 */
function battleCampaign(): CampaignState {
  const c = freshCampaign();
  const room = c.dungeon!.rooms.find((r) => r.type === 'battle') ?? c.dungeon!.rooms[1];
  return initBattle(c, room.id);
}

beforeEach(() => {
  clearCampaign();
  setRandomSource(() => 0);
});

afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// 一、路由守卫
// ---------------------------------------------------------------------------

describe('路由守卫', () => {
  it('1. 非法进入 battle 页被重定向到最近合法页面', () => {
    // dungeon-explore 阶段（无战斗）直接访问 /battle
    const c = freshCampaign();
    const g = checkRouteAccess(c, '/battle');
    expect(g.ok).toBe(false);
    expect(g.redirect).toBe('/dungeon');
    expect(g.reason).toContain('battle');
  });

  it('2. 无战役时任何游戏页面都被重定向到首页', () => {
    for (const p of ['/setup', '/loadout', '/quests', '/dungeon', '/battle', '/result', '/hamlet']) {
      const g = checkRouteAccess(null, p);
      expect(g.ok).toBe(false);
      expect(g.redirect).toBe('/');
    }
    expect(checkRouteAccess(null, '/').ok).toBe(true);
  });

  it('3. 阶段合法但数据缺失时同样被拦截（不依赖按钮禁用）', () => {
    // 强行伪造 battle 阶段但 BattleState 缺失
    const c = { ...freshCampaign(), gamePhase: 'battle' as const, battle: null };
    const g = checkRouteAccess(c, '/battle');
    expect(g.ok).toBe(false);
    expect(g.reason).toContain('前置条件不满足');
  });

  it('4. 各阶段的合法主路由允许进入', () => {
    const dungeon = freshCampaign();
    expect(checkRouteAccess(dungeon, '/dungeon').ok).toBe(true);
    const battle = battleCampaign();
    expect(checkRouteAccess(battle, '/battle').ok).toBe(true);
    const result = finishQuest(withObjective(freshCampaign()), 'left');
    expect(checkRouteAccess(result, '/result').ok).toBe(true);
    const hamlet = startHamletPhase(result);
    expect(checkRouteAccess(hamlet, '/hamlet').ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 二、启动路由恢复
// ---------------------------------------------------------------------------

describe('启动路由恢复', () => {
  it('5. gamePhase → 路由映射完整', () => {
    expect(routeForPhase('home')).toBe('/');
    expect(routeForPhase('campaign-setup')).toBe('/setup');
    expect(routeForPhase('skill-loadout')).toBe('/loadout');
    expect(routeForPhase('quest-select')).toBe('/quests');
    expect(routeForPhase('dungeon-explore')).toBe('/dungeon');
    expect(routeForPhase('battle')).toBe('/battle');
    expect(routeForPhase('quest-result')).toBe('/result');
    expect(routeForPhase('hamlet')).toBe('/hamlet');
  });

  it('6. 存档恢复后按 gamePhase 计算恢复路由（而不是停在首页）', () => {
    const c = battleCampaign();
    saveCampaign(c);
    const loaded = loadCampaign()!;
    expect(nearestLegalPath(loaded)).toBe('/battle');
    // 数据缺失时回退首页而不是进入错误页面
    expect(nearestLegalPath({ ...loaded, battle: null })).toBe('/');
    expect(nearestLegalPath(null)).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// 三、存档校验 / 迁移 / 损坏处理
// ---------------------------------------------------------------------------

describe('存档校验与迁移', () => {
  it('7. 损坏存档（非法 JSON）不抛异常，状态为 corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{broken json!!');
    expect(() => loadSaveDetailed()).not.toThrow();
    const r = loadSaveDetailed();
    expect(r.status).toBe('corrupt');
    expect(r.campaign).toBeNull();
    expect(loadCampaign()).toBeNull(); // 兼容接口同样不崩
  });

  it('8. 不支持的存档版本给出明确错误', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, savedAt: 'x', campaign: {} }));
    const r = loadSaveDetailed();
    expect(r.status).toBe('unsupported');
    expect(r.error).toContain('99');
  });

  it('9. 合法 v1 旧存档可迁移为 v2 并正常读档', () => {
    const c = freshCampaign();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ saveVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', campaign: c })
    );
    const migrated = migrateSaveFile(JSON.parse(localStorage.getItem(STORAGE_KEY)!));
    expect(migrated?.version).toBe(SAVE_VERSION);
    expect(migrated?.savedAt).toBe('2026-01-01T00:00:00.000Z');
    const r = loadSaveDetailed();
    expect(r.status).toBe('ok');
    expect(r.campaign?.gamePhase).toBe('dungeon-explore');
    expect(r.campaign?.heroes.length).toBe(4);
  });

  it('10. validateSaveFile 拦截结构性问题', () => {
    expect(validateSaveFile(null)).not.toBeNull();
    expect(validateSaveFile({ version: SAVE_VERSION })).not.toBeNull();
    const good = createSaveSnapshot(freshCampaign());
    expect(validateSaveFile(good)).toBeNull();
    // battle 阶段但战斗单位引用了不存在的英雄
    const b = battleCampaign();
    const bad = createSaveSnapshot({
      ...b,
      battle: {
        ...b.battle!,
        heroes: b.battle!.heroes.map((u) => ({ ...u, sourceId: 'ghost' })),
      },
    });
    expect(validateSaveFile(bad)).toContain('不存在的英雄');
  });

  it('11. sanitizeSaveFile 回退非法阶段并修复负数 Gold', () => {
    const c = freshCampaign();
    // battle 阶段但 battle 缺失 → 回退 dungeon-explore
    const s1 = sanitizeSaveFile(createSaveSnapshot({ ...c, gamePhase: 'battle', battle: null }));
    expect(s1.campaign.gamePhase).toBe('dungeon-explore');
    // dungeon 阶段但 dungeon 缺失 → 回退 quest-select
    const s2 = sanitizeSaveFile(createSaveSnapshot({ ...c, dungeon: null }));
    expect(s2.campaign.gamePhase).toBe('quest-select');
    // 负数 Gold 归零
    const s3 = sanitizeSaveFile(createSaveSnapshot({ ...c, gold: -5 }));
    expect(s3.campaign.gold).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 四、导入 / 导出
// ---------------------------------------------------------------------------

describe('存档导入导出', () => {
  it('12. 导出 → 导入 round-trip 保持战役一致', () => {
    const c = finishQuest(withObjective(freshCampaign()), 'left');
    saveCampaign(c);
    const json = exportSaveString();
    expect(json).toBeTruthy();
    clearCampaign();
    const r = importSaveString(json!);
    expect(r.error).toBeNull();
    expect(r.campaign?.gamePhase).toBe('quest-result');
    expect(r.campaign?.gold).toBe(c.gold);
    expect(r.campaign?.completedQuestCount).toBe(1);
    // 导入成功后本地存档已恢复
    expect(loadSaveDetailed().status).toBe('ok');
  });

  it('13. 非法导入不覆盖现有存档', () => {
    const c = freshCampaign();
    saveCampaign(c);
    const before = localStorage.getItem(STORAGE_KEY);
    expect(importSaveString('not json at all').error).toContain('JSON');
    expect(importSaveString(JSON.stringify({ version: 99 })).error).toContain('99');
    expect(importSaveString(JSON.stringify({ version: SAVE_VERSION, savedAt: 'x' })).error).toBeTruthy();
    // 三次非法导入后原存档保持不变
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(loadSaveDetailed().status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// 五、防重复结算
// ---------------------------------------------------------------------------

describe('防重复结算', () => {
  it('14. Battle 奖励不能重复领取（resolveVictory 幂等）', () => {
    let c = battleCampaign();
    const reward = c.battle!.rewards.gold;
    c = { ...c, battle: { ...c.battle!, status: 'victory' } };
    const once = resolveVictory(c);
    expect(once.gold).toBe(c.gold + reward);
    expect(once.battle).toBeNull();
    // 再次调用：battle 已清除 → 原样返回
    const twice = resolveVictory(once);
    expect(twice).toBe(once);
    // active/defeat 状态也不发奖励
    const active = battleCampaign();
    expect(resolveVictory(active)).toBe(active);
  });

  it('15. Quest 奖励不能重复领取（finishQuest 幂等）', () => {
    const once = finishQuest(withObjective(freshCampaign()), 'left');
    const twice = finishQuest(once, 'left');
    expect(twice).toBe(once);
    expect(twice.gold).toBe(once.gold);
    expect(twice.completedQuestCount).toBe(1);
  });

  it('16. Hamlet 事件效果不重复执行', () => {
    const resolved = finishQuest(withObjective(freshCampaign()), 'left');
    const c = startHamletPhase(resolved);
    expect(c.gamePhase).toBe('hamlet');
    // 已在 hamlet 阶段重复调用 → 阶段守卫拦截
    expect(startHamletPhase(c)).toBe(c);
    // 未结算状态调用 → 同样拦截（原样返回同一引用）
    const fresh = freshCampaign();
    expect(startHamletPhase(fresh)).toBe(fresh);
  });

  it('17. 双击建筑不会重复扣 Gold', () => {
    let c = startHamletPhase(finishQuest(withObjective(freshCampaign()), 'left'));
    c = {
      ...c,
      hamlet: { ...c.hamlet, caretakerBlockedBuildingId: 'blacksmith' },
      heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, wounds: 2 } : h)),
    };
    const hero = c.heroes[0];
    const once = visitHamletBuilding(c, hero.instanceId, 'sanitarium');
    expect(once.gold).toBe(c.gold - 3);
    // 第二次点击：英雄已行动 + 建筑已占用 → 原样返回，不再扣钱
    const twice = visitHamletBuilding(once, hero.instanceId, 'sanitarium');
    expect(twice).toBe(once);
    expect(twice.gold).toBe(c.gold - 3);
  });

  it('18. 双击结束当天不会跳过两天', () => {
    let c = startHamletPhase(finishQuest(withObjective(freshCampaign()), 'left'));
    expect(c.hamlet.preparationDays).toBe(2);
    for (const h of c.heroes) c = skipHeroAction(c, h.instanceId);
    const once = endHamletDay(c);
    expect(once.hamlet.currentDay).toBe(2);
    expect(once.hamlet.preparationDays).toBe(1);
    // 第二次点击：新的一天行动未完成 → no-op
    const twice = endHamletDay(once);
    expect(twice).toBe(once);
    expect(twice.hamlet.currentDay).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 六、状态隔离（新任务 / 新战斗不继承旧状态）
// ---------------------------------------------------------------------------

describe('状态隔离', () => {
  it('19. 开始新任务不会继承上一次的 DungeonState', () => {
    let c = startHamletPhase(finishQuest(withObjective(freshCampaign()), 'left'));
    for (let d = 0; d < 2; d += 1) {
      for (const h of c.heroes) c = skipHeroAction(c, h.instanceId);
      c = endHamletDay(c);
    }
    expect(c.gamePhase).toBe('quest-select');
    expect(c.dungeon).toBeNull();
    c = selectQuest(c, 'recover-relic');
    expect(c.dungeon!.questId).toBe('recover-relic');
    expect(c.dungeon!.roomsCleared).toBe(0);
    expect(c.dungeon!.objectiveComplete).toBe(false);
    expect(c.battle).toBeNull();
  });

  it('20. 开始新战斗不会继承上一场战斗状态', () => {
    // 第一场战斗：打完并结算
    let c = battleCampaign();
    const firstRoomId = c.battle!.sourceRoomId;
    c = resolveVictory({ ...c, battle: { ...c.battle!, status: 'victory' } });
    expect(c.battle).toBeNull();
    // 第二场战斗：全新初始化
    const nextRoom = c.dungeon!.rooms.find(
      (r) => r.type === 'battle' && r.status !== 'cleared'
    );
    if (nextRoom) {
      const c2 = initBattle(c, nextRoom.id);
      expect(c2.battle!.sourceRoomId).not.toBe(firstRoomId);
      expect(c2.battle!.round).toBe(1);
      expect(c2.battle!.status).toBe('active');
      expect(c2.battle!.monsters.every((m) => m.isAlive && m.hp === m.maxHp)).toBe(true);
    }
  });

  it('21. Blacksmith 临时 Skill Form 经过一次任务结算后失效', () => {
    let c = startHamletPhase(finishQuest(withObjective(freshCampaign()), 'left'));
    c = { ...c, hamlet: { ...c.hamlet, caretakerBlockedBuildingId: 'sanitarium' } };
    const heroId = c.heroes[0].instanceId;
    const skillId = c.heroes[0].equippedSkillIds[0];
    c = visitBlacksmith(c, heroId, skillId);
    expect(getEffectiveSkillLevel(c, c.heroes[0], skillId)).toBe(2);
    for (const h of c.heroes.slice(1)) c = skipHeroAction(c, h.instanceId);
    c = endHamletDay(c);
    for (const h of c.heroes) c = skipHeroAction(c, h.instanceId);
    c = endHamletDay(c);
    c = selectQuest(c, 'recover-relic');
    expect(getEffectiveSkillLevel(c, c.heroes[0], skillId)).toBe(2); // 带入下一任务
    const done = finishQuest(withObjective(c), 'left');
    expect(getEffectiveSkillLevel(done, done.heroes[0], skillId)).toBe(1); // 结算后失效
    expect(getActiveSkillFormOverrides(done, heroId)).toHaveLength(0);
    // 不会残留到再下一次任务
    expect(done.lastQuestResult).toBeTruthy();
  });
});
