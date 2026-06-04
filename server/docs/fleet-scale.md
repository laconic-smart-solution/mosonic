# Fleet scale (Phase 5)

## Queue sharding

Set `QUEUE_TENANT_ISOLATION=true` and `QUEUE_TENANT_BUCKETS=64`. Job routing uses `tenantQueueBucket(userId)` from `queue-tenant.util.ts`.

Workers must register all bucket queues (`pipeline_nodes:b0` … `pipeline_nodes:b63`) or run with shared queues in development.

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
