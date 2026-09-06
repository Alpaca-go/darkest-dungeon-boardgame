import { create } from 'zustand';
import type { CampaignState, ProvisionPool } from '../types';
import {
  createNewCampaign,
  createHeroInstance,
  equipSkill as engineEquipSkill,
  applyDefaultLoadout as engineApplyDefaultLoadout,
  selectQuest as engineSelectQuest,
  canProceedToLoadout,
  isLoadoutComplete,
} from '../game-engine/campaign';
import {
  scoutDungeon,
  moveToRoom as engineMoveToRoom,
  canScout,
  canMoveTo,
  retreatFromBattle,
} from '../game-engine/dungeon';
import {
  heroMove as engineHeroMove,
  endHeroTurn as engineEndHeroTurn,
  resolveVictory as engineResolveVictory,
  resumeTurnAfterMentalCheck,
} from '../game-engine/battle';
import {
  processBattleStressEvents,
  resolveTurnStartMentalEffect,
} from '../game-engine/mental-effects';
import { applyStress as engineApplyStress, recoverStress as engineRecoverStress } from '../game-engine/stress';
import {
  finishQuest,
  failQuestFromBattle,
} from '../game-engine/quest-result';
import {
  startHamletPhase,
  visitHamletBuilding,
  visitAbbey as engineVisitAbbey,
  skipHeroAction,
  endHamletDay as engineEndHamletDay,
} from '../game-engine/hamlet';
// ---- Phase 11A.1：Campaign Orchestration 入口 ----
import {
  engineChooseQuest,
  finalizeQuestReturnToHamlet,
} from '../game-engine/campaign/campaign-orchestrator';
import {
  acquireQuirk as engineAcquireQuirk,
  resolveQuirkDecision as engineResolveQuirkDecision,
} from '../game-engine/quirks';
import type { QuirkDecisionChoice } from '../game-engine/quirks';
// ---- Phase 8B：Disease / Sanitarium ----
import {
  acquireDisease as engineAcquireDisease,
  finalizeDiseaseTransaction,
} from '../game-engine/diseases/acquire-disease';
import {
  processBattleDiseaseInfections,
  processBattleRuleEvents,
} from '../game-engine/diseases/battle-bridge';
import {
  useSanitariumRemoveDisease as engineRemoveDisease,
  sanitariumRemoveDiseaseError,
} from '../game-engine/hamlet/sanitarium';
import { interactWithCurio as engineInteractWithCurio } from '../game-engine/diseases/curio';
// ---- Phase 8D：Guild / Blacksmith / 成长 ----
import {
  startGuildVisit as engineStartGuildVisit,
  cancelGuildVisit as engineCancelGuildVisit,
  addGuildUpgrade as engineAddGuildUpgrade,
  removeGuildUpgrade as engineRemoveGuildUpgrade,
  commitGuildVisit as engineCommitGuildVisit,
  guildVisitError as engineGuildVisitError,
} from '../game-engine/hamlet/guild';
import {
  visitBlacksmith as engineVisitBlacksmith,
  blacksmithVisitError as engineBlacksmithVisitError,
} from '../game-engine/hamlet/blacksmith';
import { earnHeroXp as engineEarnHeroXp } from '../game-engine/progression/xp-ledger';
import {
  clearCampaign,
  exportSaveString,
  importSaveString,
  loadCampaign,
  saveCampaign,
} from '../game-engine/save';
import { resolveDamage as engineResolveDamage } from '../game-engine/damage';
import { resolveHealing as engineResolveHealing } from '../game-engine/healing';
import { killCampaignHero, processBattleDeaths } from '../game-engine/hero-death';
import type { KillHeroCommand } from '../game-engine/hero-death';
import {
  applyQuestXpToStagecoach as engineApplyQuestXp,
  evaluateReplacementFlow,
  failCampaign as engineFailCampaign,
  unconfirmedSlotCount,
} from '../game-engine/stagecoach';
import {
  selectReplacementHero as engineSelectReplacementHero,
  addReplacementUpgrade as engineAddReplacementUpgrade,
  removeReplacementUpgrade as engineRemoveReplacementUpgrade,
  confirmReplacement as engineConfirmReplacement,
  completeReplacementFlow as engineCompleteReplacementFlow,
} from '../game-engine/replacement';
import type { DamageCommand, NomadWagonVisitCommand } from '../types';
// ---- Phase 8C：Trinket / Nomad Wagon ----
import {
  beginHeroSkillAction,
  resolveTrinketOpportunity,
  openBattleTurnStartWindow,
  openRoomEnteredWindows,
} from '../game-engine/trinkets/battle-trinket-bridge';
import {
  resolveTrinketAllocation as engineResolveTrinketAllocation,
  discardTrinket as engineDiscardTrinket,
} from '../game-engine/trinkets/allocate-trinket';
import type { TrinketAllocationChoice } from '../game-engine/trinkets/allocate-trinket';
import { transferTrinket as engineTransferTrinket } from '../game-engine/trinkets/transfer-trinket';
import { acquireTrinket as engineAcquireTrinket } from '../game-engine/trinkets/acquire-trinket';
import {
  ensureNomadWagonOffer,
  commitNomadWagonVisit as engineCommitNomadWagonVisit,
} from '../game-engine/nomad-wagon';
import { routeForPhase as guardRouteForPhase } from '../app/route-guards';

