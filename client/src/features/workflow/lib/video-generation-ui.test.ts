import { describe, expect, it } from "vitest"

import {
  effectiveVideoMode,
  VIDEO_CINEMATIC_UI_ENABLED,
} from "./video-generation-ui"

describe("effectiveVideoMode", () => {
  it("returns presenter when cinematic UI is disabled", () => {
    expect(VIDEO_CINEMATIC_UI_ENABLED).toBe(false)
    expect(effectiveVideoMode({ mode: "cinematic" })).toBe("presenter")
    expect(effectiveVideoMode({})).toBe("presenter")
  })
})
