import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore, routeForPhase } from '../store/useGameStore';
import { getHeroById } from '../data/heroes';
import QuestSummary from '../components/result/QuestSummary';
import HeroResultCard from '../components/result/HeroResultCard';

/**
 * 任务结算页 /result。
 * 数据源为 campaign.lastQuestResult（结算只发生一次，刷新后仍可展示）。
 */
export default function QuestResultPage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const returnToHamlet = useGameStore((s) => s.returnToHamlet);

  if (!campaign) return <Navigate to="/" replace />;
  // 已进入 Hamlet 或其他阶段时重定向到对应页面（刷新恢复路由）。
  if (campaign.gamePhase !== 'quest-result' || !campaign.lastQuestResult) {
    return <Navigate to={routeForPhase(campaign.gamePhase)} replace />;
  }

  const summary = campaign.lastQuestResult;

  const onReturnToHamlet = () => {
    returnToHamlet();
    navigate('/hamlet');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-dd-text">任务结算</h1>

      <QuestSummary summary={summary} />

      <div>
        <h2 className="text-sm font-bold text-dd-text mb-2">小队状态</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {summary.heroes.map((hr) => {
            const inst = campaign.heroes.find((h) => h.instanceId === hr.instanceId);
            const def = inst ? getHeroById(inst.heroId) : undefined;
            return (
              <HeroResultCard key={hr.instanceId} hero={hr} color={def?.color ?? '#463b34'} />
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-dd-border bg-dd-panel p-4 flex items-center justify-between">
        <p className="text-xs text-dd-muted">
          当前 Gold：<span className="text-dd-warn font-bold">{campaign.gold}</span> · Light 已重置为
          5 · 战斗临时状态已清除。
        </p>
        <button
          onClick={onReturnToHamlet}
          className="px-5 py-2 rounded bg-dd-accent text-white text-sm font-semibold hover:brightness-110 transition-all"
          data-testid="return-hamlet"
        >
          返回 Hamlet
        </button>
      </div>
    </div>
  );
}
