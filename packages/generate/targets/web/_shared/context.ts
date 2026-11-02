// ─── How a context selection appears in the DOM (proposals 0001, 0042) ────────
// A context group's active value is carried by a data attribute, and the theme stylesheet keys a
// block of token overrides on it: `[data-color-scheme="dark"] { --ds-color-surface: … }`. That is
// what lets a selection apply to a SUBTREE rather than to the document, which is the whole
// mechanism behind a prop-bound context group (0001): a component that sets the attribute on its
// own root re-points every token that aliases by that group, for that instance only.
//
// The spelling therefore has exactly one home. It used to be derived from the group's ID inside
// the theme emitter, which produced `[data-cg.colorscheme="ctx.colorscheme.dark"]` - an attribute
// name with a dot in it, which is not a legal CSS identifier, so every one of those blocks was
// dead CSS that no selector could match and nothing set. The NAME is the author's word for the
// dimension and reads the way a human would write it by hand.

const kebab = (s: string): string =>
  s
    .replace(/\./g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()

/**
 * The attribute a group's selection is carried by: `ColorScheme` -> `data-color-scheme`. A group
 * name is typed by the author, so anything that is not a letter, a digit or a hyphen is folded to a
 * hyphen (after the accents come off,
 * so `Színséma` reads `szinsema`) - the attribute NAME lands unquoted in a selector, where `data-color-(beta)` would void
 * the whole rule. Values are quoted in the selector and need no such folding.
 */
export const contextDataAttr = (groupName: string): string =>
  `data-${
    kebab(groupName.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'context'
  }`

/**
 * The attribute value, which is also the PUBLIC value of a prop typed by the group: `Solid` ->
 * `solid`. Names are neutral in the IR and the target owns the platform casing (the same rule
 * prop and event names follow), so a generated React API reads `variant="solid"`.
 */
export const contextValue = (contextName: string): string => kebab(contextName)
