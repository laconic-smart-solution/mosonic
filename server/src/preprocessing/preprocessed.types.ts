/** One logical piece of input after routing (text or binary for vision models). */
export type PreprocessedChunk =
  | { kind: 'text'; label: string; text: string }
  | {
      kind: 'base64';
      label: string;
      mime: string;
      base64: string;
    };

export type PreprocessedPayload = {
  userText: string;
  chunks: PreprocessedChunk[];
};

export type UploadedFileLike = {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
};
