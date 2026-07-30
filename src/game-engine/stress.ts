// Phase 7：统一压力处理管线。
// 业务代码（组件 / store / 其他引擎模块）增减 Stress 一律经过：
//   applyStress / applyStressBatch / recoverStress
// 禁止直接 `hero.stress =` / `stress +=`（仅存档迁移、sanitize、测试 fixture、
// 本引擎内部与 Debug 受控入口除外）。
// 阈值规则：达到 10 → 未 Resolve 过 → performResolveTest；已 Resolve 过 → triggerHeartAttack。

import type { ApplyStressInput, ApplyStressResult, CampaignState, RecoverStressInput } from '../types';
import { pushLog } from './log';
import { pushMentalEvent, syncHeroMentalToBattle } from './mental-log';
import { performResolveTest } from './resolve-test';
import { triggerHeartAttack } from './heart-attack';
import { STRESS_MAX, clampStressValue } from './stress-constants';
import { applyQuirkModifiers, describeModifierApplications } from './quirk-passives';
// 注意：quirks.ts 亦引用本模块，形成 ESM 循环依赖。
// emitRuleEvent / childRuleEventContext / createRuleEventContext 均为函数声明（提升），
// 且仅在运行时调用，不在模块顶层求值，因此循环安全。
import { childRuleEventContext, createRuleEventContext, emitRuleEvent } from './quirks';

export { STRESS_MAX, STRESS_MIN, clampStressValue } from './stress-constants';

/** 已处理批次键上限（幂等保护，防存档膨胀）。 */
const BATCH_ID_LIMIT = 200;

/** 递归深度保护：Resolve 效果可能再次调用 applyStress，超过深度只加压不再处理阈值。 */
const MAX_NESTING_DEPTH = 8;
let _depth = 0;

export interface ApplyStressOutput {
  campaign: CampaignState;
  result: ApplyStressResult;
}

function noopResult(heroId: string, stress: number): ApplyStressResult {
  return {
    heroId,
    previousStress: stress,
    appliedAmount: 0,
    currentStress: stress,
    thresholdReached: false,
    mentalEvents: [],
  };
}

/**
 * 统一 Stress 增加入口。
 * 顺序：验证 → 批次幂等 → 加压（钳制 0-10）→ stress-gained 事件 →
 * 阈值处理（Resolve Test / Heart Attack）→ 同步 BattleUnit → 日志。
 * amount <= 0 直接返回（恢复必须走 recoverStress）。
 */
export function applyStress(campaign: CampaignState, input: ApplyStressInput): ApplyStressOutput {
  const hero = campaign.heroes.find((h) => h.instanceId === input.heroId);
  if (!hero || hero.dead) {
    return { campaign, result: noopResult(input.heroId, hero?.stress ?? 0) };
  }
  const baseAmount = Math.floor(input.amount);
  if (baseAmount <= 0) return { campaign, result: noopResult(hero.instanceId, hero.stress) };

  // Phase 8A：Quirk 前置修正器（Nervous / Resilient / 光照条件类）
  const mod = applyQuirkModifiers(campaign, hero.instanceId, 'stress-applied', baseAmount);
  const amount = mod.amount;
  if (amount <= 0) {
    // 修正后归零：视为完全抵消，不写事件、不触发阈值
    const c = mod.applied.length
      ? pushLog(campaign, `${hero.name} 的压力被怪癖完全抵消${describeModifierApplications(mod.applied)}。`, 'info')
      : campaign;
    return { campaign: c, result: noopResult(hero.instanceId, hero.stress) };
  }

  // 批次幂等：同一 batchId + heroId 只处理一次（防刷新 / 重复调用）
  let next = campaign;
  if (input.batchId) {
    const key = `${input.batchId}:${input.heroId}`;
    if (next.processedStressBatchIds.includes(key)) {
      return { campaign, result: noopResult(hero.instanceId, hero.stress) };
    }
    const ids = [...next.processedStressBatchIds, key];
    next = {
      ...next,
      processedStressBatchIds: ids.length > BATCH_ID_LIMIT ? ids.slice(ids.length - BATCH_ID_LIMIT) : ids,
    };
  }

  const previousStress = hero.stress;
  const currentStress = clampStressValue(previousStress + amount);
  const appliedAmount = currentStress - previousStress;

  next = {
    ...next,
    heroes: next.heroes.map((h) =>
      h.instanceId === hero.instanceId ? { ...h, stress: currentStress } : h
    ),
  };

  const collected: ApplyStressResult['mentalEvents'] = [];
  const ev = pushMentalEvent(next, {
    questId: input.questId,
    heroId: hero.instanceId,
    type: 'stress-gained',
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    amount: appliedAmount,
  });
  next = ev.campaign;
  collected.push(ev.event);

  if (appliedAmount > 0) {
    next = pushLog(
      next,
      `${hero.name} Stress +${appliedAmount}（${currentStress}/${STRESS_MAX}）${describeModifierApplications(mod.applied)}。`,
      currentStress >= STRESS_MAX ? 'danger' : 'warning'
    );
  }

  const result: ApplyStressResult = {
    heroId: hero.instanceId,
    previousStress,
    appliedAmount,
    currentStress,
    thresholdReached: false,
    mentalEvents: collected,
  };

  // 阈值处理：只在「本次从 <10 提升到 10」时触发一次
  if (currentStress >= STRESS_MAX && previousStress < STRESS_MAX) {
    result.thresholdReached = true;
    if (_depth >= MAX_NESTING_DEPTH) {
      // 深度保护：极端嵌套下不再级联处理阈值（正常玩法不可达）
      next = pushLog(next, '[开发] Stress 阈值处理达到最大嵌套深度，已中止级联。', 'warning');
    } else {
      _depth += 1;
      try {
        const fresh = next.heroes.find((h) => h.instanceId === hero.instanceId);
        if (fresh && !fresh.dead) {
          if (!fresh.resolveTestedThisQuest) {
            const rt = performResolveTest(next, hero.instanceId);
            next = rt.campaign;
            if (rt.result) result.resolveTest = rt.result;
          } else {
            const ha = triggerHeartAttack(next, {
              heroInstanceId: hero.instanceId,
              questId: input.questId,
              battleId: input.battleId,
              sourceEventId: ev.event.id,
            });
            next = ha.campaign;
            if (ha.result) result.heartAttack = ha.result;
          }
        }
      } finally {
        _depth -= 1;
      }
    }
  }

  // Phase 8B：压力结算完成后的后置事件（The Worries：stress-resolved → damage-self 2）。
  // 位置固定在「阈值处理之后」，因此 Resolve Test / Heart Attack 先行结算；
  // 英雄若已死亡（Heart Attack / Madness）则不再发射。
  const survivor = next.heroes.find((h) => h.instanceId === hero.instanceId);
  if (survivor && !survivor.dead && appliedAmount > 0) {
    const baseCtx = input.ctx ?? createRuleEventContext();
    next = emitRuleEvent(
      next,
      { type: 'stress-resolved', heroId: hero.instanceId },
      input.ctx ? childRuleEventContext(baseCtx) : baseCtx
    );
  }

  // 战斗单位同步（英雄若已因 Heart Attack 死亡，heart-attack.ts 已处理单位）
  next = syncHeroMentalToBattle(next, hero.instanceId);

  return { campaign: next, result };
}

