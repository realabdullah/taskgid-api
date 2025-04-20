# TaskGid API Documentation

## Table of Contents
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [Authentication](#authentication-1)
  - [User Management](#user-management)
  - [Workspace Management](#workspace-management)
  - [Task Management](#task-management)
  - [File Attachments](#file-attachments)
  - [Notifications](#notifications)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)
- [WebSocket Events](#websocket-events)
- [Best Practices](#best-practices)

## Base URL
```
http://localhost:8000/api
```

## Authentication
All endpoints except registration and login require authentication using a Bearer token.

**Headers:**
```
Authorization: Bearer <access_token>
```

## Endpoints

### Authentication

#### Register User
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "string",
  "password": "string",
  "firstName": "string",
  "lastName": "string",
  "username": "string" // optional
}
```

**Validation Rules:**
- Email: Valid email format
- Password: Minimum 8 characters, must contain uppercase, lowercase, number, and special character
- First Name: 1-50 characters
- Last Name: 1-50 characters
- Username (optional): 3-30 characters, alphanumeric with underscores and hyphens

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "string",
      "firstName": "string",
      "lastName": "string",
      "username": "string"
    },
    "token": "string"
  }
}
```

#### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "string",
    "user": {
      "id": "uuid",
      "email": "string",
      "firstName": "string",
      "lastName": "string",
      "username": "string"
    }
  }
}
```

#### Logout
```http
POST /auth/logout
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### User Management

#### Get User Profile
```http
GET /users/profile
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "username": "string",
    "profilePicture": "string"
  }
}
```

#### Update User Profile
```http
PUT /users/profile
```

**Request Body:**
```json
{
  "firstName": "string",
  "lastName": "string",
  "username": "string",
  "email": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "username": "string"
  }
}
```

#### Update Profile Picture
```http
PUT /users/profile/picture
```

**Request Body:**
```json
{
  "profilePicture": "base64_string"
}
```

**Validation Rules:**
- Must be a valid base64 image string
- Must start with a valid image data URL

### Workspace Management

#### Create Workspace
```http
POST /workspaces
```

**Request Body:**
```json
{
  "title": "string",
  "slug": "string",
  "description": "string",
  "team": [
    {
      "email": "string"
    }
  ]
}
```

**Validation Rules:**
- Title: 1-100 characters
- Slug: 3-50 characters, lowercase letters, numbers, and hyphens only
- Description: Optional, max 500 characters
- Team: Optional array of email addresses

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "string",
    "slug": "string",
    "description": "string",
    "team": [
      {
        "id": "uuid",
        "email": "string",
        "firstName": "string",
        "lastName": "string"
      }
    ]
  }
}
```

#### Get Workspace
```http
GET /workspaces/:slug
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "string",
    "slug": "string",
    "description": "string",
    "team": [
      {
        "id": "uuid",
        "email": "string",
        "firstName": "string",
        "lastName": "string",
        "isAdmin": boolean
      }
    ]
  }
}
```

#### Update Workspace
```http
PUT /workspaces/:slug
```

**Request Body:**
```json
{
  "title": "string",
  "description": "string"
}
```

#### Delete Workspace
```http
DELETE /workspaces/:slug
```

### Task Management

#### Create Task
```http
POST /workspaces/:slug/tasks
```

**Request Body:**
```json
{
  "title": "string",
  "description": "string",
  "dueDate": "ISO8601 date",
  "priority": "low" | "medium" | "high",
  "status": "todo" | "in_progress" | "done",
  "assignees": ["uuid"]
}
```

**Validation Rules:**
- Title: 1-200 characters
- Description: Optional, max 1000 characters
- Due Date: Optional, valid ISO 8601 date
- Priority: Optional, one of: low, medium, high
- Status: Optional, one of: todo, in_progress, done
- Assignees: Optional array of user UUIDs

#### Update Task
```http
PUT /workspaces/:slug/tasks/:id
```

**Request Body:** Same as Create Task

#### Delete Task
```http
DELETE /workspaces/:slug/tasks/:id
```

### File Attachments

#### Upload Task Attachment
```http
POST /workspaces/:id/tasks/:taskId/attachments
```

**Request:**
- Content-Type: multipart/form-data
- File field name: "file"

**Validation Rules:**
- Max file size: 10MB
- Allowed file types:
  - Images: JPEG, PNG, GIF, WebP
  - Documents: PDF, DOC, DOCX, XLS, XLSX
  - Text: TXT, CSV

#### Upload Comment Attachment
```http
POST /workspaces/:id/comments/:commentId/attachments
```

Same validation rules as Task Attachment

#### Delete Attachment
```http
DELETE /attachments/:attachmentId
```

### Notifications

#### Get User Notifications
```http
GET /notifications/:userId
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "string",
      "message": "string",
      "read": boolean,
      "createdAt": "ISO8601 date"
    }
  ]
}
```

#### Add Notification
```http
POST /notifications
```

**Request Body:**
```json
{
  "userId": "uuid",
  "type": "string",
  "message": "string"
}
```

#### Delete Notification
```http
DELETE /notifications/:id
```

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "success": false,
  "errors": [
    {
      "field": "string",
      "message": "string"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authorization header missing or invalid format"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "You do not have permission to perform this action"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "An internal server error occurred"
}
```

## Rate Limiting

Authentication endpoints are rate-limited to prevent abuse. The current limits are:
- 5 requests per minute for registration
- 10 requests per minute for login
- 5 requests per minute for WebAuthn operations

## WebSocket Events

The API also supports real-time updates through WebSocket connections. Connect to:
```
ws://localhost:8000/ws
```

### Available Events:
- `task:created`
- `task:updated`
- `task:deleted`
- `comment:created`
- `notification:created`

## Best Practices

1. **Error Handling:**
   - Always check the `success` field in responses
   - Handle validation errors by displaying field-specific messages
   - Implement proper error boundaries in your frontend

2. **Authentication:**
   - Store the JWT token securely (e.g., in HttpOnly cookies)
   - Implement token refresh logic
   - Handle 401 responses by redirecting to login

3. **File Uploads:**
   - Implement client-side file size validation
   - Show upload progress indicators
   - Handle upload errors gracefully

4. **Real-time Updates:**
   - Implement WebSocket reconnection logic
   - Handle connection errors
   - Update UI optimistically when possible

5. **Performance:**
   - Implement proper caching strategies
   - Use pagination for list endpoints
   - Implement request debouncing where appropriate 