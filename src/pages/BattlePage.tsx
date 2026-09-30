import { areaDistance } from '../game-engine/bosses/foundation';
import { ruinsRoom, ruinsTile } from '../game-engine/ruins/source-registry';
import { ruinsAreaDistance } from '../game-engine/ruins/monster-runtime';
import { canMoveRuinsUnit } from '../game-engine/ruins/movement-runtime';
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
import BossChoicePanel from '../components/battle/BossChoicePanel';
import ActorDetails from '../components/battle/ActorDetails';
import TrinketSlots from '../components/trinkets/TrinketSlots';

/**
 * 战斗页面（Phase 3）：
 * 顶部先攻条 → 战场 → 行动栏（英雄回合）→ 详情 + 日志。
 * 胜利 / 失败时显示结算面板。
 */
export default function BattlePage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const battleHeroAreaMove = useGameStore(s=>s.battleHeroAreaMove);
  const battleOrdinaryChoice = useGameStore(s => s.battleOrdinaryChoice);
  const battleRoomInteract = useGameStore(s => s.battleRoomInteract);
  const commitBossChoice = useGameStore((s) => s.commitBossChoice);
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
  const isHeroTurn = battle.status === 'active' && activeUnit?.side === 'hero'
    && !battle.ruinsContext?.pendingChoice && !battle.ruinsContext?.pendingReanimationChoice;
  const ordinaryChoice = battle.ruinsContext?.pendingReanimationChoice ?? battle.ruinsContext?.pendingChoice;

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
  const inspectHero = inspectUnit?.side === 'hero'
    ? campaign.heroes.find((hero) => hero.instanceId === inspectUnit.sourceId)
    : undefined;

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
      {ordinaryChoice && <section className="rounded border border-dd-accent p-4" aria-label="Ruins 待决选择">
        <p>{battle.ruinsContext?.pendingReanimationChoice ? '选择复生的死亡实例' : '选择移动结果'}</p>
        <div className="flex flex-wrap gap-2 mt-2">{ordinaryChoice.candidateIds.map(id => <button key={id}
          className="px-3 py-2 rounded bg-dd-panel2 border border-dd-border"
          onClick={() => battleOrdinaryChoice(ordinaryChoice.choiceId, id)}>
          {battle.ruinsContext?.retiredMonsterInstances?.find(d => d.unit.id === id)?.unit.name ?? id}
        </button>)}</div>
      </section>}
      {battle.bossEncounter?.pendingChoice && <BossChoicePanel key={battle.bossEncounter.pendingChoice.choiceId}
        choice={battle.bossEncounter.pendingChoice} onConfirm={commitBossChoice}
        candidateLabel={id => [...battle.heroes, ...battle.monsters].find(u => u.id === id)?.name ?? id} />}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dd-text">战斗</h1>
        {battle.status === 'active' && (
          <span className="text-xs text-dd-muted">{battle.roundLimitPolicy === 'not-counted' ? '击败 Boss 即可获胜。' : `击败所有敌人即可获胜；第 ${battle.maxRounds} 轮结束仍未清除则被迫撤退。`}</span>
        )}
      </div>

      <InitiativeBar battle={battle} />
      {battle.ruinsContext && <section aria-label="Ruins 房间区域" className="rounded border border-dd-border p-3">
        <p>Ruins Room {battle.ruinsContext.roomNumber}</p>
        <div className="grid grid-cols-2 gap-2 mt-2">{ruinsTile(battle.ruinsContext.tileId).areas.map(area => {
          const context = battle.ruinsContext!;
          const occupants = [...battle.heroes, ...battle.monsters].filter(u => u.isAlive && context.placements[u.id] === area.id);
          const movable = isHeroTurn && !battle.pendingAction && !battle.pendingMonsterAttack && battle.currentActionPoints > 0
            && context.placements[activeUnit!.id] !== area.id
            && ruinsAreaDistance(ruinsTile(context.tileId), context.placements[activeUnit!.id], area.id) <= activeUnit!.speed
            && canMoveRuinsUnit(battle, activeUnit!.id, activeUnit!.id, area.id);
          return <div key={area.id} className="border border-dd-border p-2 text-sm">
            <p>{area.id} · 容量 {area.capacity}</p><p>{occupants.map(u => u.name).join('、') || '空'}</p>
            {movable && <button onClick={() => battleHeroAreaMove(area.id)}>移动到 {area.id}</button>}
          </div>;
        })}</div>
        {isHeroTurn && !battle.pendingAction && !battle.pendingMonsterAttack && ruinsRoom(battle.ruinsContext.roomNumber).rules
          .filter(rule => rule.trigger === 'INTERACT' && rule.areas.includes(battle.ruinsContext!.placements[activeUnit!.id])
            && battle.currentActionPoints >= rule.actionCost && (!rule.oncePerBattle || !battle.ruinsContext!.roomUses.includes(rule.id))
            && (!rule.requiresNoMonsters || !battle.monsters.some(u => u.isAlive)))
          .map(rule => <button key={rule.id} onClick={() => battleRoomInteract(rule.id)}>房间互动 · {rule.id}</button>)}
      </section>}
      {battle.bossEncounter && isHeroTurn && !battle.pendingMonsterAttack && !battle.bossEncounter.pendingChoice && <div className="flex gap-2" data-testid="boss-area-movement">
        {battle.bossEncounter.definition.areas.filter(a=>a.id!==battle.bossEncounter!.placements[activeUnit!.id]
          && areaDistance(battle.bossEncounter!.definition,battle.bossEncounter!.placements[activeUnit!.id],a.id)<=activeUnit!.speed
          && a.capacity > [...battle.heroes,...battle.monsters].filter(u=>u.isAlive && battle.bossEncounter!.placements[u.id]===a.id)
            .reduce((n,u)=>n+(battle.bossEncounter!.spawnDefinitions[u.sourceId]?.occupiedSlots ?? 1),0))
          .map(a=><button key={a.id} disabled={battle.currentActionPoints<=0} data-testid="boss-move-area" data-area-id={a.id}
            onClick={()=>battleHeroAreaMove(a.id)}>移动到 {a.id}</button>)}
      </div>}

      {battle.pendingAction ? (
        <div
          className="rounded border border-dd-accent bg-dd-accent/10 p-3 text-sm text-dd-text"
          data-testid={battle.pendingAction.stage === 'post-roll-window' ? 'post-roll-trinket-window' : 'pre-damage-trinket-window'}
        >
          {battle.pendingAction.stage === 'post-roll-window' ? (
            <>攻击掷骰结果：<strong>{battle.pendingAction.attackRoll}</strong>。命中/暴击尚未结算，可声明饰品。</>
          ) : (
            <>攻击已命中，冻结伤害：<strong>{battle.pendingAction.baseDamage}</strong>。伤害尚未应用，可声明饰品。</>
          )}
        </div>
      ) : null}

      {campaign.pendingHealingAction ? (
        <div className="rounded border border-emerald-500 bg-emerald-500/10 p-3 text-sm text-dd-text" data-testid="healing-trinket-window">
          治疗尚未结算：当前等待{campaign.pendingHealingAction.stage === 'healer-window' ? '治疗者' : '受治疗者'}声明饰品。
        </div>
      ) : null}

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
        <div className="space-y-2">
          <ActorDetails unit={inspectUnit ?? null} />
          {inspectHero && <TrinketSlots hero={inspectHero} />}
        </div>
        <BattleLog entries={battle.battleLog} />
      </div>
    </div>
  );
}
