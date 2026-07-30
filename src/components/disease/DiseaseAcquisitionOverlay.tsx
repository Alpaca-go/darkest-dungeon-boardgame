import { useGameStore } from '../../store/useGameStore';
import { getDiseaseById } from '../../data/diseases';
import { getQuirkById } from '../../data/quirks';

/**
 * Phase 8B：Disease 获取结果浮层（纯展示层）。
 *
 * 核心约束 8：本组件不产生任何随机结果 —— 所有结算（是否感染 / 替换 / 抽到哪个 Negative Quirk /
 * 是否触发 Madness Death）都已由引擎写入 campaign.lastDiseaseAcquisition，这里只做呈现与确认。
 * 确认后调用 store 清空 lastDiseaseAcquisition。
 */
export default function DiseaseAcquisitionOverlay() {
  const campaign = useGameStore((s) => s.campaign);
  const acknowledge = useGameStore((s) => s.acknowledgeDiseaseAcquisition);

  const record = campaign?.lastDiseaseAcquisition ?? null;
  if (!record) return null;
  // 「无事发生」类结果不打断玩家
  if (record.outcome === 'discarded-invalid' || record.outcome === 'discarded-dead-hero') {
    return null;
  }

  const incoming = getDiseaseById(record.incomingDiseaseId);
  const removed = record.removedDiseaseId ? getDiseaseById(record.removedDiseaseId) : undefined;
  const quirk = record.negativeQuirkId ? getQuirkById(record.negativeQuirkId) : undefined;

  const isDuplicate = record.outcome === 'duplicate-discarded';
  const isDeath = record.outcome === 'replaced-hero-died';
  const isReplace =
    record.outcome === 'replaced' || record.outcome === 'replaced-quirk-decision-pending' || isDeath;

  const title = isDuplicate ? '同种疾病 · 无变化' : isReplace ? '疾病恶化！' : '感染疾病！';
  const tone = isDeath
    ? 'border-red-500 text-red-300'
    : isDuplicate
      ? 'border-dd-border text-dd-text'
      : 'border-lime-500 text-lime-300';

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4"
      data-testid="disease-overlay"
    >
      <div className={`w-full max-w-sm rounded-lg border-2 bg-dd-panel p-5 shadow-2xl ${tone}`}>
        <div className="text-lg font-bold mb-2" data-testid="disease-overlay-title">
          ☣ {title}
        </div>
        <div className="text-sm text-dd-text space-y-1.5">
          <p>
            <span className="font-semibold">{record.heroName}</span> 接触到了{' '}
            <span className="font-bold">{incoming?.name ?? record.incomingDiseaseId}</span>。
          </p>
          {isDuplicate ? (
            <p className="text-dd-muted text-xs">
              该英雄已经患有同种疾病，新的感染被丢弃（每名英雄最多携带 1 种疾病）。
            </p>
          ) : (
            <>
              {incoming && <p className="text-dd-muted text-xs">{incoming.description}</p>}
              {removed && (
                <p className="text-xs text-dd-muted">
                  原有疾病「{removed.name}」被替换 —— 替换会额外带来 1 个负面怪癖。
                </p>
              )}
              {quirk && (
                <p className="text-xs">
                  获得负面怪癖：<span className="font-bold text-stone-300">{quirk.name}</span>
                  <span className="block text-dd-muted">{quirk.description}</span>
                </p>
              )}
              {record.outcome === 'replaced-quirk-decision-pending' && (
                <p className="text-xs text-amber-300">
                  怪癖已达上限，需要在接下来的弹层中选择保留哪些怪癖。
                </p>
              )}
              {isDeath && (
                <p className="text-xs text-red-400 font-bold">
                  负面怪癖超出承受极限 —— {record.heroName} 因疯癫而死亡。
                </p>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={acknowledge}
          className="mt-4 w-full rounded border border-dd-border bg-dd-panel2 px-3 py-1.5 text-sm text-dd-text hover:bg-dd-panel transition-colors"
          data-testid="disease-overlay-confirm"
        >
          确认
        </button>
      </div>
    </div>
  );
}
