# FULL IMPLEMENTATION — AI Content Generation Architecture

We have completed the architecture audit, technical verification, implementation blueprint, task breakdown, and test strategy.

**Now implement the complete AI Content Generation Architecture across the existing application.**

This is not another audit or planning task. The objective is to deliver a working, tested, backward-compatible implementation.

Use the existing documentation as the implementation reference:

- `docs/ai-content-generation-audit/README.md`
- `docs/ai-content-generation-audit/08-proposed-architecture.md`
- `docs/ai-content-generation-audit/12-technical-design-specification.md`
- `docs/ai-content-generation-audit/14-final-implementation-blueprint.md`
- `docs/ai-content-generation-audit/15-implementation-task-breakdown.md`
- `docs/ai-content-generation-audit/16-test-strategy-and-acceptance-criteria.md`
- `docs/ai-content-generation-audit/17-final-architecture-decisions.md`
- `docs/ai-content-generation-audit/18-final-review-and-outstanding-decisions.md`
- `docs/ai-content-generation-audit/19-final-documentation-consistency-review.md`

The actual source code is authoritative. Resolve documentation inconsistencies against the current implementation and verified provider capabilities.

# 1. Overall Objective

Transform the existing AI Content Generation Platform from predominantly plain-text generation into a structure-aware content generation system.

The system must:

- Understand complete user instructions.
- Preserve user-provided templates and examples.
- Identify required content sections and their ordering.
- Generate structured content rather than flattening everything into one paragraph.
- Validate generated content against the requested structure.
- Repair incomplete or invalid outputs when appropriate.
- Persist structured content safely.
- Maintain compatibility with existing pipelines, APIs, integrations, and publishing workflows.
- Provide a frontend experience for viewing, editing, regenerating, and previewing individual sections.

Support different content formats, not just Instagram.

Examples include Instagram posts, Facebook posts, LinkedIn posts, TikTok captions, product descriptions, marketing copy, custom templates, and other extensible content formats.

# 2. Implementation Rules

1. Do not create additional audit documents or repeat architecture planning.
2. Do not stop after inspecting the code or producing a plan.
3. Implement actual source code changes.
4. Follow the existing project architecture, coding conventions, and dependency choices.
5. Avoid unnecessary dependencies and database migrations.
6. Preserve existing application behavior where the new architecture does not explicitly replace it.
7. Maintain backward compatibility with existing plain-text content and publishing integrations.
8. Do not silently discard user instructions or generated content.
9. Do not claim a feature is complete without implementation and relevant tests.
10. Work incrementally, verify each phase, and continue to the next phase without waiting for additional user approval unless a genuine external blocker requires it.

# 3. Phase 1 — Prompt De-confliction & User Instruction Preservation

Implement:

- `TASK-PROMPT-01`: Conditional System Prompt Formatting.
- `TASK-PROMPT-02`: Chat ReAct Tool Prompt Preservation.

Requirements:

- Prevent conflicting paragraph-only directives when users explicitly request structured content.
- Preserve headings, section labels, bullet points, numbered lists, emojis, examples, and formatting requirements.
- Ensure the complete original user prompt reaches the generation pipeline.
- Prevent the ReAct agent from unnecessarily summarizing or replacing the user's original instructions.
- Preserve existing paragraph behavior for ordinary free-form requests.

Add tests for both structured and plain-text requests.

# 4. Phase 2 — Instruction Contract

Implement a reusable Instruction Contract layer.

It must interpret and preserve:

- Original user prompt.
- Content objective.
- Platform/channel.
- Language.
- Tone and writing style.
- Required sections.
- Optional sections.
- Section order.
- Formatting rules.
- Length constraints.
- Product and brand information.
- Promotion details.
- Restrictions and prohibited content.
- User-provided examples and templates.

Requirements:

- Keep the original prompt separately from interpreted instructions.
- Do not allow interpretation to silently overwrite the original prompt.
- Support custom user-defined templates.
- Avoid hardcoding Instagram-specific assumptions into the core architecture.
- Provide sensible fallback behavior when instructions are ambiguous.
- Validate the interpreted contract before generation.

Add unit and integration tests.

# 5. Phase 3 — Structured Content Generation Engine

Implement a reusable Structured Content Generation Engine.

Requirements:

- Generate structured sections rather than only one monolithic string.
- Use Zod or the project's existing validation framework.
- Support extensible section types through a typed, discriminated structure.
- Include support for headings, paragraphs, bullet lists, numbered lists, CTAs, hashtags, quotes, rich text, links, image directions, video scenes, and scripts where applicable.
- Allow new section types to be introduced without redesigning the entire engine.
- Preserve section order and required/optional status.
- Generate content according to the Instruction Contract.
- Support custom templates and channel-specific generation rules.

Provider compatibility:

- Inspect the existing provider abstraction.
- Implement provider-specific structured output strategies.
- Prefer native structured outputs or tool calling when supported and verified.
- Provide appropriate fallback parsing and validation for providers without equivalent support.
- Do not assume identical structured-output behavior across OpenAI, Anthropic, Gemini, and Ollama.
- Verify the exact installed package versions and model capabilities before using provider-specific options.
- Do not introduce unsupported model names or unverified API parameters.

Start with the primary provider already used by the application, then support the other existing providers through the same abstraction where practical.

Important:
For OpenAI strict Structured Outputs, ensure schema requirements are compatible with strict mode. Do not blindly use optional Zod properties where all keys must be required. Use nullable values or provider-specific schema transformation where necessary.

# 6. Phase 4 — Output Validation & Repair

