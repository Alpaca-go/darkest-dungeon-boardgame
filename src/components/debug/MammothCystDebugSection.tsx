// Phase 10C §27：Mammoth Cyst / White Cell Stalk / Teleportation 调试区
// （只读字段 + 受控按钮，dev-only）。
//
// 所有按钮都调用**正式运行时入口**（setup / draw / execute / summon / teleport /
// defeat / victory / failure），通过 replaceCampaign 回写 store 并落盘。
// 状态不允许时由入口自身幂等拒绝（ok:false，无副作用），调试区不自行改状态机。
//
// 硬约束提醒：
// - 硬约束 20：official Mammoth Cyst 因资料缺失禁用 → 全部按钮固定走 mode:'prototype'；
// - 硬约束 5：Cyst 在场上无 Stalk 时的行动**完全替代**普通 Skill
//   （「执行 Cyst 行动」按钮的 skippedNormalSkillRoll 字段用于验证这一点）；
// - 硬约束 6：Stalk 死亡后**不**立即重召唤 —— 需再点一次「执行 Cyst 行动」才重生；
// - 硬约束 14：Teleportation / Skill 的 d10 先保存后展示，重复点击返回同一结果（幂等）。

import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { createSeededRng } from '../../game-engine/campaign/act-four/rng';
import {
  setupMammothCystEncounter,
  drawNextMammothCystInitiativeCard,
  advanceMammothCystRound,
  getAliveWhiteCellStalkCount,
} from '../../game-engine/bosses/mammoth-cyst/mammoth-cyst-runtime';
import { decideMammothCystAction } from '../../game-engine/bosses/mammoth-cyst/mammoth-cyst-action-override';
import { executeMammothCystAction } from '../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { resolveMammothCystActorDefeat } from '../../game-engine/bosses/mammoth-cyst/white-cell-stalk-death';
import {
  evaluateMammothCystVictory,
  resolveMammothCystEncounterVictory,
  resolveMammothCystEncounterFailure,
} from '../../game-engine/bosses/mammoth-cyst/mammoth-cyst-victory';
import { getMammothCystAvailabilityReport } from '../../game-engine/bosses/mammoth-cyst/mammoth-cyst-content-validation';
import type { CampaignState } from '../../types';
import type { MammothCystEncounterState } from '../../types/mammoth-cyst';

