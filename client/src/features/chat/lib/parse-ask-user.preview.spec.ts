import { describe, expect, it } from "vitest"
import {
  displayGenerationTitle,
  isInternalToolMessage,
  parseAskUserPrompt,
} from "./parse-ask-user"

describe("generation preview ask_user", () => {
  it("parses structured preview and hides internal tool message", () => {
    const prompt = parseAskUserPrompt(
      JSON.stringify({
        ok: false,
        code: "preview_confirm",
        action: "ask_user",
        type: "single",
        confirmFor: "start_generation",
        question: 'Ready to generate "Launch post"?',
        topic: "Launch post",
        workflowId: "wf-1",
        preview: {
          steps: [
            { nodeId: "n1", type: "keyword_planner", order: 0, lane: null, settings: {} },
            {
              nodeId: "n2",
              type: "image_generation",
              order: 1,
              lane: "facebook",
              settings: { style: "natural", aspectRatio: "1:1" },
            },
          ],
          lanes: ["facebook"],
          issues: [],
          videoSteps: 0,
        },
        gaps: { channels: ["Facebook"], shared: false, missingVideo: false, missingChannels: [] },
        message:
          "Nothing started yet. On Start call start_generation again with the same arguments.",
        options: [
          { id: "start_post", label: "Start" },
          { id: "change", label: "Change settings" },
          { id: "cancel", label: "Cancel" },
        ],
      }),
    )!
    expect(prompt.confirmFor).toBe("start_generation")
    expect(prompt.notice).toBeUndefined()
    expect(prompt.workflowId).toBe("wf-1")
    expect(prompt.preview?.steps).toHaveLength(2)
    expect(prompt.preview?.steps[1].settings.style).toBe("natural")
    expect(prompt.gaps?.channels).toEqual(["Facebook"])
    expect(displayGenerationTitle(prompt)).toBe("Launch post")
  })

  it("detects leaked tool instructions", () => {
    expect(isInternalToolMessage("Nothing started yet. On Start call start_generation again.")).toBe(true)
    expect(isInternalToolMessage("I need your confirmation before I do this.")).toBe(false)
  })
})
