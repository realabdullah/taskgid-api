# TaskGid API Documentation

## Overview

TaskGid is a task management application with workspaces, teams, tasks, and comments. This API documentation provides details on all endpoints, request/response formats, and authentication requirements.

## Base URL

```
https://api.taskgid.com
```

## Authentication

Most endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

### Authentication Endpoints

#### Register a new user

```
POST /auth/register
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "username": "johndoe",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "profilePicture": "url_to_picture"
  }
}
```

#### Login

```
POST /auth/login
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "profilePicture": "url_to_picture"
  }
}
```

#### Logout

```
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

```
POST /auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "token": "new_jwt_token_here"
}
```

## User Management

### Get User Profile

```
GET /users/profile
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "profilePicture": "url_to_picture"
  }
}
```

### Update User Profile

```
PUT /users/profile
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "username": "johndoe"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "profilePicture": "url_to_picture"
  }
}
```

### Update Profile Picture

```
PUT /users/profile/picture
```

**Request Body:**
```json
{
  "profilePicture": "base64_encoded_image"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "profilePicture": "url_to_picture"
  }
}
```

## Workspace Management

### Get All Workspaces
- **GET** `/api/workspaces`
- **Auth Required**: Yes
- **Response**: List of workspaces the user has access to
```json
{
  "workspaces": [
    {
      "id": "uuid",
      "name": "string",
      "slug": "string",
      "description": "string",
      "createdAt": "datetime",
      "updatedAt": "datetime",
      "userId": "uuid",
      "isAdmin": boolean,
      "isSuperAdmin": boolean
    }
  ],
  "pagination": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number,
    "hasNext": boolean,
    "hasPrev": boolean
  }
}
```

### Get Workspace
- **GET** `/api/workspaces/:slug`
- **Auth Required**: Yes
- **Response**: Workspace details
```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string",
  "description": "string",
  "createdAt": "datetime",
  "updatedAt": "datetime",
  "userId": "uuid",
  "isAdmin": boolean,
  "isSuperAdmin": boolean,
  "members": [
    {
      "id": "uuid",
      "name": "string",
      "email": "string",
      "isAdmin": boolean
    }
  ]
}
```

### Create Workspace
- **POST** `/api/workspaces`
- **Auth Required**: Yes
- **Request Body**:
```json
{
  "name": "string",
  "description": "string"
}
```
- **Response**: Created workspace details

### Update Workspace
- **PUT** `/api/workspaces/:slug`
- **Auth Required**: Yes (Super Admin only)
- **Request Body**:
```json
{
  "name": "string",
  "description": "string"
}
```
- **Response**: Updated workspace details

### Delete Workspace
- **DELETE** `/api/workspaces/:slug`
- **Auth Required**: Yes (Super Admin only)
- **Response**: Success message

## Admin Management

### Add Admin
- **POST** `/api/workspaces/:slug/admins`
- **Auth Required**: Yes (Super Admin only)
- **Request Body**:
```json
{
  "userId": "uuid"
}
```
- **Response**: Success message

### Remove Admin
- **DELETE** `/api/workspaces/:slug/admins`
- **Auth Required**: Yes (Super Admin only)
- **Request Body**:
```json
{
  "userId": "uuid"
}
```
- **Response**: Success message

### Remove User
- **DELETE** `/api/workspaces/:slug/users`
- **Auth Required**: Yes (Admin or Super Admin)
- **Request Body**:
```json
{
  "userId": "uuid"
}
```
- **Response**: Success message

## Team Management

### Get Workspace Team

```
GET /teams/:slug
```

**Response:**
```json
{
  "success": true,
  "team": [
    {
      "firstName": "Jane",
      "lastName": "Smith",
      "username": "janesmith",
      "email": "jane@example.com",
      "profilePicture": "url_to_picture"
    },
    {
      "firstName": "Bob",
      "lastName": "Johnson",
      "username": "bobjohnson",
      "email": "bob@example.com",
      "profilePicture": "url_to_picture"
    }
  ]
}
```

## Task Management

### Get All Tasks in a Workspace

```
GET /tasks/:slug?page=1&limit=10
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "tasks": [
    {
      "id": "uuid",
      "title": "Task Title",
      "description": "Task description",
      "status": "todo",
      "priority": "medium",
      "dueDate": "2023-12-31T00:00:00.000Z",
      "assignee": {
        "username": "janesmith",
        "firstName": "Jane",
        "lastName": "Smith",
        "profilePicture": "url_to_picture"
      },
      "user": {
        "username": "johndoe",
        "firstName": "John",
        "lastName": "Doe",
        "profilePicture": "url_to_picture"
      }
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Get Task by ID

```
GET /tasks/:slug/:id
```

**Response:**
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "title": "Task Title",
    "description": "Task description",
    "status": "todo",
    "priority": "medium",
    "dueDate": "2023-12-31T00:00:00.000Z",
    "assignee": {
      "username": "janesmith",
      "firstName": "Jane",
      "lastName": "Smith",
      "profilePicture": "url_to_picture"
    },
    "user": {
      "username": "johndoe",
      "firstName": "John",
      "lastName": "Doe",
      "profilePicture": "url_to_picture"
    }
  }
}
```

### Create Task

```
POST /tasks/:slug
```

**Request Body:**
```json
{
  "title": "New Task",
  "description": "Task description",
  "status": "todo",
  "priority": "medium",
  "dueDate": "2023-12-31T00:00:00.000Z",
  "assignee": "janesmith",
  "workspaceId": "workspace_uuid"
}
```

**Response:**
```json
{
  "id": "uuid",
  "title": "New Task",
  "description": "Task description",
  "status": "todo",
  "priority": "medium",
  "dueDate": "2023-12-31T00:00:00.000Z",
  "assignee": {
    "username": "janesmith",
    "firstName": "Jane",
    "lastName": "Smith",
    "profilePicture": "url_to_picture"
  },
  "user": {
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "profilePicture": "url_to_picture"
  }
}
```

### Update Task

```
PUT /tasks/:slug/:id
```

**Request Body:**
```json
{
  "title": "Updated Task",
  "description": "Updated description",
  "status": "in_progress",
  "priority": "high",
  "dueDate": "2023-12-31T00:00:00.000Z",
  "assignee": "bobjohnson",
  "workspaceId": "workspace_uuid"
}
```

**Response:**
```json
{
  "id": "uuid",
  "title": "Updated Task",
  "description": "Updated description",
  "status": "in_progress",
  "priority": "high",
  "dueDate": "2023-12-31T00:00:00.000Z",
  "assignee": {
    "username": "bobjohnson",
    "firstName": "Bob",
    "lastName": "Johnson",
    "profilePicture": "url_to_picture"
  },
  "user": {
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "profilePicture": "url_to_picture"
  }
}
```

### Delete Task

```
DELETE /tasks/:slug/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

