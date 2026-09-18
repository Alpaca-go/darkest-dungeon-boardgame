/**
 * Phase 11A.4R2 WP-14 / Phase 11A.4R2A WP-3：Community Final skill coverage contract.
 *
 * 关闭 FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED 的条件：
 * requiredSourceInventory === implemented === productionTested，且 helper-direct = 0。
 * source-blocked 叶子不得计入 covered。
 *
 * R2A 强化（WP-3）：
 * 删除 `productionTestId.startsWith("P-final-") = production tested` 的错误逻辑。
 * Coverage contract 解析对应 test body，每个 source-complete leaf 的 production test
 * body 必须实际包含 `runCommunityFinalFormTurn(` 真实 Final production seam，
 * 且包含对 turn result 的语义断言。以下内容单独出现时不构成 production proof：
 *   - COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.find(...) 等 metadata-only 断言
 *   - selectionRule.toContain(...)
 *   - helper direct call
 * 同时每个 leaf 必须绑定真实 save/replay proof（reload + production seam）。
 */
import { COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY } from './community-final-skill-source-inventory';

export type CommunityFinalSkillProductionEntry = 'final-form-turn';

export interface CommunityFinalSkillCoverageEntry {
  formId: string;
  actorId: string;
  localSkillId: string;
  sourceReference: string;
  sourceComplete: boolean;
  runtimeImplementation: string;
  productionEntryType: CommunityFinalSkillProductionEntry;
  productionTestId: string;
  saveReplayProofId: string;
}

/**
 * WP-18 save/replay 绑定：
 * FR-SR-13 Puncture / FR-SR-14 Dissolution / FR-SR-15 It Chooses Mark+Debuff /
 * FR-SR-17 多目标 Know This / FR-SR-18 Reflection turn（Reunion / We Are the Same）。
 */
const SAVE_REPLAY_PROOF_BY_LEAF: Record<string, string> = {
  'ancestor-first-form.perfect-replication': 'FR-SR-03',
  'ancestor-first-form.imperfect-reproduction': 'FR-SR-03',
  'ancestor-first-form.time-heals-all': 'FR-SR-04',
  'perfect-reflection.reunion': 'FR-SR-18',
  'perfect-reflection.we-are-the-same': 'FR-SR-18',
  'imperfect-reflection.it-chooses': 'FR-SR-15',
  'imperfect-reflection.we-are-the-same': 'FR-SR-18',
  'ancestor-second-form.refashion-them': 'FR-SR-06',
  'ancestor-second-form.unmake-them-all': 'FR-SR-06',
  'ancestor-second-form.embrace-futility': 'FR-SR-06',
  'gestating-heart.dispersion': 'FR-SR-07',
  'heart-of-darkness.know-this': 'FR-SR-17',
  'heart-of-darkness.puncture': 'FR-SR-13',
  'heart-of-darkness.dissolution': 'FR-SR-14',
};

export const COMMUNITY_FINAL_SKILL_COVERAGE: readonly CommunityFinalSkillCoverageEntry[] = COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.map((leaf) => ({
  formId: leaf.formId,
  actorId: leaf.actorId,
  localSkillId: leaf.localSkillId,
  sourceReference: leaf.sourceReference,
  sourceComplete: leaf.sourceCompleteness === 'source-complete',
  runtimeImplementation: 'runCommunityFinalFormTurn',
  productionEntryType: 'final-form-turn',
  productionTestId: `P-final-${leaf.actorId}-${leaf.localSkillId}`,
  saveReplayProofId: SAVE_REPLAY_PROOF_BY_LEAF[`${leaf.actorId}.${leaf.localSkillId}`] ?? 'FR-SR-UNMAPPED',
}));

export interface CommunityFinalSkillCoverageFiles {
  productionTestFile: string;
  saveReplayTestFile: string;
}

/**
 * 从测试文件文本中提取标题包含 testId 的 it(...) 的 body。
 * 括号匹配会跳过字符串 / 模板字符串 / 行注释，避免被 body 内的括号干扰。
 */
export function extractTestBody(fileText: string, testId: string): string | null {
  const titleIndex = fileText.indexOf(testId);
  if (titleIndex < 0) return null;
  const openIndex = fileText.indexOf('{', titleIndex);
  if (openIndex < 0) return null;
  let depth = 0;
  let i = openIndex;
  while (i < fileText.length) {
    const ch = fileText[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < fileText.length && fileText[i] !== quote) {
        if (fileText[i] === '\\') i += 1;
        i += 1;
      }
    } else if (ch === '/' && fileText[i + 1] === '/') {
      while (i < fileText.length && fileText[i] !== '\n') i += 1;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return fileText.slice(openIndex, i + 1);
    }
    i += 1;
  }
  return null;
}

