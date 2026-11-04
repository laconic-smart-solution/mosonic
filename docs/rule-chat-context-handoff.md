# Rule Chat / Brand Assistant — Context Handoff

This document is a handoff summary so another tool (e.g. Cursor) or a future session can pick up without re-reading the full conversation. It reflects the state of the code as of **2026-11-01**. CLAUDE.md remains the canonical repo-conventions reference — this file only covers the feature work below.

## Goal (long-term)

A **chat-based ReAct agent** on Home. The **Rule is the brain** (structured strategy + uploaded assets). The user talks in one session; the model calls tools that wrap **existing Mosonic services** (Rule extract/patch, assets, later generate / content / upload). The **workflow canvas and orchestration graph stay**. Chat is a parallel surface, not a replacement.

Target walkthrough: user with **no brand profile** → intake in chat → create Rule → fetch site images / upload assets → author workflow → `start_generation` → draft in Content → approve. **Publish / accounts / schedule are not in chat yet.** GPT tool-calling **drives** that; Mosonic services **execute** it. Do not add a second node executor in Rule tools.

**Constraint:** do not change how `orchestration.service.ts` (and other existing consumers) **read** Rule JSON columns, and do not invent a second Rule schema. Chat may **write** brand/audience through the existing `RuleService.patchRule` / `requestExtraction` paths. Everything else is additive.

## What's built, in order

### Phase 1 — Rule brand assets + RAG foundation (server)

- **`RuleAsset`** / **`RuleAssetChunk`** Prisma models (`server/prisma/schema.prisma`) — a Rule can have many assets (`logo | reference_image | guideline_document`), each with a `status` (`pending|processing|ready|failed`). `RuleAsset.ruleId` is a bare string (no `@relation`), matching `Pipeline.ruleRef`. `RuleAssetChunk` has a real `@relation` to its parent `RuleAsset` (`onDelete: Cascade`).
- **Upload** (`server/src/rule/rule-asset.service.ts`): `ImageFileService.upload()` → file-service. Persists `fileUrl` **and** `relativePath` (client `FileServiceImage` / `useFileObjectUrl` needs `relativePath`).
  - **Images**: `LlmService.describeImageForExtraction()`, cached as `aiDescription`. No chunking.
  - **PDFs**: `extractPdfText()`. Short → `extractedText`. Long → chunk (`rule-asset-chunk-text.util.ts`, `chunk_size=1200`/`overlap=150`) + `LlmService.embedTexts()`/`embedQuery()`.
- **Search**: `RuleAssetSearchService.search(ruleId, query, topK)` — in-process cosine similarity, embeddings as JSONB float arrays (same idea as `faq/`). No pgvector.
- **Context compiler**: `buildRuleBrainPrompt(rule, assets)` — Rule fields + ready assets into one system-prompt string.
- **Endpoints**: `POST/GET /rules/:ruleId/assets`, `DELETE /rules/:ruleId/assets/:ruleAssetId`.
- **Migrations**: `20261020120000_add_rule_asset`, `20261030090000_add_rule_asset_relative_path`. See migration-workflow note — not applied via plain `prisma migrate dev`.

### Phase 2 — Client brand-assets UI (Rule form)

- `client/src/shared/services/rule-asset.service.ts` + `rule-asset.query.ts`.
- `assets-section-form.tsx` on Rule detail — upload/delete are immediate API calls, **not** part of react-hook-form Save.
- Thumbnails **must** use `FileServiceImage`, never a raw `<img src={fileUrl}>`.
- `buildRuleFlow` gained an `assets` bubble. i18n in `en`/`th`/`zh-CN` `rules.json`.

### Phase 3 — Tool-calling loop (server)

- Generic `runToolCallingLoop` (`server/src/rule/tools/tool-calling-loop.ts`): bindTools → invoke → Thought / Action / Observation → `ToolMessage` → loop (`maxIterations=6`). Returns `{ finalMessage, messages, steps, usage }`. Optional `onStep`.
- Thought parsing: every reply is prompted to start with `Thought: …` (`split-thought.util.ts`). That line is a `thought` step; the rest is user-facing `content`. Direct answers (no tools) still get a Thought (parsed line or fallback “answered from the brand brief”). Empty content on a tool call gets a synthetic Thought.
- Verification endpoint (still **two read tools only**): `POST /rules/:ruleId/tools/ask`.

### Phase 4 — Chat sessions (server)