// UI 临时状态（不持久化）。
interface UiState {
  selectedHeroId: string | null;
  selectedSkillId: string | null;
  modal: string | null;
  /** 战斗中当前选中的技能（目标选择前的临时态）。 */
  battleSkillId: string | null;
}

interface GameStore {
  campaign: CampaignState | null;
  ui: UiState;

  // ---- 通用 ----
  newCampaign(): void;
  continueCampaign(): void;
  resetCampaign(): void;
  /** 手动保存当前战役（存档管理 UI 用）。 */
  manualSave(): void;
  /** 整体替换当前战役（调试 / 引擎事务回写用）。会同步落盘。 */
  replaceCampaign(c: CampaignState): void;
  /** 导出存档 JSON 字符串；无存档返回 null。 */
  exportSave(): string | null;
  /** 导入存档 JSON；成功返回 null，失败返回错误信息（不覆盖现有存档）。 */
  importSave(json: string): string | null;

  // ---- Phase 2：战役准备 ----
  chooseHero(heroId: string): void;
  removeHero(heroId: string): void;
  equipSkill(heroId: string, skillId: string): void;
  applyDefaultLoadout(): void;
  proceedToLoadout(): void;
  proceedToQuests(): void;
  chooseQuest(questId: string): void;

  // ---- Phase 2：地牢探索 ----
  scout(): void;
  moveToRoom(roomId: string): void;
  useProvision(type: keyof ProvisionPool, heroId?: string): void;

  // ---- Phase 3：战斗 ----
  selectBattleSkill(skillId: string | null): void;
  battleHeroMove(dir: -1 | 1): void;
  battleUseSkill(targetId: string): void;
  battleEndTurn(): void;
  battleResolveVictory(): void;
  battleRetreat(): void;

  // ---- Phase 4：结算与 Hamlet ----
  /** 主动离开地牢并结算任务（幂等）。 */
  leaveDungeon(): void;
  /** 战斗全灭后结算失败任务。 */
  failQuestFromDefeat(): void;
  /** 从结算页返回 Hamlet（单一 action 完成全部状态转换）。 */
  returnToHamlet(): void;
  /** 英雄访问建筑。 */
  visitBuilding(heroId: string, buildingId: string): void;
  /** 英雄跳过今天行动。 */
  skipHeroToday(heroId: string): void;
  /** 结束当天（全员行动完毕后可用）。 */
  endHamletDay(): void;

  // ---- Phase 6：统一伤害/治疗/死亡（§17） ----
  /** 统一伤害入口（Campaign 英雄；trap/exploration 等非战斗伤害）。 */
  applyDamage(command: DamageCommand): void;
  /** 统一治疗入口（Campaign 英雄；Sanitarium 等非战斗治疗）。 */
  healActor(targetId: string, amount: number): void;
  /** 直接记录英雄永久死亡（引擎单一死亡入口的 store 包装）。 */
  recordHeroDeath(cmd: KillHeroCommand): void;
  /** 手动触发替补流程判定（能补齐→replacement，不能→campaign-over）。 */
  openReplacementFlow(): void;

  // ---- Phase 6：替补流程 ----
  selectReplacementHero(slotId: string, heroClassId: string): void;
  addReplacementUpgrade(slotId: string, op: { type: 'hero-level' } | { type: 'skill-level'; skillId: string }): void;
  removeReplacementUpgrade(slotId: string, operationId: string): void;
  confirmReplacement(slotId: string): void;
  completeReplacementFlow(): void;

  // ---- Phase 6：Stagecoach 与战役失败 ----
  applyQuestXpToStagecoach(xp: number): void;
  failCampaign(reason: string): void;

  // ---- Phase 7：Stress / Resolve（Debug 受控入口） ----
  /** Debug：给英雄加压（统一管线，阈值规则生效）。 */
  debugApplyStress(heroId: string, amount: number): void;
  /** Debug：给英雄减压（统一管线）。 */
  debugRecoverStress(heroId: string, amount: number): void;

