import type { SkillDefinition } from '../../types';

interface SkillCardProps {
  skill: SkillDefinition;
  equipped?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const KIND_LABEL: Record<SkillDefinition['kind'], string> = {
  attack: '攻击',
  heal: '治疗',
  guard: '防御',
  move: '位移',
};

const KIND_COLOR: Record<SkillDefinition['kind'], string> = {
  attack: 'bg-dd-accent/20 text-dd-accent2',
  heal: 'bg-dd-positive/20 text-dd-positive',
  guard: 'bg-dd-warn/20 text-dd-warn',
  move: 'bg-dd-text/10 text-dd-text',
};

/** 技能卡：名称 / 类型 / 简短描述 / 装备态。 */
export default function SkillCard({ skill, equipped, disabled, onClick }: SkillCardProps) {
  const cls = [
    'rounded-md border p-2 text-sm flex flex-col gap-1 transition-colors',
    onClick && !disabled ? 'cursor-pointer hover:border-dd-accent2' : '',
    equipped ? 'border-dd-positive ring-1 ring-dd-positive bg-dd-positive/10' : 'border-dd-border',
    disabled && !equipped ? 'opacity-50' : '',
  ].join(' ');

  return (
    <div className={cls} onClick={disabled ? undefined : onClick}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-dd-text">{skill.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${KIND_COLOR[skill.kind]}`}>
          {KIND_LABEL[skill.kind]}
        </span>
      </div>
      <p className="text-[11px] text-dd-muted leading-snug">{skill.description}</p>
      {equipped && <span className="text-[10px] text-dd-positive">已装备</span>}
    </div>
  );
}
