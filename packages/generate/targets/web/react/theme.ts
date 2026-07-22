import {
  colorVarName,
  defaultContextSelections,
  defaultFoundations,
  easingVarName,
  fontFamilyStack,
  googleFontsCssUrl,
  gradientVarName,
  isLengthType,
  lengthToCss,
  resolveTextStyle,
  resolveToken,
  scaleVarName,
  textStyleVarName,
  type DocumentFoundations,
  type FontFamily,
  type ScaleName,
  type TokenResolverContext,
  type TokenType,
} from '@mildastudio/core'

function fontVarName(id: string): string {
  return `--ds-font-${id}`
}

function fontPreamble(
  fonts: FontFamily[] | undefined,
  assets: Record<string, { url?: string }> | undefined,
): string {
  if (!fonts || fonts.length === 0) return ''
  const imports: string[] = []
  const faces: string[] = []
  const vars: string[] = []
  const seenGoogle = new Set<string>()

  for (const fam of fonts) {
    vars.push(`  ${fontVarName(fam.id)}: ${fontFamilyStack(fam)};`)
    if (fam.source.kind === 'google') {
      if (seenGoogle.has(fam.source.family)) continue
      seenGoogle.add(fam.source.family)
      imports.push(
        `@import url("${googleFontsCssUrl(fam.source.family, fam.source.weights, fam.source.italic)}");`,
      )
    } else if (fam.source.kind === 'custom') {
      for (const face of fam.source.faces) {
        const url = assets?.[face.assetId]?.url
        if (!url) continue
        faces.push(
          `@font-face {\n  font-family: "${fam.name}";\n  font-weight: ${face.weight};\n  font-style: ${face.italic ? 'italic' : 'normal'};\n  font-display: swap;\n  src: url("${url}") format("woff2");\n}`,
        )
      }
    }
  }

  const base = fonts.find((f) => f.id === 'body') ?? fonts[0]
  const rootLines = [':root {', ...vars, `  font-family: var(${fontVarName(base.id)});`, '}']

  return [...imports, ...faces, rootLines.join('\n')].join('\n\n')
}

interface VarDecl {
  name: string
  value: string
  type: TokenType
}

function gatherVars(foundations: DocumentFoundations, context: TokenResolverContext): VarDecl[] {
  const seen = new Set<string>()
  const out: VarDecl[] = []
  for (const layer of [...foundations.layers].sort((a, b) => a.order - b.order)) {
    for (const token of layer.tokens) {
      const key = `${token.type}:${token.id}`
      if (seen.has(key)) continue
      seen.add(key)

      if (token.type === 'textStyle') {
        const ts = resolveTextStyle(token.id, foundations, context)
        if (!ts) continue
        const push = (field: string, value?: string | null) => {
          if (value != null)
            out.push({ name: textStyleVarName(token.id, field), value, type: 'textStyle' })
        }
        push('family', ts.fontFamily)
        push('size', ts.fontSize != null ? lengthToCss(ts.fontSize) : undefined)
        push('weight', ts.fontWeight)
        push('line-height', ts.lineHeight)
        push('letter-spacing', ts.letterSpacing)
        continue
      }

      const value = resolveToken(token.id, foundations, context, token.type)
      if (value == null) continue

      const css = isLengthType(token.type) ? lengthToCss(value) : value
      const name =
        token.type === 'color'
          ? colorVarName(token.id)
          : token.type === 'gradient'
            ? gradientVarName(token.id)
            : token.type === 'easing'
              ? easingVarName(token.id)
              : scaleVarName(token.type as ScaleName, token.id)
      out.push({ name, value: css, type: token.type })
    }
  }
  return out
}

function renderRoot(vars: VarDecl[]): string {
  const order: TokenType[] = []
  const byType = new Map<TokenType, VarDecl[]>()
  for (const v of vars) {
    if (!byType.has(v.type)) {
      byType.set(v.type, [])
      order.push(v.type)
    }
    byType.get(v.type)!.push(v)
  }
  const lines: string[] = [':root {']
  for (const type of order) {
    lines.push(`  /* ${type} */`)
    for (const v of byType.get(type)!) lines.push(`  ${v.name}: ${v.value};`)
  }
  lines.push('}')
  return lines.join('\n')
}

function renderBlock(selector: string, vars: VarDecl[]): string {
  const lines = [`${selector} {`]
  for (const v of vars) lines.push(`  ${v.name}: ${v.value};`)
  lines.push('}')
  return lines.join('\n')
}

function diffVars(base: VarDecl[], variant: VarDecl[]): VarDecl[] {
  const baseByName = new Map(base.map((v) => [v.name, v.value]))
  return variant.filter((v) => baseByName.get(v.name) !== v.value)
}

function dataAttr(groupId: string): string {
  const kebab = groupId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
  return `data-${kebab}`
}

export function themeCss(
  foundations: DocumentFoundations = defaultFoundations(),
  assets?: Record<string, { url?: string }>,
): string {
  const defaultSel = defaultContextSelections(foundations)
  const baseVars = gatherVars(foundations, { contextSelections: defaultSel })

  const fonts = fontPreamble(foundations.fonts, assets)

  const rootBlock = renderRoot(baseVars)

  const mediaBlocks: string[] = []
  const attrBlocks: string[] = []

  for (const group of foundations.contextGroups) {
    const defaultCtxId = defaultSel[group.id]
    const attr = dataAttr(group.id)

    const varying = new Set<string>()
    let hasMedia = false
    for (const ctx of group.contexts) {
      if (ctx.id === defaultCtxId) continue
      const sel = { ...defaultSel, [group.id]: ctx.id }
      const diffs = diffVars(baseVars, gatherVars(foundations, { contextSelections: sel }))
      if (!diffs.length) continue
      diffs.forEach((d) => varying.add(d.name))

      attrBlocks.push(renderBlock(`[${attr}="${ctx.id}"]`, diffs))
      if (ctx.id === 'light' || ctx.id === 'dark') {
        hasMedia = true
        const body = diffs.map((v) => `    ${v.name}: ${v.value};`).join('\n')
        mediaBlocks.push(`@media (prefers-color-scheme: ${ctx.id}) {\n  :root {\n${body}\n  }\n}`)
      }
    }

    if (hasMedia && defaultCtxId) {
      const baseSubset = baseVars.filter((v) => varying.has(v.name))
      if (baseSubset.length)
        attrBlocks.unshift(renderBlock(`[${attr}="${defaultCtxId}"]`, baseSubset))
    }
  }

  return [fonts, rootBlock, ...mediaBlocks, ...attrBlocks].filter(Boolean).join('\n\n')
}
