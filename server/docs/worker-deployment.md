# Pipeline worker deployment

## Layout

| Process | Command | Role |
| ------- | ------- | ---- |
| API | `yarn start:prod` | HTTP, WebSocket, optional BullMQ processors |
| Worker | `yarn build && yarn start:worker` | BullMQ processors only |

## Environment

```bash
# API: disable in-process workers when a dedicated worker runs
RUN_WORKERS_IN_API=false

# Worker: always processes jobs (set in worker/main.ts)
# REDIS_HOST / REDIS_PORT or REDIS_URL

# WebSocket log bridge (required when workers are separate)
PIPELINE_EVENTS_BRIDGE=true
REDIS_URL=redis://127.0.0.1:6379

# Optional tenant queue buckets (requires matching worker registration)
QUEUE_TENANT_ISOLATION=false
QUEUE_TENANT_BUCKETS=32

# Lane-scoped pause (other lanes continue after lane failure)
LANE_SCOPED_PAUSE=false

# Closed-loop analytics
ANALYTICS_AUTO_SUGGEST_AFTER_PULL=false

# Two-phase video (submit + poll queues)
VIDEO_GENERATE_CONCURRENCY=3
VIDEO_CHECK_CONCURRENCY=10
VIDEO_POLL_INITIAL_DELAY_MS=60000
VIDEO_POLL_INTERVAL_MS=30000
VIDEO_POLL_MAX_CHECKS=58
```

## Health

- Worker logs `Pipeline worker started` on boot.
- Verify Redis: worker and API share the same Redis instance.
- Trigger a pipeline run; node events should appear in the UI via `pipeline:logs` pub/sub.

## Production checklist

1. Deploy API with `RUN_WORKERS_IN_API=false`.
2. Deploy one or more worker replicas with `start:worker`.
3. Set `REDIS_URL` on both.
4. Scale workers horizontally; BullMQ coordinates job consumption.
