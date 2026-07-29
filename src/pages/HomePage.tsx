import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, routeForPhase } from '../store/useGameStore';
import { isCorrupt, clearCampaign } from '../game-engine/save';
import { getQuestById } from '../data/quests';
import ConfirmModal from '../components/feedback/ConfirmModal';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

export default function HomePage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const newCampaign = useGameStore((s) => s.newCampaign);
  const continueCampaign = useGameStore((s) => s.continueCampaign);
  const resetCampaign = useGameStore((s) => s.resetCampaign);

  const [confirm, setConfirm] = useState<null | 'new' | 'clear'>(null);

  const corrupt = isCorrupt();

  const doNew = () => {
    newCampaign();
    navigate('/setup');
  };

  const handleNew = () => {
    // 已有存档时避免覆盖，弹出确认。
    if (campaign) setConfirm('new');
    else doNew();
  };

  const handleContinue = () => {
    if (!campaign) return;
    continueCampaign();
    navigate(routeForPhase(campaign.gamePhase));
  };

  const handleClear = () => {
    resetCampaign();
    setConfirm(null);
  };

  // 存档损坏：提示并提供清除入口，避免页面崩溃。
  if (corrupt) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-4 text-dd-text">Darkest Dungeon · 网页原型</h1>
        <div className="rounded-lg border border-dd-accent bg-dd-panel p-5">
          <p className="text-dd-accent2 font-semibold mb-2">存档已损坏</p>
          <p className="text-dd-muted text-sm mb-4">
            本地存档无法解析，可能是旧版本或不完整数据。你可以清除存档后重新开始。
          </p>
          <button
            onClick={() => {
              clearCampaign();
              window.location.reload();
            }}
            className="px-4 py-2 rounded bg-dd-accent text-white hover:bg-dd-accent2 transition-colors"
          >
            清除损坏存档
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-1 text-dd-text">Darkest Dungeon · 网页原型</h1>
      <p className="text-dd-muted text-sm mb-6">
        单机 · 本地运行 · 可点击体验的桌游网页原型（第一阶段：项目骨架）
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={handleNew}
          className="px-4 py-2 rounded bg-dd-positive text-white font-semibold hover:brightness-110 transition-colors"
        >
          新建战役
        </button>
        <button
          onClick={handleContinue}
          disabled={!campaign}
          className={[
            'px-4 py-2 rounded font-semibold transition-colors',
            campaign
              ? 'bg-dd-accent text-white hover:bg-dd-accent2'
              : 'bg-dd-panel2 text-dd-muted cursor-not-allowed',
          ].join(' ')}
        >
          继续战役
        </button>
        <button
          onClick={() => setConfirm('clear')}
          disabled={!campaign}
          className={[
            'px-4 py-2 rounded border border-dd-border transition-colors',
            campaign
              ? 'text-dd-muted hover:text-dd-text hover:bg-dd-panel2'
              : 'text-dd-muted/50 cursor-not-allowed',
          ].join(' ')}
        >
          清除本地存档
        </button>
      </div>

      <div className="rounded-lg border border-dd-border bg-dd-panel p-5">
        <h2 className="text-sm font-bold text-dd-text mb-3 tracking-wide">存档摘要</h2>
        {campaign ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-dd-muted">Act</dt>
              <dd className="text-dd-text">{campaign.act}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dd-muted">任务</dt>
              <dd className="text-dd-text">
                {campaign.currentQuestId
                  ? getQuestById(campaign.currentQuestId)?.name ?? campaign.currentQuestId
                  : '未选择'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dd-muted">已选英雄</dt>
              <dd className="text-dd-text">
                {campaign.heroes.length} / 4
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dd-muted">Gold</dt>
              <dd className="text-dd-text">{campaign.gold}</dd>
            </div>
            <div className="flex justify-between col-span-2">
              <dt className="text-dd-muted">保存时间</dt>
              <dd className="text-dd-text">{formatTime(campaign.updatedAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-dd-muted text-sm">当前没有进行中的战役。点击“新建战役”开始。</p>
        )}
      </div>

      <ConfirmModal
        open={confirm === 'new'}
        title="覆盖现有存档？"
        message="已存在进行中的战役。新建战役将覆盖当前存档，且无法恢复。是否继续？"
        confirmText="覆盖并新建"
        danger
        onConfirm={() => {
          setConfirm(null);
          doNew();
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'clear'}
        title="清除本地存档？"
        message="这将删除本机保存的战役数据，且无法恢复。是否继续？"
        confirmText="清除存档"
        danger
        onConfirm={handleClear}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
