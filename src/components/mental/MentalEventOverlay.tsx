import { useState } from 'react';
import type { MentalEvent } from '../../types';
import { useGameStore } from '../../store/useGameStore';
import { getVirtueById } from '../../data/virtues';
import { getAfflictionById } from '../../data/afflictions';

/** 需要弹层展示的精神事件类型。 */
const OVERLAY_TYPES: MentalEvent['type'][] = ['virtue-gained', 'affliction-gained', 'heart-attack'];

/**
 * Phase 7：Resolve Test / Heart Attack 结果浮层（纯展示层）。
 * 规则结果已由引擎先写入存档，本组件只读 mentalEvents 依次弹出未确认的事件；
 * 挂载时把「已确认」水位初始化为当前最新事件（刷新后不会重复弹出历史事件）。
 */
export default function MentalEventOverlay() {
  const campaign = useGameStore((s) => s.campaign);
  const [dismissedUpTo, setDismissedUpTo] = useState<number>(() => {
    const events = useGameStore.getState().campaign?.mentalEvents ?? [];
    return events.length > 0 ? events[events.length - 1].sequence : 0;
  });

  if (!campaign) return null;

  const pending = campaign.mentalEvents.filter(
    (e) => e.sequence > dismissedUpTo && OVERLAY_TYPES.includes(e.type)
  );
  const event = pending[0];
  if (!event) return null;

  const hero = campaign.heroes.find((h) => h.instanceId === event.heroId);
  const heroName = hero?.name ?? event.heroId;

  // 找到同英雄、序号更早且最接近的 resolve-test 事件，用于展示掷骰
  const testEvent = [...campaign.mentalEvents]
    .reverse()
    .find((e) => e.type === 'resolve-test' && e.heroId === event.heroId && e.sequence < event.sequence);

  const isVirtue = event.type === 'virtue-gained';
  const isHeartAttack = event.type === 'heart-attack';
  const card = isHeartAttack
    ? undefined
    : isVirtue
      ? getVirtueById(event.resultId ?? '')
      : getAfflictionById(event.resultId ?? '');

  const title = isHeartAttack ? '心脏病发作！' : isVirtue ? '美德觉醒！' : '精神崩溃！';
  const tone = isHeartAttack
    ? 'border-red-500 text-red-300'
    : isVirtue
      ? 'border-amber-400 text-amber-300'
      : 'border-fuchsia-500 text-fuchsia-300';

  const dismiss = () => setDismissedUpTo(event.sequence);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      data-testid="mental-event-overlay"
    >
      <div className={`w-full max-w-sm rounded-lg border-2 bg-dd-panel p-5 shadow-2xl ${tone}`}>
        <div className="text-lg font-bold mb-2" data-testid="mental-overlay-title">
          {title}
        </div>
        <div className="text-sm text-dd-text space-y-1.5">
          {isHeartAttack ? (
            <>
              <p>
                <span className="font-semibold">{heroName}</span> 的 Stress 在 Resolve
                之后再次达到上限，心脏骤停——
                <span className="text-red-400 font-bold">立即死亡</span>（无 Deathblow 判定）。
              </p>
            </>
          ) : (
            <>
              <p>
                <span className="font-semibold">{heroName}</span> 的 Stress 达到上限，进行 Resolve
                Test{testEvent?.roll !== undefined ? `：d10 = ${testEvent.roll}` : ''}。
              </p>
              <p>
                获得{isVirtue ? ' Virtue' : ' Affliction'}：
                <span className="font-bold">{card?.name ?? event.resultId}</span>
              </p>
              {card && <p className="text-dd-muted text-xs">{card.description}</p>}
              <p className="text-dd-muted text-xs">Stress 已重置为 0。</p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full rounded border border-dd-border bg-dd-panel2 px-3 py-1.5 text-sm text-dd-text hover:bg-dd-panel transition-colors"
          data-testid="mental-overlay-confirm"
        >
          确认
        </button>
      </div>
    </div>
  );
}
