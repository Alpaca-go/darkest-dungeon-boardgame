// Phase 10B §25 / §26：The Templars 遭遇只读展示面板。
//
// 硬约束对照：
// - §25.1：两名 Templar **各自独立**显示（HP / Stance / Area / 存活），
//   绝不合并为一个 Boss 条目——UI 必须让玩家看出这是两个独立 Boss Actor；
// - §25.2：Initiative 区显示 2 + 2 的归属；某名死亡后其卡显示为「已失效」，
//   另一名仍正常显示；
// - §25.3：Spiked Pit 显示为 **Room 元素**，不是可选中的战斗单位
//   （无 HP 条、无 Initiative、不可点击攻击）；
// - §25.4：Pit Toss 结果显示已保存的 d10 与落点 Pit，刷新后一致；
// - §22：official 未启用时明确说明「因缺哪些资料而禁用」。
//
// 本组件是纯展示：不修改任何状态，不发起任何随机。

import type { TemplarsEncounterState } from '../../types/templars';
import { getTemplarsAvailabilityReport } from '../../game-engine/bosses/templars/templars-content-validation';

interface Props {
  state: TemplarsEncounterState | null;
  /** 英雄 instanceId → 展示名，用于 Pit / 站位区显示。 */
  heroNames?: Record<string, string>;
}

export default function TemplarsEncounterPanel({ state, heroNames }: Props) {
  if (!state) return null;

  const runtime = state.templarsBattleRuntime;
  const impaler = state.actorStates.find((a) => a.role === 'impaler') ?? null;
  const warlord = state.actorStates.find((a) => a.role === 'warlord') ?? null;
  const nameOf = (heroId: string) => heroNames?.[heroId] ?? heroId;

  return (
    <section
      className="rounded border border-dd-border bg-dd-panel/60 p-3 text-xs"
      data-testid="templars-encounter-panel"
    >
      <header className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-dd-text">The Templars · 双 Boss 遭遇</h3>
        <span className="text-dd-muted" data-testid="templars-round">
          Round {state.round}
        </span>
      </header>

      {/* ---- §25.1 两名 Templar 独立展示（绝不合并）---- */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TemplarCard actor={impaler} fallbackLabel="Impaler" />
        <TemplarCard actor={warlord} fallbackLabel="Warlord" />
      </div>

      {/* ---- §25.2 Initiative 2 + 2 归属 ---- */}
      <div className="mb-3">
        <h4 className="mb-1 text-dd-muted">Initiative（2 + 2）</h4>
        <ul className="space-y-0.5" data-testid="templars-initiative-list">
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
                data-testid={`templars-initiative-card-${card.id}`}
              >
                <span>
                  {owner?.name ?? card.actorId}
                  <span className="text-dd-muted"> · {card.role}</span>
                </span>
                <span className="text-dd-muted">
                  {card.invalidated || dead ? '已失效' : resolved ? '已行动' : '待抽'}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-dd-muted">
          剩余牌堆 {state.initiativeDrawPile.length} 张 · 存活 Boss{' '}
          {runtime.activeBossActorIds.length} / {runtime.activeBossActorIds.length + runtime.defeatedBossActorIds.length}
        </p>
      </div>

      {/* ---- §25.3 Spiked Pit 作为 Room 元素（无 HP / 无 Initiative / 不可选中）---- */}
      <div className="mb-3">
        <h4 className="mb-1 text-dd-muted">Spiked Pit（Room 元素 · 非战斗单位）</h4>
        <ul className="space-y-0.5" data-testid="templars-pit-list">
          {state.spikedPitRuntime.map((pit) => (
            <li
              key={pit.id}
              className="flex justify-between gap-2 text-dd-text"
              data-testid={`templars-pit-${pit.pitDefinitionId}`}
            >
              <span>{pit.pitDefinitionId}</span>
              <span className="text-dd-muted">
                {pit.occupantActorIds.length === 0
                  ? '空'
                  : pit.occupantActorIds.map(nameOf).join('、')}
              </span>
            </li>
          ))}
          {state.spikedPitRuntime.length === 0 ? (
            <li className="text-dd-muted">（本 Room 未定义 Spiked Pit）</li>
          ) : null}
        </ul>
      </div>

      {/* ---- §25.4 Pit Toss 已保存结果（刷新一致）---- */}
      <div className="mb-2">
        <h4 className="mb-1 text-dd-muted">Pit Toss 历史（d10 已保存，刷新不重掷）</h4>
        <ul className="space-y-0.5" data-testid="templars-pit-toss-history">
          {state.pitTossHistory.length === 0 ? (
            <li className="text-dd-muted">（尚无 Pit Toss）</li>
          ) : (
            state.pitTossHistory.slice(-6).map((rec) => (
              <li key={rec.id} className="flex justify-between gap-2" data-testid={`templars-pit-toss-${rec.id}`}>
                <span className="text-dd-text">
                  {nameOf(rec.targetHeroId)} → {rec.targetPitId || '（未知 Pit）'}
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

      {/* ---- 英雄站位（含是否位于 Pit 内）---- */}
      <div className="mb-2">
        <h4 className="mb-1 text-dd-muted">英雄站位</h4>
        <ul className="space-y-0.5" data-testid="templars-hero-placements">
          {state.heroPlacements.map((p) => (
            <li key={p.heroId} className="flex justify-between gap-2">
              <span className="text-dd-text">{nameOf(p.heroId)}</span>
              <span className={p.pitId ? 'text-red-400' : 'text-dd-muted'}>
                {p.pitId ? `坑中：${p.pitId}` : p.areaId}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <TemplarsDataGateNote />
    </section>
  );
}

/** 单名 Templar 的独立卡片（§25.1：两名各自独立，不合并）。 */
function TemplarCard({
  actor,
  fallbackLabel,
}: {
  actor: { actorId: string; name: string; role: string; hp: number; maxHp: number; isAlive: boolean; stance: string; areaId: string } | null;
  fallbackLabel: string;
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
      className={`rounded border p-2 ${actor.isAlive ? 'border-dd-border' : 'border-dd-border/50 opacity-60'}`}
      data-testid={`templar-actor-${actor.role}`}
    >
      <div className="flex justify-between gap-2">
        <span className="font-semibold text-dd-text">{actor.name}</span>
        <span className="text-dd-muted">{actor.isAlive ? '存活' : '已击败'}</span>
      </div>
      <div className="mt-0.5 text-dd-muted">
        HP {actor.hp} / {actor.maxHp} · Stance {actor.stance}
      </div>
      <div className="text-dd-muted">Area {actor.areaId || '—'}</div>
    </div>
  );
}

/** §22：official 未启用时说明「因缺哪些资料而禁用」。 */
export function TemplarsDataGateNote() {
  const report = getTemplarsAvailabilityReport();
  if (report.officialEnabled) return null;
  return (
    <p className="mt-2 border-t border-dd-border pt-2 text-[11px] text-dd-muted" data-testid="templars-data-gate-note">
      正式 The Templars 内容当前不可用（{report.gaps.length} 项资料缺失）：
      {report.gaps.slice(0, 4).join('；')}
      {report.gaps.length > 4 ? ' …' : ''}
      。当前显示的是 prototype harness 数值，不代表正式规则。
    </p>
  );
}
