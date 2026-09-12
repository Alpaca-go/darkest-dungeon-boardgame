// Phase 10C §24：Mammoth Cyst / White Cell Stalk / Teleportation 只读展示面板。
//
// 硬约束对照：
// - §24.1：Cyst 与 Stalk **各自独立**显示（HP / Stance / Area / 存活），
//   绝不把 Stalk 画成 Cyst 的「附属数值」——它是独立 BattleActor（硬约束 2）；
// - §24.2：Initiative 区显示归属（Cyst 2 张 + Stalk 召唤后 2 张）；
//   Actor 死亡后其未抽的卡显示为「已失效」（硬约束 7）；
// - §24.3：Stalk 未召唤时明确显示「Reserve（未在场）」，而不是留空
//   （硬约束 3：初始只在 Reserve，不创建 Actor、不加 Initiative）；
// - §24.4：召唤历史显示 generation；Stalk 死亡后显示「下次 Cyst 行动时重新召唤」
//   （硬约束 6：死亡不立即重召唤）；
// - §24.5：Teleportation 历史显示已保存的 d10 与落点 Area，刷新后一致
//   （硬约束 14：先保存后展示）；
// - §3：official 未启用时明确说明「因缺哪些资料而禁用」。
//
// 本组件是纯展示：不修改任何状态，不发起任何随机。

import type { MammothCystActorState, MammothCystEncounterState } from '../../types/mammoth-cyst';
import { getMammothCystAvailabilityReport } from '../../game-engine/bosses/mammoth-cyst/mammoth-cyst-content-validation';
import CommunityVisual from './CommunityVisual';

interface Props {
  state: MammothCystEncounterState | null;
  /** 英雄 instanceId → 展示名，用于站位 / 传送区显示。 */
  heroNames?: Record<string, string>;
}

