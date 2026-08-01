// Phase 10B §27：The Templars 调试区（只读字段 + 受控按钮，dev-only）。
//
// 所有按钮都调用**正式运行时入口**（setup / draw / roll / hook / pit-toss /
// defeat / victory / failure），通过 replaceCampaign 回写 store 并落盘。
// 状态不允许时由入口自身幂等拒绝（ok:false，无副作用），调试区不自行改状态机。
//
// 硬约束提醒：
// - official Templars 因资料缺失永久禁用 → 全部按钮固定走 mode:'prototype'；
// - Miss 分支**绝不掷 d10**（「模拟 Body Slam Miss」按钮用于验证这一点）；
// - Pit Toss 的 d10 先保存后展示，重复点击返回同一结果（幂等）。

import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { createSeededRng } from '../../game-engine/campaign/act-four/rng';
import {
  setupTemplarsEncounter,
  drawNextTemplarInitiativeCard,
  advanceTemplarsRound,
  rollTemplarSkill,
  resolveTemplarDefeat,
  getTemplarSkillTable,
} from '../../game-engine/bosses/templars/templars-runtime';
import { evaluateBodySlamHook, skillTriggersPitToss } from '../../game-engine/bosses/templars/body-slam-hook';
import { resolvePitToss } from '../../game-engine/bosses/templars/resolve-pit-toss';
import {
  evaluateTemplarsVictory,
  resolveTemplarsEncounterVictory,
  resolveTemplarsEncounterFailure,
} from '../../game-engine/bosses/templars/templars-victory';
import { getTemplarsAvailabilityReport } from '../../game-engine/bosses/templars/templars-content-validation';
import { checkDualBossStructure } from '../../game-engine/bosses/templars/dual-boss-encounter';
import { getTemplarsGuardianDefinition } from '../../data/darkest-dungeon/templars';
import type { CampaignState } from '../../types';
import type { TemplarsEncounterState } from '../../types/templars';

