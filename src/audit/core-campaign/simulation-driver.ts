// Phase 11A — Campaign Simulation Driver (spec §16) + Replay bundle (§15).
//
// 硬约束（dev doc §4）：
//   3. Driver 必须调用与 UI **同一个** 引擎入口，不得直接改写 store 字段；
//   4. Golden Run 不得使用任何 debug skip；
//   5. 所有随机必须来自可注入的确定性 RNG，Driver 负责记录每一次抽取。
//
// Driver 持有一份私有 CampaignState，每条命令：
//   engine entry → 记录 RNG 抽取 → 断言不变量 → 落 GameEventRecord。

import type { CampaignState } from '../../types';
import {
  applyDefaultLoadout,
  canProceedToLoadout,
  createNewCampaign,
  isLoadoutComplete,
  selectParty,
  selectQuest,
} from '../../game-engine/campaign';
import { type QuestEndReason } from '../../game-engine/quest-result';
import { canEndHamletDay, endHamletDay, skipHeroAction } from '../../game-engine/hamlet';
import { canScout, scoutDungeon } from '../../game-engine/dungeon';
import { endHeroTurn, getActiveUnit, legalTargetsForActor } from '../../game-engine/battle';
import { beginHeroSkillAction } from '../../game-engine/trinkets/battle-trinket-bridge';
import {
  declineAllTrinketOpportunitiesHeadless,
  settleBattleHeadless,
} from './headless-shim';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../../game-engine/save';
import { createSeededRandom, setRandomSource } from '../../game-engine/random';
// Phase 11A.1 §16.1：chooseQuest 路径走 Campaign Orchestrator 入口。
import { engineChooseQuest } from '../../game-engine/campaign/campaign-orchestrator';
// Phase 11A.2.1 §16：Driver 完全使用 Production Commands；shim 仅作为 Test Policy Helper 保留。
// 11A.2.1 partial：returnToHamlet / battle-victory 暂走 shim 因 Differential 仍在进行（Finding F）。
import {
  proceedCampaignToLoadout,
  proceedCampaignToQuestSelect,
  enterDungeonRoom,
  commitLeaveDungeon,
  commitQuestFailureFromDefeat,
  resolveReplacementsFlow,
  resolveAllPendingTrinketAllocations as resolveAllPendingTrinketAllocationsCmd,
} from '../../game-engine/commands';
import {
  shimReturnToHamlet,
  shimResolveVictory,
} from './headless-shim';
import { assertCoreCampaignInvariants, milestoneStateHash, type InvariantFinding } from './campaign-invariants';
import {
  stableHash,
  stableHashState,
  type CampaignMilestoneHash,
  type CampaignReplayBundle,
  type GameEventRecord,
  type RngSnapshotRecord,
} from './types';

// ---------------------------------------------------------------------------
// Command 契约（与 UI store action 一一对应，Driver 不新增玩法）
// ---------------------------------------------------------------------------

/**
 * ⚠️ UI-store-only 阶段迁移（审计发现 ISSUE-P1-006）
 *
 * `campaign-setup → skill-loadout → quest-select` 这两次 gamePhase 写入
 * **只存在于 `src/store/useGameStore.ts`（proceedToLoadout / proceedToQuests）**，
 * game-engine 层没有对应入口 —— 引擎只导出了守卫函数
 * `canProceedToLoadout()` / `isLoadoutComplete()`，却没有导出迁移函数。
 *
 * 后果：任何无头驱动（模拟、Golden Run、回放）都无法只靠引擎走完开局，
 * Phase 11A.2.1 §16：Driver 全部走 Production Commands；本 shim 已删除。
 * 事件 layer 一律为 'engine'（不再有 'ui-store-shim' 标记）。
 */

export {};

