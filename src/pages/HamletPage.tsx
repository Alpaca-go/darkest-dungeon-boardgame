import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore, routeForPhase } from '../store/useGameStore';
import { HAMLET_BUILDINGS, getHamletBuildingById } from '../data/hamlet-buildings';
import { getHamletEventById } from '../data/hamlet-events';
import { buildingVisitError, canEndHamletDay } from '../game-engine/hamlet';
import { getHeroById } from '../data/heroes';
import { getQuirkById } from '../data/quirks';
import { getDiseaseById } from '../data/diseases';
import { SANITARIUM_SERVICES } from '../game-engine/hamlet/sanitarium';
import HamletEventCard from '../components/hamlet/HamletEventCard';
import HamletBuildingCard from '../components/hamlet/HamletBuildingCard';
import HamletHeroCard from '../components/hamlet/HamletHeroCard';
import HamletLog from '../components/hamlet/HamletLog';
import GuildPanel from '../components/hamlet/GuildPanel';
import BlacksmithPanel from '../components/hamlet/BlacksmithPanel';
import { guildVisitError } from '../game-engine/hamlet/guild';
import { blacksmithVisitError } from '../game-engine/hamlet/blacksmith';
import NomadWagonPanel from '../components/trinkets/NomadWagonPanel';
import { NOMAD_WAGON_BUILDING_ID, NOMAD_WAGON_NAME } from '../data/nomad-wagon';
import { nomadWagonVisitError } from '../game-engine/nomad-wagon';

/**
 * Hamlet 页 /hamlet：
 * 顶部资源条 / 左侧英雄 / 中部建筑 / 右侧事件 + 日志 + 结束当天。
 * 交互：先选中英雄，再点击建筑访问；或对英雄点击「跳过今天行动」。
 */
