import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import type { QuestRuleProvision } from '../../types/content-runtime';

const LABELS: Record<QuestRuleProvision, string> = {
  food: 'Food', bandage: 'Bandage', potion: 'Potion', torch: 'Torch', tool: 'Tool',
};

export default function QuestRuleChoiceOverlay() {
  const campaign = useGameStore((state) => state.campaign);
  const resolve = useGameStore((state) => state.resolveQuestRuleProvision);
  const [error, setError] = useState<string | null>(null);
  const pending = campaign?.questRuntimeState?.pendingRuleChoice;
  if (!campaign || !pending) return null;

  const choose = (provision: QuestRuleProvision) => {
    const result = resolve(pending.transactionId, provision);
    setError(result);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70" role="dialog" aria-modal="true" data-testid="quest-rule-choice">
      <div className="w-[440px] max-w-[92vw] rounded-lg border border-dd-warn bg-dd-panel p-5">
        <h2 className="font-bold text-dd-text">Quest Special Rule</h2>
        <p className="mt-2 text-sm text-dd-muted">After leaving a Room, choose and discard 1 Provision.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(Object.keys(LABELS) as QuestRuleProvision[]).map((provision) => (
            <button
              key={provision}
              type="button"
              data-testid={`quest-rule-discard-${provision}`}
              disabled={campaign.provisions[provision] <= 0}
              onClick={() => choose(provision)}
              className="rounded border border-dd-border bg-dd-panel2 px-3 py-2 text-sm text-dd-text disabled:opacity-35"
            >
              {LABELS[provision]} ({campaign.provisions[provision]})
            </button>
          ))}
        </div>
        {error ? <p className="mt-3 text-xs text-red-300" role="alert">{error}</p> : null}
        {Object.values(campaign.provisions).every((count) => count <= 0) ? (
          <p className="mt-3 text-xs text-red-300" role="alert" data-testid="quest-rule-no-provision">
            No Provision is available. The rule remains unresolved and progression is fail-closed.
          </p>
        ) : null}
      </div>
    </div>
  );
}
