import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import ColorBlockImage from '../components/placeholders/ColorBlockImage';

export default function BattlePage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const leaveBattle = useGameStore((s) => s.leaveBattle);

  if (!campaign) return <Navigate to="/" replace />;
  if (!campaign.battle) return <Navigate to="/dungeon" replace />;

  const battle = campaign.battle;
  const heroes = battle.units.filter((u) => u.side === 'hero');
  const monsters = battle.units.filter((u) => u.side === 'monster');

  const onLeave = () => {
    leaveBattle();
    navigate('/dungeon');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-dd-text mb-1">战斗</h1>
      <div className="rounded-lg border border-dd-accent bg-dd-accent/10 p-5 my-4 text-center">
        <p className="text-lg font-bold text-dd-accent2">战斗系统将在 Phase 3 实现</p>
        <p className="text-sm text-dd-muted mt-1">
          本阶段仅建立最小战斗状态（BattleState）并切换至此页面，不执行 Initiative、攻击、怪物行动与轮数推进。
        </p>
      </div>

      {/* 怪物 */}
      <section className="mb-4">
        <h2 className="text-sm font-bold text-dd-text mb-2">敌人</h2>
        <div className="flex flex-wrap gap-3">
          {monsters.map((m) => (
            <div key={m.id} className="rounded-md border border-dd-border bg-dd-panel p-2 w-36">
              <ColorBlockImage color="#8b2b2b" label={m.name.slice(0, 2)} className="w-full h-16 rounded" />
              <div className="text-xs text-dd-text mt-1 truncate">{m.name}</div>
              <div className="text-[11px] text-dd-muted">
                HP {Math.max(0, m.hp)}/{m.maxHp}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 英雄 */}
      <section className="mb-4">
        <h2 className="text-sm font-bold text-dd-text mb-2">我方</h2>
        <div className="flex flex-wrap gap-3">
          {heroes.map((h) => (
            <div key={h.id} className="rounded-md border border-dd-border bg-dd-panel p-2 w-36">
              <ColorBlockImage color="#5b8a5b" label={h.name.slice(0, 2)} className="w-full h-16 rounded" />
              <div className="text-xs text-dd-text mt-1 truncate">{h.name}</div>
              <div className="text-[11px] text-dd-muted">
                HP {Math.max(0, h.hp)}/{h.maxHp} · 压力 {h.stress ?? 0}
              </div>
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={onLeave}
        className="px-4 py-2 rounded bg-dd-panel2 text-dd-text border border-dd-border hover:bg-dd-panel transition-colors"
      >
        返回地牢（Phase 3 前临时出口）
      </button>
    </div>
  );
}
