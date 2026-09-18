/**
 * Phase 11A.4R2A WP-2：Source Inventory 必须从独立 Evidence 校验。
 *
 * community-final-skill-source-inventory.ts 不得自证正确。
 * 本测试将独立 source artifact
 *   docs/data/darkest-dungeon/community-reference/community-final-skill-source-evidence.json
 * 与 runtime source inventory 逐 leaf、逐字段比较。
 *
 * 同时校验 evidence 自身绑定真实来源：
 *   - assetSha256 与 vendored 卡面文件实际 sha256 一致；
 *   - sourceGuid / cardId / cardIndex 与 accepted source-reference-index 一致；
 *   - 禁止 Prototype 作为 source truth。
 *
 * 任何字段不能由现有 source 独立证明时，本测试失败 ——
 * 对应 leaf 必须标记 source-blocked 并保持 FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED，
 * 不得为了全部绿色而手填。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_FINAL_ACTOR_SOURCE_STATS,
  COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY,
  type CommunityFinalSkillSourceLeaf,
} from './community-final-skill-source-inventory';

interface EvidenceLeaf {
  formId: string;
  actorId: string;
  localSkillId: string;
  printedName: string;
  printedNumber: number;
  selectionRule: string;
  accuracy: number | null;
  damage: number | null;
  crit: { threshold: number; damage: number } | null;
  targetPolicy: string;
  range: string;
  multiTargetCount: number;
  attack: boolean;
  statusStressEffects: string[];
  specialEffect: string;
  sourceGuid: string;
  cardId: number;
  cardIndex: number;
  assetPath: string;
  assetSha256: string;
  rulebookPage: number | null;
  extractionStatus: string;
}

interface EvidenceArtifact {
  schemaVersion: string;
  sources: { prototypeUsedAsSource: boolean };
  cards: Record<
    string,
    { sourceGuid: string; cardId: number; cardIndex: number; assetPath: string; assetSha256: string }
  >;
  actors: Array<{ actorId: string; card: string; printedSpeed: number; extractionStatus: string }>;
  leaves: EvidenceLeaf[];
}

const evidence = JSON.parse(
  readFileSync(
    'docs/data/darkest-dungeon/community-reference/community-final-skill-source-evidence.json',
    'utf8',
  ),
) as EvidenceArtifact;

const sourceReferenceIndex = JSON.parse(
  readFileSync(
    'docs/data/darkest-dungeon/community-reference/antha-complete-edition/source-reference-index.json',
    'utf8',
  ),
) as { entries: { key: string; kind: string; detail: { guid?: string; cardId?: number; customDeck?: { cardIndex?: number } } }[] };

const sha256Of = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

const leafKey = (leaf: { actorId: string; localSkillId: string }) => `${leaf.actorId}.${leaf.localSkillId}`;

describe('Community Final skill source evidence binding (WP-1/WP-2)', () => {
  it('evidence artifact never uses Prototype as source truth', () => {
    expect(evidence.sources.prototypeUsedAsSource).toBe(false);
  });

  it('every evidence card asset exists on disk and matches its recorded sha256', () => {
    for (const [cardKey, card] of Object.entries(evidence.cards)) {
      expect(sha256Of(card.assetPath), `card ${cardKey} asset sha256`).toBe(card.assetSha256);
    }
  });

  it('every evidence card provenance matches the accepted source-reference-index', () => {
    for (const [cardKey, card] of Object.entries(evidence.cards)) {
      const entry = sourceReferenceIndex.entries.find(
        (candidate) => candidate.key === `asset:${card.sourceGuid}:face`,
      );
      expect(entry, `card ${cardKey} source-reference-index entry asset:${card.sourceGuid}:face`).toBeDefined();
      expect(entry!.detail.cardId, `card ${cardKey} cardId`).toBe(card.cardId);
      expect(entry!.detail.customDeck?.cardIndex, `card ${cardKey} cardIndex`).toBe(card.cardIndex);
    }
  });

  it('every evidence leaf provenance matches its card provenance', () => {
    for (const leaf of evidence.leaves) {
      const card = evidence.cards[leaf.actorId];
      expect(card, `leaf ${leafKey(leaf)} card provenance`).toBeDefined();
      expect(leaf.sourceGuid, `leaf ${leafKey(leaf)} sourceGuid`).toBe(card.sourceGuid);
      expect(leaf.cardId, `leaf ${leafKey(leaf)} cardId`).toBe(card.cardId);
      expect(leaf.cardIndex, `leaf ${leafKey(leaf)} cardIndex`).toBe(card.cardIndex);
      expect(leaf.assetPath, `leaf ${leafKey(leaf)} assetPath`).toBe(card.assetPath);
      expect(leaf.assetSha256, `leaf ${leafKey(leaf)} assetSha256`).toBe(card.assetSha256);
    }
  });

  it('sourceEvidence === runtimeSourceInventory leaf set (no missing, no extra)', () => {
    const evidenceKeys = evidence.leaves.map(leafKey).sort();
    const inventoryKeys = COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.map(leafKey).sort();
    expect(inventoryKeys).toEqual(evidenceKeys);
  });

  it('sourceEvidence === runtimeSourceInventory per leaf per field', () => {
    const mismatches: string[] = [];
    const compareField = (
      key: string,
      field: string,
      inventoryValue: unknown,
      evidenceValue: unknown,
    ) => {
      if (JSON.stringify(inventoryValue) !== JSON.stringify(evidenceValue)) {
        mismatches.push(
          `${key}.${field}: inventory=${JSON.stringify(inventoryValue)} evidence=${JSON.stringify(evidenceValue)}`,
        );
      }
    };

    for (const inventoryLeaf of COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY) {
      const key = leafKey(inventoryLeaf);
      const evidenceLeaf = evidence.leaves.find((candidate) => leafKey(candidate) === key);
      if (!evidenceLeaf) {
        mismatches.push(`${key}: no independent evidence leaf`);
        continue;
      }
      compareField(key, 'formId', inventoryLeaf.formId, evidenceLeaf.formId);
      compareField(key, 'printedSkill', inventoryLeaf.printedSkill, evidenceLeaf.printedName);
      compareField(key, 'printedNumber', inventoryLeaf.printedNumber, evidenceLeaf.printedNumber);
      compareField(key, 'selectionRule', inventoryLeaf.selectionRule, evidenceLeaf.selectionRule);
      compareField(key, 'accuracy', inventoryLeaf.accuracy, evidenceLeaf.accuracy);
      compareField(key, 'damage', inventoryLeaf.damage, evidenceLeaf.damage);
      compareField(key, 'crit', inventoryLeaf.crit, evidenceLeaf.crit);
      compareField(key, 'targetPolicy', inventoryLeaf.targetPolicy, evidenceLeaf.targetPolicy);
      compareField(key, 'range', inventoryLeaf.range, evidenceLeaf.range);
      compareField(key, 'multiTargetCount', inventoryLeaf.multiTargetCount, evidenceLeaf.multiTargetCount);
      compareField(key, 'attack', inventoryLeaf.attack, evidenceLeaf.attack);
      compareField(key, 'statusStressEffects', inventoryLeaf.statusStressEffects, evidenceLeaf.statusStressEffects);
      compareField(key, 'specialEffect', inventoryLeaf.specialEffect, evidenceLeaf.specialEffect);
    }

    expect(mismatches).toEqual([]);
  });

  it('every inventory leaf sourceReference binds the evidenced card asset path', () => {
    for (const inventoryLeaf of COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY) {
      const evidenceLeaf = evidence.leaves.find((candidate) => leafKey(candidate) === leafKey(inventoryLeaf));
      expect(evidenceLeaf, `leaf ${leafKey(inventoryLeaf)} evidence`).toBeDefined();
      expect(
        inventoryLeaf.sourceReference,
        `leaf ${leafKey(inventoryLeaf)} sourceReference must bind the evidenced asset`,
      ).toContain(evidenceLeaf!.assetPath);
    }
  });

  it('evidence leaves carry extraction provenance (rulebook page or explicit card-only extraction)', () => {
    for (const leaf of evidence.leaves) {
      expect(leaf.extractionStatus.length, `leaf ${leafKey(leaf)} extractionStatus`).toBeGreaterThan(0);
      expect(leaf.extractionStatus, `leaf ${leafKey(leaf)} extractionStatus`).toContain('verified');
    }
  });

  it('actor source stats (printed Speed) bind the evidence actors section', () => {
    expect(COMMUNITY_FINAL_ACTOR_SOURCE_STATS.map((stats) => stats.actorId).sort()).toEqual(
      evidence.actors.map((actor) => actor.actorId).sort(),
    );
    for (const stats of COMMUNITY_FINAL_ACTOR_SOURCE_STATS) {
      const evidenceActor = evidence.actors.find((actor) => actor.actorId === stats.actorId);
      expect(evidenceActor, `actor ${stats.actorId} evidence`).toBeDefined();
      expect(stats.printedSpeed, `actor ${stats.actorId} printedSpeed`).toBe(evidenceActor!.printedSpeed);
      const card = evidence.cards[evidenceActor!.card];
      expect(card, `actor ${stats.actorId} card`).toBeDefined();
      expect(stats.sourceReference, `actor ${stats.actorId} sourceReference`).toBe(card.assetPath);
    }
  });
});

// 类型锚定：确保 evidence leaf 字段覆盖 inventory leaf 的全部语义字段。
const _typeAnchor: (leaf: CommunityFinalSkillSourceLeaf) => readonly string[] = (leaf) => [
  leaf.localSkillId,
  leaf.printedSkill,
  leaf.selectionRule,
  leaf.range,
  leaf.specialEffect,
  ...leaf.statusStressEffects,
];
void _typeAnchor;
