# 10. Open Questions, Technical Risks, and Decisions

**Author:** LCN Alvin  
**Document Version:** 1.0  
**Last Updated:** 2026-11-05  
**Document Status:** Proposed

## 1. Identified Technical Risks

### Risk 1: Model Support for JSON Schema Across Heterogeneous Providers
- **Description**: While OpenAI (`gpt-4o`, `gpt-4.1`) and Gemini (`gemini-1.5-pro`) provide strong native JSON Schema support via strict mode, smaller self-hosted models (via Ollama or older Groq endpoints) may experience syntax errors or high failure rates when constrained by strict schemas.
- **Mitigation**: Implement a dual-strategy executor in `LlmService`:
  - Tier A providers (OpenAI, Gemini, Anthropic): Native Structured Outputs (`withStructuredOutput`).
  - Tier B providers (Ollama, local LLMs): Prompt-based markdown section extraction with regex fallback parsers.

### Risk 2: Token Limit Pressure with Multi-Section Templates
- **Description**: The default token ceiling in `normalizeTextGenerationConfig` is currently set to `maxTokens: 500`. Multi-section formats containing 7 distinct parts plus emojis and hashtags can easily consume 400–700 tokens, especially in non-Latin scripts (e.g., Thai tokens consume 2–3x more tokens than English).
- **Mitigation**: Dynamically raise `maxTokens` to `1200` whenever a multi-section template or multilingual run is detected.

### Risk 3: Social Platform Limits on Formatted Text
- **Description**: Specific channel modalities enforce rigid character ceilings (e.g. TikTok photo slideshow titles capped at 90 characters via `TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX` in `platform-limits.ts`) where multi-section templates cannot physically fit in full.
- **Mitigation**: Implement configurable channel policies in `adapt-channel-guardrails.util.ts` driven by destination platform and post type. When adapting for constrained formats (e.g., slideshow titles), extract core hooks and CTAs, while preserving the full multi-section structure for standard feeds (Instagram, Facebook, LinkedIn, TikTok video captions up to 2,200 chars).

---

## 2. Key Decisions Requiring Product & Technical Alignment

1. **User Template Authority vs Workflow Template Authority**:
   - If a workflow node has its format set to `Bullets` in the workflow canvas, but the user enters a 7-section template in the Chat prompt, which takes precedence?
   - *Recommendation*: Chat-level user prompt overrides default node settings for that specific execution run.

2. **Template Storage & Reusability**:
   - Should custom templates be stored per-brand under `Rule` or globally in a new `ContentTemplate` catalog?
   - *Recommendation*: Phase 1 supports ad-hoc user templates in the prompt; Phase 2 introduces a reusable `ContentTemplate` library linked to the brand.

3. **Publishing Formatting Standards**:
   - When publishing to Instagram and Facebook, how should sections be formatted?
   - *Recommendation*: Use standard line breaks and emojis as section separators, avoiding markdown asterisks (`**`) which do not render natively on Instagram unless Unicode bold fonts are applied.

---

## 3. Unknowns & Implementation Assumptions

| Item | Current Status | Assumption Made |
| :--- | :--- | :--- |
| **Social Publishing API Formatting** | Social publisher code exists in `server/src/social/` | Assumed that standard double line breaks (`\n\n`) are preserved during Graph API publishing. |
| **User Template Intake** | Users enter templates either in Chat or via API | Assumed that preserving both intake paths is required. |
| **Credit Consumption** | Credits deducted per node in `CreditService` | Structured outputs slightly increase input token count due to schema definition; assumed to fit within existing credit margins. |