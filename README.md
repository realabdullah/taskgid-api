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

## Database Synchronization

To sync the database with the models:
```
npm run db:sync
```

To force sync the database (drops all tables and recreates them):
```
npm run db:sync:force
```

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