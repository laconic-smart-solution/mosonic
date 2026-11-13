import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n", () => ({
  default: { t: (key: string) => key },
}))
import {
  defaultConfigForNewCanvasNode,
  defaultModelForProvider,
  modelsForProviderAndCanvasType,
  WORKFLOW_AI_PROVIDERS,
} from "./workflow-model"
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
})
