import type {
  BattleState,
  BattleUnit,
  CampaignState,
  HeroInstance,
  MonsterDefinition,
  SkillDefinition,
} from '../types';
import { createId, nowIso } from './random';
import { getSkillById } from '../data/skills';
import { getMonsterSkillById } from '../data/monster-skills';
import { buildEncounter } from '../data/battle-encounters';
import { createInitiativeOrder, findUnit } from './initiative';
import {
  allUnits,
  computeLegalTargetIds,
  isLegalTarget,
  isSkillUsableFrom,
} from './targeting';
import { applyDamage, resolveAttack } from './combat-resolution';
import { applyEffects, applyStartOfTurn, tickStun } from './status-effects';
import { chooseMonsterAction } from './monster-ai';
import { pushLog } from './log';
import type { GameLogEntry } from '../types';

export const MAX_ROUNDS = 4;
const BATTLE_REWARD_GOLD = 25;
const VICTORY_LOG = '所有敌人被击败，战斗胜利！';
const DEFEAT_LOG = '全员倒下，战斗失败……';

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function setUnit(state: BattleState, unit: BattleUnit): BattleState {
  if (unit.side === 'hero') {
    return { ...state, heroes: state.heroes.map((h) => (h.id === unit.id ? unit : h)) };
  }
  return { ...state, monsters: state.monsters.map((m) => (m.id === unit.id ? unit : m)) };
}

function pushBattleLog(state: BattleState, message: string, kind: GameLogEntry['kind'] = 'info'): BattleState {
  const entry: GameLogEntry = { id: createId('blog'), at: nowIso(), message, kind };
  return { ...state, battleLog: [...state.battleLog, entry].slice(-100) };
}

/** 按 id 查找战斗单位（英雄或怪物）。 */
export function getUnit(state: BattleState, id: string | null): BattleUnit | undefined {
  return findUnit(state, id);
}

/** 当前行动单位。 */
export function getActiveUnit(state: BattleState): BattleUnit | undefined {
  return findUnit(state, state.activeActorId);
}

function makeHeroUnit(hero: HeroInstance, index: number): BattleUnit {
  const hp = Math.max(0, hero.maxLife - hero.wounds);
  return {
    id: `u_${hero.instanceId}`,
    name: hero.name,
    side: 'hero',
    sourceId: hero.instanceId,
    maxHp: hero.maxLife,
    hp,
    stress: hero.stress,
    position: index + 1,
    speed: hero.speed,
    stance: hero.stance,
    isAlive: hero.isAlive && hp > 0,
    stunned: 0,
    bleed: 0,
    blight: 0,
    marked: false,
    buffs: [],
    debuffs: [],
    actionPoints: 0,
    damageBonus: hero.temporaryDamageBonus ?? 0,
    equippedSkillIds: [...hero.equippedSkillIds],
  };
}

function makeMonsterUnit(monster: MonsterDefinition, index: number): BattleUnit {
  return {
    id: `u_${monster.id}_${index}`,
    name: monster.name,
    side: 'monster',
    sourceId: monster.id,
    maxHp: monster.maxHp,
    hp: monster.maxHp,
    stress: 0,
    position: index + 1,
    speed: monster.speed,
    stance: 'aggressive',
    isAlive: true,
    stunned: 0,
    bleed: 0,
    blight: 0,
    marked: false,
    buffs: [],
    debuffs: [],
    actionPoints: 0,
    monsterSkillIds: [...monster.skillIds],
    targetRule: monster.targetRule,
  };
}

/** 为技能补齐默认战斗字段（占位英雄技能缺字段时兜底）。 */
export function normalizeHeroSkill(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    usableFromPositions:
      skill.usableFromPositions ?? (skill.kind === 'attack' ? [1, 2] : [1, 2, 3, 4]),
    validTargetPositions:
      skill.validTargetPositions ?? [1, 2, 3, 4],
    targetSide:
      skill.targetSide ??
      (skill.kind === 'attack' ? 'enemy' : skill.kind === 'heal' ? 'ally' : 'self'),
    accuracy: skill.accuracy ?? 7,
    minDamage: skill.minDamage ?? skill.damage ?? 4,
    maxDamage: skill.maxDamage ?? (skill.damage ?? 4) + 3,
  };
}

// ---------------------------------------------------------------------------
// 战斗初始化
// ---------------------------------------------------------------------------

