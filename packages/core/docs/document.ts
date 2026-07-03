import type { TokenType } from '../foundations/document'

export type DocProseKind =
  | 'heading'
  | 'subheading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'callout'
  | 'code'

export type DocComponentPartKind =
  | 'componentProps'
  | 'componentEvents'
  | 'componentComposition'
  | 'componentProp'
  | 'componentEvent'

export type DocBlockKind =
  | DocProseKind
  | 'divider'
  | 'image'
  | 'component'
  | DocComponentPartKind
  | 'example'
  | 'componentGroup'
  | 'tokens'
  | 'swatch'

export type DocBlock =
  | { id: string; kind: DocProseKind; text: string; anchor?: string }
  | { id: string; kind: 'divider' }
  | { id: string; kind: 'image'; assetId?: string }
  | { id: string; kind: 'component'; componentId?: string }
  | { id: string; kind: 'componentProps'; componentId?: string }
  | { id: string; kind: 'componentEvents'; componentId?: string }
  | { id: string; kind: 'componentComposition'; componentId?: string }
  | { id: string; kind: 'componentProp'; componentId?: string; propId?: string }
  | { id: string; kind: 'componentEvent'; componentId?: string; eventName?: string }
  | { id: string; kind: 'example'; exampleId?: string }
  | { id: string; kind: 'componentGroup'; groupId?: string }
  | { id: string; kind: 'tokens'; tokenType?: TokenType }
  | { id: string; kind: 'swatch'; tokenType?: TokenType }

export interface DocPage {
  id: string
  title: string

  group?: string

  parentId?: string
  blocks: DocBlock[]
}

export interface DocsSiteMeta {
  name?: string
  tagline?: string
  version?: string

  searchPlaceholder?: string
}

export interface DocsFooterLink {
  id: string
  label: string
  href: string
}

export interface DocsFooter {
  links: DocsFooterLink[]
  copyright?: string
}

export interface DocsModel {
  pages: DocPage[]
  site?: DocsSiteMeta
  footer?: DocsFooter
}

export const EMPTY_DOCS: DocsModel = { pages: [] }

export function setDocSite(docs: DocsModel, patch: DocsSiteMeta): DocsModel {
  return { ...docs, site: { ...docs.site, ...patch } }
}

const EMPTY_FOOTER: DocsFooter = { links: [] }

export function setDocFooter(
  docs: DocsModel,
  patch: Partial<Omit<DocsFooter, 'links'>>,
): DocsModel {
  return { ...docs, footer: { ...EMPTY_FOOTER, ...docs.footer, ...patch } }
}

export function addFooterLink(docs: DocsModel, link: DocsFooterLink): DocsModel {
  const footer = docs.footer ?? EMPTY_FOOTER
  return { ...docs, footer: { ...footer, links: [...footer.links, link] } }
}

export function updateFooterLink(
  docs: DocsModel,
  linkId: string,
  patch: Partial<Omit<DocsFooterLink, 'id'>>,
): DocsModel {
  const footer = docs.footer
  if (!footer) return docs
  return {
    ...docs,
    footer: {
      ...footer,
      links: footer.links.map((l) => (l.id === linkId ? { ...l, ...patch } : l)),
    },
  }
}

export function removeFooterLink(docs: DocsModel, linkId: string): DocsModel {
  const footer = docs.footer
  if (!footer) return docs
  return { ...docs, footer: { ...footer, links: footer.links.filter((l) => l.id !== linkId) } }
}

const PROSE_KINDS = new Set<DocBlockKind>([
  'heading',
  'subheading',
  'paragraph',
  'list',
  'quote',
  'callout',
  'code',
])

export function isProseBlock(
  block: DocBlock,
): block is { id: string; kind: DocProseKind; text: string; anchor?: string } {
  return PROSE_KINDS.has(block.kind)
}

export function addDocPage(docs: DocsModel, page: DocPage): DocsModel {
  return { ...docs, pages: [...docs.pages, page] }
}

export function renameDocPage(docs: DocsModel, pageId: string, title: string): DocsModel {
  return { ...docs, pages: docs.pages.map((p) => (p.id === pageId ? { ...p, title } : p)) }
}

export function setDocPageGroup(docs: DocsModel, pageId: string, group: string): DocsModel {
  return {
    ...docs,
    pages: docs.pages.map((p) => (p.id === pageId ? { ...p, group: group || undefined } : p)),
  }
}

export function setDocPageParent(docs: DocsModel, pageId: string, parentId: string): DocsModel {
  if (pageId === parentId) return docs
  return {
    ...docs,
    pages: docs.pages.map((p) => (p.id === pageId ? { ...p, parentId: parentId || undefined } : p)),
  }
}

export function removeDocPage(docs: DocsModel, pageId: string): DocsModel {
  return { ...docs, pages: docs.pages.filter((p) => p.id !== pageId) }
}

