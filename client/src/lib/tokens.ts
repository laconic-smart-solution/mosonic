export const T = {
  // Sidebar (navy scale)
  sidebarBg:       '#040B15',
  sidebarBorder:   '#0F1F3D',
  sidebarText:     '#A0AEC0',
  sidebarActive:   '#FFFFFF',
  sidebarActiveBg: '#091528',
  sidebarHoverBg:  '#09152880',

  // Canvas / main
  canvasBg:        '#F7F4EF',
  surfaceBg:       '#FFFFFF',
  surfaceBorder:   '#EDE9E1',
  surfaceShadow:   '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  surfaceShadowMd: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',

  // Topbar
  topbarBg:        'rgba(255,255,255,0.92)',
  topbarBorder:    '#EDE9E1',

  // Text (gray scale)
  textPrimary:   '#090C11',
  textSecondary: '#4A5568',
  textMuted:     '#718096',

  // Accent (teal scale)
  accent:        '#00A589',
  accentLight:   '#E0FAF5',
  accentBorder:  '#80E5D1',

  // Status
  green:       '#16A34A',
  greenBg:     '#DCFCE7',
  greenBorder: '#86EFAC',
  amber:       '#D48A0E',
  amberBg:     '#FEF6E4',
  amberBorder: '#FAD891',
  red:         '#DC2626',
  redBg:       '#FEE2E2',
  redBorder:   '#FCA5A5',
  blue:        '#2563EB',
  blueBg:      '#DBEAFE',
  blueBorder:  '#93C5FD',
} as const

export type ChipColor = 'gray' | 'indigo' | 'green' | 'amber' | 'red' | 'blue'

export const CHIP_COLORS: Record<ChipColor, { bg: string; text: string; border: string }> = {
  gray:   { bg: '#EDF2F7', text: '#4A5568', border: '#D9E1EC' },
  indigo: { bg: T.accentLight,  text: T.accent,  border: T.accentBorder },
  green:  { bg: T.greenBg,      text: T.green,   border: T.greenBorder  },
  amber:  { bg: T.amberBg,      text: T.amber,   border: T.amberBorder  },
  red:    { bg: T.redBg,        text: T.red,     border: T.redBorder    },
  blue:   { bg: T.blueBg,       text: T.blue,    border: T.blueBorder   },
}

export const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  done:      'green',
  running:   'blue',
  pending:   'amber',
  failed:    'red',
  idle:      'gray',
  active:    'green',
  draft:     'amber',
  archived:  'gray',
  published: 'green',
  scheduled: 'indigo',
  blocked:   'amber',
}
