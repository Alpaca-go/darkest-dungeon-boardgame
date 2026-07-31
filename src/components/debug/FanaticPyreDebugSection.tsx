import { useMemo, useState } from 'react';
import {
  FANATIC_PROTOTYPE_BOSS,
  PYRE_PROTOTYPE,
  getFanaticOfficialDataGaps,
  isFanaticOfficialBattleEnabled,
} from '../../data/bosses/fanatic-family';
import {
  createSeededRng,
  formatPreludeLog,
  getRemainingAreaCapacity,
  hashFanaticRoomDefinition,
  resolveFanaticTurnPrelude,
  resolvePyreAction,
  setupPrototypeFanaticBattle,
} from '../../game-engine/fanatic/runtime';
import type { FanaticBattleActorSnapshot } from '../../game-engine/fanatic/runtime';

/**
 * Phase 9E · Fanatic / Pyre 调试区（只读，dev-only）。
 *
 * 现状：正式 Fanatic / Pyre 战斗数据缺失（见 docs/reports/phase-9e-fanatic-pyre-data-audit.md），
 * official battle 禁用、Fanatic 不入 Monster Pool，因此没有「真实战斗」可在战斗 UI 内展示。
 * 本区通过 **正式运行时入口**（setupPrototypeFanaticBattle / resolveFanaticTurnPrelude /
 * resolvePyreAction / hashFanaticRoomDefinition 等）驱动 Prototype Harness，只读呈现文档 §26
 * 要求的全部字段（Data Status / Room Placement / 3+1 Initiative / Pyre Active + Capacity /
 * Closest Hero + distance / Selected Hero / Movement Path / Captive State / Pyre Action /
 * Cleanup Transaction / Definition Hash）与 §26 日志格式。不修改任何业务/存档状态。
 */
