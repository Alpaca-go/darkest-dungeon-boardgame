import { useGameStore } from '../../store/useGameStore';
import { openOpportunities } from '../../game-engine/trinkets/trinket-opportunities';

/**
 * Phase 8C：饰品使用机会浮层（阻塞式，全局挂载）。
 * 读取存档中全部 open 的使用机会，逐条允许「使用 / 跳过」。
 * 战斗 before-attack-roll 窗口的机会会冻结动作，结清后由引擎恢复执行；
 * 非战斗窗口（hero-turn-start / room-entered）的机会同样在此结清。
 */
export default function TrinketUseOverlay() {
  const campaign = useGameStore((s) => s.campaign);
  const useOpp = useGameStore((s) => s.useTrinketOpportunity);
  const declineOpp = useGameStore((s) => s.declineTrinketOpportunity);

  if (!campaign) return null;
  const opps = openOpportunities(campaign);
  if (opps.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[58] flex items-center justify-center bg-black/75 p-4"
      data-testid="trinket-use-overlay"
    >
      <div className="w-full max-w-lg rounded-lg border-2 border-amber-500/70 bg-dd-panel p-5 shadow-2xl">
        <div className="text-lg font-bold text-dd-text mb-1">饰品使用机会</div>
        <p className="text-xs text-dd-muted mb-3">
          每张饰品可在对应窗口使用一次（每回合每张限一次）。请选择「使用」或「跳过」。
        </p>
        <div className="space-y-2 max-h-[60vh] overflow-auto">
          {opps.map((opp) => (
            <div
              key={opp.id}
              className="rounded border border-dd-border bg-dd-panel2 p-3"
              data-testid={`trinket-opp-${opp.id}`}
            >
              <div className="text-sm text-dd-text">{opp.preview}</div>
              <div className="text-[11px] text-dd-muted mt-1">窗口：{opp.useWindow}</div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => useOpp(opp.id)}
                  className="px-3 py-1 rounded bg-emerald-700 text-white text-sm font-semibold hover:brightness-110"
                  data-testid={`trinket-use-${opp.id}`}
                >
                  使用
                </button>
                <button
                  type="button"
                  onClick={() => declineOpp(opp.id)}
                  className="px-3 py-1 rounded bg-dd-panel2 border border-dd-border text-dd-muted text-sm hover:text-dd-text"
                  data-testid={`trinket-decline-${opp.id}`}
                >
                  跳过
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
