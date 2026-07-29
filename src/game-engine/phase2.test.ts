import { describe, it, expect, beforeEach } from 'vitest';
import type { CampaignState } from '../types';
import {
  createNewCampaign,
  selectParty,
  applyDefaultLoadout,
  isLoadoutComplete,
  canProceedToLoadout,
  selectQuest,
} from './campaign';
import {
  scoutDungeon,
  canScout,
  canMoveTo,
  moveToRoom,
  generateDungeon,
  TREASURE_GOLD,
} from './dungeon';
import { applyExplorationResult, resolveExplorationEvent } from './exploration';
import { saveCampaign, loadCampaign, clearCampaign } from './save';

const FOUR_HEROES = ['crusader', 'vestal', 'highwayman', 'hellion'];

function freshCampaign(): CampaignState {
  return selectParty(createNewCampaign(), FOUR_HEROES);
}

beforeEach(() => {
  clearCampaign();
});

describe('英雄选择', () => {
  it('只有选满 4 名英雄才能继续到技能配置', () => {
    const three = selectParty(createNewCampaign(), FOUR_HEROES.slice(0, 3));
    expect(three.heroes.length).toBe(3);
    expect(canProceedToLoadout(three)).toBe(false);

    const four = selectParty(createNewCampaign(), FOUR_HEROES);
    expect(four.heroes.length).toBe(4);
    expect(canProceedToLoadout(four)).toBe(true);
  });

  it('不允许重复选择同一英雄', () => {
    const dup = selectParty(createNewCampaign(), [...FOUR_HEROES, 'crusader']);
    expect(dup.heroes.length).toBe(4);
    const ids = dup.heroes.map((h) => h.heroId);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('技能配置', () => {
  it('每名英雄配置 3 个技能后才能继续', () => {
    const c = freshCampaign();
    expect(isLoadoutComplete(c)).toBe(false);

    const loaded = applyDefaultLoadout(c);
    expect(isLoadoutComplete(loaded)).toBe(true);
    for (const h of loaded.heroes) {
      expect(h.equippedSkillIds.length).toBe(3);
    }
  });
});

describe('Scout 与移动', () => {
  it('Scout 揭示相邻房间并增加全队 Stress', () => {
    let c = selectQuest(freshCampaign(), 'scout-ahead');
    expect(canScout(c.dungeon!)).toBe(true);

    const before = c.heroes.map((h) => h.stress);
    c = scoutDungeon(c);
    // 相邻隐藏房间（A）被揭示
    const a = c.dungeon!.rooms.find((r) => r.id === 'A')!;
    expect(a.status).toBe('revealed');
    // 全队 Stress +1
    c.heroes.forEach((h, i) => expect(h.stress).toBe(before[i] + 1));
    // 没有可揭示房间后 Scout 禁用
    expect(canScout(c.dungeon!)).toBe(false);
  });

  it('不能移动到非相邻房间', () => {
    const c = selectQuest(freshCampaign(), 'scout-ahead');
    // start 仅相邻 A，C 不相邻
    expect(canMoveTo(c.dungeon!, 'A')).toBe(true);
    expect(canMoveTo(c.dungeon!, 'C')).toBe(false);
  });

  it('移动到相邻房间会触发（可能随机的）探索事件但不改变房间归属', () => {
    const c = selectQuest(freshCampaign(), 'scout-ahead');
    const moved = moveToRoom(c, 'A');
    expect(moved.dungeon!.currentRoomId).toBe('A');
  });
});

describe('房间结果', () => {
  it('Empty 房间可以自动清除', () => {
    const c0 = selectQuest(freshCampaign(), 'scout-ahead');
    const d = generateDungeon('scout-ahead');
    d.currentRoomId = 'D'; // D 与 E(empty) 相邻
    const c = { ...c0, dungeon: d };
    const clearedBefore = c.dungeon!.roomsCleared;
    const moved = moveToRoom(c, 'E');
    const e = moved.dungeon!.rooms.find((r) => r.id === 'E')!;
    expect(e.status).toBe('cleared');
    expect(moved.dungeon!.roomsCleared).toBe(clearedBefore + 1);
  });

  it('Treasure 房间会增加 Gold', () => {
    const c0 = selectQuest(freshCampaign(), 'recover-relic');
    const d = generateDungeon('recover-relic');
    d.currentRoomId = 'A'; // A 与 D(treasure) 相邻
    const c = { ...c0, dungeon: d };
    const goldBefore = c.gold;
    const moved = moveToRoom(c, 'D');
    const roomD = moved.dungeon!.rooms.find((r) => r.id === 'D')!;
    expect(roomD.status).toBe('cleared');
    expect(moved.gold).toBe(goldBefore + TREASURE_GOLD);
  });

  it('进入 Battle 房间后 gamePhase 变为 battle', () => {
    const c0 = selectQuest(freshCampaign(), 'scout-ahead');
    const d = generateDungeon('scout-ahead');
    d.currentRoomId = 'start';
    const c = { ...c0, dungeon: d };
    const moved = moveToRoom(c, 'A'); // A 为 battle
    expect(moved.gamePhase).toBe('battle');
    expect(moved.battle).not.toBeNull();
  });
});

describe('补给消耗', () => {
  it('Hunger 在有 Food 时消耗 1 Food', () => {
    let c = freshCampaign();
    c = { ...c, provisions: { ...c.provisions, food: 3 } };
    const next = applyExplorationResult(c, 'hunger');
    expect(next.provisions.food).toBe(2);
  });

  it('Hunger 在缺 Food 时全队各受 1 Wound', () => {
    let c = freshCampaign();
    c = { ...c, provisions: { ...c.provisions, food: 0 } };
    const next = applyExplorationResult(c, 'hunger');
    expect(next.provisions.food).toBe(0);
    for (const h of next.heroes) expect(h.wounds).toBe(1);
  });

  it('Darkness / Trap / Rubble 在缺补给时增加全队 Stress', () => {
    let c = freshCampaign();
    c = { ...c, provisions: { ...c.provisions, torch: 0, tool: 0 } };
    for (const result of ['darkness', 'trap', 'rubble'] as const) {
      const next = applyExplorationResult(c, result);
      for (const h of next.heroes) expect(h.stress).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('自动存档与恢复', () => {
  it('保存后刷新（重新加载）可以恢复当前战役进度', () => {
    let c = selectQuest(freshCampaign(), 'scout-ahead');
    c = scoutDungeon(c);
    c = moveToRoom(c, 'A');
    saveCampaign(c);

    const loaded = loadCampaign();
    expect(loaded).not.toBeNull();
    expect(loaded!.gamePhase).toBe(c.gamePhase);
    expect(loaded!.heroes.length).toBe(4);
    expect(loaded!.currentQuestId).toBe('scout-ahead');
  });

  it('resolveExplorationEvent 随机事件仍保持存档结构有效', () => {
    const c = resolveExplorationEvent(freshCampaign());
    expect(c.heroes.length).toBe(4);
    // 补给总量不为负
    for (const v of Object.values(c.provisions)) expect(v).toBeGreaterThanOrEqual(0);
  });
});
