# SECOND AUDIT: AI Content Generation Architecture Verification & Refinement

## 1. OBJECTIVE

We have completed the initial technical audit of our AI Content Generation Platform.

The existing audit documentation is located at:

`docs/ai-content-generation-audit/`

Your task is to perform a second, deeper technical investigation.

The purpose is to:

1. Verify the findings from the first audit against the actual source code.
2. Identify any incorrect assumptions or unsupported conclusions.
3. Trace the complete lifecycle of user instructions through the AI generation pipeline.
4. Investigate why custom user-provided content formats are not consistently followed.
5. Design a flexible, scalable, reusable content generation architecture.
6. Evaluate backward compatibility with the existing system.
7. Produce a technically accurate implementation blueprint.

**IMPORTANT: This is an investigation and documentation task ONLY. Do not implement any application changes.**

---

# 2. INVESTIGATION TASKS

## TASK 1: Verify Existing Root Causes

Review:

`07-root-cause-analysis.md`

Revisit every identified issue using the actual source code.

For every finding, provide:

- Finding description.
- Actual source file.
- Class and method names.
- Relevant code evidence.
- Actual execution behavior.
- Reproduction scenario.
- Impact on the system.
- Verification status.

Use these statuses:

- CONFIRMED
- PARTIALLY CONFIRMED
- POTENTIAL ISSUE
- INCORRECT FINDING

Do not assume the initial audit is correct.

### 1.1 Prompt Conflict Investigation

Inspect:

- `text-generation.service.ts`
- Related prompt builder services.
- Node configuration.
- Default output format configuration.
- Custom instruction handling.

Investigate whether the default output format can override explicit user formatting requirements.

Determine how the system should prioritize:

1. System-level policies and safety constraints.
2. Application-level instructions.
3. Brand guidelines.
4. Explicit user requirements.
5. Default formatting preferences.

Important: This hierarchy is a proposed design to evaluate, not an instruction to ignore higher-priority policies.

### 1.2 Original User Instruction Preservation

This is a high-priority investigation.

Trace the complete flow:

Original User Message
→ Chat Session
→ ReAct Agent
→ Tool Calling
→ start_generation
→ Pipeline Initialization
→ Node Execution
→ Text Generation
→ Adaptation
→ Final Content

Inspect relevant files, including:

- `start-generation.tool.ts`
- `react-chat-instructions.ts`
- `chat-session.service.ts`
- Pipeline orchestration services.
- Prompt construction services.
- Content persistence services.

Determine:

- Is the original user message preserved?
- Is it summarized by the agent?
- Is it transformed before reaching the generation pipeline?
- Can different pipeline nodes access the original instruction?
- Can instructions disappear between nodes?
- Is conversation history included?
- How are new instructions distinguished from previous instructions?

Recommend a design that preserves the original user request separately from the interpreted generation task.

Do not assume the original instruction is lost unless source-code evidence confirms it.

### 1.3 Adapt Node Investigation

Inspect:

`adapt-node.service.ts`

Determine:

- Whether adaptation is mandatory or optional.
- Whether it rewrites the complete generated content.
- Whether it preserves section headings.
- Whether it preserves bullet points and custom formatting.
- Whether it receives the original user instructions.
- Whether it has access to structured content.
- Whether it overwrites upstream output.
- Whether different channels have different adaptation rules.

Propose a structure-preserving adaptation design.

### 1.4 Regex Sanitizer Investigation

Inspect:

`generated-text-guardrails.util.ts`

Analyze the actual regex patterns and their behavior.

Test these inputs:

- `[Short product introduction]`
- `[Key feature / benefit 1]`
- `[Call to Action – Shop Now!]`
- `[Visual: Show product in stadium]`
- `[Image: Product reference]`

Determine exactly what is removed, retained or transformed.

Do not report unsupported conclusions.

---

# 3. DESIGN A FLEXIBLE CONTENT GENERATION ARCHITECTURE

The current platform must support multiple content types, different social media channels and custom user-defined formats.

Do not design the architecture exclusively around Instagram promotional posts.

Evaluate the following components.

## 3.1 Instruction Contract

Design a normalized representation of user generation requirements.

It should potentially support:

- Original user instruction.
- Interpreted generation objective.
- Content type.
- Destination channel.
- Language.
- Tone and writing style.
- Brand requirements.
- Product information.
- Reference assets.
- Required sections.
- Optional sections.
- Section ordering.
- Formatting requirements.
- Length requirements.
- Explicit restrictions.
- Factual constraints.
- User-defined custom templates.

Provide a proposed TypeScript interface and realistic JSON example.

The original user message must remain traceable and must not be replaced by an AI-generated summary.

