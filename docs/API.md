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

#### Refresh Token
```http
POST /auth/refresh
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "string"
  }
}
```

#### WebAuthn Registration Options
```http
GET /users/authn/options
```

**Response:**
```json
{
  "success": true,
  "data": {
    "options": {
      "challenge": "string",
      "rpName": "string",
      "rpID": "string",
      "userID": "string",
      "userName": "string",
      "timeout": 60000,
      "attestation": "direct",
      "authenticatorSelection": {
        "userVerification": "required",
        "residentKey": "required"
      },
      "excludeCredentials": []
    }
  }
}
```

#### WebAuthn Registration Verification
```http
POST /users/authn/verify
```

**Request Body:**
```json
{
  "credential": {
    "id": "string",
    "rawId": "string",
    "response": {
      "attestationObject": "string",
      "clientDataJSON": "string"
    },
    "type": "public-key"
  },
  "expectedChallenge": "string",
  "expectedOrigin": "string",
  "expectedRPID": "string",
  "device": "string"
}
```

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
    "accessToken": {
      "token": "string",
      "expiresIn": 3600
    },
    "message": "Authenticator registered successfully"
  }
}
```

#### WebAuthn Login Request
```http
POST /auth/authn/request-login
```

**Request Body:**
```json
{
  "email": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "options": {
      "challenge": "string",
      "rpID": "string",
      "allowCredentials": [],
      "userVerification": "required",
      "timeout": 60000
    }
  }
}
```

#### WebAuthn Login Verification
```http
POST /auth/authn/verify
```

**Request Body:**
```json
{
  "credential": {
    "id": "string",
    "rawId": "string",
    "response": {
      "authenticatorData": "string",
      "clientDataJSON": "string",
      "signature": "string",
      "userHandle": "string"
    },
    "type": "public-key"
  },
  "expectedChallenge": "string",
  "expectedOrigin": "string",
  "expectedRPID": "string"
}
```

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
    "accessToken": {
      "token": "string",
      "expiresIn": 3600
    },
    "message": "Login successful"
  }
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

#### Get User's WebAuthn Credentials
```http
GET /users/authn
```

**Response:**
```json
{
  "success": true,
  "data": {
    "authns": [
      {
        "id": "uuid",
        "device": "string",
        "createdAt": "ISO8601 date",
        "updatedAt": "ISO8601 date"
      }
    ]
  }
}
```

#### Remove WebAuthn Credential
```http
DELETE /users/authn/{id}
```

**Response:**
```json
{
  "success": true,
  "message": "Authenticator removed successfully"
}
```

### Workspace Management

#### Get User's Workspaces
```http
GET /workspaces
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "string",
        "slug": "string",
        "description": "string",
        "createdAt": "ISO8601 date",
        "updatedAt": "ISO8601 date"
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

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

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "string",
    "slug": "string",
    "description": "string"
  }
}
```

#### Delete Workspace
```http
DELETE /workspaces/:slug
```

**Response:**
```json
{
  "success": true,
  "message": "Workspace deleted successfully"
}
```

#### Get Workspace Team
```http
GET /workspaces/:slug/team
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "string",
      "firstName": "string",
      "lastName": "string",
      "username": "string",
      "profilePicture": "string",
      "isAdmin": boolean
    }
  ]
}
```

#### Add Team Member
```http
POST /workspaces/:slug/team
```

**Request Body:**
```json
{
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

#### Remove Team Member
```http
DELETE /workspaces/:slug/team/:userId
```

**Response:**
```json
{
  "success": true,
  "message": "Team member removed successfully"
}
```

#### Promote User to Admin
```http
POST /workspaces/:slug/admins/:userId
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
    "isAdmin": true
  }
}
```

#### Demote User from Admin
```http
DELETE /workspaces/:slug/admins/:userId
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
    "isAdmin": false
  }
}
```

#### Get Workspace Statistics
```http
GET /workspaces/:slug/statistics
```

**Response:**
```json
{
  "success": true,
  "statistics": {
    "workspaceId": "uuid",
    "workspaceSlug": "string",
    "totalTasks": 10,
    "statusBreakdown": {
      "todo": {
        "count": 3,
        "percentage": 30.0
      },
      "in_progress": {
        "count": 4,
        "percentage": 40.0
      },
      "review": {
        "count": 1,
        "percentage": 10.0
      },
      "done": {
        "count": 2,
        "percentage": 20.0
      }
    },
    "priorityBreakdown": {
      "low": {
        "count": 2,
        "percentage": 20.0
      },
      "medium": {
        "count": 5,
        "percentage": 50.0
      },
      "high": {
        "count": 2,
        "percentage": 20.0
      },
      "urgent": {
        "count": 1,
        "percentage": 10.0
      }
    },
    "overdueTasks": {
      "count": 1,
      "percentage": 10.0
    },
    "memberActivity": [
      {
        "userId": "uuid",
        "username": "string",
        "firstName": "string",
        "lastName": "string",
        "profilePicture": "string",
        "tasksAssigned": 5,
        "tasksCompleted": 2,
        "tasksInProgress": 1
      }
    ]
  }
}
```

### Task Management

#### Get Workspace Tasks
```http
GET /workspaces/:slug/tasks
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "string",
        "description": "string",
        "status": "todo",
        "priority": "medium",
        "dueDate": "ISO8601 date",
        "assignee": {
          "id": "uuid",
          "username": "string",
          "firstName": "string",
          "lastName": "string",
          "profilePicture": "string"
        },
        "creatorName": "string",
        "creatorUsername": "string",
        "createdAt": "ISO8601 date",
        "updatedAt": "ISO8601 date"
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

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

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "string",
    "description": "string",
    "status": "todo",
    "priority": "medium",
    "dueDate": "ISO8601 date",
    "assignee": {
      "id": "uuid",
      "username": "string",
      "firstName": "string",
      "lastName": "string",
      "profilePicture": "string"
    },
    "creatorName": "string",
    "creatorUsername": "string",
    "createdAt": "ISO8601 date",
    "updatedAt": "ISO8601 date"
  }
}
```

#### Get Task
```http
GET /workspaces/:slug/tasks/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "string",
    "description": "string",
    "status": "todo",
    "priority": "medium",
    "dueDate": "ISO8601 date",
    "assignee": {
      "id": "uuid",
      "username": "string",
      "firstName": "string",
      "lastName": "string",
      "profilePicture": "string"
    },
    "creatorName": "string",
    "creatorUsername": "string",
    "createdAt": "ISO8601 date",
    "updatedAt": "ISO8601 date"
  }
}
```

#### Update Task
```http
PUT /workspaces/:slug/tasks/:id
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

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "string",
    "description": "string",
    "status": "todo",
    "priority": "medium",
    "dueDate": "ISO8601 date",
    "assignee": {
      "id": "uuid",
      "username": "string",
      "firstName": "string",
      "lastName": "string",
      "profilePicture": "string"
    },
    "creatorName": "string",
    "creatorUsername": "string",
    "createdAt": "ISO8601 date",
    "updatedAt": "ISO8601 date"
  }
}
```

#### Delete Task
```http
DELETE /workspaces/:slug/tasks/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

#### Get Task Comments
```http
GET /workspaces/:slug/tasks/:id/comments
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "content": "string",
        "user": {
          "id": "uuid",
          "username": "string",
          "firstName": "string",
          "lastName": "string",
          "profilePicture": "string"
        },
        "createdAt": "ISO8601 date",
        "updatedAt": "ISO8601 date"
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

#### Add Task Comment
```http
POST /workspaces/:slug/tasks/:id/comments
```

**Request Body:**
```json
{
  "content": "string"
}
```

**Validation Rules:**
- Content: 1-1000 characters

**Response:**
```json
{
  "success": true,
  "comment": {
    "id": "uuid",
    "content": "string",
    "user": {
      "id": "uuid",
      "username": "string",
      "firstName": "string",
      "lastName": "string",
      "profilePicture": "string"
    },
    "createdAt": "ISO8601 date",
    "updatedAt": "ISO8601 date"
  }
}
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

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "filename": "string",
    "originalname": "string",
    "mimetype": "string",
    "size": 1024,
    "url": "string",
    "createdAt": "ISO8601 date",
    "updatedAt": "ISO8601 date"
  }
}
```

#### Upload Comment Attachment
```http
POST /workspaces/:id/comments/:commentId/attachments
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

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "filename": "string",
    "originalname": "string",
    "mimetype": "string",
    "size": 1024,
    "url": "string",
    "createdAt": "ISO8601 date",
    "updatedAt": "ISO8601 date"
  }
}
```

#### Get Task Attachments
```http
GET /workspaces/:id/tasks/:taskId/attachments
```

**Response:**
```json
{
  "success": true,
  "attachments": [
    {
      "id": "uuid",
      "filename": "string",
      "originalname": "string",
      "mimetype": "string",
      "size": 1024,
      "url": "string",
      "user": {
        "id": "uuid",
        "username": "string",
        "firstName": "string"
      },
      "createdAt": "ISO8601 date",
      "updatedAt": "ISO8601 date"
    }
  ]
}
```

#### Get Comment Attachments
```http
GET /workspaces/:id/comments/:commentId/attachments
```

**Response:**
```json
{
  "success": true,
  "attachments": [
    {
      "id": "uuid",
      "filename": "string",
      "originalname": "string",
      "mimetype": "string",
      "size": 1024,
      "url": "string",
      "user": {
        "id": "uuid",
        "username": "string",
        "firstName": "string"
      },
      "createdAt": "ISO8601 date",
      "updatedAt": "ISO8601 date"
    }
  ]
}
```

#### Delete Attachment
```http
DELETE /attachments/:attachmentId
```

**Response:**
```json
{
  "success": true,
  "message": "Attachment deleted successfully"
}
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

**Notification Types:**
- `mention`: User was mentioned in a comment
- `task_assigned`: User was assigned to a task
- `task_updated`: A task was updated
- `comment_reply`: User received a reply to their comment
- `comment_like`: User's comment was liked

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "string",
    "message": "string",
    "read": false,
    "createdAt": "ISO8601 date"
  }
}
```

#### Delete Notification
```http
DELETE /notifications/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Notification deleted successfully"
}
```

### Invites

#### Invite User to Workspace
```http
POST /invites
```

**Request Body:**
```json
{
  "workspaceId": "uuid",
  "email": "string",
  "role": "member" | "admin"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "string",
    "role": "string",
    "workspaceId": "uuid",
    "createdAt": "ISO8601 date"
  }
}
```

#### Accept Invite
```http
POST /invites/:id/accept
```

**Response:**
```json
{
  "success": true,
  "data": {
    "workspace": {
      "id": "uuid",
      "title": "string",
      "slug": "string",
      "description": "string"
    }
  }
}
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