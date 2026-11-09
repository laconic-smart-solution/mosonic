import { describe, expect, it } from "vitest"

import { queryKeysForToolSteps } from "./chat-tool-invalidation"

describe("queryKeysForToolSteps", () => {
  it("ignores actions and read-only tools", () => {
    expect(
      queryKeysForToolSteps([
        { type: "action", name: "update_node_config", args: {} },
        { type: "observation", name: "get_rule", result: "{}" },
      ]),
    ).toEqual([])
  })

  it("maps workflow edits to workflow + estimate keys", () => {
    const keys = queryKeysForToolSteps([{ type: "observation", name: "update_node_config", result: "ok" }])
    expect(keys).toContainEqual(["workflow"])
    expect(keys).toContainEqual(["pipeline", "estimate"])
  })

  it("maps ingest_website_content to rule, assets, and workflow keys", () => {
    const keys = queryKeysForToolSteps([
      { type: "observation", name: "ingest_website_content", result: "{}" },
    ])
    expect(keys).toContainEqual(["rule"])
    expect(keys).toContainEqual(["rules"])
    expect(keys).toContainEqual(["chat-sessions"])
    expect(keys).toContainEqual(["rule-assets"])
    expect(keys).toContainEqual(["workflow"])
  })

  it("dedupes keys across steps and covers persisted tool_call steps", () => {
    const keys = queryKeysForToolSteps([
      { type: "tool_call", name: "start_generation", args: {}, result: "ok" },
      { type: "observation", name: "save_content", result: "ok" },
    ])
    expect(keys.filter((k) => JSON.stringify(k) === '["contents"]')).toHaveLength(1)
    expect(keys).toContainEqual(["pipeline"])
    expect(keys).toContainEqual(["usage", "summary"])
  })
})

  it("maps pipeline_result and get_content to content keys", () => {
    const keys = queryKeysForToolSteps([
      { type: "observation", name: "pipeline_result", result: "ok" },
      { type: "observation", name: "get_content", result: "ok" },
    ])
    expect(keys).toContainEqual(["contents"])
    expect(keys).toContainEqual(["content"])
    expect(keys).toContainEqual(["pipeline"])
  })

