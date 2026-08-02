// Phase 11A — Prototype Contamination Scan (spec §9).
// Scans official-ready runtime surfaces for any prototype-* ID reference.
// Release Gate requirement: official path prototype references = 0.

import { generateContentManifest } from './content-manifest';
import type { CoreCampaignContentManifest } from './types';

export interface PrototypeContaminationFinding {
  surface: string;
  id: string;
  detail: string;
}

/** Walk an arbitrary value tree and collect every string matching prototype-* . */
function collectPrototypeIds(value: unknown, path: string, out: Array<{ id: string; detail: string }>): void {
  if (typeof value === 'string') {
    if (value.startsWith('prototype-')) out.push({ id: value, detail: path });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectPrototypeIds(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectPrototypeIds(v, `${path}.${k}`, out);
    }
  }
}

export function scanOfficialRuntimeForPrototypeContent(manifest?: CoreCampaignContentManifest): PrototypeContaminationFinding[] {
  const m = manifest ?? generateContentManifest();
  const findings: PrototypeContaminationFinding[] = [];

  // Official pool = entries that are official-ready.
  const officialEntries = [
    ...m.heroes, ...m.heroSkills, ...m.quests, ...m.threats, ...m.bosses, ...m.monsters,
    ...m.rooms, ...m.roomTiles, ...m.curios, ...m.lootChests, ...m.trinkets, ...m.quirks,
    ...m.diseases, ...m.afflictions, ...m.virtues, ...m.hamletEvents, ...m.buildings,
    ...m.buildingUpgrades, ...m.provisions, ...m.darkestDungeonQuests, ...m.guardians, ...m.finalForms,
  ].filter((e) => e.runtimeReadiness === 'official-ready');

  for (const e of officialEntries) {
    const found: Array<{ id: string; detail: string }> = [];
    collectPrototypeIds(e, `manifest:${e.category}:${e.id}`, found);
    if (found.length > 0) {
      for (const f of found) {
        findings.push({ surface: `official-pool:${e.category}`, id: f.id, detail: f.detail });
      }
    }
  }

  // Specific known official surfaces that must not carry prototype IDs.
  const surfaces: Array<[string, unknown]> = [
    ['official-trinket-pool', m.trinkets.filter((t) => t.runtimeReadiness === 'official-ready')],
    ['official-final-forms', m.finalForms.filter((f) => f.runtimeReadiness === 'official-ready')],
    ['official-guardians', m.guardians.filter((g) => g.runtimeReadiness === 'official-ready')],
    ['official-darkest-dungeon-quests', m.darkestDungeonQuests.filter((q) => q.runtimeReadiness === 'official-ready')],
  ];
  for (const [surface, data] of surfaces) {
    const found: Array<{ id: string; detail: string }> = [];
    collectPrototypeIds(data, surface, found);
    for (const f of found) findings.push({ surface, id: f.id, detail: f.detail });
  }

  return findings;
}
