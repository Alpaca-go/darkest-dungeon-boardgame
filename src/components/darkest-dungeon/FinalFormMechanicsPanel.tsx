// Phase 10E §UI：Final Encounter 四形态机制 只读展示面板。
//
// 硬约束对照：
// - §UI.1：四个 Form 各自独立展示，切换后旧 Form 的运行时仍保留在容器内（供复盘），
//   但只有 activeFormId 会被高亮；
// - §UI.2：Ancestor 1st Form 必须显示三个 Reflection 的 Stance / 存活，
//   以及「GUARD 是否生效」「Imperfect 反应是否已用掉（整场一次）」（硬约束 9 / 10）；
// - §UI.3：Initiative Card 数常驻显示，Reflection 死亡后仍为 4（硬约束 7 / 8 的可视断言点）；
// - §UI.4：Ancestor 2nd Form 显示 Absolute Nothingness 的 Area 占位
//   （不可被 Target，但占格，硬约束 12）与最近一次 d10 传送结果（含「掷 10 = 不传送」）；
// - §UI.5：Gestating Heart 显示 Sispersion 抽取历史与「召唤 + Initiative 原子增长」的当前张数；
// - §UI.6：Heart of Darkness 必须显示**当前 Impending Doom 预告**（对玩家可见，硬约束 18），
//   并标明「不可跳过」；
// - §3：official 未启用时明确列出缺哪些资料而禁用，绝不静默降级。
//
// 本组件是纯展示：不修改状态、不发起任何随机（随机一律先保存于运行时，UI 只读）。

import type { FinalFormId } from '../../types/final-encounter';
import type {
  AncestorFirstFormRuntime,
  AncestorSecondFormRuntime,
  FinalFormRuntime,
  FinalFormRuntimeState,
  GestatingHeartRuntime,
  HeartOfDarknessRuntime,
} from '../../types/final-forms';
import {
  getFinalEncounterMechanicsGaps,
  isFinalEncounterMechanicsOfficialEnabled,
} from '../../data/darkest-dungeon/final-encounter';
import CommunityVisual from './CommunityVisual';

interface Props {
  state: FinalFormRuntimeState | null;
}

const FORM_LABEL: Record<FinalFormId, string> = {
  'ancestor-first-form': 'Ancestor · 1st Form',
  'ancestor-second-form': 'Ancestor · 2nd Form',
  'gestating-heart': 'Gestating Heart',
  'heart-of-darkness': 'Heart of Darkness',
};

const FORM_VISUAL_ENTITY_ID: Record<FinalFormId, string> = {
  'ancestor-first-form': 'community-dd-ancestor-first-form',
  'ancestor-second-form': 'community-dd-ancestor-second-form',
  'gestating-heart': 'community-dd-gestating-heart',
  'heart-of-darkness': 'community-dd-heart-of-darkness',
};

const FORM_ORDER: FinalFormId[] = [
  'ancestor-first-form',
  'ancestor-second-form',
  'gestating-heart',
  'heart-of-darkness',
];

