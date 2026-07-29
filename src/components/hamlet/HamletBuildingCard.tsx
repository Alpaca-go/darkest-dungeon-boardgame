import type { HamletBuildingDefinition } from '../../types';

/** Hamlet 建筑卡片（纯色块）。禁用原因由父组件计算并传入。 */
export default function HamletBuildingCard({
  building,
  blocked,
  occupied,
  disabledReason,
  onVisit,
}: {
  building: HamletBuildingDefinition;
  /** 被 Caretaker 阻塞。 */
  blocked: boolean;
  /** 今天已被其他英雄占用。 */
  occupied: boolean;
  /** 不可访问原因（null 表示可以访问）。 */
  disabledReason: string | null;
  onVisit: () => void;
}) {
  const disabled = disabledReason !== null;
  return (
    <button
      type="button"
      onClick={onVisit}
      disabled={disabled}
      title={disabledReason ?? `花费 ${building.cost} Gold：${building.effect}`}
      className={[
        'relative rounded-lg border p-3 text-left transition-all w-full',
        blocked
          ? 'border-red-500/60 bg-red-500/5 cursor-not-allowed'
          : disabled
            ? 'border-dd-border bg-dd-panel opacity-60 cursor-not-allowed'
            : 'border-dd-border bg-dd-panel hover:border-dd-accent hover:-translate-y-0.5',
      ].join(' ')}
      data-testid={`building-${building.id}`}
    >
      <div className="w-full h-14 rounded mb-2" style={{ background: building.color }} aria-hidden />
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-bold text-dd-text text-sm">{building.name}</span>
        <span className="text-[11px] text-dd-warn shrink-0">{building.cost} Gold</span>
      </div>
      <p className="text-[11px] text-dd-muted mt-1">{building.effect}</p>

      {blocked && (
        <span className="absolute top-2 right-2 text-[10px] font-bold text-red-400 bg-red-500/20 border border-red-500/50 rounded px-1.5 py-0.5">
          Caretaker 阻塞
        </span>
      )}
      {!blocked && occupied && (
        <span className="absolute top-2 right-2 text-[10px] font-bold text-amber-400 bg-amber-500/20 border border-amber-500/50 rounded px-1.5 py-0.5">
          今日已占用
        </span>
      )}
    </button>
  );
}
