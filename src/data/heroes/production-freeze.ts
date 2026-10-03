/** Candidate records are immutable; lookups cannot alter future lookups. */
export function freezeProduction<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeProduction);
    Object.freeze(value);
  }
  return value;
}