export default function FinalFormMechanicsPanel({ state }: Props) {
  if (!state) return null;

  const officialEnabled = isFinalEncounterMechanicsOfficialEnabled();
  const gaps = getFinalEncounterMechanicsGaps();
  const present = FORM_ORDER.filter((id) => state.runtimes[id]);

  return (
    <section
      className="rounded border border-dd-border bg-dd-panel/60 p-3 text-xs"
      data-testid="final-form-mechanics-panel"
    >
      <header className="mb-2 flex items-center justify-between">
        <span className="font-bold tracking-wide text-red-300">FINAL ENCOUNTER · 形态机制</span>
        <span className="text-[10px] text-dd-muted" data-testid="final-form-content-mode">
          {state.contentMode === 'formal' ? '正式内容' : 'Prototype Harness'} · {state.dataStatus}
        </span>
      </header>

      {!officialEnabled && (
        <p
          className="mb-2 rounded border border-amber-800/50 bg-amber-950/30 px-2 py-1 text-[10px] text-amber-200"
          data-testid="final-form-official-disabled"
        >
          官方 Final Encounter 机制因资料缺失而禁用（共 {gaps.length} 项）：
          {gaps.length > 0 ? gaps.join(' / ') : '—'}
        </p>
      )}

      {present.length === 0 && (
        <p className="text-dd-muted" data-testid="final-form-none">
          尚无形态出场。
        </p>
      )}

      <div className="flex flex-col gap-2">
        {present.map((formId) => (
          <FormBlock
            key={formId}
            formId={formId}
            runtime={state.runtimes[formId] as FinalFormRuntime}
            active={state.activeFormId === formId}
            profileId={state.contentMode}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function FormBlock({
  formId,
  runtime,
  active,
  profileId,
}: {
  formId: FinalFormId;
  runtime: FinalFormRuntime;
  active: boolean;
  profileId: FinalFormRuntimeState['contentMode'];
}) {
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        active ? 'border-red-700/70 bg-red-950/20' : 'border-dd-border/60 bg-black/20 opacity-70'
      }`}
      data-testid={`final-form-block-${formId}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-dd-text">
          {FORM_LABEL[formId]}
          {active ? ' · 出场中' : ' · 已结束'}
        </span>
        {/* 硬约束 7 / 8 的可视断言点：Reflection 死亡后此数字仍为 4。 */}
        <span className="text-[10px] text-dd-muted" data-testid={`final-form-initiative-${formId}`}>
          Initiative Card × {runtime.initiativeCardCount}
        </span>
      </div>
      <div className="mb-1 max-w-[120px]">
        <CommunityVisual
          runtimeEntityId={FORM_VISUAL_ENTITY_ID[formId]}
          assetKind="final-form-card"
          alt={`Community ${FORM_LABEL[formId]}`}
          className="w-full h-auto rounded border border-dd-border"
          testId={`final-form-visual-${formId}`}
          profileId={profileId}
        />
      </div>

      {runtime.kind === 'ancestor-first-form' && <FirstFormBody runtime={runtime} />}
      {runtime.kind === 'ancestor-second-form' && <SecondFormBody runtime={runtime} />}
      {runtime.kind === 'gestating-heart' && <GestatingHeartBody runtime={runtime} />}
      {runtime.kind === 'heart-of-darkness' && <HeartBody runtime={runtime} />}
    </div>
  );
}

function FirstFormBody({ runtime }: { runtime: AncestorFirstFormRuntime }) {
  const alive = runtime.reflections.filter((r) => r.alive);
  const guarded = alive.length > 0;
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-wrap gap-1" data-testid="final-form-reflections">
        {runtime.reflections.map((r) => (
          <li
            key={r.id}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              r.alive ? 'bg-purple-900/40 text-purple-200' : 'bg-black/40 text-dd-muted line-through'
            }`}
            data-testid={`final-form-reflection-${r.id}`}
          >
            {r.kind === 'perfect' ? 'Perfect' : 'Imperfect'} · {r.stance}
            {r.maxWounds !== null ? ` · ${r.wounds}/${r.maxWounds}` : ''}
          </li>
        ))}
      </ul>
      <p className="text-[10px]" data-testid="final-form-guard">
        {guarded ? (
          <span className="text-amber-300">
            GUARD 生效：Reflection 存活 {alive.length} 面，Ancestor 不可被指定为目标
          </span>
        ) : (
          <span className="text-red-300">GUARD 已解除：Ancestor 可被直接攻击</span>
        )}
      </p>
      <p className="text-[10px] text-dd-muted" data-testid="final-form-imperfect-reaction">
        Imperfect 死亡反应：
        {runtime.imperfectDeathReactionApplied
          ? `已触发（对 Ancestor ${runtime.imperfectDeathReaction?.woundsDealtToAncestor ?? 0} Wounds，整场仅一次）`
          : '未触发'}
      </p>
      {runtime.lastStanceResolution && (
        <p className="text-[10px] text-dd-muted" data-testid="final-form-stance-resolution">
          上次 Ancestor 行动：
          {runtime.lastStanceResolution.outcome === 'time-heals-all'
            ? 'Time Heals All（三位皆满）'
            : `补位 ${runtime.lastStanceResolution.filledStances.join('、') || '—'}`}
          {runtime.lastStanceResolution.blockedReason
            ? ` · 被阻断：${runtime.lastStanceResolution.blockedReason}`
            : ''}
        </p>
      )}
    </div>
  );
}

function SecondFormBody({ runtime }: { runtime: AncestorSecondFormRuntime }) {
  const last = runtime.teleportHistory[runtime.teleportHistory.length - 1] ?? null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] text-dd-muted" data-testid="final-form-ancestor-position">
        Ancestor 当前：{runtime.currentStance} @ {runtime.currentAreaId}
      </p>
      <ul className="flex flex-wrap gap-1" data-testid="final-form-nothingness">
        {runtime.nothingness.map((n) => (
          <li
            key={n.id}
            className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-300"
            data-testid={`final-form-nothingness-${n.id}`}
          >
            Absolute Nothingness @ {n.areaId} · 不可被 Target · 占 1 格
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-dd-muted" data-testid="final-form-teleport">
        {last
          ? `上次传送 d10=${last.roll} → ${
              last.teleported
                ? `${last.resultStance}（${last.fromAreaId} → ${last.toAreaId}）`
                : last.resultStance === null
                  ? '不传送（掷出 10）'
                  : `未能移动${last.blockedReason ? `：${last.blockedReason}` : ''}`
            }`
          : '尚未进行传送判定'}
      </p>
    </div>
  );
}

function GestatingHeartBody({ runtime }: { runtime: GestatingHeartRuntime }) {
  const recent = runtime.sispersionHistory.slice(-4);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] text-dd-muted" data-testid="final-form-sispersion-count">
        Sispersion 已召唤 {runtime.sispersionHistory.length} 只 · 基础先攻 {runtime.baseInitiativeCardCount} 张
        （每次召唤与先攻增长为同一原子事务）
      </p>
      {recent.length === 0 ? (
        <p className="text-[10px] text-dd-muted" data-testid="final-form-sispersion-empty">
          尚未发生 Sispersion。
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5" data-testid="final-form-sispersion-history">
          {recent.map((r) => (
            <li key={r.transactionId} className="text-[10px] text-dd-muted">
              {r.monsterDefinitionId} → {r.stance} @ {r.areaId}
            </li>
          ))}
        </ul>
      )}
      {runtime.woundedReactionHistory.length > 0 && (
        <p className="text-[10px] text-dd-muted" data-testid="final-form-wounded-reaction">
          最近受创反应：
          {(() => {
            const w = runtime.woundedReactionHistory[runtime.woundedReactionHistory.length - 1];
            return w.blockedReason
              ? `未生效（${w.blockedReason}）`
              : `Blight ${w.blightPotency}/${w.blightDurationTurns} 回合，自愈 ${w.healed}`;
          })()}
        </p>
      )}
    </div>
  );
}

function HeartBody({ runtime }: { runtime: HeartOfDarknessRuntime }) {
  const f = runtime.currentForecast;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] text-red-300" data-testid="final-form-heart-unskippable">
        Heart of Darkness 不可跳过 · 击败即战役胜利
      </p>
      <p className="text-[10px]" data-testid="final-form-impending-doom">
        {f ? (
          <span className={f.consumed ? 'text-dd-muted' : 'text-amber-300'}>
            Impending Doom 预告：d10={f.roll} →{' '}
            {f.blockedReason ? `无法执行（${f.blockedReason}）` : (f.skillId ?? '—')}
            {f.consumed ? '（已执行）' : '（待执行，玩家可见）'}
          </span>
        ) : (
          <span className="text-dd-muted">尚无 Impending Doom 预告</span>
        )}
      </p>
      <p className="text-[10px] text-dd-muted" data-testid="final-form-heart-counters">
        已消费预告 {runtime.consumedForecastCount} 次 · Come Unto Your Maker：
        {runtime.comeUntoYourMakerEnabled ? '启用' : '因资料缺失禁用'}
      </p>
    </div>
  );
}
