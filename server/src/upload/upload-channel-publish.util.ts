import type { ResolvedContentOutputs } from '../content/content-output.utils';
import {
  CaptionMappingSource,
  ChannelMediaMapping,
} from '../rule/schemas/rule.schema';

export function resolveAutomappedCaption(
  source: CaptionMappingSource,
  outputs: ResolvedContentOutputs,
): string {
  const o = outputs ?? {};
  switch (source) {
    case CaptionMappingSource.Text:
      return (o.text ?? '').trim();
    case CaptionMappingSource.TranslatedText:
      return (o.translatedText ?? o.text ?? '').trim();
    case CaptionMappingSource.Summary:
      return (o.summary ?? o.text ?? '').trim();
    default:
      return (o.text ?? '').trim();
  }
}

export function resolveAutomappedMediaUrl(
  media: ChannelMediaMapping | null,
  outputs: ResolvedContentOutputs,
): string | null {
  const o = outputs ?? {};
  if (media === ChannelMediaMapping.Video) {
    return (o.video ?? '').trim() || null;
  }
  if (media === ChannelMediaMapping.Image) {
    return (o.image ?? '').trim() || null;
  }
  // When media mapping is not explicitly set (default/null):
  // Default to image if available, else video if available!
  const img = (o.image ?? '').trim();
  if (img) return img;
  const vid = (o.video ?? '').trim();
  if (vid) return vid;
  return null;
}
