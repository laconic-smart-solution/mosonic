import { describe, expect, it } from "vitest"
import type { AgentStep } from "@/shared/services/chat.service"
import { dropSkippedSteps } from "./normalize-agent-steps"

describe("dropSkippedSteps", () => {
  it("drops guard-skipped action + observation pairs", () => {
    const steps = [
      { type: "action", name: "update_rule", args: {}, toolCallId: "a" },
      { type: "observation", name: "update_rule", toolCallId: "a", result: '{"ok":true}' },
      { type: "action", name: "apply_default_workflow", args: {}, toolCallId: "b" },
      { type: "observation", name: "apply_default_workflow", toolCallId: "b", result: '{"ok":false,"code":"one_mutation_per_turn"}' },
    ] as unknown as AgentStep[]
    const out = dropSkippedSteps(steps)
    expect(out).toHaveLength(2)
    expect(out.filter((s) => s.type === "action")).toHaveLength(1)
  })

  it("drops ask-first refusals so the confirmed call is the only row for that step", () => {
    const blocked = JSON.stringify({ ok: false, code: "confirmation_required", action: "ask_user", type: "yes_no", confirmFor: "publish_now", question: "Publish now?" })
    const gap = JSON.stringify({ ok: false, code: "capability_gap", plan: {} })
    const steps = [
      { type: "action", name: "publish_now", args: {}, toolCallId: "p" },
      { type: "observation", name: "publish_now", toolCallId: "p", result: blocked },
      { type: "action", name: "start_generation", args: {}, toolCallId: "g" },
      { type: "observation", name: "start_generation", toolCallId: "g", result: gap },
      { type: "action", name: "list_channels", args: {}, toolCallId: "c" },
      { type: "observation", name: "list_channels", toolCallId: "c", result: '{"ok":true}' },
    ] as unknown as AgentStep[]
    const out = dropSkippedSteps(steps)
    expect(out.map((s) => (s as { name: string }).name)).toEqual(["list_channels", "list_channels"])
  })

  it("drops the narrow chat guards' refusals (nothing ran)", () => {
    const codes = ["use_generate_more_adapt", "already_started", "rerun_pending", "workflow_just_built", "image_step_present", "lane_unchanged"]
    const steps = codes.flatMap((code, i) => [
      { type: "action", name: `t${i}`, args: {}, toolCallId: `c${i}` },
      { type: "observation", name: `t${i}`, toolCallId: `c${i}`, result: JSON.stringify({ ok: false, code }) },
    ]) as unknown as AgentStep[]
    expect(dropSkippedSteps(steps)).toEqual([])
  })

  it("keeps lane_not_changed (the save ran but the move did not stick)", () => {
    const steps = [
      { type: "action", name: "update_node_config", args: {}, toolCallId: "u" },
      { type: "observation", name: "update_node_config", toolCallId: "u", result: JSON.stringify({ ok: false, code: "lane_not_changed" }) },
    ] as unknown as AgentStep[]
    expect(dropSkippedSteps(steps)).toHaveLength(2)
  })
})
