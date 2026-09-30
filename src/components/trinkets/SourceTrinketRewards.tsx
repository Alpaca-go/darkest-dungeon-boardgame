import { useGameStore } from '../../store/useGameStore';

export default function SourceTrinketRewards() {
  const rewards = useGameStore(s => s.campaign?.pendingSourceTrinketRewards ?? []);
  if (!rewards.length) return null;
  return <aside className="border border-dd-border bg-dd-panel p-3 text-sm" data-testid="source-trinket-rewards">
    <div>已获得的饰品</div>
    {rewards.map(r => <p key={r.sourceEventId}>{r.printedName} · 等级 {r.level} · 已保留；效果暂不可执行。</p>)}
  </aside>;
}
