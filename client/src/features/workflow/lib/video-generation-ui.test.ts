import { describe, expect, it } from "vitest"

import {
  effectiveVideoMode,
  VIDEO_CINEMATIC_UI_ENABLED,
} from "./video-generation-ui"

describe("effectiveVideoMode", () => {
  it("returns cinematic when cinematic UI is enabled and mode is unset", () => {
    expect(VIDEO_CINEMATIC_UI_ENABLED).toBe(true)
    expect(effectiveVideoMode({})).toBe("cinematic")
    expect(effectiveVideoMode({ mode: "cinematic" })).toBe("cinematic")
  })

  it("returns presenter only when mode is explicitly presenter", () => {
    expect(effectiveVideoMode({ mode: "presenter" })).toBe("presenter")
  })
})