export default function MammothCystEncounterPanel({ state, heroNames }: Props) {
  if (!state) return null;

  const runtime = state.mammothCystBattleRuntime;
  const cyst = state.actorStates.find((a) => a.owner === 'mammoth-cyst') ?? null;
  const stalk =
    state.actorStates.find(
      (a) => a.owner === 'white-cell-stalk' && a.actorId === runtime.activeWhiteCellStalkActorId,
    ) ??
    state.actorStates.find((a) => a.owner === 'white-cell-stalk') ??
    null;
  const aliveStalkCount = state.actorStates.filter(
    (a) => a.owner === 'white-cell-stalk' && a.isAlive,
  ).length;
  const nameOf = (heroId: string) => heroNames?.[heroId] ?? heroId;

  return (
    <section
      className="rounded border border-dd-border bg-dd-panel/60 p-3 text-xs"
      data-testid="mammoth-cyst-encounter-panel"
    >
      <header className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-dd-text">Mammoth Cyst · Guardian 遭遇</h3>
        <span className="text-dd-muted" data-testid="mammoth-cyst-round">
          Round {state.round}
        </span>
      </header>

      {/* ---- §24.1 / §24.3 Cyst 与 Stalk 各自独立展示 ---- */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ActorCard actor={cyst} fallbackLabel="Mammoth Cyst" testId="mammoth-cyst-actor-boss" />
        {stalk ? (
          <ActorCard
            actor={stalk}
            fallbackLabel="White Cell Stalk"
            testId="mammoth-cyst-actor-stalk"
          />
        ) : (
          <div
            className="rounded border border-dashed border-dd-border p-2 text-dd-muted"
            data-testid="mammoth-cyst-stalk-reserve"
          >
            White Cell Stalk：Reserve（未在场）
            <div className="mt-0.5 text-[11px]">
              初始不创建 Actor、不加 Initiative；Cyst 行动且场上无 Stalk 时才召唤。
            </div>
          </div>
        )}
      </div>

      {/* ---- §24.2 Initiative 归属（Cyst 2 + Stalk 2）---- */}
      <div className="mb-3">
        <h4 className="mb-1 text-dd-muted">
          Initiative（Cyst 2 张{runtime.activeStalkInitiativeCardIds.length > 0 ? ' + Stalk 2 张' : '，Stalk 未召唤'}）
        </h4>
        <ul className="space-y-0.5" data-testid="mammoth-cyst-initiative-list">
          {state.initiativeCards.map((card) => {
            const owner = state.actorStates.find((a) => a.actorId === card.actorId);
            const resolved = state.resolvedInitiativeCardIds.includes(card.id);
            const dead = owner ? !owner.isAlive : true;
            return (
              <li
                key={card.id}
                className={`flex justify-between gap-2 ${
                  card.invalidated || dead ? 'text-dd-muted line-through' : 'text-dd-text'
                }`}
                data-testid={`mammoth-cyst-initiative-card-${card.id}`}
              >
                <span>
                  {owner?.name ?? card.actorId}
                  <span className="text-dd-muted"> · {card.owner}</span>
                </span>
                <span className="text-dd-muted">
                  {card.invalidated || dead ? '已失效' : resolved ? '已行动' : '待抽'}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-dd-muted">
          剩余牌堆 {state.initiativeDrawPile.length} 张 · 存活 Stalk {aliveStalkCount} / 上限 1
        </p>
      </div>

      {/* ---- §24.4 召唤历史（generation 递增；死亡不立即重召唤）---- */}
      <div className="mb-3">
        <h4 className="mb-1 text-dd-muted">White Cell Stalk 召唤历史</h4>
        <ul className="space-y-0.5" data-testid="mammoth-cyst-summon-history">
          {state.summonHistory.length === 0 ? (
            <li className="text-dd-muted">（尚未召唤）</li>
          ) : (
            state.summonHistory.slice(-6).map((rec) => (
              <li
                key={rec.id}
                className="flex justify-between gap-2"
                data-testid={`mammoth-cyst-summon-${rec.id}`}
              >
                <span className="text-dd-text">
                  第 {rec.generation} 次 · {rec.stance} / {rec.areaId}
                </span>
                <span className="text-dd-muted">{summonStatusLabel(rec.status)}</span>
              </li>
            ))
          )}
        </ul>
        {state.summonHistory.length > 0 && aliveStalkCount === 0 ? (
          <p className="mt-1 text-amber-400" data-testid="mammoth-cyst-resummon-note">
            Stalk 已阵亡 —— 不会立即重新召唤；**下一次 Cyst 行动**时才会重新召唤。
          </p>
        ) : null}
      </div>

      {/* ---- §24.5 Teleportation 历史（d10 已保存，刷新一致）---- */}
      <div className="mb-3">
        <h4 className="mb-1 text-dd-muted">Teleportation 历史（d10 已保存，刷新不重掷）</h4>
        <ul className="space-y-0.5" data-testid="mammoth-cyst-teleportation-history">
          {state.teleportationHistory.length === 0 ? (
            <li className="text-dd-muted">（尚无传送）</li>
          ) : (
            state.teleportationHistory.slice(-6).map((rec) => (
              <li
                key={rec.id}
                className="flex justify-between gap-2"
                data-testid={`mammoth-cyst-teleportation-${rec.id}`}
              >
                <span className="text-dd-text">
                  {nameOf(rec.targetHeroId)}：{rec.originalAreaId || '—'} →{' '}
                  {rec.targetAreaId || '（未解析）'}
                </span>
                <span className="text-dd-muted">
                  d10={rec.roll}
                  {rec.status === 'rolled-back' ? ' · 已回滚' : ''}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* ---- 英雄站位（Teleportation 后即时反映）---- */}
      <div className="mb-2">
        <h4 className="mb-1 text-dd-muted">英雄站位</h4>
        <ul className="space-y-0.5" data-testid="mammoth-cyst-hero-placements">
          {state.heroPlacements.map((p) => (
            <li key={p.heroId} className="flex justify-between gap-2">
              <span className="text-dd-text">{nameOf(p.heroId)}</span>
              <span className="text-dd-muted">{p.areaId}</span>
            </li>
          ))}
        </ul>
      </div>

      <MammothCystDataGateNote />
    </section>
  );
}

function summonStatusLabel(status: string): string {
  switch (status) {
    case 'creating':
      return '创建中';
    case 'active':
      return '在场';
    case 'defeated':
      return '已阵亡';
    case 'removed':
      return '已移除';
    case 'rolled-back':
      return '已回滚';
    default:
      return status;
  }
}

/** 单个 Actor 的独立卡片（§24.1：Cyst / Stalk 各自独立，不合并）。 */
function ActorCard({
  actor,
  fallbackLabel,
  testId,
}: {
  actor: MammothCystActorState | null;
  fallbackLabel: string;
  testId: string;
}) {
  if (!actor) {
    return (
      <div className="rounded border border-dd-border p-2 text-dd-muted">
        {fallbackLabel}：（未实例化）
      </div>
    );
  }
  return (
    <div
      className={`rounded border p-2 ${
        actor.isAlive ? 'border-dd-border' : 'border-dd-border/50 opacity-60'
      }`}
      data-testid={testId}
    >
      <div className="flex justify-between gap-2">
        <span className="font-semibold text-dd-text">{actor.name}</span>
        <span className="text-dd-muted">{actor.isAlive ? '存活' : '已击败'}</span>
      </div>
      <div className="mt-0.5 text-dd-muted">
        HP {actor.hp} / {actor.maxHp} · Stance {actor.stance}
      </div>
      <div className="text-dd-muted">
        Area {actor.areaId || '—'} · 每轮 {actor.actionsPerRound} 次行动
      </div>
      <div className="mt-2">
        <CommunityVisual
          runtimeEntityId={actor.owner === 'mammoth-cyst' ? 'community-dd-mammoth-cyst' : 'community-dd-white-cell-stalk'}
          assetKind="guardian-battle-card"
          alt={`Community ${actor.name}`}
          className="w-full h-auto max-h-48 rounded border border-dd-border"
          testId={`mammoth-cyst-visual-${actor.owner}`}
        />
      </div>
    </div>
  );
}

/** §3：official 未启用时说明「因缺哪些资料而禁用」。 */
export function MammothCystDataGateNote() {
  const report = getMammothCystAvailabilityReport();
  if (report.officialEnabled) return null;
  return (
    <p
      className="mt-2 border-t border-dd-border pt-2 text-[11px] text-dd-muted"
      data-testid="mammoth-cyst-data-gate-note"
    >
      正式 Mammoth Cyst 内容当前不可用（{report.gaps.length} 项资料缺失）：
      {report.gaps.slice(0, 4).join('；')}
      {report.gaps.length > 4 ? ' …' : ''}
      。当前显示的是 prototype harness 数值，不代表正式规则。
    </p>
  );
}
