# Payment service

Spring Boot microservice for **credit topup plan** catalog. Nest proxies all calls with a shared API key; the browser never talks to this service directly.

## Stack

- Java 21, Spring Boot 4.1
- PostgreSQL + JPA schema update (`ddl-auto: update`)
- Shared secret: `X-Payment-API-Key`

## Setup

```bash
cp .env.example .env
# Set DATABASE_URL (JDBC), PAYMENT_API_KEY (same as server)
./mvnw spring-boot:run
```

Default port: **8002**

## Environment

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | JDBC URL, e.g. `jdbc:postgresql://host:5432/mosonic_dev_db` |
| `DATABASE_USERNAME` | DB user (optional if in URL) |
| `DATABASE_PASSWORD` | DB password |
| `PAYMENT_API_KEY` | Shared secret with Nest `PAYMENT_API_KEY` |
| `PAYMENT_PORT` | HTTP port (default 8002) |

## API

All `/api/v1/*` routes require header `X-Payment-API-Key`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/topup-plans?activeOnly=true` | List plans |
| GET | `/api/v1/topup-plans/{code}` | Get plan |
| POST | `/api/v1/topup-plans` | Create plan |
| PUT | `/api/v1/topup-plans/{code}` | Update plan |
| PATCH | `/api/v1/topup-plans/{code}/active` | Enable/disable |

Health: `GET /actuator/health` (no API key)

## Flow

```
Client → Nest (JWT) → Payment (API key) → PostgreSQL
```

User topup still grants credits in Nest; Payment only owns the **plan catalog** (credits, prices, labels).

On first startup, if `topup_plans` is empty, default packages (starter / growth / scale) are seeded automatically.
