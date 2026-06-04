export type UploadPaletteDragPayload =
  | { kind: "text"; source: "text" | "translatedText" | "summary"; nodeId?: string }
  | { kind: "image"; url: string; nodeId?: string }
  | { kind: "video"; url: string; nodeId?: string }
