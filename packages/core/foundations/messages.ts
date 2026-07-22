// Message layer (proposal 0030, the framework-independent base).
//
// This is Category-B "DS-authored UI chrome" - the translatable strings a generated
// design system OWNS (static labels, placeholders, accessible names 0013, validation
// messages). It is deliberately separate from the other two text categories:
//   - Category A (value formatting: dates/numbers/currency) is `Intl`, locale-
//     parametric, and lives in the behavior/view layer (see 0029's calendar core,
//     which takes a locale and never bakes strings).
//   - Category C (consumer-supplied slot/bound content) is NOT the DS's job - the
//     same boundary 0028 draws between `bind` and `static` media.
// See docs/dsl/proposals/0030-translatability-and-localization.md.
//
// Conceptually a message is a token aliased by a `Locale` context group (PRELUDE §3):
// the same "a value varies by a dimension" shape as a color aliased by ColorScheme.
// It is modeled here as a purpose-built structure - like icons (0019) and media
// (0028) got dedicated foundations modules rather than being crammed into the token
// union - because a message value is ICU-shaped (params, plural/select), not a scalar
// Slot. Folding messages into the Token/TokenValue union is deferred (0030 §7 Q1).

import type { ContextGroup } from './document'

/** BCP-47 locale id, e.g. "en", "en-US", "hu". */
export type LocaleId = string

/** Provenance/category of a message, mirroring the honesty of 0019/0028. Drives
 * later per-source handling (e.g. a11y names vs. body copy) and translator context. */
export type MessageSource = 'content' | 'placeholder' | 'a11y' | 'validation'

export interface Message {
  /** Stable id the generated component keys by - never the literal string. */
  id: string
  /** Default-locale template, ICU-shaped (may contain `{placeholders}`). */
  default: string
  /** Interpolation params referenced by the template, if any. */
  params?: string[]
  /** Translator-facing context, e.g. from node metadata (0026). */
  description?: string
  source: MessageSource
  /** Per-locale translations, keyed by `LocaleId`. The default locale need not
   * appear here (its string is `default`). This is the `alias by Locale` payload. */
  translations?: Record<LocaleId, string>
}

export interface MessageCatalog {
  /** The locale the `Message.default` strings are authored in. */
  defaultLocale: LocaleId
  /** Additional locales this design system ships translations for. */
  locales: LocaleId[]
  messages: Message[]
}

export function emptyMessageCatalog(defaultLocale: LocaleId = 'en'): MessageCatalog {
  return { defaultLocale, locales: [], messages: [] }
}

/** Resolve a message id to its localized template + params, with fallback. Picks
 * the correct template only; interpolation (Category-A `Intl`) is the VIEW's job.
 * Fallback chain mirrors the resolveIcon / resolveMediaSource discipline: exact
 * locale → base language ("en-US" → "en") → default-locale string. */
export function resolveMessage(
  id: string,
  catalog: MessageCatalog | undefined,
  locale?: LocaleId,
): { text: string; params?: string[] } | undefined {
  const msg = catalog?.messages.find((m) => m.id === id)
  if (!msg || !catalog) return undefined
  const loc = locale ?? catalog.defaultLocale
  const text =
    (loc !== catalog.defaultLocale ? msg.translations?.[loc] : undefined) ??
    (loc.includes('-') ? msg.translations?.[loc.split('-')[0]] : undefined) ??
    msg.default
  return msg.params ? { text, params: msg.params } : { text }
}

/** Build the `Locale` context group from a catalog - Locale takes its place beside
 * ColorScheme/Platform/Brand as a token-resolution dimension (PRELUDE §3), so message
 * resolution reuses the existing multi-dimensional aliasing rather than a new engine. */
export function localeContextGroup(catalog: MessageCatalog): ContextGroup {
  const seen = new Set<string>()
  const contexts = [catalog.defaultLocale, ...catalog.locales]
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .map((id) => ({ id, name: id }))
  return { id: 'Locale', name: 'Locale', contexts }
}

