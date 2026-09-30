import { ALL_DISEASES } from '../../data/diseases';

/** A printed Disease icon acquires one card; the single draw is the only random operation. */
export function drawDisease(rng: () => number): string {
  if (!ALL_DISEASES.length) throw new Error('Disease deck unavailable');
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Disease draw RNG outside [0,1)');
  return ALL_DISEASES[Math.floor(roll * ALL_DISEASES.length)].id;
}