- **`ChatSession`**: `ruleId` is **nullable** (migration `20261031160000_chat_session_rule_nullable`) so onboarding can start with no Rule. `userId`, `title?`.
- **`ChatMessage`**: `role`, `content`, `steps Json?` (`thought | action | observation`, legacy `tool_call` still parseable), `inputTokens`/`outputTokens`. Migration `20261031140000_chat_message_steps_tokens`.
- One user → many sessions; a session **binds** a `ruleId` later via `create_rule_from_intake`.
- `ChatSessionService.sendMessage`:
  1. Ownership from the **session row** (not the URL rule).
  2. Persist user message.
  3. Last **20** messages → `toLangChainHistory` (plain text always; **truncated observations from the last 2 assistant turns that used tools**, `OBSERVATION_MAX_CHARS=800`).
  4. If `session.ruleId` → `buildRuleBrainPrompt` + rule-aware tools. Else → `buildOnboardingPrompt` + onboarding tools.
  5. `runToolCallingLoop` with `onStep` → `chat:step`.
  6. Persist assistant `content` + `steps`. Return `{ userMessage, assistantMessage, contextUsage, session }` so the client can notice a mid-turn `ruleId` bind.
- **HTTP** (`chat-session.controller.ts`) — session-scoped except list-by-rule:
  - `GET /chat/sessions` — all of the user's chats (sidebar).
  - `POST /chat/sessions` — `ruleId` optional.
  - `DELETE /chat/sessions/:sessionId`
  - `GET/POST /chat/sessions/:sessionId/messages`
  - `GET /rules/:ruleId/chat/sessions` — still rule-filtered.

### Phase 5 — Client chat UI + live steps + tokens (no token streaming)

Chat is Home. `sendMessage` is one blocking HTTP call. Live progress is Socket.IO during that call.

- Room `chat_${sessionId}`: `chat:started` / `chat:step` / `chat:completed` / `chat:failed`. `use-chat-steps.ts` + `prepareSession` (join before send).
- `ChatStepAccordion` — Thought / Action / Observation (legacy `tool_call` expanded). `request_asset_upload` observations render an **Upload** CTA (`onRequestUpload` opens the brand panel).
- `ChatContextUsage` — last turn `{used} / {limit}` from `LlmService.getContextLimit()`.
- Composer can attach files/URLs: files upload as Rule assets **only if a `ruleId` is already bound**; otherwise toast `composer.uploadNeedsRule`. URLs are appended to the message text.

### Phase 6 — Onboarding + brand tools (Claude, 2026-11-01)

Chat no longer requires a Rule up front. Two tool sets:

**No `ruleId` (onboarding)** — `buildOnboardingPrompt()`:

| Tool | Role |
| --- | --- |
| `create_rule_from_intake` | `RuleService.requestExtraction` (same as `/rules/extract`). Sync `ruleId`, extraction continues in background on `rule_${ruleId}`. Binds `session.ruleId`. URL must be real `http(s)`; placeholders ignored (`url-guard.util.ts`). |
| `fetch_website_assets` | `getRuleId()` closure so it works **later in the same turn** after create. Discovers ≤8 images via `WebsiteAssetHandler`, uploads as `logo` then `reference_image`. |
| `web_search` | Live facts. |

Prompt: call `create_rule_from_intake` once there is **name+industry OR a real URL**; then `fetch_website_assets` in the **same turn** if a URL was given.

**Has `ruleId` (brand-aware)** — `buildRuleBrainPrompt` + extra lines to `update_rule` / `fetch_website_assets` when the user adds a site or new facts:

| Tool | Role |
| --- | --- |
| `search_brand_assets` | RAG over guideline PDFs. |
| `get_rule` | Re-read brief (already in system prompt; for mid-chat drift). |
| `list_brand_assets` | Names + status; don’t assume a logo exists. |
| `request_asset_upload` | No I/O. Observation `{ action: "request_upload", assetType }` → client Upload button. |
| `update_rule` | `RuleService.patchRule` for `name` / `brand` / `audience` / `campaign` / `channels` / `contentGuidelines` — **only fields that changed**. `channels` is a full list replace. |
| `fetch_website_assets` | Same as onboarding, `ruleId` already known. |
| `web_search` | Live facts. |

**Client glue for extraction:** after send, if `result.session.ruleId` is new → `bindRuleToCurrentSession` + `useRuleBuildProgress` joins `rule_${ruleId}` and shows `ChatRuleBuildProgress` (started → reading_input → …). On complete, invalidates rule + session queries.

