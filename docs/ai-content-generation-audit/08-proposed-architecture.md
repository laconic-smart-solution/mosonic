# 08. Proposed Target Architecture

**Author:** LCN Alvin  
**Document Version:** 1.0  
**Last Updated:** 2026-11-05  
**Document Status:** Proposed

## 1. Architectural Philosophy & Guiding Principles

The target architecture addresses the structural format degradation without requiring a destructive rewrite of the platform. It introduces:
1. **Instruction Contract Integrity**: User format instructions take precedence over default paragraph constraints.
2. **Dual-Mode Generation Support**: Transparent support for both traditional unstructured text (backward compatible) and structured multi-section content templates.
3. **Structured Output Contracts**: Native JSON schema / Zod enforcement for structured templates.
4. **Resilient Validation & Self-Correction**: Deterministic validation of generated output sections before persistence.
5. **Rich Sectional UI Rendering**: Interactive section-level rendering, editing, and regeneration in the frontend.

---

## 2. Target Architecture Overview

```mermaid
graph TD
    UserPrompt["User Prompt + Template"] --> Intake["Template Classifier & Context Builder"]
    
    subgraph IntakeEngine ["1. Intake & Template Classification"]
        Intake --> DetectMode{"Has Structured Template?"}
        DetectMode -->|Yes| StructuredMode["Mode: Structured Template Contract"]
        DetectMode -->|No| LegacyMode["Mode: Standard Copy (Paragraph/Caption)"]
    end
    
    subgraph ExecutionEngine ["2. Structured Generation Engine"]
        StructuredMode --> SchemaBuilder["Dynamic JSON Schema Generator"]
        SchemaBuilder --> LLMStructured["LLM with Structured Outputs (json_schema)"]
        LegacyMode --> LLMPlain["LLM Plain Text"]
    end
    
    subgraph ValidationEngine ["3. Validation & Auto-Correction"]
        LLMStructured --> Validator["Output Validation Engine"]
        Validator --> Check{"All Sections Present & Valid?"}
        Check -->|Pass| Persist["Content Persistence Layer"]
        Check -->|Fail (< 2 retries)| SelfHeal["Correction LLM Call with Missing Section Feedback"]
        SelfHeal --> Validator
    end
    
    subgraph PersistenceLayer ["4. Dual-Format Storage"]
        Persist --> ContentModel["Content Entity (PostgreSQL)"]
        ContentModel --> FlatText["outputs.text (Compiled Markdown for Legacy & Publishing)"]
        ContentModel --> SectionData["outputs.sections (Structured Array for Editing & Rendering)"]
    end
    
    subgraph PresentationLayer ["5. Frontend Structured Experience"]
        SectionData --> SectionUI["Structured Section Editor (React)"]
        SectionUI --> SectionRegen["Section-Level Regenerate / Edit"]
        FlatText --> MarkdownPreview["Live Rich Markdown Preview"]
    end
```

---

## 3. Evaluation of the 10 Core Architectural Recommendations

### 1. Centralized Prompt Management System
- **Current Implementation**: Prompts are hardcoded as template literals scattered across `text-generation.service.ts`, `adapt-node.service.ts`, `react-chat-instructions.ts`, and `rule-context-builder.util.ts`.
- **Proposed Implementation**: Introduce a centralized `PromptRegistry` service managing versioned, parameterized prompt templates with strict priority layers (System Base > Brand Profile > User Contract > Output Constraints).
- **Pros / Cons**: Prevents contradictory system prompts; enables prompt testing without redeploying code. Requires refactoring existing string concatenations.
- **Affected Modules**: `server/src/llm/`, `server/src/nodes/services/`, `server/src/rule/`.
- **Complexity**: Medium.

### 2. Dedicated Instruction and Context Builder
- **Current Implementation**: `buildSystemPrompt()` and `buildHumanPrompt()` use basic string interpolations and hardcode default paragraph constraints.
- **Proposed Implementation**: A dedicated `GenerationContextBuilder` that inspects the user prompt. If the user provided a structured template or requested specific sections, it suppresses the default `"Write in flowing paragraph form"` constraint and injects the user's template as the primary structural contract.
- **Pros / Cons**: Immediately resolves Root Cause 1. Eliminates contradictory instructions.
- **Affected Modules**: `server/src/nodes/services/text-generation.service.ts`.
- **Complexity**: Low to Medium.

### 3. Structured Content Generation Engine
- **Current Implementation**: All generation calls `llm.getChatModelForPlainText(...)` which returns an unstructured string.
- **Proposed Implementation**: Add `llm.getStructuredModel<T>(zodSchema)` using LangChain's `.withStructuredOutput()` or native OpenAI Structured Outputs (`response_format: { type: "json_schema" }`).
- **Pros / Cons**: Guarantees 100% adherence to defined section names, types, and bullet point counts.
- **Affected Modules**: `server/src/llm/llm.service.ts`, `server/src/nodes/services/text-generation.service.ts`.
- **Complexity**: Medium.

