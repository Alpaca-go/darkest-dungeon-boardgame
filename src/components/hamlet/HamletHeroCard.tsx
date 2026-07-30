import type { HeroInstance } from '../../types';
import ResolveStateBadge from '../mental/ResolveStateBadge';
import { getQuirkById } from '../../data/placeholder-quirks';

/** Hamlet 左侧英雄卡：状态 + 选中 + 跳过按钮。 */
export default function HamletHeroCard({
  hero,
  color,
  selected,
  onSelect,
  onSkip,
}: {
  hero: HeroInstance;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onSkip: () => void;
}) {
  const hp = Math.max(0, hero.maxLife - hero.wounds);
  const dead = !hero.isAlive;
  return (
    <div
      className={[
        'rounded-md border p-2.5 transition-all',
        dead
          ? 'border-dd-border bg-dd-panel opacity-40'
          : selected
            ? 'border-dd-accent bg-dd-panel ring-1 ring-dd-accent'
            : 'border-dd-border bg-dd-panel hover:border-dd-muted',
      ].join(' ')}
      data-testid={`hamlet-hero-${hero.instanceId}`}
    >
      <button
        type="button"
        className="w-full text-left disabled:cursor-not-allowed"
        onClick={onSelect}
        disabled={dead || hero.hasActedToday}
        title={dead ? '已阵亡' : hero.hasActedToday ? '今天已行动' : '选中后点击建筑访问'}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded shrink-0" style={{ background: color }} aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-dd-text text-sm truncate">{hero.name}</span>
              {dead ? (
                <span className="text-[10px] text-red-400 font-bold shrink-0">阵亡</span>
              ) : hero.hasActedToday ? (
                <span className="text-[10px] text-emerald-400 shrink-0">✓ 已行动</span>
              ) : (
                <span className="text-[10px] text-dd-warn shrink-0">待行动</span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-2 text-[11px] text-dd-muted">
              <span>HP <span className="text-dd-text">{hp}/{hero.maxLife}</span></span>
              <span>
                Stress{' '}
                <span className={hero.stress >= 10 ? 'text-red-400 font-bold' : hero.stress >= 7 ? 'text-amber-400' : 'text-dd-text'}>
                  {hero.stress}/10
                </span>
              </span>
              <span>XP <span className="text-sky-400">{hero.xp}</span></span>
              {hero.temporaryDamageBonus > 0 && (
                <span className="text-red-400">⚔ +{hero.temporaryDamageBonus}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              <ResolveStateBadge
                resolveState={hero.resolveState}
                virtueId={hero.virtueId}
                afflictionId={hero.afflictionId}
              />
              {[...hero.positiveQuirkIds, ...hero.negativeQuirkIds].map((qid) => {
                const q = getQuirkById(qid);
                if (!q) return null;
                return (
                  <span
                    key={qid}
                    className={`px-1 rounded text-[10px] leading-4 ${
                      q.polarity === 'positive' ? 'bg-sky-900/70 text-sky-200' : 'bg-stone-700/70 text-stone-300'
                    }`}
                    title={`${q.description}（效果将在 Phase 8 启用）`}
                  >
                    {q.name}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </button>
      {!dead && !hero.hasActedToday && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-1.5 w-full text-[11px] text-dd-muted border border-dd-border rounded px-2 py-1 hover:text-dd-text hover:bg-dd-panel2 transition-colors"
          data-testid={`skip-${hero.instanceId}`}
        >
          跳过今天行动
        </button>
      )}
    </div>
  );
}