export default function MammothCystDebugSection() {
  const [open, setOpen] = useState(false);
  const campaign = useGameStore((s) => s.campaign);
  const replaceCampaign = useGameStore((s) => s.replaceCampaign);

  const seed = makeSeedSequence();
  const rng = (): (() => number) => createSeededRng(seed.next());

  const a4 = campaign?.actFourState;
  if (!a4) return null;
  const m = a4.mammothCystEncounterState;

  /** 把只改 MammothCystEncounterState 的纯函数结果写回 campaign。 */
  const applyState = (next: MammothCystEncounterState) => {
    replaceCampaign({
      ...campaign!,
      actFourState: { ...campaign!.actFourState, mammothCystEncounterState: next },
    } as CampaignState);
  };

  const applyCampaign = (label: string, res: { ok: boolean; campaign: CampaignState }) => {
    if (res.ok) replaceCampaign(res.campaign);
    else console.warn(`[MammothCystDebug] ${label} 未执行（ok=false）`);
  };

  // ---- §9 / §10 Setup（只创建 Cyst + 2 张卡；Stalk 只登记 Reserve）----
  const onSetup = () =>
    applyCampaign(
      'setup',
      setupMammothCystEncounter(campaign!, { mode: 'prototype', rng: rng() }),
    );

  // ---- §11 Initiative ----
  const onDrawCard = () => {
    if (!m) return;
    const res = drawNextMammothCystInitiativeCard(m);
    if (res.ok) applyState(res.state);
  };
  const onAdvanceRound = () => {
    if (!m) return;
    applyState(advanceMammothCystRound(m, rng()));
  };

  /** 取当前应执行的卡：优先「已抽出但尚未结算」的最后一张，否则先抽一张。 */
  const pickActionCard = (
    c: CampaignState,
  ): { campaign: CampaignState; cardId: string | null } => {
    const s = c.actFourState.mammothCystEncounterState;
    if (!s) return { campaign: c, cardId: null };
    const drawn = [...s.resolvedInitiativeCardIds].reverse();
    for (const id of drawn) {
      const card = s.initiativeCards.find((k) => k.id === id);
      if (!card || card.invalidated) continue;
      const hasRoll = s.skillRolls.some((r) => r.initiativeCardId === id);
      const hasSummon = s.summonHistory.some((r) => r.sourceActionEventId === id);
      if (!hasRoll && !hasSummon) return { campaign: c, cardId: id };
    }
    const draw = drawNextMammothCystInitiativeCard(s);
    if (!draw.ok || !draw.card) return { campaign: c, cardId: null };
    return {
      campaign: {
        ...c,
        actFourState: { ...c.actFourState, mammothCystEncounterState: draw.state },
      },
      cardId: draw.card.id,
    };
  };

  /**
   * §12 / §16 / §17：执行一次行动（自动分派召唤 / 普通 Skill / Teleportation）。
   * 结果里的 skippedNormalSkillRoll 直接反映硬约束 5 是否被遵守。
   */
  const onExecuteAction = () => {
    if (!m) return;
    const picked = pickActionCard(campaign!);
    if (!picked.cardId) {
      console.warn('[MammothCystDebug] 无可执行的 Initiative Card（本轮已抽完）');
      return;
    }
    const s = picked.campaign.actFourState.mammothCystEncounterState!;
    const target = s.heroPlacements[0]?.heroId;
    const res = executeMammothCystAction(picked.campaign, picked.cardId, {
      mode: 'prototype',
      rng: rng(),
      targetHeroId: target,
    });
    replaceCampaign(res.campaign);
    if (!res.ok) console.warn(`[MammothCystDebug] executeAction 失败：${res.reason}`);
  };

  // ---- §22 Actor 死亡 ----
  const onDefeatStalk = () => {
    if (!m) return;
    const stalk = m.actorStates.find((a) => a.owner === 'white-cell-stalk' && a.isAlive);
    if (!stalk) {
      console.warn('[MammothCystDebug] 场上没有存活的 White Cell Stalk');
      return;
    }
    applyCampaign('defeat-stalk', resolveMammothCystActorDefeat(campaign!, stalk.actorId));
  };
  const onDefeatCyst = () => {
    if (!m) return;
    const cyst = m.actorStates.find((a) => a.owner === 'mammoth-cyst' && a.isAlive);
    if (!cyst) return;
    applyCampaign('defeat-cyst', resolveMammothCystActorDefeat(campaign!, cyst.actorId));
  };

  // ---- §23 Victory / Failure ----
  const onVictory = () =>
    applyCampaign('victory', resolveMammothCystEncounterVictory(campaign!));
  const onFailure = () => {
    const res = resolveMammothCystEncounterFailure(campaign!, '调试模拟 Mammoth Cyst 失败');
    replaceCampaign(res.campaign);
  };

  /**
   * 一键跑通：Setup → Cyst 行动（召唤 Stalk）→ Stalk 行动（含 Teleportation）→
   * 击杀 Stalk → Cyst 再行动（重新召唤，验证硬约束 6「不立即重召唤」）→
   * 击杀 Cyst → Victory。
   */
  const onFullRun = () => {
    let c = campaign!;
    const r = (): (() => number) => createSeededRng(seed.next());

    const setup = setupMammothCystEncounter(c, { mode: 'prototype', rng: r() });
    if (!setup.ok || !setup.state) {
      console.warn(`[MammothCystDebug] Setup 失败：${setup.reason}`);
      return;
    }
    c = setup.campaign;

    // 连续执行若干次行动：第 1 次必然是召唤（场上无 Stalk），之后是普通 Skill / Teleportation。
    for (let i = 0; i < 4; i += 1) {
      const picked = pickActionCard(c);
      if (!picked.cardId) {
        const s = picked.campaign.actFourState.mammothCystEncounterState;
        if (!s) break;
        c = {
          ...picked.campaign,
          actFourState: {
            ...picked.campaign.actFourState,
            mammothCystEncounterState: advanceMammothCystRound(s, r()),
          },
        };
        continue;
      }
      const s = picked.campaign.actFourState.mammothCystEncounterState!;
      const res = executeMammothCystAction(picked.campaign, picked.cardId, {
        mode: 'prototype',
        rng: r(),
        targetHeroId: s.heroPlacements[0]?.heroId,
      });
      c = res.campaign;
    }

    // 击杀 Stalk（验证「死亡不立即重召唤」），再让 Cyst 行动一次触发重生。
    const stalk = c.actFourState.mammothCystEncounterState?.actorStates.find(
      (a) => a.owner === 'white-cell-stalk' && a.isAlive,
    );
    if (stalk) {
      const d = resolveMammothCystActorDefeat(c, stalk.actorId);
      if (d.ok) c = d.campaign;
      const picked = pickActionCard(c);
      if (picked.cardId) {
        const s = picked.campaign.actFourState.mammothCystEncounterState!;
        const res = executeMammothCystAction(picked.campaign, picked.cardId, {
          mode: 'prototype',
          rng: r(),
          targetHeroId: s.heroPlacements[0]?.heroId,
        });
        c = res.campaign;
      }
    }

    // 击杀全部 Actor 后收口胜利。
    for (const owner of ['white-cell-stalk', 'mammoth-cyst'] as const) {
      const alive = c.actFourState.mammothCystEncounterState?.actorStates.find(
        (a) => a.owner === owner && a.isAlive,
      );
      if (!alive) continue;
      const d = resolveMammothCystActorDefeat(c, alive.actorId);
      if (d.ok) c = d.campaign;
    }

    const v = resolveMammothCystEncounterVictory(c);
    if (v.ok) c = v.campaign;
    else console.warn(`[MammothCystDebug] Victory 未执行：${v.reason}`);

    replaceCampaign(c);
  };

  // ---- 只读字段（§27）----
  const report = getMammothCystAvailabilityReport();
  const evaluation = m ? evaluateMammothCystVictory(m) : null;
  const cyst = m?.actorStates.find((a) => a.owner === 'mammoth-cyst') ?? null;
  const stalk = m?.actorStates.find((a) => a.owner === 'white-cell-stalk') ?? null;
  const lastTp =
    m && m.teleportationHistory.length > 0
      ? m.teleportationHistory[m.teleportationHistory.length - 1]
      : null;
  const lastSummon =
    m && m.summonHistory.length > 0 ? m.summonHistory[m.summonHistory.length - 1] : null;
  const nextCard = m
    ? (m.initiativeCards.find((c) => c.id === m.initiativeDrawPile[0]) ?? null)
    : null;
  const decision = m && nextCard ? decideMammothCystAction(m, nextCard, 'prototype') : null;

  const rows: Array<[string, string]> = [
    ['official 启用', report.officialEnabled ? 'true' : `false（缺 ${report.gaps.length} 项）`],
    ['Encounter State', m ? `${m.roomId} @ ${m.battleId}` : '—'],
    ['Content Version', m ? String(m.mammothCystContentVersion) : '—'],
    [
      'Mammoth Cyst',
      cyst
        ? `${cyst.hp}/${cyst.maxHp} · ${cyst.stance} · ${cyst.areaId} · ${cyst.isAlive ? '存活' : '已击败'}`
        : '—',
    ],
    [
      'White Cell Stalk',
      stalk
        ? `${stalk.hp}/${stalk.maxHp} · ${stalk.stance} · ${stalk.areaId} · ${stalk.isAlive ? '存活' : '已击败'}`
        : 'Reserve（未在场）',
    ],
    ['存活 Stalk 数', m ? `${getAliveWhiteCellStalkCount(m)} / 上限 1` : '—'],
    ['召唤 generation', m ? String(m.mammothCystBattleRuntime.summonGeneration) : '—'],
    [
      '下一张卡决策',
      decision ? `${decision.actionType}｜${decision.explanation}` : '—（牌堆已空）',
    ],
    [
      'Initiative',
      m
        ? `${m.initiativeCards.filter((c) => !c.invalidated).length} 有效 / ${m.initiativeCards.length} 总（Cyst 2 + Stalk ${m.mammothCystBattleRuntime.activeStalkInitiativeCardIds.length}）`
        : '—',
    ],
    ['牌堆剩余', m ? String(m.initiativeDrawPile.length) : '—'],
    ['Round', m ? String(m.round) : '—'],
    ['Skill Rolls', m ? String(m.skillRolls.length) : '—'],
    [
      '最近召唤',
      lastSummon
        ? `gen=${lastSummon.generation} → ${lastSummon.stance}/${lastSummon.areaId} · ${lastSummon.status}`
        : '—',
    ],
    ['召唤次数', m ? String(m.summonHistory.length) : '—'],
    [
      '最近 Teleportation',
      lastTp
        ? `d10=${lastTp.roll} → ${lastTp.targetAreaId || '?'} · ${lastTp.status}`
        : '—',
    ],
    ['Teleportation 次数', m ? String(m.teleportationHistory.length) : '—'],
    ['Entry Effect 区域', m ? String(m.areaEntryRuntime.length) : '—'],
    ['Hazard 事件', m ? String(m.roomHazardEventHistory.length) : '—'],
    ['Victory Condition', m ? m.snapshot.guardian.victoryCondition : '—'],
    ['Victory 满足', evaluation ? `${evaluation.satisfied}｜${evaluation.reason ?? ''}` : '—'],
    ['已结算胜利', m ? String(m.mammothCystBattleRuntime.victoryResolved) : '—'],
    ['幂等事务数', m ? String(m.processedTransactionIds.length) : '—'],
  ];

  return (
    <div className="mb-2 border-t border-dd-border pt-2" data-testid="debug-mammoth-cyst">
      <button
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex w-full items-center justify-between font-semibold text-dd-muted hover:text-dd-text"
        data-testid="debug-mammoth-cyst-toggle"
      >
        <span>Phase 10C · Mammoth Cyst / Stalk / Teleportation（只读 + 受控按钮）</span>
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
            <DebugBtn label="Setup Mammoth Cyst" onClick={onSetup} />
            <DebugBtn label="抽 Initiative" onClick={onDrawCard} />
            <DebugBtn label="执行一次行动" onClick={onExecuteAction} />
            <DebugBtn label="推进 Round" onClick={onAdvanceRound} />
            <DebugBtn label="击败 Stalk" onClick={onDefeatStalk} />
            <DebugBtn label="击败 Cyst" onClick={onDefeatCyst} />
            <DebugBtn label="Mammoth Cyst Victory" onClick={onVictory} />
            <DebugBtn label="Mammoth Cyst 失败" onClick={onFailure} danger />
            <DebugBtn label="一键 Mammoth Cyst (prototype)" onClick={onFullRun} primary />
          </div>
          {!report.officialEnabled ? (
            <p className="mt-2 text-[11px] text-dd-muted" data-testid="debug-mammoth-cyst-gate">
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
      data-testid={`debug-mammoth-cyst-${label}`}
    >
      {label}
    </button>
  );
}

/** 简单递增种子发生器（仅调试用，不进入引擎 RNG 路径）。 */
function makeSeedSequence() {
  const ref = { current: 0x10c5c };
  return {
    next: () => {
      ref.current = (ref.current + 0x9e3779b1) >>> 0;
      return ref.current;
    },
  };
}
