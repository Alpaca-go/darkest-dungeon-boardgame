import BossChoicePanel from '../components/battle/BossChoicePanel';
import { hasProductionOrdinaryThreat } from '../game-engine/ruins/production-threat-runtime';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { canScout } from '../game-engine/dungeon';
import { getRoomMeta } from '../data/rooms';
import {legacyHeroColor} from '../game-engine/heroes/legacy-player';
import ProductionHeroCard from '../components/hero/ProductionHeroCard';
import { getCurioById } from '../data/curios';
import DiseaseBadge from '../components/disease/DiseaseBadge';
import DungeonMap from '../components/dungeon/DungeonMap';
import TopResourceBar from '../components/dungeon/TopResourceBar';
import EventLog from '../components/dungeon/EventLog';
import HeroCard from '../components/hero/HeroCard';
import TrinketSlots from '../components/trinkets/TrinketSlots';
import { validateRestAllocation } from '../game-engine/quests/quest-runtime';
import type { RestAllocation, RestRecoveryResource } from '../game-engine/quests/quest-runtime';

export default function DungeonExplorePage() {
  const navigate = useNavigate();
  const commitBossChoice=useGameStore(s=>s.commitBossChoice);
  const campaign = useGameStore((s) => s.campaign);
  const scout = useGameStore((s) => s.scout);
  const moveToRoom = useGameStore((s) => s.moveToRoom);
  const leaveDungeon = useGameStore((s) => s.leaveDungeon);
  const interactWithCurio = useGameStore((s) => s.interactWithCurio);
  const commitRestAtCamp = useGameStore((s) => s.commitRestAtCamp);
  const interactWithQuestToken = useGameStore((s) => s.interactWithQuestToken);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [restAllocationOpen, setRestAllocationOpen] = useState(false);
  const [restDraft, setRestDraft] = useState<Record<string, { life: number; stress: number }>>({});
  const [restError, setRestError] = useState<string | null>(null);

  const gamePhase = campaign?.gamePhase;
  useEffect(() => {
    if (gamePhase === 'battle') navigate('/battle');
    if (gamePhase === 'quest-result') navigate('/result');
  }, [gamePhase, navigate]);

  const objectiveDone = campaign?.dungeon?.objectiveComplete;
  const onRequestLeave = () => setConfirmLeave(true);
  const onConfirmLeave = () => {
    setConfirmLeave(false);
    leaveDungeon();
  };
  const onCancelLeave = () => setConfirmLeave(false);

  if (!campaign) return <Navigate to="/" replace />;
  if (!campaign.dungeon) return <Navigate to="/quests" replace />;

  const dungeon = campaign.dungeon;
  const current = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId);
  const meta = current ? getRoomMeta(current.type) : undefined;
  const scoutable = canScout(dungeon);
  const curio = getCurioById(current?.curioId);
  const currentQuestToken = campaign.questRuntimeState?.questTokens?.find((token) => token.roomId === current?.id);
  const questTokens = campaign.questRuntimeState?.questTokens ?? [];
  const questTokenProgress = questTokens.filter((token) => token.status === 'consumed').length;
  const restBudget = campaign.questRuntimeState?.restingPointsRemaining ?? 0;
  const restSpent = Object.values(restDraft).reduce((sum, entry) => sum + entry.life + entry.stress, 0);
  const restRemaining = restBudget - restSpent;
  const restAllocation: RestAllocation = {
    allocations: Object.entries(restDraft).flatMap(([heroId, entry]) => ([
      ...(entry.life > 0 ? [{ heroId, resource: 'life' as const, points: entry.life }] : []),
      ...(entry.stress > 0 ? [{ heroId, resource: 'stress' as const, points: entry.stress }] : []),
    ])),
  };
  const restValidation = validateRestAllocation(campaign, restAllocation);
  const openRestAllocation = () => {
    setRestDraft({});
    setRestError(null);
    setRestAllocationOpen(true);
  };
  const closeRestAllocation = () => {
    setRestDraft({});
    setRestError(null);
    setRestAllocationOpen(false);
  };
  const changeRestPoint = (heroId: string, resource: RestRecoveryResource, delta: -1 | 1) => {
    const hero = campaign.heroes.find((entry) => entry.instanceId === heroId);
    if (!hero || hero.dead || !hero.isAlive) return;
    const currentDraft = restDraft[heroId] ?? { life: 0, stress: 0 };
    const recoverable = resource === 'life' ? hero.wounds : hero.stress;
    const next = currentDraft[resource] + delta;
    if (next < 0 || next > recoverable || (delta > 0 && restRemaining <= 0)) return;
    setRestDraft({ ...restDraft, [heroId]: { ...currentDraft, [resource]: next } });
    setRestError(null);
  };
  const confirmRestAllocation = () => {
    const error = commitRestAtCamp(restAllocation);
    if (error) {
      setRestError(error);
      return;
    }
    closeRestAllocation();
  };

  return (
    <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
      {campaign.bossEncounterCheckpoint?.pendingChoice && <BossChoicePanel choice={campaign.bossEncounterCheckpoint.pendingChoice} onConfirm={commitBossChoice} />}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-dd-text">地牢探索</h1>
        <div className="flex items-center gap-2">
        <button
          onClick={onRequestLeave}
          disabled={!!campaign.bossRoomStorage && campaign.bossRoomStorage.lifecycle !== 'RETURNED'}
          className="px-3 py-1.5 rounded font-semibold text-sm bg-dd-panel2 text-dd-text border border-dd-border hover:bg-dd-panel transition-colors"
          title={campaign.bossRoomStorage && campaign.bossRoomStorage.lifecycle !== 'RETURNED'
            ? 'Face the Threat：击败 Boss 后才能离开地牢。'
            : '离开地牢并进行任务结算（未完成目标视为任务未完成）'}
          data-testid="leave-dungeon"
        >
          离开地牢
        </button>
        <button
          onClick={scout}
          disabled={!scoutable}
          className={[
            'px-3 py-1.5 rounded font-semibold text-sm transition-colors',
            scoutable
              ? 'bg-dd-warn text-black hover:brightness-110'
              : 'bg-dd-panel2 text-dd-muted cursor-not-allowed',
          ].join(' ')}
          title="侦察相邻房间（全队压力 +1）"
          data-testid="scout-dungeon"
        >
          Scout（侦察）
        </button>
        </div>
      </div>

      <TopResourceBar campaign={campaign} />

      {campaign.questRuntimeState ? (
        <div className="rounded border border-dd-border bg-dd-panel/60 p-3 flex items-center justify-between" data-testid="quest-rest-runtime">
          <span className="text-sm text-dd-text">
            Firewood: <strong>{campaign.questRuntimeState.firewoodTokensRemaining ?? 0}</strong>
            {' · '}Resting Points: <strong>{campaign.questRuntimeState.restingPointsRemaining ?? 0}</strong>
          </span>
          <button
            type="button"
            data-testid="rest-at-camp"
            onClick={openRestAllocation}
            disabled={current?.status !== 'cleared'
              || (campaign.questRuntimeState.firewoodTokensRemaining ?? 0) <= 0
              || restBudget <= 0}
            className="px-3 py-1.5 rounded border border-dd-border bg-dd-panel2 text-sm text-dd-text disabled:opacity-40"
          >
            Rest at Camp
          </button>
        </div>
      ) : null}

      <div className="grid lg:grid-cols-[240px_1fr_260px] gap-4">
        {/* 队伍面板 */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-dd-text">小队</h2>
          {campaign.heroes.map((h) => {
            if(h.productionIdentity)return <ProductionHeroCard key={h.instanceId} hero={h}/>;
            const color=legacyHeroColor(h.heroId);
            return (
              <HeroCard
                key={h.instanceId}
                name={h.name}
                color={color ?? '#463b34'}
                life={h.maxLife}
                wounds={h.wounds}
                stress={h.stress}
                speed={h.speed}
                stance={h.stance}
                footer={
                  <>
                    {(h.disease || h.pendingBleed > 0 || h.pendingBlight > 0) && (
                      <div className="flex flex-wrap items-center gap-1">
                        <DiseaseBadge disease={h.disease} />
                        {h.pendingBleed > 0 && (
                          <span className="px-1 rounded text-[10px] leading-4 bg-red-950/70 text-red-300">
                            流血 {h.pendingBleed}
                          </span>
                        )}
                        {h.pendingBlight > 0 && (
                          <span className="px-1 rounded text-[10px] leading-4 bg-emerald-950/70 text-emerald-300">
                            腐蚀 {h.pendingBlight}
                          </span>
                        )}
                      </div>
                    )}
                    <TrinketSlots hero={h} mode="manage" />
                  </>
                }
              />
            );
          })}
        </div>

        {/* 地图 */}
        <div className="rounded-lg border border-dd-border bg-dd-panel p-3">
          {campaign.bossEncounterCheckpoint?.checkpointContext?.heroDodgeBindings && !hasProductionOrdinaryThreat(campaign)
            && <p role="status" data-testid="necromancer-threat-bridge-blocked" className="mb-3 text-dd-warn">请在初始化前选择 Ruins v6 后进入守卫房间。</p>}
          <DungeonMap dungeon={dungeon} onRoomClick={moveToRoom} />
          <p className="text-[11px] text-dd-muted mt-2">
            点击与当前房间相邻的节点移动；隐藏房间也可进入。当前房间：
            <span className="text-dd-text"> {meta?.label ?? current?.type}</span>
          </p>
        </div>

        {/* 当前房间面板 */}
        <div className="rounded-lg border border-dd-border bg-dd-panel p-3 flex flex-col gap-2">
          <h2 className="text-sm font-bold text-dd-text">当前房间</h2>
          {current && meta && (
            <div
              className="rounded-md p-3 border-l-4"
              style={{ borderLeftColor: meta.color, background: '#2f2723' }}
            >
              <div className="font-bold text-dd-text">{meta.label}</div>
              <div className="text-[11px] text-dd-muted mt-1">{meta.description}</div>
              <div className="text-[11px] text-dd-warn mt-1">
                状态：{current.status} · 已清除 {dungeon.roomsCleared}
              </div>
              {dungeon.objectiveComplete && (
                <div className="text-[11px] text-dd-positive mt-1">✓ 任务目标已完成</div>
              )}
            </div>
          )}

          {questTokens.length > 0 && (
            <div className="rounded-md border border-dd-warn/60 bg-amber-950/20 p-2.5" data-testid="quest-token-progress">
              <div className="text-sm font-bold text-dd-warn">Quest Objective</div>
              <div className="text-[11px] text-dd-muted mt-0.5">
                {questTokenProgress} / {questTokens.length} interactions complete
              </div>
              {currentQuestToken ? (
                currentQuestToken.status === 'consumed' ? (
                  <div className="text-[11px] text-dd-positive mt-1" data-testid="quest-token-consumed">Interaction complete.</div>
                ) : (
                  <button
                    type="button"
                    data-testid="interact-quest-token"
                    disabled={current?.status !== 'cleared'}
                    onClick={() => interactWithQuestToken()}
                    className="mt-2 px-3 py-1.5 rounded bg-dd-warn text-black text-xs font-semibold disabled:opacity-40"
                  >
                    {currentQuestToken.type === 'tainted-trinket-objective' ? 'Cleanse Tainted Trinket' : 'Loot Family Trinket Chest'}
                  </button>
                )
              ) : null}
            </div>
          )}

          {/* Phase 8B：房间内的 Curio（选择一名英雄搜查，结果全部由引擎产生） */}
          {curio && (
            <div
              className="rounded-md border border-lime-800/60 bg-lime-950/30 p-2.5"
              data-testid="curio-panel"
            >
              <div className="text-sm font-bold text-lime-300">⚱ {curio.name}</div>
              <div className="text-[11px] text-dd-muted mt-0.5">{curio.description}</div>
              {current?.curioUsed ? (
                <div className="text-[11px] text-dd-muted mt-1.5" data-testid="curio-used">
                  已搜查过。
                </div>
              ) : (
                <div className="mt-1.5">
                  <div className="text-[11px] text-dd-muted mb-1">选择搜查的英雄：</div>
                  <div className="flex flex-wrap gap-1">
                    {campaign.heroes
                      .filter((h) => !h.dead && h.isAlive)
                      .map((h) => (
                        <button
                          key={h.instanceId}
                          type="button"
                          onClick={() => interactWithCurio(h.instanceId)}
                          className="px-2 py-1 rounded border border-dd-border bg-dd-panel2 text-[11px] text-dd-text hover:border-lime-400 transition-colors"
                          data-testid={`curio-search-${h.instanceId}`}
                        >
                          {h.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-dd-muted mt-auto">
            提示：Scout 会揭示相邻房间并增加全队压力；移动可能触发走廊探索事件。
          </p>
        </div>
      </div>

      <EventLog log={campaign.log} />

      {restAllocationOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rest-allocation-title"
          data-testid="rest-allocation-modal"
        >
          <div className="rounded-lg border border-dd-border bg-dd-panel p-5 w-[620px] max-w-[94vw] max-h-[90vh] overflow-y-auto flex flex-col gap-4">
            <div>
              <h3 id="rest-allocation-title" className="text-base font-bold text-dd-text">Allocate Resting Points</h3>
              <p className="text-xs text-dd-muted mt-1">
                Choose how the party spends its Resting Points. Each point recovers 1 Life or 1 Stress.
                You may use fewer points, including zero. Confirming consumes one Firewood; unused points expire.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded bg-dd-panel2 p-2">Firewood: <strong data-testid="rest-firewood">{campaign.questRuntimeState?.firewoodTokensRemaining ?? 0}</strong></div>
              <div className="rounded bg-dd-panel2 p-2">Used: <strong data-testid="rest-points-used">{restSpent}</strong></div>
              <div className="rounded bg-dd-panel2 p-2">Remaining: <strong data-testid="rest-points-remaining">{restRemaining}</strong></div>
            </div>
            <div className="flex flex-col gap-2">
              {campaign.heroes.map((hero) => {
                const chosen = restDraft[hero.instanceId] ?? { life: 0, stress: 0 };
                const unavailable = hero.dead || !hero.isAlive;
                return (
                  <div key={hero.instanceId} className="rounded border border-dd-border bg-dd-panel2 p-3" data-testid={`rest-hero-${hero.instanceId}`}>
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm text-dd-text">{hero.name}</strong>
                      <span className="text-xs text-dd-muted">Life {Math.max(0, hero.maxLife - hero.wounds)}/{hero.maxLife} · Wounds {hero.wounds} · Stress {hero.stress}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {(['life', 'stress'] as const).map((resource) => {
                        const maximum = resource === 'life' ? hero.wounds : hero.stress;
                        return (
                          <div key={resource} className="flex items-center justify-between rounded bg-dd-panel px-2 py-1.5">
                            <span className="text-xs text-dd-text">Recover {resource === 'life' ? 'Life' : 'Stress'}</span>
                            <div className="flex items-center gap-2">
                              <button type="button" data-testid={`rest-${hero.instanceId}-${resource}-minus`} onClick={() => changeRestPoint(hero.instanceId, resource, -1)} disabled={unavailable || chosen[resource] <= 0} className="w-7 h-7 rounded border border-dd-border disabled:opacity-30">−</button>
                              <span className="w-5 text-center text-sm" data-testid={`rest-${hero.instanceId}-${resource}-points`}>{chosen[resource]}</span>
                              <button type="button" data-testid={`rest-${hero.instanceId}-${resource}-plus`} onClick={() => changeRestPoint(hero.instanceId, resource, 1)} disabled={unavailable || restRemaining <= 0 || chosen[resource] >= maximum} className="w-7 h-7 rounded border border-dd-border disabled:opacity-30">+</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {restError && (
              <p className="text-xs text-red-300" role="alert" data-testid="rest-allocation-error">
                {restError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeRestAllocation} data-testid="rest-allocation-cancel" className="px-3 py-1.5 rounded border border-dd-border bg-dd-panel2 text-sm text-dd-text">Cancel</button>
              <button type="button" onClick={confirmRestAllocation} disabled={!restValidation.ok} data-testid="rest-allocation-confirm" className="px-3 py-1.5 rounded bg-dd-warn text-black font-semibold text-sm disabled:opacity-40">Confirm Rest</button>
            </div>
          </div>
        </div>
      )}

      {confirmLeave && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          data-testid="leave-dungeon-confirm"
        >
          <div className="rounded-lg border border-dd-border bg-dd-panel p-5 w-[340px] max-w-[90vw] flex flex-col gap-4">
            <h3 className="text-base font-bold text-dd-text">离开地牢</h3>
            <p className="text-sm text-dd-muted">
              {objectiveDone
                ? '任务目标已完成。确定离开地牢并进行任务结算吗？'
                : '任务目标尚未完成，现在离开将视为任务未完成。确定离开吗？'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={onCancelLeave}
                className="px-3 py-1.5 rounded font-semibold text-sm bg-dd-panel2 text-dd-text border border-dd-border hover:bg-dd-panel transition-colors"
                data-testid="leave-dungeon-cancel"
              >
                取消
              </button>
              <button
                onClick={onConfirmLeave}
                className="px-3 py-1.5 rounded font-semibold text-sm bg-dd-warn text-black hover:brightness-110 transition-colors"
                data-testid="leave-dungeon-confirm-ok"
              >
                确认离开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
