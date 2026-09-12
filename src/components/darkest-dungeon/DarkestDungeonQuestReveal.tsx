import { useGameStore } from '../../store/useGameStore';
import { getDarkestDungeonGuardianById } from '../../data/darkest-dungeon/guardian-registry';
import { getFinalFormDisplayName } from '../../data/darkest-dungeon/final-form-registry';
import { communityComponentIdToVisualId } from '../../data/darkest-dungeon/community-reference/visual-assets';
import CommunityVisual from './CommunityVisual';

/**
 * 只读展示：已抽取的 Darkest Dungeon Quest（§7）。
 * 显示 Quest / Guardian / 被取消的 Final Form / 废弃 Quest。
 * 不读取 Objective 位置（硬约束 6）。
 */
export default function DarkestDungeonQuestReveal() {
  const campaign = useGameStore((s) => s.campaign);
  const a4 = campaign?.actFourState;
  const record = a4?.questDrawRecord;
  if (!record) return null;

  const guardian = a4?.guardianDefinitionId
    ? getDarkestDungeonGuardianById(a4.guardianDefinitionId)
    : null;
  const skipped = a4?.skippedFinalFormId ? getFinalFormDisplayName(a4.skippedFinalFormId) : '—';
  const questVisualId = communityComponentIdToVisualId(record.selectedQuestId);

  return (
    <div className="rounded border border-dd-border bg-dd-panel2 p-2" data-testid="dd-quest-reveal">
      <div className="text-dd-muted mb-1 text-xs">Darkest Dungeon Quest（已抽取，刷新不重抽）</div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 text-xs">
        <span>
          Quest：<b className="text-dd-text">{record.selectedQuestId}</b>
          <span className="text-dd-muted">（16 Rooms / 3 XP）</span>
        </span>
        <span>
          Guardian：
          <b className="text-dd-text">{guardian ? guardian.name : a4?.guardianDefinitionId ?? '—'}</b>
        </span>
        <span>
          取消的 Final Form：
          <b className="text-red-300">{skipped}</b>
        </span>
        <span className="text-dd-muted">
          废弃：{record.discardedQuestIds.join('、') || '—'}
        </span>
      </div>
      {questVisualId && (
        <div className="mt-2 max-w-[180px]" data-testid="dd-quest-reveal-visual">
          <CommunityVisual
            runtimeEntityId={questVisualId}
            assetKind="quest-card-front"
            alt={`Community Quest Card ${questVisualId}`}
            className="w-full h-auto rounded border border-dd-border"
            testId={`dd-quest-reveal-card-${questVisualId}`}
            profileId={record.runtimeProfileId ?? 'prototype'}
          />
        </div>
      )}
    </div>
  );
}

