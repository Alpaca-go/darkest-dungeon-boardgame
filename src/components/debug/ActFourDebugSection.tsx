import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { createSeededRng } from '../../game-engine/campaign/act-four/rng';
import {
  unlockDarkestDungeonAct,
  completePostThirdThreatHamlet,
} from '../../game-engine/campaign/act-four/unlock-act-four';
import { drawDarkestDungeonQuest } from '../../game-engine/campaign/act-four/draw-quest';
import {
  drawDarkestDungeonLayout,
  buildDarkestDungeonMap,
  revealDarkestDungeonRoom,
} from '../../game-engine/campaign/act-four/dungeon-map';
import {
  resolveExcavationSiteRoom,
  finishExcavationRest,
} from '../../game-engine/campaign/act-four/excavation-site';
import {
  createGuardianQuest,
  startGuardianBattle,
  resolveGuardianVictory,
} from '../../game-engine/campaign/act-four/guardian-quest';
import {
  startFinalHamlet,
  advanceFinalHamletDay,
} from '../../game-engine/campaign/act-four/final-hamlet';
import { prepareFinalEncounter } from '../../game-engine/campaign/act-four/prepare-final-encounter';
import {
  startFinalEncounter,
  defeatFinalForm,
  failFinalEncounter,
} from '../../game-engine/campaign/act-four/final-form-sequence';
import { transitionToNextFinalForm } from '../../game-engine/campaign/act-four/transition-final-form';
import { resolveCampaignVictory } from '../../game-engine/campaign/act-four/resolve-campaign-victory';
import { actFourStageLabel } from '../../game-engine/campaign/act-four/act-four-state';
import { getFinalFormDisplayName } from '../../data/darkest-dungeon/final-form-registry';
import type { CampaignState } from '../../types';

/**
 * Phase 10A · Act IV 调试区（只读字段 + 受控按钮，dev-only）。
 *
 * 字段覆盖 §27；按钮全部调用**正式运行时入口**（unlock / draw / build / excavate /
 * guardian / final hamlet / final encounter / victory / failure），通过 replaceCampaign
 * 回写 store 并落盘。所有按钮在状态不允许时由正式入口自身幂等拒绝（ok:false，无副作用）。
 *
 * 「一键通关 (prototype)」按序串起全部正式入口，用于端到端验证 Act IV 框架。
 */
