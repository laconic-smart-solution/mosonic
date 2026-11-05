# Task: AI Content Generation Platform – Architecture & Implementation Audit

## 1. Objective

Perform a comprehensive technical audit of the existing AI Content Generation Platform.

The goal is to understand the current architecture, implementation, AI workflow, prompt management, content generation pipeline, output handling, and frontend rendering.

We are investigating a specific problem:

**The platform does not consistently follow user-provided content formats and output instructions during AI content generation.**

For example, a user provides a structured Instagram promotional content template containing:

1. Main headline / Catchy slogan
2. Product introduction
3. Key features and benefits
4. Promotion / Campaign information
5. Persuasive marketing statement
6. Call to Action
7. Hashtags

However, the system generates a general promotional paragraph instead of following the requested structure.

The system may understand the user's intention but fails to preserve the requested output format.

We need to determine whether this is caused by prompt construction, AI orchestration, context management, output parsing, validation, data modeling, or frontend rendering.

**Important: Do not implement any fixes yet. This task is for investigation and documentation only.**

## 2. Audit Scope

Inspect the complete relevant codebase, including backend, frontend, AI integrations, database entities, API endpoints, services, workflow orchestration, and prompt-related components.

### A. Existing System Architecture

Document:

- Overall application architecture.
- Backend and frontend technologies.
- Main application modules.
- AI integration architecture.
- External AI providers and models.
- Database architecture and relevant entities.
- API communication between frontend and backend.
- Background jobs, queues, or asynchronous processing, if applicable.

Include the actual project directory structure and identify important source files.

### B. AI Prompt Management

Investigate how the application manages:

- System prompts.
- Developer instructions.
- User prompts.
- Brand profile instructions.
- Brand tone and personality.
- Target audience.
- Content generation instructions.
- Custom user-provided templates.
- Conversation history.
- Reference images and product information.
- Prompt composition and prioritization.

Identify where prompts are created, combined, modified, stored, and sent to AI providers.

Document the actual prompt execution flow with file paths and function/class names.

Determine whether custom user templates are treated as mandatory output specifications or merely contextual guidance.

### C. AI Workflow and Orchestration

Investigate the complete content generation lifecycle.

For example:

User Request → Instruction Processing → Brand Context → Keyword Planning → Web Research → Text Generation → Image Generation → Content Processing → Frontend Display.

Do not assume this is the actual workflow. Discover and document the real implementation.

For every workflow stage, explain:

- Its responsibility.
- Input data.
- Output data.
- Services and functions involved.
- AI model or external service used.
- How information is passed to the next stage.
- Whether user instructions are preserved.

Identify any stage that might overwrite, simplify, ignore, or lose the original formatting requirements.

### D. Content Generation and Output Structure

Investigate:

- Whether AI responses are plain text, Markdown, JSON, or another format.
- Whether structured output or JSON schema is supported.
- How generated content is parsed.
- Whether content sections are stored separately.
- How generated captions and images are associated.
- How content drafts are stored and retrieved.
- How editing, approval, and regeneration work.

Identify whether the existing architecture supports generating content with predefined sections.

### E. Output Validation and Quality Control

Determine whether the platform currently has:

- Required section validation.
- Output format validation.
- Section ordering validation.
- Missing-content detection.
- Brand consistency checks.
- Product information verification.
- Unsupported claims detection.
- Hashtag validation.
- Automatic retry or correction mechanisms.

Document existing validation mechanisms, if any.

Do not assume these features exist.

### F. Frontend Content Rendering

Investigate how generated content is displayed.

Document:

- Content response handling.
- Content draft components.
- Text formatting and Markdown support.
- Structured section rendering.
- Edit functionality.
- Regeneration functionality.
- Approval workflow.
- Image and caption association.

Determine whether the frontend is capable of displaying structured content or only plain-text responses.

### G. Database and Data Model

Identify relevant database tables, entities, relationships, and fields associated with:

- Brand profiles.
- Brand instructions.
- Content generation requests.
- Custom content templates.
- AI prompts.
- Generated content.
- Content drafts.
- Images and assets.
- Workflow execution history.
- User conversations.

Explain how the information is persisted and retrieved.

## 3. Root Cause Investigation

Analyze the example problem described below.

### User Instruction

The user requests content using this exact structure:

**🏎️ MAIN HEADLINE / CATCHY SLOGAN**

Introducing the **[BRAND] [PRODUCT NAME / MODEL]**.

[Short product introduction or lifestyle statement]

✨ [Key feature / benefit 1]

✨ [Key feature / benefit 2]

✨ [Key feature / benefit 3]

✨ [Key feature / benefit 4]

