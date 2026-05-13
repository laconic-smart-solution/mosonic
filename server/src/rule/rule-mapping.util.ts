import type { ChannelEntry, ContentMapping } from './schemas/rule.schema';
import {
  CaptionMappingSource,
  ChannelMediaMapping,
} from './schemas/rule.schema';

/** Legacy rules without nested mapping: behave like text caption, no mapped media slot. */
export function normalizedRuleChannelMapping(entry: Pick<ChannelEntry, 'contentMapping'>): {
  caption: CaptionMappingSource;
  media: ChannelMediaMapping | null;
} {
  const m: ContentMapping | undefined = entry.contentMapping;
  return {
    caption: m?.caption ?? CaptionMappingSource.Text,
    media: m?.media ?? null,
  };
}
