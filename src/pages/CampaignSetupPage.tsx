import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import { HEROES, getHeroById } from '../data/heroes';
import HeroCard from '../components/hero/HeroCard';

export default function CampaignSetupPage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const chooseHero = useGameStore((s) => s.chooseHero);
  const proceedToLoadout = useGameStore((s) => s.proceedToLoadout);

  if (!campaign) return <Navigate to="/" replace />;
  // 若尚未选满英雄，不应停留在此页之外的阶段
  if (campaign.gamePhase !== 'campaign-setup' && campaign.heroes.length < 4) {
    // 允许从后阶段返回时仍可查看，但不强制
  }

  const selectedIds = new Set(campaign.heroes.map((h) => h.heroId));
  const full = campaign.heroes.length >= 4;
  const canProceed = campaign.heroes.length === 4;

  const onContinue = () => {
    if (!canProceed) return;
    proceedToLoadout();
    navigate('/loadout');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-dd-text mb-1">战役设置 · 选择英雄</h1>
      <p className="text-dd-muted text-sm mb-4">
        选择恰好 4 名英雄组成小队。已选 {campaign.heroes.length} / 4。
      </p>

      <div className="grid md:grid-cols-[1fr_320px] gap-6">
        {/* 候选列表 */}
        <div>
          <h2 className="text-sm font-bold text-dd-text mb-2">英雄候选</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {HEROES.map((h) => (
              <HeroCard
                key={h.id}
                name={h.name}
                color={h.color}
                life={h.baseLife}
                speed={h.speed}
                stance={h.defaultStance}
                tags={h.tags}
                selected={selectedIds.has(h.id)}
                disabled={full && !selectedIds.has(h.id)}
                onClick={() => chooseHero(h.id)}
                footer={<span className="text-[11px] text-dd-muted">{h.description}</span>}
              />
            ))}
          </div>
        </div>

        {/* 已选队伍 */}
        <div>
          <h2 className="text-sm font-bold text-dd-text mb-2">当前小队</h2>
          <div className="grid grid-cols-1 gap-3">
            {Array.from({ length: 4 }).map((_, i) => {
              const hero = campaign.heroes[i];
              if (!hero) {
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-dashed border-dd-border bg-dd-panel/40 p-3 text-center text-dd-muted text-sm"
                  >
                    空位 {i + 1}
                  </div>
                );
              }
              const def = getHeroById(hero.heroId);
              return (
                <HeroCard
                  key={hero.instanceId}
                  name={hero.name}
                  color={def?.color ?? '#463b34'}
                  life={hero.maxLife}
                  wounds={hero.wounds}
                  stress={hero.stress}
                  speed={hero.speed}
                  stance={hero.stance}
                  selected
                  onClick={() => chooseHero(hero.heroId)}
                  footer={<span className="text-[11px] text-dd-accent2">点击移除</span>}
                />
              );
            })}
          </div>

          <button
            onClick={onContinue}
            disabled={!canProceed}
            className={[
              'mt-4 w-full px-4 py-2 rounded font-semibold transition-colors',
              canProceed
                ? 'bg-dd-accent text-white hover:bg-dd-accent2'
                : 'bg-dd-panel2 text-dd-muted cursor-not-allowed',
            ].join(' ')}
          >
            继续（技能配置）
          </button>
          {!canProceed && (
            <p className="text-xs text-dd-warn mt-2">需选满 4 名英雄才能继续。</p>
          )}
        </div>
      </div>
    </div>
  );
}