export default function FanaticPyreDebugSection() {
  // 默认折叠：避免撑高 fixed bottom-anchored 面板，防止其余调试控件被挤出视口。
  const [open, setOpen] = useState(false);
  const snapshot = useMemo(() => {
    const ctx = setupPrototypeFanaticBattle();
    const fanaticAreaId = ctx.room.fanaticPlacement.areaId;
    const pyreAreaId = ctx.room.pyrePlacement.areaId;

    const fanaticActor: FanaticBattleActorSnapshot = {
      actorId: ctx.runtime.fanaticActorId,
      tags: ['fanatic', 'boss'],
      alive: true,
      removed: false,
      areaId: fanaticAreaId,
    };
    const pyre: FanaticBattleActorSnapshot = {
      actorId: ctx.runtime.pyreActorId ?? 'pyre-actor',
      tags: ['pyre', 'fanatic-linked-entity'],
      alive: true,
      removed: false,
      areaId: pyreAreaId,
    };
    // Demo Hero 布阵：hero-1/2/3 一线排开（position 1—3）。
    const heroActors: FanaticBattleActorSnapshot[] = [
      { actorId: 'hero-crusader', tags: ['hero'], alive: true, removed: false, areaId: 'hero-1', position: 1 },
      { actorId: 'hero-vestal', tags: ['hero'], alive: true, removed: false, areaId: 'hero-2', position: 2 },
      { actorId: 'hero-highwayman', tags: ['hero'], alive: true, removed: false, areaId: 'hero-3', position: 3 },
    ];

    const capacityBefore = getRemainingAreaCapacity(ctx.room, pyreAreaId, []);

    // Turn Prelude（正式入口）：选择最近 Hero → 移动 → 到达 → 投入 Pyre。
    const prelude = resolveFanaticTurnPrelude({
      battleId: 'debug-harness',
      initiativeCardId: ctx.runtime.fanaticInitiativeCardIds[0],
      runtime: ctx.runtime,
      room: ctx.room,
      roomGraph: ctx.roomGraph,
      fanaticActor,
      pyre,
      heroActors,
      captiveOccupants: [],
      movementValue: FANATIC_PROTOTYPE_BOSS.stats.movement,
      captiveEffect: ctx.captiveEffect,
    });

    // Pyre Action（正式入口）：确定性 RNG，先保存 d10。
    const pyreAction = resolvePyreAction({
      battleId: 'debug-harness',
      initiativeCardId: ctx.runtime.pyreInitiativeCardId ?? 'pyre-card',
      pyre,
      hasCaptive: !!prelude.captive,
      rng: createSeededRng(0x9e3e),
      skillTable: PYRE_PROTOTYPE.skillIds,
    });

    return {
      ctx,
      fanaticAreaId,
      pyreAreaId,
      capacityBefore,
      prelude,
      pyreAction,
      roomHash: hashFanaticRoomDefinition(ctx.room),
      officialEnabled: isFanaticOfficialBattleEnabled(),
      dataGaps: getFanaticOfficialDataGaps(),
    };
  }, []);

  const { ctx, prelude, pyreAction } = snapshot;
  const selection = prelude.selection;
  const movement = prelude.movement;
  const captive = prelude.captive;

  const rows: Array<[string, string]> = [
    ['Data Status', snapshot.officialEnabled ? 'official ENABLED' : 'official DISABLED（原型）'],
    ['Fanatic', `${FANATIC_PROTOTYPE_BOSS.name}｜HP ${FANATIC_PROTOTYPE_BOSS.stats.maxHp}｜${ctx.room.fanaticPlacement.stance}`],
    ['Pyre', `${PYRE_PROTOTYPE.name}｜HP ${PYRE_PROTOTYPE.maxHp}｜${ctx.room.pyrePlacement.stance}`],
    ['Room Placement', `Fanatic@${snapshot.fanaticAreaId}｜Pyre@${snapshot.pyreAreaId}`],
    ['3+1 Initiative', `${ctx.runtime.fanaticInitiativeCardIds.length} Fanatic + ${ctx.runtime.pyreInitiativeCardId ? 1 : 0} Pyre`],
    ['Pyre Active', prelude.outcome.startsWith('skipped-pyre-not-in-play') ? 'false' : 'true'],
    ['Pyre Area Capacity', `${snapshot.capacityBefore}（投入后剩 0）`],
    ['Closest Hero', selection?.selectedHeroId ?? '-'],
    ['Candidates / dist', selection ? selection.candidateHeroIds.map((h) => `${h}:${selection.distanceByHeroId[h]}`).join(' ') : '-'],
    ['Tie-break', selection?.tieBreakMethod ?? '-'],
    ['Movement Path', movement ? movement.path.join(' → ') : '-'],
    ['Steps Used', movement ? `${movement.stepsUsed}/${FANATIC_PROTOTYPE_BOSS.stats.movement}` : '-'],
    ['Prelude 触发', prelude.outcome],
    ['Captive Hero', captive ? `${captive.captiveActorId} @ ${captive.currentAreaId}（${captive.status}）` : '-'],
    ['Captive 行为', captive ? `act:${captive.canAct} move:${captive.canMove} target:${captive.canBeTargeted} onDestroy:${captive.onContainerDestroyed}` : '-'],
    ['Pyre Action', pyreAction.ok ? `d10=${pyreAction.skillRoll} → ${pyreAction.selectedSkillId}` : `失败(${pyreAction.failure})`],
    ['Prelude Txn', prelude.transactionId],
    ['Throw Txn', prelude.throwResult?.transactionId ?? '-'],
    ['Definition Hash', snapshot.roomHash],
  ];

  const logs = formatPreludeLog(prelude);

  return (
    <div className="mb-2 border-t border-dd-border pt-2" data-testid="debug-fanatic-pyre">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-dd-muted mb-1 font-semibold hover:text-dd-text"
        data-testid="debug-fanatic-pyre-toggle"
      >
        <span>Phase 9E · Fanatic / Pyre（Prototype Harness · 只读）</span>
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
      <div className="mt-1.5 rounded bg-dd-panel2 border border-dd-border p-1.5">
        <div className="text-dd-muted mb-0.5">日志（§26 格式）</div>
        <div className="space-y-0.5 max-h-32 overflow-auto">
          {logs.map((line, i) => (
            <div key={i} className="text-dd-text leading-tight">
              {line}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 text-[10px] text-dd-muted">
        Data Audit 缺口（{snapshot.dataGaps.length}）：{snapshot.dataGaps.join('；')}
      </div>
      </>
      )}
    </div>
  );
}
