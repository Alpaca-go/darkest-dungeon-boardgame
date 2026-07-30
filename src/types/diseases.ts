// Phase 8B：Disease 与 Sanitarium 相关类型的聚合出口。
// 实际声明位于 src/types/index.ts（与其余领域类型同处一处，避免循环依赖）；
// 本文件仅按开发文档 §21 的建议结构提供命名入口。

export type {
  DiseaseDefinition,
  DiseaseSourceKind,
  HeroDiseaseState,
  DiseaseAcquisitionOutcome,
  DiseaseAcquisitionRecord,
  DiseaseTreatmentRecord,
  PendingDiseaseTransaction,
  SanitariumService,
  PassiveSource,
  PassiveSourceType,
  PassiveModifierDefinition,
  PassiveReactionDefinition,
} from './index';
