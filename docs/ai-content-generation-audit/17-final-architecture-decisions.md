# 17. Final Architecture Decisions & Engineering Governance

**Author:** LCN Alvin  
**Document Version:** 2.0  
**Last Updated:** 2026-11-05  
**Document Status:** Architecture Decision Records (ADRs)  

---

## 1. Overview of Architecture Decisions

This document formally records the Architecture Decision Records (ADRs) governing the **Structured Content Generation Architecture** for Mosonic. Decisions are categorized as **Approved Engineering Decisions** or **Decisions Requiring Human/Product Approval**.

---

## 2. Approved Engineering Decision Records (ADRs)

### ADR-01: Instruction Contract & Prompt Priority Hierarchy
- **Status**: **Approved Engineering Decision**
- **Decision**: Implement a 5-tier instruction hierarchy where explicit user templates (Tier 3) override brand defaults and system-level formatting fallbacks (Tier 5), but remain subordinate to safety and platform constraints (Tiers 1 & 2).
- **Reason**: Resolves the root cause where `buildSystemPrompt` forced `Write in flowing paragraph form` even when the user requested a 7-section template.
- **Alternatives Considered**: Modifying user prompts to plead with the LLM; rejected because SystemMessage always outranks HumanMessage.
- **Consequences**: `TextGenerationService` dynamically adjusts system directives based on incoming `InstructionContract`.

### ADR-02: Native Structured Outputs via Dynamic Zod Schemas
- **Status**: **Proposed Engineering Decision - Requires Technical Verification**
- **Decision**: Use LangChain's `.withStructuredOutput()` backed by OpenAI `response_format: { type: "json_schema" }` and Anthropic Tool Calling for multi-section templates.
- **Reason**: Provides deterministic, schema-enforced output generation without relying on prompt-following luck or fragile regex parsing.
- **Alternatives Considered**: Generating Markdown and writing regex parsers to slice sections; rejected due to high parsing fragility and non-deterministic formatting across models.
- **Consequences**: Requires defining dynamic Zod schemas at runtime based on `InstructionContract`.

### ADR-03: Zero-Migration Dual-Format Persistence
- **Status**: **Approved Engineering Decision**
- **Decision**: Store structured sections in `outputs.sections` and `laneOutputs[laneId].sections` inside existing PostgreSQL `JSONB` columns (`Content.outputs`, `Content.laneOutputs`), while simultaneously compiling `outputs.text` into clean markdown.
- **Reason**: Eliminates database migrations, prevents table locking, avoids downtime, and ensures 100% backward compatibility with all downstream social publishing integrations.
- **Alternatives Considered**: Creating new relational tables (`ContentSection`, `ContentTemplate`); rejected because existing JSONB columns fully support structured data without schema migrations.
- **Consequences**: No database schema migration needed. All database operations remain non-breaking.

### ADR-04: Structure-Preserving Adapt Node Architecture
- **Status**: **Proposed Engineering Decision - Requires Technical Verification**
- **Decision**: Transform `AdaptNodeService` from a monolithic caption rewriter into a section-aware adapter that iterates over individual section items.
- **Reason**: Prevents downstream channel nodes (e.g. `adapt__instagram`) from collapsing multi-section copy into single unformatted paragraphs.
- **Alternatives Considered**: Skipping adaptation when templates are present; rejected because channel-specific nuances (emojis for Instagram, character limits for TikTok) are critical platform features.
- **Consequences**: Adapt nodes produce both `adaptedSections: ContentSectionData[]` and compiled `adaptedCaption: string`.

### ADR-05: Post-Generation Validation with Automated Self-Healing Retry
- **Status**: **Approved Engineering Decision**
- **Decision**: Introduce `OutputValidationService` to verify section presence and item bounds, triggering a single-turn repair turn if sections are missing.
- **Reason**: Guarantees output quality and eliminates silent format degradation before content reaches the user.
- **Alternatives Considered**: Hard failure throwing HTTP 422; rejected because user experience suffers if a run fails completely due to a single missing bullet point.
- **Consequences**: Adds at most one repair LLM call when validation detects missing sections.

### ADR-06: Modular Frontend Section Editor with Markdown Preview
- **Status**: **Proposed Engineering Decision - Requires Product Approval**
- **Decision**: Replace the raw `<Textarea>` in `ContentDetailNodeCard.tsx` with a dual-mode component: `<StructuredSectionEditor />` when `outputs.sections` exists, falling back to `<Textarea />` for historical drafts, plus a formatted Markdown preview tab.
- **Reason**: Transforms content review from editing a flat text block to managing a structured marketing artifact.
- **Alternatives Considered**: Full WYSIWYG editor (e.g. TipTap, ProseMirror); rejected as overly complex for structured social post sections.
- **Consequences**: Requires installing `react-markdown` and creating modular section components.

---

## 3. Decisions Requiring Human / Product Sign-Off

The following decisions involve product positioning, user experience trade-offs, or social media styling standards and require explicit alignment before final deployment:

### PDR-01: Social Media Bold Text Formatting (Unicode vs Markdown)
- **Context**: Instagram and Facebook Graph APIs do not natively render Markdown bold asterisks (`**bold**`). They appear as literal asterisks unless converted to Unicode mathematical bold characters (e.g., `𝗯𝗼𝗹𝗱`).
- **Options**:
  - *Option A (Recommended)*: Use emojis and double line breaks as clean section headers; strip markdown asterisks when publishing to Instagram/Facebook.
  - *Option B*: Convert markdown bold text into Unicode bold characters. (Note: Screen readers and accessibility tools often struggle with Unicode mathematical fonts).
- **Status**: **Requires Product Approval**.

### PDR-02: Predefined Template Catalog Scope
- **Context**: Phase 1 supports custom user templates entered in prompts. Should Phase 2 launch with a fixed system catalog of 5 standard templates (e.g., Instagram 7-Part Launch, LinkedIn Thought Leadership, TikTok Teaser, Facebook Community Story, X/Twitter Thread)?
- **Recommendation**: Yes. Standardizing 5 battle-tested templates gives non-technical users immediate high-performing formats.
- **Status**: **Requires Product Approval**.

### PDR-03: Chat ReAct Tool Prompt Override
- **Context**: Should a user prompt template entered in the chat conversation strictly override the workflow template node configuration set in the visual canvas?
- **Recommendation**: Yes. The user's in-the-moment conversational prompt represents the immediate intent and must override default workflow node settings for that specific execution run.
- **Status**: **Requires Product Approval**.