**📢 [PROMOTION / CAMPAIGN NAME]**

[Main promotional offer / discount]

[Short persuasive sentence encouraging customers to purchase]

**🛒 [Call to Action – Shop Now!]**

#Brand #ProductName #CampaignName #Promotion #RelevantHashtags

### Actual Problem

The system generates a long promotional paragraph rather than following the requested structure.

Investigate all technically plausible causes.

For each identified issue, provide:

- Root cause.
- Evidence from the source code.
- Affected files.
- Affected functions or classes.
- Why the current implementation behaves this way.
- Potential consequences for other content generation workflows.

Clearly distinguish confirmed issues from potential issues that require further testing.

Do not invent root causes.

## 4. Architecture Improvement Recommendations

Based on the actual implementation, evaluate whether the platform would benefit from:

1. A centralized prompt management system.
2. A dedicated instruction and context builder.
3. A structured content generation engine.
4. A reusable content template system.
5. JSON schema or equivalent structured output contracts.
6. An output validation engine.
7. An automatic correction and retry mechanism.
8. A structured content rendering architecture.
9. Better workflow state management.
10. Improved content regeneration and section-level editing.

For every recommendation, explain:

- Current implementation.
- Proposed implementation.
- Why the change is necessary.
- Advantages and disadvantages.
- Affected backend modules.
- Affected frontend modules.
- Potential database changes.
- Migration considerations.
- Implementation complexity.

Do not recommend replacing the entire architecture unless there is strong technical justification.

Preserve existing functionality and backward compatibility wherever possible.

## 5. Required Documentation Deliverables

Create the following Markdown documentation files in:

`docs/ai-content-generation-audit/`

### 01-system-overview.md
Overall system architecture, technology stack, modules, integrations, and project structure.

### 02-ai-prompt-management.md
Prompt construction, instruction hierarchy, brand context, user instructions, templates, and prompt execution.

### 03-ai-workflow-and-orchestration.md
Complete AI workflow, execution sequence, component responsibilities, data flow, and orchestration.

### 04-content-generation-and-output.md
Content generation implementation, output structures, parsing, storage, and regeneration.

### 05-output-validation-and-rendering.md
Existing validation, missing validation, frontend rendering, editing, approval, and content presentation.

### 06-database-and-api-reference.md
Relevant database entities, relationships, API endpoints, request/response structures, and persistence.

### 07-root-cause-analysis.md
Detailed investigation of why user-provided content formats are not consistently followed, including evidence and affected source files.

### 08-proposed-architecture.md
Recommended target architecture, component responsibilities, data flow, and design decisions.

### 09-implementation-roadmap.md
Prioritized implementation phases, dependencies, migration strategy, testing strategy, and estimated complexity.

### 10-open-questions-and-risks.md
Unknowns, assumptions, technical risks, compatibility concerns, and decisions requiring clarification.

Also create:

### README.md
An executive overview explaining the purpose of this audit, links to all documents, major findings, and the recommended next steps.

## 6. Technical Documentation Standards

- Base all documentation on actual source code.
- Include real file paths, class names, method names, interfaces, and API routes.
- Include Mermaid diagrams for important architecture and workflow diagrams.
- Include sequence diagrams where they help explain AI execution.
- Include actual database table and entity names.
- Include representative request and response examples based on the implementation.
- Clearly label proposed architecture separately from existing architecture.
- Do not fabricate missing implementation details.
- If something cannot be confirmed, explicitly document it as unknown.
- Avoid unnecessary duplication between documents.
- Write professional, developer-oriented technical documentation.

## 7. Important Restrictions

This is a READ-ONLY investigation.

- Do not modify application source code.
- Do not refactor existing modules.
- Do not modify database schemas.
- Do not modify API contracts.
- Do not modify existing prompts.
- Do not change environment variables.
- Do not install new dependencies.
- Do not implement any proposed architecture.
- Do not expose API keys, access tokens, passwords, secrets, or sensitive environment configuration in the documentation.

You may create or update only the requested Markdown documentation files under:

`docs/ai-content-generation-audit/`

## 8. Final Audit Summary

At the end, provide a concise summary containing:

1. How the current AI content generation system works.
2. How custom user instructions are processed.
3. Where formatting requirements might be lost.
4. The confirmed root causes.
5. Whether prompt improvements alone are sufficient.
6. Whether architectural changes are necessary.
7. The recommended target architecture.
8. The recommended implementation order.
9. The most important source files that should be reviewed before implementation.

**Final instruction: We want to understand the existing system before changing it. Accuracy and evidence from the actual codebase are more important than proposing an impressive new architecture.**