/**
 * 批量加压：同一 batchId 下按 heroId 合并后各英雄只结算一次
 * （不允许先 Resolve Test 再因同一批次剩余值立刻 Heart Attack）。
 */
export function applyStressBatch(
  campaign: CampaignState,
  inputs: ApplyStressInput[]
): { campaign: CampaignState; results: ApplyStressResult[] } {
  // 按 heroId 合并 amount（保留第一个出现的来源信息）
  const merged = new Map<string, ApplyStressInput>();
  for (const input of inputs) {
    const exist = merged.get(input.heroId);
    if (exist) {
      merged.set(input.heroId, { ...exist, amount: exist.amount + input.amount });
    } else {
      merged.set(input.heroId, { ...input });
    }
  }
  let next = campaign;
  const results: ApplyStressResult[] = [];
  for (const input of merged.values()) {
    const out = applyStress(next, input);
    next = out.campaign;
    results.push(out.result);
  }
  return { campaign: next, results };
}

/**
 * 统一 Stress 恢复入口。
 * - dead hero 不处理；amount <= 0 不处理；下限 0；
 * - 不撤销 Virtue/Affliction，不重置 resolveTestedThisQuest。
 */
export function recoverStress(
  campaign: CampaignState,
  input: RecoverStressInput
): ApplyStressOutput {
  const hero = campaign.heroes.find((h) => h.instanceId === input.heroId);
  if (!hero || hero.dead) {
    return { campaign, result: noopResult(input.heroId, hero?.stress ?? 0) };
  }
  const baseAmount = Math.floor(input.amount);
  if (baseAmount <= 0) return { campaign, result: noopResult(hero.instanceId, hero.stress) };

  // Phase 8A：Quirk 前置修正器（Stress Faster / Nocturnal / Photomania）
  const mod = applyQuirkModifiers(campaign, hero.instanceId, 'stress-recovered', baseAmount);
  const amount = mod.amount;
  if (amount <= 0) return { campaign, result: noopResult(hero.instanceId, hero.stress) };

  const previousStress = hero.stress;
  const currentStress = clampStressValue(previousStress - amount);
  const recovered = previousStress - currentStress;

  let next: CampaignState = {
    ...campaign,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === hero.instanceId ? { ...h, stress: currentStress } : h
    ),
  };

  const collected: ApplyStressResult['mentalEvents'] = [];
  if (recovered > 0) {
    const ev = pushMentalEvent(next, {
      questId: input.questId,
      heroId: hero.instanceId,
      type: 'stress-recovered',
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      amount: recovered,
    });
    next = ev.campaign;
    collected.push(ev.event);
    next = pushLog(next, `${hero.name} Stress -${recovered}（${currentStress}/${STRESS_MAX}）${describeModifierApplications(mod.applied)}。`, 'success');
  }

  next = syncHeroMentalToBattle(next, hero.instanceId);

  return {
    campaign: next,
    result: {
      heroId: hero.instanceId,
      previousStress,
      appliedAmount: -recovered,
      currentStress,
      thresholdReached: false,
      mentalEvents: collected,
    },
  };
}
