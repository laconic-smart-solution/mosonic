import { describe, expect, it } from "vitest"

import {
  findStartOauth,
  findStartRednoteQr,
  parseStartOauth,
  parseStartRednoteQr,
} from "./parse-start-oauth"

describe("parseStartOauth", () => {
  it("parses a connect URL marker", () => {
    expect(
      parseStartOauth(
        JSON.stringify({
          ok: true,
          action: "start_oauth",
          platform: "TikTok",
          connectUrl: "https://zernio.example/connect",
        }),
      ),
    ).toEqual({
      action: "start_oauth",
      platform: "tiktok",
      connectUrl: "https://zernio.example/connect",
    })
  })

  it("rejects incomplete payloads", () => {
    expect(parseStartOauth(JSON.stringify({ action: "start_oauth" }))).toBeNull()
    expect(parseStartOauth("not-json")).toBeNull()
  })
})

describe("parseStartRednoteQr", () => {
  it("parses a RedNote QR marker", () => {
    expect(
      parseStartRednoteQr(
        JSON.stringify({
          ok: true,
          action: "start_rednote_qr",
          platform: "rednote",
          socketRoom: "rednote:u1",
        }),
      ),
    ).toEqual({
      action: "start_rednote_qr",
      platform: "rednote",
      socketRoom: "rednote:u1",
    })
  })
})

describe("findStartOauth", () => {
  it("keeps the latest marker per platform", () => {
    const markers = findStartOauth([
      {
        type: "observation",
        result: JSON.stringify({
          action: "start_oauth",
          platform: "facebook",
          connectUrl: "https://a.example/fb1",
        }),
      },
      {
        type: "observation",
        result: JSON.stringify({
          action: "start_oauth",
          platform: "facebook",
          connectUrl: "https://a.example/fb2",
        }),
      },
      {
        type: "observation",
        result: JSON.stringify({
          action: "start_oauth",
          platform: "instagram",
          connectUrl: "https://a.example/ig",
        }),
      },
    ])
    expect(markers).toEqual([
      {
        action: "start_oauth",
        platform: "facebook",
        connectUrl: "https://a.example/fb2",
      },
      {
        action: "start_oauth",
        platform: "instagram",
        connectUrl: "https://a.example/ig",
      },
    ])
  })
})

describe("findStartRednoteQr", () => {
  it("returns the latest rednote marker", () => {
    expect(
      findStartRednoteQr([
        {
          type: "observation",
          result: JSON.stringify({
            action: "start_rednote_qr",
            socketRoom: "rednote:old",
          }),
        },
        {
          type: "observation",
          result: JSON.stringify({
            action: "start_rednote_qr",
            socketRoom: "rednote:new",
          }),
        },
      ]),
    ).toEqual({
      action: "start_rednote_qr",
      platform: "rednote",
      socketRoom: "rednote:new",
    })
  })
})
