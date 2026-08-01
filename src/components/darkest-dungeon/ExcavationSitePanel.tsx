import { useGameStore } from '../../store/useGameStore';
import { getExcavationProgress } from '../../game-engine/campaign/act-four/excavation-site';

/**
 * 只读展示：Excavation Site 进度（§11 / §12）。
 * 显示每个挖掘点的状态、Provision 骰点、剩余 Rest 点数。
 */
export default function ExcavationSitePanel() {
  const campaign = useGameStore((s) => s.campaign);
  const a4 = campaign?.actFourState;
  const sites = a4?.excavationSiteStates ?? [];
  if (!campaign || sites.length === 0) return null;

  const { cleared, total } = getExcavationProgress(a4!);

  return (
    <div className="rounded border border-dd-border bg-dd-panel2 p-2" data-testid="excavation-panel">
      <div className="text-dd-muted mb-1 text-xs">
        Excavation Sites（{cleared}/{total} 已清除）
      </div>
      <div className="space-y-1">
        {sites.map((s) => (
          <div key={s.roomId} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-dd-text">{s.roomId}</span>
            <span
              className={
                s.status === 'cleared'
                  ? 'text-green-400'
                  : s.status === 'resolving-rest'
                    ? 'text-amber-400'
                    : 'text-dd-muted'
              }
            >
              {s.status}
            </span>
            {Object.keys(s.provisionRolls ?? {}).length > 0 && (
              <span className="text-dd-muted">
                骰点：{Object.values(s.provisionRolls).join('/')}
              </span>
            )}
            {s.restSession && (
              <span className="text-dd-muted">免费 Rest 剩 {s.restSession.remainingPoints} 点</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
