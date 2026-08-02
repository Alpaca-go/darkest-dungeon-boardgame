// Phase 11A — Global ID / Reference validation (spec §11) + Campaign Transition
// validation (spec §12).
//
// 对整个内容图做三类检查：
//   1. DUP_ID        —— 全局 ID 唯一性（跨 Registry）
//   2. DANGLING_REF  —— 引用指向不存在的 ID
//   3. ILLEGAL_TRANS —— 非法战役状态跃迁
// 任何 error 级 issue 都会阻断 official boot（Release Gate 判据）。

import type { CampaignState } from '../../types';
import { HEROES } from '../../data/heroes';
import { SKILLS } from '../../data/skills';
import { QUESTS } from '../../data/quests';
import { MONSTERS } from '../../data/monsters';
import { MONSTER_SKILLS } from '../../data/monster-skills';
import { CURIOS } from '../../data/curios';
import { ALL_DISEASES } from '../../data/diseases';
import { AFFLICTIONS } from '../../data/afflictions';
import { VIRTUES } from '../../data/virtues';
import { HAMLET_BUILDINGS } from '../../data/hamlet-buildings';
import { HAMLET_EVENTS } from '../../data/hamlet-events';
import { NEGATIVE_QUIRKS, POSITIVE_QUIRKS } from '../../data/quirks';
import { BOSS_REGISTRY } from '../../data/bosses/boss-registry';
import { THREAT_REGISTRY } from '../../data/bosses/threat-registry';
import { getDarkestDungeonGuardianPool } from '../../data/darkest-dungeon/guardian-registry';
import {
  OFFICIAL_DARKEST_DUNGEON_QUESTS,
  PROTOTYPE_DARKEST_DUNGEON_QUESTS,
} from '../../data/darkest-dungeon/quest-registry';
import {
  FINAL_FORM_ORDER,
  OFFICIAL_FINAL_FORMS,
  PROTOTYPE_FINAL_FORMS,
  SKIPPABLE_FINAL_FORM_IDS,
  UNSKIPPABLE_FINAL_FORM_ID,
} from '../../data/darkest-dungeon/final-form-registry';
import { ALL_TRINKETS } from '../../data/trinkets/trinket-registry';
import { stableHash, type ReferenceValidationIssue } from './types';

// ---------------------------------------------------------------------------
// 1 + 2：全局 ID 与引用完整性
// ---------------------------------------------------------------------------

