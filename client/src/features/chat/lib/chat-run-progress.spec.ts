import { describe, expect, it } from "vitest"

import type { ChatMessage, ChatRunProgress } from "@/shared/services/chat.service"
import {
  findRunReportId,
  findStartedRunIds,
  isRunReported,
  liveRemainingMs,
  progressFraction,
  remainingLabel,
  runDurationSeconds,
} from "./chat-run-progress"

const progress = (over: Partial<ChatRunProgress> = {}): ChatRunProgress => ({
  sessionId: "s1",
  pipelineId: "p1",
  name: "Run",
  status: "running",
  steps: [
    { nodeId: "a", name: "text_generation", label: "Caption draft", status: "done", durationMs: 8000 },
    { nodeId: "b", name: "image_generation", label: "Generating images", status: "running", durationMs: null },
    { nodeId: "c", name: "translation", label: "Translating", status: "pending", durationMs: null },
    { nodeId: "d", name: "merge", label: "Ready for review", status: "pending", durationMs: null },
  ],
  currentStep: "b",
  startedAt: "2026-11-02T09:00:00.000Z",
  completedAt: null,
  estimatedRemainingMs: 30000,
  failedNodeId: null,
  error: null,
  ...over,
})

describe("chat-run-progress", () => {
  it("finds started runs and the follow-up report", () => {
    const steps = [
      { type: "action" as const, name: "start_generation", args: {} },
      { type: "observation" as const, name: "start_generation", result: JSON.stringify({ ok: true, action: "pipeline_started", pipelineId: "p1" }) },
    ]
    expect(findStartedRunIds(steps)).toEqual(["p1"])
    expect(findStartedRunIds(null)).toEqual([])
    const report = [{ type: "action" as const, name: "pipeline_result", args: { pipelineId: "p1" } }]
    expect(findRunReportId(report)).toBe("p1")
    const messages = [{ role: "assistant", steps: report } as unknown as ChatMessage]
    expect(isRunReported(messages, "p1")).toBe(true)
    expect(isRunReported(messages, "p2")).toBe(false)
  })

  it("formats remaining time", () => {
    expect(remainingLabel(null)).toBeNull()
    expect(remainingLabel(3000)).toEqual({ key: "almost", count: 0 })
    expect(remainingLabel(28000)).toEqual({ key: "seconds", count: 30 })
    expect(remainingLabel(130000)).toEqual({ key: "minutes", count: 2 })
  })

  it("computes fraction, duration and live countdown", () => {
    expect(progressFraction(progress())).toBeCloseTo(1.5 / 4)
    expect(runDurationSeconds(progress({ completedAt: "2026-11-02T09:01:04.000Z" }))).toBe(64)
    expect(runDurationSeconds(progress())).toBeNull()
    expect(liveRemainingMs(progress(), 1000, 11000)).toBe(20000)
    expect(liveRemainingMs(progress({ status: "completed" }), 0, 0)).toBeNull()
  })
})
