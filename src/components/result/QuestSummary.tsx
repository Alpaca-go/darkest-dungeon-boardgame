import type { QuestResultSummary } from '../../types';

const OUTCOME_META: Record<
  QuestResultSummary['outcome'],
  { label: string; cls: string }
> = {
  completed: { label: '任务完成', cls: 'text-emerald-400 border-emerald-500 bg-emerald-500/10' },
  incomplete: { label: '任务未完成', cls: 'text-amber-400 border-amber-500 bg-amber-500/10' },
  failed: { label: '任务失败', cls: 'text-red-400 border-red-500 bg-red-500/10' },
};

/** 任务结算总览卡片（纯展示组件）。 */
export default function QuestSummary({ summary }: { summary: QuestResultSummary }) {
  const meta = OUTCOME_META[summary.outcome];
  const p = summary.provisionsLeft;
  return (
    <div className={`rounded-lg border p-4 ${meta.cls}`} data-testid="quest-summary">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">{summary.questName}</h2>
        <span className="text-xl font-black tracking-wide">{meta.label}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
        <div className="rounded bg-black/20 p-2">
          <div className="text-[11px] text-dd-muted">清除房间数</div>
          <div className="text-dd-text font-bold">{summary.roomsCleared}</div>
        </div>
        <div className="rounded bg-black/20 p-2">
          <div className="text-[11px] text-dd-muted">Objective</div>
          <div className="text-dd-text font-bold">
            {summary.objectiveComplete ? '✓ 已完成' : '✗ 未完成'}
          </div>
        </div>
        <div className="rounded bg-black/20 p-2">
          <div className="text-[11px] text-dd-muted">任务期间获得 Gold</div>
          <div className="text-dd-warn font-bold">+{summary.goldEarned}</div>
        </div>
        <div className="rounded bg-black/20 p-2">
          <div className="text-[11px] text-dd-muted">补给转换 Gold</div>
          <div className="text-dd-warn font-bold">+{summary.provisionGold}</div>
        </div>
      </div>
      <p className="text-[11px] text-dd-muted mt-3">
        剩余补给（已按每个 1 Gold 转换）：Food {p.food} · Bandage {p.bandage} · Potion {p.potion} ·
        Torch {p.torch} · Tool {p.tool}
      </p>
    </div>
  );
}
