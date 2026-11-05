# Mosonic overnight — tools list + transcript/subtitle plan
# Path: D:\Projects\work\neutral-tex (ducothepaladin), branch work local/dev-wyl
# Generated for morning handoff — mocks only; no live video/AI generate calls tonight.

## 1) Full chat tools list (registered names)

### Core / memory / rule
- ask_user
- get_rule, update_rule, create_rule_from_intake, suggest_rule_improvement, apply_rule_suggestion
- remember, forget, forget_all, search_brand_memory
- web_search, fetch_website_assets

### Workflow canvas
- list_workflows, apply_default_workflow, generate_workflow
- get_node_config, update_node_config
- add_workflow_node, remove_workflow_node, reorder_workflow_nodes
- set_workflow_channels

### Brand assets
- list_brand_assets, search_brand_assets, request_asset_upload

### Content / draft
- list_contents, get_content, edit_content, save_content, approve_content, reject_content
- rerun_content_node

### Generate more (on existing draft)
- generate_more_image
- generate_more_summary
- generate_more_translation
- generate_more_adapt
- generate_presenter_video   ← HeyGen talking avatar (needs look+voice)
- generate_cinematic_video  ← HeyGen cinematic_avatar (needs look) | heygen_video (no look)

### Pipeline / run
- get_active_pipeline, list_pipelines, get_pipeline_status, get_pipeline_logs

### Channels / auth / upload
- list_channels, check_channel_auth, start_channel_oauth
- get_upload, preview_upload, edit_upload_channel, add_upload_media, remove_upload_media
- schedule_publish, reschedule_publish, cancel_schedule, publish_now, retry_publish

### Posts / analytics
- list_posts, get_post, get_post_analytics

## 2) Video nodes/tools — done vs remaining

### Done (server, mocks/unit only)
- Split `video_presenter` + `video_cinematic` (zod, defaults, migrate legacy)
- Cinematic modes: `cinematic_avatar` | `heygen_video` (+ heygenVideoMode / heygenCinematicModel)
- Durations: presenter 10/20/30/40/60; cinematic 5/10/15
- HeyGen submit helpers + `submitCinematicVideoJob` / processor routes both modes to HeyGen (Sora path retired for queue)
- Chat tools `generate_presenter_video` / `generate_cinematic_video` + gating + aliases
- Cost keys treat HeyGen via model string
- REACT video paragraph: look/voice/mode gates before generate
- Jest green: cinematic.spec + video-generation.service + generate-video.tools + routing + zod/split/cost (71+ related)

### Fixed tonight (client alignment)
- Cinematic duration UI 5/10/15 (was Sora 4/8/12/16/20)
- `cinematicMode` control on video settings
- Defaults: duration 10, cinematic_avatar, heygen_video_1 (dropped sora-2 model default)
- Look picker shown for cinematic_avatar (not heygen_video)
- EN/TH/zh-CN copy: Sora → HeyGen for cinematic

### Still open / do not live-call tonight
- Dead Sora helpers still in `video-generation.service.ts` (`submitVideoJob` / SORA_VIDEO_DURATIONS) — unused by processor; cleanup later
- No real HeyGen/Sora render or API generate in overnight work
- Optional: hide voice UI when cinematic look picker is shown; 1080p/resolution UX for HeyGen
- Client `.test.ts` files not in vitest `*.spec.ts` include — rename or widen include later

## 3) Transcript + subtitle plan (PLAN ONLY — no AI API tests tonight)

### Current state
- Node type `transcription` exists: Whisper via `TranscriptionService` + `llm.transcribeMedia`
- Config: sourceUrl, sourceType, language, provider/model
- Downstream matrix: transcription → text_generation | summarization | translation
- **No subtitle node** yet (no burn-in / SRT / VTT producer)

### Proposed approach
1. **Keep `transcription` as source-of-truth text** (timed if we extend Whisper verbose_json later).
2. **Add `subtitle` node** (new type) that consumes upstream `transcription` (+ optional video URL):
   - Outputs: `srt` / `vtt` text artifacts + optional `subtitleUrl` if file-service upload
   - Config: format (srt|vtt), maxCharsPerLine, language (inherit), burnIn (bool, default false)
3. **Pipeline wiring:** video_* → transcription → subtitle → (optional) upload/adapt; or presenter → transcription (from generated audio) → subtitle for accessibility captions on publish.
4. **Chat tools:** no dedicated generate_subtitle tonight; teach chat to `add_workflow_node` + `update_node_config` for transcription/subtitle; later optional `generate_more_subtitle` if draft needs captions.
5. **Cost:** transcription already Whisper; subtitle initially pure transform (no LLM) unless translation-of-captions requested (reuse translation node).
6. **Validation path (morning+):** unit tests with fixture audio buffers / mocked `transcribeMedia`; subtitle unit tests from fixed transcript strings — still no live Whisper until explicitly allowed.

### Out of scope tonight
- Calling Whisper / any AI API
- Burn-in ffmpeg integration (phase 2)
- HeyGen native caption APIs (evaluate later vs our subtitle node)