## 3.2 Dynamic Template Engine

Design a reusable template system.

The system must support different structures without requiring a new backend schema for every content type.

Evaluate examples:

### Instagram Promotional Post
- Headline
- Product Introduction
- Features
- Promotion
- Persuasive Statement
- CTA
- Hashtags

### LinkedIn Thought Leadership
- Hook
- Context
- Main Insights
- Supporting Points
- Conclusion
- CTA

### TikTok Script
- Hook
- Scene
- Voiceover
- Visual Direction
- CTA

### Product Description
- Product Name
- Short Description
- Key Benefits
- Technical Specifications
- Usage Instructions

Determine:

- Template definition format.
- Template versioning.
- Required and optional sections.
- Section types.
- Dynamic section ordering.
- Custom user templates.
- Default templates.
- Channel-specific templates.
- Template storage strategy.
- Template validation.

Provide realistic TypeScript interfaces and JSON examples.

Do not hardcode a separate interface for every social media platform.

## 3.3 Structured Content Document

Design a generic content representation.

Evaluate this initial interface:

```typescript
interface ContentDocument {
  templateId?: string;
  templateVersion?: number;
  format: "structured" | "plain_text";
  sections: ContentSection[];
  compiledText?: string;
}

interface ContentSection {
  key: string;
  title: string;
  type: "text" | "list" | "hashtags";
  content: string | string[];
  required: boolean;
  order: number;
}
```

Improve it where necessary.

Consider:

- Rich text.
- Lists.
- Paragraphs.
- Hashtags.
- Links.
- Calls to action.
- Visual directions.
- Script scenes.
- Metadata.
- User-edited content.
- Section regeneration.
- Content version history.

Explain how the structured representation can be rendered into final plain text for publishing.

---

# 4. AI GENERATION AND ORCHESTRATION

Design how the existing pipeline should work with the new architecture.

Evaluate this proposed flow:

Original User Instruction
→ Instruction Builder
→ Context Builder
→ Template Resolver
→ Content Generation
→ Structured Output Parsing
→ Validation
→ Optional Correction
→ Channel Adaptation
→ Final Validation
→ Content Persistence
→ Frontend Rendering

Do not automatically accept this flow. Improve it based on the actual existing implementation.

For each stage, define:

- Responsibility.
- Input.
- Output.
- Required context.
- Error handling.
- Whether an AI model is needed.
- Whether deterministic code is sufficient.

Also investigate how Keyword Planner, Web Search, Text Generation and Image Generation nodes should interact with the structured content architecture.

Important requirements:

1. Image generation must not accidentally overwrite caption structure.
2. Web research must preserve source information and factual context.
3. Keyword planning must not modify explicit user formatting requirements.
4. Adaptation must preserve required content sections.
5. Regeneration must preserve the original instruction contract.
6. Each node must have clearly defined input and output contracts.

---

# 5. VALIDATION ENGINE

Design a validation architecture with separate responsibilities.

## 5.1 Structural Validation

Examples:

- Required sections exist.
- Section ordering is correct.
- Required section types are correct.
- Required feature counts are satisfied.
- No unexpected missing sections.

Prefer deterministic validation.

## 5.2 Semantic Validation

Examples:

- Content matches the requested purpose.
- Headline is relevant.
- Features are meaningful.
- Tone matches the brand.
- Content is suitable for the channel.

Determine where AI-based evaluation is justified.

## 5.3 Factual Validation

Examples:

- Product specifications are supported.
- No invented discounts.
- No fabricated product features.
- Web research claims have traceable sources.
- User-supplied product facts are preserved.

## 5.4 Brand Validation

Examples:

- Brand tone.
- Brand terminology.
- Prohibited wording.
- Audience suitability.
- Brand-specific restrictions.

## 5.5 Retry and Correction Strategy

Design how the platform should handle invalid output.

Consider:

- Maximum retry attempts.
- Targeted section regeneration.
- Correction prompts.
- Validation error reporting.
- Fallback behavior.
- Cost and token management.

Do not assume every validation failure should trigger another AI call.

---

# 6. DATABASE AND BACKWARD COMPATIBILITY

Inspect the actual Prisma schema and database models.

The initial audit identified an existing `Content.outputs` JSON field.

Determine whether this field can store structured content without introducing unnecessary database migrations.

Investigate:

- Content.outputs.
- Node outputs.
- Lane outputs.
- Existing content persistence.
- Content editing.
- Regeneration.
- Version history.
- Publishing integrations.
- API consumers.
- Frontend dependencies.

Evaluate a versioned storage strategy.

For example:

