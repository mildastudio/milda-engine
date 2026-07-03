import type { ComponentNode, ComponentStructure } from './structure/types'

interface PartPaint {
  facets?: Record<string, string>
  layout?: Record<string, string>
}

interface ArchetypePaint {
  root?: PartPaint
  parts?: Record<string, PartPaint>
}

const accentButton: PartPaint = {
  facets: { fill: 'accent', corner: 'md', inset: 'sm', gap: 'sm' },
  layout: { direction: 'row', align: 'center', distribute: 'center' },
}
const outlineButton: PartPaint = {
  facets: {
    fill: 'surface',
    ink: 'text',
    corner: 'md',
    inset: 'sm',
    gap: 'sm',
    'border.width': 'hairline',
    'border.color': 'border',
  },
  layout: { direction: 'row', align: 'center', distribute: 'center' },
}
const inputBox: PartPaint = {
  facets: {
    fill: 'surface',
    ink: 'text',
    corner: 'md',
    inset: 'sm',
    gap: 'sm',
    'border.width': 'hairline',
    'border.color': 'border',
  },
  layout: { direction: 'row', align: 'center' },
}

const overlaySurface: PartPaint = {
  facets: {
    fill: 'surface-raised',
    ink: 'text',
    corner: 'md',
    inset: 'xs',
    gap: 'xs',
    elevation: 'md',
    'border.width': 'hairline',
    'border.color': 'border',
  },
  layout: { direction: 'column' },
}

const menuItem: PartPaint = {
  facets: { ink: 'text', corner: 'sm', inset: 'sm', gap: 'sm' },
  layout: { direction: 'row', align: 'center' },
}

