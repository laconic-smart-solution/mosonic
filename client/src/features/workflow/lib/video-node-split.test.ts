import { describe, expect, it } from "vitest"
import {
  backendTypeToCanvas,
  buildGenerateMoreDefaultConfig,
  canvasTypeToBackend,
  defaultConfigForNewCanvasNode,
} from "@/features/workflow/data/workflow-model"
import {
  effectiveVideoMode,
  isVideoBackendType,
  isVideoCanvasType,
} from "@/features/workflow/lib/video-generation-ui"
import {
  getVideoPresenterConfigErrors,
  mergeHeygenVideoConfig,
} from "@/features/workflow/lib/workflow-node-validation"
import { resolveWfNodeCreditKey } from "@/features/workflow/lib/workflow-node-credit"

// Pure mapping/config tests: no network, no video generation.
describe("split video nodes", () => {
  it("maps backend types to canvas types (legacy by config.mode)", () => {
    expect(backendTypeToCanvas("video_presenter")).toBe("video_presenter")
    expect(backendTypeToCanvas("video_cinematic")).toBe("video_cinematic")
    expect(backendTypeToCanvas("video_generation", { mode: "presenter" })).toBe("video_presenter")
    expect(backendTypeToCanvas("video_generation", {})).toBe("video_cinematic")
    expect(canvasTypeToBackend("video_presenter")).toBe("video_presenter")
    expect(canvasTypeToBackend("video_cinematic")).toBe("video_cinematic")
    expect(canvasTypeToBackend("video")).toBe("video_cinematic")
  })

  it("recognises video types", () => {
    expect(isVideoCanvasType("video_presenter")).toBe(true)
    expect(isVideoCanvasType("image")).toBe(false)
    expect(isVideoBackendType("video_generation")).toBe(true)
    expect(isVideoBackendType("image_generation")).toBe(false)
  })

  it("lets the split type decide the mode", () => {
    expect(effectiveVideoMode({ mode: "cinematic" }, "video_presenter")).toBe("presenter")
    expect(effectiveVideoMode({ mode: "presenter" }, "video_cinematic")).toBe("cinematic")
    expect(effectiveVideoMode({ mode: "presenter" }, "video")).toBe("presenter")
  })

  it("defaults presenter to portrait 9:16 and cinematic to 16:9", () => {
    expect(defaultConfigForNewCanvasNode("video_presenter")).toMatchObject({
      mode: "presenter",
      heygenOrientation: "portrait",
      aspectRatio: "9:16",
    })
    expect(defaultConfigForNewCanvasNode("video_cinematic")).toMatchObject({
      mode: "cinematic",
      cinematicMode: "cinematic_avatar",
      aspectRatio: "16:9",
      duration: 10,
      heygenCinematicModel: "heygen_video_1",
    })
  })

  it("uses 9:16 for Instagram cinematic and keeps presenter portrait", () => {
    const rule = { channels: [{ channel: "instagram" }] }
    expect(buildGenerateMoreDefaultConfig("video_cinematic", rule).aspectRatio).toBe("9:16")
    expect(buildGenerateMoreDefaultConfig("video_presenter", rule)).toMatchObject({
      heygenOrientation: "portrait",
      aspectRatio: "9:16",
    })
    expect(buildGenerateMoreDefaultConfig("video_cinematic", null).aspectRatio).toBe("16:9")
  })

  it("never flips a presenter node to cinematic when the avatar is cleared", () => {
    const merged = mergeHeygenVideoConfig(
      { mode: "presenter", heygenAvatarId: "a" },
      { heygenAvatarId: "", mode: "cinematic" },
      "video_presenter",
    )
    expect(merged.mode).toBe("presenter")
    const legacy = mergeHeygenVideoConfig(
      { mode: "presenter", heygenAvatarId: "a" },
      { heygenAvatarId: "" },
    )
    expect(legacy.mode).toBe("cinematic")
  })

  it("requires avatar and voice on presenter nodes even without config.mode", () => {
    expect(getVideoPresenterConfigErrors({}, "video_presenter")).toHaveLength(2)
    expect(getVideoPresenterConfigErrors({}, "video_cinematic")).toHaveLength(0)
  })

  it("bills by node type", () => {
    expect(resolveWfNodeCreditKey("video_presenter", {})).toBe("video_generation_presenter")
    expect(resolveWfNodeCreditKey("video_cinematic", { mode: "presenter" })).toBe("video_generation_cinematic")
  })
})