export function moveDocPage(docs: DocsModel, pageId: string, toIndex: number): DocsModel {
  const from = docs.pages.findIndex((p) => p.id === pageId)
  if (from === -1) return docs
  const pages = [...docs.pages]
  const [moved] = pages.splice(from, 1)

  const clamped = Math.max(0, Math.min(toIndex > from ? toIndex - 1 : toIndex, pages.length))
  pages.splice(clamped, 0, moved)
  return { ...docs, pages }
}

function mapPage(docs: DocsModel, pageId: string, fn: (page: DocPage) => DocPage): DocsModel {
  return { ...docs, pages: docs.pages.map((p) => (p.id === pageId ? fn(p) : p)) }
}

export function insertDocBlock(
  docs: DocsModel,
  pageId: string,
  block: DocBlock,
  at: number,
): DocsModel {
  return mapPage(docs, pageId, (page) => {
    const blocks = [...page.blocks]
    const clamped = Math.max(0, Math.min(at, blocks.length))
    blocks.splice(clamped, 0, block)
    return { ...page, blocks }
  })
}

export function moveDocBlock(
  docs: DocsModel,
  pageId: string,
  blockId: string,
  toIndex: number,
): DocsModel {
  return mapPage(docs, pageId, (page) => {
    const from = page.blocks.findIndex((b) => b.id === blockId)
    if (from === -1) return page
    const blocks = [...page.blocks]
    const [moved] = blocks.splice(from, 1)
    const clamped = Math.max(0, Math.min(toIndex > from ? toIndex - 1 : toIndex, blocks.length))
    blocks.splice(clamped, 0, moved)
    return { ...page, blocks }
  })
}

export function setDocBlockText(
  docs: DocsModel,
  pageId: string,
  blockId: string,
  text: string,
): DocsModel {
  return mapPage(docs, pageId, (page) => ({
    ...page,
    blocks: page.blocks.map((b) => (b.id === blockId && isProseBlock(b) ? { ...b, text } : b)),
  }))
}

export function setDocBlockAnchor(
  docs: DocsModel,
  pageId: string,
  blockId: string,
  anchor: string,
): DocsModel {
  return mapPage(docs, pageId, (page) => ({
    ...page,
    blocks: page.blocks.map((b) =>
      b.id === blockId && (b.kind === 'heading' || b.kind === 'subheading')
        ? { ...b, anchor: anchor.trim() || undefined }
        : b,
    ),
  }))
}

export function setDocBlockImage(
  docs: DocsModel,
  pageId: string,
  blockId: string,
  assetId: string,
): DocsModel {
  return mapPage(docs, pageId, (page) => ({
    ...page,
    blocks: page.blocks.map((b) =>
      b.id === blockId && b.kind === 'image' ? { ...b, assetId: assetId || undefined } : b,
    ),
  }))
}

export function removeDocBlock(docs: DocsModel, pageId: string, blockId: string): DocsModel {
  return mapPage(docs, pageId, (page) => ({
    ...page,
    blocks: page.blocks.filter((b) => b.id !== blockId),
  }))
}

export function setDocBlockRef(
  docs: DocsModel,
  pageId: string,
  blockId: string,
  ref: {
    componentId?: string
    propId?: string
    eventName?: string
    exampleId?: string
    groupId?: string
    tokenType?: TokenType
  },
): DocsModel {
  const COMPONENT_KINDS = new Set<DocBlockKind>([
    'component',
    'componentProps',
    'componentEvents',
    'componentComposition',
    'componentProp',
    'componentEvent',
  ])
  return mapPage(docs, pageId, (page) => ({
    ...page,
    blocks: page.blocks.map((b) => {
      if (b.id !== blockId) return b
      let next = b
      if (COMPONENT_KINDS.has(b.kind) && ref.componentId !== undefined) {
        next = { ...next, componentId: ref.componentId || undefined } as DocBlock

        if (next.kind === 'componentProp') next = { ...next, propId: undefined }
        if (next.kind === 'componentEvent') next = { ...next, eventName: undefined }
      }
      if (next.kind === 'componentProp' && ref.propId !== undefined) {
        next = { ...next, propId: ref.propId || undefined }
      }
      if (next.kind === 'componentEvent' && ref.eventName !== undefined) {
        next = { ...next, eventName: ref.eventName || undefined }
      }
      if (next.kind === 'example' && ref.exampleId !== undefined) {
        next = { ...next, exampleId: ref.exampleId || undefined }
      }
      if (next.kind === 'componentGroup' && ref.groupId !== undefined) {
        next = { ...next, groupId: ref.groupId || undefined }
      }
      if ((next.kind === 'tokens' || next.kind === 'swatch') && ref.tokenType !== undefined) {
        next = { ...next, tokenType: ref.tokenType }
      }
      return next
    }),
  }))
}
