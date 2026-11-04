import { describe, expect, it } from "vitest"

import { findToolError, parseToolError } from "./parse-tool-error"

describe("parseToolError", () => {
  it("parses ok:false observations", () => {
    expect(parseToolError("fetch_website_assets", '{"ok":false,"code":"tool_failed","message":"timeout"}')).toEqual({
      toolName: "fetch_website_assets",
      code: "tool_failed",
      message: "timeout",
    })
  })
  it("ignores ok results and non-json", () => {
    expect(parseToolError("x", '{"ok":true}')).toBeNull()
    expect(parseToolError("x", "plain text")).toBeNull()
  })
  it("skips guard-rail codes", () => {
    expect(
      findToolError([
        { type: "observation", name: "approve_content", result: '{"ok":false,"code":"confirmation_required"}' },
      ]),
    ).toBeNull()
  })
})
