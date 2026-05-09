import type {
  ContentOutputs,
  ContentUserEdits,
} from './schemas/content.schema';

/** Merged view: user edits override AI outputs when present. */
export type ResolvedContentOutputs = {
  text?: string;
  image?: string;
  translatedText?: string;
  video?: string;
  transcription?: string;
  summary?: string;
};

export function mergeResolvedOutputs(version: {
  outputs?: ContentOutputs;
  userEdits?: ContentUserEdits;
}): ResolvedContentOutputs {
  const o = version.outputs ?? {};
  const u = version.userEdits ?? {};
  return {
    text: coalesce(u.text, o.text),
    image: coalesce(u.image, o.image),
    translatedText: coalesce(u.translatedText, o.translatedText),
    video: coalesce(u.video, o.video),
    transcription: coalesce(u.transcription, o.transcription),
    summary: coalesce(u.summary, o.summary),
  };
}

function coalesce(
  user: string | undefined | null,
  ai: string | undefined,
): string | undefined {
  if (user !== undefined && user !== null) return user;
  return ai;
}