  // ---- Phase 8A：Quirk ----
  /** Abbey：花费 Gold 移除英雄的一个 Quirk。 */
  visitAbbey(heroId: string, quirkId: string): void;
  /** 结算一条 Quirk 待决策（放弃新 Quirk / 替换既有 Positive）。 */
  resolveQuirkDecision(decisionId: string, choice: QuirkDecisionChoice): void;
  /** Debug：给英雄授予 Quirk（走 acquireQuirk 状态机，上限/决策/疯狂死亡规则照常生效）。 */
  debugGrantQuirk(heroId: string, quirkId: string): void;

  // ---- Phase 8B：Disease / Sanitarium ----
  /** Sanitarium：花费 2 Gold 移除英雄的 Disease（扣费与移除为单事务）。 */
  visitSanitariumRemoveDisease(heroId: string): void;
  /** 该英雄当前能否在 Sanitarium 移除疾病（null = 可以，否则为拒绝原因）。 */
  sanitariumRemoveDiseaseError(heroId: string): string | null;
  /** Debug：让英雄感染指定 Disease（走 acquireDisease 状态机，替换/负面怪癖规则照常生效）。 */
  debugGrantDisease(heroId: string, diseaseId: string): void;
  /** 地牢：指定英雄搜查当前房间的 Curio（随机结果由引擎产生）。 */
  interactWithCurio(heroId: string): void;
  /** 确认 Disease 获取浮层（仅清空 lastDiseaseAcquisition，不改变任何规则状态）。 */
  acknowledgeDiseaseAcquisition(): void;

  // ---- Phase 8D：Guild / Blacksmith / 成长 ----
  /** 开启某英雄的 Guild 升级会话（不产生消费）。 */
  startGuildVisit(heroId: string): void;
  /** 取消当前 Guild 会话（丢弃未提交的选择）。 */
  cancelGuildVisit(): void;
  /** 向当前 Guild 会话追加一次升级选择。 */
  addGuildUpgrade(request: { type: 'hero-level' } | { type: 'skill-level'; skillId: string }): void;
  /** 从当前 Guild 会话移除一次升级选择。 */
  removeGuildUpgrade(choiceId: string): void;
  /** 原子提交 Guild 会话；返回错误信息（成功为 null）。 */
  commitGuildVisit(): string | null;
  /** 该英雄能否开启 Guild 会话（null = 可以）。 */
  guildVisitError(heroId: string): string | null;
  /** Blacksmith：为指定技能购买临时 Form（仅下次任务生效）。 */
  visitBlacksmith(heroId: string, skillId: string): void;
  /** Blacksmith 校验（null = 可以购买）。 */
  blacksmithVisitError(heroId: string, skillId: string): string | null;
  /** Debug：给英雄发放 XP（统一走 XP Ledger，不直接写 hero.xp）。 */
  debugGrantXp(heroId: string, amount: number): void;
  // ---- Phase 8C：Trinket ----
  /** 对一条使用机会声明使用（战斗冻结动作会累计加成并在结清后恢复）。 */
  useTrinketOpportunity(opportunityId: string): void;
  /** 跳过一条使用机会。 */
  declineTrinketOpportunity(opportunityId: string): void;
  /** 结算一条待分配（assign / replace / discard）。 */
  resolveTrinketAllocation(allocationId: string, choice: TrinketAllocationChoice): void;
  /** 非战斗时把饰品从一名英雄转交给另一名英雄。 */
  transferTrinket(fromHeroId: string, toHeroId: string, instanceId: string): void;
  /** 丢弃英雄身上的一件饰品。 */
  discardTrinket(heroId: string, instanceId: string): void;
  /** 打开 Nomad Wagon（本次 Hamlet 首次打开时生成 Offer 并立即保存）。 */
  openNomadWagon(): void;
  /** 提交一次 Nomad Wagon 访问（买/卖原子事务）；返回错误信息或 null。 */
  commitNomadWagonVisit(cmd: NomadWagonVisitCommand): string | null;
  /** Debug：给英雄发一件饰品（走 acquireTrinket 状态机，容量/分配规则照常生效）。 */
  debugGrantTrinket(heroId: string, trinketId: string): void;
}

const EMPTY_UI: UiState = {
  selectedHeroId: null,
  selectedSkillId: null,
  modal: null,
  battleSkillId: null,
};

// 初始化时尝试从 localStorage 恢复战役（刷新可恢复进度）。
const initialCampaign = loadCampaign();

/**
 * Phase 6：当替补流程尚未处理而游戏阶段推进时，
 * 将 pendingReplacement 的 resumePhase 重定向到新的返回阶段。
 */
