import { useState } from 'react';
import type { PendingChoice } from '../../types/boss-runtime';

const labels: Record<PendingChoice['choiceType'], string> = {
  CHOICE_TARGET_HERO: '选择最低掷骰的英雄', CHOICE_TARGET_AREA: '选择最拥挤的区域',
  CHOICE_REANIMATION_DEATH: '选择复活的怪物', CHOICE_PLACEMENT_DESTINATION: '选择放置区域',
  CHOICE_DISPLACEMENT_CHARACTER: '选择移出的角色',
  CHOICE_DEATH_EFFECT: '选择下一个死亡效果',
};
/** Local selection is a draft; only confirm commits the immutable runtime choice. */
export default function BossChoicePanel({ choice, onConfirm, candidateLabel = id => id }: {
  choice: PendingChoice; onConfirm: (choiceId: string, selectedId: string) => void; candidateLabel?: (id: string) => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" data-testid="boss-pending-choice">
    <section role="dialog" aria-modal="true" aria-labelledby="boss-choice-title" className="max-w-lg rounded border border-dd-accent bg-dd-panel p-6 space-y-4">
      <h2 id="boss-choice-title">{labels[choice.choiceType]}</h2>
      <p>选择完成前，战斗暂停。</p>
      <div role="group" aria-label="候选项" className="flex flex-wrap gap-2">
        {choice.candidateIds.map(id => <button key={id} type="button" aria-pressed={draft === id}
          data-testid="boss-choice-candidate" data-candidate-id={id}
          className={`rounded border p-2 ${draft === id ? 'border-dd-accent bg-dd-accent/20' : 'border-dd-muted'}`}
          onClick={() => setDraft(id)}>{candidateLabel(id)}</button>)}
      </div>
      <div className="flex gap-3">
        <button type="button" disabled={!draft} onClick={() => draft && onConfirm(choice.choiceId, draft)} data-testid="boss-choice-confirm">确认</button>
        <button type="button" disabled={!draft} onClick={() => setDraft(null)}>清除选择</button>
      </div>
    </section>
  </div>;
}
