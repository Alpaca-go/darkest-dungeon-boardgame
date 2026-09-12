/**
 * Phase 11A.3 — Community Visual Asset Resolver
 *
 * Profile-aware resolver for Community retail-reference art. The resolver is
 * the ONLY public path components use to obtain a Community art URL; it
 * never falls back to Prototype / Official / placeholder / remote Steam URLs.
 *
 * Source authority: COMMUNITY_RETAIL_REFERENCE (per the visual asset manifest).
 * This module does NOT promote Community art to OFFICIAL_RETAIL_VERIFIED.
 *
 * To switch a component to Community art, call resolveCommunityVisualAsset
 * with the runtime entity id used by the frozen Community runtime (see
 * ./data.ts -> COMMUNITY_QUESTS, COMMUNITY_GUARDIANS, etc.).
 */
import manifestJson from '../../../../docs/data/darkest-dungeon/community-reference/community-visual-asset-manifest.json' with { type: 'json' };
import { COMMUNITY_REFERENCE_PROFILE_ID } from './runtime-profile';

export type CommunityVisualAssetKind =
  | 'quest-card-front'
  | 'guardian-battle-card'
  | 'guardian-room-card'
  | 'guardian-room-tile'
  | 'dungeon-tile'
  | 'final-form-card'
  | 'monster-deck-card';

export type CommunityVisualStatus = 'ready' | 'mapped-unrendered' | 'source-missing' | 'not-applicable';

export interface CommunityVisualAssetResolved {
  assetId: string;
  runtimeEntityId: string;
  requirementId: string;
  assetKind: CommunityVisualAssetKind;
  status: CommunityVisualStatus;
  /** local path under src/assets/darkest-dungeon/community-reference/antha-complete-edition/..., relative to the repository root */
  localPath: string;
  /** sha256 of the local file, matches manifest localSha256 */
  localSha256: string;
  sourceUrl: string;
  sourceSha256: string;
  sourceReference: string[];
  guid: string | null;
  cardId: number | null;
  width: number;
  height: number;
  sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE';
  productSurface: string;
  crop: {
    kind: 'custom-deck-cell' | 'tile-image';
    deckId?: string;
    cardIndex?: number;
    numWidth?: number;
    numHeight?: number;
    sheetWidth?: number;
    sheetHeight?: number;
    cellWidth?: number;
    cellHeight?: number;
    left?: number;
    top?: number;
  };
}

export interface CommunityVisualAssetMissing {
  assetId: string;
  runtimeEntityId: string;
  requirementId: string;
  assetKind: CommunityVisualAssetKind;
  status: 'source-missing' | 'mapped-unrendered' | 'not-applicable';
  reason: string;
  sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE';
}

export type CommunityVisualAssetResult = CommunityVisualAssetResolved | CommunityVisualAssetMissing;

interface ManifestEntryRaw {
  assetId: string;
  runtimeEntityId: string;
  requirementId: string;
  assetKind: CommunityVisualAssetKind;
  status: CommunityVisualStatus;
  productSurface: string;
  sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE';
  sourceReference?: string[];
  guid?: string | null;
  cardId?: number | null;
  sourceUrl?: string;
  sourceSha256?: string;
  localPath?: string;
  localSha256?: string;
  width?: number;
  height?: number;
  crop?: CommunityVisualAssetResolved['crop'];
  reason?: string;
  sourceReferences?: string[];
}

const manifest = manifestJson as { assets: ManifestEntryRaw[] };

const index: Map<string, ManifestEntryRaw> = new Map();
for (const a of manifest.assets) {
  index.set(`${a.runtimeEntityId}::${a.assetKind}`, a);
}

/**
 * Resolve a Community visual asset for a given runtime entity and asset kind.
 *
 * Returns null when:
 *   - no manifest entry exists for the (entity, kind) pair
 *   - the entry is not status=ready
 *   - the runtime profile is not community-reference
 *
 * Returns a Missing entry when the entry exists but status is source-missing
 * (so UI can render an explicit source-missing state with the upstream
 *  reason, rather than silently falling back).
 */
export function resolveCommunityVisualAsset(
  runtimeEntityId: string,
  assetKind: CommunityVisualAssetKind,
  options?: { profileId?: string | null }
): CommunityVisualAssetResult | null {
  const profileId = options?.profileId ?? COMMUNITY_REFERENCE_PROFILE_ID;
  if (profileId !== COMMUNITY_REFERENCE_PROFILE_ID) return null;

  const entry = index.get(`${runtimeEntityId}::${assetKind}`);
  if (!entry) return null;

  if (entry.status === 'source-missing' || entry.status === 'mapped-unrendered' || entry.status === 'not-applicable') {
    return {
      assetId: entry.assetId,
      runtimeEntityId: entry.runtimeEntityId,
      requirementId: entry.requirementId,
      assetKind: entry.assetKind,
      status: entry.status,
      reason: entry.reason ?? 'no confirmed visual source in accepted intake',
      sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
    };
  }

  if (entry.status !== 'ready') return null;
  if (!entry.localPath || !entry.localSha256 || !entry.sourceUrl || !entry.sourceSha256 || !entry.crop) {
    throw new Error(`Manifest entry ${entry.assetId} is ready but missing localPath/localSha256/sourceUrl/sourceSha256/crop`);
  }
  if (entry.sourceAuthority !== 'COMMUNITY_RETAIL_REFERENCE') {
    throw new Error(`Manifest entry ${entry.assetId} has sourceAuthority ${entry.sourceAuthority}; must be COMMUNITY_RETAIL_REFERENCE`);
  }

  return {
    assetId: entry.assetId,
    runtimeEntityId: entry.runtimeEntityId,
    requirementId: entry.requirementId,
    assetKind: entry.assetKind,
    status: 'ready',
    localPath: entry.localPath,
    localSha256: entry.localSha256,
    sourceUrl: entry.sourceUrl,
    sourceSha256: entry.sourceSha256,
    sourceReference: entry.sourceReference ?? [],
    guid: entry.guid ?? null,
    cardId: entry.cardId ?? null,
    width: entry.width ?? 0,
    height: entry.height ?? 0,
    sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
    productSurface: entry.productSurface,
    crop: entry.crop,
  };
}