## 4) Morning checklist for chat AI clarity
- Tools list above is the source of truth for names
- Video paragraph already in REACT_CHAT_INSTRUCTIONS
- Soft budgets still: CHAT_MUTATIONS_PER_TURN=4, CHAT_ITERATIONS_PER_ROUND=8, CHAT_CONTINUE_ROUNDS=2
- Confirmation-gated: generate_* video tools + publish/oauth flows

## Update (night) — RD clarification + Grok Bot audit
- "Never generate" = **do not test generate paths at all** (live or mock campaigns). Wiring/schema/chat/cost/UI only; keep existing cheap unit tests that do not exercise generate/API.
- Fixed orchestration defaults that still routed cinematic → `sora`:
  - `dependency-resolver.service.ts` recover path → `heygen`
  - `media-node-completion.service.ts` default provider → `heygen`
  - `video-check.processor.ts` defaults → `heygen`
  - `video-generate.processor.ts` already heygen for both modes
- Chat copy: `generate-more.tools` / `workflow-edit.tools` Sora scene → HeyGen modes
- Cost/credit: cinematic reference → HeyGen; `operation-reference-costs` adds heygen primary; cost.service default chain heygen_* (Sora rows kept legacy-only)
- Stale `executeCinematic` comment fixed
- Dead Sora submit helpers left in `video-generation.service.ts` for legacy in-flight jobs only


## Update 2026-11-04 (providers: OpenAI + HeyGen only)

### Landed
- **Sora removed**: video-generation.service no longer has OpenAI videos / sora-* models; video-check.processor fails legacy `sora` jobs with a "re-run with HeyGen" message. Sora pricing rows in cost config left as-is (historical).
- **Subtitle node** (`subtitle`, Prisma enum + migration `20261104020000_add_subtitle_node_type`): pure local SRT/VTT transform of upstream transcription text (`subtitle.service.ts`); config format srt|vtt, maxCharsPerLine 10-120 (default 42), burnIn (stored, NOT implemented), sourceText, audioDurationSeconds. Timing is word-weighted over known duration, else 2.5 words/s.
- **Transcription**: still OpenAI Whisper only. New `sourceUrl` config + fallback to an upstream http(s) video output (`resolveTranscriptionSource`). Matrix: video_* -> transcription -> subtitle.
- **Chat**: `add_workflow_node` accepts transcription and subtitle (trunk only; subtitle requires a transcription, error `transcription_required`); aliases srt/vtt/captions/subtitles/transcript. REACT_CHAT_INSTRUCTIONS video/captions lines rewritten (3498 chars, no "sora").
- **Client**: canvas type `subtitle` (palette, maps, defaults, field defs, summary, icons, review/guide lists, output preview), transcription sourceType/sourceUrl fields, i18n en/th/zh-CN.

### Tools available to chat
add_workflow_node (incl. transcription, subtitle), get_node_config, update_node_config, ask_user, generate_* (HeyGen presenter / cinematic only).

### Known forks / TODO
- translation.service reads only `previousOutputs.text`, so subtitle -> translation does not translate the cue text.
- burnIn not implemented (needs ffmpeg, no AI).
- `prisma generate` hit EPERM (dev server locks engine DLL): rerun after stopping the server, then restart.

### Tests
All new tests are fixture/unit only with mocks; no live Whisper/LLM/HeyGen/OpenAI calls and no video generated.

### Follow-up (same night)
- **Prisma blocker cleared** (by Grok Bot on ducothepaladin): `prisma generate` + `migrate deploy` applied video split + subtitle migrations; Nest `start:dev` back up with video workers.
- **Captions icon**: `lucide-react` ships `dist/esm/icons/captions.mjs` (v^1.14.0); `pipeline-node-icons.tsx` import is valid — no swap needed.
- Gaps unchanged: `burnIn` still noop; subtitle → translation still does not translate cue text (translation reads `previousOutputs.text` only).

## Update - video preflight before queue (2026-11-04)

- New pure helper `server/src/nodes/video-node-preflight.util.ts` (`preflightVideoNode(type, config)` -> `{ ok: true } | { ok: false, code, message, missing }`) + spec `video-node-preflight.util.spec.ts`.
  - presenter: requires `heygenAvatarId` + `heygenVoiceId` (code `presenter_setup_required`).
  - cinematic_avatar (default/unset `cinematicMode`): requires `heygenAvatarId` or non-empty `heygenAvatarIds` (code `cinematic_avatar_required`).
  - heygen_video: no look needed; `image_to_video` needs `heygenReferenceImageUrl`, `reference_to_video` needs refs or image URL (same as submit). Prompt/script not checked (resolved from upstream at submit).
- Primary hook: `DependencyResolverService.enqueueNode` runs preflight for video nodes before `video_generate` `queue.add`; on failure it calls `MediaNodeCompletionService.failVideoNode` (stage `preflight`, resolved via ModuleRef to avoid the DI cycle) and never enqueues.
- Defense-in-depth: top of `VideoGenerateProcessor.process` fails the node once (no throw -> no retries, no HeyGen call).
- Chat REACT/tool-guard tightening is phase 2 (not done).
