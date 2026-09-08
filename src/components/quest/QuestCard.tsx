import type { QuestDefinition } from '../../types';

interface QuestCardProps {
  quest: QuestDefinition;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const DIFFICULTY_COLOR: Record<QuestDefinition['difficulty'], string> = {
  easy: 'text-dd-positive',
  normal: 'text-dd-warn',
  hard: 'text-dd-accent2',
};

/** 任务卡：名称 / 描述 / 推荐等级 / 目标 / 奖励 / 难度。 */
export default function QuestCard({ quest, selected, disabled, onClick }: QuestCardProps) {
  const cls = [
    'rounded-lg border p-4 flex flex-col gap-2 bg-dd-panel transition-colors',
    onClick && !disabled ? 'cursor-pointer hover:border-dd-accent2' : '',
    selected ? 'border-dd-accent ring-1 ring-dd-accent' : 'border-dd-border',
    disabled ? 'opacity-50' : '',
  ].join(' ');

  return (
    <div data-testid={`quest-${quest.id}`} role="button" aria-disabled={!!disabled} tabIndex={disabled ? -1 : 0} onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick?.(); } }} className={cls} onClick={disabled ? undefined : onClick}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-dd-text">{quest.name}</h3>
        <span className={`text-xs font-semibold ${DIFFICULTY_COLOR[quest.difficulty]}`}>
          {quest.difficulty.toUpperCase()}
        </span>
      </div>
      <p className="text-sm text-dd-muted">{quest.description}</p>
      <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
        <div className="flex justify-between">
          <dt className="text-dd-muted">类型</dt>
          <dd className="text-dd-text">{quest.type}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-dd-muted">推荐等级</dt>
          <dd className="text-dd-text">{quest.dungeonLevel}</dd>
        </div>
        <div className="flex justify-between col-span-2">
          <dt className="text-dd-muted">目标</dt>
          <dd className="text-dd-text text-right">{quest.objective}</dd>
        </div>
        <div className="flex justify-between col-span-2">
          <dt className="text-dd-muted">奖励</dt>
          <dd className="text-dd-warn font-semibold">{quest.reward}</dd>
        </div>
      </dl>
    </div>
  );
}