// --- Framework-independent extraction (proposal 0030 §3.1) ------------------------
//
// The portable artifact a generate pass produces: the set of messages a component
// references, keyed by id. Per-framework VIEWS decide delivery (baked | messages-
// catalog | byo-prop); this shape is shared verbatim - the same anti-drift guarantee
// 0029's calendar core makes for behavior, applied to strings.
//
// NOTE: the pass that WALKS a component tree to populate a manifest is a later slice -
// it depends on IR nodes gaining message-id forms (0013 a11y names, placeholder/
// content literals; 0030 §7 Q2/Q3). This module ships the artifact shape, its merge
// law, and catalog<->manifest bridges so the base is real, not stubbed.

export type MessageManifestEntry = {
  default: string
  params?: string[]
  description?: string
  source: MessageSource
}

export type MessageManifest = Record<string, MessageManifestEntry>

export function manifestFromCatalog(catalog: MessageCatalog): MessageManifest {
  const out: MessageManifest = {}
  for (const m of catalog.messages) {
    out[m.id] = { default: m.default, params: m.params, description: m.description, source: m.source }
  }
  return out
}

/** Merge per-component manifests into one. A message id is GLOBAL to the DS, so the
 * first-seen entry for an id wins; a later differing `default` for the same id is an
 * authoring collision (surfaced by keeping first-seen, not silently overwriting). */
export function mergeManifests(manifests: MessageManifest[]): MessageManifest {
  const out: MessageManifest = {}
  for (const man of manifests) {
    for (const [id, entry] of Object.entries(man)) if (!(id in out)) out[id] = entry
  }
  return out
}

/** Seed a default-locale catalog from a manifest (round-trips with
 * `manifestFromCatalog`), the starting point for authoring translations. */
export function catalogFromManifest(
  manifest: MessageManifest,
  defaultLocale: LocaleId = 'en',
): MessageCatalog {
  const messages: Message[] = Object.entries(manifest).map(([id, e]) => ({
    id,
    default: e.default,
    params: e.params,
    description: e.description,
    source: e.source,
  }))
  return { defaultLocale, locales: [], messages }
}

// --- The publish/distribution switch (proposal 0030 §5) ---------------------------
//
// Shaped like per-target options (0015) and registry destinations (0020): a project-
// level setting picking the Category-B delivery mode. Defined here as the data shape;
// wiring it into project settings / ReleaseDialog / the generator is a later slice.

export type LocalizationStrategy = 'baked' | 'messages-catalog' | 'byo-prop'

export type I18nAdapter = 'react-i18next' | 'react-intl' | 'lingui' | 'next-intl' | 'vue-i18n'

/** RTL axis (§4) - independent of the message strategy. Mostly pre-banked by the
 * logical-edge discipline in PRELUDE §3/§4; the residue is directional-icon mirroring
 * and a `dir` seam, sequenced as its own slice. */
export type RtlMode = 'off' | 'auto-from-locale' | 'on'

export interface LocalizationSettings {
  /** Category-A `Intl` axis - always on; this only sets the formatting default locale. */
  formatting: { defaultLocale: LocaleId }
  /** Category-B delivery mode (§2). The `byo-prop` seam is emitted regardless. */
  strategy: LocalizationStrategy
  /** Locales the DS ships messages for (messages-catalog mode). */
  locales: LocaleId[]
  /** Per-framework binding for messages-catalog mode. */
  adapter?: I18nAdapter
  /** RTL axis (§4). */
  rtl: RtlMode
}

/** The zero-config default: single baked locale, no framework dep - matches today's
 * behavior. `byo-prop` is still emitted as the universal escape hatch. */
export function defaultLocalizationSettings(): LocalizationSettings {
  return { formatting: { defaultLocale: 'en-US' }, strategy: 'baked', locales: [], rtl: 'auto-from-locale' }
}
