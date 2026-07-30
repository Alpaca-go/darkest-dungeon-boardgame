import type { ReactNode } from 'react';
import type { GamePhase } from '../types';
import HomePage from '../pages/HomePage';
import CampaignSetupPage from '../pages/CampaignSetupPage';
import SkillLoadoutPage from '../pages/SkillLoadoutPage';
import QuestSelectPage from '../pages/QuestSelectPage';
import DungeonExplorePage from '../pages/DungeonExplorePage';
import BattlePage from '../pages/BattlePage';
import QuestResultPage from '../pages/QuestResultPage';
import HamletPage from '../pages/HamletPage';
import ReplacementPage from '../pages/ReplacementPage';
import CampaignOverPage from '../pages/CampaignOverPage';

export interface RouteDef {
  path: string;
  phase: GamePhase;
  label: string;
  element: ReactNode;
}

// 全部页面路由定义。GameShell 作为统一外层布局，页面渲染在 Outlet 中。
export const ROUTES: RouteDef[] = [
  { path: '/', phase: 'home', label: '首页', element: <HomePage /> },
  { path: '/setup', phase: 'campaign-setup', label: '战役设置', element: <CampaignSetupPage /> },
  { path: '/loadout', phase: 'skill-loadout', label: '技能配置', element: <SkillLoadoutPage /> },
  { path: '/quests', phase: 'quest-select', label: '任务选择', element: <QuestSelectPage /> },
  { path: '/dungeon', phase: 'dungeon-explore', label: '地牢探索', element: <DungeonExplorePage /> },
  { path: '/battle', phase: 'battle', label: '战斗', element: <BattlePage /> },
  { path: '/result', phase: 'quest-result', label: '任务结算', element: <QuestResultPage /> },
  { path: '/hamlet', phase: 'hamlet', label: '村庄', element: <HamletPage /> },
  { path: '/replacement', phase: 'replacement', label: '替补招募', element: <ReplacementPage /> },
  { path: '/campaign-over', phase: 'campaign-over', label: '战役结束', element: <CampaignOverPage /> },
];
