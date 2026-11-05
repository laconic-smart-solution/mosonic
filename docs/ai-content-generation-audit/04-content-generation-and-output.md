# 04. Content Generation and Output Structures

**Author:** LCN Alvin  
**Document Version:** 1.0  
**Last Updated:** 2026-11-05  
**Document Status:** Audit

## 1. Response Formats & Structured Output Support

### Plain Text vs Structured Output
The existing implementation relies almost entirely on **unstructured plain text generation**:

1. **TextGenerationService**:
   - Calls `llm.getChatModelForPlainText(...)`.
   - The model invocation does not use LangChain `.withStructuredOutput()` or OpenAI JSON mode/schema contracts.
   - The response is extracted via `messageContentToString(res.content).trim()` and treated as a single continuous string.
2. **AdaptNodeService**:
   - Calls the LLM for plain text output (`Return only the adapted post text for this channel. No quotes or labels.`).
   - The service then manually packages this plain text into an internal JSON envelope:
     ```typescript
     const outputPayload: Record<string, string> = {
       text: adaptedText,
       adaptedCaption: adaptedText,
       channel: channelEntry.channel,
     };
     return { output: JSON.stringify(outputPayload) };
     ```
   - Notice that while the node's execution wrapper is JSON-serialized, the content *inside* the payload is still a single unstructured blob of text.
3. **KeywordPlanner & Intelligence Nodes**:
   - Return plain text bullet lines or freeform summaries.

### Is Structured Output / JSON Schema Supported?
**No.** There is currently **zero support** for OpenAI Structured Outputs (`response_format: { type: "json_schema", json_schema: ... }`), Zod-backed generation parsers, or structured multi-section content models in the generation pipeline.

---

## 2. Output Parsing & Storage Model

### Content Entity Schema (`server/src/content/schemas/content.schema.ts`)
Generated outputs are stored in the PostgreSQL database using Prisma under the `Content` entity:

```typescript
export interface ContentOutputs {
  keywords?: string;
  text?: string;
  image?: string;
  translatedText?: string;
  video?: string;
  transcription?: string;
  subtitle?: string;
  summary?: string;
}

export interface Content {
  contentId: string;
  userId?: string;
  pipelineRef: string;
  workflowRef: string;
  ruleRef: string;
  outputs: ContentOutputs;
  userEdits: ContentUserEdits;
  nodeOutputs: Record<string, Record<string, unknown>>;
  nodeUserEdits: Record<string, Record<string, unknown>>;
  laneOutputs: Record<string, Record<string, unknown>>;
  currentVersion?: number;
  versions?: ContentVersionEntry[];
  status: ContentStatus;
  approval: ContentApprovalState;
}
```

### Are Content Sections Stored Separately?
**No.**
- There are no fields such as `headline`, `intro`, `features`, `promotion`, `cta`, or `hashtags`.
- Everything is forced into `outputs.text` or `laneOutputs[laneId].text`.
- If an AI model generates markdown headers (`### Main Headline`, `**Call to Action**`), they exist only as substring characters inside `outputs.text`. The system has no semantic understanding of these individual sections.

---

## 3. Association Between Captions and Visual Media

In Mosonic:
1. When a pipeline executes, the `image_generation` node runs upstream or downstream of the text node.
2. The image node produces an image URL which is stored in `nodeOutputs[imageNodeId].image` and aggregated into `outputs.image`.
3. If the workflow has multiple distribution channels (e.g., Instagram, Facebook, TikTok), the image URL is shared across the lanes, while the text is separated per lane in `laneOutputs[laneId]`.
4. In the UI (`ContentDetailNodeCard` and `ChatContentCard`), the caption and image are associated purely by co-presence within the same `Content` entity or lane slice.

---

## 4. Editing, Approval, and Regeneration Mechanics

### Editing (`server/src/content/content.service.ts`)
- Users can edit content either through the Chat (`edit_content` tool) or the Content Detail UI (`PATCH /api/v1/content/:id/user-edits`).
- Edits are stored in `Content.userEdits` or `Content.nodeUserEdits[nodeId]`.
- Resolution logic in `server/src/content/content-output.utils.ts` (`mergeResolvedOutputs`):
  ```typescript
  return {
    keywords: coalesce(u.keywords, o.keywords),
    text: coalesce(u.text, o.text),
    image: coalesce(u.image, o.image),
    translatedText: coalesce(u.translatedText, o.translatedText),
    ...
  };
  ```
  User edits take precedence over AI outputs via simple null-coalescing.

### Approval Workflow
- Controlled by `ContentApprovalState` (`status: 'draft' | 'in_review' | 'approved' | 'rejected'`).
- Transitioning to `approved` allows the post to be scheduled or published via `PostService`.
- If rejected, users provide rejection reasons which can be saved to `RuleMemory` to inform future runs.

### Node Regeneration & Versioning
- Users can rerun a single node (e.g. `POST /api/v1/content/:id/rerun-node`) or generate a new version (`POST /api/v1/content/:id/version`).
- However, regeneration reruns the exact same node prompt template. Because the prompt forces `paragraph` output format, regenerating the text node will reliably produce another paragraph, failing to fix the formatting issue.