import type { HeroDiseaseState } from '../../types';
import { getDiseaseById } from '../../data/diseases';

/**
 * Phase 8B：Disease 徽章（展示层，只读）。
 * 无病不渲染。统一使用暗绿色系，与 Quirk（蓝/灰）、Virtue/Affliction（金/紫）区分。
 * 战役层传 `disease`（HeroDiseaseState），战斗层传 `diseaseId`（BattleUnit 快照）。
 */
export default function DiseaseBadge({
  disease,
  diseaseId,
  className = '',
}: {
  disease?: HeroDiseaseState | null;
  diseaseId?: string | null;
  className?: string;
}) {
  const id = disease?.diseaseId ?? diseaseId ?? null;
  if (!id) return null;
  const def = getDiseaseById(id);
  const label = def?.name ?? id;
  return (
    <span
      className={[
        'px-1 rounded text-[10px] leading-4 font-semibold bg-lime-950/80 text-lime-300 border border-lime-800/60',
        className,
      ].join(' ')}
      title={def ? `${def.name}（规则书 p.${def.rulesPage}）：${def.description}` : label}
      data-testid="disease-badge"
      data-disease-id={id}
    >
      ☣ {label}
    </span>
  );
}
