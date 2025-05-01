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

## License

ISC 