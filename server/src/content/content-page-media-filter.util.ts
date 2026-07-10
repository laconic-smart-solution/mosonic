import type {
  ContentPageFilterDto,
  ContentPageItemDto,
} from './dto/content-page-query.dto';

export type MediaFilterField = 'image' | 'video' | 'summary';

export function collectMediaFilterFields(
  filter?: ContentPageFilterDto,
): MediaFilterField[] {
  const fields: MediaFilterField[] = [];
  if (filter?.hasImage === true) fields.push('image');
  if (filter?.hasVideo === true) fields.push('video');
  if (filter?.hasSummary === true) fields.push('summary');
  return fields;
}

function mediaFromLaneOutputs(
  laneOutputs: Record<string, Record<string, unknown>> | undefined,
  field: MediaFilterField,
): string | null {
  if (!laneOutputs) return null;
  for (const layer of Object.values(laneOutputs)) {
    const value = layer?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Mirrors client list-card media detection (merged outputs + lane fallbacks). */
export function contentPageItemHasMedia(
  item: Pick<ContentPageItemDto, 'outputs' | 'laneOutputs'>,
  field: MediaFilterField,
): boolean {
  const direct = item.outputs?.[field];
  if (typeof direct === 'string' && direct.trim()) return true;
  return mediaFromLaneOutputs(item.laneOutputs, field) != null;
}

/** Multiple media filters combine with OR — show items that match any selected type. */
export function contentPageItemMatchesMediaFilters(
  item: Pick<ContentPageItemDto, 'outputs' | 'laneOutputs'>,
  fields: MediaFilterField[],
): boolean {
  if (fields.length === 0) return true;
  return fields.some((field) => contentPageItemHasMedia(item, field));
}
