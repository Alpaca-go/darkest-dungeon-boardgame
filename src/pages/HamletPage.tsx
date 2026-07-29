import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore, routeForPhase } from '../store/useGameStore';
import { HAMLET_BUILDINGS, getHamletBuildingById } from '../data/hamlet-buildings';
import { getHamletEventById } from '../data/hamlet-events';
import { buildingVisitError, canEndHamletDay } from '../game-engine/hamlet';
import { getHeroById } from '../data/heroes';
import HamletEventCard from '../components/hamlet/HamletEventCard';
import HamletBuildingCard from '../components/hamlet/HamletBuildingCard';
import HamletHeroCard from '../components/hamlet/HamletHeroCard';
import HamletLog from '../components/hamlet/HamletLog';

/**
 * Hamlet 页 /hamlet：
 * 顶部资源条 / 左侧英雄 / 中部建筑 / 右侧事件 + 日志 + 结束当天。
 * 交互：先选中英雄，再点击建筑访问；或对英雄点击「跳过今天行动」。
 */
export default function HamletPage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const visitBuilding = useGameStore((s) => s.visitBuilding);
  const skipHeroToday = useGameStore((s) => s.skipHeroToday);
  const endHamletDay = useGameStore((s) => s.endHamletDay);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);

  // preparationDays 归零后 gamePhase → quest-select，自动跳转下一任务选择。
  const gamePhase = campaign?.gamePhase;
  useEffect(() => {
    if (gamePhase === 'quest-select') navigate('/quests');
  }, [gamePhase, navigate]);

  if (!campaign) return <Navigate to="/" replace />;
  if (campaign.gamePhase !== 'hamlet') {
    return <Navigate to={routeForPhase(campaign.gamePhase)} replace />;
  }

  const hamlet = campaign.hamlet;
  const event = getHamletEventById(hamlet.currentEventId);
  const blockedBuilding = getHamletBuildingById(hamlet.caretakerBlockedBuildingId);
  const canEnd = canEndHamletDay(campaign);
  const selectedHero = campaign.heroes.find((h) => h.instanceId === selectedHeroId) ?? null;

  const onVisit = (buildingId: string) => {
    if (!selectedHeroId) return;
    visitBuilding(selectedHeroId, buildingId);
    setSelectedHeroId(null);
  };

  return (
    <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
      {/* 顶部状态条 */}
      <div className="rounded-lg border border-dd-border bg-dd-panel px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <h1 className="text-lg font-bold text-dd-text mr-2">村庄（Hamlet）</h1>
        <span className="text-dd-muted">
          Gold <span className="text-dd-warn font-bold">{campaign.gold}</span>
        </span>
        <span className="text-dd-muted">
          第 <span className="text-dd-text font-bold">{hamlet.currentDay}</span> 天
        </span>
        <span className="text-dd-muted">
          剩余准备天数 <span className="text-dd-text font-bold">{hamlet.preparationDays}</span>
        </span>
        <span className="text-dd-muted">
          Caretaker 阻塞：
          <span className="text-red-400 font-bold"> {blockedBuilding?.name ?? '无'}</span>
        </span>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr_280px] gap-4">
        {/* 左：英雄 */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-dd-text">
            小队{selectedHero ? ` · 已选中 ${selectedHero.name}` : ''}
          </h2>
          {campaign.heroes.map((h) => (
            <HamletHeroCard
              key={h.instanceId}
              hero={h}
              color={getHeroById(h.heroId)?.color ?? '#463b34'}
              selected={h.instanceId === selectedHeroId}
              onSelect={() =>
                setSelectedHeroId(h.instanceId === selectedHeroId ? null : h.instanceId)
              }
              onSkip={() => {
                skipHeroToday(h.instanceId);
                if (selectedHeroId === h.instanceId) setSelectedHeroId(null);
              }}
            />
          ))}
        </div>

        {/* 中：建筑 */}
        <div>
          <h2 className="text-sm font-bold text-dd-text mb-2">
            建筑{selectedHero ? '（点击访问）' : '（先在左侧选中一名英雄）'}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {HAMLET_BUILDINGS.map((b) => {
              const reason = selectedHeroId
                ? buildingVisitError(campaign, selectedHeroId, b.id)
                : '请先选择英雄';
              return (
                <HamletBuildingCard
                  key={b.id}
                  building={b}
                  blocked={hamlet.caretakerBlockedBuildingId === b.id}
                  occupied={hamlet.occupiedBuildingIds.includes(b.id)}
                  disabledReason={reason}
                  onVisit={() => onVisit(b.id)}
                />
              );
            })}
          </div>
          {selectedHeroId && (
            <p className="text-[11px] text-dd-muted mt-2">
              灰色建筑不可访问（悬停查看原因）。
            </p>
          )}
        </div>

        {/* 右：事件 + 日志 + 结束当天 */}
        <div className="flex flex-col gap-3">
          <HamletEventCard event={event} preparationDays={hamlet.preparationDays} />
          <HamletLog log={hamlet.log ?? []} />
          <button
            onClick={endHamletDay}
            disabled={!canEnd}
            className={[
              'px-4 py-2.5 rounded font-semibold text-sm transition-colors',
              canEnd
                ? 'bg-dd-accent text-white hover:brightness-110'
                : 'bg-dd-panel2 text-dd-muted cursor-not-allowed',
            ].join(' ')}
            title={canEnd ? '进入下一天' : '所有存活英雄行动（或跳过）后才能结束当天'}
            data-testid="end-day"
          >
            结束当天
          </button>
        </div>
      </div>
    </div>
  );
}