Sidebar lists **all** sessions (`GET /chat/sessions`). URL `?rule=&session=`; explicit rule switch resets session; binding a rule from intake does **not**.

### Phase 7 — Workflow authoring tools (chat operates the canvas, does not execute nodes)

Chat is a ReAct **operator** over `WorkflowService`. It authors the recipe; orchestration cooks. **No per-node generation tools** (`generate_text` / `generate_image` / … as executors).

| Tool | Role |
| --- | --- |
| `list_workflows` | Latest workflow for **this** `ruleId`. Empty list if none. Observation `action: show_workflow` drives the chat card. |
| `generate_workflow` | `WorkflowService.generate`. HITL on replace (`workflow_exists` → `ask_user` / `confirmReplace`). |
| `apply_default_workflow` | Default template for the brand channels. Same replace guard. |
| `get_node_config` | Read one node’s prompt + config + **lane**. |
| `update_node_config` | Patch prompt/config **and move lane**. Channel/label is `lane` / `laneId` (linkedin, facebook, …), **not** `config.channel`. Rebuilds edges after a lane move. Image “put this on LinkedIn” = lane move. |

`react-chat-instructions.ts` is appended to the brain prompt: Thought line required; one mutating workflow/pipeline/content tool per turn; workflow tools do not run GPT/DALL·E themselves.

**Client:** `ChatWorkflowCard` (not the canvas). `findWorkflowCards` keeps **one card per `workflowId`** (last observation wins). Polls while `generating`. i18n `en` / `th` / `zh-CN` `chat.json`.

### Phase 8 — Start generation + pipeline inspect (this workflow only)

| Tool | Role |
| --- | --- |
| `start_generation` | `OrchestrationService.startPipeline` with `contentPrompt`. Omit `workflowId` → latest **ready** workflow for this brand. Loop **stops** on `action: pipeline_started`. Model must **not** write the post in chat. |
| `list_pipelines` | Newest 10 runs for **this workflow** (`workflowRef` + tenancy). Never global. |
| `get_active_pipeline` | Newest `running`, else `paused`, on this workflow. `pipeline: null` if idle. |
| `get_pipeline_status` | Per-node status. Omit `pipelineId` → active, else latest. |
| `get_pipeline_logs` | Last 30 short messages (optional `nodeId` / `INFO\|WARNING\|ERROR`). Not generated copy. |

**Scope:** `pipeline-scope.util.ts` — resolve session workflow (`ruleRef` match), then filter. Pipelines in chat are never cross-brand.

**Nest cycle (important):** `RuleModule` must **not** import `PipelineModule` (`PipelineModule` → `OrchestrationModule` was `undefined` at scan → `UndefinedModuleException`). Reads use `PIPELINE_REPOSITORY` (`IPipelineRepository.findPage` → `{ rows }`). `start_generation` uses `OrchestrationService` via `forwardRef`. `PipelineModule` wraps `OrchestrationModule` in `forwardRef` as well.

**Client:** `ChatPipelineCard` + `findPipelineCards` (one per `pipelineId`). Polls while `running`.

### Phase 9 — Content review + generate-more (no video tool)

Content exists **after** a pipeline completes. Tools wrap `IContentRepository` (list/get) and `ContentService` (mutations) with `forwardRef(() => ContentModule)`. Same brand+workflow scope (`content-scope.util.ts`).

| Tool | Role |
| --- | --- |
| `list_contents` | Newest 10 on this workflow (`ruleRef` + `workflowRef`). |
| `get_content` | Latest draft, or by `contentId` / `pipelineId`. Truncated preview (~400 chars). `no_content` if the run has not finished — do not invent copy. |
| `save_content` | Text-only `userEdits` (`text`, `translatedText`, `summary`, `keywords`). Draft / in-review only. |
| `approve_content` / `reject_content` | HITL: `ask_user` first, tool on the **next** turn. Loop stops on `content_approved` / `content_rejected`. |
| `rerun_content_node` | `ContentService.scheduleRerun` — tweak an **existing** node (`nodeId` + optional `message`). Not a new pipeline. |
| `generate_more_image` | Extra image (`scheduleGenerateNode`, `isGenerateMoreOnly`). Optional `lane` / aspect / style. |
| `generate_more_translation` | Extra translation (`targetLanguage`, formality). |
| `generate_more_summary` | Extra summary (`summaryLength`). |