export type GameCommand =
  | { type: 'newCampaign' }
  | { type: 'selectParty'; heroIds: string[] }
  /** UI-shim：引擎无入口，见 UI_STORE_SHIM_LAYER 说明。 */
  | { type: 'proceedToLoadout' }
  | { type: 'applyLoadout' }
  /** UI-shim：引擎无入口，见 UI_STORE_SHIM_LAYER 说明。 */
  | { type: 'proceedToQuests' }
  | { type: 'chooseQuest'; questId: string }
  /** 地牢：揭示相邻房间（引擎 scoutDungeon）。 */
  | { type: 'scout' }
  /** 地牢：进入相邻房间（UI-shim，含 settleBattle / 房间窗口 / 替补判定）。 */
  | { type: 'moveToRoom'; roomId: string }
  /** 战斗：自动打完当前战斗（英雄回合选首个合法目标，怪物回合由 advanceTurn 内部驱动）。 */
  | { type: 'autoBattle' }
  /** 战斗胜利结算（UI-shim）。 */
  | { type: 'resolveVictory' }
  | { type: 'finishQuest'; reason: QuestEndReason }
  /** Hamlet：让所有存活英雄跳过行动，使 canEndHamletDay 成立（引擎 skipHeroAction）。 */
  | { type: 'skipAllHeroActions' }
  | { type: 'returnToHamlet' }
  | { type: 'endHamletDay' }
  /** 替补：逐槽位选人 + 确认，直到流程结束（UI-shim，循环只存在于 ReplacementPage）。 */
  | { type: 'resolveReplacements' }
  /** 由 Act IV / Boss 运行时入口驱动的事务（引擎函数由调用方提供，Driver 只负责记录与校验）。 */
  | { type: 'engine'; label: string; apply: (c: CampaignState) => CampaignState };

export interface GameCommandDescriptor {
  type: GameCommand['type'];
  label: string;
}

export interface SimStepResult {
  ok: boolean;
  state: CampaignState;
  event: GameEventRecord;
  invariantFindings: InvariantFinding[];
  error: string | null;
}

/** 把 seed 字符串折算成 mulberry32 需要的 32-bit 整数（确定性）。 */
export function seedToInt(seedId: string): number {
  return parseInt(stableHash(seedId), 16) >>> 0;
}

export function makeSeedSequence(parts: string[]): string {
  return parts.join('-');
}

export class CampaignSimulationDriver {
  private state: CampaignState;
  private readonly events: GameEventRecord[] = [];
  private readonly rngSnapshots: RngSnapshotRecord[] = [];
  private readonly milestones: CampaignMilestoneHash[] = [];
  private drawIndex = 0;
  private rngDrawsBeforeStep = 0;
  private readonly baseRng: () => number;

  readonly seedId: string;
  readonly campaignId: string;
  readonly initialStateHash: string;

  constructor(seedId = 'sim-seed') {
    this.seedId = seedId;
    this.baseRng = createSeededRandom(seedToInt(seedId));
    this.installRng();
    this.state = createNewCampaign();
    this.campaignId = this.state.id;
    this.initialStateHash = milestoneStateHash(this.state);
  }

  /**
   * 安装记录型确定性 RNG：每次 draw 都会写入 rngSnapshots，
   * 从而让 replay 能逐次比对抽取序列（spec §15 "RNG 抽取序列必须一致"）。
   */
  private installRng(): void {
    setRandomSource(() => {
      const value = this.baseRng();
      this.rngSnapshots.push({
        index: this.events.length,
        seedId: this.seedId,
        drawIndex: this.drawIndex++,
        value,
      });
      return value;
    });
  }

  /** 用完必须调用，避免污染后续测试的全局随机源。 */
  dispose(): void {
    setRandomSource(null);
  }

  getState(): CampaignState {
    return this.state;
  }

  getEvents(): readonly GameEventRecord[] {
    return this.events;
  }

  getRngSnapshots(): readonly RngSnapshotRecord[] {
    return this.rngSnapshots;
  }

  getMilestones(): readonly CampaignMilestoneHash[] {
    return this.milestones;
  }

