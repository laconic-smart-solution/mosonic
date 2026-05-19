export type WorkflowNodeGuide = {
  usage: string
  example: string
  tips?: string
}

const WORKFLOW_NODE_GUIDES: Record<string, WorkflowNodeGuide> = {
  keywords: {
    usage:
      "Generates SEO keywords and themes from your campaign brief when the pipeline runs. Add zero or more nodes anywhere upstream of text or image steps that should use planned terms.",
    example:
      "Keywords → Text Generation: plan terms for a product launch, then write a caption that uses those keywords naturally.",
  },
  text: {
    usage:
      "Creates post copy using the run prompt plus upstream outputs (keywords, intelligence hints, etc.). Add as many text nodes as you need and wire them like any other step.",
    example:
      "After Keywords, set tone to Professional and length to Medium to produce a LinkedIn-ready paragraph for your brief.",
    tips: "The campaign topic is entered when you start a pipeline run, not in this panel.",
  },
  image: {
    usage:
      "Generates an image from upstream text or keywords. Configure aspect ratio and style to match the channels in your rule.",
    example:
      "Text → Image with 1:1 aspect ratio and Natural style for an Instagram feed hero image based on the post caption.",
  },
  video: {
    usage:
      "Produces a short video clip from the run prompt and upstream assets (often text or a reference image). Runs on a dedicated video queue and may take longer than other nodes.",
    example:
      "Image → Video at 9:16 and 8s duration to turn a static product shot into a vertical reel.",
  },
  translation: {
    usage:
      "Translates text produced by an upstream node into a target language. Use when the same campaign needs localized copy without rewriting from scratch.",
    example:
      "English Text → Translation (target Thai) before an Adapt node on a Facebook lane for the Thai market.",
  },
  transcription: {
    usage:
      "Converts audio or video from an upstream asset into text. Useful when your source material is a recording rather than written copy.",
    example:
      "Video → Transcription (auto language) → Summarization to get bullet points from a webinar clip.",
  },
  summarization: {
    usage:
      "Shortens long upstream text into a summary. Choose length and output shape (paragraph, bullets, or TL;DR) to fit channel limits.",
    example:
      "Transcription → Summarization with Medium length and Bullets for carousel slide copy.",
  },
  branch: {
    usage:
      "Fans out execution into parallel channel lanes (from your rule’s channels, manual selection, or A/B variants). At run time the system materializes one subgraph per lane between Branch and Merge.",
    example:
      "Text → Branch (rule channels) → Adapt → Merge when posting the same campaign to Instagram, Facebook, and LinkedIn with per-channel captions.",
    tips: "Connect Branch to a Merge node downstream so all lanes complete before finalize.",
  },
  adapt: {
    usage:
      "Tailors shared copy to a specific channel’s style and mapping (caption length, tone, hashtags). One adapt node per lane after materialization; channel is set automatically from the rule.",
    example:
      "On the Instagram lane after Branch: adapt rewrites the shared text into a caption that fits Instagram’s content style from your rule.",
    tips: "You do not configure the channel here—it comes from the lane created at materialization.",
  },
  merge: {
    usage:
      "Waits for all parallel lane branches to finish (completed or skipped) before the pipeline can finalize content and upload. Acts as a fan-in barrier with no LLM step.",
    example:
      "Branch → Adapt (per channel) → Merge: merge blocks until every lane’s adapt node has finished, then content is assembled for review.",
  },
  intelligence: {
    usage:
      "Runs a web search brief (trend, market, competitor, or all) via OpenAI and injects the result into downstream text generation. Optional analytics overlay when you start a run with latest learnings.",
    example:
      "Intelligence (All) → Text: one search covers hashtags, industry news, and competitor gaps before copy is written.",
    tips: "Use “All” for one call instead of stacking multiple Intelligence nodes. Choose Custom when you need a specific research question.",
  },
}

export function getWorkflowNodeGuide(
  canvasType: string,
): WorkflowNodeGuide | undefined {
  return WORKFLOW_NODE_GUIDES[canvasType]
}

/** First sentence of usage for compact UI (palette, lists). */
export function getWorkflowNodeUsageSummary(canvasType: string): string | undefined {
  const guide = WORKFLOW_NODE_GUIDES[canvasType]
  if (!guide) return undefined
  const first = guide.usage.split(/(?<=[.!?])\s+/)[0]
  return first?.trim() || guide.usage
}
