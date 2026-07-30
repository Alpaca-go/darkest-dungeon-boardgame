import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { canScout } from '../game-engine/dungeon';
import { getRoomMeta } from '../data/rooms';
import { getHeroById } from '../data/heroes';
import DungeonMap from '../components/dungeon/DungeonMap';
import TopResourceBar from '../components/dungeon/TopResourceBar';
import EventLog from '../components/dungeon/EventLog';
import HeroCard from '../components/hero/HeroCard';

export default function DungeonExplorePage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const scout = useGameStore((s) => s.scout);
  const moveToRoom = useGameStore((s) => s.moveToRoom);
  const leaveDungeon = useGameStore((s) => s.leaveDungeon);
  const [confirmLeave, setConfirmLeave] = useState(false);

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

  return (
    <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-dd-text">地牢探索</h1>
        <div className="flex items-center gap-2">
        <button
          onClick={onRequestLeave}
          className="px-3 py-1.5 rounded font-semibold text-sm bg-dd-panel2 text-dd-text border border-dd-border hover:bg-dd-panel transition-colors"
          title="离开地牢并进行任务结算（未完成目标视为任务未完成）"
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
        >
          Scout（侦察）
        </button>
        </div>
      </div>

      <TopResourceBar campaign={campaign} />

      <div className="grid lg:grid-cols-[240px_1fr_260px] gap-4">
        {/* 队伍面板 */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-dd-text">小队</h2>
          {campaign.heroes.map((h) => {
            const def = getHeroById(h.heroId);
            return (
              <HeroCard
                key={h.instanceId}
                name={h.name}
                color={def?.color ?? '#463b34'}
                life={h.maxLife}
                wounds={h.wounds}
                stress={h.stress}
                speed={h.speed}
                stance={h.stance}
              />
            );
          })}
        </div>

        {/* 地图 */}
        <div className="rounded-lg border border-dd-border bg-dd-panel p-3">
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
          <p className="text-[11px] text-dd-muted mt-auto">
            提示：Scout 会揭示相邻房间并增加全队压力；移动可能触发走廊探索事件。
          </p>
        </div>
      </div>

      <EventLog log={campaign.log} />

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
