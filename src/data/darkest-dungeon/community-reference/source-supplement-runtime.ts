import { COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT } from './source-resolution';

export const COMMUNITY_SOURCE_SUPPLEMENT_RUNTIME_ADAPTER_ID = 'community-source-supplement-runtime.v1' as const;
export const COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT_SHA256 =
  '0993f2450e95cd77fdc31cfeab6b1c540ffc599f0ff217d1cef3bc68062556c8' as const;

export type CommunityProvisionFaceName = 'food' | 'bandage' | 'potion' | 'torch' | 'tool' | 'wild';

const FACES: CommunityProvisionFaceName[] = ['food', 'bandage', 'potion', 'torch', 'tool', 'wild'];

function semantic<T>(semanticId: string): T {
  const found = COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT.semantics.find((item) => item.semanticId === semanticId);
  if (!found) throw new Error(`Missing accepted source supplement semantic: ${semanticId}`);
  return found.resolvedValue as T;
}

if (COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT.runtimeConsumptionAuthorized !== false) {
  throw new Error('Historical source supplement must remain runtimeConsumptionAuthorized=false');
}

export const COMMUNITY_FINAL_PROVISION_SEMANTIC = semantic<{
  dicePerHero: 2;
  faces: CommunityProvisionFaceName[];
  wild: 'roller chooses one non-wild face';
  poolMaximum: 16;
  timing: 'before Final Encounter';
}>('community-final-provision-policy-v1');

export const COMMUNITY_EXCAVATION_PROVISION_SEMANTIC = semantic<{
  dicePerHero: 1;
  faces: CommunityProvisionFaceName[];
  wild: 'roller chooses one non-wild face';
  poolMaximum: 16;
  timing: 'immediately on Excavation Site entry';
}>('community-excavation-provision-procedure-v1');

export const COMMUNITY_MONSTER_DRAW_SEMANTIC = semantic<{
  deckSize: 26;
  shuffleAtActFourStart: true;
  draw: 'top physical cards until four Stance slots are filled';
  duplicates: 'distinct physical copies allowed';
  largeUsesTwoSlots: true;
  usedCards: 'shuffle back at Battle End';
  savedDeckIdsArePolicy: false;
  uniformLogicalIdentity: false;
}>('community-dd-monster-physical-draw-policy-v1');

export const COMMUNITY_SHUFFLING_DEPLOYMENT_SEMANTIC = semantic<{
  horror: 'Aggressive / r10-SW';
  cultistPriest: 'reserve until summoned';
  malignantGrowth: 'reserve until summoned';
  heroes: 'areas matching selected Hero Stances';
}>('community-shuffling-initial-deployment-v1');

export const COMMUNITY_ABSOLUTE_NOTHINGNESS_SEMANTIC = semantic<{
  stanceTrackerStance: null;
  kind: 'room occupancy miniature';
  areas: ['monster-defense', 'monster-ranged', 'monster-support'];
  targetable: false;
  occupancy: 1;
  initiativeCards: 0;
  turns: 'none';
  movementProcedure: null;
}>('community-absolute-nothingness-non-stance-occupant-v1');

export const COMMUNITY_PROVISION_FACES: CommunityProvisionFaceName[] = [...FACES];
export const COMMUNITY_NON_WILD_PROVISION_FACES = FACES.filter((face): face is Exclude<CommunityProvisionFaceName, 'wild'> => face !== 'wild');
export const COMMUNITY_HORROR_INITIAL_AREA_ID = 'r10-SW' as const;

if (COMMUNITY_FINAL_PROVISION_SEMANTIC.dicePerHero !== 2 || COMMUNITY_EXCAVATION_PROVISION_SEMANTIC.dicePerHero !== 1) {
  throw new Error('Accepted provision dice counts mismatch');
}
if (COMMUNITY_MONSTER_DRAW_SEMANTIC.deckSize !== 26 || COMMUNITY_MONSTER_DRAW_SEMANTIC.savedDeckIdsArePolicy !== false) {
  throw new Error('Accepted physical Monster deck semantic mismatch');
}
if (COMMUNITY_ABSOLUTE_NOTHINGNESS_SEMANTIC.stanceTrackerStance !== null) {
  throw new Error('Absolute Nothingness must not occupy a Stance Tracker stance');
}

export function assertHistoricalSupplementUnchanged(): void {
  if (COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT.historicalEvidenceMutation) {
    throw new Error('Historical source-research artifacts were mutated');
  }
}
