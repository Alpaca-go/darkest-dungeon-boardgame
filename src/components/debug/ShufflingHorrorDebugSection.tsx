// Phase 10D §27：Shuffling Horror / Stance Priority / Echoing Disassembly /
// Undulations 调试区（只读字段 + 受控按钮，dev-only）。
//
// 所有按钮都调用**正式运行时入口**（setup / resolve card / execute action /
// advance round / defeat / victory / failure），通过 replaceCampaign 回写 store 并落盘。
// 状态不允许时由入口自身幂等拒绝（ok:false，无副作用），调试区不自行改状态机。
//
// 硬约束提醒：
// - 硬约束 28/29：official Shuffling Horror 因资料缺失禁用 → 全部按钮固定走 mode:'prototype'；
// - 硬约束 2/3/13：Monster Opportunity **不绑定 Actor**，
//   「执行一次行动」按钮取的是牌堆里的下一张卡，真正行动者在**抽到那一刻**才解析；
// - 硬约束 4/5：Horror 每轮 2 次、Priest/Growth 各 1 次，预算耗尽后卡会顺延到下一个 Stance；
// - 硬约束 8：Tracker 未满时 Horror 的行动被 Echoing Disassembly **完全替代**；
// - 硬约束 16/17：Priest/Growth 死亡后**不**立即重生 —— 需再点一次 Horror 行动才重召唤（generation++）；
// - 硬约束 21：Undulations 的 RNG 先保存后展示，只读字段里的排列即已落盘的结果。

import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { createSeededRng } from '../../game-engine/campaign/act-four/rng';
import {
  setupShufflingHorrorEncounter,
  advanceShufflingHorrorRound,
  getMissingSummonRoles,
  isMonsterStanceTrackerFull,
  getRemainingMonsterActions,
} from '../../game-engine/bosses/shuffling-horror/shuffling-horror-runtime';
import {
  decideShufflingHorrorAction,
  executeShufflingHorrorAction,
} from '../../game-engine/bosses/shuffling-horror/shuffling-horror-action';
import { resolveShufflingHorrorActorDefeat, willResummonOnNextHorrorAction } from '../../game-engine/bosses/shuffling-horror/shuffling-horror-death';
import {
  evaluateShufflingHorrorVictory,
  resolveShufflingHorrorEncounterVictory,
  resolveShufflingHorrorEncounterFailure,
} from '../../game-engine/bosses/shuffling-horror/shuffling-horror-victory';
import { getShufflingHorrorAvailabilityReport } from '../../game-engine/bosses/shuffling-horror/shuffling-horror-content-validation';
import { DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS } from '../../data/darkest-dungeon/guardian-registry';
import type { CampaignState } from '../../types';
import type { ShufflingHorrorEncounterState, ShufflingHorrorRole } from '../../types/shuffling-horror';

const ROLE_LABEL: Record<ShufflingHorrorRole, string> = {
  horror: 'Horror',
  'cultist-priest': 'Priest',
  'malignant-growth': 'Growth',
};

