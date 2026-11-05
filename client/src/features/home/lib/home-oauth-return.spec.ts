import { describe, expect, it } from "vitest"

import { readHomeOauthReturn, stripHomeOauthParams } from "./home-oauth-return"

describe("home-oauth-return", () => {
  it("reads connected and error params", () => {
    const params = new URLSearchParams("connected=tiktok")
    expect(readHomeOauthReturn(params)).toEqual({
      connected: "tiktok",
      error: null,
    })
    expect(readHomeOauthReturn(new URLSearchParams("zernio_error=callback_failed"))).toEqual({
      connected: null,
      error: "callback_failed",
    })
  })

  it("strips oauth query keys", () => {
    const params = new URLSearchParams("connected=ig&keep=1&zernio_error=x")
    expect(stripHomeOauthParams(params).toString()).toBe("keep=1")
  })
})