function retargetPendingReplacement(
  c: CampaignState,
  resumePhase: 'dungeon-explore' | 'quest-result' | 'hamlet'
): CampaignState {
  const pending = c.stagecoach.pendingReplacement;
  if (!pending || pending.resolved || pending.resumePhase === resumePhase) return c;
  return {
    ...c,
    stagecoach: {
      ...c.stagecoach,
      pendingReplacement: { ...pending, resumePhase },
    },
  };
}

export const useGameStore = create<GameStore>((set, get) => {
  /** 写入存档并应用到状态。所有重要变更都经过此方法以保证自动保存。 */
  const commit = (next: CampaignState): void => {
    saveCampaign(next);
    set({ campaign: next });
  };

  /**
   * Phase 7：战斗状态统一结算（每次战斗引擎推进后、commit 前调用）。
   * 顺序（文档 11.1 / 11.4）：
   * 1. processBattleDeaths —— 永久死亡同步到 Campaign（恰好一次）；
   * 2. processBattleStressEvents —— 消费战斗压力事件（阈值 → Resolve Test / Heart Attack）；
   * 3. pendingMentalCheck 循环 —— 回合暂停时执行精神检定并恢复回合；
   *    恢复可能推进到下一个需要检定的英雄，因此循环处理（防御上限 50 次）。
   */
  const settleBattle = (c: CampaignState): CampaignState => {
    let next = processBattleDeaths(c);
    next = processBattleStressEvents(next);
    // Phase 8B：战斗排队的规则事件（Lethargy / Vertigo）与感染
    next = processBattleRuleEvents(next);
    next = processBattleDiseaseInfections(next);
    next = processBattleDeaths(next);
    let guard = 0;
    while (
      next.battle &&
      next.battle.status === 'active' &&
      next.battle.pendingMentalCheck &&
      guard < 50
    ) {
      guard += 1;
      // 检定（结果先落地存档数据，UI 之后只读展示）
      next = resolveTurnStartMentalEffect(next).campaign;
      // 检定期间可能已死亡同步 / 产生新的压力事件
      next = processBattleDeaths(next);
      next = processBattleStressEvents(next);
      if (!next.battle) break;
      // 恢复回合（英雄死亡 → 推进；Stun → 跳过；AP 扣光 → 自动结束）
      next = { ...next, battle: resumeTurnAfterMentalCheck(next.battle) };
      next = processBattleDeaths(next);
      next = processBattleStressEvents(next);
      next = processBattleRuleEvents(next);
      next = processBattleDiseaseInfections(next);
    }
    // Phase 8C：战斗推进后为当前出手英雄开 hero-turn-start 窗口（幂等；
    // 精神检定暂停 / 冻结动作存在 / 敌方回合时引擎内部自动跳过）。
    next = openBattleTurnStartWindow(next);
    return next;
  };

  return {
    campaign: initialCampaign,
    ui: EMPTY_UI,

    newCampaign: () => {
      const campaign = createNewCampaign();
      saveCampaign(campaign);
      set({ campaign, ui: { ...EMPTY_UI } });
    },

    continueCampaign: () => {
      if (!get().campaign) {
        const loaded = loadCampaign();
        if (loaded) set({ campaign: loaded });
      }
    },

    resetCampaign: () => {
      clearCampaign();
      set({ campaign: null, ui: { ...EMPTY_UI } });
    },

    manualSave: () => {
      const c = get().campaign;
      if (!c) return;
      saveCampaign(c);
    },

    replaceCampaign: (c) => {
      set({ campaign: c });
      saveCampaign(c);
    },

    exportSave: () => {
      // 先确保内存态已落盘，再导出。
      const c = get().campaign;
      if (c) saveCampaign(c);
      return exportSaveString();
    },

    importSave: (json) => {
      const { error, campaign } = importSaveString(json);
      if (error) return error; // 验证失败：不覆盖现有存档与内存状态
      set({ campaign, ui: { ...EMPTY_UI } });
      return null;
    },

    // 切换式选择：已选则移除，未选且未满 4 人则加入（不影响其他英雄配置）。
    chooseHero: (heroId) => {
      const c = get().campaign;
      if (!c) return;
      const exists = c.heroes.some((h) => h.heroId === heroId);
      let heroes: CampaignState['heroes'];
      if (exists) {
        heroes = c.heroes.filter((h) => h.heroId !== heroId);
      } else {
        if (c.heroes.length >= 4) return; // 已满 4 人
        const inst = createHeroInstance(heroId, c.heroes.length + 1);
        if (!inst) return;
        heroes = [...c.heroes, inst];
      }
      commit({ ...c, heroes });
    },

    removeHero: (heroId) => {
      const c = get().campaign;
      if (!c) return;
      commit({ ...c, heroes: c.heroes.filter((h) => h.heroId !== heroId) });
    },

    equipSkill: (heroId, skillId) => {
      const c = get().campaign;
      if (!c) return;
      commit(engineEquipSkill(c, heroId, skillId));
    },

    applyDefaultLoadout: () => {
      const c = get().campaign;
      if (!c) return;
      commit(engineApplyDefaultLoadout(c));
    },

    proceedToLoadout: () => {
      const c = get().campaign;
      if (!c || !canProceedToLoadout(c)) return;
      commit({ ...c, gamePhase: 'skill-loadout' });
    },

    proceedToQuests: () => {
      const c = get().campaign;
      if (!c || !isLoadoutComplete(c)) return;
      commit({ ...c, gamePhase: 'quest-select' });
    },

    chooseQuest: (questId) => {
      const c = get().campaign;
      if (!c) return;
      // Phase 11A.1：先走 engineChooseQuest 初始化 Act / Threat + 门控，
      // 再委托 selectQuest 生成地牢。
      const gate = engineChooseQuest(c, questId);
      if (!gate.ok) {
        // 门控拒绝：原样落盘 + 日志（不写脏数据）。
        return;
      }
      commit(engineSelectQuest(gate.campaign, questId));
    },

    scout: () => {
      const c = get().campaign;
      if (!c || !c.dungeon || !canScout(c.dungeon)) return;
      commit(scoutDungeon(c));
    },

    moveToRoom: (roomId) => {
      const c = get().campaign;
      if (!c || !c.dungeon || !canMoveTo(c.dungeon, roomId)) return;
      let next = engineMoveToRoom(c, roomId);
      // Phase 7：进入战斗房间时首个英雄可能立即需要精神检定
      if (next.battle) next = settleBattle(next);
      // Phase 8C：非战斗房间为全体存活英雄开 room-entered 窗口（幂等）
      next = openRoomEnteredWindows(next, roomId);
      // Phase 6：探索伤害可能导致永久死亡 → 判定替补流程（战斗阶段不打断，胜利结算后再判）
      if (next.gamePhase === 'dungeon-explore') next = evaluateReplacementFlow(next);
      commit(next);
    },

    useProvision: (type, _heroId) => {
      const c = get().campaign;
      if (!c) return;
      if (c.provisions[type] <= 0) return;
      commit({
        ...c,
        provisions: { ...c.provisions, [type]: c.provisions[type] - 1 },
      });
    },

    // ---- Phase 3：战斗动作（全部委托给 game-engine，并自动保存） ----
    selectBattleSkill: (skillId) => {
      set((st) => ({ ui: { ...st.ui, battleSkillId: skillId } }));
    },

    battleHeroMove: (dir) => {
      const c = get().campaign;
      if (!c?.battle || c.battle.status !== 'active' || !c.battle.activeActorId) return;
      const battle = engineHeroMove(c.battle, c.battle.activeActorId, dir);
      if (battle === c.battle) return;
      set((st) => ({ ui: { ...st.ui, battleSkillId: null } }));
      // Phase 6/7：每次战斗 commit 前统一结算（死亡同步 + 压力事件 + 精神检定）
      commit(settleBattle({ ...c, battle }));
    },

    battleUseSkill: (targetId) => {
      const c = get().campaign;
      const skillId = get().ui.battleSkillId;
      if (!c?.battle || c.battle.status !== 'active' || !c.battle.activeActorId || !skillId) return;
      // Phase 8C：动作声明统一走桥接 —— 先校验合法性，再开 before-attack-roll 窗口；
      // 有可用 Trinket 时冻结 PendingBattleAction 等待玩家（此时不结算、不产生随机数）。
      const { campaign: next, error, paused } = beginHeroSkillAction(c, skillId, targetId);
      if (error) return;
      set((st) => ({ ui: { ...st.ui, battleSkillId: null } }));
      // 冻结中不跑 settleBattle（动作尚未执行）；直接落盘保证刷新可恢复。
      commit(paused ? next : settleBattle(next));
    },

    battleEndTurn: () => {
      const c = get().campaign;
      if (!c?.battle || c.battle.status !== 'active' || !c.battle.activeActorId) return;
      set((st) => ({ ui: { ...st.ui, battleSkillId: null } }));
      const battle = engineEndHeroTurn(c.battle, c.battle.activeActorId);
      commit(settleBattle({ ...c, battle }));
    },

    // 胜利结算：房间 cleared + Gold + 同步英雄状态 + 返回地牢；有阵亡 → 替补流程。
    battleResolveVictory: () => {
      const c = get().campaign;
      if (!c?.battle || c.battle.status !== 'victory') return;
      set((st) => ({ ui: { ...st.ui, battleSkillId: null } }));
      let next = settleBattle(c);
      next = engineResolveVictory(next);
      next = evaluateReplacementFlow(next);
      commit(next);
    },

    // 战败/撤退：清除战斗，房间保持未清除，返回地牢。
    battleRetreat: () => {
      const c = get().campaign;
      if (!c?.battle) return;
      set((st) => ({ ui: { ...st.ui, battleSkillId: null } }));
      // Phase 7：撤退前消费剩余压力事件与死亡同步，避免清除战斗时丢失
      commit(retreatFromBattle(settleBattle(c)));
    },

    // ---- Phase 4：结算与 Hamlet（全部委托 game-engine，经 commit 自动保存） ----
    leaveDungeon: () => {
      const c = get().campaign;
      if (!c || c.gamePhase !== 'dungeon-explore' || !c.dungeon) return;
      let next = finishQuest(c, 'left');
      if (next === c) return;
      // Phase 6：仍有未确认替补 → 切换 resumePhase 到 quest-result 再判定
      next = retargetPendingReplacement(next, 'quest-result');
      next = evaluateReplacementFlow(next);
      commit(next);
    },

    failQuestFromDefeat: () => {
      const c = get().campaign;
      if (!c?.battle || c.battle.status !== 'defeat') return;
      let next = settleBattle(c);
      next = failQuestFromBattle(next);
      if (next === c) return;
      next = retargetPendingReplacement(next, 'quest-result');
      next = evaluateReplacementFlow(next);
      commit(next);
    },

    returnToHamlet: () => {
      const c = get().campaign;
      if (!c) return;
      // Phase 11A.1 §9：返回 Hamlet 是一次性事务，调用 finalizeQuestReturnToHamlet
      // 推进 Campaign Progress（Standard 完成计数 / Boss 胜利 / Act 推进 / Act IV 解锁）。
      const summary = c.lastQuestResult;
      const questId = summary?.questId ?? c.currentQuestId ?? '';
      let afterCampaign = c;
      if (questId) {
        const dungeon = c.dungeon;
        const questRunId = dungeon?.questRunId ?? `${questId}:no-run`;
        const result = finalizeQuestReturnToHamlet(c, {
          questId,
          questRunId,
          questOutcome: summary?.outcome ?? 'incomplete',
        });
        if (result.ok) {
          afterCampaign = result.campaign;
        }
      }
      let next = startHamletPhase(afterCampaign);
      if (next === afterCampaign) return;
      next = retargetPendingReplacement(next, 'hamlet');
      next = evaluateReplacementFlow(next);
      commit(next);
    },

    visitBuilding: (heroId, buildingId) => {
      const c = get().campaign;
      if (!c) return;
      const next = visitHamletBuilding(c, heroId, buildingId);
      if (next === c) return;
      commit(next);
    },

    skipHeroToday: (heroId) => {
      const c = get().campaign;
      if (!c) return;
      const next = skipHeroAction(c, heroId);
      if (next === c) return;
      commit(next);
    },

    endHamletDay: () => {
      const c = get().campaign;
      if (!c) return;
      const next = engineEndHamletDay(c);
      if (next === c) return;
      commit(next);
    },

    // ---- Phase 6：统一伤害/治疗/死亡 ----
    applyDamage: (command) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: next } = engineResolveDamage(c, command);
      if (next === c) return;
      commit(next);
    },

    healActor: (targetId, amount) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: next } = engineResolveHealing(c, targetId, amount);
      if (next === c) return;
      commit(next);
    },

    recordHeroDeath: (cmd) => {
      const c = get().campaign;
      if (!c) return;
      const next = killCampaignHero(c, cmd);
      if (next === c) return;
      commit(next);
    },

    openReplacementFlow: () => {
      const c = get().campaign;
      if (!c || unconfirmedSlotCount(c) === 0) return;
      const next = evaluateReplacementFlow(c);
      if (next === c) return;
      commit(next);
    },

    // ---- Phase 6：替补流程 ----
    selectReplacementHero: (slotId, heroClassId) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineSelectReplacementHero(c, slotId, heroClassId);
      if (next === c) return;
      commit(next);
    },

    addReplacementUpgrade: (slotId, op) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineAddReplacementUpgrade(c, slotId, op);
      if (next === c) return;
      commit(next);
    },

    removeReplacementUpgrade: (slotId, operationId) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineRemoveReplacementUpgrade(c, slotId, operationId);
      if (next === c) return;
      commit(next);
    },

    confirmReplacement: (slotId) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineConfirmReplacement(c, slotId);
      if (next === c) return;
      commit(next);
    },

    completeReplacementFlow: () => {
      const c = get().campaign;
      if (!c) return;
      const next = engineCompleteReplacementFlow(c);
      if (next === c) return;
      commit(next);
    },

    // ---- Phase 6：Stagecoach 与战役失败 ----
    applyQuestXpToStagecoach: (xp) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineApplyQuestXp(c, xp);
      if (next === c) return;
      commit(next);
    },

    failCampaign: (reason) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineFailCampaign(c, reason);
      if (next === c) return;
      commit(next);
    },

    // ---- Phase 7：Debug 受控入口（统一管线，阈值规则照常生效） ----
    debugApplyStress: (heroId, amount) => {
      const c = get().campaign;
      if (!c || amount <= 0) return;
      let { campaign: next } = engineApplyStress(c, {
        heroId,
        amount,
        sourceType: 'debug',
        sourceId: 'debug-panel',
        questId: c.currentQuestId ?? '',
        battleId: c.battle?.battleId,
      });
      if (next === c) return;
      // 阈值可能触发 Heart Attack → 同步战斗死亡
      if (next.battle) next = processBattleDeaths(next);
      commit(next);
    },

    debugRecoverStress: (heroId, amount) => {
      const c = get().campaign;
      if (!c || amount <= 0) return;
      const { campaign: next } = engineRecoverStress(c, {
        heroId,
        amount,
        sourceType: 'debug',
        sourceId: 'debug-panel',
        questId: c.currentQuestId ?? '',
      });
      if (next === c) return;
      commit(next);
    },

    // ---- Phase 8A：Quirk（组件不得直接改 quirk 数组，全部经引擎入口） ----
    visitAbbey: (heroId, quirkId) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineVisitAbbey(c, heroId, quirkId);
      if (next === c) return;
      commit(next);
    },

    resolveQuirkDecision: (decisionId, choice) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineResolveQuirkDecision(c, decisionId, choice);
      if (next === c) return;
      commit(next);
    },

    debugGrantQuirk: (heroId, quirkId) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: acquired, outcome } = engineAcquireQuirk(c, heroId, quirkId, {
        source: 'debug',
        deathSource: c.battle ? 'battle' : c.gamePhase === 'dungeon-explore' ? 'exploration' : 'quest-result',
        deathResumePhase:
          c.gamePhase === 'dungeon-explore'
            ? 'dungeon-explore'
            : c.gamePhase === 'hamlet'
              ? 'hamlet'
              : 'quest-result',
      });
      let next = acquired;
      if (next === c) return;
      // 疯狂死亡可能导致队伍减员 → 走替补流程判定
      if (outcome === 'madness-death') {
        if (next.battle) next = processBattleDeaths(next);
        next = evaluateReplacementFlow(next);
      }
      // Disease 替换引发的 Quirk 决策一旦结清，收尾事务
      next = finalizeDiseaseTransaction(next);
      commit(next);
    },

    // ---- Phase 8B：Disease / Sanitarium（组件不得直接改 hero.disease） ----
    visitSanitariumRemoveDisease: (heroId) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: next, error } = engineRemoveDisease(c, heroId);
      if (error || next === c) return;
      commit(next);
    },

    sanitariumRemoveDiseaseError: (heroId) => {
      const c = get().campaign;
      if (!c) return '战役未初始化';
      return sanitariumRemoveDiseaseError(c, heroId);
    },

    debugGrantDisease: (heroId, diseaseId) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: acquired, outcome } = engineAcquireDisease(c, {
        heroId,
        diseaseId,
        source: 'debug',
        sourceEventId: `debug-${heroId}-${diseaseId}-${Date.now()}`,
        questId: c.currentQuestId,
        deathSource: c.battle
          ? 'battle'
          : c.gamePhase === 'dungeon-explore'
            ? 'exploration'
            : 'quest-result',
        deathResumePhase:
          c.gamePhase === 'dungeon-explore'
            ? 'dungeon-explore'
            : c.gamePhase === 'hamlet'
              ? 'hamlet'
              : 'quest-result',
      });
      let next = acquired;
      if (next === c) return;
      // 替换 Disease 时抽到的负面 Quirk 可能触发 Madness Death → 走替补流程
      if (outcome === 'replaced-hero-died') {
        if (next.battle) next = processBattleDeaths(next);
        next = evaluateReplacementFlow(next);
      }
      commit(next);
    },

    interactWithCurio: (heroId) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: next, error } = engineInteractWithCurio(c, heroId);
      if (error || next === c) return;
      // Curio 感染可能触发 Madness Death（替换 Disease → 第 4 个负面 Quirk）
      commit(evaluateReplacementFlow(next));
    },

    acknowledgeDiseaseAcquisition: () => {
      const c = get().campaign;
      if (!c || !c.lastDiseaseAcquisition) return;
      commit({ ...c, lastDiseaseAcquisition: null });
    },

    // ---- Phase 8D：Guild 会话（组件只触发，规则全在 game-engine/hamlet/guild.ts） ----
    startGuildVisit: (heroId) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineStartGuildVisit(c, heroId);
      if (next === c) return;
      commit(next);
    },

    cancelGuildVisit: () => {
      const c = get().campaign;
      if (!c) return;
      const next = engineCancelGuildVisit(c);
      if (next === c) return;
      commit(next);
    },

    addGuildUpgrade: (request) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineAddGuildUpgrade(c, request);
      if (next === c) return;
      commit(next);
    },

    removeGuildUpgrade: (choiceId) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineRemoveGuildUpgrade(c, choiceId);
      if (next === c) return;
      commit(next);
    },

    commitGuildVisit: () => {
      const c = get().campaign;
      if (!c) return '战役未初始化';
      const { campaign: next, ok, error } = engineCommitGuildVisit(c);
      if (!ok) return error ?? '升级失败';
      commit(next);
      return null;
    },

    // ---- Phase 8C：Trinket / Nomad Wagon（组件不得直接改 equippedTrinkets） ----
    useTrinketOpportunity: (opportunityId) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: resolved, error } = resolveTrinketOpportunity(c, opportunityId, 'use');
      if (error || resolved === c) return;
      let next = resolved;
      // 使用效果（自伤等）或恢复执行的冻结动作都可能改变战斗状态 → 统一结算
      if (next.battle) next = settleBattle(next);
      // 非战斗场景的自伤可能导致永久死亡 → 替补流程判定
      if (next.gamePhase === 'dungeon-explore') next = evaluateReplacementFlow(next);
      commit(next);
    },

    declineTrinketOpportunity: (opportunityId) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: resolved, error } = resolveTrinketOpportunity(c, opportunityId, 'decline');
      if (error || resolved === c) return;
      let next = resolved;
      if (next.battle) next = settleBattle(next);
      commit(next);
    },

    resolveTrinketAllocation: (allocationId, choice) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: next, error } = engineResolveTrinketAllocation(c, allocationId, choice);
      if (error || next === c) return;
      commit(next);
    },

    transferTrinket: (fromHeroId, toHeroId, instanceId) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: next, error } = engineTransferTrinket(c, fromHeroId, toHeroId, instanceId);
      if (error || next === c) return;
      commit(next);
    },

    discardTrinket: (heroId, instanceId) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: next, error } = engineDiscardTrinket(c, heroId, instanceId);
      if (error || next === c) return;
      commit(next);
    },

    openNomadWagon: () => {
      const c = get().campaign;
      if (!c || c.gamePhase !== 'hamlet') return;
      const next = ensureNomadWagonOffer(c);
      if (next === c) return;
      // 生成后立即落盘：刷新不重抽（§16.3）
      commit(next);
    },

    commitNomadWagonVisit: (cmd) => {
      const c = get().campaign;
      if (!c) return '战役未初始化';
      const { campaign: next, error } = engineCommitNomadWagonVisit(c, cmd);
      if (error) return error;
      commit(next);
      return null;
    },

    guildVisitError: (heroId) => {
      const c = get().campaign;
      if (!c) return '战役未初始化';
      return engineGuildVisitError(c, heroId);
    },

    // ---- Phase 8D：Blacksmith 临时 Skill Form ----
    visitBlacksmith: (heroId, skillId) => {
      const c = get().campaign;
      if (!c) return;
      const next = engineVisitBlacksmith(c, heroId, skillId);
      if (next === c) return;
      commit(next);
    },

    blacksmithVisitError: (heroId, skillId) => {
      const c = get().campaign;
      if (!c) return '战役未初始化';
      return engineBlacksmithVisitError(c, heroId, skillId);
    },

    debugGrantXp: (heroId, amount) => {
      const c = get().campaign;
      if (!c || amount <= 0) return;
      const next = engineEarnHeroXp(c, heroId, amount, 'Debug 面板发放');
      if (next === c) return;
      commit(next);
    },

    debugGrantTrinket: (heroId, trinketId) => {
      const c = get().campaign;
      if (!c) return;
      const { campaign: next } = engineAcquireTrinket(c, {
        trinketId,
        source: 'debug',
        sourceEventId: `debug-trk:${heroId}:${trinketId}:${Date.now()}`,
        questId: c.currentQuestId,
        heroId,
      });
      if (next === c) return;
      commit(next);
    },
  };
});

/** 根据 gamePhase 映射到路由路径（统一由路由守卫模块提供）。 */
export const routeForPhase = guardRouteForPhase;