export default function ActFourDebugSection() {
  const [open, setOpen] = useState(false);
  const campaign = useGameStore((s) => s.campaign);
  const replaceCampaign = useGameStore((s) => s.replaceCampaign);

  const seedCounter = makeSeedSequence();

  const a4 = campaign?.actFourState;
  if (!a4) return null;

  const apply = (label: string, res: { ok: boolean; campaign: CampaignState }) => {
    if (res.ok) replaceCampaign(res.campaign);
    else console.warn(`[ActFourDebug] ${label} 未执行（ok=false）`);
  };

  const rng = (): () => number => createSeededRng(seedCounter.next());

  /**
   * 调试 harness：解锁需要「已击败 >= 3 个 Boss Family」。
   * 全新战役在 app 里不满足该前置，这里在调用正式入口前临时补齐
   * （dev-only，仅影响本会话调试存档），使「解锁 / 一键通关」可从空白战役跑通。
   * 不影响引擎 unlockDarkestDungeonAct 自身的幂等与前置校验（单测照常覆盖）。
   */
  const withUnlockPrecondition = (c: CampaignState): CampaignState => {
    const ids = c.campaignProgress.defeatedBossFamilyIds;
    if (ids.length >= 3) return c;
    return {
      ...c,
      campaignProgress: {
        ...c.campaignProgress,
        defeatedBossFamilyIds: ['necromancer', 'prophet', 'collector'],
      },
    };
  };

  const onUnlock = () => apply('unlock', unlockDarkestDungeonAct(withUnlockPrecondition(campaign!)));
  const onSkipPostThreat = () => apply('postThreat', completePostThirdThreatHamlet(campaign!));
  const onDrawQuest = () => apply('drawQuest', drawDarkestDungeonQuest(campaign!, { rng: rng(), mode: 'prototype' }));
  const onDrawLayout = () => apply('drawLayout', drawDarkestDungeonLayout(campaign!, { rng: rng(), mode: 'prototype' }));
  const onBuildMap = () => apply('buildMap', buildDarkestDungeonMap(campaign!, { rng: rng(), mode: 'prototype' }));
  const onRevealObjective = () => {
    const slot = a4.bossSlotAssignment?.objectiveRoomSlotId;
    if (slot) apply('reveal', revealDarkestDungeonRoom(campaign!, slot));
  };
  const onCreateGuardian = () =>
    apply('createGuardian', createGuardianQuest(campaign!, { mode: 'prototype' }));
  const onStartGuardianBattle = () => {
    const q = a4.guardianQuestState;
    if (q) apply('startGuardianBattle', startGuardianBattle(campaign!, q.objectiveRoomId));
  };
  const onEnterExcavation = () => {
    const site = a4.excavationSiteStates.find((s) => s.status === 'available' || s.status === 'unrevealed');
    if (site) apply('excavate', resolveExcavationSiteRoom(campaign!, site.roomId, { rng: rng(), mode: 'prototype' }));
  };
  const onFinishRest = () => {
    const site = a4.excavationSiteStates.find((s) => s.restSession?.status === 'pending');
    if (site) apply('finishRest', finishExcavationRest(campaign!, site.roomId));
  };
  const onGuardianVictory = () => apply('guardianVictory', resolveGuardianVictory(campaign!));
  const onFinalHamletDay = () => apply('finalHamletDay', advanceFinalHamletDay(campaign!));
  const onPrepareFinal = () => apply('prepareFinal', prepareFinalEncounter(campaign!, { mode: 'prototype' }));
  const onDefeatForm = () => {
    const id = a4.finalEncounterState?.activeFormId;
    if (id) apply('defeatForm', defeatFinalForm(campaign!, id));
  };
  const onVictory = () => apply('victory', resolveCampaignVictory(campaign!));
  const onFail = () => {
    const res = failFinalEncounter(campaign!, '调试模拟失败');
    replaceCampaign(res.campaign);
  };

  const onFullRun = () => {
    let c = withUnlockPrecondition(campaign!);
    const r = (): () => number => createSeededRng(seedCounter.next());
    const u = unlockDarkestDungeonAct(c);
    if (!u.ok) return;
    c = u.campaign;
    const ch = completePostThirdThreatHamlet(c);
    if (!ch.ok) return;
    c = ch.campaign;
    const dq = drawDarkestDungeonQuest(c, { rng: r(), mode: 'prototype' });
    if (!dq.ok) return;
    c = dq.campaign;
    const dl = drawDarkestDungeonLayout(c, { rng: r(), mode: 'prototype' });
    if (!dl.ok) return;
    c = dl.campaign;
    const bm = buildDarkestDungeonMap(c, { rng: r(), mode: 'prototype' });
    if (!bm.ok) return;
    c = bm.campaign;
    if (c.actFourState.bossSlotAssignment) {
      c = revealDarkestDungeonRoom(c, c.actFourState.bossSlotAssignment.objectiveRoomSlotId).campaign;
    }
    const cg = createGuardianQuest(c, { mode: 'prototype' });
    if (!cg.ok) return;
    c = cg.campaign;
    const gq = c.actFourState.guardianQuestState;
    if (!gq) return;
    const sb = startGuardianBattle(c, gq.objectiveRoomId);
    if (!sb.ok) return;
    c = sb.campaign;
    for (const site of c.actFourState.excavationSiteStates) {
      if (site.status === 'available' || site.status === 'unrevealed') {
        const ex = resolveExcavationSiteRoom(c, site.roomId, { rng: r(), mode: 'prototype' });
        if (ex.ok) {
          c = ex.campaign;
          c = finishExcavationRest(c, site.roomId).campaign;
        }
      }
    }
    const gv = resolveGuardianVictory(c);
    if (gv.ok) c = gv.campaign;
    const sh = startFinalHamlet(c);
    if (sh.ok) c = sh.campaign;
    for (let d = 0; d < 4; d++) {
      const ah = advanceFinalHamletDay(c);
      if (ah.ok) c = ah.campaign;
    }
    const pe = prepareFinalEncounter(c, { mode: 'prototype' });
    if (!pe.ok) return;
    c = pe.campaign;
    const sf = startFinalEncounter(c);
    if (!sf.ok) return;
    c = sf.campaign;
    let guard = 0;
    while (guard < 12) {
      const enc = c.actFourState.finalEncounterState;
      if (!enc || !enc.activeFormId) break;
      const df = defeatFinalForm(c, enc.activeFormId);
      if (!df.ok) break;
      c = df.campaign;
      if (df.allFormsDefeated) break;
      const tr = transitionToNextFinalForm(c, { rng: r(), mode: 'prototype' });
      if (!tr.ok) break;
      c = tr.campaign;
      guard++;
    }
    const rv = resolveCampaignVictory(c);
    if (rv.ok) c = rv.campaign;
    replaceCampaign(c);
  };

  const rows: Array<[string, string]> = [
    ['Act Four Stage', actFourStageLabel(a4.stage)],
    ['Quest Pool / Selected', `3 / ${a4.selectedQuestId ?? '—'}`],
    ['Guardian', a4.guardianDefinitionId ?? '—'],
    ['skipped Form', a4.skippedFinalFormId ? getFinalFormDisplayName(a4.skippedFinalFormId) : '—'],
    ['Content Runtime', a4.contentRuntime ? 'set' : '—'],
    ['Layout', a4.layoutDrawRecord?.selectedLayoutId ?? '—'],
    ['Boss Slots', a4.bossSlotAssignment ? `${a4.bossSlotAssignment.bossSlotIds.length} 个` : '—'],
    ['Objective Slot', a4.bossSlotAssignment?.objectiveRoomSlotId ?? '（未揭示）'],
    ['Room Count', String(a4.mapState?.roomCount ?? '—')],
    ['Excavation States', String(a4.excavationSiteStates.length)],
    ['Final Hamlet Day', a4.finalHamletState ? `${a4.finalHamletState.currentDay}/${a4.finalHamletState.totalDays}` : '—'],
    ['Final Provisions', a4.finalEncounterState?.provisionRecord ? JSON.stringify(a4.finalEncounterState.provisionRecord.granted) : '—'],
    ['Form Sequence', a4.finalEncounterState ? a4.finalEncounterState.orderedFormIds.map(getFinalFormDisplayName).join(' → ') : '—'],
    ['Active Form', a4.finalEncounterState?.activeFormId ? getFinalFormDisplayName(a4.finalEncounterState.activeFormId) : '—'],
    ['Transition State', a4.finalEncounterState?.transitionState ? `${a4.finalEncounterState.transitionState.fromFormId}→${a4.finalEncounterState.transitionState.toFormId}:${a4.finalEncounterState.transitionState.status}` : '—'],
    ['Definition Hash', a4.questDrawRecord?.rngStateId ?? '—'],
    ['最近事务', a4.lastTransitionTransactionId ?? '—'],
  ];

  return (
    <div className="mb-2 border-t border-dd-border pt-2" data-testid="debug-act-four">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-dd-muted mb-1 font-semibold hover:text-dd-text"
        data-testid="debug-act-four-toggle"
      >
        <span>Phase 10A · Act IV（只读 + 受控按钮）</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {!open ? null : (
        <>
          <dl className="space-y-0.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-dd-muted shrink-0">{k}</dt>
                <dd className="text-dd-text truncate" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <DebugBtn label="解锁 Act IV" onClick={onUnlock} />
            <DebugBtn label="跳过第三Boss回归" onClick={onSkipPostThreat} />
            <DebugBtn label="抽 Quest" onClick={onDrawQuest} />
            <DebugBtn label="抽 Layout" onClick={onDrawLayout} />
            <DebugBtn label="生成地图" onClick={onBuildMap} />
            <DebugBtn label="Reveal Objective" onClick={onRevealObjective} />
            <DebugBtn label="创建 Guardian Quest" onClick={onCreateGuardian} />
            <DebugBtn label="进入 Guardian Battle" onClick={onStartGuardianBattle} />
            <DebugBtn label="进入 Excavation" onClick={onEnterExcavation} />
            <DebugBtn label="完成 Free Rest" onClick={onFinishRest} />
            <DebugBtn label="击败 Guardian" onClick={onGuardianVictory} />
            <DebugBtn label="Final Hamlet Day" onClick={onFinalHamletDay} />
            <DebugBtn label="准备 Final Encounter" onClick={onPrepareFinal} />
            <DebugBtn label="击败当前 Form" onClick={onDefeatForm} />
            <DebugBtn label="触发 Victory" onClick={onVictory} />
            <DebugBtn label="模拟失败" onClick={onFail} danger />
            <DebugBtn label="一键通关 (prototype)" onClick={onFullRun} primary />
          </div>
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
      className={`px-2 py-1 rounded text-[11px] ${cls}`}
      data-testid={`debug-actfour-${label}`}
    >
      {label}
    </button>
  );
}

/** 简单的递增种子发生器（仅调试用，不进入引擎 RNG 路径）。 */
function makeSeedSequence() {
  const ref = { current: 0x10a16 };
  return {
    next: () => {
      ref.current = (ref.current + 0x9e3779b1) >>> 0;
      return ref.current;
    },
  };
}
