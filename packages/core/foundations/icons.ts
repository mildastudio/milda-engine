export interface IconSet {
  id: string
  prefix: string
  name: string
  provider: string
  license: string
  /**
   * Four representative icon names for previews (home / heart / star / settings
   * concepts). Names differ per set — Remix suffixes with `-line`, Bootstrap
   * uses `house`/`gear`, etc. — so each set declares its own; a preview that
   * still misses falls back to the app-wide placeholder.
   */
  samples?: [string, string, string, string]
}

export type Icon =
  | { id: string; kind: 'set'; prefix: string; name: string; label?: string; svg?: string }
  | { id: string; kind: 'custom'; name: string; assetId: string; label?: string }

export function iconLabel(icon: Icon): string {
  return icon.label ?? icon.name
}

export function resolveIconRef(
  name: string | undefined,
  lib?: IconLibrary,
): { prefix: string; name: string } | undefined {
  if (!name) return undefined
  if (name.includes(':')) {
    const [prefix, ...rest] = name.split(':')
    return { prefix, name: rest.join(':') }
  }
  const curated = lib?.icons.find(
    (i): i is Extract<Icon, { kind: 'set' }> =>
      i.kind === 'set' && (i.name === name || i.label === name),
  )
  if (curated) return { prefix: curated.prefix, name: curated.name }
  const firstSet = lib?.sets[0]
  return firstSet ? { prefix: firstSet.prefix, name } : undefined
}

export type ResolvedIcon =
  | { kind: 'set'; prefix: string; name: string; svg?: string }
  | { kind: 'custom'; url: string }

export function resolveIcon(
  ref: string | undefined,
  lib?: IconLibrary,
  assets?: Record<string, { url?: string }>,
): ResolvedIcon | undefined {
  if (!ref) return undefined
  const curated = lib?.icons.find((i) => i.id === ref || i.name === ref || i.label === ref)
  if (curated) {
    if (curated.kind === 'custom') {
      const url = assets?.[curated.assetId]?.url
      return url ? { kind: 'custom', url } : undefined
    }
    return { kind: 'set', prefix: curated.prefix, name: curated.name, svg: curated.svg }
  }
  if (ref.includes(':')) {
    const [prefix, ...rest] = ref.split(':')
    return { kind: 'set', prefix, name: rest.join(':') }
  }
  const firstSet = lib?.sets[0]
  return firstSet ? { kind: 'set', prefix: firstSet.prefix, name: ref } : undefined
}

export interface IconLibrary {
  sets: IconSet[]
  icons: Icon[]
}

export function emptyIconLibrary(): IconLibrary {
  return { sets: [], icons: [] }
}

export const ICON_SETS: Omit<IconSet, 'id'>[] = [
  { prefix: 'lucide', name: 'Lucide', provider: 'Iconify', license: 'ISC', samples: ['home', 'heart', 'star', 'settings'] },
  { prefix: 'ph', name: 'Phosphor', provider: 'Iconify', license: 'MIT', samples: ['house', 'heart', 'star', 'gear'] },
  { prefix: 'heroicons', name: 'Heroicons', provider: 'Iconify', license: 'MIT', samples: ['home', 'heart', 'star', 'cog-6-tooth'] },
  { prefix: 'tabler', name: 'Tabler Icons', provider: 'Iconify', license: 'MIT', samples: ['home', 'heart', 'star', 'settings'] },
  { prefix: 'feather', name: 'Feather', provider: 'Iconify', license: 'MIT', samples: ['home', 'heart', 'star', 'settings'] },
  {
    prefix: 'material-symbols',
    name: 'Material Symbols',
    provider: 'Iconify',
    license: 'Apache-2.0',
    samples: ['home', 'favorite', 'star', 'settings'],
  },
  { prefix: 'ri', name: 'Remix Icon', provider: 'Iconify', license: 'Apache-2.0', samples: ['home-line', 'heart-line', 'star-line', 'settings-line'] },
  { prefix: 'bi', name: 'Bootstrap Icons', provider: 'Iconify', license: 'MIT', samples: ['house', 'heart', 'star', 'gear'] },
]

const ICONIFY_API = 'https://api.iconify.design'

export function iconifySvgUrl(prefix: string, name: string, color = 'currentColor'): string {
  return `${ICONIFY_API}/${prefix}/${name}.svg?color=${encodeURIComponent(color)}`
}

export function iconifySearchUrl(prefix: string, query: string, limit = 60): string {
  const q = encodeURIComponent(query.trim() || 'arrow')
  return `${ICONIFY_API}/search?query=${q}&prefix=${prefix}&limit=${limit}`
}

export function iconifyCollectionUrl(prefix: string): string {
  return `${ICONIFY_API}/collection?prefix=${prefix}`
}

export interface IconProvider {
  provider: string
  name: string
  prefix: string
  license: string
}
export function iconProviders(lib: IconLibrary | undefined): IconProvider[] {
  return (lib?.sets ?? []).map((s) => ({
    provider: s.provider,
    name: s.name,
    prefix: s.prefix,
    license: s.license,
  }))
}
