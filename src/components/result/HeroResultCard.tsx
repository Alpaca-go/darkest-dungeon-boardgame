import type { HeroQuestResult } from '../../types';

/** 结算页单个英雄状态卡（纯色块 + 数值）。 */
export default function HeroResultCard({
  hero,
  color,
}: {
  hero: HeroQuestResult;
  color: string;
}) {
  const hpPct = hero.maxHp > 0 ? Math.round((hero.hp / hero.maxHp) * 100) : 0;
  return (
    <div
      className={`rounded-md border border-dd-border bg-dd-panel p-3 flex items-center gap-3 ${
        hero.isAlive ? '' : 'opacity-50'
      }`}
      data-testid={`hero-result-${hero.instanceId}`}
    >
      <div
        className="w-10 h-10 rounded shrink-0"
        style={{ background: color }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between">
          <span className="font-bold text-dd-text text-sm truncate">{hero.name}</span>
          {!hero.isAlive && <span className="text-[10px] text-red-400 font-bold">阵亡</span>}
        </div>
        <div className="h-1.5 rounded bg-black/40 mt-1 overflow-hidden">
          <div
            className="h-full rounded bg-emerald-500"
            style={{ width: `${hpPct}%` }}
          />
        </div>
        <div className="flex gap-3 mt-1 text-[11px] text-dd-muted">
          <span>
            HP <span className="text-dd-text">{hero.hp}/{hero.maxHp}</span>
          </span>
          <span>
            Stress <span className="text-amber-400">{hero.stress}</span>
          </span>
          <span>
            XP <span className="text-sky-400">+{hero.xpGained}</span>
            <span className="text-[10px] text-dd-muted">（回村发放）</span>
          </span>
        </div>
      </div>
    </div>
  );
}
