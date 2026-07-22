import type { ComponentNode, ComponentStructure, StateRule } from './structure/types'

interface PartPaint {
  facets?: Record<string, string>
  layout?: Record<string, string>
  states?: StateRule[]
}

interface ArchetypePaint {
  root?: PartPaint
  parts?: Record<string, PartPaint>
}

// Small seed-time state-rule builders (a self-contained counterpart to the
// example library's `onHover`/`onSelected` helpers — this package doesn't depend
// on that one). Interaction feedback a born control needs to read as ALIVE
// (hover, picked) without any author styling — replacing what used to be faked
// globally in the editor's fallback stylesheet.
const stateRule = (states: StateRule['states'], facets: Record<string, string>): StateRule => ({
  id: crypto.randomUUID(),
  props: {},
  states,
  facets,
})
const onHover = (facets: Record<string, string>): StateRule => stateRule(['hovered'], facets)
const onSelected = (facets: Record<string, string>): StateRule => stateRule(['selected'], facets)

const accentButton: PartPaint = {
  facets: { fill: 'accent', corner: 'md', inset: 'sm', gap: 'sm' },
  layout: { direction: 'row', align: 'center', distribute: 'center' },
  states: [onHover({ fill: 'accent-hover' })],
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
  states: [onHover({ fill: 'surface-sunken' })],
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
  states: [onHover({ 'border.color': 'border-strong' })],
}

const smallIconButton: PartPaint = {
  facets: { ink: 'text-muted', corner: 'sm', inset: 'xs' },
  layout: { direction: 'row', align: 'center', distribute: 'center' },
  states: [onHover({ fill: 'surface-sunken' })],
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
  // A born popup surface needs SOME width to read as a real menu/listbox rather
  // than a content-hugging sliver — the interactive preview overrides this to
  // match the trigger (surfacePositionDecls' `minWidth:100%`); this is the design-
  // canvas (and pre-interaction) fallback.
  layout: { direction: 'column', width: 'md' },
}

const menuItem: PartPaint = {
  facets: { ink: 'text', corner: 'sm', inset: 'sm', gap: 'sm' },
  layout: { direction: 'row', align: 'center' },
  states: [onHover({ fill: 'surface-sunken' })],
}