/** 进入战斗房间时建立完整 BattleState。 */
export function initBattle(campaign: CampaignState, roomId: string): CampaignState {
  const room = campaign.dungeon?.rooms.find((r) => r.id === roomId);
  if (!room || !campaign.dungeon) return campaign;

  const heroUnits = campaign.heroes.map((h, i) => makeHeroUnit(h, i));
  const encounter = buildEncounter(room.type);
  const monsterUnits = encounter.map((m, i) => makeMonsterUnit(m, i));

  const battle: BattleState = {
    battleId: createId('btl'),
    status: 'active',
    round: 1,
    maxRounds: MAX_ROUNDS,
    heroes: heroUnits,
    monsters: monsterUnits,
    initiativeOrder: createInitiativeOrder([...heroUnits, ...monsterUnits]),
    initiativeIndex: -1,
    activeActorId: null,
    currentActionPoints: 0,
    selectedSkillId: null,
    selectedTargetId: null,
    battleLog: [
      { id: createId('blog'), at: nowIso(), message: '战斗开始！', kind: 'info' },
    ],
    sourceRoomId: roomId,
    rewards: { gold: BATTLE_REWARD_GOLD },
  };

  const started = advanceTurn(battle);

  const dungeon = {
    ...campaign.dungeon,
    rooms: campaign.dungeon.rooms.map((r) => (r.id === roomId ? { ...r, status: 'current' as const } : r)),
  };

  return {
    ...campaign,
    gamePhase: 'battle',
    battle: started,
    dungeon,
  };
}

// ---------------------------------------------------------------------------
// 先攻推进（核心循环）
// ---------------------------------------------------------------------------

/** 推进到下一个行动者；自动跳过死亡/Stun 单位，并在怪物回合自动执行其动作。 */
export function advanceTurn(state: BattleState): BattleState {
  if (state.status !== 'active') return state;
  let s: BattleState = { ...state };
  let idx = s.initiativeIndex;
  let guard = 0;

  while (guard++ < 200) {
    idx += 1;
    if (idx >= s.initiativeOrder.length) {
      // 本轮行动列表耗尽 → 进入下一轮
      s = { ...s, round: s.round + 1 };
      if (s.round > s.maxRounds) {
        s = pushBattleLog(s, `第 ${s.maxRounds} 轮结束，怪物仍未清除，小队被迫撤退。`, 'danger');
        return { ...s, status: 'defeat' };
      }
      s = pushBattleLog(s, `—— 第 ${s.round} 轮开始 ——`, 'info');
      s = { ...s, initiativeOrder: createInitiativeOrder(allUnits(s)), initiativeIndex: -1 };
      idx = -1;
      continue;
    }

    const id = s.initiativeOrder[idx];
    const unit = findUnit(s, id);
    if (!unit || !unit.isAlive) continue;

    if (unit.stunned > 0) {
      s = applyStunSkip(s, id);
      continue;
    }

    // 激活该单位
    s = { ...s, initiativeIndex: idx, activeActorId: id };
    const sof = applyStartOfTurn(unit);
    s = setUnit(s, sof.unit);
    for (const m of sof.messages) s = pushBattleLog(s, m, 'warning');
    const after = findUnit(s, id);
    if (!after || !after.isAlive) continue; // 持续伤害致死，跳过

    s = {
      ...s,
      currentActionPoints: after.side === 'hero' ? 2 : 0,
      selectedSkillId: null,
      selectedTargetId: null,
    };

    if (after.side === 'monster') {
      s = runMonsterTurn(s, id);
      s = checkEnd(s);
      if (s.status !== 'active') return s;
      continue; // 继续推进，越过怪物
    }
    return s; // 轮到英雄，交还玩家控制
  }
  return checkEnd(s);
}

function applyStunSkip(state: BattleState, id: string): BattleState {
  const u = findUnit(state, id);
  if (!u || !u.isAlive) return state;
  const ticked = tickStun(u);
  let s = setUnit(state, ticked);
  s = pushBattleLog(s, `${ticked.name} 处于 Stun，跳过本次行动。`, 'warning');
  return s;
}

// ---------------------------------------------------------------------------
// 英雄行动
// ---------------------------------------------------------------------------

/** 英雄是否可朝某方向移动（用于 UI 禁用判定）。 */
export function canHeroMove(state: BattleState, unitId: string, dir: -1 | 1): boolean {
  const actor = findUnit(state, unitId);
  if (!actor || actor.side !== 'hero' || actor.id !== state.activeActorId) return false;
  if (state.currentActionPoints <= 0) return false;
  const np = actor.position + dir;
  if (np < 1 || np > 4) return false;
  return !state.heroes.some((h) => h.id !== actor.id && h.position === np);
}

/** 英雄移动一个位置（消耗 1 行动点）。 */
export function heroMove(state: BattleState, unitId: string, dir: -1 | 1): BattleState {
  const actor = findUnit(state, unitId);
  if (!actor || !canHeroMove(state, unitId, dir)) return state;
  const np = actor.position + dir;
  let s = setUnit(state, { ...actor, position: np });
  s = { ...s, currentActionPoints: s.currentActionPoints - 1 };
  s = pushBattleLog(s, `${actor.name} 移动到位置 ${np}。`, 'info');
  s = checkEnd(s);
  if (s.status === 'active' && s.currentActionPoints <= 0) s = advanceTurn(s);
  return s;
}

