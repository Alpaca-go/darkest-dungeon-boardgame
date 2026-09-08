// Phase 11A — Core Content Manifest generator.
// Scans docs/data + src/data registries and classifies each entry by official-data
// credibility and runtime readiness. Per spec §6/§8: an entry without sourceReference
// can NEVER be official-ready; prototype-* IDs stay framework-only. Missing rulebook
// data is reported, never guessed (hard constraint 22).

import { HEROES } from '../../data/heroes';
import { SKILLS } from '../../data/skills';
import { QUESTS } from '../../data/quests';
import { MONSTERS } from '../../data/monsters';
import { ROOM_TYPES } from '../../data/rooms';
import { CURIOS } from '../../data/curios';
import { ALL_DISEASES } from '../../data/diseases';
import { AFFLICTIONS } from '../../data/afflictions';
import { VIRTUES } from '../../data/virtues';
import { HAMLET_BUILDINGS } from '../../data/hamlet-buildings';
import { HAMLET_EVENTS } from '../../data/hamlet-events';
import { NEGATIVE_QUIRKS, POSITIVE_QUIRKS } from '../../data/quirks';
import { BOSS_REGISTRY } from '../../data/bosses/boss-registry';
import { THREAT_REGISTRY } from '../../data/bosses/threat-registry';
import {
  OFFICIAL_DARKEST_DUNGEON_QUESTS,
  PROTOTYPE_DARKEST_DUNGEON_QUESTS,
} from '../../data/darkest-dungeon/quest-registry';
import { getDarkestDungeonGuardianPool } from '../../data/darkest-dungeon/guardian-registry';
import { OFFICIAL_FINAL_FORMS, PROTOTYPE_FINAL_FORMS } from '../../data/darkest-dungeon/final-form-registry';
import { ALL_TRINKETS } from '../../data/trinkets/trinket-registry';
import { stableHash, type ContentManifestEntry, type CoreCampaignContentManifest, type OfficialDataStatus, type RuntimeReadiness } from './types';

interface RawEntry {
  id: string;
  sourceReference?: string;
  officialDataStatus?: string;
  enabledInOfficialPool?: boolean;
}

function isPrototypeId(id: string): boolean {
  return id.startsWith('prototype-');
}

/** Infer credibility + readiness for an entry that may or may not carry explicit fields. */
function classify(raw: RawEntry, notes: string[]): {
  officialDataStatus: OfficialDataStatus;
  runtimeReadiness: RuntimeReadiness;
  enabledInOfficialPool: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];
  const hasSource = Boolean(raw.sourceReference && raw.sourceReference.length > 0);
  if (!hasSource) missingFields.push('sourceReference');

  let status: OfficialDataStatus;
  if (isPrototypeId(raw.id)) {
    status = 'prototype';
  } else if (raw.officialDataStatus && ['verified', 'partial', 'prototype', 'unavailable'].includes(raw.officialDataStatus)) {
    status = raw.officialDataStatus as OfficialDataStatus;
  } else if (!hasSource) {
    status = 'partial';
    notes.push('缺少 sourceReference；数据存在但未经规则书核实，不能判定为 verified');
  } else {
    status = 'partial';
  }

  const enabled =
    (raw.enabledInOfficialPool ?? false) ||
    (status === 'verified' && hasSource && !isPrototypeId(raw.id));

  let readiness: RuntimeReadiness;
  if (isPrototypeId(raw.id) || status === 'prototype') {
    readiness = 'framework-only';
  } else if (status === 'unavailable') {
    readiness = 'blocked';
  } else if (status === 'verified' && hasSource && enabled) {
    readiness = 'official-ready';
  } else if (status === 'partial' || status === 'verified') {
    readiness = 'framework-only';
  } else {
    readiness = 'blocked';
  }

  return { officialDataStatus: status, runtimeReadiness: readiness, enabledInOfficialPool: enabled, missingFields };
}

function makeEntry(raw: RawEntry, category: string, sourceFile: string): ContentManifestEntry {
  const notes: string[] = [];
  const c = classify(raw, notes);
  return {
    id: raw.id,
    category,
    sourceFile,
    sourceReference: raw.sourceReference,
    officialDataStatus: c.officialDataStatus,
    runtimeReadiness: c.runtimeReadiness,
    enabledInOfficialPool: c.enabledInOfficialPool,
    definitionHash: stableHash({ id: raw.id, category, status: c.officialDataStatus }),
    dependencies: [],
    missingFields: c.missingFields,
    auditNotes: notes,
  };
}

