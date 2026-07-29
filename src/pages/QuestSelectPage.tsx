import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import PendingPhase from '../components/placeholders/PendingPhase';

export default function QuestSelectPage() {
  const campaign = useGameStore((s) => s.campaign);
  if (!campaign) return <Navigate to="/" replace />;
  return <PendingPhase title="任务选择" phase="quest-select" />;
}
