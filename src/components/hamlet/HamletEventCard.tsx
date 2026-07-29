import type { HamletEventDefinition } from '../../types';

/** Hamlet 事件展示卡。 */
export default function HamletEventCard({
  event,
  preparationDays,
}: {
  event: HamletEventDefinition | undefined;
  preparationDays: number;
}) {
  if (!event) return null;
  return (
    <div className="rounded-lg border border-dd-border bg-dd-panel p-3" data-testid="hamlet-event">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-dd-text">{event.name}</h3>
        <span className="text-[11px] text-dd-warn shrink-0">剩余 {preparationDays} 天</span>
      </div>
      <p className="text-[11px] text-dd-muted mt-1">{event.description}</p>
      <p className="text-[11px] text-sky-400 mt-1">效果：{event.effect}</p>
    </div>
  );
}
