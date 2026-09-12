/**
 * Phase 11A.3 — Community Visual Renderer
 *
 * Profile-aware visual renderer for Community retail-reference art.
 *
 * Behavior:
 *   - When the resolver returns a ready asset: render an <img> with the
 *     repository-local asset, a stable alt text, and a data-testid for
 *     E2E.
 *   - When the resolver returns a source-missing entry: render an explicit
 *     source-missing placeholder (per dev doc section 19). Never substitute
 *     Prototype / Official / AI art.
 *   - When the resolver returns null: render nothing (no fallback).
 *
 * This component is the SINGLE integration point. Existing Act IV components
 * (DarkestDungeonQuestReveal, TemplarsEncounterPanel, MammothCystEncounterPanel,
 *  ShufflingHorrorEncounterPanel, FinalFormMechanicsPanel, etc.) should use
 * it instead of hand-writing <img> elements.
 */
import { useMemo } from 'react';
import {
  resolveCommunityVisualAsset,
  importCommunityVisualAsset,
  type CommunityVisualAssetKind,
  type CommunityVisualAssetResult,
  type CommunityVisualAssetResolved,
  type CommunityVisualAssetMissing,
} from '../../data/darkest-dungeon/community-reference/visual-assets';
import { COMMUNITY_REFERENCE_PROFILE_ID } from '../../data/darkest-dungeon/community-reference/runtime-profile';

interface Props {
  runtimeEntityId: string;
  assetKind: CommunityVisualAssetKind;
  /** Optional accessible label; if omitted a default is generated from the
   *  runtime entity id. */
  alt?: string;
  /** Optional CSS class for the rendered <img>. */
  className?: string;
  /** Force a profile other than community-reference for testing. Defaults
   *  to community-reference (the only supported profile). */
  profileId?: string | null;
  /** Test id for E2E; defaults to cv-<runtimeEntityId>-<assetKind>. */
  testId?: string;
}

const DEFAULT_PROFILE = COMMUNITY_REFERENCE_PROFILE_ID;

export default function CommunityVisual({
  runtimeEntityId,
  assetKind,
  alt,
  className,
  profileId = DEFAULT_PROFILE,
  testId,
}: Props) {
  const result: CommunityVisualAssetResult | null = useMemo(
    () => resolveCommunityVisualAsset(runtimeEntityId, assetKind, { profileId }),
    [runtimeEntityId, assetKind, profileId]
  );
  const fallbackTestId = testId ?? `cv-${runtimeEntityId}-${assetKind}`;

  if (!result) return null;

  if (result.status === 'ready') {
    return (
      <ResolvedCommunityVisual
        asset={result as CommunityVisualAssetResolved}
        className={className}
        alt={alt}
        testId={fallbackTestId}
      />
    );
  }

  const missing = result as CommunityVisualAssetMissing;
  return (
    <div
      className={className ?? 'rounded border border-dd-border bg-dd-panel2 p-2 text-[11px] text-dd-muted'}
      data-testid={fallbackTestId}
      data-cv-status={missing.status}
      data-cv-asset-id={missing.assetId}
      data-cv-source-authority="COMMUNITY_RETAIL_REFERENCE"
      role="img"
      aria-label={alt ?? `Community visual source ${missing.status}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-dd-muted">Source {missing.status}</div>
      <div className="text-dd-text">Community visual source unavailable / unconfirmed</div>
      <div className="text-[10px] text-dd-muted">{missing.runtimeEntityId} · {missing.assetKind}</div>
      <div className="text-[10px] text-dd-muted">{missing.reason}</div>
    </div>
  );
}

function ResolvedCommunityVisual({
  asset,
  className,
  alt,
  testId,
}: {
  asset: CommunityVisualAssetResolved;
  className?: string;
  alt?: string;
  testId: string;
}) {
  const src = useMemo(() => importCommunityVisualAsset(asset), [asset]);
  return (
    <img
      src={src}
      alt={alt ?? `Community visual ${asset.runtimeEntityId} ${asset.assetKind}`}
      width={asset.width}
      height={asset.height}
      className={className ?? 'max-w-full h-auto rounded border border-dd-border'}
      data-testid={testId}
      data-cv-status="ready"
      data-cv-asset-id={asset.assetId}
      data-cv-local-sha256={asset.localSha256}
      data-cv-source-authority="COMMUNITY_RETAIL_REFERENCE"
      loading="lazy"
    />
  );
}
