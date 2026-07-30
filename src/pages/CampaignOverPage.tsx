import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore, routeForPhase } from '../store/useGameStore';

/**
 * 战役失败页 /campaign-over（Phase 6 §16）。
 * 展示失败原因、战役统计与全部阵亡记录；提供「开始新战役」入口。
 */
export default function CampaignOverPage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const resetCampaign = useGameStore((s) => s.resetCampaign);

  if (!campaign) return <Navigate to="/" replace />;
  if (campaign.gamePhase !== 'campaign-over') {
    return <Navigate to={routeForPhase(campaign.gamePhase)} replace />;
  }

  const onNewCampaign = () => {
    resetCampaign();
    navigate('/');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4" data-testid="campaign-over-page">
      <h1 className="text-2xl font-bold text-dd-danger">战役失败</h1>

      <div className="rounded-lg border border-dd-danger bg-dd-panel p-4 space-y-2">
        <p className="text-sm text-dd-text" data-testid="campaign-over-reason">
          失败原因：{campaign.campaignOverReason ?? '队伍无法继续冒险'}
        </p>
        <p className="text-xs text-dd-muted">
          完成任务：{campaign.completedQuestCount} 个 · 剩余 Gold：{campaign.gold} · 阵亡英雄：
          {campaign.deathRecords.length} 名 · 剩余 Waiting Token：
          {campaign.stagecoach.waitingTokens}
        </p>
      </div>

      {campaign.deathRecords.length > 0 && (
        <div className="rounded-lg border border-dd-border bg-dd-panel p-4">
          <h2 className="text-sm font-bold text-dd-text mb-2">阵亡名册</h2>
          <ul className="space-y-1" data-testid="death-records">
            {campaign.deathRecords.map((r) => (
              <li key={r.id} className="text-xs text-dd-muted">
                #{r.sequence} {r.heroName}（{r.heroClassId}）— 死因 {r.cause}
                {r.questId ? ` · 任务 ${r.questId}` : ''}
                {r.roomId ? ` · 房间 ${r.roomId}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-dd-border bg-dd-panel p-4 flex items-center justify-between">
        <p className="text-xs text-dd-muted">黑暗地牢吞噬了这支远征队……但新的冒险者仍会到来。</p>
        <button
          onClick={onNewCampaign}
          className="px-5 py-2 rounded bg-dd-accent text-white text-sm font-semibold hover:brightness-110 transition-all"
          data-testid="new-campaign"
        >
          开始新战役
        </button>
      </div>
    </div>
  );
}
