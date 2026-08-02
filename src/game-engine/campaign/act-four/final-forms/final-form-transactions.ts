// Phase 10E：Final Form 机制域的幂等键集中定义。
//
// 单独成文件是为了打断循环依赖：
//   final-form-runtime.ts  → 各 Form 运行时（setup* 调度）
//   各 Form 运行时         → 幂等键
// 若幂等键留在 final-form-runtime.ts，两侧会互相 import 形成运行时环。
// （沿用 Phase 9A 建立的范式：victory 模块反向依赖 guardian-quest，一律拆文件解环。）

export const finalFormTransactionIds = {
  setup: (encounterId: string, formId: string) => `final-form-setup:${encounterId}:${formId}`,
  reflectionDeath: (encounterId: string, reflectionId: string) =>
    `final-form-reflection-death:${encounterId}:${reflectionId}`,
  stanceResolution: (encounterId: string, sequence: number) =>
    `final-form-stance-resolution:${encounterId}:${sequence}`,
  teleport: (encounterId: string, sequence: number) =>
    `final-form-teleport:${encounterId}:${sequence}`,
  sispersion: (encounterId: string, sequence: number) =>
    `final-form-sispersion:${encounterId}:${sequence}`,
  woundedReaction: (encounterId: string, sequence: number) =>
    `final-form-wounded-reaction:${encounterId}:${sequence}`,
  impendingDoom: (encounterId: string, sequence: number) =>
    `final-form-impending-doom:${encounterId}:${sequence}`,
} as const;
