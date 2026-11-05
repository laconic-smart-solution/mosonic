# Fleet scale (Phase 5)

## Queue sharding

Set `QUEUE_TENANT_ISOLATION=true` and `QUEUE_TENANT_BUCKETS=64`. `pipeline_nodes`, `video_generate` and `video_check` are then each sharded into 64 bucket queues (`pipeline_nodes__b0` … `pipeline_nodes__b63`, etc — `__` not `:`, since BullMQ queue names can't contain `:`), hashed per userId via `tenantQueueBucket()`/`tenantPipelineQueueName()` in `queue-tenant.util.ts`. This isolates a noisy user's backlog to the ~1/64th of users sharing their bucket, without the cost of a literal queue per user.

Every bucket queue and its worker is registered automatically at boot from `allQueueNamesForBase()` (`orchestration.module.ts` for queue registration, the three processor classes' `onModuleInit` for workers) — no manual per-bucket wiring needed, in either the API process or the standalone `worker/main.ts` process. Leave `QUEUE_TENANT_ISOLATION=false` (default) for local dev to keep a single shared queue.

## Kubernetes layout

| Deployment | Replicas | Notes |
|------------|----------|-------|
| `neutral-tex-api` | 2+ | `RUN_WORKERS_IN_API=false` |
| `neutral-tex-worker` | 2–10 HPA | CPU + queue depth |
| `neutral-tex-worker-video` | 1–3 | `VIDEO_GENERATE_CONCURRENCY=3`, `VIDEO_CHECK_CONCURRENCY=10` |
| `neutral-tex-scheduler` | 1 | Campaign cron in API or dedicated |

## HPA example

Scale workers when Redis queue waiting jobs exceed threshold (custom metric exporter recommended).

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: neutral-tex-worker
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: neutral-tex-worker
  minReplicas: 2
  maxReplicas: 12
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Environment

- `WORKER_REPLICAS_MIN` / `WORKER_REPLICAS_MAX` — documentation targets for Helm values
- `CAMPAIGN_AUTONOMY_ENABLED` — global kill switch for autonomous publish
