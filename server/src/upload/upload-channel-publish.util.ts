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
  if (!media) return null;
  const o = outputs ?? {};
  const url =
    media === ChannelMediaMapping.Image
      ? (o.image ?? '').trim()
      : (o.video ?? '').trim();
  return url.length > 0 ? url : null;
}
