import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, routeForPhase } from '../store/useGameStore';
import { clearCampaign, loadSaveDetailed } from '../game-engine/save';
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
  const manualSave = useGameStore((s) => s.manualSave);
  const exportSave = useGameStore((s) => s.exportSave);
  const importSave = useGameStore((s) => s.importSave);

  const [confirm, setConfirm] = useState<null | 'new' | 'clear'>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 详细读档状态：区分损坏 / 版本不支持，给出明确提示。
  const saveDetail = loadSaveDetailed();
  const broken = saveDetail.status === 'corrupt' || saveDetail.status === 'unsupported';

  const doNew = () => {
    newCampaign();
    navigate('/setup');
  };

  const handleNew = () => {
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
    setNotice({ kind: 'ok', text: '本地存档已删除。' });
  };

  const handleManualSave = () => {
    manualSave();
    setNotice({ kind: 'ok', text: '已手动保存当前战役。' });
  };

  const handleExport = () => {
    const json = exportSave();
    if (!json) {
      setNotice({ kind: 'error', text: '没有可导出的存档。' });
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dd-save-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice({ kind: 'ok', text: '存档已导出为 JSON 文件。' });
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      setNotice({ kind: 'error', text: '导入失败：只接受 JSON 文件。' });
      return;
    }
    const text = await file.text();
    const err = importSave(text);
    if (err) {
      setNotice({ kind: 'error', text: err });
    } else {
      setNotice({ kind: 'ok', text: '存档导入成功。点击「继续战役」进入游戏。' });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 存档损坏 / 版本不支持：明确提示 + 删除存档 + 返回首页（不白屏、不静默重建）。
  if (broken && !campaign) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-4 text-dd-text">Darkest Dungeon · 网页原型</h1>
        <div className="rounded-lg border border-dd-accent bg-dd-panel p-5" data-testid="save-broken">
          <p className="text-dd-accent2 font-semibold mb-2">
            {saveDetail.status === 'unsupported' ? '存档版本不支持' : '存档已损坏'}
          </p>
          <p className="text-dd-muted text-sm mb-4">
            {saveDetail.error ?? '本地存档无法解析。'}
            你可以删除存档后重新开始，或从导出的 JSON 文件重新导入。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                clearCampaign();
                window.location.reload();
              }}
              className="px-4 py-2 rounded bg-dd-accent text-white hover:bg-dd-accent2 transition-colors"
            >
              删除存档
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded bg-dd-panel2 border border-dd-border text-dd-text hover:bg-dd-panel transition-colors"
            >
              导入存档
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
          />
          {notice && (
            <p className={`mt-3 text-sm ${notice.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {notice.text}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-1 text-dd-text">Darkest Dungeon · 网页原型</h1>
      <p className="text-dd-muted text-sm mb-6">
        单机 · 本地运行 · 可点击体验的桌游网页原型（Phase 5：完整闭环）
      </p>

      <div className="flex flex-wrap gap-3 mb-3">
        <button
          onClick={handleNew}
          className="px-4 py-2 rounded bg-dd-positive text-white font-semibold hover:brightness-110 transition-colors"
        >
          新建战役
        </button>
        <button
          onClick={handleContinue}
          disabled={!campaign}
          data-testid="btn-continue"
          className={[
            'px-4 py-2 rounded font-semibold transition-colors',
            campaign
              ? 'bg-dd-accent text-white hover:bg-dd-accent2'
              : 'bg-dd-panel2 text-dd-muted cursor-not-allowed',
          ].join(' ')}
        >
          继续游戏
        </button>
      </div>

      {/* 存档管理 */}
      <div className="flex flex-wrap gap-2 mb-6 text-sm">
        <button
          onClick={handleManualSave}
          disabled={!campaign}
          className={[
            'px-3 py-1.5 rounded border border-dd-border transition-colors',
            campaign ? 'text-dd-muted hover:text-dd-text hover:bg-dd-panel2' : 'text-dd-muted/50 cursor-not-allowed',
          ].join(' ')}
        >
          手动保存
        </button>
        <button
          onClick={handleExport}
          disabled={!campaign}
          className={[
            'px-3 py-1.5 rounded border border-dd-border transition-colors',
            campaign ? 'text-dd-muted hover:text-dd-text hover:bg-dd-panel2' : 'text-dd-muted/50 cursor-not-allowed',
          ].join(' ')}
        >
          导出存档
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded border border-dd-border text-dd-muted hover:text-dd-text hover:bg-dd-panel2 transition-colors"
        >
          导入存档
        </button>
        <button
          onClick={() => setConfirm('clear')}
          disabled={!campaign}
          className={[
            'px-3 py-1.5 rounded border border-dd-border transition-colors',
            campaign ? 'text-red-400/80 hover:text-red-400 hover:bg-red-500/10' : 'text-dd-muted/50 cursor-not-allowed',
          ].join(' ')}
        >
          删除存档
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {notice && (
        <p
          className={`mb-4 text-sm ${notice.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}
          data-testid="home-notice"
        >
          {notice.text}
        </p>
      )}

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
              <dd className="text-dd-text">{campaign.heroes.length} / 4</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dd-muted">Gold</dt>
              <dd className="text-dd-text">{campaign.gold}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dd-muted">已完成任务</dt>
              <dd className="text-dd-text">{campaign.completedQuestCount}</dd>
            </div>
            <div className="flex justify-between">
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
        title="删除本地存档？"
        message="这将删除本机保存的战役数据，且无法恢复。建议先导出存档备份。是否继续？"
        confirmText="删除存档"
        danger
        onConfirm={handleClear}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
