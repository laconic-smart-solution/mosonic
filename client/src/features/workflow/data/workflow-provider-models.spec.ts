import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n", () => ({
  default: { t: (key: string) => key },
}))
import {
  defaultConfigForNewCanvasNode,
  defaultModelForProvider,
  modelsForProviderAndCanvasType,
  resolveNodeModelInfo,
  WORKFLOW_AI_PROVIDERS,
} from "./workflow-model"
import type { WorkflowNode } from "@/shared/types/workflow.type"
import { nodeHasConfigurableSettings } from "../components/workflow-node-config-fields"

describe("workflow AI provider & model configuration", () => {
  it("exposes GPT (OpenAI) and Gemini (Google) providers", () => {
    expect(WORKFLOW_AI_PROVIDERS.map((p) => p.value)).toEqual([
      "openai",
      "google",
    ])
  })

  it("resolves provider-scoped models across all AI node types", () => {
    const aiTypes = [
      "keywords",
      "text",
      "image",
      "translation",
      "transcription",
      "summarization",
      "adapt",
      "intelligence",
    ]
    for (const type of aiTypes) {
      expect(nodeHasConfigurableSettings(type)).toBe(true)
      expect(modelsForProviderAndCanvasType("openai", type).length).toBeGreaterThan(0)
      expect(modelsForProviderAndCanvasType("google", type).length).toBeGreaterThan(0)
    }
  })

  it("maps provider defaults cleanly between openai and google", () => {
    expect(defaultModelForProvider("text", "openai")).toBe("gpt-4o")
    expect(defaultModelForProvider("text", "google")).toBe("gemini-2.5-flash")
    expect(defaultModelForProvider("image", "openai")).toBe("gpt-image-2")
    expect(defaultModelForProvider("image", "google")).toBe("gemini-2.5-flash-image")
    expect(defaultModelForProvider("transcription", "openai")).toBe("whisper-1")
    expect(defaultModelForProvider("transcription", "google")).toBe("gemini-2.5-flash")
  })

  it("defaults newly added AI nodes to openai provider", () => {
    expect(defaultConfigForNewCanvasNode("text")).toMatchObject({
      provider: "openai",
      model: "gpt-4o",
    })
    expect(defaultConfigForNewCanvasNode("image")).toMatchObject({
      provider: "openai",
      model: "gpt-image-2",
    })
  })

  it("resolves accurate node model and provider badge info", () => {
    const geminiTextNode: WorkflowNode = {
      nodeId: "n1",
      type: "text_generation",
      order: 2,
      isLocked: false,
      config: { provider: "google", model: "gemini-2.5-flash" },
    }
    expect(resolveNodeModelInfo(geminiTextNode)).toEqual({
      provider: "google",
      model: "gemini-2.5-flash",
      label: "Gemini · gemini-2.5-flash",
    })

    const geminiImageNode: WorkflowNode = {
      nodeId: "n2",
      type: "image_generation",
      order: 8,
      isLocked: false,
      config: { provider: "google", model: "imagen-3.0-generate-002" },
    }
    expect(resolveNodeModelInfo(geminiImageNode)).toEqual({
      provider: "google",
      model: "imagen-3.0-generate-002",
      label: "Gemini · imagen-3.0-generate-002",
    })

    const defaultOpenAiImageNode: WorkflowNode = {
      nodeId: "n3",
      type: "image_generation",
      order: 8,
      isLocked: false,
      config: {},
    }
    expect(resolveNodeModelInfo(defaultOpenAiImageNode)).toEqual({
      provider: "openai",
      model: "gpt-image-2",
      label: "GPT · gpt-image-2",
    })

    const heygenPresenterNode: WorkflowNode = {
      nodeId: "n4",
      type: "video_presenter",
      order: 9,
      isLocked: false,
      config: { mode: "heygen_video_1" },
    }
    expect(resolveNodeModelInfo(heygenPresenterNode)).toEqual({
      provider: "heygen",
      model: "heygen_video_1",
      label: "HeyGen · Photo Avatar",
    })

    // Output layer override
    expect(
      resolveNodeModelInfo(geminiTextNode, {
        providerModel: "gemini-2.5-pro",
      }),
    ).toEqual({
      provider: "google",
      model: "gemini-2.5-pro",
      label: "Gemini · gemini-2.5-pro",
    })
  })
})
