import { useGameStore } from '../../store/useGameStore';
import { getFinalFormDisplayName } from '../../data/darkest-dungeon/final-form-registry';

/**
 * 只读展示：Final Encounter 当前 Form / 顺序 / 进度（§18）。
 * 强调硬约束 15 / 16：跨 Form 不恢复 Life / Stress，不换 Stance。
 */
export default function FinalEncounterHeader() {
  const campaign = useGameStore((s) => s.campaign);
  const enc = campaign?.actFourState.finalEncounterState;
  if (!enc) return null;

  const current = enc.activeFormId ? getFinalFormDisplayName(enc.activeFormId) : '—';
  const ordered = enc.orderedFormIds.map((id) => getFinalFormDisplayName(id)).join(' → ');

  return (
    <div
      className="rounded border border-red-900/50 bg-red-950/30 p-2"
      data-testid="final-encounter-header"
    >
      <div className="text-red-300 mb-1 text-xs">Final Encounter</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <span>
          当前 Form：<b className="text-dd-text">{current}</b>
        </span>
        <span className="text-dd-muted">顺序：{ordered}</span>
        <span className="text-dd-muted">
          已击败：{enc.defeatedFormIds.length}/{enc.orderedFormIds.length}
        </span>
        <span className="text-dd-muted">跨 Form 不恢复 Life/Stress，不换 Stance</span>
      </div>
    </div>
  );
}
