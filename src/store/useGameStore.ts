import { create } from 'zustand';
import type {
  CampaignState,
  GamePhase,
  HeroBattleAction,
  ProvisionPool,
} from '../types';
import { createNewCampaign } from '../game-engine/campaign';
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

  // ---- Phase 1 真实实现 ----
  newCampaign(): void;
  continueCampaign(): void;
  resetCampaign(): void;

  // ---- Phase 2+ 预留桩（本阶段不实现业务逻辑） ----
  chooseHero(heroId: string): void;
  removeHero(heroId: string): void;
  equipSkill(heroId: string, skillId: string): void;
  chooseQuest(questId: string): void;
  scout(): void;
  moveToRoom(roomId: string): void;
  useProvision(type: keyof ProvisionPool, heroId?: string): void;
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

export const useGameStore = create<GameStore>((set, get) => ({
  campaign: initialCampaign,
  ui: EMPTY_UI,

  // 新建战役：创建初始状态并写入存档。
  newCampaign: () => {
    const campaign = createNewCampaign();
    set({ campaign, ui: { ...EMPTY_UI } });
    saveCampaign(campaign);
  },

  // 继续战役：若内存中无战役则从存档读取（刷新后通常已恢复）。
  continueCampaign: () => {
    if (!get().campaign) {
      const loaded = loadCampaign();
      if (loaded) set({ campaign: loaded });
    }
  },

  // 清除本地存档。
  resetCampaign: () => {
    clearCampaign();
    set({ campaign: null, ui: { ...EMPTY_UI } });
  },

  // ---- 以下为后续阶段预留，本阶段仅为空实现 ----
  chooseHero: () => {
    /* Phase 2: 战役设置选择英雄 */
  },
  removeHero: () => {
    /* Phase 2: 移除已选英雄 */
  },
  equipSkill: () => {
    /* Phase 2: 装备/卸下技能 */
  },
  chooseQuest: () => {
    /* Phase 2: 选择任务并生成地牢 */
  },
  scout: () => {
    /* Phase 2: 侦察相邻房间 */
  },
  moveToRoom: () => {
    /* Phase 2: 移动到相邻房间 */
  },
  useProvision: () => {
    /* Phase 3: 使用补给 */
  },
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
}));

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
