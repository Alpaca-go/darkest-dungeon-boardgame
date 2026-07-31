import type { TrinketSide } from '../../types/trinkets';
import { getTrinketById } from '../../data/trinkets/trinket-registry';

const STATUS_LABEL: Record<string, string> = {
  verified: '已核实',
  partial: '部分核实',
  prototype: '原型',
  unavailable: '缺数据',
};

const STATUS_CLASS: Record<string, string> = {
  verified: 'bg-emerald-900/70 text-emerald-300',
  partial: 'bg-amber-900/70 text-amber-300',
  prototype: 'bg-purple-900/70 text-purple-300',
  unavailable: 'bg-stone-700/70 text-stone-300',
};

interface Props {
  trinketId: string;
  currentSide: TrinketSide;
  usedThisTurn?: boolean;
  compact?: boolean;
}

/**
 * 单件饰品展示卡：名称 / 等级 / 数据可信度 / 当前面标签与描述 / 本回合已用标记。
 * 未知定义走安全兜底（红框提示），绝不白屏（核心约束 10）。
 */
export default function TrinketCard({ trinketId, currentSide, usedThisTurn, compact }: Props) {
  const def = getTrinketById(trinketId);
  if (!def) {
    return (
      <div
        className="rounded border border-red-800/60 bg-red-950/30 p-2 text-[11px] text-red-300"
        data-testid="trinket-unknown"
      >
        未知饰品（{trinketId}）：数据缺失，仅可丢弃
      </div>
    );
  }
  const side = currentSide === 'positive' ? def.positiveSide : def.negativeSide;
  const statusClass =
    STATUS_CLASS[def.officialDataStatus] ?? 'bg-stone-700/70 text-stone-300';

  return (
    <div
      className={[
        'rounded border p-2',
        currentSide === 'positive'
          ? 'border-emerald-800/50 bg-emerald-950/20'
          : 'border-rose-800/50 bg-rose-950/20',
      ].join(' ')}
      data-testid={`trinket-${trinketId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-dd-text truncate">{def.name}</span>
        <span
          className={`px-1 rounded text-[10px] leading-4 ${statusClass}`}
          title="官方数据可信度"
        >
          {STATUS_LABEL[def.officialDataStatus] ?? def.officialDataStatus}
        </span>
      </div>
      <div className="text-[11px] text-dd-muted mt-0.5">
        Lv{def.level} · {currentSide === 'positive' ? '正面' : '负面'}
      </div>
      {!compact && (
        <>
          <div className="text-[11px] text-dd-text mt-1">{side.label}</div>
          {side.description && (
            <div className="text-[10px] text-dd-muted mt-0.5 leading-snug">{side.description}</div>
          )}
        </>
      )}
      {usedThisTurn && <div className="text-[10px] text-amber-400 mt-1">本回合已使用</div>}
    </div>
  );
}