**Not in chat:** `generate_more_video` (user uses the content review page). No multipart file attach on generate-more. No version restore / stats / publish.

**Client:** `ChatContentCard` + `findContentCards` (one per `contentId`). Link to `/content/:id`. Polls while `generate_more_started` or `content_rerun_started`.

### Phase 10 — Brand memory (CLAUDE.md-style, RAG-backed)

Durable operational notes that don't fit `Rule`'s structured fields or an uploaded document — preferences/corrections/facts the user states mid-conversation ("never suggest infographics for LinkedIn"), which previously just fell out of the 20-message history window.

- **`RuleMemory`** (`server/prisma/schema.prisma`, migration `20261101160000_add_rule_memory`): `ruleId`, `userId?`, `type: preference | correction | fact`, `body`, `embedding Json?`. Embedded on write (`LlmService.embedQuery`) — same JSONB-float-array + in-process-cosine approach as `RuleAssetChunk`/`RuleAssetSearchService`, no pgvector.
- **`RuleMemoryService`** (`server/src/rule/rule-memory.service.ts`): `remember`/`forget`/`listRecent`. **`RuleMemorySearchService`** (`rule-memory-search.service.ts`): cosine search, reuses `cosineSimilarity` exported from `rule-asset-search.service.ts`.
- **Read side**: `buildRuleBrainPrompt(rule, assets, memories)` gained a third param — recent memories (`listRecent`, default 10) fold into a `## Brand memory` section, each line tagged `[type, id=...]` so the model can reference an id back to `forget`.
- **Write side**: three new tools, rule-aware only (no Rule yet during onboarding = nothing to attach memory to) — `remember` (type + body), `forget` (memoryId, sourced from the id shown in the brand-memory section — never guessed), `search_brand_memory` (RAG recall beyond the recent-N window, for "what did we decide about X a while back").
- Prompt instruction added to `buildRuleBrainPrompt`'s trailing guidance: call `remember` as soon as a durable preference/correction/fact comes up; `forget` when the user says one is wrong/outdated; `search_brand_memory` before assuming something was never discussed.

**Explicitly NOT the same mechanism as**: tracking "which image `designStyle`/`template` was used recently" for generation variety — that's structured/categorical history, better answered by querying past `Content` rows directly than by writing it as a freeform memory note. Two different problems raised in the same conversation; kept separate on purpose.

### Phase 11 — Reasoning model on the "thinking" layer + step timing

User wanted the chat's ReAct reasoning to optionally run on an OpenAI reasoning model (o-series/gpt-5-thinking), inspired by a Codex/ChatGPT-style trace UI (collapsible Thought blocks with per-step timing). Key finding: the existing multi-iteration `runToolCallingLoop` (one `model.invoke()` per iteration, each producing a `Thought:`-prefixed message) already matches that trace shape — no need to split each iteration into a separate reasoning-call + tool-call-call.

- **`LlmService.getReasoningChatModel(options?: { effort?, maxTokens? })`** (`server/src/llm/llm.service.ts`) — OpenAI-only, model id from `OPENAI_REASONING_MODEL` (default `gpt-5-mini`; `o4-mini` was shut down 2026-10-23), passes `reasoning: { effort }` and **never** `temperature` (OpenAI reasoning-model endpoints reject it; `@langchain/openai` v1.5.3 confirmed the `reasoning` param is "ignored when not using a reasoning model" — safe to always set when calling this method). `getReasoningModelId()` exposes the resolved id for `getContextLimit()` lookups. `MODEL_CONTEXT_LIMITS['gpt-5-mini'] = 200_000`.
- **Feature flag `CHAT_USE_REASONING_MODEL`** (`.env.example`, default `false`) — same flag-driven-behavior convention as `ORCHESTRATION_USE_QUEUE`/`WHATSAPP_USE_GOLANG`. `ChatSessionService` (now also injects `ConfigService`) picks `getReasoningChatModel()` vs `getChatModelForPlainText()` per turn based on this flag, and passes the matching model id into `getContextLimit()` so the context-usage bar stays accurate under either model.
- **Per-step timing**: `runToolCallingLoop` times each iteration's `boundModel.invoke()` call and attaches `durationMs` to the `thought` step it pushes. `AgentStep`'s `thought` variant gained `durationMs?: number` (optional — old persisted steps without it still parse fine) on both server (`tool-calling-loop.ts`) and client (`chat.service.ts`).
- **Client**: `chat-step-accordion.tsx`'s Thought block shows a small `· Ns` / `· <1s` badge next to the "THOUGHT" label when `durationMs` is present (`formatStepDuration`). No structural accordion changes — explicitly scoped down from a full Codex-style "Explored N files, M searches" rollup, which the user declined.

