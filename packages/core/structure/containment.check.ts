import { preludeV0 } from '@mildastudio/milda'
import type { AnatomyPart, PartRole } from '@mildastudio/milda'
import { canContain, type ContainmentChild } from './containment'
import type { ComponentNode, NodeKind } from './types'

const ROLE_TO_KIND: Record<PartRole, NodeKind> = {
  container: 'container',
  item: 'item',
  text: 'text',
  control: 'control',
  input: 'input',
  icon: 'icon',
  content: 'content',
}

const node = (kind: NodeKind, origin: ComponentNode['origin']): ComponentNode =>
  ({
    id: '',
    name: '',
    kind,
    tag: 'div',
    origin,
    locked: false,
    parentId: null,
    childrenIds: [],
  }) as ComponentNode

const child = (role: PartRole): ContainmentChild => ({ kind: ROLE_TO_KIND[role] })

const violations: string[] = []

function checkEdges(
  parent: ComponentNode,
  ownerArchetype: string | null,
  parts: AnatomyPart[],
  path: string,
) {
  for (const part of parts) {
    if (!canContain(parent, ownerArchetype, child(part.role), {})) {
      violations.push(`${path} (${parent.kind}) ✗ ${part.name} (${ROLE_TO_KIND[part.role]})`)
    }
    if (part.children?.length) {
      checkEdges(
        node(ROLE_TO_KIND[part.role], 'archetype'),
        null,
        part.children,
        `${path}.${part.name}`,
      )
    }
  }
}

for (const arch of preludeV0.archetypes) {
  if (!arch.anatomy?.length) continue
  checkEdges(node('container', 'root'), arch.name, arch.anatomy, arch.name)
}

if (violations.length) {
  console.error(
    `✗ ${violations.length} containment violation(s) in the prelude:\n` +
      violations.map((v) => '  ' + v).join('\n'),
  )
  process.exit(1)
}
console.log(
  `✓ prelude containment is self-consistent (${preludeV0.archetypes.length} archetypes checked)`,
)
