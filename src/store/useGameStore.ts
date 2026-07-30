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
  heroUseSkill as engineHeroUseSkill,
  endHeroTurn as engineEndHeroTurn,
  resolveVictory as engineResolveVictory,
} from '../game-engine/battle';
import {
  finishQuest,
  failQuestFromBattle,
} from '../game-engine/quest-result';
import {
  startHamletPhase,
  visitHamletBuilding,
  skipHeroAction,
  endHamletDay as engineEndHamletDay,
} from '../game-engine/hamlet';
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
import type { DamageCommand } from '../types';
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
      commit(engineSelectQuest(c, questId));
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
      // Phase 6：每次战斗 commit 前同步永久死亡到 Campaign（恰好一次）
      commit(processBattleDeaths({ ...c, battle }));
    },

    battleUseSkill: (targetId) => {
      const c = get().campaign;
      const skillId = get().ui.battleSkillId;
      if (!c?.battle || c.battle.status !== 'active' || !c.battle.activeActorId || !skillId) return;
      const battle = engineHeroUseSkill(c.battle, c.battle.activeActorId, skillId, targetId);
      if (battle === c.battle) return;
      set((st) => ({ ui: { ...st.ui, battleSkillId: null } }));
      commit(processBattleDeaths({ ...c, battle }));
    },

    battleEndTurn: () => {
      const c = get().campaign;
      if (!c?.battle || c.battle.status !== 'active' || !c.battle.activeActorId) return;
      set((st) => ({ ui: { ...st.ui, battleSkillId: null } }));
      const battle = engineEndHeroTurn(c.battle, c.battle.activeActorId);
      commit(processBattleDeaths({ ...c, battle }));
    },

    // 胜利结算：房间 cleared + Gold + 同步英雄状态 + 返回地牢；有阵亡 → 替补流程。
    battleResolveVictory: () => {
      const c = get().campaign;
      if (!c?.battle || c.battle.status !== 'victory') return;
      set((st) => ({ ui: { ...st.ui, battleSkillId: null } }));
      let next = processBattleDeaths(c);
      next = engineResolveVictory(next);
      next = evaluateReplacementFlow(next);
      commit(next);
    },

    // 战败/撤退：清除战斗，房间保持未清除，返回地牢。
    battleRetreat: () => {
      const c = get().campaign;
      if (!c?.battle) return;
      set((st) => ({ ui: { ...st.ui, battleSkillId: null } }));
      commit(retreatFromBattle(c));
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
      let next = processBattleDeaths(c);
      next = failQuestFromBattle(next);
      if (next === c) return;
      next = retargetPendingReplacement(next, 'quest-result');
      next = evaluateReplacementFlow(next);
      commit(next);
    },

    returnToHamlet: () => {
      const c = get().campaign;
      if (!c) return;
      let next = startHamletPhase(c);
      if (next === c) return;
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
  };
});

/** 根据 gamePhase 映射到路由路径（统一由路由守卫模块提供）。 */
export const routeForPhase = guardRouteForPhase;
