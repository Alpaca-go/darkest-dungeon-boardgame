import { useGameStore } from '../../store/useGameStore';
import { actFourStageLabel } from '../../game-engine/campaign/act-four/act-four-state';
import DarkestDungeonQuestReveal from './DarkestDungeonQuestReveal';
import ExcavationSitePanel from './ExcavationSitePanel';
import FinalHamletPanel from './FinalHamletPanel';
import FinalEncounterHeader from './FinalEncounterHeader';
import FormTransitionOverlay from './FormTransitionOverlay';

/**
 * Act IV 顶部常驻横幅（只读）：游戏内唯一可见入口，挂在 GameShell。
 * 解锁后常驻显示当前 Stage，并按阶段条件渲染对应的子面板
 * （Quest 揭示 / Excavation / Final Hamlet / Final Encounter / Form 切换）。
 * 不读取 Objective 位置（硬约束 6）。
 */
export default function ActFourHeader() {
  const campaign = useGameStore((s) => s.campaign);
  if (!campaign || !campaign.actFourState.unlocked) return null;

  const a4 = campaign.actFourState;
  const inFinalEncounter =
    a4.stage === 'final-encounter-ready' || a4.stage === 'final-encounter-active';

  return (
    <div
      className="border-b-2 border-red-900/60 bg-gradient-to-r from-red-950/40 to-dd-panel px-5 py-2 text-sm"
      data-testid="act-four-header"
    >
      <div className="flex items-center gap-3">
        <span className="font-bold text-red-300 tracking-wide">ACT IV · DARKEST DUNGEON</span>
        <span className="text-dd-muted">{actFourStageLabel(a4.stage)}</span>
        <span className="text-[10px] text-dd-muted">Campaign Level 保持 III</span>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {a4.questDrawRecord && <DarkestDungeonQuestReveal />}
        {a4.excavationSiteStates.length > 0 && <ExcavationSitePanel />}
        {a4.stage === 'final-hamlet' && <FinalHamletPanel />}
        {inFinalEncounter && <FinalEncounterHeader />}
        {a4.finalEncounterState?.transitionState && <FormTransitionOverlay />}
      </div>
    </div>
  );
}
