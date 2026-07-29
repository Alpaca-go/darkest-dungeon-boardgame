import type { BattleUnit } from '../../types';
import ColorBlockImage from '../placeholders/ColorBlockImage';

interface ActorSlotProps {
  unit: BattleUnit;
  color: string;
  isActive: boolean;
  isLegalTarget: boolean;
  isSelected: boolean;
  onClick?: () => void;
}

/** 状态效果小标签。 */
function EffectTags({ unit }: { unit: BattleUnit }) {
  const tags: { label: string; cls: string }[] = [];
  if (unit.bleed > 0) tags.push({ label: `流血${unit.bleed}`, cls: 'bg-red-900/70 text-red-200' });
  if (unit.blight > 0) tags.push({ label: `腐蚀${unit.blight}`, cls: 'bg-lime-900/70 text-lime-200' });
  if (unit.stunned > 0) tags.push({ label: '眩晕', cls: 'bg-yellow-900/70 text-yellow-200' });
  if (unit.marked) tags.push({ label: '标记', cls: 'bg-purple-900/70 text-purple-200' });
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-0.5 mt-0.5">
      {tags.map((t) => (
        <span key={t.label} className={`px-1 rounded text-[10px] leading-4 ${t.cls}`}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

/**
 * 战场上的单位卡：色块立绘 + 名称 + HP 条 + 压力 + 状态效果。
 * 高亮规则：金框=当前行动者；绿框可点=合法目标；红框=已选中目标；灰暗=死亡。
 */
export default function ActorSlot({
  unit,
  color,
  isActive,
  isLegalTarget,
  isSelected,
  onClick,
}: ActorSlotProps) {
  const hpPct = unit.maxHp > 0 ? Math.max(0, Math.round((unit.hp / unit.maxHp) * 100)) : 0;
  const dead = !unit.isAlive;

  const frame = dead
    ? 'border-dd-border opacity-40 grayscale'
    : isSelected
      ? 'border-red-400 ring-2 ring-red-400/60'
      : isActive
        ? 'border-amber-400 ring-2 ring-amber-400/60'
        : isLegalTarget
          ? 'border-emerald-400 ring-2 ring-emerald-400/50 cursor-pointer hover:ring-emerald-300'
          : 'border-dd-border';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-[104px] rounded-md border bg-dd-panel p-1.5 text-left transition-all cursor-pointer ${frame}`}
      data-testid={`actor-${unit.id}`}
    >
      <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-dd-panel2 border border-dd-border text-[10px] text-dd-muted flex items-center justify-center">
        {unit.position}
      </span>
      <ColorBlockImage color={color} label={dead ? '倒下' : unit.name.slice(0, 2)} className="w-full h-14 rounded" />
      <div className="text-[11px] text-dd-text mt-1 truncate">{unit.name}</div>
      <div className="h-1.5 rounded bg-dd-panel2 mt-1 overflow-hidden">
        <div
          className={`h-full ${hpPct > 50 ? 'bg-emerald-600' : hpPct > 25 ? 'bg-amber-500' : 'bg-red-600'}`}
          style={{ width: `${hpPct}%` }}
        />
      </div>
      <div className="text-[10px] text-dd-muted mt-0.5">
        HP {Math.max(0, unit.hp)}/{unit.maxHp}
        {unit.side === 'hero' ? ` · 压力 ${unit.stress}` : ''}
      </div>
      <EffectTags unit={unit} />
    </button>
  );
}