export default function HamletPage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const visitBuilding = useGameStore((s) => s.visitBuilding);
  const skipHeroToday = useGameStore((s) => s.skipHeroToday);
  const endHamletDay = useGameStore((s) => s.endHamletDay);
  const visitAbbey = useGameStore((s) => s.visitAbbey);
  const visitSanitariumRemoveDisease = useGameStore((s) => s.visitSanitariumRemoveDisease);
  const sanitariumRemoveDiseaseError = useGameStore((s) => s.sanitariumRemoveDiseaseError);
  const startGuildVisit = useGameStore((s) => s.startGuildVisit);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  // Phase 8A：Abbey 需要选择移除哪个 Quirk，用局部弹层承载（不写入存档）。
  const [abbeyHeroId, setAbbeyHeroId] = useState<string | null>(null);
  // Phase 8B：Sanitarium 有两项服务（治疗 3 Gold / 治病 2 Gold），同样用局部弹层选择。
  const [sanitariumHeroId, setSanitariumHeroId] = useState<string | null>(null);
  // Phase 8D：Blacksmith 需要选择技能（Guild 的会话状态存在 campaign 里，刷新可续做）。
  const [blacksmithHeroId, setBlacksmithHeroId] = useState<string | null>(null);
  // Phase 8C：Nomad Wagon 入口（建筑列表中无此条目，单独作为流浪商队入口）。
  const [nomadHeroId, setNomadHeroId] = useState<string | null>(null);

  // preparationDays 归零后 gamePhase → quest-select，自动跳转下一任务选择。
  const gamePhase = campaign?.gamePhase;
  useEffect(() => {
    if (gamePhase === 'quest-select') navigate('/quests');
  }, [gamePhase, navigate]);

  if (!campaign) return <Navigate to="/" replace />;
  if (campaign.gamePhase !== 'hamlet') {
    return <Navigate to={routeForPhase(campaign.gamePhase)} replace />;
  }

  const hamlet = campaign.hamlet;
  const event = getHamletEventById(hamlet.currentEventId);
  const blockedBuilding = getHamletBuildingById(hamlet.caretakerBlockedBuildingId);
  const canEnd = canEndHamletDay(campaign);
  const selectedHero = campaign.heroes.find((h) => h.instanceId === selectedHeroId) ?? null;

  const abbeyHero = campaign.heroes.find((h) => h.instanceId === abbeyHeroId) ?? null;
  const sanitariumHero = campaign.heroes.find((h) => h.instanceId === sanitariumHeroId) ?? null;
  const blacksmithHero =
    campaign.heroes.find((h) => h.instanceId === blacksmithHeroId) ?? null;
  // Phase 8D：Guild 会话持久化在 campaign 中，刷新后可以继续未提交的选择。
  const guildSession =
    campaign.guildVisitSession && !campaign.guildVisitSession.committed
      ? campaign.guildVisitSession
      : null;
  const guildHero =
    campaign.heroes.find((h) => h.instanceId === guildSession?.heroInstanceId) ?? null;

  const onVisit = (buildingId: string) => {
    if (!selectedHeroId) return;
    // Abbey / Sanitarium / Guild / Blacksmith 走二次选择流程，其余建筑直接结算。
    if (buildingId === 'abbey') {
      setAbbeyHeroId(selectedHeroId);
      return;
    }
    if (buildingId === 'sanitarium') {
      setSanitariumHeroId(selectedHeroId);
      return;
    }
    if (buildingId === 'guild') {
      startGuildVisit(selectedHeroId);
      return;
    }
    if (buildingId === 'blacksmith') {
      setBlacksmithHeroId(selectedHeroId);
      return;
    }
    if (buildingId === NOMAD_WAGON_BUILDING_ID) {
      setNomadHeroId(selectedHeroId);
      return;
    }
    visitBuilding(selectedHeroId, buildingId);
    setSelectedHeroId(null);
  };

  const onAbbeyRemove = (quirkId: string) => {
    if (!abbeyHeroId) return;
    visitAbbey(abbeyHeroId, quirkId);
    setAbbeyHeroId(null);
    setSelectedHeroId(null);
  };

  return (
    <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
      {/* 顶部状态条 */}
      <div className="rounded-lg border border-dd-border bg-dd-panel px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <h1 className="text-lg font-bold text-dd-text mr-2">村庄（Hamlet）</h1>
        <span className="text-dd-muted">
          Gold <span className="text-dd-warn font-bold">{campaign.gold}</span>
        </span>
        <span className="text-dd-muted">
          第 <span className="text-dd-text font-bold">{hamlet.currentDay}</span> 天
        </span>
        <span className="text-dd-muted">
          剩余准备天数 <span className="text-dd-text font-bold">{hamlet.preparationDays}</span>
        </span>
        <span className="text-dd-muted">
          Caretaker 阻塞：
          <span className="text-red-400 font-bold"> {blockedBuilding?.name ?? '无'}</span>
        </span>
        {/* Phase 11A.1 §22 最小 UI：Campaign 状态条 */}
        <span className="text-dd-muted">
          Act <span className="text-dd-text font-bold">{campaign.campaignProgress.act}</span>
          {' '}/ Level {campaign.campaignProgress.campaignLevel}
        </span>
        <span className="text-dd-muted">
          完成任务：
          <span className="text-dd-text font-bold">
            {campaign.campaignProgress.completedStandardQuestsThisAct}/{campaign.campaignProgress.requiredStandardQuestsBeforeBoss}
          </span>
        </span>
        {campaign.campaignProgress.activeBossFamilyId ? (
          <span className="text-dd-muted">
            迫近威胁：
            <span className="text-dd-danger font-bold">
              {campaign.campaignProgress.activeBossFamilyId}
            </span>
          </span>
        ) : null}
        {campaign.campaignProgress.darkestDungeonUnlocked ? (
          <span className="text-dd-accent2 font-bold">Darkest Dungeon Unlocked</span>
        ) : null}
      </div>

      <div className="grid lg:grid-cols-[240px_1fr_280px] gap-4">
        {/* 左：英雄 */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-dd-text">
            小队{selectedHero ? ` · 已选中 ${selectedHero.name}` : ''}
          </h2>
          {campaign.heroes.map((h) => (
            <HamletHeroCard
              key={h.instanceId}
              hero={h}
              color={getHeroById(h.heroId)?.color ?? '#463b34'}
              selected={h.instanceId === selectedHeroId}
              onSelect={() =>
                setSelectedHeroId(h.instanceId === selectedHeroId ? null : h.instanceId)
              }
              onSkip={() => {
                skipHeroToday(h.instanceId);
                if (selectedHeroId === h.instanceId) setSelectedHeroId(null);
              }}
            />
          ))}
        </div>

        {/* 中：建筑 */}
        <div>
          <h2 className="text-sm font-bold text-dd-text mb-2">
            建筑{selectedHero ? '（点击访问）' : '（先在左侧选中一名英雄）'}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {HAMLET_BUILDINGS.map((b) => {
              let reason = selectedHeroId
                ? buildingVisitError(campaign, selectedHeroId, b.id)
                : '请先选择英雄';
              // Phase 8B：Sanitarium 有两项服务，任一可用即可进入（治病不要求有伤）。
              if (selectedHeroId && b.id === 'sanitarium' && reason) {
                const diseaseReason = sanitariumRemoveDiseaseError(selectedHeroId);
                if (!diseaseReason) reason = null;
              }
              // Phase 8D：Guild / Blacksmith 的可用性由各自专用校验决定。
              if (selectedHeroId && b.id === 'guild') {
                reason = guildVisitError(campaign, selectedHeroId);
              }
              if (selectedHeroId && b.id === 'blacksmith') {
                const hero = campaign.heroes.find((h) => h.instanceId === selectedHeroId);
                // 任意已装备技能可买 Form 即视为建筑可用
                const anyOk = (hero?.equippedSkillIds ?? []).some(
                  (sid) => blacksmithVisitError(campaign, selectedHeroId, sid) === null
                );
                if (anyOk) reason = null;
                else if (!reason) reason = '没有可临时强化的技能';
              }
              return (
                <HamletBuildingCard
                  key={b.id}
                  building={b}
                  blocked={hamlet.caretakerBlockedBuildingId === b.id}
                  occupied={hamlet.occupiedBuildingIds.includes(b.id)}
                  disabledReason={reason}
                  onVisit={() => onVisit(b.id)}
                />
              );
            })}
            {/* Phase 8C：Nomad Wagon（流浪商队）入口：建筑列表无此条目，单独作为商队卡片 */}
            <button
              type="button"
              onClick={() => onVisit(NOMAD_WAGON_BUILDING_ID)}
              disabled={!selectedHeroId}
              title={
                selectedHeroId
                  ? nomadWagonVisitError(campaign, selectedHeroId) ?? `花费 Gold：买卖饰品`
                  : '请先选择英雄'
              }
              className={[
                'relative rounded-lg border p-3 text-left transition-all w-full',
                hamlet.caretakerBlockedBuildingId === NOMAD_WAGON_BUILDING_ID
                  ? 'border-red-500/60 bg-red-500/5 cursor-not-allowed'
                  : !selectedHeroId
                  ? 'border-dd-border bg-dd-panel opacity-60 cursor-not-allowed'
                  : 'border-dd-border bg-dd-panel hover:border-dd-accent hover:-translate-y-0.5',
              ].join(' ')}
              data-testid="building-nomad-wagon"
            >
              <div
                className="w-full h-14 rounded mb-2"
                style={{ background: '#7c5e3b' }}
                aria-hidden
              />
              <div className="flex items-baseline justify-between gap-1">
                <span className="font-bold text-dd-text text-sm">{NOMAD_WAGON_NAME}</span>
                <span className="text-[11px] text-dd-warn shrink-0">交易</span>
              </div>
              <p className="text-[11px] text-dd-muted mt-1">
                买卖饰品（展示位由建筑等级决定，Level I 至多 3 件）。
              </p>
              {hamlet.occupiedBuildingIds.includes(NOMAD_WAGON_BUILDING_ID) && (
                <span className="absolute top-2 right-2 text-[10px] font-bold text-amber-400 bg-amber-500/20 border border-amber-500/50 rounded px-1.5 py-0.5">
                  今日已占用
                </span>
              )}
            </button>
          </div>
          {selectedHeroId && (
            <p className="text-[11px] text-dd-muted mt-2">
              灰色建筑不可访问（悬停查看原因）。
            </p>
          )}
        </div>

        {/* 右：事件 + 日志 + 结束当天 */}
        <div className="flex flex-col gap-3">
          <HamletEventCard event={event} preparationDays={hamlet.preparationDays} />
          <HamletLog log={hamlet.log ?? []} />
          <button
            onClick={endHamletDay}
            disabled={!canEnd}
            className={[
              'px-4 py-2.5 rounded font-semibold text-sm transition-colors',
              canEnd
                ? 'bg-dd-accent text-white hover:brightness-110'
                : 'bg-dd-panel2 text-dd-muted cursor-not-allowed',
            ].join(' ')}
            title={canEnd ? '进入下一天' : '所有存活英雄行动（或跳过）后才能结束当天'}
            data-testid="end-day"
          >
            结束当天
          </button>
        </div>
      </div>

      {/* Phase 8A：Abbey 移除怪癖选择弹层 */}
      {abbeyHero && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          data-testid="abbey-modal"
        >
          <div className="w-full max-w-sm rounded-lg border-2 border-indigo-400/70 bg-dd-panel p-5 shadow-2xl">
            <div className="text-lg font-bold text-dd-text mb-1">Abbey · 移除怪癖</div>
            <p className="text-xs text-dd-muted mb-3">
              选择 {abbeyHero.name} 要移除的一个怪癖（花费{' '}
              {getHamletBuildingById('abbey')?.cost ?? 0} Gold）。
            </p>
            <div className="space-y-1.5">
              {[...abbeyHero.negativeQuirkIds, ...abbeyHero.positiveQuirkIds].map((qid) => {
                const q = getQuirkById(qid);
                return (
                  <button
                    key={qid}
                    type="button"
                    onClick={() => onAbbeyRemove(qid)}
                    className="w-full rounded border border-dd-border bg-dd-panel2 px-3 py-2 text-left text-sm text-dd-text hover:border-dd-accent transition-colors"
                    data-testid={`abbey-remove-${qid}`}
                  >
                    <span className="font-semibold">
                      {q?.name ?? qid}
                      <span
                        className={`ml-1.5 text-[10px] ${
                          q?.polarity === 'positive' ? 'text-sky-300' : 'text-stone-400'
                        }`}
                      >
                        {q?.polarity === 'positive' ? '正面' : '负面'}
                      </span>
                    </span>
                    {q && <span className="block text-[11px] text-dd-muted">{q.description}</span>}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setAbbeyHeroId(null)}
              className="mt-3 w-full rounded border border-dd-border bg-dd-panel2 px-3 py-1.5 text-sm text-dd-muted hover:text-dd-text transition-colors"
              data-testid="abbey-cancel"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Phase 8B：Sanitarium 服务选择弹层（治疗伤势 / 治疗疾病） */}
      {sanitariumHero && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          data-testid="sanitarium-modal"
        >
          <div className="w-full max-w-sm rounded-lg border-2 border-lime-500/70 bg-dd-panel p-5 shadow-2xl">
            <div className="text-lg font-bold text-dd-text mb-1">Sanitarium · 选择服务</div>
            <p className="text-xs text-dd-muted mb-3">
              为 {sanitariumHero.name} 选择一项服务（本次访问只能选择一项）。
            </p>
            <div className="space-y-1.5">
              {SANITARIUM_SERVICES.map((svc) => {
                const err =
                  svc.id === 'remove-disease'
                    ? sanitariumRemoveDiseaseError(sanitariumHero.instanceId)
                    : buildingVisitError(campaign, sanitariumHero.instanceId, 'sanitarium');
                const disabled = err !== null;
                return (
                  <button
                    key={svc.id}
                    type="button"
                    disabled={disabled}
                    title={err ?? undefined}
                    onClick={() => {
                      if (svc.id === 'remove-disease') {
                        visitSanitariumRemoveDisease(sanitariumHero.instanceId);
                      } else {
                        visitBuilding(sanitariumHero.instanceId, 'sanitarium');
                      }
                      setSanitariumHeroId(null);
                      setSelectedHeroId(null);
                    }}
                    className={[
                      'w-full rounded border px-3 py-2 text-left text-sm transition-colors',
                      disabled
                        ? 'border-dd-border bg-dd-panel2 text-dd-muted cursor-not-allowed opacity-60'
                        : 'border-dd-border bg-dd-panel2 text-dd-text hover:border-lime-400',
                    ].join(' ')}
                    data-testid={`sanitarium-${svc.id}`}
                  >
                    <span className="font-semibold">
                      {svc.name}
                      <span className="ml-1.5 text-[10px] text-dd-warn">{svc.goldCost} Gold</span>
                    </span>
                    <span className="block text-[11px] text-dd-muted">
                      {svc.effect.type === 'heal'
                        ? `恢复 ${svc.effect.amount} 点生命`
                        : sanitariumHero.disease
                          ? `移除「${getDiseaseById(sanitariumHero.disease.diseaseId)?.name ?? sanitariumHero.disease.diseaseId}」`
                          : '当前没有疾病'}
                    </span>
                    {disabled && <span className="block text-[11px] text-red-400">{err}</span>}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setSanitariumHeroId(null)}
              className="mt-3 w-full rounded border border-dd-border bg-dd-panel2 px-3 py-1.5 text-sm text-dd-muted hover:text-dd-text transition-colors"
              data-testid="sanitarium-cancel"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Phase 8D：Guild 升级会话面板（会话持久化在 campaign，刷新可续做） */}
      {guildHero && guildSession && (
        <GuildPanel
          campaign={campaign}
          hero={guildHero}
          onClose={() => {
            setSelectedHeroId(null);
          }}
        />
      )}

      {/* Phase 8D：Blacksmith 临时 Skill Form 面板 */}
      {blacksmithHero && (
        <BlacksmithPanel
          campaign={campaign}
          hero={blacksmithHero}
          onClose={() => {
            setBlacksmithHeroId(null);
            setSelectedHeroId(null);
          }}
        />
      )}

      {/* Phase 8C：Nomad Wagon 交易面板 */}
      {nomadHeroId && (
        <NomadWagonPanel
          heroId={nomadHeroId}
          onClose={() => {
            setNomadHeroId(null);
            setSelectedHeroId(null);
          }}
        />
      )}
    </div>
  );
}
