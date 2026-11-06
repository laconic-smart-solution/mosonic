# 07. Root Cause Analysis: Loss of User Content Formats

**Author:** LCN Alvin  
**Document Version:** 1.0  
**Last Updated:** 2026-11-05  
**Document Status:** Audit

## 1. Problem Statement & Executive Summary

When a user provides a structured promotional content template (e.g., a 7-part Instagram template with Headline, Product Intro, 4 Bulleted Features, Promotion Name, Persuasive Statement, Call-to-Action, and Hashtags), the platform generates a generic promotional paragraph rather than preserving the requested layout and sections.

Our technical audit of the codebase confirms that this is **not a random LLM hallucination**, but the direct consequence of multiple compounding architectural flaws across prompt design, workflow orchestration, data modeling, sanitization filters, and frontend rendering.

---

## 2. Confirmed Root Causes

### Root Cause 1: System Prompt Constraint Inversion
- **Classification**: **CONFIRMED ARCHITECTURAL ISSUE**
- **Location**: `server/src/nodes/services/text-generation.service.ts` (`buildSystemPrompt`, lines 139–149)
- **Code Evidence**:
  ```typescript
  '=== OUTPUT FORMAT ===',
  `Format: ${config.outputFormat}`,
  config.outputFormat === NodeOutputFormat.Paragraph
    ? 'Write in flowing paragraph form.'
    : config.outputFormat === NodeOutputFormat.Bullets
      ? 'Write as concise bullet points.'
      : 'Write as a short punchy social media caption.',
  `Maximum length: ${config.maxTokens} tokens.`,
  'Do not include any explanation, preamble, or metadata.',
  'Return only the content itself.',
  ```
- **Mechanism**:
  1. `WorkflowNodeConfig` defaults `outputFormat` to `NodeOutputFormat.Paragraph`.
  2. This injects the explicit directive `Write in flowing paragraph form` into the `SystemMessage`.
  3. Modern LLMs (GPT-4o, Claude 3.5 Sonnet) assign higher authority to instructions in the `SystemMessage` than to user requests in the `HumanMessage`.
  4. Faced with a direct contradiction between the user's multi-section template in the HumanMessage and the system prompt's explicit instruction to write in flowing paragraph form, the model prioritizes the system directive and collapses the template into a standard narrative paragraph.
- **Consequences**: Any multi-section formatting requested in `contentPrompt` is flattened into paragraphs across all text generation pipelines.

---

### Root Cause 2: Downstream Channel Adapt Node Systematically Erases Structure
- **Classification**: **CONFIRMED ARCHITECTURAL ISSUE**
- **Location**: `server/src/nodes/services/adapt-node.service.ts` (lines 74–95)
- **Code Evidence**:
  ```typescript
  const system = [
    'You adapt marketing copy for a specific social channel.',
    'Preserve brand voice and factual content; change format and length for the platform.',
    '',
    formatGenerationTemporalContext(),
    '',
    `Channel: ${channelEntry.channel}`,
    `Content style: ${channelEntry.contentStyle || config.contentStyle || 'platform-native'}`,
    ...
  ].filter(Boolean).join('\n');
  ```
- **Mechanism**:
  1. In a standard workflow (`text_generation` -> `branch` -> `adapt__instagram`), the adapt node receives the text generated upstream.
  2. The adapt node's system prompt instructs the model to: *"change format and length for the platform"*.
  3. The adapt node's Human prompt commands: *"Return only the adapted post text for this channel. No quotes or labels."*
  4. The adapt node treats itself as authorized to dismantle the incoming structure and condense it into a standard single-block social media caption.
- **Consequences**: Even if the text generation node miraculously preserved the 7 sections, the downstream adapt node rewrites and collapses it.

---

### Root Cause 3: Aggressive Regex Stripping of Bracketed Formatting Tags
> [!NOTE]
> **Historical Audit Finding Superseded**:
> Subsequent empirical runtime testing documented in Document 11 (`11-follow-up-audit-and-architecture-decisions.md`) and Document 13 (`13-final-technical-verification.md`) proved that this initial finding was **overstated**.
> Empirical tests verified that `[Short product introduction]`, `[Key feature / benefit 1]`, and `[Call to Action – Shop Now!]` are **RETAINED** intact by `sanitizeGeneratedPostText()`. It only removes bracketed directives with colons (e.g. `[Visual: ...]`, `[Image: ...]`). Therefore, regex stripping is **NOT** the cause of the paragraph collapse. The authoritative root cause is the System Prompt priority inversion (Root Cause 1) and Adapt Node rewriting (Root Cause 2).
- **Classification**: **INCORRECT / OVERSTATED IN INITIAL AUDIT (SUPERSEDED)**
- **Location**: `server/src/nodes/services/generated-text-guardrails.util.ts` (`sanitizeGeneratedPostText`, lines 18–57)
- **Code Evidence**:
  ```typescript
  // Remove bracketed art-direction blocks: [Visual: ...], [Image: ...], etc.
  text = text.replace(
    /\[(?:visual|image|scene|shot|prompt|art|graphic)\s*:[\s\S]*?\]/gi,
    '',
  );
  ...
  // Remove leftover single-line bracket instructions like "[...: ...]".
  if (
    /^\[[^\]]+\]\s*$/.test(trimmed) &&
    /^(?:\[[a-z\s]{2,20}\s*:)/i.test(trimmed)
  ) {
    continue;
  }
  ```
