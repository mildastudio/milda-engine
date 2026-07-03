export interface ComponentGroup {
  id: string
  name: string
  parent: string | null
  order: number
  description?: string
}

export function isComponentGroupDescendant(
  groups: ComponentGroup[],
  groupId: string,
  candidate: string | null,
): boolean {
  let cur = candidate
  while (cur) {
    if (cur === groupId) return true
    cur = groups.find((g) => g.id === cur)?.parent ?? null
  }
  return false
}

export function orderedGroupSiblings(groups: ComponentGroup[], parentId: string | null): string[] {
  return groups
    .filter((g) => (g.parent ?? null) === parentId)
    .sort((a, b) => a.order - b.order)
    .map((g) => g.id)
}