export default function ShufflingHorrorDebugSection() {
  const [open, setOpen] = useState(false);
  const campaign = useGameStore((s) => s.campaign);
  const replaceCampaign = useGameStore((s) => s.replaceCampaign);

  const seed = makeSeedSequence();
  const rng = (): (() => number) => createSeededRng(seed.next());

  const a4 = campaign?.actFourState;
  if (!a4) return null;
  const s = a4.shufflingHorrorEncounterState;

  const applyCampaign = (label: string, res: { ok: boolean; campaign: CampaignState }) => {
    if (res.ok) replaceCampaign(res.campaign);
    else console.warn(`[ShufflingHorrorDebug] ${label} 未执行（ok=false）`);
  };

  /** 牌堆里下一张未消费的 Opportunity（不绑定 Actor，抽到时才解析）。 */
  const nextCardId = (st: ShufflingHorrorEncounterState | null): string | null =>
    st?.initiativeDrawPile.find((c) => !c.invalidated)?.id ?? null;

  /**
   * dev-only：把 Act IV 抽到的 Guardian 强制换成 prototype Shuffling Horror。
   * 与 Mammoth Cyst 不同，Shuffling Horror 的 Setup **是家族相关**的
   * （guardian.family !== 'shuffling-horror' 会直接拒绝装配），
   * 而 Quest 抽取是随机的，因此调试 / E2E 需要一个稳定入口来固定家族。
   * ⚠️ 必须在「创建 Guardian Quest」之前点击 —— Quest 会把 guardianDefinitionId 快照进去。
   */
  const onForceFamily = () => {
    if (a4.guardianQuestState) {
      console.warn('[ShufflingHorrorDebug] Guardian Quest 已创建，家族已快照，无法再改');
      return;
    }
    replaceCampaign({
      ...campaign!,
      actFourState: {
        ...campaign!.actFourState,
        guardianDefinitionId: DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS[2],
      },
    } as CampaignState);
  };

  // ---- §9 Setup（只建 Horror + 2 张 Opportunity；Priest/Growth 仅 Reserve）----
  const onSetup = () =>
    applyCampaign('setup', setupShufflingHorrorEncounter(campaign!, { mode: 'prototype', rng: rng() }));

  // ---- §13—§24 执行一次行动 ----
  const onExecuteAction = () => {
    const id = nextCardId(s);
    if (!id) {
      console.warn('[ShufflingHorrorDebug] 牌堆已空，请先推进 Round');
      return;
    }
    const res = executeShufflingHorrorAction(campaign!, id, { rng: rng() });
    replaceCampaign(res.campaign);
    if (!res.ok) console.warn(`[ShufflingHorrorDebug] executeAction 失败：${res.reason}`);
  };

  const onAdvanceRound = () => {
    if (!s) return;
    replaceCampaign({
      ...campaign!,
      actFourState: {
        ...campaign!.actFourState,
        shufflingHorrorEncounterState: advanceShufflingHorrorRound(s),
      },
    } as CampaignState);
  };

  // ---- §25 Actor 死亡 ----
  const onDefeatRole = (role: ShufflingHorrorRole) => () => {
    const actor = s?.actors.find((a) => a.role === role && a.alive && !a.inReserve);
    if (!actor) {
      console.warn(`[ShufflingHorrorDebug] 场上没有存活的 ${ROLE_LABEL[role]}`);
      return;
    }
    applyCampaign(`defeat-${role}`, resolveShufflingHorrorActorDefeat(campaign!, actor.actorId));
  };

  // ---- §26 Victory / Failure ----
  const onVictory = () => applyCampaign('victory', resolveShufflingHorrorEncounterVictory(campaign!));
  const onFailure = () => {
    const res = resolveShufflingHorrorEncounterFailure(campaign!, '调试模拟 Shuffling Horror 失败');
    replaceCampaign(res.campaign);
  };

  /**
   * 一键跑通：Setup → Horror 行动 1（Tracker 未满 → 强制 Echoing 双召唤）→
   * Horror 行动 2（Tracker 已满 → Undulations 洗 Hero Stance）→
   * Priest / Growth 各行动一次（验证 Opportunity 顺延与独立预算）→
   * 击杀 Priest（验证「死亡不立即重生」）→ 推进 Round → Horror 再行动（重召唤 generation++）→
   * 击杀 Horror（Queue 停止 + 清理 linked actors）→ Victory（3 XP + Final Hamlet）。
   */
  const onFullRun = () => {
    let c = campaign!;
    const r = (): (() => number) => createSeededRng(seed.next());

    const setup = setupShufflingHorrorEncounter(c, { mode: 'prototype', rng: r() });
    if (!setup.ok || !setup.state) {
      console.warn(`[ShufflingHorrorDebug] Setup 失败：${setup.reason}`);
      return;
    }
    c = setup.campaign;

    const step = () => {
      const st = c.actFourState.shufflingHorrorEncounterState;
      const id = nextCardId(st ?? null);
      if (!id) return false;
      c = executeShufflingHorrorAction(c, id, { rng: r() }).campaign;
      return true;
    };

    // Echoing → Undulations → Priest → Growth（4 张卡：初始 2 + 召唤补 2）。
    for (let i = 0; i < 4; i += 1) if (!step()) break;

    // 击杀 Priest：不会立即重生。
    const priest = c.actFourState.shufflingHorrorEncounterState?.actors.find(
      (a) => a.role === 'cultist-priest' && a.alive && !a.inReserve,
    );
    if (priest) {
      const d = resolveShufflingHorrorActorDefeat(c, priest.actorId);
      if (d.ok) c = d.campaign;
    }

    // 推进 Round 后 Horror 才有新预算 → 再行动一次触发重召唤（generation++）。
    const afterDefeat = c.actFourState.shufflingHorrorEncounterState;
    if (afterDefeat) {
      c = {
        ...c,
        actFourState: {
          ...c.actFourState,
          shufflingHorrorEncounterState: advanceShufflingHorrorRound(afterDefeat),
        },
      };
    }
    step();

    // 击杀 Horror → Queue 停止 + 清理 linked actors。
    const horror = c.actFourState.shufflingHorrorEncounterState?.actors.find(
      (a) => a.role === 'horror' && a.alive,
    );
    if (horror) {
      const d = resolveShufflingHorrorActorDefeat(c, horror.actorId);
      if (d.ok) c = d.campaign;
    }

    const v = resolveShufflingHorrorEncounterVictory(c);
    if (v.ok) c = v.campaign;
    else console.warn(`[ShufflingHorrorDebug] Victory 未执行：${v.reason}`);

    replaceCampaign(c);
  };

  // ---- 只读字段（§27）----
  const report = getShufflingHorrorAvailabilityReport();
  const evaluation = s ? evaluateShufflingHorrorVictory(s) : null;
  const pendingId = nextCardId(s);
  const decision = s && pendingId ? decideShufflingHorrorAction(s, pendingId) : null;
  const actorLine = (role: ShufflingHorrorRole): string => {
    const a = s?.actors.find((x) => x.role === role);
    if (!a) return '—';
    if (a.inReserve) return 'Reserve（未在场）';
    const used = s!.monsterBudget.perRoleUsed[role] ?? 0;
    const max = s!.monsterBudget.perRoleMax[role] ?? 0;
    return `${a.stances.join('/') || '—'} · ${a.areaId ?? '—'} · gen${a.generation} · ${used}/${max} · ${a.alive ? '存活' : '已击败'}`;
  };
  const occupantLabel = (id: string | null): string => {
    if (!id) return '空';
    const a = s?.actors.find((x) => x.actorId === id);
    return a ? ROLE_LABEL[a.role] : id;
  };

  const rows: Array<[string, string]> = [
    ['official 启用', report.officialEnabled ? 'true' : `false（缺 ${report.gaps.length} 项）`],
    ['Guardian', a4.guardianDefinitionId ?? '—'],
    ['Encounter State', s ? `${s.mode} @ ${s.guardianBattleId}` : '—'],
    ['Round', s ? String(s.round) : '—'],
    ['Horror', actorLine('horror')],
    ['Cultist Priest', actorLine('cultist-priest')],
    ['Malignant Growth', actorLine('malignant-growth')],
    [
      'Stance Tracker',
      s
        ? s.stancePriority.stancePriority
            .map((st) => `${st[0].toUpperCase()}:${occupantLabel(s.stancePriority.stanceOccupant[st])}`)
            .join(' | ')
        : '—',
    ],
    ['Tracker 已满', s ? String(isMonsterStanceTrackerFull(s)) : '—'],
    [
      '待召唤 Role',
      s ? (getMissingSummonRoles(s).map((r) => ROLE_LABEL[r]).join(' → ') || '（无）') : '—',
    ],
    ['下次 Horror 行动重召唤', s ? String(willResummonOnNextHorrorAction(s)) : '—'],
    [
      '下一张卡决策',
      decision
        ? `${decision.decision}${decision.resolvedActorRole ? `｜${ROLE_LABEL[decision.resolvedActorRole]}` : ''}${decision.replacedNormalSkill ? '（替代普通 Skill）' : ''}`
        : '—（牌堆已空）',
    ],
    ['牌堆剩余 / 已消费', s ? `${s.initiativeDrawPile.filter((c) => !c.invalidated).length} / ${s.initiativeDiscardPile.length}` : '—'],
    [
      'Excess 数',
      s ? String(s.initiativeDiscardPile.filter((c) => c.isExcess).length) : '—',
    ],
    [
      '剩余行动（H/P/G）',
      s
        ? `${getRemainingMonsterActions(s, 'horror')}/${getRemainingMonsterActions(s, 'cultist-priest')}/${getRemainingMonsterActions(s, 'malignant-growth')}`
        : '—',
    ],
    [
      'Hero Stance 排列',
      s
        ? s.heroStanceAssignments
            .map((a) => `${a.heroId.slice(0, 6)}:${a.stance[0].toUpperCase()}${a.hasActedThisRound ? '*' : ''}`)
            .join(' ')
        : '—',
    ],
    ['已召唤 Role', s ? (s.summonedRolesThisEncounter.map((r) => ROLE_LABEL[r]).join(',') || '（无）') : '—'],
    [
      'generation（H/P/G）',
      s
        ? `${s.generationByRole.horror}/${s.generationByRole['cultist-priest']}/${s.generationByRole['malignant-growth']}`
        : '—',
    ],
    ['Victory 满足', evaluation ? `${evaluation.satisfied}｜${evaluation.reason ?? ''}` : '—'],
    ['最近行动', s && s.lastActionLog.length > 0 ? s.lastActionLog[s.lastActionLog.length - 1] : '—'],
    ['幂等事务数', s ? String(s.processedTransactionIds.length) : '—'],
  ];

  return (
    <div className="mb-2 border-t border-dd-border pt-2" data-testid="debug-shuffling-horror">
      <button
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex w-full items-center justify-between font-semibold text-dd-muted hover:text-dd-text"
        data-testid="debug-shuffling-horror-toggle"
      >
        <span>Phase 10D · Shuffling Horror / Stance Priority / Undulations（只读 + 受控按钮）</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {!open ? null : (
        <>
          <dl className="space-y-0.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="shrink-0 text-dd-muted">{k}</dt>
                <dd className="truncate text-dd-text" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <DebugBtn label="强制 Shuffling Horror 家族" onClick={onForceFamily} />
            <DebugBtn label="Setup Shuffling Horror" onClick={onSetup} />
            <DebugBtn label="执行一次行动" onClick={onExecuteAction} />
            <DebugBtn label="推进 Round" onClick={onAdvanceRound} />
            <DebugBtn label="击败 Priest" onClick={onDefeatRole('cultist-priest')} />
            <DebugBtn label="击败 Growth" onClick={onDefeatRole('malignant-growth')} />
            <DebugBtn label="击败 Horror" onClick={onDefeatRole('horror')} />
            <DebugBtn label="Shuffling Horror Victory" onClick={onVictory} />
            <DebugBtn label="Shuffling Horror 失败" onClick={onFailure} danger />
            <DebugBtn label="一键 Shuffling Horror (prototype)" onClick={onFullRun} primary />
          </div>
          {!report.officialEnabled ? (
            <p className="mt-2 text-[11px] text-dd-muted" data-testid="debug-shuffling-horror-gate">
              official 禁用原因：{report.gaps.join('；')}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function DebugBtn({
  label,
  onClick,
  danger,
  primary,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  primary?: boolean;
}) {
  const cls = primary
    ? 'bg-red-700 text-white hover:brightness-110'
    : danger
      ? 'border border-red-500/60 text-red-400 hover:bg-red-500/10'
      : 'border border-dd-border text-dd-muted hover:text-dd-text';
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-[11px] ${cls}`}
      data-testid={`debug-shuffling-horror-${label}`}
    >
      {label}
    </button>
  );
}

/** 简单递增种子发生器（仅调试用，不进入引擎 RNG 路径）。 */
function makeSeedSequence() {
  const ref = { current: 0x10d5f };
  return {
    next: () => {
      ref.current = (ref.current + 0x9e3779b1) >>> 0;
      return ref.current;
    },
  };
}
