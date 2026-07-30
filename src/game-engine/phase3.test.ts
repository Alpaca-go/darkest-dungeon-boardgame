import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BattleState, BattleUnit, CampaignState } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource } from './random';
import {
  MAX_ROUNDS,
  initBattle,
  advanceTurn,
  heroMove,
  canHeroMove,
  heroUseSkill,
  endHeroTurn,
  runMonsterTurn,
  checkEnd,
  resolveVictory,
  markDefeat,
  legalTargetsForActor,
  normalizeHeroSkill,
} from './battle';
import { retreatFromBattle } from './dungeon';
import { resolveAttack, applyDamage } from './combat-resolution';
import { applyStartOfTurn, applyEffects, tickStun } from './status-effects';
import { isSkillUsableFrom, isLegalTarget } from './targeting';
import { createInitiativeOrder } from './initiative';
import { selectTargetByRule, chooseMonsterAction } from './monster-ai';
import { getSkillById } from '../data/skills';
import { getMonsterSkillById } from '../data/monster-skills';
import { clearCampaign } from './save';

const FOUR_HEROES = ['crusader', 'vestal', 'highwayman', 'hellion'];

/** 依次消费队列中的随机值，耗尽后回落到最后一个值。 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function freshCampaign(): CampaignState {
  return selectQuest(applyDefaultLoadout(selectParty(createNewCampaign(), FOUR_HEROES)), 'scout-ahead');
}

/** 手工构造战斗单位（规则测试无需经过 initBattle 的随机流程）。 */
function makeUnit(partial: Partial<BattleUnit> & { id: string; side: 'hero' | 'monster' }): BattleUnit {
  return {
    name: partial.id,
    sourceId: partial.id,
    maxHp: 20,
    hp: 20,
    stress: 0,
    position: 1,
    speed: 4,
    stance: 'aggressive',
    isAlive: true,
    // ---- Phase 6：BattleUnit 必填字段 ----
    atDeathsDoor: false,
    deathblowRollCount: 0,
    stunned: 0,
    bleed: 0,
    blight: 0,
    marked: false,
    buffs: [],
    debuffs: [],
    actionPoints: 0,
    ...partial,
  };
}

/** 手工构造最小 BattleState。 */
function makeBattle(heroes: BattleUnit[], monsters: BattleUnit[], over?: Partial<BattleState>): BattleState {
  return {
    battleId: 'btl_test',
    status: 'active',
    round: 1,
    maxRounds: MAX_ROUNDS,
    heroes,
    monsters,
    initiativeOrder: [...heroes, ...monsters].filter((u) => u.isAlive).map((u) => u.id),
    initiativeIndex: -1,
    activeActorId: null,
    currentActionPoints: 0,
    selectedSkillId: null,
    selectedTargetId: null,
    battleLog: [],
    sourceRoomId: 'A',
    rewards: { gold: 25 },
    ...over,
  };
}

beforeEach(() => {
  clearCampaign();
  setRandomSource(() => 0); // 默认全部取最小值，保证确定性
});

afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// 一、战斗初始化与序列化
// ---------------------------------------------------------------------------

describe('战斗初始化', () => {
  it('initBattle 建立完整战斗：4 英雄、2-4 怪物、先攻顺序、gamePhase=battle', () => {
    const c = initBattle(freshCampaign(), 'A');
    expect(c.gamePhase).toBe('battle');
    const b = c.battle!;
    expect(b.status).toBe('active');
    expect(b.heroes.length).toBe(4);
    expect(b.monsters.length).toBeGreaterThanOrEqual(2);
    expect(b.monsters.length).toBeLessThanOrEqual(4);
    // 位置合法（1..4 且互不重复）
    const heroPos = b.heroes.map((h) => h.position).sort();
    expect(heroPos).toEqual([1, 2, 3, 4]);
    for (const m of b.monsters) expect(m.position).toBeGreaterThanOrEqual(1);
    // 先攻包含所有存活单位
    expect(b.initiativeOrder.length).toBe(b.heroes.length + b.monsters.length);
    expect(b.battleLog.length).toBeGreaterThan(0);
  });

  it('BattleState 可 JSON 序列化并无损还原（localStorage 兼容）', () => {
    const c = initBattle(freshCampaign(), 'A');
    const restored = JSON.parse(JSON.stringify(c.battle)) as BattleState;
    expect(restored).toEqual(c.battle);
  });
});

// ---------------------------------------------------------------------------
// 二、先攻与轮次
// ---------------------------------------------------------------------------

