# TaskGid API

Task management API built with Node.js, Express, Sequelize, and PostgreSQL.

## Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL

## Setup

```
git clone https://github.com/realabdullah/taskgid-api.git
cd taskgid-api
pnpm install
cp .env.example .env
```

Fill in `.env`. `DATABASE_URL` wins over the discrete `DB_*` variables when
both are set (see `src/config/config.cjs`). Every other variable is optional —
the feature it configures is disabled without it, not broken.

Create the database, then apply migrations:

```
createdb taskgid
pnpm db:migrate
```

## Running

```
pnpm dev     # development, with reload
pnpm start   # production
```

## Database schema

Migrations in `migrations/` are the source of truth. They run before the
server starts on deploy (see the `CMD` in `Dockerfile`) — `sequelize.sync()`
creates missing tables but never missing columns, so booting first would fail
on the first query against a new one.

```
pnpm db:migrate         # apply
pnpm db:migrate:down     # roll back the last migration
```

`scripts/migration-helpers.cjs` provides `addColumnIfMissing`,
`createTableIfMissing`, and similar guards; new migrations should use them
rather than a bare `addColumn`/`createTable`, since this database predates
migrations and may already have the object.

`pnpm db:sync` / `pnpm db:sync:force` sync models directly for local
development. `:force` drops and recreates every table.

## Realtime

`src/services/workspaceEvents.js` publishes `task.created`, `task.updated`,
`task.deleted`, and `comment.created` to Pusher on the `private-workspace-{id}`
channel. `POST /api/pusher/auth` authorizes subscriptions against workspace
membership. Without `PUSHER_*` credentials configured, publishing is a no-op.

`PUSHER_HOST`, `PUSHER_PORT`, and `PUSHER_USE_TLS` point the client at any
Pusher-protocol-compatible server instead of Pusher's own.

## Webhooks

The same four events also persist to `workspace_events`, in the same
transaction as the row change they describe, and queue a delivery for every
active endpoint a workspace has configured. The first attempt fires
synchronously, right after that transaction commits; a failed attempt retries
on the backoff schedule in `src/services/webhookService.js`, driven by
`pnpm webhooks:retry`.

Endpoint URLs must be `https` and cannot point at a private, loopback, or
link-local address — a workspace member's webhook URL is a server-side
outbound request target, so this only guards against the address given at
creation time, not one a hostname later resolves to.

Deliveries are signed: `X-Taskgid-Signature: t=<unix seconds>,v1=<hex>`, where
the hex value is `HMAC-SHA256(secret, "{timestamp}.{body}")`. `X-Taskgid-Delivery`
carries a stable id across retries of the same delivery, for deduplication.

Managed at `/workspaces/:workspaceSlug/webhooks`, admin or creator only:

- `GET /` — list endpoints, without secrets
- `POST /` — create; response carries the signing secret once
- `PATCH /:id` — update url, description, subscribed events, or active state
- `POST /:id/rotate-secret` — issue a new secret, invalidating the old one
- `DELETE /:id` — remove, along with its delivery history
- `GET /:id/deliveries` — paginated delivery log

## Scheduled jobs

| Job | Command | Schedule |
| --- | --- | --- |
| Digest emails | `pnpm digests:send` | Not currently scheduled |
| Recurring task spawner | `pnpm recurrences:spawn` | `.github/workflows/spawn-recurrences.yml`, daily |
| Webhook delivery retries | `pnpm webhooks:retry` | `.github/workflows/retry-webhook-deliveries.yml`, manual trigger only |

Each reads due work based on its own time zone or watermark, so a run that
happens late catches up and a run that happens twice is a no-op.

These workflows need `DATABASE_URL` on the **Production** GitHub environment;
a job must declare `environment: Production` to receive it.

## Calendar feed

`GET /calendar/:token.ics` serves one user's tasks with a due date as a
read-only iCalendar feed. The token is the credential; only its hash is
stored. Manage it while authenticated:

- `GET /users/calendar-feed` → `{enabled}`
- `POST /users/calendar-feed` → generates or rotates the token, returning
  `{url}` once
- `DELETE /users/calendar-feed` → revokes it

`PUBLIC_API_URL` sets the origin used to build the feed URL.

## API keys

A key authenticates as its issuer, with that user's role, but only within the
one workspace it was created in — a key for workspace A is rejected against
workspace B even if the same user belongs to both. Send it the same way as a
session token: `Authorization: Bearer tg_key_...`.

Managed at `/workspaces/:workspaceSlug/api-keys`, by any member for
themselves:

- `GET /` — an admin or the creator sees every key; anyone else sees only
  their own
- `POST /` — create; response carries the raw key once
- `DELETE /:id` — revoke; the owner or a workspace admin can revoke any key

## Notifications

- **In-app / push** — Novu, configured via `NOVU_API_KEY`.
- **Realtime** — Pusher, see above.
- **Email** — ZeptoMail first, falling back to Resend, via
  `ZEPTO_MAIL_TOKEN` / `RESEND_API_KEY`.

## API documentation

`/api-docs` serves `swagger-output.json`, generated from the actual routes by
`pnpm docs:generate`. `openapi.yaml` holds the shared schemas, parameters, and
security schemes the generator reuses — including `apiKeyAuth`, for
authenticating as a workspace-scoped API key instead of a session — and does
not itself list every path. Run `pnpm docs:generate` after adding or changing
a route, and commit the result.

## License

ISC
