import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import { QUESTS } from '../data/quests';
import QuestCard from '../components/quest/QuestCard';

export default function QuestSelectPage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const chooseQuest = useGameStore((s) => s.chooseQuest);

  if (!campaign) return <Navigate to="/" replace />;
  if (campaign.heroes.length < 4) return <Navigate to="/setup" replace />;
  if (campaign.heroes.some((h) => h.equippedSkillIds.length !== 3))
    return <Navigate to="/loadout" replace />;

  const onChoose = (questId: string) => {
    chooseQuest(questId); // 写入任务 id/状态、生成地牢、切换阶段、自动保存
    navigate('/dungeon');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-dd-text mb-1">任务选择</h1>
      <p className="text-dd-muted text-sm mb-4">选择一项任务，开始生成对应的地牢。</p>

      <div className="grid sm:grid-cols-2 gap-4">
        {QUESTS.map((q) => (
          <QuestCard
            key={q.id}
            quest={q}
            selected={campaign.currentQuestId === q.id}
            onClick={() => onChoose(q.id)}
          />
        ))}
      </div>

      <p className="text-xs text-dd-muted mt-4">
        选择后将立即生成地牢并进入探索阶段（任务 ID 与状态已写入战役存档）。
      </p>
    </div>
  );
}