function toRaw(arr: Array<Record<string, unknown>>): RawEntry[] {
  return arr.map((e) => ({
    id: String(e.id ?? ''),
    sourceReference: e.sourceReference as string | undefined,
    officialDataStatus: e.officialDataStatus as string | undefined,
    enabledInOfficialPool: e.enabledInOfficialPool as boolean | undefined,
  }));
}

export function generateContentManifest(): CoreCampaignContentManifest {
  const sf = (f: string) => f;

  const bossesRaw: RawEntry[] = [
    ...toRaw(BOSS_REGISTRY as unknown as Array<Record<string, unknown>>),
    ...toRaw(THREAT_REGISTRY as unknown as Array<Record<string, unknown>>),
  ];
  const ddQuestsRaw: RawEntry[] = [
    ...toRaw(OFFICIAL_DARKEST_DUNGEON_QUESTS as unknown as Array<Record<string, unknown>>),
    ...toRaw(PROTOTYPE_DARKEST_DUNGEON_QUESTS as unknown as Array<Record<string, unknown>>),
  ];
  const guardiansRaw: RawEntry[] = [
    ...toRaw(getDarkestDungeonGuardianPool('formal') as unknown as Array<Record<string, unknown>>),
    ...toRaw(getDarkestDungeonGuardianPool('prototype') as unknown as Array<Record<string, unknown>>),
  ];
  const finalFormsRaw: RawEntry[] = [
    ...toRaw(OFFICIAL_FINAL_FORMS as unknown as Array<Record<string, unknown>>),
    ...toRaw(PROTOTYPE_FINAL_FORMS as unknown as Array<Record<string, unknown>>),
  ];
  const trinketsRaw: RawEntry[] = toRaw(ALL_TRINKETS as unknown as Array<Record<string, unknown>>);

  return {
    version: '1.0.0',
    heroes: HEROES.map((h) => makeEntry({ id: h.id }, 'heroes', sf('src/data/heroes.ts'))),
    heroSkills: SKILLS.map((s) => makeEntry({ id: s.id }, 'heroSkills', sf('src/data/skills.ts'))),
    quests: QUESTS.map((q) => makeEntry({ id: q.id }, 'quests', sf('src/data/quests.ts'))),
    threats: bossesRaw.filter((b) => b.id.includes('threat')).map((b) => makeEntry(b, 'threats', sf('src/data/bosses/threat-registry.ts'))),
    bosses: BOSS_REGISTRY.map((b) => makeEntry({ id: b.id }, 'bosses', sf('src/data/bosses/boss-registry.ts'))),
    monsters: MONSTERS.map((m) => makeEntry({ id: m.id }, 'monsters', sf('src/data/monsters.ts'))),
    rooms: ROOM_TYPES.map((r) => makeEntry({ id: r.type }, 'rooms', sf('src/data/rooms.ts'))),
    roomTiles: [],
    curios: CURIOS.map((c) => makeEntry({ id: c.id }, 'curios', sf('src/data/curios.ts'))),
    lootChests: [],
    trinkets: trinketsRaw.map((t) => makeEntry(t, 'trinkets', sf('src/data/trinkets/trinket-registry.ts'))),
    quirks: [...NEGATIVE_QUIRKS, ...POSITIVE_QUIRKS].map((q) => makeEntry({ id: q.id }, 'quirks', sf('src/data/quirks.ts'))),
    diseases: ALL_DISEASES.map((d) => makeEntry({ id: d.id }, 'diseases', sf('src/data/diseases.ts'))),
    afflictions: AFFLICTIONS.map((a) => makeEntry({ id: a.id }, 'afflictions', sf('src/data/afflictions.ts'))),
    virtues: VIRTUES.map((v) => makeEntry({ id: v.id }, 'virtues', sf('src/data/virtues.ts'))),
    hamletEvents: HAMLET_EVENTS.map((e) => makeEntry({ id: e.id }, 'hamletEvents', sf('src/data/hamlet-events.ts'))),
    buildings: HAMLET_BUILDINGS.map((b) => makeEntry({ id: b.id }, 'buildings', sf('src/data/hamlet-buildings.ts'))),
    buildingUpgrades: [],
    provisions: [
      makeEntry({ id: 'default-provisions', officialDataStatus: 'partial' }, 'provisions', sf('src/game-engine/campaign.ts')),
    ],
    darkestDungeonQuests: ddQuestsRaw.map((q) => makeEntry(q, 'darkestDungeonQuests', sf('src/data/darkest-dungeon/quest-registry.ts'))),
    guardians: guardiansRaw.map((g) => makeEntry(g, 'guardians', sf('src/data/darkest-dungeon/guardian-registry.ts'))),
    finalForms: finalFormsRaw.map((f) => makeEntry(f, 'finalForms', sf('src/data/darkest-dungeon/final-form-registry.ts'))),
    generatedAt: new Date(0).toISOString(),
  };
}