const DEFAULTS: Record<string, ArchetypePaint> = {
  Button: {
    root: {
      facets: { fill: 'accent', corner: 'md', insetX: 'lg', insetY: '6px' },
      layout: { direction: 'row', align: 'center', distribute: 'center' },
      states: [onHover({ fill: 'accent-hover' })],
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
    root: { facets: { gap: 'sm' }, layout: { direction: 'row', align: 'center', width: 'md' } },
    parts: {
      track: {
        facets: { fill: 'surface-sunken', corner: 'pill' },
        layout: { direction: 'row', align: 'center', width: 'fill', height: '6px' },
      },
      range: { facets: { fill: 'accent', corner: 'pill' }, layout: { width: '50%', height: 'fill' } },
      thumb: {
        facets: {
          fill: 'surface',
          corner: 'pill',
          elevation: 'sm',
          'border.width': 'hairline',
          'border.color': 'border',
        },
        layout: { width: '16px', height: '16px' },
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
  DatePicker: {
    parts: {
      trigger: {
        ...inputBox,
        layout: { direction: 'row', align: 'center', distribute: 'between', width: 'sm' },
      },
      value: { facets: { ink: 'text', 'text.size': 'md' } },
      icon: { facets: { ink: 'text-muted' } },
      surface: {
        ...overlaySurface,
        facets: { ...overlaySurface.facets, inset: 'sm', gap: 'sm' },
      },
      header: {
        facets: { gap: 'sm' },
        layout: { direction: 'row', align: 'center', distribute: 'between' },
      },
      prev: smallIconButton,
      next: smallIconButton,
      title: { facets: { ink: 'text', 'text.size': 'sm', 'text.weight': 'semibold' } },
      grid: { facets: { gap: 'xs' }, layout: { direction: 'row', wrap: 'wrap' } },
      day: {
        facets: { ink: 'text', corner: 'sm', inset: 'xs', 'text.size': 'sm' },
        layout: { direction: 'row', align: 'center', distribute: 'center' },
      },
      label: { facets: { ink: 'text', 'text.size': 'sm' } },
    },
  },
  TimePicker: {
    parts: {
      trigger: {
        ...inputBox,
        layout: { direction: 'row', align: 'center', distribute: 'between', width: 'sm' },
      },
      value: { facets: { ink: 'text', 'text.size': 'md' } },
      icon: { facets: { ink: 'text-muted' } },
      surface: { ...overlaySurface, layout: { ...overlaySurface.layout, direction: 'row' } },
      column: { facets: { gap: 'xs' }, layout: { direction: 'column' } },
      option: menuItem,
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },
  ColorPicker: {
    parts: {
      trigger: {
        ...inputBox,
        layout: { direction: 'row', align: 'center', distribute: 'between', width: 'sm' },
      },
      swatch: {
        facets: { fill: 'accent', corner: 'sm' },
        layout: { width: '16px', height: '16px' },
      },
      value: { facets: { ink: 'text', 'text.size': 'md' } },
      surface: { ...overlaySurface, facets: { ...overlaySurface.facets, inset: 'sm', gap: 'sm' } },
      area: { facets: { fill: 'surface-sunken', corner: 'md' }, layout: { height: '120px' } },
      hue: { facets: { fill: 'surface-sunken', corner: 'pill' }, layout: { height: '12px' } },
      input: {
        facets: {
          fill: 'surface',
          ink: 'text',
          corner: 'sm',
          inset: 'xs',
          'text.size': 'sm',
          'border.width': 'hairline',
          'border.color': 'border',
        },
      },
    },
  },
  FileUpload: {
    root: { facets: { gap: 'sm' }, layout: { direction: 'column' } },
    parts: {
      dropzone: {
        facets: {
          fill: 'surface',
          corner: 'md',
          inset: 'xl',
          gap: 'sm',
          'border.width': 'thin',
          'border.color': 'border',
        },
        layout: { direction: 'column', align: 'center', distribute: 'center' },
      },
      icon: { facets: { ink: 'text-muted' } },
      label: { facets: { ink: 'text-muted', 'text.size': 'sm' } },
      list: { facets: { gap: 'xs' }, layout: { direction: 'column' } },
      item: {
        facets: { gap: 'sm', inset: 'xs', corner: 'sm' },
        layout: { direction: 'row', align: 'center', distribute: 'between' },
      },
      name: { facets: { ink: 'text', 'text.size': 'sm' } },
      remove: smallIconButton,
    },
  },
  Rating: {
    root: { facets: { gap: 'xs' }, layout: { direction: 'row', align: 'center' } },
    parts: {
      item: {
        facets: { corner: 'sm' },
        layout: { direction: 'row', align: 'center' },
        states: [onHover({ fill: 'surface-sunken' })],
      },
      icon: { facets: { ink: 'text-muted' }, states: [onSelected({ ink: 'accent' })] },
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
        facets: {
          ink: 'text-muted',
          inset: 'sm',
          gap: 'sm',
          'border.width': 'hairline',
          'border.color': 'transparent',
        },
        layout: { direction: 'row', align: 'center', distribute: 'center' },
        states: [onHover({ ink: 'text' }), onSelected({ ink: 'accent', 'border.color': 'accent' })],
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
        layout: { direction: 'column', width: 'md' },
      },
      content: { facets: { ink: 'text', 'text.size': 'md' }, layout: { direction: 'column' } },
    },
  },
  Tooltip: {
    // The trigger wraps WHATEVER the consumer hovers/focuses — a real button, a
    // piece of text, an icon. It carries no chrome of its own (that would fight
    // the wrapped content's own look); it's a default content slot instead (see
    // PART_OVERRIDES in seed.ts), with a design-time sample so a born tooltip
    // still reads as anchored to something rather than a blank spot.
    parts: {
      surface: {
        facets: { fill: 'text', ink: 'surface', corner: 'sm', inset: 'xs', elevation: 'md' },
      },
      content: { facets: { ink: 'surface', 'text.size': 'sm' } },
    },
  },
  ContextMenu: {
    // The root IS the context region (right-click / long-press target) — give it a
    // visible area so the born component can actually be invoked and styled.
    root: {
      facets: {
        fill: 'surface',
        corner: 'md',
        inset: 'xl',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'row', align: 'center', distribute: 'center' },
    },
    parts: {
      surface: overlaySurface,
      item: menuItem,
      icon: { facets: { ink: 'text-muted' } },
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },

  Tree: {
    root: { layout: { direction: 'column' } },
    parts: {
      item: {
        facets: { corner: 'sm', inset: 'xs', gap: 'sm' },
        layout: { direction: 'row', align: 'center' },
      },
      indicator: { facets: { ink: 'text-muted' } },
      label: { facets: { ink: 'text', 'text.size': 'md' } },
    },
  },
  Wizard: {
    root: { facets: { gap: 'lg' }, layout: { direction: 'column' } },
    parts: {
      step: { facets: { gap: 'sm' }, layout: { direction: 'row', align: 'center' } },
      indicator: { facets: { ink: 'text-muted' } },
      label: { facets: { ink: 'text', 'text.size': 'sm', 'text.weight': 'medium' } },
      content: { facets: { gap: 'md' }, layout: { direction: 'column' } },
      back: outlineButton,
      next: accentButton,
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
        facets: { ink: 'text', inset: 'sm', gap: 'sm', corner: 'sm' },
        layout: { direction: 'row', align: 'center' },
        states: [onHover({ fill: 'surface-sunken' }), onSelected({ fill: 'accent-subtle' })],
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

  Carousel: {
    root: { facets: { gap: 'sm' }, layout: { direction: 'row', align: 'center' } },
    parts: {
      viewport: {
        facets: {
          fill: 'surface',
          corner: 'md',
          inset: 'sm',
          gap: 'sm',
          'border.width': 'hairline',
          'border.color': 'border',
        },
        layout: { direction: 'row', align: 'center' },
      },
      slide: { facets: { fill: 'surface-sunken', corner: 'md', inset: 'md' } },
      previous: smallIconButton,
      next: smallIconButton,
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
  Meter: {
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
      layout: { direction: 'row', align: 'center', distribute: 'center', width: '40px', height: '40px' },
    },
    parts: {
      image: { facets: { corner: 'pill' }, layout: { width: 'fill', height: 'fill' } },
      fallback: { facets: { ink: 'text-muted', 'text.weight': 'semibold' } },
      badge: {
        facets: {
          fill: 'success',
          corner: 'pill',
          'border.width': 'thin',
          'border.color': 'surface',
        },
        layout: { width: '12px', height: '12px' },
      },
    },
  },
}

const leafOf = (node: ComponentNode): string | undefined => node.part?.split('.').pop()

function paint(node: ComponentNode, p?: PartPaint): void {
  if (!p) return
  if (p.facets) node.facets = { ...p.facets, ...node.facets }
  if (p.layout) node.layout = { ...p.layout, ...node.layout }
  // A freshly-seeded node never already carries states, so this is additive, not
  // a merge-with-override — but append (rather than replace) to stay future-proof.
  if (p.states?.length) node.states = [...p.states, ...(node.states ?? [])]
}

export function applyArchetypeDefaults(
  structure: ComponentStructure,
  archetype: string | null,
): void {
  seedLabelAssociations(structure)
  seedControlNames(structure)
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

// Icon-only action parts a born component ships unlabeled (a Dialog's ×, a tag's
// remove, a pager's arrows): give them their conventional accessible name so the
// seed is ARIA-conform from birth. Pure a11y intent — realized as aria-label on web,
// an accessibility label on native — never visible content. The author's own
// name/label always wins (only set when absent), and a control that will contain
// visible text names itself from its contents instead.
const CONTROL_PART_NAMES: Record<string, string> = {
  close: 'Close',
  clear: 'Clear',
  remove: 'Remove',
  previous: 'Previous',
  prev: 'Previous',
  next: 'Next',
  back: 'Back',
  increment: 'Increase',
  decrement: 'Decrease',
}

function seedControlNames(structure: ComponentStructure): void {
  for (const node of Object.values(structure.nodes)) {
    if (node.kind !== 'control') continue
    if (node.a11y?.name || node.a11y?.labelledBy) continue
    const name = CONTROL_PART_NAMES[leafOf(node) ?? '']
    if (!name) continue
    const hasText = node.childrenIds.some((id) => structure.nodes[id]?.kind === 'text')
    if (hasText) continue
    node.a11y = { ...node.a11y, name: { kind: 'value', value: name } }
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
