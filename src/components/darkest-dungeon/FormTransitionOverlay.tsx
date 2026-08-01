import { useGameStore } from '../../store/useGameStore';
import { getFinalFormDisplayName } from '../../data/darkest-dungeon/final-form-registry';

/**
 * 只读展示：Form 切换中的瞬时状态（§19 / §20）。
 * 强调：伤势 / 压力原样带入，先攻重排、Round 归 1。
 */
export default function FormTransitionOverlay() {
  const campaign = useGameStore((s) => s.campaign);
  const t = campaign?.actFourState.finalEncounterState?.transitionState;
  if (!t) return null;

  return (
    <div
      className="rounded border border-amber-900/50 bg-amber-950/20 p-2"
      data-testid="form-transition-overlay"
    >
      <div className="text-amber-300 mb-1 text-xs">Form 切换中</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-dd-muted">
        <span>
          {getFinalFormDisplayName(t.fromFormId)} → {getFinalFormDisplayName(t.toFormId)}
        </span>
        <span>伤势 / 压力原样带入（不恢复）</span>
        <span>先攻重排 · Round 归 1</span>
        <span>状态：{t.status}</span>
      </div>
    </div>
  );
}