Implement deterministic validation and controlled AI-assisted repair.

Validate:

- Required sections exist.
- Section order is correct.
- Section types match the contract.
- Required content is not empty.
- Length constraints are respected.
- Hashtags and CTA requirements are preserved.
- Forbidden content and explicit user restrictions are respected.
- Output can be rendered into the required channel format.

Requirements:

- Separate deterministic validation from subjective AI quality assessment.
- Never claim 100% semantic quality from probabilistic model outputs.
- Use bounded repair attempts.
- Preserve valid sections when repairing invalid sections where possible.
- Prevent infinite retry loops.
- Return actionable validation errors.
- Preserve the original generated output for debugging when appropriate.

Add unit tests, integration tests, and failure-path tests.

# 7. Phase 5 — Structured Persistence & API Compatibility

Implement persistence and API support for structured content.

Requirements:

- Inspect existing database JSON/JSONB fields and API response contracts.
- Reuse existing JSON storage where suitable.
- Do not add a migration unless the current schema genuinely requires one.
- Persist structured sections, template metadata, validation results, and compiled text as appropriate.
- Preserve legacy `outputs.text` and existing publishing integration contracts.
- Ensure old plain-text records remain readable and editable.
- Support conversion between structured content and compiled text.
- Add safe fallback behavior for legacy records.
- Protect tenant ownership and authorization.
- Implement appropriate concurrency and conflict handling for section-level updates.
- Use existing locking and optimistic concurrency mechanisms only after verifying their actual behavior.
- Avoid lost updates during concurrent edits or regeneration.

Update API DTOs, services, controllers, and tests as required.

Mark newly introduced API endpoints as implemented only after they exist and are tested.

# 8. Phase 6 — Frontend Section Editor & Preview

Implement the frontend experience using the existing frontend architecture and component conventions.

Requirements:

- Display structured content sections individually.
- Allow users to edit individual sections.
- Allow regeneration of individual sections where supported.
- Preserve unaffected sections when one section is regenerated.
- Support adding, removing, and reordering sections where permitted by the template.
- Display required and optional sections clearly.
- Provide an assembled content preview.
- Provide a plain-text fallback for legacy content.
- Support loading, saving, validation, and error states.
- Prevent accidental overwriting of newer edits.
- Maintain responsive layouts and existing design conventions.

Do not replace existing functionality unnecessarily.

Add relevant frontend tests.

# 9. Cross-Phase Requirements

## Backward Compatibility

Existing workflows must continue to work:

- Legacy plain-text generation.
- Existing pipeline execution.
- Existing content output consumers.
- Existing publishing integrations.
- Existing user editing workflows.
- Existing records stored in the database.

The compiled text representation must remain available wherever existing integrations expect `outputs.text`.

## Security and Multi-tenancy

Verify:

- Tenant isolation.
- Record ownership.
- Section-level authorization.
- Input validation.
- Safe persistence.
- No cross-tenant data exposure.

## Reliability

Verify:

- Provider errors.
- Invalid JSON.
- Schema validation failures.
- Timeout behavior.
- Retry limits.
- Concurrent updates.
- Partial generation failures.
- Legacy data fallback.

# 10. Testing and Acceptance Criteria

Run relevant automated tests throughout implementation.

At minimum:

- Unit tests for instruction interpretation.
- Prompt preservation tests.
- Structured generation tests.
- Provider compatibility tests.
- Schema validation tests.
- Repair and retry tests.
- Persistence tests.
- API compatibility tests.
- Tenant isolation tests.
- Concurrency tests.
- Frontend component tests.
- End-to-end generation tests where the project supports them.

Use mocked providers for deterministic automated tests and real provider integration tests only where credentials and test environments are available.

For AI quality, use a representative benchmark dataset and report measured results. Do not claim universal 100% adherence.

A successful implementation must demonstrate that a structured Instagram template generates the required sections in the requested order, while ordinary plain-text requests continue to work.

Also test at least one non-Instagram content format and one custom user-defined template.

# 11. Execution Strategy

Implement all six phases in order.

For each phase:

1. Inspect the relevant existing code.
2. Implement the functionality.
3. Add or update tests.
4. Run relevant tests and type checks.
5. Fix regressions.
6. Record actual completion status.
7. Continue to the next phase.

Do not stop after Phase 1.

Do not wait for another user message between phases unless a genuine blocker requires user input.

If context or execution limits prevent completion in one session:

- Finish the current safe implementation unit.
- Commit no incomplete or broken state.
- Report completed phases and exact remaining tasks.
- Provide the precise next implementation step.
- Do not claim the overall architecture is complete.

# 12. Final Acceptance Criteria

The project is complete only when:

- Original user instructions are preserved.
- The Instruction Contract works.
- Structured content generation works.
- Output validation and repair work.
- Structured persistence and API compatibility work.
- The frontend supports section-level editing and preview.
- Existing legacy workflows remain functional.
- Relevant automated tests pass.
- Type checking, linting, and production builds pass.
- Known limitations and unverified provider capabilities are documented accurately.

# 13. Final Implementation Report

After completing all phases, provide:

1. Summary of implemented architecture.
2. Phase-by-phase completion status.
3. Files created and modified.
4. Database changes, if any.
5. API changes.
6. Frontend changes.
7. Provider compatibility and verified models.
8. Automated tests and their results.
9. Build, lint, and type-check results.
10. Backward compatibility verification.
11. Remaining limitations or blockers.
12. Exact manual verification steps.

**Start implementing the complete architecture now. Do not produce another plan. Do not stop after Phase 1. Continue through all six phases and verify the actual implementation.**