describe('先攻与轮次', () => {
  it('createInitiativeOrder 只包含存活单位', () => {
    const dead = makeUnit({ id: 'h-dead', side: 'hero', isAlive: false, hp: 0 });
    const alive = makeUnit({ id: 'h-alive', side: 'hero' });
    const order = createInitiativeOrder([dead, alive]);
    expect(order).toEqual(['h-alive']);
  });

  it('advanceTurn 跳过 Stun 单位并使其层数 -1', () => {
    const h1 = makeUnit({ id: 'h1', side: 'hero', stunned: 1 });
    const h2 = makeUnit({ id: 'h2', side: 'hero', position: 2 });
    const m1 = makeUnit({ id: 'm1', side: 'monster', hp: 50, maxHp: 50 });
    const b = makeBattle([h1, h2], [m1], { initiativeOrder: ['h1', 'h2', 'm1'] });
    const next = advanceTurn(b);
    // h1 被跳过，激活 h2
    expect(next.activeActorId).toBe('h2');
    expect(next.heroes.find((h) => h.id === 'h1')!.stunned).toBe(0);
    expect(next.battleLog.some((e) => e.message.includes('Stun'))).toBe(true);
  });

  it(`超过 ${MAX_ROUNDS} 轮未结束则判负（被迫撤退）`, () => {
    const h1 = makeUnit({ id: 'h1', side: 'hero' });
    const m1 = makeUnit({ id: 'm1', side: 'monster', hp: 999, maxHp: 999 });
    const b = makeBattle([h1], [m1], {
      round: MAX_ROUNDS,
      initiativeOrder: ['h1'],
      initiativeIndex: 0, // h1 已行动，列表耗尽
    });
    const next = advanceTurn(b);
    expect(next.status).toBe('defeat');
    expect(next.battleLog.some((e) => e.message.includes('撤退'))).toBe(true);
  });

  it('英雄回合开始时获得 2 行动点', () => {
    const h1 = makeUnit({ id: 'h1', side: 'hero' });
    const m1 = makeUnit({ id: 'm1', side: 'monster' });
    const b = makeBattle([h1], [m1], { initiativeOrder: ['h1', 'm1'] });
    const next = advanceTurn(b);
    expect(next.activeActorId).toBe('h1');
    expect(next.currentActionPoints).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 三、攻击判定（d10 / 暴击）
// ---------------------------------------------------------------------------

describe('攻击判定', () => {
  const smite = normalizeHeroSkill(getSkillById('crusader-smite')!); // accuracy 8, 5-8

  it('掷骰 <= accuracy 命中，伤害落在 [min, max] 区间', () => {
    setRandomSource(seqRng([0.0, 0.0])); // roll=1 命中，randInt 取 min
    const res = resolveAttack(smite);
    expect(res.hit).toBe(true);
    expect(res.crit).toBe(false);
    expect(res.damage).toBe(5);
  });

  it('掷骰 > accuracy 未命中，伤害为 0', () => {
    setRandomSource(() => 0.85); // roll=9 > 8
    const res = resolveAttack(smite);
    expect(res.hit).toBe(false);
    expect(res.damage).toBe(0);
  });

  it('自然 10 必中且暴击，造成最大伤害', () => {
    setRandomSource(() => 0.99); // roll=10
    const res = resolveAttack(smite);
    expect(res.hit).toBe(true);
    expect(res.crit).toBe(true);
    expect(res.damage).toBe(8);
  });

  it('applyDamage 使 HP 归零时标记死亡', () => {
    const u = makeUnit({ id: 'x', side: 'monster', hp: 3 });
    const dead = applyDamage(u, 5);
    expect(dead.hp).toBe(0);
    expect(dead.isAlive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 四、状态效果
// ---------------------------------------------------------------------------

describe('状态效果', () => {
  it('Bleed 回合开始造成等同层数的伤害并递减一层', () => {
    const u = makeUnit({ id: 'u', side: 'hero', hp: 10, bleed: 3 });
    const { unit, messages } = applyStartOfTurn(u);
    expect(unit.hp).toBe(7);
    expect(unit.bleed).toBe(2);
    expect(messages.length).toBe(1);
  });

  it('Blight 持续伤害可致死', () => {
    const u = makeUnit({ id: 'u', side: 'monster', hp: 2, blight: 3 });
    const { unit } = applyStartOfTurn(u);
    expect(unit.hp).toBe(0);
    expect(unit.isAlive).toBe(false);
  });

  it('applyEffects 可叠加多种效果，tickStun 递减眩晕层数', () => {
    let u = makeUnit({ id: 'u', side: 'hero' });
    u = applyEffects(u, [
      { type: 'bleed', amount: 2 },
      { type: 'stun', amount: 1 },
      { type: 'mark', amount: 1 },
    ]);
    expect(u.bleed).toBe(2);
    expect(u.stunned).toBe(1);
    expect(u.marked).toBe(true);
    expect(tickStun(u).stunned).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 五、站位与目标合法性
// ---------------------------------------------------------------------------

describe('站位与目标', () => {
  const smite = normalizeHeroSkill(getSkillById('crusader-smite')!); // from [1,2] → target [1,2,3]

  it('站位不满足时技能不可用', () => {
    const front = makeUnit({ id: 'h', side: 'hero', position: 1 });
    const back = makeUnit({ id: 'h', side: 'hero', position: 4 });
    expect(isSkillUsableFrom(front, smite)).toBe(true);
    expect(isSkillUsableFrom(back, smite)).toBe(false);
  });

  it('死亡或站位超出范围的敌人不是合法目标', () => {
    const actor = makeUnit({ id: 'h', side: 'hero', position: 1 });
    const deadFoe = makeUnit({ id: 'm1', side: 'monster', isAlive: false, hp: 0 });
    const farFoe = makeUnit({ id: 'm2', side: 'monster', position: 4 });
    const okFoe = makeUnit({ id: 'm3', side: 'monster', position: 2 });
    expect(isLegalTarget(actor, deadFoe, smite)).toBe(false);
    expect(isLegalTarget(actor, farFoe, smite)).toBe(false);
    expect(isLegalTarget(actor, okFoe, smite)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 六、英雄行动（移动 / 技能 / 结束回合）
// ---------------------------------------------------------------------------

describe('英雄行动', () => {
  function heroTurnBattle() {
    const h1 = makeUnit({ id: 'h1', side: 'hero', position: 2, equippedSkillIds: ['crusader-smite', 'crusader-holy-lance', 'crusader-battle-heal'] });
    const h2 = makeUnit({ id: 'h2', side: 'hero', position: 1, hp: 10 });
    const m1 = makeUnit({ id: 'm1', side: 'monster', position: 1, hp: 6, maxHp: 20 });
    return makeBattle([h1, h2], [m1], {
      initiativeOrder: ['h1', 'm1', 'h2'],
      initiativeIndex: 0,
      activeActorId: 'h1',
      currentActionPoints: 2,
    });
  }

  it('移动消耗 1 行动点；目标位被队友占据时不可移动', () => {
    const b = heroTurnBattle();
    expect(canHeroMove(b, 'h1', -1)).toBe(false); // 位置 1 被 h2 占据
    expect(canHeroMove(b, 'h1', 1)).toBe(true);
    const moved = heroMove(b, 'h1', 1);
    expect(moved.heroes.find((h) => h.id === 'h1')!.position).toBe(3);
    expect(moved.currentActionPoints).toBe(1);
  });

  it('使用攻击技能命中并可施加状态效果（Holy Lance → Bleed）', () => {
    setRandomSource(seqRng([0.0, 0.0])); // roll=1 命中，min 伤害
    const b = heroTurnBattle();
    const next = heroUseSkill(b, 'h1', 'crusader-holy-lance', 'm1');
    const m = next.monsters.find((x) => x.id === 'm1')!;
    expect(m.hp).toBe(2); // 6 - 4(min)
    expect(m.bleed).toBe(1);
    expect(next.currentActionPoints).toBe(1);
  });

  it('治疗技能恢复队友生命且不超过上限', () => {
    const b = heroTurnBattle();
    const next = heroUseSkill(b, 'h1', 'crusader-battle-heal', 'h2');
    expect(next.heroes.find((h) => h.id === 'h2')!.hp).toBe(18); // 10 + 8
  });

  it('legalTargetsForActor 返回技能的合法目标集合', () => {
    const b = heroTurnBattle();
    expect(legalTargetsForActor(b, 'crusader-smite')).toEqual(['m1']);
    expect(legalTargetsForActor(b, 'crusader-battle-heal')).toEqual(['h2']);
  });

  it('击杀全部怪物后战斗立即胜利', () => {
    setRandomSource(seqRng([0.0, 0.9])); // roll=1 命中，randInt 取高值确保击杀
    const b = heroTurnBattle();
    const next = heroUseSkill(b, 'h1', 'crusader-smite', 'm1'); // 5-8 伤害 vs 6 HP
    expect(next.monsters[0].isAlive).toBe(false);
    expect(next.status).toBe('victory');
  });

  it('endHeroTurn 推进到下一个行动者', () => {
    const b = heroTurnBattle();
    setRandomSource(() => 0.85); // 怪物攻击未命中，避免干扰
    const next = endHeroTurn(b, 'h1');
    // m1 自动行动后轮到 h2
    expect(next.activeActorId).toBe('h2');
  });
});

// ---------------------------------------------------------------------------
// 七、怪物 AI
// ---------------------------------------------------------------------------

describe('怪物 AI', () => {
  const heroes = [
    makeUnit({ id: 'h1', side: 'hero', position: 1, hp: 20 }),
    makeUnit({ id: 'h2', side: 'hero', position: 2, hp: 5 }),
    makeUnit({ id: 'h3', side: 'hero', position: 3, hp: 15, stress: 9 }),
  ];

  it('selectTargetByRule 按规则选择目标', () => {
    expect(selectTargetByRule(heroes, 'closest')!.id).toBe('h1');
    expect(selectTargetByRule(heroes, 'furthest')!.id).toBe('h3');
    expect(selectTargetByRule(heroes, 'mostWounded')!.id).toBe('h2');
    expect(selectTargetByRule(heroes, 'mostStressed')!.id).toBe('h3');
  });

  it('死亡英雄不会被选为目标', () => {
    const withDead = [
      makeUnit({ id: 'h1', side: 'hero', position: 1, isAlive: false, hp: 0 }),
      makeUnit({ id: 'h2', side: 'hero', position: 2 }),
    ];
    expect(selectTargetByRule(withDead, 'closest')!.id).toBe('h2');
  });

  it('runMonsterTurn 自动攻击英雄并写日志', () => {
    setRandomSource(seqRng([0.0, 0.0])); // roll=1 命中 bash（accuracy 8），min 4 伤害
    const h1 = makeUnit({ id: 'h1', side: 'hero', position: 1, hp: 20 });
    const m1 = makeUnit({
      id: 'm1', side: 'monster', position: 1,
      monsterSkillIds: ['bone-soldier-bash', 'bone-soldier-cleave'],
      targetRule: 'closest',
    });
    const b = makeBattle([h1], [m1], { activeActorId: 'm1' });
    const next = runMonsterTurn(b, 'm1');
    const h = next.heroes[0];
    expect(h.hp).toBe(16); // 20 - 4
    expect(h.stunned).toBe(1); // bash 附带 stun
    expect(next.battleLog.some((e) => e.message.includes('Bone Bash') || e.message.includes('bash'))).toBe(true);
  });

  it('chooseMonsterAction 在无合法目标技能时返回 null', () => {
    // charm 只能打位置 1，把英雄放到位置 4；bash/cleave 需怪物在位置 1..2
    const h1 = makeUnit({ id: 'h1', side: 'hero', position: 4 });
    const m1 = makeUnit({
      id: 'm1', side: 'monster', position: 4,
      monsterSkillIds: ['bone-soldier-bash', 'bone-soldier-cleave'],
      targetRule: 'closest',
    });
    const b = makeBattle([h1], [m1]);
    expect(chooseMonsterAction(b, m1)).toBeNull();
    expect(getMonsterSkillById('bone-soldier-bash')!.usableFromPositions).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// 八、胜负结算与返回地牢
// ---------------------------------------------------------------------------

describe('胜负结算', () => {
  it('checkEnd：全员阵亡判负', () => {
    const h1 = makeUnit({ id: 'h1', side: 'hero', isAlive: false, hp: 0 });
    const m1 = makeUnit({ id: 'm1', side: 'monster' });
    const b = makeBattle([h1], [m1]);
    expect(checkEnd(b).status).toBe('defeat');
  });

  it('resolveVictory：房间 cleared、+25 Gold、英雄状态同步、返回地牢', () => {
    let c = initBattle(freshCampaign(), 'A');
    const goldBefore = c.gold;
    // 模拟战斗结束：怪全灭、首个英雄受了 6 点伤
    const b = c.battle!;
    const hurtHero = { ...b.heroes[0], hp: b.heroes[0].maxHp - 6, stress: 3 };
    c = {
      ...c,
      battle: {
        ...b,
        status: 'victory',
        heroes: [hurtHero, ...b.heroes.slice(1)],
        monsters: b.monsters.map((m) => ({ ...m, hp: 0, isAlive: false })),
      },
    };
    const done = resolveVictory(c);
    expect(done.gamePhase).toBe('dungeon-explore');
    expect(done.battle).toBeNull();
    expect(done.gold).toBe(goldBefore + 25);
    const room = done.dungeon!.rooms.find((r) => r.id === 'A')!;
    expect(room.status).toBe('cleared');
    const hero = done.heroes.find((h) => h.instanceId === hurtHero.sourceId)!;
    expect(hero.wounds).toBe(6);
    expect(hero.stress).toBe(3);
  });

  it('markDefeat + retreatFromBattle：战败后撤退，房间不清除', () => {
    let c = initBattle(freshCampaign(), 'A');
    c = markDefeat(c);
    expect(c.battle!.status).toBe('defeat');
    const out = retreatFromBattle(c);
    expect(out.gamePhase).toBe('dungeon-explore');
    expect(out.battle).toBeNull();
    const room = out.dungeon!.rooms.find((r) => r.id === 'A')!;
    expect(room.status).not.toBe('cleared');
  });
});
