import { useEffect, useRef } from 'react';
import type { GameLogEntry } from '../../types';

const KIND_CLS: Record<string, string> = {
  info: 'text-dd-muted',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
};

/** 战斗日志：最近条目在底部，自动滚动到底。 */
export default function BattleLog({ entries }: { entries: GameLogEntry[] }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className="rounded-lg border border-dd-border bg-dd-panel p-3">
      <h3 className="text-xs font-bold text-dd-text mb-2">战斗日志</h3>
      <div ref={boxRef} className="max-h-44 overflow-y-auto space-y-1 pr-1" data-testid="battle-log">
        {entries.map((e) => (
          <p key={e.id} className={`text-[11px] leading-4 ${KIND_CLS[e.kind ?? 'info']}`}>
            {e.message}
          </p>
        ))}
      </div>
    </div>
  );
}
