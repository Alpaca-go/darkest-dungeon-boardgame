import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import { QUESTS, isStandardQuestId, isBossQuestId, getQuestById } from '../data/quests';
import { canSelectStandardQuest, canSelectBossQuest } from '../game-engine/campaign/campaign-progress';
import { getThreatById } from '../data/bosses/threat-registry';
import QuestCard from '../components/quest/QuestCard';

/**
 * Phase 11A.1 — 任务选择页最小 UI 改动（dev doc §22）：
 * - 顶部展示 Act / Level / Standard 进度 / 当前 Threat / Boss Required 状态。
 * - Standard Quest 在 canSelectStandardQuest === false 时禁用。
 * - 当 bossQuestRequired === true 时，仅显示 Face the Threat，并显著标注。
 *
 * 注意：本阶段只做必要状态展示，不做视觉重构。
 */
export default function QuestSelectPage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const chooseQuest = useGameStore((s) => s.chooseQuest);

  if (!campaign) return <Navigate to="/" replace />;
  if (campaign.heroes.length < 4) return <Navigate to="/setup" replace />;
  if (campaign.heroes.some((h) => h.equippedSkillIds.length !== 3))
    return <Navigate to="/loadout" replace />;

  const cp = campaign.campaignProgress;
  const standardSelectable = canSelectStandardQuest(cp);
  const bossSelectable = canSelectBossQuest(cp);
  const activeThreat = cp.activeThreatId ? getThreatById(cp.activeThreatId) : null;

  const onChoose = (questId: string) => {
    chooseQuest(questId);
    navigate('/dungeon');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-dd-text mb-1">任务选择</h1>
      <p className="text-dd-muted text-sm mb-4">选择一项任务，开始生成对应的地牢。</p>

      {/* Phase 11A.1 §22 最小 UI：Campaign 状态条 */}
      <div className="mb-4 p-3 rounded border border-dd-border bg-dd-panel/40 text-sm">
        <div className="flex flex-wrap gap-3">
          <span>
            <strong>Act {cp.act}</strong> / Level {cp.campaignLevel}
          </span>
          <span>
            Standard 进度：{cp.completedStandardQuestsThisAct}/{cp.requiredStandardQuestsBeforeBoss}
          </span>
          {activeThreat ? (
            <span>
              当前 Threat：<strong>{activeThreat.name}</strong>（家族 {cp.activeBossFamilyId}）
            </span>
          ) : (
            <span className="text-dd-muted">当前 Threat：未抽取</span>
          )}
          {cp.bossQuestRequired ? (
            <span className="text-dd-danger font-semibold">⚠ Boss 强制：Face the Threat</span>
          ) : null}
        </div>
      </div>

      {cp.bossQuestRequired && bossSelectable ? (
        <div className="mb-3 p-3 rounded border-2 border-dd-danger bg-dd-danger/10 text-sm">
          迫近威胁已无法回避 —— 仅剩 <strong>Face the Threat</strong> 可选。
        </div>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-4">
        {QUESTS.map((q) => {
          const isStandard = isStandardQuestId(q.id);
          const isBoss = isBossQuestId(q.id);
          const isDisabled =
            (isStandard && !standardSelectable) ||
            (isBoss && !bossSelectable) ||
            cp.darkestDungeonUnlocked;
          return (
            <QuestCard
              key={q.id}
              quest={q}
              selected={campaign.currentQuestId === q.id}
              onClick={() => !isDisabled && onChoose(q.id)}
              disabled={isDisabled}
            />
          );
        })}
      </div>

      <p className="text-xs text-dd-muted mt-4">
        选择后将立即生成地牢并进入探索阶段（任务 ID 与状态已写入战役存档）。
      </p>
      {/* Suppress unused warning for getQuestById import: keep available for future ad-hoc tooltips. */}
      {void getQuestById}
    </div>
  );
}
