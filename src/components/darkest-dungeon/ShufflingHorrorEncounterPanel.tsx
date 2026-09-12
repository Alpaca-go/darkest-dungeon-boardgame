// Phase 10D §24：Shuffling Horror / Stance Priority / Monster Opportunity /
// Hero Stance 排列 只读展示面板。
//
// 硬约束对照：
// - §24.1：Horror / Cultist Priest / Malignant Growth **各自独立**显示
//   （Stance / Area / 存活 / 本轮行动预算），Priest/Growth 不是 Horror 的附属数值；
// - §24.2：Monster Initiative 区必须显示「Opportunity 不绑定 Actor」，
//   已抽卡显示抽卡瞬间解析到的 Actor 快照，未抽卡显示「待抽（抽到时才解析）」（硬约束 2/3/13）；
// - §24.3：Priest/Growth 未召唤时显示「Reserve（未在场）」而不是留空（硬约束 10）；
// - §24.4：Stance Priority Tracker 显示四个 Stance 的占据者与是否已满
//   （未满 → 下次 Horror 行动强制 Echoing Disassembly，硬约束 8）；
// - §24.5：Hero Stance 排列显示当前 Stance + Area + 本轮是否已行动
//   （Undulations 只改 Stance 不改 Area，硬约束 20/22/23）；
// - §24.6：Excess Opportunity 明确标记原因（硬约束 7）；
// - §3：official 未启用时明确说明「因缺哪些资料而禁用」。
//
// 本组件是纯展示：不修改任何状态，不发起任何随机（硬约束 21：RNG 先保存、UI 后展示）。

import type {
  MonsterStance,
  ShufflingHorrorActorState,
  ShufflingHorrorEncounterState,
  ShufflingHorrorRole,
} from '../../types/shuffling-horror';
import { getShufflingHorrorAvailabilityReport } from '../../game-engine/bosses/shuffling-horror/shuffling-horror-content-validation';
import CommunityVisual from './CommunityVisual';

interface Props {
  state: ShufflingHorrorEncounterState | null;
  /** 英雄 instanceId → 展示名，用于 Hero Stance 区显示。 */
  heroNames?: Record<string, string>;
}

const ROLE_LABEL: Record<ShufflingHorrorRole, string> = {
  horror: 'Shuffling Horror',
  'cultist-priest': 'Cultist Priest',
  'malignant-growth': 'Malignant Growth',
};

const STANCE_LABEL: Record<MonsterStance, string> = {
  aggressive: 'Aggressive',
  defensive: 'Defensive',
  ranged: 'Ranged',
  support: 'Support',
};