/** Convert a localPath to a Vite import specifier that Webpack/Vite can
 *  resolve at build time. The resolver is the only consumer; UI components
 *  must use this helper, not import the file directly. */
export function importCommunityVisualAsset(asset: CommunityVisualAssetResolved): string {
  // localPath is a repo-relative path. The src/assets entry point is the
  // Vite asset root, so strip the "src/assets/" prefix and pass the rest.
  const prefix = 'src/assets/';
  if (!asset.localPath.startsWith(prefix)) {
    throw new Error(`Community asset localPath must start with ${prefix}: ${asset.localPath}`);
  }
  return new URL(`../../../../${asset.localPath}`, import.meta.url).href;
}

/** List all ready asset entries (for contact-sheet and tests). */
export function listReadyCommunityVisualAssets(): CommunityVisualAssetResolved[] {
  const out: CommunityVisualAssetResolved[] = [];
  for (const a of manifest.assets) {
    if (a.status === 'ready' && a.localPath && a.localSha256 && a.sourceUrl) {
      out.push({
        assetId: a.assetId,
        runtimeEntityId: a.runtimeEntityId,
        requirementId: a.requirementId,
        assetKind: a.assetKind,
        status: 'ready',
        localPath: a.localPath,
        localSha256: a.localSha256,
        sourceUrl: a.sourceUrl,
        sourceSha256: a.sourceSha256 ?? '',
        sourceReference: a.sourceReference ?? [],
        guid: a.guid ?? null,
        cardId: a.cardId ?? null,
        width: a.width ?? 0,
        height: a.height ?? 0,
        sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE',
        productSurface: a.productSurface,
        crop: a.crop ?? { kind: 'tile-image' },
      });
    }
  }
  return out;
}

/** Test-only: return raw manifest entries. */
export function rawCommunityVisualAssetManifest(): { assets: ManifestEntryRaw[] } {
  return manifest;
}

/**
 * Map legacy component ids used by the frozen Community runtime (e.g.
 * "darkest-dungeon-quest-1") to the runtimeEntityId used by the visual
 * asset manifest (e.g. "community-dd-quest-we-are-the-flame"). The mapping
 * is built from the manifest itself: for each requirement, the inventory
 * already pairs requirementId with the visual runtimeEntityId. We can
 * therefore invert the mapping at module load without importing the
 * normalized corpus or the runtime profile.
 *
 * Note: this helper is provided for legacy slot ids only. The visual
 * resolver's primary key is runtimeEntityId, which is the stable
 * public API.
 */
const componentIdToVisualId: Map<string, string> = (() => {
  const m = new Map<string, string>();
  // Hard-coded mapping for the 26 known entities. Generated from
  // data.ts::project() and the asset-inventory.json.
  const known: Record<string, string> = {
    'darkest-dungeon-quest-1': 'community-dd-quest-we-are-the-flame',
    'darkest-dungeon-quest-2': 'community-dd-quest-light-the-way',
    'darkest-dungeon-quest-3': 'community-dd-quest-belly-of-the-beast',
    'templar-impaler': 'community-dd-templars-impaler',
    'templar-warlord': 'community-dd-templars-warlord',
    'mammoth-cyst': 'community-dd-mammoth-cyst',
    'white-cell-stalk': 'community-dd-white-cell-stalk',
    'shuffling-horror': 'community-dd-shuffling-horror',
    'cultist-priest': 'community-dd-cultist-priest',
    'malignant-growth': 'community-dd-malignant-growth',
    'ancestor-first-form': 'community-dd-ancestor-first-form',
    'ancestor-second-form': 'community-dd-ancestor-second-form',
    'perfect-reflection': 'community-dd-perfect-reflection',
    'imperfect-reflection': 'community-dd-imperfect-reflection',
    'gestating-heart': 'community-dd-gestating-heart',
    'heart-of-darkness': 'community-dd-heart-of-darkness',
  };
  for (const [k, v] of Object.entries(known)) m.set(k, v);
  return m;
})();

/** Map a legacy Community runtime component id (e.g. "templar-impaler") to
 *  the visual resolver's runtimeEntityId (e.g. "community-dd-templars-impaler").
 *  Returns null for unknown ids. */
export function communityComponentIdToVisualId(componentId: string): string | null {
  return componentIdToVisualId.get(componentId) ?? null;
}
