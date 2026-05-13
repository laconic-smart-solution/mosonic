export type UploadPaletteDragPayload =
  | { kind: "text"; source: "text" | "translatedText" | "summary" }
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
