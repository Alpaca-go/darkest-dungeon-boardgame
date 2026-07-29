import type { BattleState, BattleUnit } from '../../types';
import ActorSlot from './ActorSlot';

interface BattlefieldProps {
  battle: BattleState;
  colorOf: (unit: BattleUnit) => string;
  legalTargetIds: string[];
  onPickTarget: (unitId: string) => void;
}

/** 空位占位框。 */
function EmptySlot({ pos }: { pos: number }) {
  return (
    <div className="w-[104px] min-h-[120px] rounded-md border border-dashed border-dd-border/60 flex items-center justify-center text-[10px] text-dd-muted/60">
      位置 {pos}
    </div>
  );
}

/**
 * 战场：经典 DD 横排对峙。
 * 左侧英雄按位置 4→3→2→1 排列，右侧怪物按 1→2→3→4 排列，
 * 双方的位置 1（前排）在中线两侧相邻。
 */
export default function Battlefield({ battle, colorOf, legalTargetIds, onPickTarget }: BattlefieldProps) {
  const renderSide = (units: BattleUnit[], order: number[]) =>
    order.map((pos) => {
      const u = units.find((x) => x.position === pos);
      if (!u) return <EmptySlot key={pos} pos={pos} />;
      return (
        <ActorSlot
          key={u.id}
          unit={u}
          color={colorOf(u)}
          isActive={battle.activeActorId === u.id}
          isLegalTarget={legalTargetIds.includes(u.id)}
          isSelected={battle.selectedTargetId === u.id}
          onClick={() => onPickTarget(u.id)}
        />
      );
    });

  return (
    <div className="rounded-lg border border-dd-border bg-dd-panel2/40 p-4 overflow-x-auto">
      <div className="flex items-stretch gap-2 justify-center min-w-max">
        <div className="flex gap-2" data-testid="hero-side">
          {renderSide(battle.heroes, [4, 3, 2, 1])}
        </div>
        <div className="w-px bg-dd-accent/50 mx-2 self-stretch" />
        <div className="flex gap-2" data-testid="monster-side">
          {renderSide(battle.monsters, [1, 2, 3, 4])}
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-dd-muted mt-2 px-1">
        <span>我方（右侧为前排 1）</span>
        <span>敌方（左侧为前排 1）</span>
      </div>
    </div>
  );
}
