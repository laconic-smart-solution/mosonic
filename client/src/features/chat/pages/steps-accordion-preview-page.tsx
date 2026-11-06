import { ChatStepAccordion } from "@/features/chat/components/chat-step-accordion"
import type { AgentStep } from "@/shared/services/chat.service"

const FIXTURE_STEPS: AgentStep[] = [
  { type: "action", name: "get_rule", args: {}, toolCallId: "a1" },
  { type: "observation", name: "get_rule", toolCallId: "a1", result: JSON.stringify({ ok: true }) },
  { type: "action", name: "start_generation", args: { contentPrompt: "Website launch" }, toolCallId: "a2" },
  {
    type: "observation",
    name: "start_generation",
    toolCallId: "a2",
    result: JSON.stringify({
      ok: false,
      code: "preview_confirm",
      action: "ask_user",
      type: "single",
      confirmFor: "start_generation",
      question: "Ready to generate Website launch?",
      topic: "Website launch",
      plan: {
        youAskedFor: [
          "Posts for Facebook, TikTok, LinkedIn",
          "3 mockup images each",
          "Use your 3 screenshots",
        ],
        willChange: ["Add TikTok & LinkedIn", "Use your 3 screenshots as reference"],
        notPossible: [
          "putting your real screenshots inside a phone/laptop frame. I will redraw mockups based on your screenshots instead.",
        ],
      },
      options: [
        { id: "start_post", label: "Start" },
        { id: "change", label: "Change settings" },
        { id: "cancel", label: "Cancel" },
      ],
      preview: {
        steps: [
          { nodeId: "n1", type: "keyword_planner", order: 0, lane: null, settings: {} },
          { nodeId: "n2", type: "caption", order: 1, lane: null, settings: {} },
          { nodeId: "n3", type: "adapt", order: 2, lane: "facebook", settings: {} },
          { nodeId: "n4", type: "image_generation", order: 3, lane: "facebook", settings: {}, badge: "adding" },
          { nodeId: "n5", type: "adapt", order: 4, lane: "tiktok", settings: {}, badge: "adding" },
          { nodeId: "n6", type: "image_generation", order: 5, lane: "tiktok", settings: {}, badge: "adding" },
        ],
        lanes: ["facebook", "tiktok", "linkedin"],
        issues: [],
        videoSteps: 0,
      },
      gaps: { channels: ["Facebook", "TikTok", "LinkedIn"], shared: false, missingVideo: false, missingChannels: ["TikTok", "LinkedIn"] },
    }),
  },
]

function Card({ theme }: { theme: "light" | "dark" }) {
  return (
    <div className={theme === "dark" ? "dark" : undefined} data-testid={`steps-accordion-${theme}`}>
      <div className={theme === "dark" ? "bg-[#0B1220] px-4 py-8" : "bg-[#E4DFD6] px-4 py-8"}>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4A5568] dark:text-[#9AA3B5]">
          DEV · Steps accordion · {theme}
        </p>
        <div className="mx-auto max-w-[520px]">
          <ChatStepAccordion steps={FIXTURE_STEPS} defaultOpen />
        </div>
      </div>
    </div>
  )
}

export default function StepsAccordionPreviewPage() {
  return (
    <div className="min-h-screen">
      <Card theme="light" />
      <Card theme="dark" />
    </div>
  )
}
