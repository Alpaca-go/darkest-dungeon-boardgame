import type { CampaignState } from '../../types';

const PROVISION_LABEL: Record<keyof CampaignState['provisions'], string> = {
  food: 'Food',
  bandage: 'Band',
  potion: 'Pot',
  torch: 'Torch',
  tool: 'Tool',
};

/** 地牢顶栏：Act / Quest / Gold / Light / 补给池 / 全队平均压力。 */
export default function TopResourceBar({ campaign }: { campaign: CampaignState }) {
  const avgStress =
    campaign.heroes.length > 0
      ? Math.round(campaign.heroes.reduce((s, h) => s + h.stress, 0) / campaign.heroes.length)
      : 0;

  return (
    <div className="rounded-lg border border-dd-border bg-dd-panel px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <span className="text-dd-muted">
        Act <span className="text-dd-text font-semibold">{campaign.act}</span>
      </span>
      <span className="text-dd-muted">
        Gold <span className="text-dd-warn font-semibold">{campaign.gold}</span>
      </span>
      <span className="text-dd-muted">
        Light <span className="text-dd-text font-semibold">{campaign.light}</span>
      </span>
      <span className="text-dd-muted">
        平均压力 <span className="text-dd-accent2 font-semibold">{avgStress}</span>
      </span>
      <div className="flex items-center gap-3">
        {Object.entries(campaign.provisions).map(([k, v]) => (
          <span key={k} className="text-dd-muted">
            {PROVISION_LABEL[k as keyof CampaignState['provisions']]}{' '}
            <span className="text-dd-text font-semibold">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
