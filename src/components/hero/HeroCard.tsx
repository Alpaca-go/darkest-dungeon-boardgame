import type { ReactNode } from 'react';
import ColorBlockImage from '../placeholders/ColorBlockImage';

interface HeroCardProps {
  name: string;
  color: string;
  life?: number;
  wounds?: number;
  stress?: number;
  speed?: number;
  stance?: string;
  tags?: string[];
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  footer?: ReactNode;
}

/** 英雄卡：纯色块头像 + 基础数值，支持选中/禁用态。 */
export default function HeroCard({
  name,
  color,
  life,
  wounds = 0,
  stress = 0,
  speed,
  stance,
  tags,
  selected,
  disabled,
  onClick,
  footer,
}: HeroCardProps) {
  const cls = [
    'rounded-lg border p-3 flex flex-col gap-2 bg-dd-panel transition-colors',
    onClick && !disabled ? 'cursor-pointer hover:border-dd-accent2' : '',
    selected ? 'border-dd-accent ring-1 ring-dd-accent' : 'border-dd-border',
    disabled ? 'opacity-50' : '',
  ].join(' ');

  return (
    <div className={cls} onClick={disabled ? undefined : onClick}>
      <div className="flex items-center gap-3">
        <ColorBlockImage color={color} label={name.slice(0, 2)} className="w-12 h-12 rounded-md" />
        <div className="min-w-0">
          <div className="font-semibold text-dd-text truncate">{name}</div>
          {tags && tags.length > 0 && (
            <div className="text-[11px] text-dd-muted truncate">{tags.join(' · ')}</div>
          )}
        </div>
      </div>

      {(life !== undefined || speed !== undefined || stance) && (
        <div className="grid grid-cols-3 gap-1 text-xs text-dd-muted">
          {life !== undefined && (
            <span>
              HP <span className="text-dd-text">{Math.max(0, life - wounds)}/{life}</span>
            </span>
          )}
          {stress !== undefined && (
            <span>
              Stress <span className="text-dd-warn">{stress}</span>
            </span>
          )}
          {speed !== undefined && (
            <span>
              Spd <span className="text-dd-text">{speed}</span>
            </span>
          )}
        </div>
      )}
      {stance && <div className="text-[11px] text-dd-muted">姿态：{stance}</div>}

      {footer && <div className="mt-1 border-t border-dd-border pt-2">{footer}</div>}
    </div>
  );
}