const DEFAULTS: Record<string, ArchetypePaint> = {
  Button: {
    root: {
      facets: { fill: 'accent', corner: 'md', insetX: 'lg', insetY: '6px' },
      layout: { direction: 'row', align: 'center', distribute: 'center' },
    },

    parts: {
      label: { facets: { ink: 'on-accent', 'text.size': 'xs' } },
      icon: { facets: { ink: 'on-accent' } },
    },
  },
  ToggleButton: {
    root: outlineButton,
    parts: {
      label: { facets: { ink: 'text', 'text.weight': 'medium' } },
      indicator: { facets: { ink: 'text-muted' } },
    },
  },
  MenuButton: {
    parts: {
      trigger: {
        ...outlineButton,
        layout: { direction: 'row', align: 'center', distribute: 'between' },
      },
      indicator: { facets: { ink: 'text-muted' } },
      surface: overlaySurface,
      item: menuItem,
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },
  Link: {
    root: {
      facets: { gap: 'xs' },
      layout: { direction: 'row', align: 'center', distribute: 'start' },
    },
    parts: {
      label: { facets: { ink: 'accent', 'text.weight': 'medium' } },
      icon: { facets: { ink: 'accent' } },
    },
  },

  Form: {
    root: { facets: { gap: 'lg' }, layout: { direction: 'column' } },
    parts: {
      content: { facets: { gap: 'md' }, layout: { direction: 'column' } },
      submit: accentButton,
      label: { facets: { ink: 'on-accent', 'text.weight': 'semibold' } },
      error: { facets: { ink: 'danger', 'text.size': 'sm' } },
    },
  },
  Field: {
    root: { facets: { gap: 'xs' }, layout: { direction: 'column' } },
    parts: {
      label: { facets: { ink: 'text', 'text.size': 'sm', 'text.weight': 'medium' } },
      control: { facets: { gap: 'xs' }, layout: { direction: 'column' } },
      help: { facets: { ink: 'text-muted', 'text.size': 'sm' } },
      error: { facets: { ink: 'danger', 'text.size': 'sm' } },
    },
  },
  TextField: {
    root: inputBox,
    parts: {
      icon: { facets: { ink: 'text-muted' } },
      control: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },
  TextArea: {
    root: {
      facets: {
        fill: 'surface',
        ink: 'text',
        corner: 'md',
        inset: 'sm',
        'border.width': 'hairline',
        'border.color': 'border',
      },
    },
    parts: {
      control: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },
  SearchField: {
    root: { ...inputBox, facets: { ...inputBox.facets, fill: 'surface-sunken', corner: 'pill' } },
    parts: {
      icon: { facets: { ink: 'text-muted' } },
      control: { facets: { ink: 'text', 'text.size': 'md' } },
      clear: { facets: { ink: 'text-muted', corner: 'pill', inset: 'xs' } },
    },
  },

  BooleanInput: {
    root: { facets: { gap: 'sm' }, layout: { direction: 'row', align: 'center' } },
    parts: {
      indicator: {
        facets: {
          fill: 'surface',
          corner: 'sm',
          'border.width': 'thin',
          'border.color': 'border-strong',
        },
      },
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },

  SingleSelect: {
    parts: {
      trigger: {
        ...inputBox,
        layout: { direction: 'row', align: 'center', distribute: 'between', width: 'sm' },
      },
      value: { facets: { ink: 'text', 'text.size': 'md' } },
      indicator: { facets: { fill: 'text-muted' } },
      surface: overlaySurface,
      option: menuItem,
      check: { facets: { fill: 'accent' } },
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },
  MultiSelect: {
    parts: {
      trigger: {
        ...inputBox,
        layout: { direction: 'row', align: 'center', distribute: 'between', width: 'sm' },
      },
      value: { facets: { ink: 'text', 'text.size': 'md' } },
      indicator: { facets: { fill: 'text-muted' } },
      surface: overlaySurface,
      option: menuItem,
      check: { facets: { fill: 'accent' } },
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },
  Combobox: {
    parts: {
      control: {
        facets: {
          fill: 'surface',
          ink: 'text',
          corner: 'md',
          inset: 'sm',
          'border.width': 'hairline',
          'border.color': 'border',
          'text.size': 'md',
        },
      },
      surface: overlaySurface,
      option: menuItem,
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },
  Slider: {
    root: { facets: { gap: 'sm' }, layout: { direction: 'row', align: 'center' } },
    parts: {
      track: {
        facets: { fill: 'surface-sunken', corner: 'pill' },
        layout: { direction: 'row', align: 'center' },
      },
      range: { facets: { fill: 'accent', corner: 'pill' } },
      thumb: {
        facets: {
          fill: 'surface',
          corner: 'pill',
          elevation: 'sm',
          'border.width': 'hairline',
          'border.color': 'border',
        },
      },
      value: { facets: { ink: 'text-muted', 'text.size': 'sm' } },
    },
  },
  Stepper: {
    root: {
      facets: {
        fill: 'surface',
        corner: 'md',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'row', align: 'center' },
    },
    parts: {
      decrement: {
        facets: { ink: 'text', inset: 'sm' },
        layout: { direction: 'row', align: 'center', distribute: 'center' },
      },
      increment: {
        facets: { ink: 'text', inset: 'sm' },
        layout: { direction: 'row', align: 'center', distribute: 'center' },
      },
      control: { facets: { ink: 'text', 'text.size': 'md', inset: 'sm' } },
      icon: { facets: { ink: 'text' } },
    },
  },
  TagsInput: {
    root: {
      facets: {
        fill: 'surface',
        corner: 'md',
        inset: 'xs',
        gap: 'xs',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'row', align: 'center', wrap: 'wrap' },
    },
    parts: {
      tag: {
        facets: {
          fill: 'accent-subtle',
          ink: 'accent-strong',
          corner: 'sm',
          inset: 'xs',
          gap: 'xs',
        },
        layout: { direction: 'row', align: 'center' },
      },
      label: { facets: { ink: 'accent-strong', 'text.size': 'sm' } },
      remove: { facets: { ink: 'accent-strong' } },
      control: { facets: { ink: 'text', 'text.size': 'md', inset: 'xs' } },
    },
  },

  Disclosure: {
    root: {
      facets: {
        fill: 'surface',
        corner: 'md',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'column' },
    },
    parts: {
      trigger: {
        facets: { ink: 'text', inset: 'sm', gap: 'sm' },
        layout: { direction: 'row', align: 'center', distribute: 'between' },
      },
      label: { facets: { ink: 'text', 'text.size': 'md', 'text.weight': 'medium' } },
      indicator: { facets: { ink: 'text-muted' } },
      panel: {
        facets: { ink: 'text-muted', inset: 'sm', 'text.size': 'md' },
        layout: { direction: 'column' },
      },
    },
  },
  Accordion: {
    root: {
      facets: {
        fill: 'surface',
        corner: 'md',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'column' },
    },
    parts: {
      item: {
        facets: { 'border.width': 'hairline', 'border.color': 'border' },
        layout: { direction: 'column' },
      },
      header: {
        facets: { ink: 'text', inset: 'sm', gap: 'sm' },
        layout: { direction: 'row', align: 'center', distribute: 'between' },
      },
      label: { facets: { ink: 'text', 'text.size': 'md', 'text.weight': 'medium' } },
      indicator: { facets: { ink: 'text-muted' } },
      panel: {
        facets: { ink: 'text-muted', inset: 'sm', 'text.size': 'md' },
        layout: { direction: 'column' },
      },
    },
  },
  Tabs: {
    root: { facets: { gap: 'md' }, layout: { direction: 'column' } },
    parts: {
      list: {
        facets: { gap: 'xs', 'border.width': 'hairline', 'border.color': 'border' },
        layout: { direction: 'row', align: 'center' },
      },
      tab: {
        facets: { ink: 'text-muted', inset: 'sm', gap: 'sm' },
        layout: { direction: 'row', align: 'center', distribute: 'center' },
      },
      label: { facets: { ink: 'text', 'text.size': 'md', 'text.weight': 'medium' } },
      panel: { facets: { ink: 'text', inset: 'sm' }, layout: { direction: 'column' } },
    },
  },
  Dialog: {
    parts: {
      trigger: accentButton,
      label: { facets: { ink: 'on-accent', 'text.weight': 'semibold' } },

      backdrop: { facets: { fill: 'text', opacity: '50' } },

      surface: {
        facets: {
          fill: 'surface-raised',
          ink: 'text',
          corner: 'lg',
          inset: 'lg',
          gap: 'md',
          elevation: 'lg',
        },
        layout: { width: 'lg' },
      },
      title: { facets: { ink: 'text', 'text.size': 'lg', 'text.weight': 'bold' } },
      content: { facets: { ink: 'text-muted', 'text.size': 'md' } },
      close: { facets: { ink: 'text-muted', corner: 'md', inset: 'xs' } },
    },
  },
  Drawer: {
    parts: {
      trigger: accentButton,
      backdrop: { facets: { fill: 'text', opacity: '50' } },
      surface: {
        facets: { fill: 'surface-raised', ink: 'text', inset: 'lg', gap: 'md', elevation: 'lg' },
        layout: { direction: 'column', width: 'sm' },
      },
      content: { facets: { ink: 'text' }, layout: { direction: 'column' } },
      close: { facets: { ink: 'text-muted', corner: 'md', inset: 'xs' } },
    },
  },
  Popover: {
    parts: {
      trigger: outlineButton,
      surface: {
        facets: {
          fill: 'surface-raised',
          ink: 'text',
          corner: 'lg',
          inset: 'md',
          gap: 'sm',
          elevation: 'lg',
          'border.width': 'hairline',
          'border.color': 'border',
        },
        layout: { direction: 'column' },
      },
      content: { facets: { ink: 'text', 'text.size': 'md' }, layout: { direction: 'column' } },
    },
  },
  Tooltip: {
    parts: {
      surface: {
        facets: { fill: 'text', ink: 'surface', corner: 'sm', inset: 'xs', elevation: 'md' },
      },
      content: { facets: { ink: 'surface', 'text.size': 'sm' } },
    },
  },
  ContextMenu: {
    parts: {
      surface: overlaySurface,
      item: menuItem,
      icon: { facets: { ink: 'text-muted' } },
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },

  Breadcrumbs: {
    root: { facets: { gap: 'xs' }, layout: { direction: 'row', align: 'center' } },
    parts: {
      item: { facets: { gap: 'xs' }, layout: { direction: 'row', align: 'center' } },
      label: { facets: { ink: 'text-muted', 'text.size': 'sm' } },
      separator: { facets: { ink: 'text-subtle' } },
    },
  },
  Pagination: {
    root: { facets: { gap: 'xs' }, layout: { direction: 'row', align: 'center' } },
    parts: {
      previous: {
        facets: {
          ink: 'text',
          corner: 'md',
          inset: 'sm',
          'border.width': 'hairline',
          'border.color': 'border',
        },
        layout: { direction: 'row', align: 'center', distribute: 'center' },
      },
      next: {
        facets: {
          ink: 'text',
          corner: 'md',
          inset: 'sm',
          'border.width': 'hairline',
          'border.color': 'border',
        },
        layout: { direction: 'row', align: 'center', distribute: 'center' },
      },
      item: {
        facets: { ink: 'text', corner: 'md', inset: 'sm' },
        layout: { direction: 'row', align: 'center', distribute: 'center' },
      },
      label: { facets: { ink: 'text', 'text.size': 'sm', 'text.weight': 'medium' } },
    },
  },
  Menu: {
    parts: {
      surface: overlaySurface,
      item: menuItem,
      icon: { facets: { ink: 'text-muted' } },
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },
  NavigationBar: {
    root: {
      facets: {
        fill: 'surface',
        gap: 'xs',
        inset: 'xs',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'row', align: 'center' },
    },
    parts: {
      item: {
        facets: { ink: 'text-muted', corner: 'md', inset: 'sm', gap: 'xs' },
        layout: { direction: 'row', align: 'center', distribute: 'center' },
      },
      icon: { facets: { ink: 'text-muted' } },
      label: { facets: { ink: 'text', 'text.size': 'sm', 'text.weight': 'medium' } },
    },
  },

  List: {
    root: {
      facets: {
        fill: 'surface',
        corner: 'md',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'column' },
    },
    parts: {
      item: {
        facets: { ink: 'text', inset: 'sm', gap: 'sm' },
        layout: { direction: 'row', align: 'center' },
      },
      content: { facets: { ink: 'text' }, layout: { direction: 'row', align: 'center' } },
    },
  },
  Table: {
    root: {
      facets: {
        fill: 'surface',
        corner: 'md',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'column' },
    },
    parts: {
      header: {
        facets: { fill: 'surface-sunken', 'border.width': 'hairline', 'border.color': 'border' },
        layout: { direction: 'row', align: 'center' },
      },
      column: {
        facets: { ink: 'text-muted', inset: 'sm', 'text.size': 'sm', 'text.weight': 'semibold' },
      },
      body: { layout: { direction: 'column' } },
      row: {
        facets: { 'border.width': 'hairline', 'border.color': 'border' },
        layout: { direction: 'row', align: 'center' },
      },
      cell: { facets: { ink: 'text', inset: 'sm', 'text.size': 'md' } },
    },
  },
  Grid: {
    root: { facets: { gap: 'md' }, layout: { direction: 'row', wrap: 'wrap' } },
    parts: {
      item: {
        facets: {
          fill: 'surface',
          ink: 'text',
          corner: 'md',
          inset: 'md',
          'border.width': 'hairline',
          'border.color': 'border',
        },
        layout: { direction: 'column' },
      },
    },
  },

  Toast: {
    root: {
      facets: {
        fill: 'surface-raised',
        ink: 'text',
        corner: 'md',
        inset: 'md',
        gap: 'sm',
        elevation: 'lg',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'row', align: 'center' },
    },
    parts: {
      icon: { facets: { ink: 'accent' } },
      content: { facets: { ink: 'text', 'text.size': 'md' } },
      action: { facets: { ink: 'accent', 'text.weight': 'semibold' } },
      close: { facets: { ink: 'text-muted', corner: 'sm', inset: 'xs' } },
    },
  },
  Alert: {
    root: {
      facets: {
        fill: 'info-subtle',
        ink: 'text',
        corner: 'md',
        inset: 'md',
        gap: 'sm',
        'border.width': 'hairline',
        'border.color': 'info',
      },
      layout: { direction: 'row', align: 'start' },
    },
    parts: {
      icon: { facets: { ink: 'info' } },
      title: { facets: { ink: 'text', 'text.size': 'md', 'text.weight': 'semibold' } },
      content: { facets: { ink: 'text-muted', 'text.size': 'sm' } },
      close: { facets: { ink: 'text-muted', corner: 'sm', inset: 'xs' } },
    },
  },
  ProgressBar: {
    root: { facets: { gap: 'xs' }, layout: { direction: 'column' } },
    parts: {
      track: { facets: { fill: 'surface-sunken', corner: 'pill' } },
      indicator: { facets: { fill: 'accent', corner: 'pill' } },
      label: { facets: { ink: 'text-muted', 'text.size': 'sm' } },
    },
  },
  Badge: {
    root: {
      facets: { fill: 'accent', ink: 'on-accent', corner: 'pill', inset: 'xs' },
      layout: { direction: 'row', align: 'center', distribute: 'center' },
    },
    parts: {
      label: { facets: { ink: 'on-accent', 'text.size': 'xs', 'text.weight': 'semibold' } },
    },
  },
  Skeleton: {
    root: { facets: { fill: 'surface-sunken', corner: 'md' } },
  },
  EmptyState: {
    root: {
      facets: { gap: 'sm', inset: 'xl' },
      layout: { direction: 'column', align: 'center', distribute: 'center' },
    },
    parts: {
      icon: { facets: { ink: 'text-subtle' } },
      title: { facets: { ink: 'text', 'text.size': 'lg', 'text.weight': 'semibold' } },
      description: { facets: { ink: 'text-muted', 'text.size': 'md' } },
      action: accentButton,
    },
  },

  Avatar: {
    root: {
      facets: { fill: 'surface-sunken', ink: 'text-muted', corner: 'pill' },
      layout: { direction: 'row', align: 'center', distribute: 'center' },
    },
    parts: {
      image: { facets: { corner: 'pill' } },
      fallback: { facets: { ink: 'text-muted', 'text.weight': 'semibold' } },
      badge: {
        facets: {
          fill: 'success',
          corner: 'pill',
          'border.width': 'thin',
          'border.color': 'surface',
        },
      },
    },
  },
}

const leafOf = (node: ComponentNode): string | undefined => node.part?.split('.').pop()

function paint(node: ComponentNode, p?: PartPaint): void {
  if (!p) return
  if (p.facets) node.facets = { ...p.facets, ...node.facets }
  if (p.layout) node.layout = { ...p.layout, ...node.layout }
}

export function applyArchetypeDefaults(
  structure: ComponentStructure,
  archetype: string | null,
): void {
  seedLabelAssociations(structure)
  const def = archetype ? DEFAULTS[archetype] : undefined
  if (!def) return
  for (const node of Object.values(structure.nodes)) {
    if (node.parentId === null) paint(node, def.root)
    else {
      const leaf = leafOf(node)
      if (leaf) paint(node, def.parts?.[leaf])
    }
  }
}

function seedLabelAssociations(structure: ComponentStructure): void {
  for (const node of Object.values(structure.nodes)) {
    if (node.kind !== 'input' && node.kind !== 'control') continue
    if (node.a11y?.name || node.a11y?.labelledBy) continue
    const parent = node.parentId ? structure.nodes[node.parentId] : undefined
    if (!parent) continue
    const labels = parent.childrenIds
      .map((id) => structure.nodes[id])
      .filter((n): n is ComponentNode => !!n && n.kind === 'text' && leafOf(n) === 'label')
    if (labels.length === 1) node.a11y = { ...node.a11y, labelledBy: labels[0].id }
  }
}
