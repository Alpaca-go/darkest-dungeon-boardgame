import type { ResolveState } from '../../types';
import { getVirtueById } from '../../data/virtues';
import { getAfflictionById } from '../../data/afflictions';

/**
 * Phase 7：Virtue/Affliction 徽章（展示层，只读）。
 * normal 不渲染；virtuous 金色；afflicted 紫红色。
 */
export default function ResolveStateBadge({
  resolveState,
  virtueId,
  afflictionId,
  className = '',
}: {
  resolveState: ResolveState;
  virtueId: string | null;
  afflictionId: string | null;
  className?: string;
}) {
  if (resolveState === 'normal') return null;
  const isVirtue = resolveState === 'virtuous';
  const card = isVirtue
    ? virtueId
      ? getVirtueById(virtueId)
      : undefined
    : afflictionId
      ? getAfflictionById(afflictionId)
      : undefined;
  const label = card?.name ?? (isVirtue ? 'Virtue' : 'Affliction');
  return (
    <span
      className={[
        'px-1 rounded text-[10px] leading-4 font-semibold',
        isVirtue ? 'bg-amber-900/70 text-amber-200' : 'bg-fuchsia-900/70 text-fuchsia-200',
        className,
      ].join(' ')}
      title={card?.description ?? label}
      data-testid={`resolve-badge-${resolveState}`}
    >
      {isVirtue ? '✦' : '☠'} {label}
    </span>
  );
}
