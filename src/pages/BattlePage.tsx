import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import { getHeroById } from '../data/heroes';
import { getMonsterById } from '../data/monsters';
import { getActiveUnit, getUnit, legalTargetsForActor } from '../game-engine/battle';
import type { BattleUnit } from '../types';
import InitiativeBar from '../components/battle/InitiativeBar';
import Battlefield from '../components/battle/Battlefield';
import SkillBar from '../components/battle/SkillBar';
import BattleLog from '../components/battle/BattleLog';
import ActorDetails from '../components/battle/ActorDetails';

/**
 * 战斗页面（Phase 3）：
 * 顶部先攻条 → 战场 → 行动栏（英雄回合）→ 详情 + 日志。
 * 胜利 / 失败时显示结算面板。
 */
export default function BattlePage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const battleSkillId = useGameStore((s) => s.ui.battleSkillId);
  const selectBattleSkill = useGameStore((s) => s.selectBattleSkill);
  const battleHeroMove = useGameStore((s) => s.battleHeroMove);
  const battleUseSkill = useGameStore((s) => s.battleUseSkill);
  const battleEndTurn = useGameStore((s) => s.battleEndTurn);
  const battleResolveVictory = useGameStore((s) => s.battleResolveVictory);
  const battleRetreat = useGameStore((s) => s.battleRetreat);
  const failQuestFromDefeat = useGameStore((s) => s.failQuestFromDefeat);

  const [inspectId, setInspectId] = useState<string | null>(null);

  const battle = campaign?.battle ?? null;

  // 当前英雄可选技能的合法目标（仅在已选技能时计算）。
  const legalTargetIds = useMemo(() => {
    if (!battle || battle.status !== 'active' || !battleSkillId) return [];
    return legalTargetsForActor(battle, battleSkillId);
  }, [battle, battleSkillId]);

  if (!campaign) return <Navigate to="/" replace />;
  if (!battle) return <Navigate to="/dungeon" replace />;

  const activeUnit = getActiveUnit(battle);
  const isHeroTurn = battle.status === 'active' && activeUnit?.side === 'hero';

  const colorOf = (u: BattleUnit): string => {
    if (u.side === 'monster') return getMonsterById(u.sourceId)?.color ?? '#8b2b2b';
    const inst = campaign.heroes.find((h) => h.instanceId === u.sourceId);
    return (inst && getHeroById(inst.heroId)?.color) ?? '#5b8a5b';
  };

  const onPickTarget = (unitId: string) => {
    if (battleSkillId && legalTargetIds.includes(unitId)) {
      battleUseSkill(unitId);
      return;
    }
    setInspectId(unitId);
  };

  const inspectUnit = getUnit(battle, inspectId) ?? activeUnit ?? null;

  const onVictoryReturn = () => {
    battleResolveVictory();
    navigate('/dungeon');
  };
  const onRetreat = () => {
    battleRetreat();
    navigate('/dungeon');
  };
  const allHeroesDown = !battle.heroes.some((h) => h.isAlive);
  const onQuestFail = () => {
    failQuestFromDefeat();
    navigate('/result');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dd-text">战斗</h1>
        {battle.status === 'active' && (
          <span className="text-xs text-dd-muted">击败所有敌人即可获胜；第 {battle.maxRounds} 轮结束仍未清除则被迫撤退。</span>
        )}
      </div>

      <InitiativeBar battle={battle} />

      <Battlefield
        battle={battle}
        colorOf={colorOf}
        legalTargetIds={legalTargetIds}
        onPickTarget={onPickTarget}
      />

      {/* 结算面板 */}
      {battle.status === 'victory' && (
        <div className="rounded-lg border border-emerald-500 bg-emerald-500/10 p-5 text-center" data-testid="victory-panel">
          <p className="text-lg font-bold text-emerald-400">战斗胜利！</p>
          <p className="text-sm text-dd-muted mt-1">获得 {battle.rewards.gold} Gold，房间将被标记为已清除。</p>
          <button
            onClick={onVictoryReturn}
            className="mt-3 px-4 py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-500 transition-colors"
          >
            领取奖励并返回地牢
          </button>
        </div>
      )}
      {battle.status === 'defeat' && (
        <div className="rounded-lg border border-red-500 bg-red-500/10 p-5 text-center" data-testid="defeat-panel">
          <p className="text-lg font-bold text-red-400">战斗失败……</p>
          {allHeroesDown ? (
            <>
              <p className="text-sm text-dd-muted mt-1">全员倒下，任务宣告失败。</p>
              <button
                onClick={onQuestFail}
                className="mt-3 px-4 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-500 transition-colors"
              >
                查看任务结算
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-dd-muted mt-1">小队被迫撤退，房间未被清除。</p>
              <div className="mt-3 flex justify-center gap-3">
                <button
                  onClick={onRetreat}
                  className="px-4 py-2 rounded bg-dd-panel2 text-dd-text text-sm border border-dd-border hover:bg-dd-panel transition-colors"
                >
                  撤退回地牢
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 英雄行动栏 */}
      {isHeroTurn && activeUnit && (
        <SkillBar
          battle={battle}
          actor={activeUnit}
          selectedSkillId={battleSkillId}
          onSelectSkill={selectBattleSkill}
          onMove={battleHeroMove}
          onEndTurn={battleEndTurn}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActorDetails unit={inspectUnit ?? null} />
        <BattleLog entries={battle.battleLog} />
      </div>
    </div>
  );
}
