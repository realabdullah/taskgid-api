# TaskGid API

TaskGid API is a task management application built with Node.js, Express, and PostgreSQL.

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database

## Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/taskgid-api.git
   cd taskgid-api
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   # Server
   PORT=3000
   NODE_ENV=development

   # Database
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=taskgid
   DB_USER=your_username
   DB_PASSWORD=your_password

   # JWT
   JWT_SECRET=your_jwt_secret
   ACCESS_TOKEN_EXPIRY=1h

   # WebAuthn
   RPNAME=TaskGid
   RPDOMAIN=localhost
   RPORIGIN=http://localhost:3000

   # Client URL
   CLIENT_URL=http://localhost:3000

   # Notification Providers
   PUSHER_APP_ID=your_app_id
   PUSHER_KEY=your_key
   PUSHER_SECRET=your_secret
   PUSHER_CLUSTER=your_cluster
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_CLIENT_EMAIL=your_client_email
   FIREBASE_PRIVATE_KEY=your_private_key
   KNOCK_API_KEY=your_knock_api_key
   NOTIFICATION_PROVIDER=pusher
   ```

4. Create the database:
   
   If you have PostgreSQL command-line tools installed:
   ```
   createdb taskgid
   ```
   
   Alternatively, you can create the database using psql:
   ```
   psql -U postgres
   CREATE DATABASE taskgid;
   \q
   ```
   
   Or using a GUI tool like pgAdmin, DBeaver, or TablePlus.

5. Sync the database with the models:
   ```
   npm run db:sync
   ```

## Running the Application

### Development Mode
```
npm run dev
```

### Production Mode
```
npm start
```

## Database schema

Migrations are the source of truth for schema changes and run automatically on
deploy, before the server starts (see the `CMD` in the Dockerfile). Order
matters: `sequelize.sync()` creates missing **tables** but never missing
**columns**, so booting first leaves a new column absent and fails on the first
query that selects it.

Apply migrations by hand with:
```
npm run db:migrate
```

Migrations are written to be safe against a database that `sync()` built before
migrations were introduced — see `scripts/migration-helpers.cjs`. They check
before they add, so the same set applies cleanly to a fresh database and to one
that already has the objects.

To sync the models directly (development convenience, not a substitute for a
migration):
```
npm run db:sync
```

To force sync (drops all tables and recreates them — destroys data):
```
npm run db:sync:force
```

## Realtime

Workspace events (`task.created`, `task.updated`, `task.deleted`,
`comment.created`) are published to Pusher by
`src/services/workspaceEvents.js`. The persistent connection lives on Pusher, so
this API only makes a stateless HTTP call — which is what lets realtime work on
Vercel, where a function cannot hold a stream open.

Subscription is authorised by `POST /api/pusher/auth` against real workspace
membership, so a member of one workspace cannot subscribe to another's channel.
Anything not explicitly recognised is refused.

Without `PUSHER_*` credentials, publishing is a silent no-op and the frontend
falls back to refetch-on-window-focus. Realtime is an enhancement, never a
correctness requirement.

`PUSHER_HOST`, `PUSHER_PORT` and `PUSHER_USE_TLS` point the client at any
Pusher-protocol server — a self-hosted Sockudo or Soketi — without an
application code change.

## Scheduled jobs

Digest emails are built and gated by user preferences and timezone, but nothing
sends them until something calls the runner. Schedule it hourly; it works out
who is due based on each recipient's local time, so an hourly run is enough for
every timezone:

```
0 * * * *  cd /path/to/taskgid-api && npm run digests:send
```

On Vercel this is a Cron Job hitting a route that calls the runner, or any
external scheduler invoking `npm run digests:send`. Running it inside the API
process is deliberately avoided so a restart or a second instance cannot
double-send.

## API Documentation

API documentation is available in OpenAPI format. You can view it in the following ways:

1. See the [openapi.yaml](openapi.yaml) file for the OpenAPI specification
2. When the server is running, visit `/api-docs` for an interactive documentation interface

## Notification Providers

TaskGid supports multiple notification providers, with one provider active at a time:

### Pusher
For real-time notifications, configure your Pusher credentials in your .env file:
```
PUSHER_APP_ID=your_app_id
PUSHER_KEY=your_key
PUSHER_SECRET=your_secret
PUSHER_CLUSTER=your_cluster
```

### Firebase Cloud Messaging (FCM)
For mobile push notifications, configure your Firebase credentials in your .env file:
```
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY=your_private_key
```

### Knock Labs
For multi-channel notification orchestration, configure your Knock credentials in your .env file:
```
KNOCK_API_KEY=your_knock_api_key
```

To use Knock Labs:
1. Create an account at [knock.app](https://knock.app)
2. Set up workflows in the Knock dashboard for each event type
3. Configure your .env file with your Knock API key
4. Set the `NOTIFICATION_PROVIDER` to `knock` to use Knock as the provider

You can set the active notification provider in your .env file:
```
# Options: pusher, firebase, knock
NOTIFICATION_PROVIDER=pusher
```

## License

ISC 