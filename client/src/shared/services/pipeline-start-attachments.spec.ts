import { describe, expect, it, vi } from "vitest"
import type { Attachment } from "@/components/core/prompt-area"

vi.mock("../api/api-client", () => ({
  default: {
    post: vi.fn(async (_url: string, body: unknown) => ({
      data: { pipelineId: "p1", body },
    })),
  },
}))

import apiClient from "../api/api-client"
import { pipelineService } from "./pipeline.service"

describe("pipelineService.startPipeline attachments", () => {
  it("posts JSON when there are no attachments", async () => {
    await pipelineService.startPipeline({
      workflowId: "w1",
      ruleId: "r1",
      contentPrompt: "hello",
    })
    expect(apiClient.post).toHaveBeenCalledWith("/pipeline/start", {
      workflowId: "w1",
      ruleId: "r1",
      contentPrompt: "hello",
    })
  })

  it("posts FormData when files are attached", async () => {
    const file = new File(["x"], "logo.png", { type: "image/png" })
    const attachments: Attachment[] = [
      { id: "1", type: "file", label: "logo.png", data: file },
    ]
    await pipelineService.startPipeline({
      workflowId: "w1",
      ruleId: "r1",
      contentPrompt: "ad with logo",
      attachments,
    })
    const call = vi.mocked(apiClient.post).mock.calls.at(-1)
    expect(call?.[0]).toBe("/pipeline/start")
    expect(call?.[1]).toBeInstanceOf(FormData)
    const fd = call?.[1] as FormData
    expect(fd.get("contentPrompt")).toBe("ad with logo")
    expect(fd.get("workflowId")).toBe("w1")
    expect(fd.get("ruleId")).toBe("r1")
    expect(fd.get("files")).toBeInstanceOf(File)
  })
})
