import { WIRED_WINDOWS } from '../game-engine/trinkets/wired-trinket-windows';
import { canonicalSourceCondition, canonicalSourceEffect, canonicalSourceModifier, RUNTIME_WINDOW_BINDINGS,
  type TrinketSourceDefinition } from './trinket-semantic-coverage';
import { missingModifierConsumers } from './trinket-modifier-consumer-coverage';
import { missingEffectConsumers } from './trinket-effect-consumer-coverage';
import { TRINKET_CONDITION_CONSUMER_COVERAGE } from './trinket-condition-consumer-coverage';

/** Historical normalization diagnoses are retained separately, never used as Level 3 live truth. */
export function liveTrinketMissingPrimitives(source: TrinketSourceDefinition): string[] {
  return [...new Set([source.positiveSide, source.negativeSide].flatMap((side) => {
    const window = Object.entries(RUNTIME_WINDOW_BINDINGS).find(([name, binding]) =>
      WIRED_WINDOWS.some((wired) => wired === name) && binding.trigger === side.trigger && binding.target === side.target);
    const missing = window ? [] : [side.trigger === 'voluntary-declaration'
      ? 'VOLUNTARY_DECLARATION_RUNTIME' : `TRINKET_TRIGGER_WINDOW_MISSING:${side.trigger}`];
    const modifiers = side.modifiers.map(canonicalSourceModifier).filter((value) => value !== null);
    missing.push(...missingModifierConsumers(modifiers, side.trigger).map((stat) => `TRINKET_MODIFIER_CONSUMER_MISSING:${stat}`));
    const effects = side.effects.map((effect) => canonicalSourceEffect(effect, side.target)).filter((value) => value !== null);
    missing.push(...missingEffectConsumers(effects).map((effect) => `TRINKET_EFFECT_CONSUMER_MISSING:${effect}`));
    if (side.conditions.map(canonicalSourceCondition).some((condition) => condition?.type === 'stance')
      && !TRINKET_CONDITION_CONSUMER_COVERAGE.stance.wired) missing.push('TRINKET_STANCE_CONDITION_CONSUMER');
    return missing;
  }))];
}
