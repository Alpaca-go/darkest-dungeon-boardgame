import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import PendingPhase from '../components/placeholders/PendingPhase';

export default function CampaignSetupPage() {
  const campaign = useGameStore((s) => s.campaign);
  if (!campaign) return <Navigate to="/" replace />;
  return <PendingPhase title="战役设置" phase="campaign-setup" />;
}
