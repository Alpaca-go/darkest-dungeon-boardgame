import type { ProvisionPool } from '../../../types';
import type { CommunityProvisionFace, CommunityQuestProvisionDieRecord, CommunityQuestProvisionRecord } from '../../../types/act-four';
import {
  COMMUNITY_EXCAVATION_PROVISION_SEMANTIC,
  COMMUNITY_FINAL_PROVISION_SEMANTIC,
  COMMUNITY_PROVISION_FACES,
} from '../../../data/darkest-dungeon/community-reference/source-supplement-runtime';

export type CommunityWildChooser = (heroId: string, dieIndex: number) => keyof ProvisionPool | undefined;

const FACES: CommunityProvisionFace[] = [...COMMUNITY_PROVISION_FACES];

export function grantedFromCommunityProvision(record: CommunityQuestProvisionRecord): Record<string, number> {
  const granted: Record<string, number> = {};
  for (const die of record.dice) {
    if (!die.acceptedIntoPool) continue;
    granted[die.selectedFace] = (granted[die.selectedFace] ?? 0) + 1;
  }
  return granted;
}

export function rollCommunityProvisionDice(
  current: ProvisionPool,
  policyId: string,
  heroIds: string[],
  dicePerHero: 1 | 2,
  rng: () => number,
  chooseWild?: CommunityWildChooser,
): { ok: true; provisions: ProvisionPool; record: CommunityQuestProvisionRecord } | { ok: false; reason: string } {
  if (!chooseWild) return { ok: false, reason: 'Wild Provision choice required' };
  const semantic = dicePerHero === 2 ? COMMUNITY_FINAL_PROVISION_SEMANTIC : COMMUNITY_EXCAVATION_PROVISION_SEMANTIC;
  const provisions = { ...current };
  const dice: CommunityQuestProvisionDieRecord[] = [];
  for (const heroId of heroIds) {
    for (let dieIndex = 0; dieIndex < semantic.dicePerHero; dieIndex += 1) {
      const roll = Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
      const rolledFace = FACES[roll - 1];
      const selectedFace = rolledFace === 'wild' ? chooseWild(heroId, dieIndex) : rolledFace;
      if (!selectedFace || (selectedFace as string) === 'wild' || !Object.prototype.hasOwnProperty.call(current, selectedFace)) {
        return { ok: false, reason: `Wild Provision choice required for ${heroId} die ${dieIndex + 1}` };
      }
      const acceptedIntoPool = Object.values(provisions).reduce((sum, count) => sum + count, 0) < semantic.poolMaximum;
      if (acceptedIntoPool) provisions[selectedFace] += 1;
      dice.push({
        heroId,
        dieIndex: dieIndex as 0 | 1,
        roll,
        rolledFace,
        selectedFace,
        acceptedIntoPool,
      });
    }
  }
  return { ok: true, provisions, record: { policyId, dice, poolMaximum: 16 } };
}
