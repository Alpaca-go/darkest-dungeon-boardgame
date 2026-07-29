import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/useGameStore';
import { SAVE_VERSION, readSavedAt } from '../../game-engine/save';

/**
 * 开发调试面板：仅在开发环境（import.meta.env.DEV）渲染。
 * 只读展示关键状态 + 少量安全操作（复制摘要/强制保存/回首页/清存档），
 * 不允许直接修改业务数据，避免引入状态污染。
 */
export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const manualSave = useGameStore((s) => s.manualSave);
  const resetCampaign = useGameStore((s) => s.resetCampaign);

  if (!import.meta.env.DEV) return null;

  const rows: Array<[string, string]> = [
    ['gamePhase', campaign?.gamePhase ?? '-'],
    ['route', location.pathname],
    ['questId', campaign?.currentQuestId ?? '-'],
    ['roomId', campaign?.dungeon?.currentRoomId ?? '-'],
    ['battle', campaign?.battle ? `${campaign.battle.status} R${campaign.battle.round}` : '-'],
    ['activeActorId', campaign?.battle?.activeActorId ?? '-'],
    ['hamlet', campaign ? `Day ${campaign.hamlet.currentDay} / 剩 ${campaign.hamlet.preparationDays} 天` : '-'],
    ['gold', String(campaign?.gold ?? '-')],
    ['saveVersion', `v${SAVE_VERSION}`],
    ['lastSavedAt', readSavedAt() ?? '-'],
  ];

  const copySummary = () => {
    const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
    void navigator.clipboard?.writeText(text);
  };

  return (
    <div className="fixed bottom-3 right-3 z-50 text-xs" data-testid="debug-panel">
      {open ? (
        <div className="w-64 rounded-md border border-dd-border bg-dd-panel shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-dd-text">Debug</span>
            <button onClick={() => setOpen(false)} className="text-dd-muted hover:text-dd-text">
              收起 ✕
            </button>
          </div>
          <dl className="space-y-0.5 mb-2">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-dd-muted shrink-0">{k}</dt>
                <dd className="text-dd-text truncate" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={copySummary} className="px-2 py-1 rounded bg-dd-panel2 border border-dd-border text-dd-muted hover:text-dd-text">
              复制摘要
            </button>
            <button onClick={manualSave} className="px-2 py-1 rounded bg-dd-panel2 border border-dd-border text-dd-muted hover:text-dd-text">
              强制保存
            </button>
            <button onClick={() => navigate('/')} className="px-2 py-1 rounded bg-dd-panel2 border border-dd-border text-dd-muted hover:text-dd-text">
              返回首页
            </button>
            <button
              onClick={() => {
                resetCampaign();
                navigate('/');
              }}
              className="px-2 py-1 rounded border border-red-500/60 text-red-400 hover:bg-red-500/10"
            >
              清除存档
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full border border-dd-border bg-dd-panel px-3 py-1.5 text-dd-muted hover:text-dd-text shadow-lg"
        >
          🐞 Debug
        </button>
      )}
    </div>
  );
}
