import type { GamePhase } from '../../types';

/** 后续阶段的页面空壳占位（Phase 2+ 待实现）。 */
export default function PendingPhase({ title, phase }: { title: string; phase: GamePhase }) {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-3 text-dd-text">{title}</h1>
      <div className="rounded-lg border border-dd-border bg-dd-panel p-5">
        <p className="text-dd-muted">
          该阶段（状态机：<code className="text-dd-text">{phase}</code>）属于 Phase 2+，将在后续开发中实现。
        </p>
        <p className="text-dd-muted text-sm mt-2">
          当前为页面空壳，仅用于开发导航与结构验证。进入此页需先通过首页建立战役。
        </p>
      </div>
    </div>
  );
}