/** 当前行动英雄对某技能可合法选中的目标 id。 */
export function legalTargetsForActor(state: BattleState, skillId: string): string[] {
  const actor = getActiveUnit(state);
  if (!actor) return [];
  const raw = getSkillById(skillId);
  if (!raw) return [];
  const skill = normalizeHeroSkill(raw);
  return computeLegalTargetIds(state, actor, skill);
}

/** 英雄使用技能（消耗 1 行动点）。 */
export function heroUseSkill(
  state: BattleState,
  unitId: string,
  skillId: string,
  targetId: string
): BattleState {
  const actor = findUnit(state, unitId);
  if (!actor || actor.side !== 'hero' || actor.id !== state.activeActorId) return state;
  if (state.currentActionPoints <= 0) return state;
  const raw = getSkillById(skillId);
  if (!raw) return state;
  const skill = normalizeHeroSkill(raw);

  if (!isSkillUsableFrom(actor, skill)) {
    return pushBattleLog(state, `${actor.name} 无法从当前站位释放 ${skill.name}。`, 'warning');
  }
  const target = findUnit(state, targetId);
  if (!target || !isLegalTarget(actor, target, skill)) return state;

  let s = state;
  let tgt: BattleUnit = target;
  let act: BattleUnit = actor;

  if (skill.targetSide === 'enemy') {
    const res = resolveAttack(skill);
    if (res.hit) {
      // Blacksmith 临时加成：仅英雄命中时加算（下一次任务后过期清零）。
      const totalDamage = res.damage + (actor.damageBonus ?? 0);
      tgt = applyDamage(tgt, totalDamage);
      if (skill.applyEffects?.length) tgt = applyEffects(tgt, skill.applyEffects);
      const effNote = skill.applyEffects?.length
        ? `（施加 ${skill.applyEffects.map((e) => e.type).join('/')}）`
        : '';
      const bonusNote = actor.damageBonus ? `（含 Blacksmith +${actor.damageBonus}）` : '';
      s = pushBattleLog(
        s,
        `${actor.name} 使用 ${skill.name}，掷 ${res.roll}${res.crit ? '（暴击）' : ''} 命中 ${tgt.name}，造成 ${totalDamage} 伤害${bonusNote}${effNote}。`,
        'danger'
      );
    } else {
      s = pushBattleLog(s, `${actor.name} 使用 ${skill.name}，掷 ${res.roll} 未命中 ${target.name}。`, 'info');
    }
  } else {
    // 治疗 / 缓解压力 / buff（ally 或 self）
    if (skill.heal) {
      const before = tgt.hp;
      tgt = { ...tgt, hp: Math.min(tgt.maxHp, tgt.hp + skill.heal) };
      s = pushBattleLog(s, `${actor.name} 使用 ${skill.name} 治疗 ${target.name} ${tgt.hp - before} 点。`, 'success');
    }
    if (skill.stressHeal) {
      tgt = { ...tgt, stress: Math.max(0, tgt.stress - skill.stressHeal) };
      s = pushBattleLog(s, `${target.name} 压力降低 ${skill.stressHeal}。`, 'success');
    }
    if (skill.applyEffects?.length) tgt = applyEffects(tgt, skill.applyEffects);
  }

  // 位移效果
  if (skill.moveSelf) {
    const np = clamp(act.position + skill.moveSelf, 1, 4);
    if (!s.heroes.some((h) => h.id !== act.id && h.position === np)) {
      act = { ...act, position: np };
    }
  }
  if (skill.moveTarget && skill.targetSide === 'enemy') {
    const np = clamp(tgt.position + skill.moveTarget, 1, 4);
    if (!s.monsters.some((m) => m.id !== tgt.id && m.position === np)) {
      tgt = { ...tgt, position: np };
    }
  }

  s = setUnit(s, tgt);
  if (act.id !== tgt.id) s = setUnit(s, act);

  s = {
    ...s,
    currentActionPoints: s.currentActionPoints - 1,
    selectedSkillId: null,
    selectedTargetId: null,
  };
  s = checkEnd(s);
  if (s.status === 'active' && s.currentActionPoints <= 0) s = advanceTurn(s);
  return s;
}

/** 英雄主动结束回合。 */
export function endHeroTurn(state: BattleState, unitId: string): BattleState {
  const actor = findUnit(state, unitId);
  if (!actor || actor.side !== 'hero' || actor.id !== state.activeActorId) return state;
  return advanceTurn(state);
}

// ---------------------------------------------------------------------------
// 怪物自动回合
// ---------------------------------------------------------------------------