export default function TemplarsDebugSection() {
  const [open, setOpen] = useState(false);
  const campaign = useGameStore((s) => s.campaign);
  const replaceCampaign = useGameStore((s) => s.replaceCampaign);

  const seed = makeSeedSequence();
  const rng = (): (() => number) => createSeededRng(seed.next());

  const a4 = campaign?.actFourState;
  if (!a4) return null;
  const t = a4.templarsEncounterState;

  /** 把只改 TemplarsEncounterState 的纯函数结果写回 campaign。 */
  const applyState = (next: TemplarsEncounterState) => {
    replaceCampaign({
      ...campaign!,
      actFourState: { ...campaign!.actFourState, templarsEncounterState: next },
    } as CampaignState);
  };

  const applyCampaign = (label: string, res: { ok: boolean; campaign: CampaignState }) => {
    if (res.ok) replaceCampaign(res.campaign);
    else console.warn(`[TemplarsDebug] ${label} 未执行（ok=false）`);
  };

  // ---- §10 Setup ----
  const onSetup = () =>
    applyCampaign('setup', setupTemplarsEncounter(campaign!, { mode: 'prototype', rng: rng() }));

  // ---- §12 Initiative ----
  const onDrawCard = () => {
    if (!t) return;
    const res = drawNextTemplarInitiativeCard(t);
    if (res.ok) applyState(res.state);
  };
  const onAdvanceRound = () => {
    if (!t) return;
    applyState(advanceTemplarsRound(t, rng()));
  };

  // ---- §13 独立 d10 Skill Table ----
  const onRollSkill = () => {
    if (!t) return;
    const card =
      t.initiativeCards.find((c) => t.resolvedInitiativeCardIds.includes(c.id) && !c.invalidated) ??
      t.initiativeCards.find((c) => !c.invalidated);
    if (!card) return;
    const res = rollTemplarSkill(t, card.id, rng());
    if (res.ok) applyState(res.state);
    else console.warn(`[TemplarsDebug] rollSkill: ${res.reason}`);
  };

  /** 找到 Impaler 的 Body Slam（声明了 trigger-pit-toss 的技能）。 */
  const findBodySlam = (state: TemplarsEncounterState) => {
    const impaler = state.actorStates.find((a) => a.role === 'impaler');
    if (!impaler) return null;
    const skill = getTemplarSkillTable(state, impaler.actorId).find(skillTriggersPitToss);
    return skill ? { impaler, skill } : null;
  };

  // ---- §14 Body Slam 命中 → §15 Pit Toss ----
  const onBodySlamHit = () => {
    if (!t) return;
    const found = findBodySlam(t);
    const hero = t.heroPlacements.find((p) => !p.pitId) ?? t.heroPlacements[0];
    if (!found || !hero) return;
    const hook = evaluateBodySlamHook({
      state: t,
      sourceActorId: found.impaler.actorId,
      skillId: found.skill.id,
      targetActorId: hero.heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: `debug-hit-${t.bodySlamHitEvents.length + 1}`,
    });
    if (!hook.shouldTriggerPitToss || !hook.event) {
      console.warn(`[TemplarsDebug] Body Slam 未触发 Pit Toss：${hook.reason}`);
      applyState(hook.state);
      return;
    }
    // 先落盘命中事件，再在同一 campaign 上跑 Pit Toss 事务（保证 d10 有归属）。
    const withEvent: CampaignState = {
      ...campaign!,
      actFourState: { ...campaign!.actFourState, templarsEncounterState: hook.state },
    };
    const toss = resolvePitToss({ campaign: withEvent, hitEventId: hook.event.id, rng: rng() });
    replaceCampaign(toss.campaign);
    if (!toss.ok) console.warn(`[TemplarsDebug] Pit Toss 失败：${toss.reason}`);
  };

  /** §14.3：Miss 分支 —— 只写审计事件，绝不掷 d10、绝不创建 Pit Toss 事务。 */
  const onBodySlamMiss = () => {
    if (!t) return;
    const found = findBodySlam(t);
    const hero = t.heroPlacements[0];
    if (!found || !hero) return;
    const hook = evaluateBodySlamHook({
      state: t,
      sourceActorId: found.impaler.actorId,
      skillId: found.skill.id,
      targetActorId: hero.heroId,
      targetIsHero: true,
      hit: false,
      skillEventId: `debug-miss-${t.bodySlamHitEvents.length + 1}`,
    });
    applyState(hook.state);
  };

  // ---- §20 单名 Templar 死亡 ----
  const onDefeatOne = (role: 'impaler' | 'warlord') => {
    if (!t) return;
    const actor = t.actorStates.find((a) => a.role === role && a.isAlive);
    if (!actor) return;
    applyCampaign(`defeat-${role}`, resolveTemplarDefeat(campaign!, actor.actorId));
  };

  // ---- §21 Victory / Failure ----
  const onVictory = () => applyCampaign('victory', resolveTemplarsEncounterVictory(campaign!));
  const onFailure = () => {
    const res = resolveTemplarsEncounterFailure(campaign!, '调试模拟 Templars 失败');
    replaceCampaign(res.campaign);
  };

  /** 一键跑通：Setup → 抽卡 → 掷技能 → Body Slam 命中 + Pit Toss → 逐个击败 → Victory。 */
  const onFullRun = () => {
    let c = campaign!;
    const r = (): (() => number) => createSeededRng(seed.next());

    const setup = setupTemplarsEncounter(c, { mode: 'prototype', rng: r() });
    if (!setup.ok || !setup.state) {
      console.warn(`[TemplarsDebug] Setup 失败：${setup.reason}`);
      return;
    }
    c = setup.campaign;

    let s = c.actFourState.templarsEncounterState!;

    // 抽一张卡并为其掷技能骰。
    const draw = drawNextTemplarInitiativeCard(s);
    if (draw.ok && draw.card) {
      s = draw.state;
      const roll = rollTemplarSkill(s, draw.card.id, r());
      if (roll.ok) s = roll.state;
    }

    // Body Slam 命中 → Pit Toss（含强制位移 + Pit Effect）。
    const found = findBodySlam(s);
    const hero = s.heroPlacements[0];
    if (found && hero) {
      const hook = evaluateBodySlamHook({
        state: s,
        sourceActorId: found.impaler.actorId,
        skillId: found.skill.id,
        targetActorId: hero.heroId,
        targetIsHero: true,
        hit: true,
        skillEventId: 'debug-fullrun-hit',
      });
      s = hook.state;
      c = { ...c, actFourState: { ...c.actFourState, templarsEncounterState: s } };
      if (hook.shouldTriggerPitToss && hook.event) {
        const toss = resolvePitToss({ campaign: c, hitEventId: hook.event.id, rng: r() });
        c = toss.campaign;
        s = c.actFourState.templarsEncounterState!;
      }
    } else {
      c = { ...c, actFourState: { ...c.actFourState, templarsEncounterState: s } };
    }

    // 逐个击败两名 Templar（验证「第一名死亡不结束战斗」）。
    for (const role of ['impaler', 'warlord'] as const) {
      const alive = c.actFourState.templarsEncounterState?.actorStates.find(
        (a) => a.role === role && a.isAlive,
      );
      if (!alive) continue;
      const d = resolveTemplarDefeat(c, alive.actorId);
      if (d.ok) c = d.campaign;
    }

    const v = resolveTemplarsEncounterVictory(c);
    if (v.ok) c = v.campaign;
    else console.warn(`[TemplarsDebug] Victory 未执行：${v.reason}`);

    replaceCampaign(c);
  };

  // ---- 只读字段（§27）----
  const report = getTemplarsAvailabilityReport();
  const encounterDef = getTemplarsGuardianDefinition('prototype');
  const structure = t
    ? checkDualBossStructure(encounterDef, t.dualBossEncounterState.memberActorIds)
    : null;
  const evaluation = t ? evaluateTemplarsVictory(t) : null;
  const impaler = t?.actorStates.find((a) => a.role === 'impaler') ?? null;
  const warlord = t?.actorStates.find((a) => a.role === 'warlord') ?? null;
  const lastToss = t && t.pitTossHistory.length > 0 ? t.pitTossHistory[t.pitTossHistory.length - 1] : null;

  const rows: Array<[string, string]> = [
    ['official 启用', report.officialEnabled ? 'true' : `false（缺 ${report.gaps.length} 项）`],
    ['Encounter State', t ? `${t.roomId} @ ${t.battleId}` : '—'],
    ['Content Version', t ? String(t.templarsContentVersion) : '—'],
    ['Impaler', impaler ? `${impaler.hp}/${impaler.maxHp} · ${impaler.stance} · ${impaler.isAlive ? '存活' : '已击败'}` : '—'],
    ['Warlord', warlord ? `${warlord.hp}/${warlord.maxHp} · ${warlord.stance} · ${warlord.isAlive ? '存活' : '已击败'}` : '—'],
    [
      'Dual Boss 结构',
      structure ? (structure.ok ? 'ok（两个独立 Actor，无 Group Actor）' : structure.issues.join('；')) : '—',
    ],
    ['Initiative 2+2', t ? `${t.initiativeCards.filter((c) => !c.invalidated).length} 有效 / ${t.initiativeCards.length} 总` : '—'],
    ['牌堆剩余', t ? String(t.initiativeDrawPile.length) : '—'],
    ['Round', t ? String(t.round) : '—'],
    ['Skill Rolls', t ? String(t.skillRolls.length) : '—'],
    ['Body Slam 事件', t ? `${t.bodySlamHitEvents.length}（命中 ${t.bodySlamHitEvents.filter((e) => e.hit).length}）` : '—'],
    ['Pit 数量', t ? String(t.spikedPitRuntime.length) : '—'],
    ['Pit 占据者', t ? String(t.spikedPitRuntime.reduce((n, p) => n + p.occupantActorIds.length, 0)) : '—'],
    ['最近 Pit Toss', lastToss ? `d10=${lastToss.roll} → ${lastToss.targetPitId || '?'} · ${lastToss.status}` : '—'],
    ['Pit Toss 次数', t ? String(t.pitTossHistory.length) : '—'],
    ['Hazard 事件', t ? String(t.roomHazardEventHistory.length) : '—'],
    ['Victory Rule', t ? (t.dualBossEncounterState.victoryRule?.type ?? 'null（未确认，不推测）') : '—'],
    ['Victory 满足', evaluation ? `${evaluation.satisfied}｜${evaluation.reason ?? ''}` : '—'],
    ['已结算胜利', t ? String(t.templarsBattleRuntime.victoryResolved) : '—'],
    ['幂等事务数', t ? String(t.processedTransactionIds.length) : '—'],
  ];

  return (
    <div className="mb-2 border-t border-dd-border pt-2" data-testid="debug-templars">
      <button
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex w-full items-center justify-between font-semibold text-dd-muted hover:text-dd-text"
        data-testid="debug-templars-toggle"
      >
        <span>Phase 10B · The Templars（只读 + 受控按钮）</span>
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
            <DebugBtn label="Setup Templars" onClick={onSetup} />
            <DebugBtn label="抽 Initiative" onClick={onDrawCard} />
            <DebugBtn label="掷技能 d10" onClick={onRollSkill} />
            <DebugBtn label="Body Slam 命中" onClick={onBodySlamHit} />
            <DebugBtn label="Body Slam Miss" onClick={onBodySlamMiss} />
            <DebugBtn label="推进 Round" onClick={onAdvanceRound} />
            <DebugBtn label="击败 Impaler" onClick={() => onDefeatOne('impaler')} />
            <DebugBtn label="击败 Warlord" onClick={() => onDefeatOne('warlord')} />
            <DebugBtn label="Templars Victory" onClick={onVictory} />
            <DebugBtn label="Templars 失败" onClick={onFailure} danger />
            <DebugBtn label="一键 Templars (prototype)" onClick={onFullRun} primary />
          </div>
          {!report.officialEnabled ? (
            <p className="mt-2 text-[11px] text-dd-muted" data-testid="debug-templars-gate">
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
      data-testid={`debug-templars-${label}`}
    >
      {label}
    </button>
  );
}

/** 简单递增种子发生器（仅调试用，不进入引擎 RNG 路径）。 */
function makeSeedSequence() {
  const ref = { current: 0x10b7e };
  return {
    next: () => {
      ref.current = (ref.current + 0x9e3779b1) >>> 0;
      return ref.current;
    },
  };
}
