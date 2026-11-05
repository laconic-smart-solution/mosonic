# Queue system architecture

Every background job in the API runs on [BullMQ](https://docs.bullmq.io/) queues backed by Redis. This doc covers every queue in the app, how the pipeline orchestration engine (the biggest and most complex consumer) uses them, and the per-tenant sharding layer added on top. For **deploying** the worker process, see [`worker-deployment.md`](./worker-deployment.md) — this doc is about how the system is built, not how to run it.

## 1. The two moving parts: producers and workers

- **Producers** enqueue jobs — mostly `DependencyResolverService` (pipeline orchestration) and a handful of other services (news-trigger cron, RedNote login/publish).
- **Workers** (`@Processor`-decorated classes, or in the pipeline case, plain services managing raw BullMQ `Worker` instances — see §4) consume them.

Both can live in the same process or be split:

| `RUN_WORKERS_IN_API` | API process | Worker process |
|---|---|---|
| `true` (default) | HTTP + WebSocket + **all workers in-process** | not needed |
| `false` | HTTP + WebSocket only, no workers | `yarn start:worker` runs `src/worker/main.ts`, which force-sets `RUN_WORKERS_IN_API=true` for itself and imports `OrchestrationModule` + `NewsTriggerModule` |

Both processes connect to the **same Redis** (`BullModule.forRootAsync` in `app.module.ts` / `worker/worker.module.ts`, both via `buildRedisConnectionOptions()` in `src/config/redis-connection.util.ts`) and the **same Postgres**. A worker holding jobs for a database the API isn't pointed at is the single most common local-dev misconfiguration — `OrchestrationModuleBootstrap.onModuleInit()` in `orchestration.module.ts` logs a warning if it detects a local DB paired with a non-local Redis.

## 2. Queue inventory

| Queue name | Module | Concurrency (env) | Purpose |
|---|---|---|---|
| `pipeline_nodes` | `orchestration` | `QUEUE_CONCURRENCY` (5) | Runs one workflow node (text/image/translate/summarize/branch/adapt/merge/keyword-planner/intelligence — everything except video) |
| `pipeline_nodes_dlq` | `orchestration` | — (no processor) | Dead-letter sink for `pipeline_nodes` jobs that exhausted all retries. Admin-replayable. |
| `pipeline_nodes_video` | `orchestration` | — (no processor) | **Deprecated, drain-only.** Old single-queue video path; kept registered so any leftover jobs from before the two-phase split get cleaned up, never a target for new jobs. |
| `video_generate` | `orchestration` | `VIDEO_GENERATE_CONCURRENCY` (3) | Submits a video job to Sora or HeyGen (phase 1 of video generation) |
| `video_check` | `orchestration` | `VIDEO_CHECK_CONCURRENCY` (10) | Polls an in-flight video job until it completes/fails/times out (phase 2) |
| `news_trigger` | `news-trigger` | default (1) | Fetches trending news and drafts campaign content per Rule's news-trigger settings |
| `rednote-login` | `rednote` | `REDNOTE_LOGIN_CONCURRENCY` (2) | Drives a headless-Chromium QR login session against Xiaohongshu |
| `rednote-publish` | `rednote` | `REDNOTE_PUBLISH_CONCURRENCY` (1) | Drives a headless-Chromium publish flow — serialized to 1 by default because concurrent browser sessions per account are unsupported |

`pipeline_nodes`, `video_generate`, and `video_check` are the only queues that get **sharded** under `QUEUE_TENANT_ISOLATION` (§5) — they're the highest-volume, most contended queues and every job on them already carries `userId`. The others stay single global queues; they're either low-volume (`news_trigger`) or already self-limiting (RedNote's own concurrency=1 lock).

Not a BullMQ queue, but adjacent: `PIPELINE_EVENTS_BRIDGE` (`src/events/pipeline-events-bridge.service.ts`) is a **plain Redis pub/sub channel**, not a job queue — it fans out pipeline log/status events over Redis so a Socket.IO server in a different process from the worker can still push realtime updates to the browser. Don't confuse it with the queues above; it carries no retryable work, just notifications.

## 3. Pipeline node execution — the core flow

```
DependencyResolverService.enqueueReadyNodes(pipelineId)
  → walks the workflow DAG (workflow-graph.util.ts), finds nodes whose
    dependencies are all terminal (Completed/Skipped) and not lane-paused
  → enqueueNode(pipeline, nodeId) for each
      → builds a NodeJobPayload (userId, pipelineId, nodeId, nodeType, lane, ...)
      → picks pipeline_nodes or video_generate by node.type
      → dedupes via a deterministic jobId: `${pipelineId}__${nodeId}`
      → queue.add('run-node', payload, { jobId })

PipelineNodeProcessor.process(job)
  → PipelineNodeRunnerService.run(job.data)   — actually executes the node
  → DependencyResolverService.maybeFinalize(pipelineId)  — advances the DAG,
    enqueues newly-ready downstream nodes, finalizes the pipeline if done
```

**Job identity / dedup**: BullMQ job ids are built from `${pipelineId}__${nodeId}` (`__` because [BullMQ job ids can't contain `:`](https://docs.bullmq.io/), see `types/node-job.payload.ts`). `enqueueNode` checks for an existing active/waiting/delayed job with that id before adding a new one, so the same node is never double-queued.

**Retries**: every sharded queue's `defaultJobOptions` sets `attempts: QUEUE_MAX_ATTEMPTS` (2) with a fixed `QUEUE_RETRY_DELAY_MS` (3000ms) backoff, set once at queue registration in `orchestration.module.ts`. On the final failed attempt, `PipelineNodeProcessor` calls `PipelineNodeRunnerService.handleFinalFailure()` and pushes the job onto `pipeline_nodes_dlq` (`pipelineNodeDlqJobId`), where it sits until an admin replays it via `POST /admin/pipeline/jobs/replay` (`AdminPipelineJobsController`).

**Stall recovery**: `DependencyResolverService.reconcileStuckPipelines()` runs every 30s (`@Cron(EVERY_30_SECONDS)`, gated by `PIPELINE_RECONCILE_ENABLED`) and re-enqueues any `Running` pipeline's pending node whose dependencies are already satisfied — the safety net for a lost completion event (server restart mid-run, a Redis hiccup, an unclean worker shutdown). Same pass also recovers orphaned video-check polls (`reconcileOrphanedVideoChecks`) for video nodes stuck `Running` with an external job id but no live check job.

**Cancellation / cleanup**: `removeQueuedJobsForPipeline` / `removeQueuedJobsForNode` strip any still-waiting/delayed jobs for a pipeline or a single node (force-skip, cancel mid-run). Only waiting/delayed jobs are touched — an already-`active` job is left to finish, since `maybeFinalize` runs from inside that very job's `process()`.

## 4. Video generation — two-phase submit/poll

Video is split into two queues instead of one because submission (kick off a Sora/HeyGen job) and completion (wait for it) have completely different concurrency and timing profiles — you don't want 10 workers blocked holding open a 2-minute video render.

```
video_generate (VideoGenerateProcessor)
  → builds the generation input, calls Sora or HeyGen's submit API
  → computeVideoInitialDelayMs() picks a provider-aware first poll delay
  → enqueues onto video_check with that delay, jobId = `${pipelineId}__${nodeId}__check__0`

video_check (VideoCheckProcessor), repeated:
  → polls the provider
  → 'processing' → scheduleNextCheck() re-enqueues itself with checkCount+1
    and a provider-specific poll interval (videoPollIntervalMs)
  → 'completed' → MediaNodeCompletionService.completeVideoNode()
  → 'failed', or checkCount/wall-clock timeout exceeded → failVideoNode()
```

`POLL_CONFIG` (`types/queue.constants.ts`) holds the tunables: `VIDEO_POLL_MIN/MAX_INITIAL_DELAY_MS`, `VIDEO_POLL_INTERVAL_MS`, `VIDEO_POLL_MAX_CHECKS`, and HeyGen-specific overrides. A video node stuck `Running` with no live check job (lost delayed job after a restart) is recovered by the same 30s reconciler as pipeline nodes (§3).

## 5. Per-tenant queue sharding (`QUEUE_TENANT_ISOLATION`)

**The problem**: `pipeline_nodes`/`video_generate`/`video_check` are, by default, one global FIFO queue each with a hard concurrency cap (5/3/10) shared by every user. Nothing rate-limits or prioritizes per user — one account submitting a large pipeline (or several at once) can occupy every worker slot and delay everyone else's jobs sitting behind it in the same queue.

**The fix**: hash each user into one of a fixed number of *bucket* queues instead of a single global queue, so a noisy user's blast radius is contained to the ~1/`QUEUE_TENANT_BUCKETS` of users sharing their bucket — without the operational cost of a literal queue per user (see below for why that was rejected).

```
server/src/orchestration/queue-tenant.util.ts
  tenantQueueBucket(userId)        → SHA-256(userId) mod QUEUE_TENANT_BUCKETS → "b7"
  tenantPipelineQueueName(base, userId)
                                    → isolation off: base
                                    → isolation on:  `${base}__${bucket}`   (e.g. pipeline_nodes__b7)
  allQueueNamesForBase(base)       → isolation off: [base]
                                    → isolation on:  every `${base}__b0`.."__b{N-1}"
```

(`__` not `:` — BullMQ rejects `:` in queue names, since it's Redis's own key-namespace separator; this was caught by a real boot-test failure while building this.)

**Registration** (`orchestration.module.ts`): the `imports` array calls `allQueueNamesForBase()` for each of the three shardable base queues and spreads one `BullModule.registerQueueAsync()` per resulting name. NestJS/BullMQ queues are bound at application bootstrap, not created per-request, so every bucket has to be registered up front — there's no way to spin up a queue lazily the first time a new user shows up.

**Producing** (`TenantQueueService`, `src/orchestration/tenant-queue.service.ts`): since `@InjectQueue()` can only bind one statically-known queue name per constructor parameter, anything that needs to enqueue onto a sharded queue instead asks this service:
- `forUser(baseQueue, userId)` → resolves `tenantPipelineQueueName()` and looks up the matching `Queue` via `ModuleRef.get(getQueueToken(name), { strict: false })`.
- `all(baseQueue)` → every physical queue backing a base name, for sweeps that don't know which bucket a job landed in (pipeline cancel/cleanup, admin tooling).

Every enqueue call in the pipeline system — `enqueueNode`, the video-check submit/re-poll in the two video processors, the orphaned-check reconciler, and `AdminPipelineJobsController`'s DLQ replay — resolves its target queue by `userId`, not by a fixed injected `Queue`.

**Consuming** (the three processor classes): `@Processor` binds one class to one fixed queue name, which doesn't work for N dynamically-sized buckets. Instead, `PipelineNodeProcessor` / `VideoGenerateProcessor` / `VideoCheckProcessor` are plain `Injectable`s implementing `OnModuleInit`/`OnModuleDestroy` that loop over `allQueueNamesForBase()` and construct one raw `bullmq.Worker` per bucket in `onModuleInit()`, all calling the exact same `process()` method — and close every worker in `onModuleDestroy()`. With isolation off this collapses to exactly one `Worker`, identical to the old `@Processor`-based behavior.

**Enabling it**:
```bash
QUEUE_TENANT_ISOLATION=true
QUEUE_TENANT_BUCKETS=64   # same value on every process — API and worker alike
```
Every worker process opens one Redis connection per bucket-queue Worker it hosts (BullMQ workers each need a dedicated blocking connection) — at 64 buckets × 3 sharded queue types, that's up to 192 Redis connections per process. This is why isolation defaults to `false` and buckets default to a fixed, modest count rather than scaling with active users: **true one-queue-per-user was deliberately rejected** in favor of hashed bucket sharding, because (a) NestJS/BullMQ's queue+worker registration is static at bootstrap, not dynamic per request, so a literal per-user queue would mean abandoning `@InjectQueue`/`@Processor` for hand-rolled dynamic Queue/Worker lifecycle management, and (b) the system is sized for tens-to-low-hundreds of concurrently active pipelines (see `fleet-scale.md`'s worker HPA numbers), not thousands of users each needing individual isolation.

**What's excluded from sharding, deliberately**: `pipeline_nodes_dlq` (failure inspection doesn't need fairness) and `pipeline_nodes_video` (deprecated, drain-only) stay single global queues.

## 6. Other queues, briefly

- **`news_trigger`** (`src/news-trigger/`): one job per scheduled or manual news-check run. Triggered by `NewsTriggerCron` (per-Rule schedule) or `NewsTriggerManualService` ("Run now"). No tenant sharding — volume is low (one run per Rule per schedule tick, not per-request).
- **`rednote-login`** / **`rednote-publish`** (`src/rednote/`): drive real headless-Chromium sessions against Xiaohongshu's consumer web app (QR login, DOM-automated publish — see `rednote-chromium.md`). `RedNoteLockService` adds an explicit Redis lock on top of BullMQ concurrency, since even `concurrency: 1` within one process doesn't prevent two replicas from racing the same user's browser session.

## 7. Environment variable reference

| Var | Default | Effect |
|---|---|---|
| `ORCHESTRATION_USE_QUEUE` | `false` in code / `true` in `.env.example` | Queue-backed (BullMQ) vs. inline synchronous node execution |
| `RUN_WORKERS_IN_API` | `true` | Workers run in the API process vs. requiring a standalone `worker/main.ts` |
| `QUEUE_CONCURRENCY` | `5` | `pipeline_nodes` worker concurrency, per bucket |
| `QUEUE_MAX_ATTEMPTS` | `2` | Retry attempts before DLQ, `pipeline_nodes`/`video_generate` |
| `QUEUE_RETRY_DELAY_MS` | `3000` | Fixed backoff delay between attempts |
| `VIDEO_GENERATE_CONCURRENCY` | `3` | `video_generate` worker concurrency, per bucket |
| `VIDEO_CHECK_CONCURRENCY` | `10` | `video_check` worker concurrency, per bucket |
| `VIDEO_POLL_MIN/MAX_INITIAL_DELAY_MS`, `VIDEO_POLL_INTERVAL_MS`, `VIDEO_POLL_MAX_CHECKS` | see `queue.constants.ts` | Video polling cadence/timeout |
| `PIPELINE_RECONCILE_ENABLED` | `true` | 30s stuck-pipeline/orphaned-video-check sweep |
| `PIPELINE_RECONCILE_BATCH` | `200` | Max running pipelines scanned per reconcile tick |
| `QUEUE_TENANT_ISOLATION` | `false` | Shard `pipeline_nodes`/`video_generate`/`video_check` into bucket queues (§5) |
| `QUEUE_TENANT_BUCKETS` | `32`–`64` (default varies by call site) | Bucket count when isolation is on — must match across all processes |
| `REDNOTE_LOGIN_CONCURRENCY` | `2` | `rednote-login` worker concurrency |
| `REDNOTE_PUBLISH_CONCURRENCY` | `1` | `rednote-publish` worker concurrency — keep at 1 unless you've verified concurrent browser sessions are safe |
| `PIPELINE_EVENTS_BRIDGE` | `true` | Cross-process realtime event fan-out (not a queue, see §2) |

## 8. File map

```
src/orchestration/
  orchestration.module.ts          queue registration (incl. sharded bucket generation)
  dependency-resolver.service.ts   DAG walk, enqueueNode, reconciler, cleanup
  queue-tenant.util.ts             bucket hashing + name generation
  tenant-queue.service.ts          runtime queue lookup by userId
  types/node-job.payload.ts        NodeJobPayload, pipeline_nodes/DLQ names, job-id helpers
  types/queue.constants.ts         QUEUES map, video poll timing config
  processors/
    pipeline-node.processor.ts     pipeline_nodes workers
    video-generate.processor.ts    video_generate workers
    video-check.processor.ts       video_check workers
src/admin/controllers/admin-pipeline-jobs.controller.ts   DLQ inspection/replay
src/news-trigger/                  news_trigger queue + processor
src/rednote/                       rednote-login / rednote-publish queues + processors
src/worker/main.ts, worker.module.ts   standalone worker process entrypoint
src/events/pipeline-events-bridge.service.ts   realtime event fan-out (not BullMQ)
docs/worker-deployment.md          how to actually deploy/scale the worker process
docs/fleet-scale.md                Kubernetes layout, HPA, tenant-bucket ops notes
```
