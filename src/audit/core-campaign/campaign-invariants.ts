// Phase 11A — Campaign Invariants (spec §13).
//
// 在每次提交事务、Save、Load 之后运行；返回被违反的不变量列表，空数组 = 健康。
// 本模块是**纯只读**的：不修改任何状态、不产生随机、不触碰文件系统。

import type { CampaignState } from '../../types';
import { stableHashState, type ReferenceValidationIssue } from './types';

export interface InvariantFinding {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

function must(cond: boolean, code: string, message: string, out: InvariantFinding[]): void {
  if (!cond) out.push({ code, severity: 'error', message });
}

function warn(cond: boolean, code: string, message: string, out: InvariantFinding[]): void {
  if (!cond) out.push({ code, severity: 'warning', message });
}

/**
 * 核心战役不变量集合。覆盖 Party / Campaign / Dungeon / Hamlet / Final Encounter 五个域。
 */
export function assertCoreCampaignInvariants(c: CampaignState): InvariantFinding[] {
  const f: InvariantFinding[] = [];

  // ---------------- Party ----------------
  const instanceIds = c.heroes.map((h) => h.instanceId);
  must(c.heroes.length <= 4, 'PARTY_SIZE_MAX', `Active party size ${c.heroes.length} exceeds 4`, f);
  warn(
    c.heroes.length === 4 || isPartyFormationPhase(c) || c.campaignOverReason !== null,
    'PARTY_SIZE',
    `Active party size ${c.heroes.length}, expected 4 outside setup/replacement/campaign-over`,
    f,
  );
  must(new Set(instanceIds).size === instanceIds.length, 'DUP_ACTOR_ID', 'Duplicate hero instanceId in active party', f);

  // 语义澄清（审计早期误报，已修正）：
  //   killCampaignHero() 刻意**保留**阵亡英雄在 heroes 数组中占住 partySlot，
  //   并同时登记一个 ReplacementSlot；confirmReplacement() 才把该位置换成新英雄。
  //   因此「阵亡英雄仍在队伍里」是合法的过渡态，真正的不变量是
  //   ——每个阵亡英雄都必须被一个**未确认的替补槽位**覆盖（战役已结束时除外）。
  const deadInParty = c.heroes.filter((h) => h.dead);
  const pendingRepl = c.stagecoach?.pendingReplacement ?? null;
  const coveredDeadIds = new Set(
    pendingRepl && !pendingRepl.resolved
      ? pendingRepl.slots.filter((s) => !s.confirmed).map((s) => s.deadCampaignHeroId)
      : [],
  );
  const uncoveredDead = deadInParty.filter((h) => !coveredDeadIds.has(h.instanceId));
  must(
    uncoveredDead.length === 0 || c.gamePhase === 'campaign-over',
    'DEAD_IN_PARTY_UNCOVERED',
    `${uncoveredDead.length} 名阵亡英雄仍占据队伍槽位且没有对应的未确认替补槽位：` +
      `${uncoveredDead.map((h) => `${h.heroId}(${h.instanceId})`).join(', ')}`,
    f,
  );

  const overlap = c.heroes.filter((h) => c.waitingHeroIds.includes(h.heroId));
  must(
    overlap.length === 0,
    'STAGECOACH_PARTY_OVERLAP',
    `Hero(es) present in both active party and stagecoach: ${overlap.map((h) => h.heroId).join(', ')}`,
    f,
  );
  must(
    new Set(c.waitingHeroIds).size === c.waitingHeroIds.length,
    'DUP_STAGECOACH_ID',
    'Duplicate hero id in stagecoach roster',
    f,
  );

  const slots = c.heroes.map((h) => h.partySlot);
  must(new Set(slots).size === slots.length, 'DUP_PARTY_SLOT', `Duplicate party slot: [${slots.join(', ')}]`, f);
  for (const h of c.heroes) {
    must(h.level >= 1 && h.level <= 3, 'HERO_LEVEL_RANGE', `Hero ${h.heroId} level ${h.level} out of [1,3]`, f);
    must(h.xp >= 0, 'HERO_XP_NEG', `Hero ${h.heroId} xp ${h.xp} negative`, f);
    must(h.wounds >= 0, 'HERO_WOUNDS_NEG', `Hero ${h.heroId} wounds ${h.wounds} negative`, f);
    must(
      h.wounds <= h.maxLife,
      'HERO_WOUNDS_OVERFLOW',
      `Hero ${h.heroId} wounds ${h.wounds} exceeds maxLife ${h.maxLife}`,
      f,
    );
    must(h.stress >= 0, 'HERO_STRESS_NEG', `Hero ${h.heroId} stress ${h.stress} negative`, f);
    must(
      !(h.dead && h.isAlive),
      'HERO_ALIVE_DEAD_CONFLICT',
      `Hero ${h.heroId} flagged both dead and isAlive`,
      f,
    );
  }

  // ---------------- Campaign ----------------
  must(c.campaignLevel >= 1 && c.campaignLevel <= 3, 'LEVEL_RANGE', `Campaign level ${c.campaignLevel} out of [1,3]`, f);
  must(c.act >= 1 && c.act <= 4, 'ACT_RANGE', `Act ${c.act} out of [1,4]`, f);
  if (c.act === 4) {
    must(c.campaignLevel === 3, 'ACT4_LEVEL', 'Act IV must remain Campaign Level III', f);
  }
  must(c.completedQuestCount >= 0, 'QUEST_COUNT_NEG', 'completedQuestCount negative', f);
  must(c.gold >= 0, 'GOLD_NEG', `Gold ${c.gold} negative`, f);
  must(c.light >= 0, 'LIGHT_RANGE', `Light ${c.light} negative`, f);

  const progress = c.campaignProgress;
  if (progress) {
    must(
      progress.act === c.act,
      'PROGRESS_ACT_DESYNC',
      `campaignProgress.act ${progress.act} != campaign.act ${c.act}`,
      f,
    );
    must(
      progress.campaignLevel === c.campaignLevel,
      'PROGRESS_LEVEL_DESYNC',
      `campaignProgress.campaignLevel ${progress.campaignLevel} != campaign.campaignLevel ${c.campaignLevel}`,
      f,
    );
    const families = progress.defeatedBossFamilyIds ?? [];
    must(new Set(families).size === families.length, 'DUP_BOSS_FAMILY', 'Duplicate defeated boss family id', f);
    must(families.length <= 3, 'BOSS_FAMILY_OVERFLOW', `Defeated ${families.length} boss families, expected max 3`, f);
    const threats = progress.defeatedThreatIds ?? [];
    must(new Set(threats).size === threats.length, 'DUP_DEFEATED_THREAT', 'Duplicate defeated threat id', f);
  }

  // ---------------- Dungeon ----------------
  if (c.dungeon) {
    const roomIds = c.dungeon.rooms.map((r) => r.id);
    must(new Set(roomIds).size === roomIds.length, 'DUP_ROOM_SLOT', 'Duplicate dungeon room id', f);
    const currentRooms = c.dungeon.rooms.filter((r) => r.status === 'current');
    must(
      currentRooms.length <= 1,
      'MULTI_CURRENT_ROOM',
      `${currentRooms.length} rooms marked 'current' simultaneously`,
      f,
    );
    const known = new Set(roomIds);
    for (const r of c.dungeon.rooms) {
      for (const adj of r.adjacentRoomIds) {
        must(known.has(adj), 'DANGLING_ROOM_EDGE', `Room ${r.id} points at unknown room ${adj}`, f);
      }
    }
  }

  // ---------------- Hamlet ----------------
  // 语义澄清（审计早期误报，已修正）：
  //   `preparationDays` 是**剩余天数倒计时**（endHamletDay 每次 -1，归零即离开 Hamlet），
  //   `currentDay` 是**累加日序**（每次 +1，跨 Hamlet 段不重置）。
  // 两者方向相反，`currentDay <= preparationDays + 1` 并不成立，
  // 早期版本据此产生了 84 条假阳性 HAMLET_DAY_OVERFLOW。
  // 由于 HamletState 没有存「本段总天数」，"总天数守恒" 无法在单帧状态上校验，
  // 这一点记为内容/建模层的可观测性缺口（ISSUE-P2-003），而不是运行时不变量。
  if (c.hamlet) {
    must(c.hamlet.currentDay >= 0, 'HAMLET_DAY', `Hamlet currentDay ${c.hamlet.currentDay} negative`, f);
    must(
      c.hamlet.preparationDays >= 0,
      'HAMLET_PREP_NEGATIVE',
      `Hamlet preparationDays ${c.hamlet.preparationDays} negative`,
      f,
    );
    must(
      c.gamePhase !== 'hamlet' || c.hamlet.currentDay >= 1,
      'HAMLET_DAY_UNSTARTED',
      `处于 hamlet 阶段但 currentDay=${c.hamlet.currentDay}（应从第 1 天起）`,
      f,
    );
    const occupied = c.hamlet.occupiedBuildingIds;
    must(new Set(occupied).size === occupied.length, 'DUP_OCCUPIED_BUILDING', 'Duplicate occupied building id', f);
  }

  // ---------------- Final Encounter ----------------
  const fe = c.actFourState?.finalEncounterState ?? null;
  if (fe) {
    const seq = fe.orderedFormIds;
    must(
      seq.length === 3,
      'FORM_SEQ_LEN',
      `Effective final form sequence length ${seq.length}, expected 3 (4 forms minus 1 skipped)`,
      f,
    );
    must(
      seq[seq.length - 1] === 'heart-of-darkness',
      'HEART_LAST',
      `Final form sequence must end with heart-of-darkness, got ${String(seq[seq.length - 1])}`,
      f,
    );
    must(
      !seq.includes(fe.skippedFormId),
      'SKIPPED_FORM_PRESENT',
      `Skipped form ${fe.skippedFormId} still present in ordered sequence`,
      f,
    );
    must(new Set(seq).size === seq.length, 'DUP_FORM_IN_SEQ', 'Duplicate form id in final sequence', f);
    must(
      new Set(fe.defeatedFormIds).size === fe.defeatedFormIds.length,
      'DUP_DEFEATED_FORM',
      'Duplicate entry in defeatedFormIds',
      f,
    );
    must(
      fe.activeFormIndex >= -1 && fe.activeFormIndex < seq.length,
      'FORM_INDEX_RANGE',
      `activeFormIndex ${fe.activeFormIndex} outside [-1, ${seq.length - 1}]`,
      f,
    );
  }

  return f;
}

function isPartyFormationPhase(c: CampaignState): boolean {
  return (
    c.gamePhase === 'home' ||
    c.gamePhase === 'campaign-setup' ||
    c.gamePhase === 'skill-loadout' ||
    c.gamePhase === 'replacement' ||
    c.gamePhase === 'campaign-over'
  );
}

/** Convenience: run invariants and return whether healthy (errors only). */
export function invariantsHealthy(c: CampaignState): boolean {
  return assertCoreCampaignInvariants(c).every((i) => i.severity !== 'error');
}

/** Errors only (warnings are advisory and do not fail the gate). */
export function invariantErrors(c: CampaignState): InvariantFinding[] {
  return assertCoreCampaignInvariants(c).filter((i) => i.severity === 'error');
}

/** State hash used for milestone comparison (deterministic; ignores volatile timestamps/logs). */
export function milestoneStateHash(c: CampaignState): string {
  return stableHashState(stripVolatile(c));
}

/**
 * 剥离与玩法无关的易变字段（时间戳、日志、随机 id），
 * 使同一 seed 的两次运行可以产生逐位相同的 milestone hash。
 */
export function stripVolatile(c: CampaignState): unknown {
  const raw = c as unknown as Record<string, unknown>;
  const { updatedAt, createdAt, id, log, hamlet, ...rest } = raw;
  void updatedAt;
  void createdAt;
  void id;
  void log;
  const hamletCopy = hamlet
    ? { ...(hamlet as Record<string, unknown>), log: [], visitId: '<volatile>' }
    : hamlet;
  return { ...rest, hamlet: hamletCopy };
}

export function invariantIssuesToValidation(issues: InvariantFinding[]): ReferenceValidationIssue[] {
  return issues.map((i) => ({ code: i.code, severity: i.severity, message: i.message }));
}
