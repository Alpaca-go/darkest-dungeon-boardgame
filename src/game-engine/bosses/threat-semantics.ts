/** Shared accepted Threat classifiers. Geometry and physical allocation belong to the caller. */
export function isNonUnholy(tags: readonly string[]): boolean {
  return !tags.some(tag => tag.toLowerCase() === 'unholy');
}

export function isReanimationEligible(large: boolean): boolean {
  return !large;
}