/** metadata-only 断言不得单独作为 production proof。 */
const FORBIDDEN_PROOF_PATTERNS = [
  'COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY',
  'selectionRule).toContain',
  'selectionRule.toContain',
  'helper-direct',
  'performXXXHelper',
];

export interface CommunityFinalSkillLeafProof {
  key: string;
  productionTestId: string;
  saveReplayProofId: string;
  productionBodyFound: boolean;
  productionSeamPresent: boolean;
  productionSemanticAssertionPresent: boolean;
  productionMetadataOnly: boolean;
  saveReplayBodyFound: boolean;
  saveReplayReloadPresent: boolean;
  saveReplaySeamPresent: boolean;
  proven: boolean;
}

export function communityFinalSkillLeafProof(
  entry: CommunityFinalSkillCoverageEntry,
  files: CommunityFinalSkillCoverageFiles,
): CommunityFinalSkillLeafProof {
  const productionBody = extractTestBody(files.productionTestFile, entry.productionTestId);
  const saveReplayBody = extractTestBody(files.saveReplayTestFile, entry.saveReplayProofId);
  const productionSeamPresent = productionBody !== null && productionBody.includes('runCommunityFinalFormTurn(');
  const productionSemanticAssertionPresent = productionBody !== null
    && /expect\([\s\S]*?\bresult\b/.test(productionBody);
  const productionMetadataOnly = productionBody !== null
    && FORBIDDEN_PROOF_PATTERNS.some((pattern) => productionBody.includes(pattern));
  const saveReplayReloadPresent = saveReplayBody !== null && saveReplayBody.includes('reload(');
  const saveReplaySeamPresent = saveReplayBody !== null && saveReplayBody.includes('runCommunityFinalFormTurn(');
  const proven = productionBody !== null
    && productionSeamPresent
    && productionSemanticAssertionPresent
    && !productionMetadataOnly
    && saveReplayBody !== null
    && saveReplayReloadPresent
    && saveReplaySeamPresent;
  return {
    key: `${entry.actorId}:${entry.localSkillId}`,
    productionTestId: entry.productionTestId,
    saveReplayProofId: entry.saveReplayProofId,
    productionBodyFound: productionBody !== null,
    productionSeamPresent,
    productionSemanticAssertionPresent,
    productionMetadataOnly,
    saveReplayBodyFound: saveReplayBody !== null,
    saveReplayReloadPresent,
    saveReplaySeamPresent,
    proven,
  };
}

export function communityFinalSkillCoverageReport(files: CommunityFinalSkillCoverageFiles) {
  const required = COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY
    .filter((leaf) => leaf.sourceCompleteness === 'source-complete')
    .map((leaf) => `${leaf.actorId}:${leaf.localSkillId}`)
    .sort();
  const implemented = COMMUNITY_FINAL_SKILL_COVERAGE
    .filter((entry) => entry.sourceComplete && entry.runtimeImplementation === 'runCommunityFinalFormTurn')
    .map((entry) => `${entry.actorId}:${entry.localSkillId}`)
    .sort();
  const proofs = COMMUNITY_FINAL_SKILL_COVERAGE
    .filter((entry) => entry.sourceComplete)
    .map((entry) => communityFinalSkillLeafProof(entry, files));
  const productionTested = proofs.filter((proof) => proof.proven).map((proof) => proof.key).sort();
  const missingProofs = proofs.filter((proof) => !proof.proven);
  const helperDirect = COMMUNITY_FINAL_SKILL_COVERAGE.filter((entry) => (entry.productionEntryType as string) === 'helper-direct');
  const uncoveredSource = COMMUNITY_FINAL_SKILL_COVERAGE.filter((entry) => !entry.sourceComplete);
  return {
    required,
    implemented,
    productionTested,
    proofs,
    missingProofs,
    helperDirect,
    uncoveredSource,
    equal:
      JSON.stringify(required) === JSON.stringify(implemented)
      && JSON.stringify(required) === JSON.stringify(productionTested)
      && helperDirect.length === 0
      && uncoveredSource.length === 0,
  };
}
