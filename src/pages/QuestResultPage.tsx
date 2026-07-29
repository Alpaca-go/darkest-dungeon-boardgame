import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import PendingPhase from '../components/placeholders/PendingPhase';

export default function QuestResultPage() {
  const campaign = useGameStore((s) => s.campaign);
  if (!campaign) return <Navigate to="/" replace />;
  return <PendingPhase title="任务结算" phase="quest-result" />;
}