```json
{
  "schemaVersion": 2,
  "format": "structured",
  "document": {
    "templateId": "instagram-promo",
    "sections": []
  }
}
```

This is an example, not a mandatory schema.

The system must continue supporting legacy plain-text content.

Identify:

- Required database changes.
- Optional database changes.
- API compatibility requirements.
- Migration risks.
- Legacy data handling.
- Rollback considerations.

Do not recommend adding new columns without demonstrating why existing fields cannot support the requirement.

---

# 7. FRONTEND ARCHITECTURE

Investigate the existing frontend components and state management.

Design a structured content editor that supports:

- Section-by-section editing.
- Section-level regeneration.
- Reordering sections.
- Adding custom sections.
- Removing optional sections.
- Previewing final compiled content.
- Switching templates.
- Preserving user edits.
- Approving generated content.

Determine whether the current frontend architecture can support these capabilities.

Recommend reusable components rather than separate editors for each platform.

Also consider a plain-text editing mode for legacy content.

---

# 8. REVISED TARGET ARCHITECTURE

Produce:

1. Existing architecture diagram.
2. Proposed target architecture diagram.
3. Content generation sequence diagram.
4. Instruction preservation sequence diagram.
5. Structured content data model.
6. Validation workflow diagram.
7. Channel adaptation workflow diagram.

Use Mermaid.

Clearly distinguish:

- Existing components.
- New proposed components.
- Modified existing components.
- Components that should remain unchanged.

Do not recommend replacing the entire system without strong evidence.

---

# 9. IMPLEMENTATION ROADMAP

Produce a realistic phased implementation plan.

Evaluate this order:

Phase 1: Resolve confirmed prompt conflicts and preserve original instructions.

Phase 2: Introduce the Instruction Contract.

Phase 3: Introduce Dynamic Template and Structured Content models.

Phase 4: Integrate structured generation into the existing pipeline.

Phase 5: Make Adapt Nodes structure-aware.

Phase 6: Introduce output validation and correction.

Phase 7: Improve frontend structured editing.

Phase 8: Introduce reusable template management.

For each phase document:

- Objective.
- Backend changes.
- Frontend changes.
- Database changes.
- Affected source files.
- Dependencies.
- Test cases.
- Risks.
- Complexity.
- Acceptance criteria.

Avoid arbitrary timelines without understanding the codebase.

---

# 10. REQUIRED DOCUMENTATION

Update the existing audit documents where appropriate.

Create:

`docs/ai-content-generation-audit/11-follow-up-audit-and-architecture-decisions.md`

Also create:

`docs/ai-content-generation-audit/12-technical-design-specification.md`

The technical design specification must include:

- Proposed TypeScript interfaces.
- JSON contracts.
- Component responsibilities.
- API contract recommendations.
- Pipeline execution flow.
- Validation rules.
- Data persistence strategy.
- Backward compatibility strategy.
- Error handling.
- Testing strategy.

Update:

`docs/ai-content-generation-audit/README.md`

Include links to all documents and summarize the revised findings.

---

# 11. DOCUMENTATION QUALITY REQUIREMENTS

- Base all findings on the actual source code.
- Reference actual file paths and class/method names.
- Include relevant code evidence.
- Distinguish existing behavior from proposed behavior.
- Use Mermaid diagrams.
- Use realistic examples.
- Avoid generic architecture advice.
- Avoid unnecessary duplication.
- Clearly identify unresolved questions.
- Never fabricate source code, API endpoints or database fields.
- Clearly state when something could not be verified.

---

# 12. STRICT READ-ONLY RESTRICTIONS

This task is for documentation and investigation ONLY.

DO NOT:

- Modify application source code.
- Modify prompts.
- Modify database schemas.
- Modify API contracts.
- Install dependencies.
- Change environment variables.
- Refactor existing modules.
- Implement proposed components.
- Modify existing tests.

You may create or update only Markdown files inside:

`docs/ai-content-generation-audit/`

Before finishing, verify that no application source files have been modified.

---

# 13. FINAL REPORT

At the end, provide:

1. Confirmed root causes.
2. Incorrect initial audit findings.
3. Newly discovered problems.
4. Whether prompt changes alone are sufficient.
5. Whether architecture changes are necessary.
6. Recommended target architecture.
7. Database migration recommendations.
8. Backward compatibility risks.
9. Prioritized implementation roadmap.
10. Critical unresolved decisions.

**Final objective: Build a flexible and reliable AI Content Generation architecture that follows user instructions, supports dynamic content templates, preserves content structure across workflow nodes, validates generated output and remains backward compatible with the existing platform.**

Do not implement anything yet. Produce accurate technical documentation that can be used as the foundation for a later implementation phase.