  /** 当前阶段允许的命令（用于死锁检测：任何非终局阶段可用命令为 0 即死锁）。 */
  getAvailableCommands(): GameCommandDescriptor[] {
    const phase = this.state.gamePhase;
    const cmds: GameCommandDescriptor[] = [];
    switch (phase) {
      case 'home':
        cmds.push({ type: 'newCampaign', label: '开始新战役' });
        break;
      case 'campaign-setup':
        cmds.push({ type: 'selectParty', label: '选择 4 名英雄' });
        if (canProceedToLoadout(this.state)) {
          cmds.push({ type: 'proceedToLoadout', label: '进入技能配置（UI-shim）' });
        }
        break;
      case 'skill-loadout':
        cmds.push({ type: 'applyLoadout', label: '套用默认技能配置' });
        if (isLoadoutComplete(this.state)) {
          cmds.push({ type: 'proceedToQuests', label: '进入任务选择（UI-shim）' });
        }
        break;
      case 'quest-select':
        cmds.push({ type: 'chooseQuest', label: '选择任务' });
        break;
      case 'dungeon-explore': {
        const d = this.state.dungeon;
        if (d) {
          if (canScout(d)) cmds.push({ type: 'scout', label: '侦查相邻房间' });
          const cur = d.rooms.find((r) => r.id === d.currentRoomId);
          for (const rid of cur?.adjacentRoomIds ?? []) {
            cmds.push({ type: 'moveToRoom', label: `进入房间 ${rid}` });
          }
          if (d.canLeave) cmds.push({ type: 'finishQuest', label: '离开地牢' });
        }
        break;
      }
      case 'battle':
        if (this.state.battle?.status === 'active') {
          cmds.push({ type: 'autoBattle', label: '自动进行战斗' });
        } else if (this.state.battle?.status === 'victory') {
          cmds.push({ type: 'resolveVictory', label: '结算战斗胜利' });
        } else {
          cmds.push({ type: 'finishQuest', label: '结束任务' });
        }
        break;
      case 'quest-result':
        cmds.push({ type: 'returnToHamlet', label: '返回 Hamlet' });
        break;
      case 'hamlet':
        if (canEndHamletDay(this.state)) {
          cmds.push({ type: 'endHamletDay', label: '结束一天' });
        } else {
          cmds.push({ type: 'skipAllHeroActions', label: '全体跳过行动' });
        }
        break;
      case 'replacement':
        cmds.push({ type: 'resolveReplacements', label: '补充英雄（Stagecoach）' });
        break;
      case 'campaign-over':
        break;
      default:
        break;
    }
    return cmds;
  }

  /** 是否处于终局阶段（终局无可用命令是合法的，不算死锁）。 */
  isTerminal(): boolean {
    return this.state.gamePhase === 'campaign-over';
  }

  private commit(
    label: string,
    command: string,
    produce: () => CampaignState,
    layer: 'engine' = 'engine',
  ): SimStepResult {
    const before = milestoneStateHash(this.state);
    this.rngDrawsBeforeStep = this.drawIndex;
    let next: CampaignState;
    let error: string | null = null;
    try {
      next = produce();
    } catch (e) {
      next = this.state;
      error = e instanceof Error ? e.message : String(e);
    }
    const findings = assertCoreCampaignInvariants(next);
    this.state = next;
    const after = milestoneStateHash(next);
    const ev: GameEventRecord = {
      index: this.events.length,
      type: label,
      command,
      payload: { rngDraws: this.drawIndex - this.rngDrawsBeforeStep, error, layer },
      stateHashBefore: before,
      stateHashAfter: after,
    };
    this.events.push(ev);
    return {
      ok: error === null && findings.every((f) => f.severity !== 'error'),
      state: next,
      event: ev,
      invariantFindings: findings,
      error,
    };
  }

  dispatch(command: GameCommand): SimStepResult {
    switch (command.type) {
      case 'newCampaign':
        return this.commit('newCampaign', 'newCampaign', () => createNewCampaign());
      case 'selectParty':
        return this.commit('selectParty', 'selectParty', () => selectParty(this.state, command.heroIds));
      case 'proceedToLoadout':
        return this.commit(
          'proceedToLoadout',
          'proceedToLoadout',
          () => proceedCampaignToLoadout(this.state),
        );
      case 'applyLoadout':
        return this.commit('applyLoadout', 'applyLoadout', () => applyDefaultLoadout(this.state));
      case 'proceedToQuests':
        return this.commit(
          'proceedToQuests',
          'proceedToQuests',
          () => proceedCampaignToQuestSelect(this.state),
        );
      case 'chooseQuest':
        // Phase 11A.1 §16.1：先走 engineChooseQuest（初始化 Act / Threat + 门控），
        // 再委托给 selectQuest 生成地牢。
        return this.commit('chooseQuest', `chooseQuest:${command.questId}`, () => {
          const gate = engineChooseQuest(this.state, command.questId);
          if (!gate.ok) return this.state;
          return selectQuest(gate.campaign, command.questId);
        });
      case 'scout':
        return this.commit('scout', 'scout', () =>
          this.state.dungeon && canScout(this.state.dungeon) ? scoutDungeon(this.state) : this.state,
        );
      case 'moveToRoom':
        return this.commit(
          'moveToRoom',
          `moveToRoom:${command.roomId}`,
          () => {
            const r = enterDungeonRoom(this.state, command.roomId);
            return r.ok ? r.campaign : this.state;
          },
        );
      case 'autoBattle':
        return this.commit('autoBattle', 'autoBattle', () => autoPlayBattle(this.state));
      case 'resolveVictory':
        return this.commit(
          'resolveVictory',
          'resolveVictory',
          () => shimResolveVictory(this.state),
        );
      case 'finishQuest':
        return this.commit(
          'finishQuest',
          `finishQuest:${command.reason}`,
          () => {
            const r =
              command.reason === 'defeat'
                ? commitQuestFailureFromDefeat(this.state)
                : commitLeaveDungeon(this.state);
            return r.ok ? r.campaign : this.state;
          },
        );
      case 'skipAllHeroActions':
        return this.commit('skipAllHeroActions', 'skipAllHeroActions', () => {
          let c = this.state;
          for (const h of c.heroes) {
            if (h.isAlive && !h.hasActedToday) c = skipHeroAction(c, h.instanceId);
          }
          return c;
        });
      case 'returnToHamlet':
        return this.commit(
          'returnToHamlet',
          'returnToHamlet',
          () => shimReturnToHamlet(this.state),
        );
      case 'endHamletDay':
        return this.commit('endHamletDay', 'endHamletDay', () => endHamletDay(this.state));
      case 'resolveReplacements':
        return this.commit(
          'resolveReplacements',
          'resolveReplacements',
          () => resolveReplacementsFlow(this.state),
        );
      case 'engine':
        return this.commit(command.label, `engine:${command.label}`, () => command.apply(this.state));
      default:
        return this.commit('noop', 'noop', () => this.state);
    }
  }

