# TaskGid API Documentation

**Version:** 1.0.0  
**Contact:** realabdullah  
**License:** ISC

## Servers

- Development: `http://localhost:3000`
- Production: `https://taskgidapi.abdspace.xyz`

---

## Authentication

All protected endpoints require a Bearer JWT token in the `Authorization` header:


### Security Scheme

- **Type:** HTTP Bearer
- **Format:** JWT

---

## Schemas

### Error

- `error` (string): Error message
- `success` (boolean, default: false)

### User

- `id` (uuid)
- `email` (email)
- `firstName` (string)
- `lastName` (string)
- `username` (string)
- `profilePicture` (string, nullable)
- `title` (string, nullable)
- `about` (string, nullable)
- `location` (string, nullable)
- `role` (string: user, admin)
- `createdAt` (date-time)
- `updatedAt` (date-time)

### Workspace

- `id` (uuid)
- `name` (string)
- `slug` (string)
- `description` (string, nullable)
- `createdAt` (date-time)
- `updatedAt` (date-time)

### Task

- `id` (uuid)
- `title` (string)
- `description` (string, nullable)
- `status` (string: todo, in_progress, done)
- `priority` (string: low, medium, high)
- `dueDate` (date-time, nullable)
- `workspaceId` (uuid)
- `assignees` (array of users)
- `createdAt` (date-time)
- `updatedAt` (date-time)

### Comment

- `id` (uuid)
- `content` (string)
- `taskId` (uuid)
- `userId` (uuid)
- `createdAt` (date-time)
- `updatedAt` (date-time)

### Attachment

- `id` (uuid)
- `filename` (string)
- `originalname` (string)
- `mimetype` (string)
- `size` (integer)
- `path` (string)
- `url` (string)
- `storageType` (string)
- `userId` (uuid)
- `taskId` (uuid, nullable)
- `commentId` (uuid, nullable)
- `createdAt` (date-time)
- `updatedAt` (date-time)

### Statistics

- `tasksByStatus`: { `todo`, `in_progress`, `done` } (integer)
- `tasksByPriority`: { `low`, `medium`, `high` } (integer)
- `completionRate` (float)
- `teamMemberCount` (integer)

---

## Endpoints

### Authentication

#### Register

- **POST** `/auth/register`
- **Request Body:**  
  - `email` (email, required)  
  - `password` (string, min 8, required)  
  - `firstName` (string, required)  
  - `lastName` (string, required)  
  - `username` (string, pattern: `^[a-zA-Z0-9_]+$`, required)
- **Responses:**  
  - `201`: User registered, returns user and accessToken  
  - `400`: Invalid input  
  - `500`: Server error

#### Login

- **POST** `/auth/login`
- **Request Body:**  
  - `email` (email, required)  
  - `password` (string, required)
- **Responses:**  
  - `200`: Login successful, returns user, accessToken, refreshToken  
  - `401`: Invalid credentials

#### Logout

- **POST** `/auth/logout`
- **Security:** Bearer
- **Responses:**  
  - `200`: Logout successful  
  - `500`: Server error

#### Refresh Token

- **POST** `/auth/refresh`
- **Request Body:**  
  - `refreshToken` (string, required)
- **Responses:**  
  - `200`: Token refreshed  
  - `401`: Invalid refresh token

#### WebAuthn

- **POST** `/auth/authn/request-login`  
  - Request WebAuthn login options  
- **POST** `/auth/authn/login`  
  - Complete WebAuthn login  
- **POST** `/auth/authn/register`  
  - Register a new WebAuthn credential (Bearer required)  
- **POST** `/auth/authn/verify-registration`  
  - Verify WebAuthn registration (Bearer required)

---

### Users

#### Get Current User

- **GET** `/users`
- **Security:** Bearer
- **Responses:**  
  - `200`: User profile  
  - `404`: User not found

#### Get/Update Profile

- **GET** `/users/profile`
- **PUT** `/users/profile`
- **Security:** Bearer
- **PUT Request Body:**  
  - `firstName`, `lastName`, `title`, `about`, `location`
- **Responses:**  
  - `200`: Profile retrieved/updated  
  - `400`: Invalid input  
  - `404`: Profile not found

#### Upload Profile Picture

- **POST** `/users/profile/picture`
- **Security:** Bearer
- **Request:** `multipart/form-data` with `file`
- **Responses:**  
  - `200`: Picture uploaded  
  - `400`: Invalid file

---

### Workspaces

#### List/Create

- **GET** `/workspaces`
- **POST** `/workspaces`
- **Security:** Bearer
- **POST Request Body:**  
  - `name` (string, required)  
  - `description` (string, optional)
- **Responses:**  
  - `200`: Workspaces retrieved  
  - `201`: Workspace created  
  - `400`: Invalid input  
  - `500`: Server error

#### Workspace by Slug

- **GET/PUT/DELETE** `/workspaces/{slug}`
- **Security:** Bearer
- **PUT Request Body:**  
  - `name`, `description`
- **Responses:**  
  - `200`: Workspace retrieved/updated/deleted  
  - `404`: Workspace not found

---

### Tasks

#### List/Create

- **GET** `/workspaces/{slug}/tasks`
- **POST** `/workspaces/{slug}/tasks`
- **Security:** Bearer
- **POST Request Body:**  
  - `title` (required), `description`, `status`, `priority`, `dueDate`, `assigneeId`
- **Responses:**  
  - `200`: Tasks retrieved  
  - `201`: Task created  
  - `400`: Invalid input  
  - `404`: Workspace not found

#### Task by ID

- **GET/PUT/DELETE** `/workspaces/{slug}/tasks/{taskId}`
- **Security:** Bearer
- **PUT Request Body:**  
  - Any task property
- **Responses:**  
  - `200`: Task retrieved/updated/deleted  
  - `404`: Task not found

---

### Comments

#### List/Create

- **GET** `/tasks/{taskId}/comments`
- **POST** `/tasks/{taskId}/comments`
- **Security:** Bearer
- **POST Request Body:**  
  - `content` (string, required)
- **Responses:**  
  - `200`: Comments retrieved  
  - `201`: Comment created  
  - `400`: Invalid input  
  - `404`: Task not found

#### Comment by ID

- **GET/PUT/DELETE** `/tasks/{taskId}/comments/{commentId}`
- **Security:** Bearer
- **PUT Request Body:**  
  - `content` (string, required)
- **Responses:**  
  - `200`: Comment retrieved/updated/deleted  
  - `404`: Comment not found

---

### Attachments

#### List/Create

- **GET** `/tasks/{taskId}/attachments`
- **POST** `/tasks/{taskId}/attachments`
- **Security:** Bearer
- **POST Request:** `multipart/form-data` with `file`
- **Responses:**  
  - `200`: Attachments retrieved  
  - `201`: Attachment uploaded  
  - `400`: Invalid file  
  - `404`: Task not found

#### Attachment by ID

- **GET/DELETE** `/attachments/{attachmentId}`
- **Security:** Bearer
- **Responses:**  
  - `200`: Attachment retrieved/deleted  
  - `404`: Attachment not found

---

### Statistics

- **GET** `/workspaces/{slug}/statistics`
- **Security:** Bearer
- **Description:** Get workspace statistics (tasks by status/priority, completion rate, team member count)
- **Responses:**  
  - `200`: Statistics retrieved  
  - `404`: Workspace not found

---

## Error Handling

All error responses follow the `Error` schema, providing an error message and a `success: false` flag.

---

For further details, refer to the OpenAPI YAML specification or contact the API maintainer.