## Tools — built vs not

**Onboarding (no `ruleId`):** `create_rule_from_intake`, `fetch_website_assets`, `web_search`, `ask_user`.

**Brand-aware (has `ruleId`) — built:**

- Brand: `search_brand_assets`, `get_rule`, `list_brand_assets`, `request_asset_upload`, `update_rule`, `fetch_website_assets`, `remember`, `forget`, `search_brand_memory`, `web_search`, `ask_user`
- Workflow: `list_workflows`, `generate_workflow`, `apply_default_workflow`, `get_node_config`, `update_node_config`
- Pipeline: `start_generation`, `list_pipelines`, `get_active_pipeline`, `get_pipeline_status`, `get_pipeline_logs`
- Content: `list_contents`, `get_content`, `save_content`, `approve_content`, `reject_content`, `rerun_content_node`, `generate_more_image`, `generate_more_translation`, `generate_more_summary`

Loop **stops** after `ask_user`, `pipeline_started`, and content mutation actions (`generate_more_started`, `content_rerun_started`, `content_approved`, `content_rejected`) so later tools in the same turn do not run.

**Not built:** per-node executors (`generate_text` / `generate_image` / `generate_video` / `translate` as GPT wrappers), `generate_more_video`, `check_credits`, `list_versions`, `list_channel_constraints`, `list_connected_accounts`, `preview_posts`, `publish_now`, schedule/retry/analytics. Failures stay **observations** on the same tool, not extra tools.

`POST /rules/:ruleId/tools/ask` is still only search + web_search (not the full chat catalog).

## Decisions

- **Tool-schema token cost is gated by brand phase.** `buildRuleAwareContext` does one cheap `WorkflowService.getWorkflowByRuleId` check per turn; node-config/pipeline/content tools (~15 of ~26) only get bound to the model once this brand actually has a workflow. Brand-new briefs (the common case during onboarding) see a much smaller tool list instead of paying schema-token cost for tools that would just return `no_workflow` anyway. `react-chat-instructions.ts` tells the model why those tools might be missing and to call `generate_workflow`/`apply_default_workflow` first.
- **Pipeline/content tenancy was audited** (`pipeline-scope.util.ts` / `content-scope.util.ts`): every lookup goes through `mergeTenancyWhere` + explicit `ruleRef`/`workflowRef` filters, plus a defense-in-depth re-check (`assertPipelineOnWorkflow` / `assertContentOnWorkflow`) after the repository call, and `resolveWorkflowForSession` validates a model-supplied `workflowId` actually belongs to the session's `ruleId` before trusting it. No fix needed — already solid.
- **No new AI gateway** — `LlmService` + LangChain `bindTools`.
- **Native tool-calling, not paper ReAct parsers.** Trace is Thought / Action / Observation for UI + next-turn replay.
- **pgvector deferred** (local Windows Postgres 18.4 has no `vector` extension).
- **Migrations:** hand-write SQL → `prisma db execute` → `migrate resolve --applied`. **Do not run `prisma migrate dev`** on this local DB (faq Alembic tables look like drift / reset).
- **`kill-port.js`** on `start` / `start:dev` / `start:debug` / `start:prod` (Windows `EADDRINUSE`). If watch still dies with EADDRINUSE, the previous Node process is still holding 3000 — kill it and start again or the UI talks to **old** code.
- **Context:** DB keeps full `steps`; LLM sees 20 messages + last **2** tool-turns’ truncated observations.
- **`update_rule` / extract** go through existing RuleService. Orchestration still reads the same JSON columns.
- **Files never go to the model as bytes.** Upload is UI → `RuleAssetService`; the tool only signals “please upload.”
- Canvas / pipeline execution is untouched. Chat does **not** call `NodeExecutor`. `start_generation` → `startPipeline`; generate-more / rerun → `ContentService`.
- **Lane vs channel:** UI label and “move image to LinkedIn” write `node.lane` (and rebuild edges). `config.channel` alone does not move the card.
- **Tenancy in chat:** every pipeline/content lookup is this session’s `ruleId` + that brand’s workflow. Never `findPage` without `workflowRef` / `ruleRef`.
- **Module graph:** `RuleModule` imports `WorkflowModule` + `OrchestrationModule` + `ContentModule` via `forwardRef`. Do **not** import `PipelineModule` from Rule (circular `undefined` import). List pipelines through `PIPELINE_REPOSITORY`.
- One mutating workflow/pipeline/content tool per turn. One chat card per workflow / pipeline / content id (last observation wins).