  /** 记录一个里程碑快照（spec §18 Milestone Hash）。 */
  captureMilestone(id: string, label: string, contentManifestHash: string): CampaignMilestoneHash {
    const c = this.state;
    const m: CampaignMilestoneHash = {
      id,
      label,
      stateHash: milestoneStateHash(c),
      rngSnapshotId: `${this.seedId}#${this.drawIndex}`,
      party: c.heroes.map((h) => `${h.heroId}@${h.partySlot}`).sort(),
      stagecoach: [...c.waitingHeroIds].sort(),
      gold: c.gold,
      xp: c.heroes.reduce((sum, h) => sum + h.xp, 0),
      buildings: [...(c.hamlet?.occupiedBuildingIds ?? [])].sort(),
      boss: c.campaignProgress?.activeBossDefinitionId ?? null,
      questCount: c.completedQuestCount,
      saveVersion: c.saveVersion,
      contentManifestHash,
      pendingTransactionCount: countPendingTransactions(c),
    };
    this.milestones.push(m);
    return m;
  }

  /** 走真实存档管线（createSaveSnapshot → validateSaveFile）。 */
  save(): { snapshot: ReturnType<typeof createSaveSnapshot>; validationError: string | null } {
    const snapshot = createSaveSnapshot(this.state);
    const roundTripped = JSON.parse(JSON.stringify(snapshot)) as unknown;
    return { snapshot, validationError: validateSaveFile(roundTripped) };
  }

  /** 走真实读档管线（restoreSaveSnapshot）。 */
  load(snapshot: ReturnType<typeof createSaveSnapshot>): SimStepResult {
    return this.commit('load', 'load', () =>
      restoreSaveSnapshot(JSON.parse(JSON.stringify(snapshot)) as typeof snapshot),
    );
  }

  buildReplayBundle(buildVersion: string, contentManifestHash: string): CampaignReplayBundle {
    return {
      campaignId: this.campaignId,
      seedId: this.seedId,
      initialStateHash: this.initialStateHash,
      events: [...this.events],
      rngSnapshots: [...this.rngSnapshots],
      milestoneHashes: [...this.milestones],
      finalStateHash: milestoneStateHash(this.state),
      buildVersion,
      contentManifestHash,
    };
  }
}

/**
 * 自动打完一场战斗（不使用任何 debug skip，走与 UI 相同的 beginHeroSkillAction 管线）。
 *
 * 策略（刻意保持"最笨但确定"）：
 *   英雄回合 → 遍历已装备技能，取第一个有合法目标的技能，打第一个目标；
 *              全部无合法目标 → endHeroTurn；
 *   怪物回合 → 由 battle.advanceTurn 内部自动执行（battle.ts:385），Driver 不介入。
 * 每一步之后跑 settleBattleHeadless（与 store 一致）。
 */
