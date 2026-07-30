import { useGameStore } from '../../store/useGameStore';
import { getQuirkById } from '../../data/quirks';
import { firstPendingQuirkDecision, QUIRK_CAP } from '../../game-engine/quirks';

/**
 * Phase 8A：Quirk 上限决策浮层（阻塞式）。
 * 数据源为存档中的 pendingQuirkDecisions 队列，先进先出；
 * 组件只负责展示与提交玩家选择，替换/放弃逻辑全部在引擎 resolveQuirkDecision 内完成。
 * - Positive 进入：可放弃新 Quirk，或替换一个既有 Positive；
 * - Negative 进入：必须替换一个既有 Positive（无法放弃）。
 */
export default function QuirkDecisionOverlay() {
  const campaign = useGameStore((s) => s.campaign);
  const resolveDecision = useGameStore((s) => s.resolveQuirkDecision);

  if (!campaign) return null;
  const decision = firstPendingQuirkDecision(campaign);
  if (!decision) return null;

  const incoming = getQuirkById(decision.incomingQuirkId);
  const isPositive = decision.polarity === 'positive';
  const tone = isPositive ? 'border-sky-500 text-sky-300' : 'border-amber-500 text-amber-300';

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4"
      data-testid="quirk-decision-overlay"
    >
      <div className={`w-full max-w-md rounded-lg border-2 bg-dd-panel p-5 shadow-2xl ${tone}`}>
        <div className="text-lg font-bold mb-2" data-testid="quirk-decision-title">
          怪癖已满（{QUIRK_CAP}）
        </div>

        <div className="text-sm text-dd-text space-y-1.5">
          <p>
            <span className="font-semibold">{decision.heroName}</span> 即将获得
            {isPositive ? '正面' : '负面'}怪癖：
            <span className="font-bold"> {incoming?.name ?? decision.incomingQuirkId}</span>
          </p>
          {incoming && <p className="text-dd-muted text-xs">{incoming.description}</p>}
          <p className="text-dd-muted text-xs">
            {isPositive
              ? '可以放弃这个新怪癖，或替换掉一个既有的正面怪癖。'
              : '负面怪癖无法拒绝，必须替换掉一个既有的正面怪癖。'}
          </p>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="text-xs text-dd-muted">选择要移除的正面怪癖：</div>
          {decision.replaceableQuirkIds.map((qid) => {
            const q = getQuirkById(qid);
            return (
              <button
                key={qid}
                type="button"
                onClick={() => resolveDecision(decision.id, { action: 'replace', removeQuirkId: qid })}
                className="w-full rounded border border-dd-border bg-dd-panel2 px-3 py-2 text-left text-sm text-dd-text hover:border-dd-accent transition-colors"
                data-testid={`quirk-replace-${qid}`}
              >
                <span className="font-semibold">{q?.name ?? qid}</span>
                {q && <span className="block text-[11px] text-dd-muted">{q.description}</span>}
              </button>
            );
          })}
        </div>

        {decision.canDiscardIncoming && (
          <button
            type="button"
            onClick={() => resolveDecision(decision.id, { action: 'discard-incoming' })}
            className="mt-3 w-full rounded border border-dd-border bg-dd-panel2 px-3 py-1.5 text-sm text-dd-muted hover:text-dd-text transition-colors"
            data-testid="quirk-discard-incoming"
          >
            放弃新怪癖
          </button>
        )}
      </div>
    </div>
  );
}
