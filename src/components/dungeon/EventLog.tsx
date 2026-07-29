import type { GameLogEntry } from '../../types';
import { LOG_DISPLAY_LIMIT } from '../../game-engine/log';

const KIND_COLOR: Record<NonNullable<GameLogEntry['kind']>, string> = {
  info: 'text-dd-muted',
  success: 'text-dd-positive',
  warning: 'text-dd-warn',
  danger: 'text-dd-accent2',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

/** 事件日志：显示最近 N 条，带时间/顺序着色。 */
export default function EventLog({ log }: { log: GameLogEntry[] }) {
  const recent = log.slice(-LOG_DISPLAY_LIMIT).reverse(); // 最新在上
  return (
    <div className="rounded-lg border border-dd-border bg-dd-panel p-3">
      <h3 className="text-sm font-bold text-dd-text mb-2">事件日志</h3>
      {recent.length === 0 ? (
        <p className="text-xs text-dd-muted">暂无事件。</p>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-auto">
          {recent.map((e, i) => (
            <li key={e.id} className="text-xs flex gap-2">
              <span className="text-dd-muted/60 tabular-nums w-12 shrink-0">
                #{log.length - i}
              </span>
              <span className="text-dd-muted/60 tabular-nums shrink-0">{formatTime(e.at)}</span>
              <span className={KIND_COLOR[e.kind ?? 'info']}>{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
