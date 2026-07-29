import { create } from 'zustand';
import type { CampaignState, GamePhase, HeroBattleAction, ProvisionPool } from '../types';
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
  leaveBattlePhase2,
} from '../game-engine/dungeon';
import {
  clearCampaign,
  loadCampaign,
  saveCampaign,
} from '../game-engine/save';

// UI 临时状态（不持久化）。
interface UiState {
  selectedHeroId: string | null;
  selectedSkillId: string | null;
  modal: string | null;
}

interface GameStore {
  campaign: CampaignState | null;
  ui: UiState;

  // ---- 通用 ----
  newCampaign(): void;
  continueCampaign(): void;
  resetCampaign(): void;
  setPhase(phase: GamePhase): void;

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
  leaveBattle(): void;
  useProvision(type: keyof ProvisionPool, heroId?: string): void;

  // ---- Phase 3/4 预留（本阶段不实现） ----
  heroAction(action: HeroBattleAction): void;
  advanceBattle(): void;
  visitBuilding(heroId: string, buildingId: string): void;
  endHamletDay(): void;
}

const EMPTY_UI: UiState = {
  selectedHeroId: null,
  selectedSkillId: null,
  modal: null,
};

// 初始化时尝试从 localStorage 恢复战役（刷新可恢复进度）。
const initialCampaign = loadCampaign();

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

    setPhase: (phase) => {
      const c = get().campaign;
      if (!c) return;
      commit({ ...c, gamePhase: phase });
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
        const inst = createHeroInstance(heroId);
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
      commit(engineMoveToRoom(c, roomId));
    },

    // Phase 3 前的临时出口：清除战斗状态并返回地牢（不结算战斗）。
    leaveBattle: () => {
      const c = get().campaign;
      if (!c) return;
      commit(leaveBattlePhase2(c));
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

    // ---- Phase 3/4 预留，本阶段为安全空实现 ----
    heroAction: () => {
      /* Phase 3: 英雄战斗动作 */
    },
    advanceBattle: () => {
      /* Phase 3: 推进先攻 */
    },
    visitBuilding: () => {
      /* Phase 4: 访问建筑 */
    },
    endHamletDay: () => {
      /* Phase 4: 结束 Hamlet 当天 */
    },
  };
});

/** 根据 gamePhase 映射到路由路径（供首页“继续战役”使用）。 */
export function routeForPhase(phase: GamePhase): string {
  switch (phase) {
    case 'home':
      return '/';
    case 'campaign-setup':
      return '/setup';
    case 'skill-loadout':
      return '/loadout';
    case 'quest-select':
      return '/quests';
    case 'dungeon-explore':
      return '/dungeon';
    case 'battle':
      return '/battle';
    case 'quest-result':
      return '/result';
    case 'hamlet':
      return '/hamlet';
    case 'campaign-over':
      return '/';
    default:
      return '/';
  }
}
