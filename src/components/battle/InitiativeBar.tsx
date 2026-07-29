import type { BattleState } from '../../types';
import { getUnit } from '../../game-engine/battle';

interface InitiativeBarProps {
  battle: BattleState;
}

/**
 * 顶部先攻条：显示当前轮数 / 最大轮数，以及本轮行动顺序。
 * 当前行动者金色高亮，已行动者暗化，死亡者划线。
 */
export default function InitiativeBar({ battle }: InitiativeBarProps) {
  return (
    <div className="rounded-lg border border-dd-border bg-dd-panel p-3 flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-dd-accent2 mr-2">
        第 {Math.min(battle.round, battle.maxRounds)} / {battle.maxRounds} 轮
      </span>
      <span className="text-xs text-dd-muted mr-1">行动顺序：</span>
      {battle.initiativeOrder.map((id, i) => {
        const u = getUnit(battle, id);
        if (!u) return null;
        const isCurrent = battle.activeActorId === id;
        const acted = i < battle.initiativeIndex;
        return (
          <span
            key={id}
            className={[
              'px-2 py-0.5 rounded text-[11px] border',
              isCurrent
                ? 'border-amber-400 bg-amber-400/15 text-amber-300 font-bold'
                : u.isAlive
                  ? acted
                    ? 'border-dd-border text-dd-muted/60 bg-dd-panel2/50'
                    : 'border-dd-border text-dd-text bg-dd-panel2'
                  : 'border-dd-border text-dd-muted/40 line-through',
              u.side === 'monster' ? 'italic' : '',
            ].join(' ')}
          >
            {u.name}
          </span>
        );
      })}
    </div>
  );
}