### 4. Reusable Content Template System
- **Current Implementation**: No concept of templates. Every generation is either freeform text, bullets, or caption.
- **Proposed Implementation**: Introduce a `ContentTemplate` catalog (e.g. *Instagram 7-Part Launch*, *LinkedIn Thought Leadership*, *TikTok Product Teaser*) with predefined section schemas that users can select or customize.
- **Pros / Cons**: Provides guaranteed repeatable layouts; users don't have to type out markdown templates from scratch.
- **Affected Modules**: `server/prisma/schema.prisma`, `server/src/workflow/`, `client/src/features/workflow/`.
- **Complexity**: High.

### 5. JSON Schema or Structured Output Contracts
- **Proposed Implementation**: Define a canonical TypeScript/Zod schema for structured posts:
  ```typescript
  export const StructuredContentSchema = z.object({
    headline: z.string().describe("Main catchy headline or slogan"),
    introduction: z.string().describe("Product intro or lifestyle statement"),
    features: z.array(z.string()).min(2).max(6).describe("Key benefits / bullet points"),
    promotion: z.string().optional().describe("Discount / campaign details"),
    persuasion: z.string().optional().describe("Persuasive purchase motivation"),
    callToAction: z.string().describe("Action-oriented closing directive"),
    hashtags: z.array(z.string()).describe("Relevant campaign hashtags"),
  });
  ```
- **Pros / Cons**: Bulletproof schema validation by the LLM provider at token generation time.
- **Complexity**: Medium.

### 6. Output Validation Engine
- **Current Implementation**: Non-existent (except TikTok character truncation).
- **Proposed Implementation**: Post-generation pipeline step that validates:
  1. Presence of all mandatory sections.
  2. Minimum/maximum bullet item counts.
  3. Correct ordering of sections.
  4. Brand guideline violations (forbidden words, required elements).
- **Pros / Cons**: Eliminates silent generation degradation before the user sees the output.
- **Affected Modules**: `server/src/nodes/services/`, `server/src/orchestration/`.
- **Complexity**: Medium.

### 7. Automatic Correction and Retry Mechanism
- **Current Implementation**: None. Failed/degraded outputs are persisted directly.
- **Proposed Implementation**: If the validator flags missing sections or formatting violations, a targeted repair prompt is sent back to the LLM (maximum 1-2 retries):
  *"Your previous output omitted the required 'Key features' bullet points and 'Call to Action'. Repair the JSON while preserving the existing headline and introduction."*
- **Pros / Cons**: Dramatically increases first-time success rate without human intervention.
- **Affected Modules**: `server/src/nodes/services/text-generation.service.ts`, `server/src/orchestration/processors/job-attempt.util.ts`.
- **Complexity**: Medium.

### 8. Structured Content Rendering Architecture
- **Current Implementation**: Raw HTML `<Textarea>` in `ContentDetailNodeCard.tsx`.
- **Proposed Implementation**:
  - Replace raw textarea with a structured card view displaying individual section inputs (`HeadlineField`, `BenefitsListEditor`, `CtaField`, `HashtagBadges`).
  - Add a live formatted Markdown preview tab (using `react-markdown` + syntax styling).
- **Pros / Cons**: Elevates UX from a raw text editor to a modern AI marketing platform.
- **Affected Modules**: `client/src/features/content/components/content-detail/`.
- **Complexity**: Medium.

### 9. Better Workflow State Management (Preserving Adapt Node Harmony)
- **Current Implementation**: Adapt node erases upstream structure and condenses text.
- **Proposed Implementation**: When an upstream structured document exists, the Adapt node adapts *each section individually* (e.g. adapting the headline for Instagram vs LinkedIn, adjusting character counts per section) rather than flattening the entire document into a single unformatted paragraph.
- **Pros / Cons**: Multi-channel consistency while retaining platform-specific optimizations.
- **Affected Modules**: `server/src/nodes/services/adapt-node.service.ts`.
- **Complexity**: Medium.

### 10. Improved Content Regeneration and Section-Level Editing
- **Current Implementation**: Regeneration only operates on the entire node string.
- **Proposed Implementation**: Section-level regeneration endpoint: `POST /api/v1/content/:id/sections/:sectionKey/regenerate` allowing the user to click a refresh icon next to just the *Call to Action* or *Headline* without altering the rest of the post.
- **Pros / Cons**: Saves credits, reduces latency, and delivers a superior editing workflow.
- **Affected Modules**: `server/src/content/`, `client/src/features/content/`.
- **Complexity**: Medium.