- **Mechanism**:
  The example user template uses bracketed section placeholders: `[Short product introduction]`, `[Key feature / benefit 1]`, `**🛒 [Call to Action – Shop Now!]**`.
  If the LLM outputs placeholder labels matching bracketed formats, the regex sanitizer identifies them as internal meta-instructions or art direction and strips them from the output text.
- **Consequences**: Structural bracket markers are stripped from the copy.

---

### Root Cause 4: Complete Absence of Structured Output Contracts (JSON Schema)
- **Classification**: **CONFIRMED ARCHITECTURAL ISSUE**
- **Location**: `server/src/llm/llm.service.ts` & `server/src/nodes/services/text-generation.service.ts`
- **Code Evidence**:
  ```typescript
  const model = this.llm.getChatModelForPlainText({ ... });
  const res = await model.invoke([ ... ]);
  ```
- **Mechanism**:
  The system relies on free-form string completions. It does not use OpenAI Structured Outputs (`response_format: { type: "json_schema" }`) or LangChain `.withStructuredOutput(ZodSchema)`.
  Without an explicit schema enforcing fields like `{ headline, intro, features: string[], promotion, cta, hashtags: string[] }`, the LLM has zero grammatical obligation to follow the structure.
- **Consequences**: Non-deterministic generation formatting with no structural guarantees.

---

### Root Cause 5: Monolithic Data Model and Raw Textarea UI Rendering
- **Classification**: **CONFIRMED IMPLEMENTATION ISSUE**
- **Location**:
  - `server/src/content/schemas/content.schema.ts` (`ContentOutputs.text?: string`)
  - `client/src/features/content/components/content-detail/content-detail-node-card.tsx`
- **Code Evidence**:
  ```tsx
  {isTextLike ? (
    <Textarea
      value={displayText}
      disabled={interactionsLocked}
      onChange={(e) => updateOutput(key, e.target.value)}
      className="min-h-[140px] text-xs font-normal"
    />
  ) : null}
  ```
- **Mechanism**:
  The database schema stores all text as a single unparsed string. The frontend displays this string inside an unstyled HTML `<Textarea>`. There is no Markdown rendering engine (e.g. `react-markdown`), and no UI component hierarchy for rendering structured post sections.
- **Consequences**: Even if formatting were generated, it cannot be rendered as distinct interactive UI blocks or edited per section.

---

## 3. Potential / Contributing Issues Requiring Validation

1. **Token Truncation in High-Volume Templates**: `maxTokens` defaults to `500`. A comprehensive 7-section promotional post in both English and Thai can approach 400–600 tokens. The LLM may preemptively condense sections to avoid mid-sentence cut-offs.
2. **Chat ReAct Agent Parameter Extraction**: In `start-generation.tool.ts`, the parameter description says `contentPrompt: 'What to generate this run, for example the post topic.'`. The chat agent model may summarize the user's lengthy input into a concise topic before calling the tool.

---

## 4. Root Cause Summary Matrix

| Root Cause | Severity | Layer | Direct Impact |
| :--- | :--- | :--- | :--- |
| **System Prompt Inversion** | Critical | Prompt Engineering | LLM obeys `Write in flowing paragraph form` over user prompt |
| **Adapt Node Formatting Erasure** | Critical | Workflow Orchestration | Adapt node explicitly changes format and condenses copy |
| **No Structured Output / JSON Schema** | High | AI Integration | No grammatical schema contract constraining the LLM |
| **Regex Sanitizer Over-Stripping** | Medium | Post-Processing | Strips bracketed section labels and placeholder tags |
| **Monolithic Data Schema & Textarea UI**| High | Data Modeling & Frontend | Entire system only supports flat unparsed strings |
| **Zero Output Validation** | High | Quality Assurance | System accepts whatever the LLM returns without verification |