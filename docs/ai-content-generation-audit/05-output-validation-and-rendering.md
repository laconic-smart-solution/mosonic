# 05. Output Validation and Frontend Rendering

**Author:** LCN Alvin  
**Document Version:** 1.0  
**Last Updated:** 2026-11-05  
**Document Status:** Audit

## 1. Audit of Existing Output Validation Mechanisms

A comprehensive scan of the codebase reveals that the platform currently possesses **virtually no content or format validation engine**.

| Validation Dimension | Current Implementation | Evaluation / Gap |
| :--- | :--- | :--- |
| **Required Section Validation** | **None** | The system does not verify if required sections (Headline, Features, CTA, Hashtags) exist in the output. |
| **Output Format Validation** | **None** | No check to see if the output conforms to requested bullet lists, sections, or markdown structure. |
| **Section Ordering Validation**| **None** | No mechanism checks whether items appear in the sequence specified by the user. |
| **Missing Content Detection** | **None** | Does not verify if specific promotional claims or product features mentioned in prompt are present. |
| **Brand Consistency Checks** | Prompt-only | Relies exclusively on LLM following the system prompt; no automated post-generation checker. |
| **Unsupported Claims Check** | **None** | No automated fact-checking against source assets or brand guidelines. |
| **Hashtag Validation** | Prompt-only | Injects `rule.campaign.hashtagStrategy` into prompt, but never verifies if hashtags are present in output. |
| **Channel Limit Validation** | `enforceAdaptChannelLimits` in `adapt-channel-guardrails.util.ts` | Truncates TikTok photo slideshow titles using `TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX` (90 chars in `platform-limits.ts`). Requires configurable policies for other post types and platforms. |
| **Post-Processing Sanitizer**| `sanitizeGeneratedPostText` in `generated-text-guardrails.util.ts` | Regex stripper that strips bracketed art direction `[Visual: ...]` and meta lines. |
| **Automatic Retries / Corrections** | **None** | If an LLM returns a generic paragraph instead of a 7-section template, no retry or correction occurs. |

---

## 2. Frontend Content Rendering & Presentation

### Frontend Component Architecture

Generated content is presented to users in two primary locations in the React application:
1. **Chat Conversation Cards (`ChatContentCard.tsx`)**:
   - File: `client/src/features/chat/components/chat-content-card.tsx`
   - Rendering method:
     ```tsx
     {displayText ? (
       <p className="line-clamp-3 text-xs text-canvas-700 dark:text-navy-200">{displayText}</p>
     ) : null}
     ```
   - Displays only a truncated 3-line paragraph preview of the plain text.
2. **Content Detail & Review Screen (`ContentDetailNodeCard.tsx`)**:
   - File: `client/src/features/content/components/content-detail/content-detail-node-card.tsx`
   - Rendering method:
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

### Analysis of Frontend Capabilities & Deficiencies

1. **Absence of Structured Section UI**:
   - The UI does not have components to render discrete sections (e.g., `<HeadlineCard />`, `<BenefitsList />`, `<CtaBanner />`, `<HashtagCloud />`).
   - Everything is dumped into a single raw HTML `<textarea>`.
2. **Lack of Markdown Rendering**:
   - The UI does not render Markdown formatting (bold text `**...**`, bullet points, headers `#...`).
   - Even if the AI outputs markdown formatting with emojis and bullet points, the user only sees raw unformatted text with asterisks inside a form input.
3. **Section-Level Editing**:
   - Because the data is stored and displayed as a single monolithic string, the user cannot edit individual sections independently or regenerate a specific sub-section (e.g., "regenerate just the headline" or "rewrite only the CTA").
4. **Approval Workflow Interaction**:
   - The user can approve the entire draft or reject the entire draft. There is no partial acceptance or section-level approval.