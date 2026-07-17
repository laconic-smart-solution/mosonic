# Scheduler service

Spring Boot microservice that stores delayed jobs and fires them over **Redis pub/sub**. Nest owns business handling (e.g. Zernio publish); this service owns timing only.

## Stack

- Java 21, Spring Boot 4.1
- PostgreSQL + JPA (`scheduled_events`)
- Redis pub/sub channel `mosonic:scheduler:events` (configurable)
- Shared secret: `X-Scheduler-API-Key`
- AOP logging via `@Loggable` on API + create/reschedule/cancel (enter/exit/duration/errors)

## Setup

```bash
cp .env.example .env
./mvnw spring-boot:run
```

On Windows:

```bat
copy .env.example .env
run.bat
```

`run.bat` loads `.env`, frees the configured port, then runs `mvnw.cmd spring-boot:run`.

Default port: **8003**

## Environment

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | JDBC URL |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | DB credentials |
| `SCHEDULER_API_KEY` | Shared secret with Nest `SCHEDULER_API_KEY` |
| `SCHEDULER_PORT` | HTTP port (default 8003) |
| `SCHEDULER_DEFAULT_TIMEZONE` | Used when create omits timezone (default `UTC`) |
| `SCHEDULER_POLL_INTERVAL_MS` | Due-job poll interval (default 5000) |
| `SCHEDULER_REDIS_CHANNEL` | Pub/sub channel |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis connection |

## API

All `/api/v1/*` routes require header `X-Scheduler-API-Key`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/events` | Create (replaces any PENDING for same `eventType`+`refId`) |
| PUT | `/api/v1/events/{eventType}/{refId}` | Reschedule PENDING job |
| DELETE | `/api/v1/events/{eventType}/{refId}` | Cancel PENDING job |

### Create body

```json
{
  "eventType": "SOCIAL_PUBLISH",
  "refId": "<Post.postId>",
  "runAt": "2026-07-17T12:00:00Z",
  "timezone": "UTC"
}
```

### Redis payload (when due)

```json
{
  "jobId": "…",
  "eventType": "SOCIAL_PUBLISH",
  "refId": "…",
  "timezone": "UTC",
  "runAt": "2026-07-17T12:00:00Z"
}
```

Health: `GET /actuator/health` (no API key)

## Flow

```
Nest schedule upload → Zernio draft (no scheduledFor)
                     → POST /api/v1/events (SOCIAL_PUBLISH, postId)
Poller → claim PENDING due → Redis publish
Nest subscriber → Zernio publishNow → webhooks update local status
```
