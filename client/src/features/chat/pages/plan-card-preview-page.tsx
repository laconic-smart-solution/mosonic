import { ChatGenerationPreview } from "@/features/chat/components/chat-generation-preview"
import type { AskUserPrompt } from "@/features/chat/lib/parse-ask-user"

/** DEV-only fixture matching Designer mock state B (Image · Facebook · Style). */
const FIXTURE: AskUserPrompt = {
  action: "ask_user",
  type: "single",
  confirmFor: "start_generation",
  question: "Ready to generate Website launch?",
  topic: "Website launch",
  workflowId: undefined,
  options: [
    { id: "start_post", label: "Start" },
    { id: "change", label: "Change settings" },
    { id: "cancel", label: "Cancel" },
  ],
  plan: {
    youAskedFor: [
      "Posts for Facebook, TikTok, LinkedIn",
      "3 mockup images each",
      "Use your 3 screenshots",
    ],
    willChange: [
      "Add TikTok & LinkedIn",
      "Images per channel: 1 → 3",
      "Use your 3 screenshots as reference",
    ],
    notPossible: [
      "putting your real screenshots inside a phone/laptop frame. I will redraw mockups based on your screenshots instead.",
    ],
  },
  preview: {
    lanes: ["facebook", "tiktok", "linkedin"],
    issues: [],
    videoSteps: 0,
    steps: [
      { nodeId: "n1", type: "keyword_planner", order: 1, lane: null, settings: {} },
      { nodeId: "n2", type: "text_generation", order: 2, lane: null, settings: {} },
      { nodeId: "n3", type: "adapt", order: 3, lane: "facebook", settings: { textLength: "short", tone: "casual" } },
      { nodeId: "n4", type: "adapt", order: 4, lane: "tiktok", settings: { textLength: "short", tone: "casual" }, badge: "adding" },
      { nodeId: "n5", type: "adapt", order: 5, lane: "linkedin", settings: { textLength: "medium", tone: "professional" }, badge: "adding" },
      {
        nodeId: "n6",
        type: "image_generation",
        order: 6,
        lane: "facebook",
        settings: {
          aspectRatio: "1:1",
          style: "website_mockup",
          _uiImageType: "website_mockup",
          _uiMood: "clean",
          _uiImageCount: 3,
          _uiWasImageCount: 1,
          _uiUseBrandPalette: true,
          _uiUseLogo: true,
          _uiUseAttached: true,
          _uiUseBrandImages: false,
        },
        badge: "updated",
      },
      { nodeId: "n7", type: "image_generation", order: 7, lane: "tiktok", settings: { aspectRatio: "9:16" }, badge: "adding" },
      { nodeId: "n8", type: "image_generation", order: 8, lane: "linkedin", settings: { aspectRatio: "1:1" }, badge: "adding" },
    ],
  },
  gaps: {
    channels: ["Facebook", "TikTok", "LinkedIn"],
    shared: false,
    missingVideo: false,
    missingChannels: ["TikTok", "LinkedIn"],
  },
  estimate: { images: 3, credits: 51, basis: "list_price" },
  attachedImageCount: 3,
  brandImageCount: 2,
  needsAdding: true,
}

function Card({ theme }: { theme: "light" | "dark" }) {
  return (
    <div
      className={theme === "dark" ? "dark" : undefined}
      data-theme-shot={theme}
      data-testid={`plan-card-preview-${theme}`}
    >
      <div className={theme === "dark" ? "bg-[#0B1220] px-4 py-8" : "bg-[#E4DFD6] px-4 py-8"}>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4A5568] dark:text-[#9AA3B5]">
          DEV · Plan card · mock B · {theme}
        </p>
        <div className="mx-auto max-w-[720px]">
          <ChatGenerationPreview prompt={FIXTURE} initialSelectedId="n6" onChoose={() => undefined} />
        </div>
      </div>
    </div>
  )
}

export default function PlanCardPreviewPage() {
  return (
    <div className="min-h-screen">
      <Card theme="light" />
      <Card theme="dark" />
    </div>
  )
}