export function autoPlayBattle(campaign: CampaignState, maxSteps = 400): CampaignState {
  let c = campaign;
  let steps = 0;
  while (c.battle && c.battle.status === 'active' && steps++ < maxSteps) {
    let battle = c.battle;
    // 有冻结的 Trinket 决策时先结清（Driver 一律选择"不使用"，保持确定性）。
    if (battle.pendingAction) {
      const resolved = declineAllTrinketOpportunitiesHeadless(c);
      if (resolved === c) break;
      c = resolved;
      if (!c.battle || c.battle.status !== 'active') break;
      battle = c.battle;
      if (battle.pendingAction) break; // 仍冻结 → 真卡住，交给上层报死锁
    }
    const actor = getActiveUnit(battle);
    if (!actor) break;
    if (actor.side !== 'hero') {
      // 怪物回合正常应由 advanceTurn 内部消化；若卡住则结束该单位回合避免死循环。
      const next = settleBattleHeadless({ ...c, battle: endHeroTurn(battle, actor.id) });
      if (next.battle === battle) break;
      c = next;
      continue;
    }

    const hero = c.heroes.find((h) => h.instanceId === actor.sourceId);
    const skillIds = hero?.equippedSkillIds ?? [];
    let acted = false;
    for (const skillId of skillIds) {
      if (!skillId) continue;
      const targets = legalTargetsForActor(battle, skillId);
      if (targets.length === 0) continue;
      const { campaign: next, error, paused } = beginHeroSkillAction(c, skillId, targets[0]);
      if (error) continue;
      // paused = Trinket 窗口冻结了动作 → 立刻 decline 全部机会以恢复执行。
      c = paused ? declineAllTrinketOpportunitiesHeadless(next) : settleBattleHeadless(next);
      acted = true;
      break;
    }
    if (!acted) {
      const next = settleBattleHeadless({ ...c, battle: endHeroTurn(battle, actor.id) });
      if (next.battle === c.battle) break;
      c = next;
    }
  }
  return c;
}

/** 统计所有已提交事务 id（用于 Milestone 与重复事务审计）。 */
export function countPendingTransactions(c: CampaignState): number {
  const raw = c as unknown as Record<string, unknown>;
  let total = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!Array.isArray(v)) continue;
    if (k.startsWith('processed') || k.endsWith('TransactionIds')) total += v.length;
  }
  return total;
}

/** 收集所有已提交事务 id（processed... / ...TransactionIds），用于重复提交检测（spec §29）。 */
export function collectCommittedTransactionIds(c: CampaignState): string[] {
  const raw = c as unknown as Record<string, unknown>;
  const out: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (!Array.isArray(v)) continue;
    if (k.startsWith('processed') || k.endsWith('TransactionIds')) {
      for (const item of v) if (typeof item === 'string') out.push(`${k}:${item}`);
    }
  }
  const a4 = c.actFourState as unknown as Record<string, unknown> | null;
  if (a4) {
    for (const [k, v] of Object.entries(a4)) {
      if (Array.isArray(v) && (k.startsWith('processed') || k.endsWith('TransactionIds'))) {
        for (const item of v) if (typeof item === 'string') out.push(`actFour.${k}:${item}`);
      }
    }
  }
  return out;
}

/** 两次 replay 的差异定位：返回第一个不一致事件的下标（-1 表示完全一致）。 */
export function firstDivergentEventIndex(a: CampaignReplayBundle, b: CampaignReplayBundle): number {
  const n = Math.max(a.events.length, b.events.length);
  for (let i = 0; i < n; i++) {
    const ea = a.events[i];
    const eb = b.events[i];
    if (!ea || !eb) return i;
    if (ea.type !== eb.type || ea.stateHashAfter !== eb.stateHashAfter) return i;
  }
  return -1;
}

/** 两次 replay 的 RNG 抽取序列是否逐次相同。 */
export function rngSequencesMatch(a: CampaignReplayBundle, b: CampaignReplayBundle): boolean {
  if (a.rngSnapshots.length !== b.rngSnapshots.length) return false;
  return a.rngSnapshots.every((s, i) => s.value === b.rngSnapshots[i].value);
}

export function replayBundleHash(bundle: CampaignReplayBundle): string {
  return stableHashState({
    initial: bundle.initialStateHash,
    final: bundle.finalStateHash,
    events: bundle.events.map((e) => [e.type, e.stateHashAfter]),
    rng: bundle.rngSnapshots.map((s) => s.value),
  });
}