function tryMonsterMove(state: BattleState, monsterId: string): BattleState {
  const m = findUnit(state, monsterId);
  if (!m) return state;
  for (const p of [m.position - 1, m.position + 1]) {
    if (p >= 1 && p <= 4 && !state.monsters.some((o) => o.id !== m.id && o.position === p)) {
      return setUnit(state, { ...m, position: p });
    }
  }
  return state;
}

/** 执行单个怪物的自动回合。 */
export function runMonsterTurn(state: BattleState, monsterId: string): BattleState {
  const monster = findUnit(state, monsterId);
  if (!monster || !monster.isAlive || monster.side !== 'monster') return state;

  const action = chooseMonsterAction(state, monster);
  if (!action) {
    let s = tryMonsterMove(state, monsterId);
    s = pushBattleLog(s, `${monster.name} 无法行动，跳过回合。`, 'warning');
    return s;
  }

  const skill = getMonsterSkillById(action.skillId);
  const target = findUnit(state, action.targetId);
  if (!skill || !target) return state;

  const res = resolveAttack(skill);
  let tgt: BattleUnit = target;
  if (res.hit) {
    tgt = applyDamage(tgt, res.damage);
    if (skill.stress) tgt = { ...tgt, stress: tgt.stress + skill.stress };
    if (skill.applyEffects?.length) tgt = applyEffects(tgt, skill.applyEffects);
    const effNote = skill.applyEffects?.length
      ? `（施加 ${skill.applyEffects.map((e) => e.type).join('/')}）`
      : '';
    const stressNote = skill.stress ? ` 并施加 ${skill.stress} 压力。` : '';
    let s = setUnit(state, tgt);
    s = pushBattleLog(
      s,
      `${monster.name} 使用 ${skill.name}，掷 ${res.roll}${res.crit ? '（暴击）' : ''} 命中 ${tgt.name}，造成 ${res.damage} 伤害${stressNote}${effNote}`,
      'danger'
    );
    s = checkEnd(s);
    return s;
  }
  let s = state;
  s = pushBattleLog(s, `${monster.name} 使用 ${skill.name}，掷 ${res.roll} 未命中 ${target.name}。`, 'info');
  return s;
}

// ---------------------------------------------------------------------------
// 胜负判定与结算
// ---------------------------------------------------------------------------

/** 检查战斗是否结束（全怪死→胜利，全英雄死→失败）。 */
export function checkEnd(state: BattleState): BattleState {
  if (state.status !== 'active') return state;
  const monstersAlive = state.monsters.some((m) => m.isAlive);
  const heroesAlive = state.heroes.some((h) => h.isAlive);
  if (!monstersAlive) return pushBattleLog({ ...state, status: 'victory' }, VICTORY_LOG, 'success');
  if (!heroesAlive) return pushBattleLog({ ...state, status: 'defeat' }, DEFEAT_LOG, 'danger');
  return state;
}

/** 胜利结算：标记来源房间 cleared、发放 Gold、同步英雄状态、清除战斗、返回地牢。 */
export function resolveVictory(campaign: CampaignState): CampaignState {
  const b = campaign.battle;
  // 仅在 victory 状态结算一次；defeat/active 或已清除的战斗不发奖励（防重复/误发）。
  if (!b || b.status !== 'victory') return campaign;

  let c: CampaignState = { ...campaign, gold: campaign.gold + b.rewards.gold };
  c = pushLog(c, `战斗胜利，获得 ${b.rewards.gold} Gold。`, 'success');

  const heroes = c.heroes.map((h) => {
    const u = b.heroes.find((x) => x.sourceId === h.instanceId);
    if (!u) return h;
    return {
      ...h,
      maxLife: u.maxHp,
      wounds: Math.max(0, u.maxHp - u.hp),
      stress: Math.max(0, u.stress),
      isAlive: u.isAlive,
    };
  });
  c = { ...c, heroes };

  if (c.dungeon) {
    const room = c.dungeon.rooms.find((r) => r.id === b.sourceRoomId);
    const wasCleared = room?.status === 'cleared';
    const rooms = c.dungeon.rooms.map((r) =>
      r.id === b.sourceRoomId ? { ...r, status: 'cleared' as const } : r
    );
    let dungeon = {
      ...c.dungeon,
      rooms,
      roomsCleared: c.dungeon.roomsCleared + (wasCleared ? 0 : 1),
    };
    if (room?.type === 'objective') dungeon = { ...dungeon, objectiveComplete: true };
    c = { ...c, dungeon };
  }

  return { ...c, battle: null, gamePhase: 'dungeon-explore' };
}

/** 失败：保留 battle（status=defeat）以便展示，调用方负责导航。 */
export function markDefeat(campaign: CampaignState): CampaignState {
  if (!campaign.battle) return campaign;
  return { ...campaign, battle: { ...campaign.battle, status: 'defeat' } };
}
