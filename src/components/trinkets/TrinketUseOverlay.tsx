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
  const chooseWild = useGameStore((s) => s.chooseDungeonProvisionWild);

  if (!campaign) return null;
  const opps = openOpportunities(campaign);
  const dungeonAction = campaign.pendingDungeonTrinketAction;
  const wildDice = dungeonAction?.pendingProvisionDice?.filter((die) => die.selectedFace === null) ?? [];
  if (opps.length === 0 && wildDice.length === 0) return null;
  const incoming = campaign.battle?.pendingMonsterAttack;
  const incomingMonster = incoming
    ? campaign.battle?.monsters.find((unit) => unit.id === incoming.monsterUnitId)
    : undefined;
  const incomingHero = incoming
    ? campaign.battle?.heroes.find((unit) => unit.id === incoming.targetHeroUnitId)
    : undefined;

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
        {dungeonAction && (
          <div className="mb-3 rounded border border-amber-800/70 bg-black/25 p-3 text-sm" data-testid="dungeon-trinket-context">
            <div className="text-dd-text">
              {dungeonAction.kind === 'scout' ? 'Scout 结算前' : 'Rest at Camp 结算前'}
            </div>
            <div className="text-dd-muted">原始动作已冻结；饰品机会结清后只执行一次。</div>
          </div>
        )}
        {incoming && incomingMonster && incomingHero && (
          <div className="mb-3 rounded border border-red-900/70 bg-black/25 p-3 text-sm" data-testid="incoming-attack-context">
            <div className="text-dd-text">{incomingMonster.name} 正在攻击 {incomingHero.name}</div>
            <div className="text-dd-muted">冻结骰点：{incoming.attackRoll}</div>
            {incoming.stage === 'hero-hit-window' && (
              <div className="text-red-300">攻击已命中；冻结基础伤害：{incoming.baseDamage}</div>
            )}
          </div>
        )}
        {wildDice.length > 0 ? (
          <div className="space-y-3" data-testid="provision-wild-choice">
            {wildDice.map((die) => (
              <div key={die.index} className="rounded border border-dd-border bg-dd-panel2 p-3">
                <div className="text-sm text-dd-text mb-2">补给骰 {die.index + 1} 掷出 Wild：选择一个补给面</div>
                <div className="flex flex-wrap gap-2">
                  {(['food', 'bandage', 'potion', 'torch', 'tool'] as const).map((face) => (
                    <button key={face} type="button" onClick={() => chooseWild(die.index, face)}
                      data-testid={`provision-wild-${die.index}-${face}`}
                      className="px-3 py-1 rounded bg-emerald-700 text-white text-sm font-semibold">
                      {face}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="space-y-2 max-h-[60vh] overflow-auto">
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
        </div>}
      </div>
    </div>
  );
}
