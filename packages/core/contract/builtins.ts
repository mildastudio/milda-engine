import type { SharedType } from './types'

export const BUILTIN_COLOR_ID = '__builtin_color'
export const BUILTIN_ICON_NAME_ID = '__builtin_icon_name'
export const BUILTIN_DATE_ID = '__builtin_date'
export const BUILTIN_FILE_ID = '__builtin_file'

export const BUILTIN_SHARED_TYPES: readonly SharedType[] = [
  {
    id: BUILTIN_COLOR_ID,
    name: 'Color',
    description: 'Any valid CSS color string.',
    definition: { kind: 'string' },
    builtin: true,
  },
  {
    id: BUILTIN_ICON_NAME_ID,
    name: 'IconName',
    description: 'A union of every icon name available in the icon library.',
    definition: { kind: 'string' },
    builtin: true,
  },
  {
    id: BUILTIN_DATE_ID,
    name: 'Date',
    description: 'An ISO-8601 date string (YYYY-MM-DD).',
    definition: { kind: 'string' },
    builtin: true,
  },
  {
    id: BUILTIN_FILE_ID,
    name: 'File',
    description: 'A reference to a user-selected file.',
    definition: { kind: 'string' },
    builtin: true,
  },
]