## Explicitly not done yet

- Video generate-more in chat (`generate_more_video`) — send users to the content review page.
- Per-node chat executors (GPT/DALL·E/Sora from Rule tools). Do not add them; use workflow + `start_generation` or Content rerun / generate-more.
- Upload / publish tools (`list_connected_accounts`, `preview_posts`, `publish_now`, schedule, retry).
- Content version restore, generate-more file attachments, credit-check tool.
- Token streaming (not wanted).
- Client-side token estimate as you type.
- Token-budget truncation / summarization of the whole chat.
- pgvector.
- Wiring Rule-asset RAG into **pipeline node execution** (separate track). `text_generation` is **not** always node 1 in code; ordering is relative (`workflow-node-order.util.ts`).
- `list_rules` as a tool (the **selector UI** lists rules; the model does not).

## Key files

```
server/prisma/schema.prisma
server/prisma/migrations/20261031160000_chat_session_rule_nullable/
server/src/rule/
  rule-asset.service.ts / .controller.ts
  rule-asset-search.service.ts
  rule-context-builder.util.ts          # buildRuleBrainPrompt + buildOnboardingPrompt
  rule-tools.service.ts                 # /tools/ask — search + web only
  tools/
    tool-calling-loop.ts / split-thought.util.ts / url-guard.util.ts
    search-brand-assets.tool.ts / web-search.tool.ts
    create-rule-from-intake.tool.ts / update-rule.tool.ts
    get-rule.tool.ts / list-brand-assets.tool.ts
    request-asset-upload.tool.ts / fetch-website-assets.tool.ts / ask-user.tool.ts
    workflow-tool.util.ts / list-workflows.tool.ts / generate-workflow.tool.ts
    apply-default-workflow.tool.ts / get-node-config.tool.ts / update-node-config.tool.ts
    start-generation.tool.ts / pipeline-scope.util.ts
    list-pipelines.tool.ts / get-active-pipeline.tool.ts
    get-pipeline-status.tool.ts / get-pipeline-logs.tool.ts
    content-scope.util.ts / list-contents.tool.ts / get-content.tool.ts
    save-content.tool.ts / approve-content.tool.ts / reject-content.tool.ts
    rerun-content-node.tool.ts / generate-more.tools.ts
  chat/
    chat-session.service.ts / .controller.ts
    chat-history.util.ts / react-chat-instructions.ts
server/src/preprocessing/handlers/website-asset.handler.ts
server/src/llm/llm.service.ts
client/src/features/home/pages/home.tsx
client/src/features/chat/                 # sessions, composer, accordion, rule-build progress
  components/chat-workflow-card.tsx / chat-pipeline-card.tsx / chat-content-card.tsx
  lib/parse-workflow-card.ts / parse-pipeline-card.ts / parse-content-card.ts
client/src/shared/socket/chat-events.ts / rule-events.ts
```

## Verified so far

- New unit tests for tools, split-thought, history replay, chat-session (onboarding + bind). Treat pre-existing server suite failures as unrelated baseline unless a **new** spec breaks.
- Workflow / pipeline / content tool specs: brand `workflowRef` always on `findPage`; `update_node_config` lane move; `start_generation` required instead of drafting; generate-more has **no** video helper; loop stops after `pipeline_started` / `generate_more_started`.
- Manual still useful: restart API if port 3000 was stuck; **do not** run a second `yarn start:dev` (Windows `taskkill` access-denied on the watcher). New chat with no Rule → intake → `create_rule_from_intake` → progress bar; with Rule → Thought accordion; `request_asset_upload` shows Upload; follow-up turn can use last observations without re-searching.
- Generate path: “make a Black Friday post” → `start_generation` → pipeline card (not a drafted caption). After complete → `get_content` → content card. “Another LinkedIn image” → `generate_more_image` with `lane: linkedin`. “Another video” → tell them to use the review page.
