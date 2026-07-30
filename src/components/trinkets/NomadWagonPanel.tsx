import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { nomadWagonOfferDetails, nomadWagonVisitError } from '../../game-engine/nomad-wagon';
import { getTrinketById } from '../../data/trinkets/trinket-registry';
import { sellPriceForLevel } from '../../data/trinkets/trinket-pricing';

interface Props {
  heroId: string;
  onClose: () => void;
}

/**
 * Phase 8C：Nomad Wagon（流浪商队）交易面板。
 * - 挂载时经 store.openNomadWagon 确保本次 Hamlet 的 Offer 已生成（幂等、立即落盘）；
 * - 购买位展示来自官方池的饰品，Level I 买价 4、II/III 无官方买价则禁用购买；
 * - 卖出位展示英雄自身饰品，卖价由等级决定（2/3/4）；
 * - 一次访问至多各 1 件买/卖；取消 = 不提交，不产生任何扣费。
 */
export default function NomadWagonPanel({ heroId, onClose }: Props) {
  const campaign = useGameStore((s) => s.campaign);
  const openNomadWagon = useGameStore((s) => s.openNomadWagon);
  const commit = useGameStore((s) => s.commitNomadWagonVisit);
  const [sellInstanceId, setSellInstanceId] = useState<string | undefined>(undefined);
  const [buyTrinketId, setBuyTrinketId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    openNomadWagon();
    // 仅挂载时尝试生成 Offer；已生成则幂等返回，无副作用。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!campaign) return null;
  const hero = campaign.heroes.find((h) => h.instanceId === heroId);
  if (!hero) return null;

  const offers = nomadWagonOfferDetails(campaign);
  const visitErr = nomadWagonVisitError(campaign, heroId);

  const onCommit = () => {
    const err = commit({ heroId, sellInstanceId, buyTrinketId });
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[58] flex items-center justify-center bg-black/75 p-4"
      data-testid="nomad-wagon-panel"
    >
      <div className="w-full max-w-md rounded-lg border-2 border-amber-500/70 bg-dd-panel p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-dd-text">Nomad Wagon（流浪商队）</div>
          <button
            type="button"
            onClick={onClose}
            className="text-dd-muted hover:text-dd-text text-sm"
            data-testid="nomad-wagon-close"
          >
            关闭
          </button>
        </div>
        <p className="text-xs text-dd-muted mt-1">
          访问英雄：<span className="text-dd-text">{hero.name}</span> · 本次访问至多卖出 1 件、买入 1 件。
        </p>

        {visitErr && (
          <div className="text-[11px] text-red-400 mt-2" data-testid="nomad-wagon-visit-error">
            {visitErr}
          </div>
        )}

        {/* 展示位（购买） */}
        <div className="mt-3">
          <div className="text-sm font-semibold text-dd-text mb-1">展示位（点击买入）</div>
          {offers.length === 0 ? (
            <div className="text-[11px] text-dd-muted">今日没有可购买的饰品。</div>
          ) : (
            <div className="space-y-2">
              {offers.map(({ definition, buyPrice, buyDisabledNote }) => (
                <div
                  key={definition.id}
                  className={[
                    'rounded border p-2',
                    buyTrinketId === definition.id
                      ? 'border-amber-400 bg-amber-950/20'
                      : 'border-dd-border bg-dd-panel2',
                  ].join(' ')}
                  data-testid={`nomad-offer-${definition.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dd-text">{definition.name}</span>
                    <span className="text-[11px] text-dd-warn">
                      {buyPrice === null ? '不可购买' : `${buyPrice} Gold`}
                    </span>
                  </div>
                  <div className="text-[10px] text-dd-muted mt-0.5">
                    {definition.positiveSide.label} / {definition.negativeSide.label}
                  </div>
                  {buyPrice !== null && (
                    <button
                      type="button"
                      disabled={!!visitErr || campaign.gold < buyPrice}
                      onClick={() => setBuyTrinketId(buyTrinketId === definition.id ? undefined : definition.id)}
                      className="mt-1.5 px-2 py-1 rounded bg-amber-700 text-white text-xs hover:brightness-110 disabled:opacity-50"
                      data-testid={`nomad-buy-${definition.id}`}
                    >
                      {buyTrinketId === definition.id ? '已选（点击取消）' : '选择购买'}
                    </button>
                  )}
                  {buyDisabledNote && (
                    <div className="text-[10px] text-red-400 mt-1">{buyDisabledNote}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 自身饰品（卖出） */}
        <div className="mt-3">
          <div className="text-sm font-semibold text-dd-text mb-1">出售你的饰品</div>
          {(hero.equippedTrinkets ?? []).length === 0 ? (
            <div className="text-[11px] text-dd-muted">你身上没有可出售的饰品。</div>
          ) : (
            <div className="space-y-1.5">
              {(hero.equippedTrinkets ?? []).map((t) => {
                const def = getTrinketById(t.trinketId);
                const price = def ? sellPriceForLevel(def.level) : 0;
                return (
                  <div
                    key={t.instanceId}
                    className={[
                      'flex items-center justify-between rounded border p-2',
                      sellInstanceId === t.instanceId
                        ? 'border-amber-400 bg-amber-950/20'
                        : 'border-dd-border bg-dd-panel2',
                    ].join(' ')}
                    data-testid={`nomad-sell-${t.instanceId}`}
                  >
                    <div>
                      <div className="text-xs text-dd-text">{def?.name ?? t.trinketId}</div>
                      <div className="text-[10px] text-dd-warn">+{price} Gold</div>
                    </div>
                    <button
                      type="button"
                      disabled={!!visitErr}
                      onClick={() => setSellInstanceId(sellInstanceId === t.instanceId ? undefined : t.instanceId)}
                      className="px-2 py-1 rounded bg-amber-700 text-white text-xs hover:brightness-110 disabled:opacity-50"
                      data-testid={`nomad-sell-btn-${t.instanceId}`}
                    >
                      {sellInstanceId === t.instanceId ? '已选' : '选择出售'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="text-[11px] text-red-400 mt-2" data-testid="nomad-wagon-error">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-dd-panel2 border border-dd-border text-dd-muted text-sm hover:text-dd-text"
            data-testid="nomad-wagon-cancel"
          >
            取消（不交易）
          </button>
          <button
            type="button"
            disabled={!!visitErr}
            onClick={onCommit}
            className="px-3 py-1.5 rounded bg-amber-600 text-white font-semibold text-sm hover:brightness-110 disabled:opacity-50"
            data-testid="nomad-wagon-confirm"
          >
            完成交易
          </button>
        </div>
      </div>
    </div>
  );
}