export function validateCoreContentReferences(): ReferenceValidationIssue[] {
  const issues: ReferenceValidationIssue[] = [];
  const idIndex = new Map<string, string>();

  const record = (id: string, where: string) => {
    if (!id) {
      issues.push({ code: 'EMPTY_ID', severity: 'error', message: `Empty id found in ${where}`, context: where });
      return;
    }
    const prev = idIndex.get(id);
    if (prev) {
      issues.push({
        code: 'DUP_ID',
        severity: 'error',
        message: `Duplicate global ID "${id}" (${prev} vs ${where})`,
        context: where,
      });
    } else {
      idIndex.set(id, where);
    }
  };

  // ---- Registries → global id index ----
  HEROES.forEach((h) => record(h.id, 'heroes'));
  SKILLS.forEach((s) => record(s.id, 'skills'));
  QUESTS.forEach((q) => record(q.id, 'quests'));
  MONSTERS.forEach((m) => record(m.id, 'monsters'));
  MONSTER_SKILLS.forEach((s) => record(s.id, 'monster-skills'));
  CURIOS.forEach((c) => record(c.id, 'curios'));
  ALL_DISEASES.forEach((d) => record(d.id, 'diseases'));
  AFFLICTIONS.forEach((a) => record(a.id, 'afflictions'));
  VIRTUES.forEach((v) => record(v.id, 'virtues'));
  HAMLET_BUILDINGS.forEach((b) => record(b.id, 'hamlet-buildings'));
  HAMLET_EVENTS.forEach((e) => record(e.id, 'hamlet-events'));
  [...NEGATIVE_QUIRKS, ...POSITIVE_QUIRKS].forEach((q) => record(q.id, 'quirks'));
  BOSS_REGISTRY.forEach((b) => record(b.id, 'boss-registry'));
  THREAT_REGISTRY.forEach((t) => record(t.id, 'threat-registry'));
  ALL_TRINKETS.forEach((t) => record(t.id, 'trinket-registry'));
  [...getDarkestDungeonGuardianPool('formal'), ...getDarkestDungeonGuardianPool('prototype')].forEach((g) =>
    record(g.id, 'guardian-registry'),
  );
  [...OFFICIAL_DARKEST_DUNGEON_QUESTS, ...PROTOTYPE_DARKEST_DUNGEON_QUESTS].forEach((q) =>
    record(q.id, 'darkest-dungeon-quest-registry'),
  );
  [...OFFICIAL_FINAL_FORMS, ...PROTOTYPE_FINAL_FORMS].forEach((f) => record(f.id, 'final-form-registry'));

  // ---- Dangling references ----
  const heroIds = new Set(HEROES.map((h) => h.id));
  const monsterSkillIds = new Set(MONSTER_SKILLS.map((s) => s.id));
  const monsterIds = new Set(MONSTERS.map((m) => m.id));

  for (const s of SKILLS) {
    if (!heroIds.has(s.heroId)) {
      issues.push({
        code: 'DANGLING_REF',
        severity: 'error',
        message: `Skill "${s.id}" references unknown heroId "${s.heroId}"`,
        context: 'skills',
      });
    }
  }

  for (const m of MONSTERS) {
    for (const sid of m.skillIds) {
      if (!monsterSkillIds.has(sid)) {
        issues.push({
          code: 'DANGLING_REF',
          severity: 'error',
          message: `Monster "${m.id}" references unknown skill "${sid}"`,
          context: 'monsters',
        });
      }
    }
    if (m.skillIds.length === 0) {
      issues.push({
        code: 'NO_SKILL',
        severity: 'warning',
        message: `Monster "${m.id}" has no skills`,
        context: 'monsters',
      });
    }
  }

  for (const s of MONSTER_SKILLS) {
    const owner = (s as unknown as { monsterId?: string }).monsterId;
    if (owner && !monsterIds.has(owner)) {
      issues.push({
        code: 'DANGLING_REF',
        severity: 'error',
        message: `Monster skill "${s.id}" references unknown monsterId "${owner}"`,
        context: 'monster-skills',
      });
    }
  }

  // Quest objective ids must be unique within a quest.
  for (const q of QUESTS) {
    const objIds = (q.objectives ?? []).map((o) => o.id);
    if (new Set(objIds).size !== objIds.length) {
      issues.push({
        code: 'DUP_OBJECTIVE_ID',
        severity: 'error',
        message: `Quest "${q.id}" has duplicate objective ids`,
        context: 'quests',
      });
    }
  }

  // Boss skills / summon rules must not reference unknown monsters.
  for (const b of BOSS_REGISTRY) {
    const skillIds = b.skills.map((s) => s.id);
    if (new Set(skillIds).size !== skillIds.length) {
      issues.push({
        code: 'DUP_BOSS_SKILL_ID',
        severity: 'error',
        message: `Boss "${b.id}" has duplicate skill ids`,
        context: 'boss-registry',
      });
    }
    for (const rule of b.summonRules ?? []) {
      const summonId = (rule as unknown as { monsterId?: string; minionId?: string }).monsterId
        ?? (rule as unknown as { minionId?: string }).minionId;
      if (summonId && !monsterIds.has(summonId) && !summonId.startsWith('prototype-')) {
        issues.push({
          code: 'DANGLING_REF',
          severity: 'warning',
          message: `Boss "${b.id}" summon rule references unknown monster "${summonId}"`,
          context: 'boss-registry',
        });
      }
    }
  }

  // ---- Final form structural rules (spec §12 / Phase 10E hard constraints) ----
  if (FINAL_FORM_ORDER.length !== 4) {
    issues.push({
      code: 'FORM_ORDER_LEN',
      severity: 'error',
      message: `FINAL_FORM_ORDER length ${FINAL_FORM_ORDER.length}, expected 4`,
      context: 'final-form-registry',
    });
  }
  if (FINAL_FORM_ORDER[FINAL_FORM_ORDER.length - 1] !== UNSKIPPABLE_FINAL_FORM_ID) {
    issues.push({
      code: 'HEART_NOT_LAST',
      severity: 'error',
      message: 'FINAL_FORM_ORDER must end with heart-of-darkness',
      context: 'final-form-registry',
    });
  }
  if (SKIPPABLE_FINAL_FORM_IDS.includes(UNSKIPPABLE_FINAL_FORM_ID as never)) {
    issues.push({
      code: 'HEART_SKIPPABLE',
      severity: 'error',
      message: 'heart-of-darkness must never be skippable',
      context: 'final-form-registry',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 3：战役状态跃迁合法性
// ---------------------------------------------------------------------------

export interface TransitionCheck {
  from: string;
  event: string;
  to: string;
  legal: boolean;
  reason?: string;
}

/** 官方核心盒战役的合法跃迁表（from, event, to）。 */
export const LEGAL_TRANSITIONS: Array<[string, string, string]> = [
  ['new-campaign', 'standard-quest-complete', 'act-1'],
  ['act-1', 'standard-quest-complete', 'act-1'],
  ['act-1', 'boss-quest-victory', 'act-2'],
  ['act-2', 'standard-quest-complete', 'act-2'],
  ['act-2', 'boss-quest-victory', 'act-3'],
  ['act-3', 'standard-quest-complete', 'act-3'],
  ['act-3', 'boss-quest-victory', 'post-third-threat-hamlet'],
  ['post-third-threat-hamlet', 'darkest-dungeon-unlock', 'act-4-guardian'],
  ['act-4-guardian', 'guardian-victory', 'final-hamlet'],
  ['final-hamlet', 'final-hamlet-days-complete', 'final-encounter'],
  ['final-encounter', 'form-defeated', 'final-encounter'],
  ['final-encounter', 'heart-defeated', 'campaign-victory'],
  // Failure edges (all terminal).
  ['act-1', 'boss-quest-failure', 'campaign-over'],
  ['act-2', 'boss-quest-failure', 'campaign-over'],
  ['act-3', 'boss-quest-failure', 'campaign-over'],
  ['act-4-guardian', 'guardian-failure', 'campaign-over'],
  ['final-encounter', 'party-wiped', 'campaign-over'],
  ['act-1', 'stagecoach-exhausted', 'campaign-over'],
  ['act-2', 'stagecoach-exhausted', 'campaign-over'],
  ['act-3', 'stagecoach-exhausted', 'campaign-over'],
];

/** 明确禁止的跃迁（即便结构上"看起来"可达）。 */
export const ILLEGAL_TRANSITIONS: Array<[string, string, string]> = [
  ['act-1', 'boss-quest-failure', 'hamlet'],
  ['act-2', 'boss-quest-failure', 'hamlet'],
  ['act-3', 'boss-quest-failure', 'hamlet'],
  ['act-4-guardian', 'guardian-failure', 'hamlet'],
  ['final-encounter', 'party-wiped', 'hamlet'],
  ['final-encounter', 'party-wiped', 'final-hamlet'],
  ['final-hamlet', 'hamlet-event-draw', 'final-hamlet'],
  ['final-encounter', 'dungeon-explore', 'final-encounter'],
  ['final-encounter', 'skipped-form-redraw', 'final-encounter'],
  ['campaign-victory', 'standard-quest-complete', 'act-1'],
  ['post-third-threat-hamlet', 'threat-draw', 'post-third-threat-hamlet'],
  ['post-third-threat-hamlet', 'standard-quest-grant', 'act-4-guardian'],
];

export function validateCampaignTransition(req: { from: string; event: string; to: string }): TransitionCheck {
  const explicitlyIllegal = ILLEGAL_TRANSITIONS.some(
    ([f, e, t]) => f === req.from && e === req.event && t === req.to,
  );
  if (explicitlyIllegal) {
    return { ...req, legal: false, reason: 'explicitly-illegal' };
  }
  const known = LEGAL_TRANSITIONS.some(([f, e, t]) => f === req.from && e === req.event && t === req.to);
  return { ...req, legal: known, reason: known ? undefined : 'not-in-legal-table' };
}

/** Validate a sequence of transitions; returns only the illegal ones. */
export function validateTransitionSequence(seq: Array<{ from: string; event: string; to: string }>): TransitionCheck[] {
  return seq.map(validateCampaignTransition).filter((r) => !r.legal);
}

/** Lightweight structural fingerprint used by the invariant runner / replay diff. */
export function campaignTransitionHash(c: CampaignState): string {
  return stableHash({
    phase: c.gamePhase,
    act: c.act,
    level: c.campaignLevel,
    quests: c.completedQuestCount,
    over: c.campaignOverReason,
  });
}