## Comment Management

### Get Task Comments

```
GET /tasks/:slug/:id/comments?page=1&limit=10
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "comments": [
    {
      "id": "uuid",
      "content": "Comment text",
      "user": {
        "username": "johndoe",
        "firstName": "John",
        "lastName": "Doe",
        "profilePicture": "url_to_picture"
      },
      "createdAt": "2023-06-26T12:00:00.000Z",
      "updatedAt": "2023-06-26T12:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 15,
    "page": 1,
    "limit": 10,
    "totalPages": 2,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Add Task Comment

```
POST /tasks/:slug/:id/comments
```

**Request Body:**
```json
{
  "content": "New comment text",
  "taskId": "task_uuid"
}
```

**Response:**
```json
{
  "success": true,
  "comment": {
    "id": "uuid",
    "content": "New comment text",
    "user": {
      "username": "johndoe",
      "firstName": "John",
      "lastName": "Doe",
      "profilePicture": "url_to_picture"
    },
    "createdAt": "2023-06-26T12:00:00.000Z",
    "updatedAt": "2023-06-26T12:00:00.000Z"
  }
}
```

## Invite Management

### Invite User to Workspace

```
POST /invite
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "slug": "project-alpha"
}
```

**Response:**
```json
{
  "message": "User invited successfully"
}
```

### Accept Invite

```
POST /invite/accept
```

**Request Body:**
```json
{
  "token": "invite_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invite accepted successfully",
  "workspace": {
    "id": "uuid",
    "title": "Project Alpha",
    "slug": "project-alpha"
  }
}
```

## File Attachment Management

### Upload Task Attachment

```
POST /attachments/tasks/:taskId/attachments
```

**Request:**
- Content-Type: multipart/form-data
- Authorization: Bearer <token>

**Form Data:**
- `file`: File to upload (max 10MB)

**Response:**
```json
{
  "success": true,
  "attachment": {
    "id": "uuid",
    "filename": "1234567890-abcdef.jpg",
    "originalname": "image.jpg",
    "mimetype": "image/jpeg",
    "size": 102400,
    "path": "/path/to/file",
    "url": "/uploads/1234567890-abcdef.jpg",
    "taskId": "task_uuid",
    "userId": "user_uuid",
    "createdAt": "2023-06-26T12:00:00.000Z",
    "updatedAt": "2023-06-26T12:00:00.000Z"
  }
}
```

### Upload Comment Attachment

```
POST /attachments/comments/:commentId/attachments
```

**Request:**
- Content-Type: multipart/form-data
- Authorization: Bearer <token>

**Form Data:**
- `file`: File to upload (max 10MB)

**Response:**
```json
{
  "success": true,
  "attachment": {
    "id": "uuid",
    "filename": "1234567890-abcdef.pdf",
    "originalname": "document.pdf",
    "mimetype": "application/pdf",
    "size": 204800,
    "path": "/path/to/file",
    "url": "/uploads/1234567890-abcdef.pdf",
    "commentId": "comment_uuid",
    "userId": "user_uuid",
    "createdAt": "2023-06-26T12:00:00.000Z",
    "updatedAt": "2023-06-26T12:00:00.000Z"
  }
}
```

### Get Task Attachments

```
GET /attachments/tasks/:taskId/attachments
```

**Response:**
```json
{
  "success": true,
  "attachments": [
    {
      "id": "uuid",
      "filename": "1234567890-abcdef.jpg",
      "originalname": "image.jpg",
      "mimetype": "image/jpeg",
      "size": 102400,
      "path": "/path/to/file",
      "url": "/uploads/1234567890-abcdef.jpg",
      "taskId": "task_uuid",
      "userId": "user_uuid",
      "createdAt": "2023-06-26T12:00:00.000Z",
      "updatedAt": "2023-06-26T12:00:00.000Z"
    }
  ]
}
```

### Get Comment Attachments

```
GET /attachments/comments/:commentId/attachments
```

**Response:**
```json
{
  "success": true,
  "attachments": [
    {
      "id": "uuid",
      "filename": "1234567890-abcdef.pdf",
      "originalname": "document.pdf",
      "mimetype": "application/pdf",
      "size": 204800,
      "path": "/path/to/file",
      "url": "/uploads/1234567890-abcdef.pdf",
      "commentId": "comment_uuid",
      "userId": "user_uuid",
      "createdAt": "2023-06-26T12:00:00.000Z",
      "updatedAt": "2023-06-26T12:00:00.000Z"
    }
  ]
}
```

### Delete Attachment

```
DELETE /attachments/:attachmentId
```

**Response:**
```json
{
  "success": true,
  "message": "Attachment deleted successfully"
}
```

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request

```json
{
  "error": "Error message",
  "success": false
}
```

### 401 Unauthorized

```json
{
  "error": "Unauthorized access",
  "success": false
}
```

### 404 Not Found

```json
{
  "error": "Resource not found",
  "success": false
}
```

### 500 Server Error

```json
{
  "error": "Server error message",
  "success": false
}
```

## Data Models

### User

```json
{
  "id": "uuid",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "username": "johndoe",
  "profilePicture": "url_to_picture"
}
```

### Workspace

```json
{
  "id": "uuid",
  "title": "Project Alpha",
  "slug": "project-alpha",
  "description": "Description of the workspace",
  "user": {
    "firstName": "John",
    "lastName": "Doe"
  },
  "team": [
    {
      "firstName": "Jane",
      "lastName": "Smith",
      "username": "janesmith",
      "profilePicture": "url_to_picture",
      "email": "jane@example.com"
    }
  ]
}
```

### Task

```json
{
  "id": "uuid",
  "title": "Task Title",
  "description": "Task description",
  "status": "todo",
  "priority": "medium",
  "dueDate": "2023-12-31T00:00:00.000Z",
  "assignee": {
    "username": "janesmith",
    "firstName": "Jane",
    "lastName": "Smith",
    "profilePicture": "url_to_picture"
  },
  "user": {
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "profilePicture": "url_to_picture"
  }
}
```

### Comment

```json
{
  "id": "uuid",
  "content": "Comment text",
  "user": {
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "profilePicture": "url_to_picture"
  },
  "createdAt": "2023-06-26T12:00:00.000Z",
  "updatedAt": "2023-06-26T12:00:00.000Z"
}
```

### Attachment

```json
{
  "id": "uuid",
  "filename": "1234567890-abcdef.jpg",
  "originalname": "image.jpg",
  "mimetype": "image/jpeg",
  "size": 102400,
  "path": "/path/to/file",
  "url": "/uploads/1234567890-abcdef.jpg",
  "taskId": "task_uuid",
  "commentId": "comment_uuid",
  "userId": "user_uuid",
  "createdAt": "2023-06-26T12:00:00.000Z",
  "updatedAt": "2023-06-26T12:00:00.000Z"
}
```

## Implementation Notes

1. **Authentication**: Always include the JWT token in the Authorization header for protected endpoints.
2. **Error Handling**: Implement proper error handling for all API responses.
3. **Pagination**: For endpoints that return lists (workspaces, tasks, comments), use the `page` and `limit` query parameters to implement pagination. The response includes pagination metadata to help with navigation.
4. **Real-time Updates**: Consider implementing WebSocket connections for real-time updates on tasks and comments.
5. **File Uploads**: For file uploads, use multipart/form-data. The server automatically compresses images to reduce storage costs. Maximum file size is 10MB, and only specific file types are allowed (images, PDFs, and common document formats).

This documentation provides a comprehensive overview of the TaskGid API. For any questions or clarifications, please contact the backend team. 