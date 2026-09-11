import normalizedJson from '../../../../docs/data/darkest-dungeon/community-reference/antha-complete-edition/normalized-requirements.json' with { type: 'json' };
import sourceIndexJson from '../../../../docs/data/darkest-dungeon/community-reference/antha-complete-edition/source-reference-index.json' with { type: 'json' };
import bindingManifestJson from '../../../../docs/data/darkest-dungeon/community-reference/antha-complete-edition/source-binding-manifest.json' with { type: 'json' };

export interface NormalizedField { value: unknown; evidenceType: string; sourceReference: string[]; confidence: string; eligibleForPendingImport: boolean; status: string }
export interface NormalizedAsset { guid: string; cardId?: number | null; nickname?: string; objectType: string; ttsPath: string; sourceObjectReference: string; renderReferences?: string[]; customDeck?: Record<string, unknown>; customImage?: Record<string, unknown> }
export interface NormalizedRequirement { requirementId: string; componentId: string; componentGroup: string; componentType: string; quantity: number; status: string; assets: NormalizedAsset[]; fields: Record<string, NormalizedField> }
export interface NormalizedCorpus { schemaVersion: string; sourceAuthority: string; sourceEdition: string; workshopId: string; sourcePackageSha256: string; requirements: NormalizedRequirement[] }
export interface SourceIndex { entries: Array<{ key: string; kind: string; detail: Record<string, unknown> }> }
export interface Binding { sourceLocalId: string; sourceKind: string; repositoryId: string; bindingBasis: string; sourceReference: string[]; requirementId: string }
export interface BindingManifest { expectedSourceLocalIds: Array<{ sourceLocalId: string; sourceKind: string; sourceReference: string[]; requirementId: string }>; bindings: Binding[]; unboundSourceLocalIds: unknown[] }
export const NORMALIZED_CORPUS = normalizedJson as unknown as NormalizedCorpus;
export const SOURCE_REFERENCE_INDEX = sourceIndexJson as unknown as SourceIndex;
export const BINDING_MANIFEST = bindingManifestJson as unknown as BindingManifest;
export const requirement = (id: string): NormalizedRequirement => { const found = NORMALIZED_CORPUS.requirements.find(item => item.requirementId === id); if (!found) throw new Error(`Missing normalized requirement: ${id}`); return found; };
