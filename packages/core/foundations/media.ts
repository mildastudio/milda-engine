import type { MediaSource } from '../structure/types'

// Discriminated resolution result — mirrors resolveIcon's shape (foundations/icons.ts).
// `bind` carries its optional design-time-only sample resolved to a real asset (or
// none, if the asset was removed from the registry); the generator never sees it.
export type ResolvedMedia =
  | { kind: 'bind'; propName: string; sample?: { url: string; alt?: string } }
  | { kind: 'static'; url: string; alt?: string }

// Structural asset lookup (not `AssetRegistry` from @mildastudio/milda) — same
// boundary `resolveIcon` keeps: `core` doesn't depend on the asset-library package,
// only on the shape it needs.
export function resolveMediaSource(
  ref: MediaSource | undefined,
  assets?: Record<string, { url?: string; alt?: string }>,
): ResolvedMedia | undefined {
  if (!ref) return undefined
  if (ref.kind === 'bind') {
    if (ref.sample?.kind === 'url') return { kind: 'bind', propName: ref.propName, sample: { url: ref.sample.url } }
    const asset = ref.sample?.kind === 'asset' ? assets?.[ref.sample.assetId] : undefined
    return { kind: 'bind', propName: ref.propName, sample: asset?.url ? { url: asset.url, alt: asset.alt } : undefined }
  }
  const asset = assets?.[ref.assetId]
  return asset?.url ? { kind: 'static', url: asset.url, alt: asset.alt } : undefined
}
