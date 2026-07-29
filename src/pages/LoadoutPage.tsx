import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import PendingPhase from '../components/placeholders/PendingPhase';

export default function LoadoutPage() {
  const campaign = useGameStore((s) => s.campaign);
  if (!campaign) return <Navigate to="/" replace />;
  return <PendingPhase title="技能配置" phase="skill-loadout" />;
}
