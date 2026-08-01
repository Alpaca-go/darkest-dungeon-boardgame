import { useGameStore } from '../../store/useGameStore';

/**
 * 只读展示：Final Hamlet（§16，固定 4 天，不抽 Hamlet Event）。
 */
export default function FinalHamletPanel() {
  const campaign = useGameStore((s) => s.campaign);
  const fh = campaign?.actFourState.finalHamletState;
  if (!fh) return null;

  return (
    <div className="rounded border border-dd-border bg-dd-panel2 p-2" data-testid="final-hamlet-panel">
      <div className="text-dd-muted mb-1 text-xs">Final Hamlet（最后的准备）</div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span>
          第 <b className="text-dd-text">{fh.currentDay}</b> / {fh.totalDays} 天
        </span>
        <span className={fh.status === 'completed' ? 'text-green-400' : 'text-amber-400'}>
          {fh.status}
        </span>
        <span className="text-dd-muted">本阶段不抽 Hamlet Event（固定规则）</span>
      </div>
    </div>
  );
}