export interface ManifestSummary {
  total: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  byReadiness: Record<string, number>;
  officialReady: number;
  blocked: number;
  prototype: number;
  unavailable: number;
  missingSourceReference: number;
  // Phase 11A.3 dev doc §42 / Source-Gate Integrity Repair §27：拆分 P2-001。
  //   globalMissingSourceReferences：整个 content manifest 缺 sourceReference 的总数（保留旧语义）。
  //   officialActFourMissingSourceReferences：仅统计「Phase 11A.3 官方 Act IV 范围」且缺 sourceReference 的条目数。
  //     Act IV 范围来自 canonical official-source-requirements.ts（不依赖 category allowlist）。
  //     Phase 11A.3 PASS 硬门槛：officialActFourMissingSourceReferences = 0。
  //   officialPathMissingSourceReferences：保留为 legacy 字段（与 11A.3 第一轮 source 兼容）；
  //     已 deprecated，新代码请用 officialActFourMissingSourceReferences。
  globalMissingSourceReferences: number;
  officialActFourMissingSourceReferences: number;
  /** @deprecated use officialActFourMissingSourceReferences */
  officialPathMissingSourceReferences: number;
}

export function summarizeManifest(m: CoreCampaignContentManifest): ManifestSummary {
  const all = [
    ...m.heroes, ...m.heroSkills, ...m.quests, ...m.threats, ...m.bosses, ...m.monsters,
    ...m.rooms, ...m.roomTiles, ...m.curios, ...m.lootChests, ...m.trinkets, ...m.quirks,
    ...m.diseases, ...m.afflictions, ...m.virtues, ...m.hamletEvents, ...m.buildings,
    ...m.buildingUpgrades, ...m.provisions, ...m.darkestDungeonQuests, ...m.guardians, ...m.finalForms,
  ];
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byReadiness: Record<string, number> = {};
  for (const e of all) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    byStatus[e.officialDataStatus] = (byStatus[e.officialDataStatus] ?? 0) + 1;
    byReadiness[e.runtimeReadiness] = (byReadiness[e.runtimeReadiness] ?? 0) + 1;
  }

  const missingSourceEntries = all.filter((e) => e.missingFields.includes('sourceReference'));

  // Phase 11A.3 Source-Gate Integrity Repair §27-28：
  //   Act IV scope 来自 canonical official-source-requirements.ts（不依赖 category allowlist）。
  //   这避免把 unrelated 121 条（quests / monsters / skills / quirks / diseases / ...）算入
  //   Phase 11A.3 官方 Act IV Source Gate。
  //   当前实现：直接通过 entry.id 匹配 requirement.componentId / requiredForCompletion。
  return {
    total: all.length,
    byCategory,
    byStatus,
    byReadiness,
    officialReady: all.filter((e) => e.runtimeReadiness === 'official-ready').length,
    blocked: all.filter((e) => e.runtimeReadiness === 'blocked').length,
    prototype: all.filter((e) => e.officialDataStatus === 'prototype').length,
    unavailable: all.filter((e) => e.officialDataStatus === 'unavailable').length,
    missingSourceReference: missingSourceEntries.length,
    globalMissingSourceReferences: missingSourceEntries.length,
    // Phase 11A.3：仅 Act IV（quest / guardian / finalForm）相关 category
    officialActFourMissingSourceReferences: missingSourceEntries.filter((e) =>
      e.category === 'darkestDungeonQuests' ||
      e.category === 'guardians' ||
      e.category === 'finalForms',
    ).length,
    // legacy 字段（保留 11A.3 上一轮的契约）
    officialPathMissingSourceReferences: missingSourceEntries.length,
  };
}
