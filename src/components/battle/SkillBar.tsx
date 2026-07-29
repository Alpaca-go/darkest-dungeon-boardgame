import type { BattleState, BattleUnit } from '../../types';
import { getSkillById } from '../../data/skills';
import { canHeroMove, normalizeHeroSkill } from '../../game-engine/battle';

interface SkillBarProps {
  battle: BattleState;
  actor: BattleUnit;
  selectedSkillId: string | null;
  onSelectSkill: (skillId: string | null) => void;
  onMove: (dir: -1 | 1) => void;
  onEndTurn: () => void;
}

/**
 * 行动栏：当前英雄的 3 个已装备技能 + 前移/后移 + 结束回合。
 * 站位不可用的技能禁用并标注；选中的技能高亮，等待选择目标。
 */
export default function SkillBar({
  battle,
  actor,
  selectedSkillId,
  onSelectSkill,
  onMove,
  onEndTurn,
}: SkillBarProps) {
  const skills = (actor.equippedSkillIds ?? [])
    .map((id) => getSkillById(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map(normalizeHeroSkill);

  return (
    <div className="rounded-lg border border-dd-border bg-dd-panel p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-sm font-bold text-dd-text">{actor.name} 的回合</span>
        <span className="text-xs text-dd-accent2">剩余行动点：{battle.currentActionPoints}</span>
        {selectedSkillId && (
          <span className="text-xs text-emerald-400">已选技能，点击绿框目标释放（再点技能可取消）</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {skills.map((s) => {
          const usable = (s.usableFromPositions ?? []).includes(actor.position);
          const selected = selectedSkillId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!usable || battle.currentActionPoints <= 0}
              onClick={() => onSelectSkill(selected ? null : s.id)}
              title={s.description}
              className={[
                'px-3 py-1.5 rounded border text-xs transition-colors',
                selected
                  ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
                  : usable && battle.currentActionPoints > 0
                    ? 'border-dd-border bg-dd-panel2 text-dd-text hover:border-dd-accent2'
                    : 'border-dd-border bg-dd-panel2/40 text-dd-muted/50 cursor-not-allowed',
              ].join(' ')}
              data-testid={`skill-${s.id}`}
            >
              <span className="font-semibold">{s.name}</span>
              <span className="ml-1 text-[10px] text-dd-muted">
                {s.targetSide === 'enemy'
                  ? `伤害 ${s.minDamage}-${s.maxDamage} / 命中≥${s.accuracy}`
                  : s.heal
                    ? `治疗 ${s.heal}`
                    : s.stressHeal
                      ? `减压 ${s.stressHeal}`
                      : '辅助'}
              </span>
              {!usable && <span className="ml-1 text-[10px] text-red-400">站位不符</span>}
            </button>
          );
        })}
        <span className="w-px bg-dd-border mx-1 self-stretch" />
        <button
          type="button"
          disabled={!canHeroMove(battle, actor.id, -1)}
          onClick={() => onMove(-1)}
          className="px-3 py-1.5 rounded border border-dd-border bg-dd-panel2 text-xs text-dd-text hover:border-dd-accent2 disabled:text-dd-muted/50 disabled:cursor-not-allowed disabled:hover:border-dd-border"
        >
          前移（位置 -1）
        </button>
        <button
          type="button"
          disabled={!canHeroMove(battle, actor.id, 1)}
          onClick={() => onMove(1)}
          className="px-3 py-1.5 rounded border border-dd-border bg-dd-panel2 text-xs text-dd-text hover:border-dd-accent2 disabled:text-dd-muted/50 disabled:cursor-not-allowed disabled:hover:border-dd-border"
        >
          后移（位置 +1）
        </button>
        <button
          type="button"
          onClick={onEndTurn}
          className="px-3 py-1.5 rounded border border-dd-accent bg-dd-accent/10 text-xs text-dd-accent2 hover:bg-dd-accent/20"
          data-testid="end-turn"
        >
          结束回合
        </button>
      </div>
    </div>
  );
}
