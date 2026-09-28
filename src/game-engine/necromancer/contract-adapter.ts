import contractJson from '../../../docs/data/complete-edition/c1c28-necromancer-runtime-semantic-contract.json?raw';
import type { BossDefinitionContract, BossSkill } from '../../types/boss-runtime';

export const NECROMANCER_RULE_SET_VERSION = 'C1C28-DIGITAL-DEFAULT-v1';
type Field = { fieldId: string; value: unknown; authority: string; canonical: boolean; rulingId: string; officialEvidence?: Array<{ physicalIdentity?: string; definitionId?: string }> };
const contract = JSON.parse(contractJson) as { rulingSetVersion: string; family: string; fields: Field[];
  reachableExecutionGraph: { nodes: Array<{ cardId?: number; fieldIds: string[] }> } };
const fields: Field[] = contract.fields;
/** Materialize structured semantic nodes from C1C28 leaves, never printed literals. */
export function readContractNode<T>(file: string, pointer: string): T {
  const prefix = `${file}.json:${pointer}`;
  const exact = fields.find(f => f.fieldId === prefix);
  if (exact) return structuredClone(exact.value) as T;
  const descendants = fields.filter(f => f.fieldId.startsWith(`${prefix}/`));
  if (!descendants.length) throw new Error(`Missing executable contract node: ${prefix}`);
  const root: Record<string, unknown> | unknown[] = /^\d+\//.test(descendants[0].fieldId.slice(prefix.length + 1)) ? [] : {};
  for (const field of descendants) {
    const keys = field.fieldId.slice(prefix.length + 1).split('/').map(k => k.replace(/~1/g, '/').replace(/~0/g, '~'));
    let cursor = root as Record<string, unknown>;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) cursor[key] = structuredClone(field.value);
      else {
        cursor[key] ??= /^\d+$/.test(keys[index + 1]) ? [] : {};
        cursor = cursor[key] as Record<string, unknown>;
      }
    });
  }
  return root as T;
}
const cardsFile = 'c1c25-necromancer-card-semantic-contracts';
export function necromancerDefinition(level: 1 | 2 | 3): BossDefinitionContract {
  if (![1, 2, 3].includes(level) || contract.rulingSetVersion !== NECROMANCER_RULE_SET_VERSION) throw new Error('Unsupported Necromancer rules/level');
  const setup = (path: string) => readContractNode<unknown>('c1c25-necromancer-setup-contract', `/levels/${level - 1}/${path}`);
  // Card indices are resolved via C1C28 graph membership and its semantic Level binding.
  const graphCards = contract.reachableExecutionGraph.nodes.filter(n => 'cardId' in n);
  const cardForPhysical = (physicalId: unknown) => {
    const field = fields.find(f => f.fieldId.endsWith('/literalBinding/source/physicalIdentity') && f.value === physicalId);
    // Every printed field carries physical provenance, including identity cards without skills.
    const fallback = contract.fields.find(f => graphCards.some(n => n.fieldIds.includes(f.fieldId) &&
      f.officialEvidence?.some(e => e.physicalIdentity === physicalId && e.definitionId?.startsWith(`ce-boss-${n.cardId}-`))));
    const fieldId = field?.fieldId ?? fallback?.fieldId;
    const cardIndex = fieldId?.match(/\/cards\/(\d+)\//)?.[1];
    if (cardIndex === undefined) throw new Error('Unbound physical Boss card');
    const graphNode = graphCards.find(n => n.fieldIds.some(id => id.startsWith(`${cardsFile}.json:/cards/${cardIndex}/`)));
    if (!graphNode || !('cardId' in graphNode)) throw new Error('Card missing from execution graph');
    return { index: Number(cardIndex), id: graphNode.cardId as number };
  };
  const battle = cardForPhysical(setup('requiredComponents/value/battlePhysicalId'));
  const threat = cardForPhysical(setup('requiredComponents/value/threatPhysicalId'));
  const identity = cardForPhysical(setup('requiredComponents/value/bossIdentityPhysicalId'));
  const card = <T>(path: string) => readContractNode<T>(cardsFile, `/cards/${battle.index}/${path}`);
  const stats = card<BossDefinitionContract['stats']>('stats/value');
  const threatEffects = readContractNode<Array<{ name: string }>>(cardsFile, `/cards/${threat.index}/effect/value`);
  return {
    family: contract.family.toLowerCase(), level, ruleSetVersion: NECROMANCER_RULE_SET_VERSION, ruleSourcePolicyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1',
    battleCardId: battle.id, threatAbilityCardId: threat.id, bossIdentityCardId: identity.id,
    roomCardId: setup('requiredComponents/value/roomCard/value/cardId') as number,
    roomNumber: setup('roomSetup/value/number') as number,
    bossStartArea: setup('bossPlacement/value/area') as string,
    heroStartArea: setup('heroPlacement/value/area') as string,
    initialStance: setup('initialStance/value') as string,
    stats, actionsPerRound: card('timing/value/actionsPerRound'), skills: card<BossSkill[]>('effect/value'), attackTable: card('attackSelection/value/table'),
    areas: readContractNode('c1c25-necromancer-room-contract', '/areas/value'),
    adjacency: readContractNode('c1c25-necromancer-room-contract', '/adjacency/value'),
    supply: readContractNode<{ pools: BossDefinitionContract['supply'] }>(cardsFile, `/cards/${threat.index}/summonCopyPolicy`).pools,
    reanimation: threatEffects.some(e => e.name === 'Reanimation'),
    captainThreat: threatEffects.some(e => e.name === 'Army of the Dead'),
    hamlet: threatEffects.some(e => e.name === 'Unsettling Silhouettes') ? 'BLOCK_GRAVEYARD' : threatEffects.some(e => e.name === 'The Restless Dead') ? 'FORCE_GRAVEYARD_NO_USE' : 'FORCE_GRAVEYARD_USE',
    alias: readContractNode('c1c25-necromancer-bone-source-binding', '/missingName/alias'),
    sourceFieldIds: [...new Set([...graphCards.filter(n => 'cardId' in n && [battle.id, threat.id, identity.id].includes(n.cardId as number)).flatMap(n => n.fieldIds), ...fields.filter(f => /setup-contract|room-contract/.test(f.fieldId)).map(f => f.fieldId)])],
  };
}
export function boneRuntimeId(name: string): string { return name.toLowerCase().replace(/ /g, '-'); }
