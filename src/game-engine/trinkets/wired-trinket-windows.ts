import type { TrinketUseWindow } from '../../types';

/** Shared by runtime selection and live capability auditing. */
export const WIRED_WINDOWS: readonly TrinketUseWindow[] = [
  'before-attack-roll', 'after-attack-roll-before-hit-resolution', 'before-damage-applied',
  'before-incoming-hit-resolution', 'before-incoming-damage-applied', 'hero-turn-start', 'room-entered',
  'before-healing-delivered-resolution', 'before-healing-received-resolution', 'before-scout-resolution',
  'after-dungeon-roll', 'before-camp-resolution', 'before-disease-acquisition-commit',
];
