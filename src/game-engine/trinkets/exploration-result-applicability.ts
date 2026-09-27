import type { ExplorationEventResult, TrinketSideDefinition } from '../../types';
/** Source effect parameters determine applicability; they are not extra source conditions. */
export function explorationEffectApplicable(side: TrinketSideDefinition, result: ExplorationEventResult): boolean {
  return side.effects.some((effect) => effect.type === 'ignore-exploration-result' ? effect.options.includes(result)
    : effect.type === 'replace-exploration-result' && effect.from === 'not-trap' && result !== 'trap');
}