export default function ShufflingHorrorEncounterPanel({ state, heroNames }: Props) {
  if (!state) return null;

  const nameOf = (heroId: string) => heroNames?.[heroId] ?? heroId;
  const actorById = (id: string | null) =>
    id ? (state.actors.find((a) => a.actorId === id) ?? null) : null;

  const horror = state.actors.find((a) => a.role === 'horror') ?? null;
  const priest = state.actors.find((a) => a.role === 'cultist-priest') ?? null;
  const growth = state.actors.find((a) => a.role === 'malignant-growth') ?? null;

  const missingRoles = (['cultist-priest', 'malignant-growth'] as const).filter((role) => {
    const a = state.actors.find((x) => x.role === role);
    return !a || !a.alive || a.inReserve;
  });
  const horrorAlive = horror?.alive ?? false;
  const pendingCards = state.initiativeDrawPile.filter((c) => !c.invalidated);
  const resolvedCards = [...state.initiativeDiscardPile].slice(-6);

  return (
    <section
      className="rounded border border-dd-border bg-dd-panel/60 p-3 text-xs"
      data-testid="shuffling-horror-encounter-panel"
    >
      <header className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-dd-text">Shuffling Horror · Guardian 遭遇</h3>
        <span className="text-dd-muted" data-testid="shuffling-horror-round">
          Round {state.round}
        </span>
      </header>

      {/* ---- §24.1 / §24.3 三名 Actor 各自独立展示 ---- */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ActorCard actor={horror} role="horror" budget={state} testId="shuffling-horror-actor-boss" />
        <ActorCard
          actor={priest}
          role="cultist-priest"
          budget={state}
          testId="shuffling-horror-actor-priest"
        />
        <ActorCard
          actor={growth}
          role="malignant-growth"
          budget={state}
          testId="shuffling-horror-actor-growth"
        />
      </div>

      {/* ---- §24.4 Stance Priority Tracker ---- */}
      <div className="mb-3">
        <h4 className="mb-1 text-dd-muted">
          Stance Priority Tracker（容量 {state.stancePriority.capacityPerStance} / Stance）
        </h4>
        <ul className="space-y-0.5" data-testid="shuffling-horror-stance-tracker">
          {state.stancePriority.stancePriority.map((stance, idx) => {
            const occupant = actorById(state.stancePriority.stanceOccupant[stance]);
            return (
              <li
                key={stance}
                className="flex justify-between gap-2"
                data-testid={`shuffling-horror-stance-${stance}`}
              >
                <span className="text-dd-text">
                  {idx + 1}. {STANCE_LABEL[stance]}
                </span>
                <span className={occupant ? 'text-dd-text' : 'text-dd-muted'}>
                  {occupant ? ROLE_LABEL[occupant.role] : '（空）'}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-dd-muted" data-testid="shuffling-horror-tracker-state">
          {state.stancePriority.isFull
            ? 'Tracker 已满 → Horror 下次行动执行普通技能（Undulations）。'
            : `Tracker 未满 → Horror 下次行动强制 Echoing Disassembly${
                missingRoles.length > 0
                  ? `（待召唤：${missingRoles.map((r) => ROLE_LABEL[r]).join(' → ')}）`
                  : ''
              }。`}
        </p>
      </div>

      {/* ---- §24.2 / §24.6 Monster Initiative Opportunity（不绑定 Actor）---- */}
      <div className="mb-3">
        <h4 className="mb-1 text-dd-muted">
          Monster Initiative Opportunity（不绑定 Actor，抽到时才解析）
        </h4>
        <ul className="space-y-0.5" data-testid="shuffling-horror-initiative-pending">
          {pendingCards.length === 0 ? (
            <li className="text-dd-muted">（牌堆已空）</li>
          ) : (
            pendingCards.map((card, idx) => (
              <li
                key={card.id}
                className="flex justify-between gap-2 text-dd-text"
                data-testid={`shuffling-horror-initiative-card-${card.id}`}
              >
                <span>
                  第 {idx + 1} 张 <span className="text-dd-muted">· 第 {card.roundCreated} 轮加入</span>
                </span>
                <span className="text-dd-muted">待抽（抽到时按 Stance 优先级解析）</span>
              </li>
            ))
          )}
        </ul>
        <h4 className="mb-1 mt-2 text-dd-muted">已解析记录（抽卡瞬间快照）</h4>
        <ul className="space-y-0.5" data-testid="shuffling-horror-initiative-resolved">
          {resolvedCards.length === 0 ? (
            <li className="text-dd-muted">（尚无抽卡）</li>
          ) : (
            resolvedCards.map((card) => (
              <li
                key={card.id}
                className={`flex justify-between gap-2 ${
                  card.isExcess ? 'text-dd-muted line-through' : 'text-dd-text'
                }`}
                data-testid={`shuffling-horror-resolved-card-${card.id}`}
              >
                <span>
                  {card.isExcess
                    ? 'Excess（无 Eligible Actor）'
                    : `${card.resolvedActorRole ? ROLE_LABEL[card.resolvedActorRole] : '—'}`}
                </span>
                <span className="text-dd-muted">
                  {card.isExcess
                    ? (card.excessReason ?? 'no-eligible-monster-at-draw')
                    : card.stanceAtDraw
                      ? STANCE_LABEL[card.stanceAtDraw]
                      : '—'}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* ---- §24.5 Hero Stance 排列（Undulations 产物）---- */}
      <div className="mb-3">
        <h4 className="mb-1 text-dd-muted">Hero Stance 排列（Undulations 只改 Stance，不改 Area）</h4>
        <ul className="space-y-0.5" data-testid="shuffling-horror-hero-stances">
          {state.heroStanceAssignments.length === 0 ? (
            <li className="text-dd-muted">（尚未分配）</li>
          ) : (
            state.heroStanceAssignments.map((a) => (
              <li
                key={a.heroId}
                className="flex justify-between gap-2"
                data-testid={`shuffling-horror-hero-${a.heroId}`}
              >
                <span className="text-dd-text">
                  {nameOf(a.heroId)}
                  <span className="text-dd-muted"> · {STANCE_LABEL[a.stance]}</span>
                </span>
                <span className="text-dd-muted">
                  {a.areaId || '—'} · {a.hasActedThisRound ? '本轮已行动' : '待行动'}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* ---- 死亡 / 重召唤提示（硬约束 16/17/25）---- */}
      {!horrorAlive ? (
        <p className="mb-2 text-emerald-400" data-testid="shuffling-horror-queue-stopped-note">
          Shuffling Horror 已被击破 —— Monster Initiative 队列停止，关联召唤物一并消散。
        </p>
      ) : missingRoles.length > 0 && state.summonedRolesThisEncounter.length > 0 ? (
        <p className="mb-2 text-amber-400" data-testid="shuffling-horror-resummon-note">
          {missingRoles.map((r) => ROLE_LABEL[r]).join(' / ')} 已不在场 —— 不会立即重生；
          **下一次 Horror 行动**时才会重新召唤（generation 递增）。
        </p>
      ) : null}

      {/* ---- 最近行动日志（先保存后展示）---- */}
      {state.lastActionLog.length > 0 ? (
        <div className="mb-2">
          <h4 className="mb-1 text-dd-muted">最近行动</h4>
          <ul className="space-y-0.5" data-testid="shuffling-horror-action-log">
            {state.lastActionLog.slice(-5).map((line, i) => (
              <li key={`${i}-${line}`} className="text-dd-muted">
                · {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ShufflingHorrorDataGateNote />
    </section>
  );
}

/** 单个 Actor 的独立卡片（§24.1：三名 Actor 各自独立，不合并）。 */
function ActorCard({
  actor,
  role,
  budget,
  testId,
}: {
  actor: ShufflingHorrorActorState | null;
  role: ShufflingHorrorRole;
  budget: ShufflingHorrorEncounterState;
  testId: string;
}) {
  if (!actor) {
    return (
      <div className="rounded border border-dd-border p-2 text-dd-muted" data-testid={testId}>
        {ROLE_LABEL[role]}：（未实例化）
      </div>
    );
  }
  // §24.3：Reserve 明确显示，而不是留空。
  if (actor.inReserve) {
    return (
      <div
        className="rounded border border-dashed border-dd-border p-2 text-dd-muted"
        data-testid={testId}
      >
        {ROLE_LABEL[role]}：Reserve（未在场）
        <div className="mt-0.5 text-[11px]">
          不占 Stance、不加入 Tracker；Horror 行动且 Tracker 未满时由 Echoing Disassembly 召唤。
        </div>
      </div>
    );
  }
  const used = budget.monsterBudget.perRoleUsed[role] ?? 0;
  const max = budget.monsterBudget.perRoleMax[role] ?? 0;
  const visualEntityId = role === 'horror'
    ? 'community-dd-shuffling-horror'
    : role === 'cultist-priest'
      ? 'community-dd-cultist-priest'
      : 'community-dd-malignant-growth';
  return (
    <div
      className={`rounded border p-2 ${actor.alive ? 'border-dd-border' : 'border-dd-border/50 opacity-60'}`}
      data-testid={testId}
    >
      <div className="flex justify-between gap-2">
        <span className="font-semibold text-dd-text">{ROLE_LABEL[role]}</span>
        <span className="text-dd-muted">{actor.alive ? '存活' : '已击败'}</span>
      </div>
      <div className="mt-0.5 text-dd-muted">
        Stance {actor.stances.length > 0 ? actor.stances.map((s) => STANCE_LABEL[s]).join(' / ') : '—'}
      </div>
      <div className="text-dd-muted">Area {actor.areaId || '—'} · 第 {actor.generation} 代</div>
      <div className="text-dd-muted" data-testid={`${testId}-budget`}>
        本轮行动 {used} / {max}
      </div>
      <div className="mt-2">
        <CommunityVisual
          runtimeEntityId={visualEntityId}
          assetKind="guardian-battle-card"
          alt={`Community ${ROLE_LABEL[role]}`}
          className="w-full h-auto max-h-48 rounded border border-dd-border"
          testId={`shuffling-horror-visual-${role}`}
        />
      </div>
    </div>
  );
}

/** §3：official 未启用时说明「因缺哪些资料而禁用」。 */
export function ShufflingHorrorDataGateNote() {
  const report = getShufflingHorrorAvailabilityReport();
  if (report.officialEnabled) return null;
  return (
    <p
      className="mt-2 border-t border-dd-border pt-2 text-[11px] text-dd-muted"
      data-testid="shuffling-horror-data-gate-note"
    >
      正式 Shuffling Horror 内容当前不可用（{report.gaps.length} 项资料缺失）：
      {report.gaps.slice(0, 4).join('；')}
      {report.gaps.length > 4 ? ' …' : ''}
      。当前显示的是 prototype harness 数值，不代表正式规则。
    </p>
  );
}
