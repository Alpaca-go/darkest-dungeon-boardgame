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

      {/* Phase 8D：队伍 XP 预览（真正发放推迟到回到 Hamlet） */}
      <div className="mt-3 rounded border border-sky-500/40 bg-sky-500/5 p-2.5 text-sm" data-testid="quest-xp-preview">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <span className="text-dd-text font-bold">队伍 XP（回到 Hamlet 时发放）</span>
          <span className="text-sky-400 font-black text-lg">
            +{summary.xpPerHero} <span className="text-[11px] text-dd-muted font-normal">/ 每名存活英雄</span>
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {summary.objectives.map((o) => (
            <span
              key={o.objectiveId}
              className={[
                'rounded px-2 py-0.5 text-[11px] border',
                o.completed
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                  : 'border-dd-border bg-dd-panel2 text-dd-muted',
              ].join(' ')}
              data-testid={`quest-objective-${o.objectiveId}`}
            >
              {o.completed ? '✓' : '✗'} {o.description}
              {!o.required && <span className="ml-1 text-[10px] opacity-70">（加分）</span>}
            </span>
          ))}
          {summary.objectives.length === 0 && (
            <span className="text-[11px] text-dd-muted">本任务无 Objective</span>
          )}
        </div>
        <p className="text-[11px] text-dd-muted mt-1.5">
          完成 {summary.completedObjectiveCount} / {summary.objectives.length} 个 Objective →
          每名英雄获得 {summary.xpPerHero} XP（上限 3）。
        </p>
      </div>

      <p className="text-[11px] text-dd-muted mt-3">
        剩余补给（已按每个 1 Gold 转换）：Food {p.food} · Bandage {p.bandage} · Potion {p.potion} ·
        Torch {p.torch} · Tool {p.tool}
      </p>
    </div>
  );
}
