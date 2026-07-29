import { useEffect, useRef } from 'react';
import type { GameLogEntry } from '../../types';

const KIND_CLS: Record<string, string> = {
  info: 'text-dd-muted',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
};

/** Hamlet 行动日志（自动滚动到底部）。 */
export default function HamletLog({ log }: { log: GameLogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log.length]);

  return (
    <div className="rounded-lg border border-dd-border bg-dd-panel p-3">
      <h3 className="text-sm font-bold text-dd-text mb-2">Hamlet 日志</h3>
      <div ref={ref} className="max-h-44 overflow-y-auto space-y-1 pr-1" data-testid="hamlet-log">
        {log.length === 0 && <p className="text-[11px] text-dd-muted">暂无记录。</p>}
        {log.map((e) => (
          <p key={e.id} className={`text-[11px] leading-4 ${KIND_CLS[e.kind ?? 'info']}`}>
            {e.message}
          </p>
        ))}
      </div>
    </div>
  );
}
