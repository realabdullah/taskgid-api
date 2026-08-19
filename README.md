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

## Scheduled jobs

| Job | Command | Schedule |
| --- | --- | --- |
| Digest emails | `pnpm digests:send` | Not currently scheduled |
| Recurring task spawner | `pnpm recurrences:spawn` | `.github/workflows/spawn-recurrences.yml`, daily |

Both read due work based on each record's own time zone or watermark, so a
run that happens late catches up and a run that happens twice is a no-op.

The recurrence workflow needs `DATABASE_URL` on the **Production** GitHub
environment; a job must declare `environment: Production` to receive it.

## Notifications

- **In-app / push** — Novu, configured via `NOVU_API_KEY`.
- **Realtime** — Pusher, see above.
- **Email** — ZeptoMail first, falling back to Resend, via
  `ZEPTO_MAIL_TOKEN` / `RESEND_API_KEY`.

## API documentation

`openapi.yaml` is the OpenAPI specification. With the server running, an
interactive version is at `/api-docs`.

## License

ISC
