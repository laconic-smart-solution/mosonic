/**
 * Single source of truth for allowed workflow node transitions (API snake_case types).
 * Client canvas validation imports this file via Vite path alias `@workflow-next-matrix`.
 */

export const WORKFLOW_NEXT_MATRIX = {
  keyword_planner: ['intelligence', 'text_generation'],
  intelligence: ['text_generation'],
  transcription: ['text_generation', 'summarization', 'translation'],
  text_generation: [
    'branch',
    'image_generation',
    'video_generation',
    'summarization',
    'translation',
  ],
  branch: ['adapt'],
  adapt: [
    'image_generation',
    'video_generation',
    'summarization',
    'translation',
    'merge',
  ],
  image_generation: [
    'image_generation',
    'video_generation',
    'translation',
    'merge',
  ],
  video_generation: [
    'video_generation',
    'translation',
    'merge',
  ],
  summarization: [
    'summarization',
    'image_generation',
    'video_generation',
    'translation',
    'merge',
  ],
  translation: [
    'translation',
    'image_generation',
    'video_generation',
    'summarization',
    'merge',
  ],
  merge: [],
} as const

export const ENRICHMENT_TYPE_ORDER = [
  'transcription',
  'keyword_planner',
  'intelligence',
] as const

export const TRUNK_TAIL_AFTER_TEXT_ORDER = [
  'summarization',
  'translation',
  'image_generation',
  'video_generation',
] as const

export const LANE_NODE_ORDER = [
  'summarization',
  'translation',
  'image_generation',
  'video_generation',
] as const

export const WORKFLOW_TYPE_TO_CANVAS: Record<string, string> = {
  keyword_planner: 'keywords',
  text_generation: 'text',
  image_generation: 'image',
  video_generation: 'video',
  summarization: 'summarization',
  translation: 'translation',
  transcription: 'transcription',
  branch: 'branch',
  adapt: 'adapt',
  merge: 'merge',
  intelligence: 'intelligence',
}

export type PlusPopoverKey =
  | 'keywords'
  | 'intelligence'
  | 'text'
  | 'transcription'
  | 'branch'
  | 'adapt'
  | 'image'
  | 'video'
  | 'summarization'
  | 'translation'
  | 'merge'

export function canvasNextMatrix(): Record<
  PlusPopoverKey,
  readonly PlusPopoverKey[]
> {
  const out: Partial<Record<PlusPopoverKey, PlusPopoverKey[]>> = {}
  for (const [fromWf, targets] of Object.entries(WORKFLOW_NEXT_MATRIX)) {
    const fromCanvas = (WORKFLOW_TYPE_TO_CANVAS[fromWf] ??
      fromWf) as PlusPopoverKey
    out[fromCanvas] = targets.map(
      (t) =>
        (WORKFLOW_TYPE_TO_CANVAS[t] ?? t) as PlusPopoverKey,
    )
  }
  return out as Record<PlusPopoverKey, readonly PlusPopoverKey[]>
}
